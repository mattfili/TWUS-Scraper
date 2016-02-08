/**

JSZip - A Javascript class for generating and reading zip files
<http://stuartk.com/jszip>

(c) 2009-2012 Stuart Knightley <stuart [at] stuartk.com>
Dual licenced under the MIT license or GPLv3. See LICENSE.markdown.

Usage:
   zip = new JSZip();
   zip.file("hello.txt", "Hello, World!").file("tempfile", "nothing");
   zip.folder("images").file("smile.gif", base64Data, {base64: true});
   zip.file("Xmas.txt", "Ho ho ho !", {date : new Date("December 25, 2007 00:00:01")});
   zip.remove("tempfile");

   base64zip = zip.generate();

**/
// We use strict, but it should not be placed outside of a function because
// the environment is shared inside the browser.
// "use strict";

/**
 * Representation a of zip file in js
 * @constructor
 * @param {String=|ArrayBuffer=|Uint8Array=|Buffer=} data the data to load, if any (optional).
 * @param {Object=} options the options for creating this objects (optional).
 */
"use strict";

var JSZip = function JSZip(data, options) {
   // object containing the files :
   // {
   //   "folder/" : {...},
   //   "folder/data.txt" : {...}
   // }
   this.files = {};

   // Where we are in the hierarchy
   this.root = "";

   if (data) {
      this.load(data, options);
   }
};

JSZip.signature = {
   LOCAL_FILE_HEADER: "\x50\x4b\x03\x04",
   CENTRAL_FILE_HEADER: "\x50\x4b\x01\x02",
   CENTRAL_DIRECTORY_END: "\x50\x4b\x05\x06",
   ZIP64_CENTRAL_DIRECTORY_LOCATOR: "\x50\x4b\x06\x07",
   ZIP64_CENTRAL_DIRECTORY_END: "\x50\x4b\x06\x06",
   DATA_DESCRIPTOR: "\x50\x4b\x07\x08"
};

// Default properties for a new file
JSZip.defaults = {
   base64: false,
   binary: false,
   dir: false,
   date: null,
   compression: null
};

/*
 * List features that require a modern browser, and if the current browser support them.
 */
JSZip.support = {
   // contains true if JSZip can read/generate ArrayBuffer, false otherwise.
   arraybuffer: (function () {
      return typeof ArrayBuffer !== "undefined" && typeof Uint8Array !== "undefined";
   })(),
   // contains true if JSZip can read/generate nodejs Buffer, false otherwise.
   nodebuffer: (function () {
      return typeof Buffer !== "undefined";
   })(),
   // contains true if JSZip can read/generate Uint8Array, false otherwise.
   uint8array: (function () {
      return typeof Uint8Array !== "undefined";
   })(),
   // contains true if JSZip can read/generate Blob, false otherwise.
   blob: (function () {
      // the spec started with BlobBuilder then replaced it with a construtor for Blob.
      // Result : we have browsers that :
      // * know the BlobBuilder (but with prefix)
      // * know the Blob constructor
      // * know about Blob but not about how to build them
      // About the "=== 0" test : if given the wrong type, it may be converted to a string.
      // Instead of an empty content, we will get "[object Uint8Array]" for example.
      if (typeof ArrayBuffer === "undefined") {
         return false;
      }
      var buffer = new ArrayBuffer(0);
      try {
         return new Blob([buffer], { type: "application/zip" }).size === 0;
      } catch (e) {}

      try {
         var BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder || window.MSBlobBuilder;
         var builder = new BlobBuilder();
         builder.append(buffer);
         return builder.getBlob('application/zip').size === 0;
      } catch (e) {}

      return false;
   })()
};

JSZip.prototype = (function () {
   var textEncoder, textDecoder;
   if (JSZip.support.uint8array && typeof TextEncoder === "function" && typeof TextDecoder === "function") {
      textEncoder = new TextEncoder("utf-8");
      textDecoder = new TextDecoder("utf-8");
   }

   /**
    * Returns the raw data of a ZipObject, decompress the content if necessary.
    * @param {ZipObject} file the file to use.
    * @return {String|ArrayBuffer|Uint8Array|Buffer} the data.
    */
   var getRawData = function getRawData(file) {
      if (file._data instanceof JSZip.CompressedObject) {
         file._data = file._data.getContent();
         file.options.binary = true;
         file.options.base64 = false;

         if (JSZip.utils.getTypeOf(file._data) === "uint8array") {
            var copy = file._data;
            // when reading an arraybuffer, the CompressedObject mechanism will keep it and subarray() a Uint8Array.
            // if we request a file in the same format, we might get the same Uint8Array or its ArrayBuffer (the original zip file).
            file._data = new Uint8Array(copy.length);
            // with an empty Uint8Array, Opera fails with a "Offset larger than array size"
            if (copy.length !== 0) {
               file._data.set(copy, 0);
            }
         }
      }
      return file._data;
   };

   /**
    * Returns the data of a ZipObject in a binary form. If the content is an unicode string, encode it.
    * @param {ZipObject} file the file to use.
    * @return {String|ArrayBuffer|Uint8Array|Buffer} the data.
    */
   var getBinaryData = function getBinaryData(file) {
      var result = getRawData(file),
          type = JSZip.utils.getTypeOf(result);
      if (type === "string") {
         if (!file.options.binary) {
            // unicode text !
            // unicode string => binary string is a painful process, check if we can avoid it.
            if (textEncoder) {
               return textEncoder.encode(result);
            }
            if (JSZip.support.nodebuffer) {
               return new Buffer(result, "utf-8");
            }
         }
         return file.asBinary();
      }
      return result;
   };

   /**
    * Transform this._data into a string.
    * @param {function} filter a function String -> String, applied if not null on the result.
    * @return {String} the string representing this._data.
    */
   var dataToString = function dataToString(asUTF8) {
      var result = getRawData(this);
      if (result === null || typeof result === "undefined") {
         return "";
      }
      // if the data is a base64 string, we decode it before checking the encoding !
      if (this.options.base64) {
         result = JSZip.base64.decode(result);
      }
      if (asUTF8 && this.options.binary) {
         // JSZip.prototype.utf8decode supports arrays as input
         // skip to array => string step, utf8decode will do it.
         result = JSZip.prototype.utf8decode(result);
      } else {
         // no utf8 transformation, do the array => string step.
         result = JSZip.utils.transformTo("string", result);
      }

      if (!asUTF8 && !this.options.binary) {
         result = JSZip.prototype.utf8encode(result);
      }
      return result;
   };
   /**
    * A simple object representing a file in the zip file.
    * @constructor
    * @param {string} name the name of the file
    * @param {String|ArrayBuffer|Uint8Array|Buffer} data the data
    * @param {Object} options the options of the file
    */
   var ZipObject = function ZipObject(name, data, options) {
      this.name = name;
      this._data = data;
      this.options = options;
   };

   ZipObject.prototype = {
      /**
       * Return the content as UTF8 string.
       * @return {string} the UTF8 string.
       */
      asText: function asText() {
         return dataToString.call(this, true);
      },
      /**
       * Returns the binary content.
       * @return {string} the content as binary.
       */
      asBinary: function asBinary() {
         return dataToString.call(this, false);
      },
      /**
       * Returns the content as a nodejs Buffer.
       * @return {Buffer} the content as a Buffer.
       */
      asNodeBuffer: function asNodeBuffer() {
         var result = getBinaryData(this);
         return JSZip.utils.transformTo("nodebuffer", result);
      },
      /**
       * Returns the content as an Uint8Array.
       * @return {Uint8Array} the content as an Uint8Array.
       */
      asUint8Array: function asUint8Array() {
         var result = getBinaryData(this);
         return JSZip.utils.transformTo("uint8array", result);
      },
      /**
       * Returns the content as an ArrayBuffer.
       * @return {ArrayBuffer} the content as an ArrayBufer.
       */
      asArrayBuffer: function asArrayBuffer() {
         return this.asUint8Array().buffer;
      }
   };

   /**
    * Transform an integer into a string in hexadecimal.
    * @private
    * @param {number} dec the number to convert.
    * @param {number} bytes the number of bytes to generate.
    * @returns {string} the result.
    */
   var decToHex = function decToHex(dec, bytes) {
      var hex = "",
          i;
      for (i = 0; i < bytes; i++) {
         hex += String.fromCharCode(dec & 0xff);
         dec = dec >>> 8;
      }
      return hex;
   };

   /**
    * Merge the objects passed as parameters into a new one.
    * @private
    * @param {...Object} var_args All objects to merge.
    * @return {Object} a new object with the data of the others.
    */
   var extend = function extend() {
      var result = {},
          i,
          attr;
      for (i = 0; i < arguments.length; i++) {
         // arguments is not enumerable in some browsers
         for (attr in arguments[i]) {
            if (arguments[i].hasOwnProperty(attr) && typeof result[attr] === "undefined") {
               result[attr] = arguments[i][attr];
            }
         }
      }
      return result;
   };

   /**
    * Transforms the (incomplete) options from the user into the complete
    * set of options to create a file.
    * @private
    * @param {Object} o the options from the user.
    * @return {Object} the complete set of options.
    */
   var prepareFileAttrs = function prepareFileAttrs(o) {
      o = o || {};
      /*jshint -W041 */
      if (o.base64 === true && o.binary == null) {
         o.binary = true;
      }
      /*jshint +W041 */
      o = extend(o, JSZip.defaults);
      o.date = o.date || new Date();
      if (o.compression !== null) o.compression = o.compression.toUpperCase();

      return o;
   };

   /**
    * Add a file in the current folder.
    * @private
    * @param {string} name the name of the file
    * @param {String|ArrayBuffer|Uint8Array|Buffer} data the data of the file
    * @param {Object} o the options of the file
    * @return {Object} the new file.
    */
   var fileAdd = function fileAdd(name, data, o) {
      // be sure sub folders exist
      var parent = parentFolder(name),
          dataType = JSZip.utils.getTypeOf(data);
      if (parent) {
         folderAdd.call(this, parent);
      }

      o = prepareFileAttrs(o);

      if (o.dir || data === null || typeof data === "undefined") {
         o.base64 = false;
         o.binary = false;
         data = null;
      } else if (dataType === "string") {
         if (o.binary && !o.base64) {
            // optimizedBinaryString == true means that the file has already been filtered with a 0xFF mask
            if (o.optimizedBinaryString !== true) {
               // this is a string, not in a base64 format.
               // Be sure that this is a correct "binary string"
               data = JSZip.utils.string2binary(data);
            }
         }
      } else {
         // arraybuffer, uint8array, ...
         o.base64 = false;
         o.binary = true;

         if (!dataType && !(data instanceof JSZip.CompressedObject)) {
            throw new Error("The data of '" + name + "' is in an unsupported format !");
         }

         // special case : it's way easier to work with Uint8Array than with ArrayBuffer
         if (dataType === "arraybuffer") {
            data = JSZip.utils.transformTo("uint8array", data);
         }
      }

      var object = new ZipObject(name, data, o);
      this.files[name] = object;
      return object;
   };

   /**
    * Find the parent folder of the path.
    * @private
    * @param {string} path the path to use
    * @return {string} the parent folder, or ""
    */
   var parentFolder = function parentFolder(path) {
      if (path.slice(-1) == '/') {
         path = path.substring(0, path.length - 1);
      }
      var lastSlash = path.lastIndexOf('/');
      return lastSlash > 0 ? path.substring(0, lastSlash) : "";
   };

   /**
    * Add a (sub) folder in the current folder.
    * @private
    * @param {string} name the folder's name
    * @return {Object} the new folder.
    */
   var folderAdd = function folderAdd(name) {
      // Check the name ends with a /
      if (name.slice(-1) != "/") {
         name += "/"; // IE doesn't like substr(-1)
      }

      // Does this folder already exist?
      if (!this.files[name]) {
         fileAdd.call(this, name, null, { dir: true });
      }
      return this.files[name];
   };

   /**
    * Generate a JSZip.CompressedObject for a given zipOject.
    * @param {ZipObject} file the object to read.
    * @param {JSZip.compression} compression the compression to use.
    * @return {JSZip.CompressedObject} the compressed result.
    */
   var generateCompressedObjectFrom = function generateCompressedObjectFrom(file, compression) {
      var result = new JSZip.CompressedObject(),
          content;

      // the data has not been decompressed, we might reuse things !
      if (file._data instanceof JSZip.CompressedObject) {
         result.uncompressedSize = file._data.uncompressedSize;
         result.crc32 = file._data.crc32;

         if (result.uncompressedSize === 0 || file.options.dir) {
            compression = JSZip.compressions['STORE'];
            result.compressedContent = "";
            result.crc32 = 0;
         } else if (file._data.compressionMethod === compression.magic) {
            result.compressedContent = file._data.getCompressedContent();
         } else {
            content = file._data.getContent();
            // need to decompress / recompress
            result.compressedContent = compression.compress(JSZip.utils.transformTo(compression.compressInputType, content));
         }
      } else {
         // have uncompressed data
         content = getBinaryData(file);
         if (!content || content.length === 0 || file.options.dir) {
            compression = JSZip.compressions['STORE'];
            content = "";
         }
         result.uncompressedSize = content.length;
         result.crc32 = this.crc32(content);
         result.compressedContent = compression.compress(JSZip.utils.transformTo(compression.compressInputType, content));
      }

      result.compressedSize = result.compressedContent.length;
      result.compressionMethod = compression.magic;

      return result;
   };

   /**
    * Generate the various parts used in the construction of the final zip file.
    * @param {string} name the file name.
    * @param {ZipObject} file the file content.
    * @param {JSZip.CompressedObject} compressedObject the compressed object.
    * @param {number} offset the current offset from the start of the zip file.
    * @return {object} the zip parts.
    */
   var generateZipParts = function generateZipParts(name, file, compressedObject, offset) {
      var data = compressedObject.compressedContent,
          utfEncodedFileName = this.utf8encode(file.name),
          useUTF8 = utfEncodedFileName !== file.name,
          o = file.options,
          dosTime,
          dosDate;

      // date
      // @see http://www.delorie.com/djgpp/doc/rbinter/it/52/13.html
      // @see http://www.delorie.com/djgpp/doc/rbinter/it/65/16.html
      // @see http://www.delorie.com/djgpp/doc/rbinter/it/66/16.html

      dosTime = o.date.getHours();
      dosTime = dosTime << 6;
      dosTime = dosTime | o.date.getMinutes();
      dosTime = dosTime << 5;
      dosTime = dosTime | o.date.getSeconds() / 2;

      dosDate = o.date.getFullYear() - 1980;
      dosDate = dosDate << 4;
      dosDate = dosDate | o.date.getMonth() + 1;
      dosDate = dosDate << 5;
      dosDate = dosDate | o.date.getDate();

      var header = "";

      // version needed to extract
      header += "\x0A\x00";
      // general purpose bit flag
      // set bit 11 if utf8
      header += useUTF8 ? "\x00\x08" : "\x00\x00";
      // compression method
      header += compressedObject.compressionMethod;
      // last mod file time
      header += decToHex(dosTime, 2);
      // last mod file date
      header += decToHex(dosDate, 2);
      // crc-32
      header += decToHex(compressedObject.crc32, 4);
      // compressed size
      header += decToHex(compressedObject.compressedSize, 4);
      // uncompressed size
      header += decToHex(compressedObject.uncompressedSize, 4);
      // file name length
      header += decToHex(utfEncodedFileName.length, 2);
      // extra field length
      header += "\x00\x00";

      var fileRecord = JSZip.signature.LOCAL_FILE_HEADER + header + utfEncodedFileName;

      var dirRecord = JSZip.signature.CENTRAL_FILE_HEADER +
      // version made by (00: DOS)
      "\x14\x00" +
      // file header (common to file and central directory)
      header +
      // file comment length
      "\x00\x00" +
      // disk number start
      "\x00\x00" +
      // internal file attributes TODO
      "\x00\x00" + (
      // external file attributes
      file.options.dir === true ? "\x10\x00\x00\x00" : "\x00\x00\x00\x00") +
      // relative offset of local header
      decToHex(offset, 4) +
      // file name
      utfEncodedFileName;

      return {
         fileRecord: fileRecord,
         dirRecord: dirRecord,
         compressedObject: compressedObject
      };
   };

   /**
    * An object to write any content to a string.
    * @constructor
    */
   var StringWriter = function StringWriter() {
      this.data = [];
   };
   StringWriter.prototype = {
      /**
       * Append any content to the current string.
       * @param {Object} input the content to add.
       */
      append: function append(input) {
         input = JSZip.utils.transformTo("string", input);
         this.data.push(input);
      },
      /**
       * Finalize the construction an return the result.
       * @return {string} the generated string.
       */
      finalize: function finalize() {
         return this.data.join("");
      }
   };
   /**
    * An object to write any content to an Uint8Array.
    * @constructor
    * @param {number} length The length of the array.
    */
   var Uint8ArrayWriter = function Uint8ArrayWriter(length) {
      this.data = new Uint8Array(length);
      this.index = 0;
   };
   Uint8ArrayWriter.prototype = {
      /**
       * Append any content to the current array.
       * @param {Object} input the content to add.
       */
      append: function append(input) {
         if (input.length !== 0) {
            // with an empty Uint8Array, Opera fails with a "Offset larger than array size"
            input = JSZip.utils.transformTo("uint8array", input);
            this.data.set(input, this.index);
            this.index += input.length;
         }
      },
      /**
       * Finalize the construction an return the result.
       * @return {Uint8Array} the generated array.
       */
      finalize: function finalize() {
         return this.data;
      }
   };

   // return the actual prototype of JSZip
   return {
      /**
       * Read an existing zip and merge the data in the current JSZip object.
       * The implementation is in jszip-load.js, don't forget to include it.
       * @param {String|ArrayBuffer|Uint8Array|Buffer} stream  The stream to load
       * @param {Object} options Options for loading the stream.
       *  options.base64 : is the stream in base64 ? default : false
       * @return {JSZip} the current JSZip object
       */
      load: function load(stream, options) {
         throw new Error("Load method is not defined. Is the file jszip-load.js included ?");
      },

      /**
       * Filter nested files/folders with the specified function.
       * @param {Function} search the predicate to use :
       * function (relativePath, file) {...}
       * It takes 2 arguments : the relative path and the file.
       * @return {Array} An array of matching elements.
       */
      filter: function filter(search) {
         var result = [],
             filename,
             relativePath,
             file,
             fileClone;
         for (filename in this.files) {
            if (!this.files.hasOwnProperty(filename)) {
               continue;
            }
            file = this.files[filename];
            // return a new object, don't let the user mess with our internal objects :)
            fileClone = new ZipObject(file.name, file._data, extend(file.options));
            relativePath = filename.slice(this.root.length, filename.length);
            if (filename.slice(0, this.root.length) === this.root && // the file is in the current root
            search(relativePath, fileClone)) {
               // and the file matches the function
               result.push(fileClone);
            }
         }
         return result;
      },

      /**
       * Add a file to the zip file, or search a file.
       * @param   {string|RegExp} name The name of the file to add (if data is defined),
       * the name of the file to find (if no data) or a regex to match files.
       * @param   {String|ArrayBuffer|Uint8Array|Buffer} data  The file data, either raw or base64 encoded
       * @param   {Object} o     File options
       * @return  {JSZip|Object|Array} this JSZip object (when adding a file),
       * a file (when searching by string) or an array of files (when searching by regex).
       */
      file: function file(name, data, o) {
         if (arguments.length === 1) {
            if (JSZip.utils.isRegExp(name)) {
               var regexp = name;
               return this.filter(function (relativePath, file) {
                  return !file.options.dir && regexp.test(relativePath);
               });
            } else {
               // text
               return this.filter(function (relativePath, file) {
                  return !file.options.dir && relativePath === name;
               })[0] || null;
            }
         } else {
            // more than one argument : we have data !
            name = this.root + name;
            fileAdd.call(this, name, data, o);
         }
         return this;
      },

      /**
       * Add a directory to the zip file, or search.
       * @param   {String|RegExp} arg The name of the directory to add, or a regex to search folders.
       * @return  {JSZip} an object with the new directory as the root, or an array containing matching folders.
       */
      folder: function folder(arg) {
         if (!arg) {
            return this;
         }

         if (JSZip.utils.isRegExp(arg)) {
            return this.filter(function (relativePath, file) {
               return file.options.dir && arg.test(relativePath);
            });
         }

         // else, name is a new folder
         var name = this.root + arg;
         var newFolder = folderAdd.call(this, name);

         // Allow chaining by returning a new object with this folder as the root
         var ret = this.clone();
         ret.root = newFolder.name;
         return ret;
      },

      /**
       * Delete a file, or a directory and all sub-files, from the zip
       * @param {string} name the name of the file to delete
       * @return {JSZip} this JSZip object
       */
      remove: function remove(name) {
         name = this.root + name;
         var file = this.files[name];
         if (!file) {
            // Look for any folders
            if (name.slice(-1) != "/") {
               name += "/";
            }
            file = this.files[name];
         }

         if (file) {
            if (!file.options.dir) {
               // file
               delete this.files[name];
            } else {
               // folder
               var kids = this.filter(function (relativePath, file) {
                  return file.name.slice(0, name.length) === name;
               });
               for (var i = 0; i < kids.length; i++) {
                  delete this.files[kids[i].name];
               }
            }
         }

         return this;
      },

      /**
       * Generate the complete zip file
       * @param {Object} options the options to generate the zip file :
       * - base64, (deprecated, use type instead) true to generate base64.
       * - compression, "STORE" by default.
       * - type, "base64" by default. Values are : string, base64, uint8array, arraybuffer, blob.
       * @return {String|Uint8Array|ArrayBuffer|Buffer|Blob} the zip file
       */
      generate: function generate(options) {
         options = extend(options || {}, {
            base64: true,
            compression: "STORE",
            type: "base64"
         });

         JSZip.utils.checkSupport(options.type);

         var zipData = [],
             localDirLength = 0,
             centralDirLength = 0,
             writer,
             i;

         // first, generate all the zip parts.
         for (var name in this.files) {
            if (!this.files.hasOwnProperty(name)) {
               continue;
            }
            var file = this.files[name];

            var compressionName = file.options.compression || options.compression.toUpperCase();
            var compression = JSZip.compressions[compressionName];
            if (!compression) {
               throw new Error(compressionName + " is not a valid compression method !");
            }

            var compressedObject = generateCompressedObjectFrom.call(this, file, compression);

            var zipPart = generateZipParts.call(this, name, file, compressedObject, localDirLength);
            localDirLength += zipPart.fileRecord.length + compressedObject.compressedSize;
            centralDirLength += zipPart.dirRecord.length;
            zipData.push(zipPart);
         }

         var dirEnd = "";

         // end of central dir signature
         dirEnd = JSZip.signature.CENTRAL_DIRECTORY_END +
         // number of this disk
         "\x00\x00" +
         // number of the disk with the start of the central directory
         "\x00\x00" +
         // total number of entries in the central directory on this disk
         decToHex(zipData.length, 2) +
         // total number of entries in the central directory
         decToHex(zipData.length, 2) +
         // size of the central directory   4 bytes
         decToHex(centralDirLength, 4) +
         // offset of start of central directory with respect to the starting disk number
         decToHex(localDirLength, 4) +
         // .ZIP file comment length
         "\x00\x00";

         // we have all the parts (and the total length)
         // time to create a writer !
         switch (options.type.toLowerCase()) {
            case "uint8array":
            case "arraybuffer":
            case "blob":
            case "nodebuffer":
               writer = new Uint8ArrayWriter(localDirLength + centralDirLength + dirEnd.length);
               break;
            // case "base64" :
            // case "string" :
            default:
               writer = new StringWriter(localDirLength + centralDirLength + dirEnd.length);
               break;
         }

         for (i = 0; i < zipData.length; i++) {
            writer.append(zipData[i].fileRecord);
            writer.append(zipData[i].compressedObject.compressedContent);
         }
         for (i = 0; i < zipData.length; i++) {
            writer.append(zipData[i].dirRecord);
         }

         writer.append(dirEnd);

         var zip = writer.finalize();

         switch (options.type.toLowerCase()) {
            // case "zip is an Uint8Array"
            case "uint8array":
            case "arraybuffer":
            case "nodebuffer":
               return JSZip.utils.transformTo(options.type.toLowerCase(), zip);
            case "blob":
               return JSZip.utils.arrayBuffer2Blob(JSZip.utils.transformTo("arraybuffer", zip));

            // case "zip is a string"
            case "base64":
               return options.base64 ? JSZip.base64.encode(zip) : zip;
            default:
               // case "string" :
               return zip;
         }
      },

      /**
       *
       *  Javascript crc32
       *  http://www.webtoolkit.info/
       *
       */
      crc32: function crc32(input, crc) {
         if (typeof input === "undefined" || !input.length) {
            return 0;
         }

         var isArray = JSZip.utils.getTypeOf(input) !== "string";

         var table = [0x00000000, 0x77073096, 0xEE0E612C, 0x990951BA, 0x076DC419, 0x706AF48F, 0xE963A535, 0x9E6495A3, 0x0EDB8832, 0x79DCB8A4, 0xE0D5E91E, 0x97D2D988, 0x09B64C2B, 0x7EB17CBD, 0xE7B82D07, 0x90BF1D91, 0x1DB71064, 0x6AB020F2, 0xF3B97148, 0x84BE41DE, 0x1ADAD47D, 0x6DDDE4EB, 0xF4D4B551, 0x83D385C7, 0x136C9856, 0x646BA8C0, 0xFD62F97A, 0x8A65C9EC, 0x14015C4F, 0x63066CD9, 0xFA0F3D63, 0x8D080DF5, 0x3B6E20C8, 0x4C69105E, 0xD56041E4, 0xA2677172, 0x3C03E4D1, 0x4B04D447, 0xD20D85FD, 0xA50AB56B, 0x35B5A8FA, 0x42B2986C, 0xDBBBC9D6, 0xACBCF940, 0x32D86CE3, 0x45DF5C75, 0xDCD60DCF, 0xABD13D59, 0x26D930AC, 0x51DE003A, 0xC8D75180, 0xBFD06116, 0x21B4F4B5, 0x56B3C423, 0xCFBA9599, 0xB8BDA50F, 0x2802B89E, 0x5F058808, 0xC60CD9B2, 0xB10BE924, 0x2F6F7C87, 0x58684C11, 0xC1611DAB, 0xB6662D3D, 0x76DC4190, 0x01DB7106, 0x98D220BC, 0xEFD5102A, 0x71B18589, 0x06B6B51F, 0x9FBFE4A5, 0xE8B8D433, 0x7807C9A2, 0x0F00F934, 0x9609A88E, 0xE10E9818, 0x7F6A0DBB, 0x086D3D2D, 0x91646C97, 0xE6635C01, 0x6B6B51F4, 0x1C6C6162, 0x856530D8, 0xF262004E, 0x6C0695ED, 0x1B01A57B, 0x8208F4C1, 0xF50FC457, 0x65B0D9C6, 0x12B7E950, 0x8BBEB8EA, 0xFCB9887C, 0x62DD1DDF, 0x15DA2D49, 0x8CD37CF3, 0xFBD44C65, 0x4DB26158, 0x3AB551CE, 0xA3BC0074, 0xD4BB30E2, 0x4ADFA541, 0x3DD895D7, 0xA4D1C46D, 0xD3D6F4FB, 0x4369E96A, 0x346ED9FC, 0xAD678846, 0xDA60B8D0, 0x44042D73, 0x33031DE5, 0xAA0A4C5F, 0xDD0D7CC9, 0x5005713C, 0x270241AA, 0xBE0B1010, 0xC90C2086, 0x5768B525, 0x206F85B3, 0xB966D409, 0xCE61E49F, 0x5EDEF90E, 0x29D9C998, 0xB0D09822, 0xC7D7A8B4, 0x59B33D17, 0x2EB40D81, 0xB7BD5C3B, 0xC0BA6CAD, 0xEDB88320, 0x9ABFB3B6, 0x03B6E20C, 0x74B1D29A, 0xEAD54739, 0x9DD277AF, 0x04DB2615, 0x73DC1683, 0xE3630B12, 0x94643B84, 0x0D6D6A3E, 0x7A6A5AA8, 0xE40ECF0B, 0x9309FF9D, 0x0A00AE27, 0x7D079EB1, 0xF00F9344, 0x8708A3D2, 0x1E01F268, 0x6906C2FE, 0xF762575D, 0x806567CB, 0x196C3671, 0x6E6B06E7, 0xFED41B76, 0x89D32BE0, 0x10DA7A5A, 0x67DD4ACC, 0xF9B9DF6F, 0x8EBEEFF9, 0x17B7BE43, 0x60B08ED5, 0xD6D6A3E8, 0xA1D1937E, 0x38D8C2C4, 0x4FDFF252, 0xD1BB67F1, 0xA6BC5767, 0x3FB506DD, 0x48B2364B, 0xD80D2BDA, 0xAF0A1B4C, 0x36034AF6, 0x41047A60, 0xDF60EFC3, 0xA867DF55, 0x316E8EEF, 0x4669BE79, 0xCB61B38C, 0xBC66831A, 0x256FD2A0, 0x5268E236, 0xCC0C7795, 0xBB0B4703, 0x220216B9, 0x5505262F, 0xC5BA3BBE, 0xB2BD0B28, 0x2BB45A92, 0x5CB36A04, 0xC2D7FFA7, 0xB5D0CF31, 0x2CD99E8B, 0x5BDEAE1D, 0x9B64C2B0, 0xEC63F226, 0x756AA39C, 0x026D930A, 0x9C0906A9, 0xEB0E363F, 0x72076785, 0x05005713, 0x95BF4A82, 0xE2B87A14, 0x7BB12BAE, 0x0CB61B38, 0x92D28E9B, 0xE5D5BE0D, 0x7CDCEFB7, 0x0BDBDF21, 0x86D3D2D4, 0xF1D4E242, 0x68DDB3F8, 0x1FDA836E, 0x81BE16CD, 0xF6B9265B, 0x6FB077E1, 0x18B74777, 0x88085AE6, 0xFF0F6A70, 0x66063BCA, 0x11010B5C, 0x8F659EFF, 0xF862AE69, 0x616BFFD3, 0x166CCF45, 0xA00AE278, 0xD70DD2EE, 0x4E048354, 0x3903B3C2, 0xA7672661, 0xD06016F7, 0x4969474D, 0x3E6E77DB, 0xAED16A4A, 0xD9D65ADC, 0x40DF0B66, 0x37D83BF0, 0xA9BCAE53, 0xDEBB9EC5, 0x47B2CF7F, 0x30B5FFE9, 0xBDBDF21C, 0xCABAC28A, 0x53B39330, 0x24B4A3A6, 0xBAD03605, 0xCDD70693, 0x54DE5729, 0x23D967BF, 0xB3667A2E, 0xC4614AB8, 0x5D681B02, 0x2A6F2B94, 0xB40BBE37, 0xC30C8EA1, 0x5A05DF1B, 0x2D02EF8D];

         if (typeof crc == "undefined") {
            crc = 0;
         }
         var x = 0;
         var y = 0;
         var byte = 0;

         crc = crc ^ -1;
         for (var i = 0, iTop = input.length; i < iTop; i++) {
            byte = isArray ? input[i] : input.charCodeAt(i);
            y = (crc ^ byte) & 0xFF;
            x = table[y];
            crc = crc >>> 8 ^ x;
         }

         return crc ^ -1;
      },

      // Inspired by http://my.opera.com/GreyWyvern/blog/show.dml/1725165
      clone: function clone() {
         var newObj = new JSZip();
         for (var i in this) {
            if (typeof this[i] !== "function") {
               newObj[i] = this[i];
            }
         }
         return newObj;
      },

      /**
       * http://www.webtoolkit.info/javascript-utf8.html
       */
      utf8encode: function utf8encode(string) {
         // TextEncoder + Uint8Array to binary string is faster than checking every bytes on long strings.
         // http://jsperf.com/utf8encode-vs-textencoder
         // On short strings (file names for example), the TextEncoder API is (currently) slower.
         if (textEncoder) {
            var u8 = textEncoder.encode(string);
            return JSZip.utils.transformTo("string", u8);
         }
         if (JSZip.support.nodebuffer) {
            return JSZip.utils.transformTo("string", new Buffer(string, "utf-8"));
         }

         // array.join may be slower than string concatenation but generates less objects (less time spent garbage collecting).
         // See also http://jsperf.com/array-direct-assignment-vs-push/31
         var result = [],
             resIndex = 0;

         for (var n = 0; n < string.length; n++) {

            var c = string.charCodeAt(n);

            if (c < 128) {
               result[resIndex++] = String.fromCharCode(c);
            } else if (c > 127 && c < 2048) {
               result[resIndex++] = String.fromCharCode(c >> 6 | 192);
               result[resIndex++] = String.fromCharCode(c & 63 | 128);
            } else {
               result[resIndex++] = String.fromCharCode(c >> 12 | 224);
               result[resIndex++] = String.fromCharCode(c >> 6 & 63 | 128);
               result[resIndex++] = String.fromCharCode(c & 63 | 128);
            }
         }

         return result.join("");
      },

      /**
       * http://www.webtoolkit.info/javascript-utf8.html
       */
      utf8decode: function utf8decode(input) {
         var result = [],
             resIndex = 0;
         var type = JSZip.utils.getTypeOf(input);
         var isArray = type !== "string";
         var i = 0;
         var c = 0,
             c1 = 0,
             c2 = 0,
             c3 = 0;

         // check if we can use the TextDecoder API
         // see http://encoding.spec.whatwg.org/#api
         if (textDecoder) {
            return textDecoder.decode(JSZip.utils.transformTo("uint8array", input));
         }
         if (JSZip.support.nodebuffer) {
            return JSZip.utils.transformTo("nodebuffer", input).toString("utf-8");
         }

         while (i < input.length) {

            c = isArray ? input[i] : input.charCodeAt(i);

            if (c < 128) {
               result[resIndex++] = String.fromCharCode(c);
               i++;
            } else if (c > 191 && c < 224) {
               c2 = isArray ? input[i + 1] : input.charCodeAt(i + 1);
               result[resIndex++] = String.fromCharCode((c & 31) << 6 | c2 & 63);
               i += 2;
            } else {
               c2 = isArray ? input[i + 1] : input.charCodeAt(i + 1);
               c3 = isArray ? input[i + 2] : input.charCodeAt(i + 2);
               result[resIndex++] = String.fromCharCode((c & 15) << 12 | (c2 & 63) << 6 | c3 & 63);
               i += 3;
            }
         }

         return result.join("");
      }
   };
})();

/*
 * Compression methods
 * This object is filled in as follow :
 * name : {
 *    magic // the 2 bytes indentifying the compression method
 *    compress // function, take the uncompressed content and return it compressed.
 *    uncompress // function, take the compressed content and return it uncompressed.
 *    compressInputType // string, the type accepted by the compress method. null to accept everything.
 *    uncompressInputType // string, the type accepted by the uncompress method. null to accept everything.
 * }
 *
 * STORE is the default compression method, so it's included in this file.
 * Other methods should go to separated files : the user wants modularity.
 */
JSZip.compressions = {
   "STORE": {
      magic: "\x00\x00",
      compress: function compress(content) {
         return content; // no compression
      },
      uncompress: function uncompress(content) {
         return content; // no compression
      },
      compressInputType: null,
      uncompressInputType: null
   }
};

(function () {
   JSZip.utils = {
      /**
       * Convert a string to a "binary string" : a string containing only char codes between 0 and 255.
       * @param {string} str the string to transform.
       * @return {String} the binary string.
       */
      string2binary: function string2binary(str) {
         var result = "";
         for (var i = 0; i < str.length; i++) {
            result += String.fromCharCode(str.charCodeAt(i) & 0xff);
         }
         return result;
      },
      /**
       * Create a Uint8Array from the string.
       * @param {string} str the string to transform.
       * @return {Uint8Array} the typed array.
       * @throws {Error} an Error if the browser doesn't support the requested feature.
       * @deprecated : use JSZip.utils.transformTo instead.
       */
      string2Uint8Array: function string2Uint8Array(str) {
         return JSZip.utils.transformTo("uint8array", str);
      },

      /**
       * Create a string from the Uint8Array.
       * @param {Uint8Array} array the array to transform.
       * @return {string} the string.
       * @throws {Error} an Error if the browser doesn't support the requested feature.
       * @deprecated : use JSZip.utils.transformTo instead.
       */
      uint8Array2String: function uint8Array2String(array) {
         return JSZip.utils.transformTo("string", array);
      },
      /**
       * Create a blob from the given ArrayBuffer.
       * @param {ArrayBuffer} buffer the buffer to transform.
       * @return {Blob} the result.
       * @throws {Error} an Error if the browser doesn't support the requested feature.
       */
      arrayBuffer2Blob: function arrayBuffer2Blob(buffer) {
         JSZip.utils.checkSupport("blob");

         try {
            // Blob constructor
            return new Blob([buffer], { type: "application/zip" });
         } catch (e) {}

         try {
            // deprecated, browser only, old way
            var BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder || window.MSBlobBuilder;
            var builder = new BlobBuilder();
            builder.append(buffer);
            return builder.getBlob('application/zip');
         } catch (e) {}

         // well, fuck ?!
         throw new Error("Bug : can't construct the Blob.");
      },
      /**
       * Create a blob from the given string.
       * @param {string} str the string to transform.
       * @return {Blob} the result.
       * @throws {Error} an Error if the browser doesn't support the requested feature.
       */
      string2Blob: function string2Blob(str) {
         var buffer = JSZip.utils.transformTo("arraybuffer", str);
         return JSZip.utils.arrayBuffer2Blob(buffer);
      }
   };

   /**
    * The identity function.
    * @param {Object} input the input.
    * @return {Object} the same input.
    */
   function identity(input) {
      return input;
   }

   /**
    * Fill in an array with a string.
    * @param {String} str the string to use.
    * @param {Array|ArrayBuffer|Uint8Array|Buffer} array the array to fill in (will be mutated).
    * @return {Array|ArrayBuffer|Uint8Array|Buffer} the updated array.
    */
   function stringToArrayLike(str, array) {
      for (var i = 0; i < str.length; ++i) {
         array[i] = str.charCodeAt(i) & 0xFF;
      }
      return array;
   }

   /**
    * Transform an array-like object to a string.
    * @param {Array|ArrayBuffer|Uint8Array|Buffer} array the array to transform.
    * @return {String} the result.
    */
   function arrayLikeToString(array) {
      // Performances notes :
      // --------------------
      // String.fromCharCode.apply(null, array) is the fastest, see
      // see http://jsperf.com/converting-a-uint8array-to-a-string/2
      // but the stack is limited (and we can get huge arrays !).
      //
      // result += String.fromCharCode(array[i]); generate too many strings !
      //
      // This code is inspired by http://jsperf.com/arraybuffer-to-string-apply-performance/2
      var chunk = 65536;
      var result = [],
          len = array.length,
          type = JSZip.utils.getTypeOf(array),
          k = 0;

      var canUseApply = true;
      try {
         switch (type) {
            case "uint8array":
               String.fromCharCode.apply(null, new Uint8Array(0));
               break;
            case "nodebuffer":
               String.fromCharCode.apply(null, new Buffer(0));
               break;
         }
      } catch (e) {
         canUseApply = false;
      }

      // no apply : slow and painful algorithm
      // default browser on android 4.*
      if (!canUseApply) {
         var resultStr = "";
         for (var i = 0; i < array.length; i++) {
            resultStr += String.fromCharCode(array[i]);
         }
         return resultStr;
      }

      while (k < len && chunk > 1) {
         try {
            if (type === "array" || type === "nodebuffer") {
               result.push(String.fromCharCode.apply(null, array.slice(k, Math.min(k + chunk, len))));
            } else {
               result.push(String.fromCharCode.apply(null, array.subarray(k, Math.min(k + chunk, len))));
            }
            k += chunk;
         } catch (e) {
            chunk = Math.floor(chunk / 2);
         }
      }
      return result.join("");
   }

   /**
    * Copy the data from an array-like to an other array-like.
    * @param {Array|ArrayBuffer|Uint8Array|Buffer} arrayFrom the origin array.
    * @param {Array|ArrayBuffer|Uint8Array|Buffer} arrayTo the destination array which will be mutated.
    * @return {Array|ArrayBuffer|Uint8Array|Buffer} the updated destination array.
    */
   function arrayLikeToArrayLike(arrayFrom, arrayTo) {
      for (var i = 0; i < arrayFrom.length; i++) {
         arrayTo[i] = arrayFrom[i];
      }
      return arrayTo;
   }

   // a matrix containing functions to transform everything into everything.
   var transform = {};

   // string to ?
   transform["string"] = {
      "string": identity,
      "array": function array(input) {
         return stringToArrayLike(input, new Array(input.length));
      },
      "arraybuffer": function arraybuffer(input) {
         return transform["string"]["uint8array"](input).buffer;
      },
      "uint8array": function uint8array(input) {
         return stringToArrayLike(input, new Uint8Array(input.length));
      },
      "nodebuffer": function nodebuffer(input) {
         return stringToArrayLike(input, new Buffer(input.length));
      }
   };

   // array to ?
   transform["array"] = {
      "string": arrayLikeToString,
      "array": identity,
      "arraybuffer": function arraybuffer(input) {
         return new Uint8Array(input).buffer;
      },
      "uint8array": function uint8array(input) {
         return new Uint8Array(input);
      },
      "nodebuffer": function nodebuffer(input) {
         return new Buffer(input);
      }
   };

   // arraybuffer to ?
   transform["arraybuffer"] = {
      "string": function string(input) {
         return arrayLikeToString(new Uint8Array(input));
      },
      "array": function array(input) {
         return arrayLikeToArrayLike(new Uint8Array(input), new Array(input.byteLength));
      },
      "arraybuffer": identity,
      "uint8array": function uint8array(input) {
         return new Uint8Array(input);
      },
      "nodebuffer": function nodebuffer(input) {
         return new Buffer(new Uint8Array(input));
      }
   };

   // uint8array to ?
   transform["uint8array"] = {
      "string": arrayLikeToString,
      "array": function array(input) {
         return arrayLikeToArrayLike(input, new Array(input.length));
      },
      "arraybuffer": function arraybuffer(input) {
         return input.buffer;
      },
      "uint8array": identity,
      "nodebuffer": function nodebuffer(input) {
         return new Buffer(input);
      }
   };

   // nodebuffer to ?
   transform["nodebuffer"] = {
      "string": arrayLikeToString,
      "array": function array(input) {
         return arrayLikeToArrayLike(input, new Array(input.length));
      },
      "arraybuffer": function arraybuffer(input) {
         return transform["nodebuffer"]["uint8array"](input).buffer;
      },
      "uint8array": function uint8array(input) {
         return arrayLikeToArrayLike(input, new Uint8Array(input.length));
      },
      "nodebuffer": identity
   };

   /**
    * Transform an input into any type.
    * The supported output type are : string, array, uint8array, arraybuffer, nodebuffer.
    * If no output type is specified, the unmodified input will be returned.
    * @param {String} outputType the output type.
    * @param {String|Array|ArrayBuffer|Uint8Array|Buffer} input the input to convert.
    * @throws {Error} an Error if the browser doesn't support the requested output type.
    */
   JSZip.utils.transformTo = function (outputType, input) {
      if (!input) {
         // undefined, null, etc
         // an empty string won't harm.
         input = "";
      }
      if (!outputType) {
         return input;
      }
      JSZip.utils.checkSupport(outputType);
      var inputType = JSZip.utils.getTypeOf(input);
      var result = transform[inputType][outputType](input);
      return result;
   };

   /**
    * Return the type of the input.
    * The type will be in a format valid for JSZip.utils.transformTo : string, array, uint8array, arraybuffer.
    * @param {Object} input the input to identify.
    * @return {String} the (lowercase) type of the input.
    */
   JSZip.utils.getTypeOf = function (input) {
      if (typeof input === "string") {
         return "string";
      }
      if (Object.prototype.toString.call(input) === "[object Array]") {
         return "array";
      }
      if (JSZip.support.nodebuffer && Buffer.isBuffer(input)) {
         return "nodebuffer";
      }
      if (JSZip.support.uint8array && input instanceof Uint8Array) {
         return "uint8array";
      }
      if (JSZip.support.arraybuffer && input instanceof ArrayBuffer) {
         return "arraybuffer";
      }
   };

   /**
    * Cross-window, cross-Node-context regular expression detection
    * @param  {Object}  object Anything
    * @return {Boolean}        true if the object is a regular expression,
    * false otherwise
    */
   JSZip.utils.isRegExp = function (object) {
      return Object.prototype.toString.call(object) === "[object RegExp]";
   };

   /**
    * Throw an exception if the type is not supported.
    * @param {String} type the type to check.
    * @throws {Error} an Error if the browser doesn't support the requested type.
    */
   JSZip.utils.checkSupport = function (type) {
      var supported = true;
      switch (type.toLowerCase()) {
         case "uint8array":
            supported = JSZip.support.uint8array;
            break;
         case "arraybuffer":
            supported = JSZip.support.arraybuffer;
            break;
         case "nodebuffer":
            supported = JSZip.support.nodebuffer;
            break;
         case "blob":
            supported = JSZip.support.blob;
            break;
      }
      if (!supported) {
         throw new Error(type + " is not supported by this browser");
      }
   };
})();

(function () {
   /**
    * Represents an entry in the zip.
    * The content may or may not be compressed.
    * @constructor
    */
   JSZip.CompressedObject = function () {
      this.compressedSize = 0;
      this.uncompressedSize = 0;
      this.crc32 = 0;
      this.compressionMethod = null;
      this.compressedContent = null;
   };

   JSZip.CompressedObject.prototype = {
      /**
       * Return the decompressed content in an unspecified format.
       * The format will depend on the decompressor.
       * @return {Object} the decompressed content.
       */
      getContent: function getContent() {
         return null; // see implementation
      },
      /**
       * Return the compressed content in an unspecified format.
       * The format will depend on the compressed conten source.
       * @return {Object} the compressed content.
       */
      getCompressedContent: function getCompressedContent() {
         return null; // see implementation
      }
   };
})();

/**
 *
 *  Base64 encode / decode
 *  http://www.webtoolkit.info/
 *
 *  Hacked so that it doesn't utf8 en/decode everything
 **/
JSZip.base64 = (function () {
   // private property
   var _keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

   return {
      // public method for encoding
      encode: function encode(input, utf8) {
         var output = "";
         var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
         var i = 0;

         while (i < input.length) {

            chr1 = input.charCodeAt(i++);
            chr2 = input.charCodeAt(i++);
            chr3 = input.charCodeAt(i++);

            enc1 = chr1 >> 2;
            enc2 = (chr1 & 3) << 4 | chr2 >> 4;
            enc3 = (chr2 & 15) << 2 | chr3 >> 6;
            enc4 = chr3 & 63;

            if (isNaN(chr2)) {
               enc3 = enc4 = 64;
            } else if (isNaN(chr3)) {
               enc4 = 64;
            }

            output = output + _keyStr.charAt(enc1) + _keyStr.charAt(enc2) + _keyStr.charAt(enc3) + _keyStr.charAt(enc4);
         }

         return output;
      },

      // public method for decoding
      decode: function decode(input, utf8) {
         var output = "";
         var chr1, chr2, chr3;
         var enc1, enc2, enc3, enc4;
         var i = 0;

         input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

         while (i < input.length) {

            enc1 = _keyStr.indexOf(input.charAt(i++));
            enc2 = _keyStr.indexOf(input.charAt(i++));
            enc3 = _keyStr.indexOf(input.charAt(i++));
            enc4 = _keyStr.indexOf(input.charAt(i++));

            chr1 = enc1 << 2 | enc2 >> 4;
            chr2 = (enc2 & 15) << 4 | enc3 >> 2;
            chr3 = (enc3 & 3) << 6 | enc4;

            output = output + String.fromCharCode(chr1);

            if (enc3 != 64) {
               output = output + String.fromCharCode(chr2);
            }
            if (enc4 != 64) {
               output = output + String.fromCharCode(chr3);
            }
         }

         return output;
      }
   };
})();

// enforcing Stuk's coding style
// vim: set shiftwidth=3 softtabstop=3:
(function () {
   "use strict";

   if (!JSZip) {
      throw "JSZip not defined";
   }

   /*jshint -W004, -W018, -W030, -W032, -W033, -W034, -W037,-W040, -W055, -W056, -W061, -W064, -W093, -W117 */
   var context = {};
   (function () {

      // https://github.com/imaya/zlib.js
      // tag 0.1.6
      // file bin/deflate.min.js

      /** @license zlib.js 2012 - imaya [ https://github.com/imaya/zlib.js ] The MIT License */(function () {
         'use strict';var n = void 0,
             u = !0,
             aa = this;function ba(e, d) {
            var c = e.split("."),
                f = aa;!(c[0] in f) && f.execScript && f.execScript("var " + c[0]);for (var a; c.length && (a = c.shift());) !c.length && d !== n ? f[a] = d : f = f[a] ? f[a] : f[a] = {};
         };var C = "undefined" !== typeof Uint8Array && "undefined" !== typeof Uint16Array && "undefined" !== typeof Uint32Array;function K(e, d) {
            this.index = "number" === typeof d ? d : 0;this.d = 0;this.buffer = e instanceof (C ? Uint8Array : Array) ? e : new (C ? Uint8Array : Array)(32768);if (2 * this.buffer.length <= this.index) throw Error("invalid index");this.buffer.length <= this.index && ca(this);
         }function ca(e) {
            var d = e.buffer,
                c,
                f = d.length,
                a = new (C ? Uint8Array : Array)(f << 1);if (C) a.set(d);else for (c = 0; c < f; ++c) a[c] = d[c];return e.buffer = a;
         }
         K.prototype.a = function (e, d, c) {
            var f = this.buffer,
                a = this.index,
                b = this.d,
                k = f[a],
                m;c && 1 < d && (e = 8 < d ? (L[e & 255] << 24 | L[e >>> 8 & 255] << 16 | L[e >>> 16 & 255] << 8 | L[e >>> 24 & 255]) >> 32 - d : L[e] >> 8 - d);if (8 > d + b) k = k << d | e, b += d;else for (m = 0; m < d; ++m) k = k << 1 | e >> d - m - 1 & 1, 8 === ++b && (b = 0, f[a++] = L[k], k = 0, a === f.length && (f = ca(this)));f[a] = k;this.buffer = f;this.d = b;this.index = a;
         };K.prototype.finish = function () {
            var e = this.buffer,
                d = this.index,
                c;0 < this.d && (e[d] <<= 8 - this.d, e[d] = L[e[d]], d++);C ? c = e.subarray(0, d) : (e.length = d, c = e);return c;
         };
         var ga = new (C ? Uint8Array : Array)(256),
             M;for (M = 0; 256 > M; ++M) {
            for (var R = M, S = R, ha = 7, R = R >>> 1; R; R >>>= 1) S <<= 1, S |= R & 1, --ha;ga[M] = (S << ha & 255) >>> 0;
         }var L = ga;function ja(e) {
            this.buffer = new (C ? Uint16Array : Array)(2 * e);this.length = 0;
         }ja.prototype.getParent = function (e) {
            return 2 * ((e - 2) / 4 | 0);
         };ja.prototype.push = function (e, d) {
            var c,
                f,
                a = this.buffer,
                b;c = this.length;a[this.length++] = d;for (a[this.length++] = e; 0 < c;) if ((f = this.getParent(c), a[c] > a[f])) b = a[c], a[c] = a[f], a[f] = b, b = a[c + 1], a[c + 1] = a[f + 1], a[f + 1] = b, c = f;else break;return this.length;
         };
         ja.prototype.pop = function () {
            var e,
                d,
                c = this.buffer,
                f,
                a,
                b;d = c[0];e = c[1];this.length -= 2;c[0] = c[this.length];c[1] = c[this.length + 1];for (b = 0;;) {
               a = 2 * b + 2;if (a >= this.length) break;a + 2 < this.length && c[a + 2] > c[a] && (a += 2);if (c[a] > c[b]) f = c[b], c[b] = c[a], c[a] = f, f = c[b + 1], c[b + 1] = c[a + 1], c[a + 1] = f;else break;b = a;
            }return { index: e, value: d, length: this.length };
         };function ka(e, d) {
            this.e = ma;this.f = 0;this.input = C && e instanceof Array ? new Uint8Array(e) : e;this.c = 0;d && (d.lazy && (this.f = d.lazy), "number" === typeof d.compressionType && (this.e = d.compressionType), d.outputBuffer && (this.b = C && d.outputBuffer instanceof Array ? new Uint8Array(d.outputBuffer) : d.outputBuffer), "number" === typeof d.outputIndex && (this.c = d.outputIndex));this.b || (this.b = new (C ? Uint8Array : Array)(32768));
         }var ma = 2,
             T = [],
             U;
         for (U = 0; 288 > U; U++) switch (u) {case 143 >= U:
               T.push([U + 48, 8]);break;case 255 >= U:
               T.push([U - 144 + 400, 9]);break;case 279 >= U:
               T.push([U - 256 + 0, 7]);break;case 287 >= U:
               T.push([U - 280 + 192, 8]);break;default:
               throw "invalid literal: " + U;}
         ka.prototype.h = function () {
            var e,
                d,
                c,
                f,
                a = this.input;switch (this.e) {case 0:
                  c = 0;for (f = a.length; c < f;) {
                     d = C ? a.subarray(c, c + 65535) : a.slice(c, c + 65535);c += d.length;var b = d,
                         k = c === f,
                         m = n,
                         g = n,
                         p = n,
                         v = n,
                         x = n,
                         l = this.b,
                         h = this.c;if (C) {
                        for (l = new Uint8Array(this.b.buffer); l.length <= h + b.length + 5;) l = new Uint8Array(l.length << 1);l.set(this.b);
                     }m = k ? 1 : 0;l[h++] = m | 0;g = b.length;p = ~g + 65536 & 65535;l[h++] = g & 255;l[h++] = g >>> 8 & 255;l[h++] = p & 255;l[h++] = p >>> 8 & 255;if (C) l.set(b, h), h += b.length, l = l.subarray(0, h);else {
                        v = 0;for (x = b.length; v < x; ++v) l[h++] = b[v];l.length = h;
                     }this.c = h;this.b = l;
                  }break;case 1:
                  var q = new K(C ? new Uint8Array(this.b.buffer) : this.b, this.c);q.a(1, 1, u);q.a(1, 2, u);var t = na(this, a),
                      w,
                      da,
                      z;w = 0;for (da = t.length; w < da; w++) if ((z = t[w], K.prototype.a.apply(q, T[z]), 256 < z)) q.a(t[++w], t[++w], u), q.a(t[++w], 5), q.a(t[++w], t[++w], u);else if (256 === z) break;this.b = q.finish();this.c = this.b.length;break;case ma:
                  var B = new K(C ? new Uint8Array(this.b.buffer) : this.b, this.c),
                      ra,
                      J,
                      N,
                      O,
                      P,
                      Ia = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15],
                      W,
                      sa,
                      X,
                      ta,
                      ea,
                      ia = Array(19),
                      ua,
                      Q,
                      fa,
                      y,
                      va;ra = ma;B.a(1, 1, u);B.a(ra, 2, u);J = na(this, a);W = oa(this.j, 15);sa = pa(W);X = oa(this.i, 7);ta = pa(X);for (N = 286; 257 < N && 0 === W[N - 1]; N--);for (O = 30; 1 < O && 0 === X[O - 1]; O--);var wa = N,
                      xa = O,
                      F = new (C ? Uint32Array : Array)(wa + xa),
                      r,
                      G,
                      s,
                      Y,
                      E = new (C ? Uint32Array : Array)(316),
                      D,
                      A,
                      H = new (C ? Uint8Array : Array)(19);for (r = G = 0; r < wa; r++) F[G++] = W[r];for (r = 0; r < xa; r++) F[G++] = X[r];if (!C) {
                     r = 0;for (Y = H.length; r < Y; ++r) H[r] = 0;
                  }r = D = 0;for (Y = F.length; r < Y; r += G) {
                     for (G = 1; r + G < Y && F[r + G] === F[r]; ++G);s = G;if (0 === F[r]) if (3 > s) for (; 0 < s--;) E[D++] = 0, H[0]++;else for (; 0 < s;) A = 138 > s ? s : 138, A > s - 3 && A < s && (A = s - 3), 10 >= A ? (E[D++] = 17, E[D++] = A - 3, H[17]++) : (E[D++] = 18, E[D++] = A - 11, H[18]++), s -= A;else if ((E[D++] = F[r], H[F[r]]++, s--, 3 > s)) for (; 0 < s--;) E[D++] = F[r], H[F[r]]++;else for (; 0 < s;) A = 6 > s ? s : 6, A > s - 3 && A < s && (A = s - 3), E[D++] = 16, E[D++] = A - 3, H[16]++, s -= A;
                  }e = C ? E.subarray(0, D) : E.slice(0, D);ea = oa(H, 7);for (y = 0; 19 > y; y++) ia[y] = ea[Ia[y]];for (P = 19; 4 < P && 0 === ia[P - 1]; P--);ua = pa(ea);B.a(N - 257, 5, u);B.a(O - 1, 5, u);B.a(P - 4, 4, u);for (y = 0; y < P; y++) B.a(ia[y], 3, u);y = 0;for (va = e.length; y < va; y++) if ((Q = e[y], B.a(ua[Q], ea[Q], u), 16 <= Q)) {
                     y++;switch (Q) {case 16:
                           fa = 2;break;case 17:
                           fa = 3;break;case 18:
                           fa = 7;break;default:
                           throw "invalid code: " + Q;}B.a(e[y], fa, u);
                  }var ya = [sa, W],
                      za = [ta, X],
                      I,
                      Aa,
                      Z,
                      la,
                      Ba,
                      Ca,
                      Da,
                      Ea;Ba = ya[0];Ca = ya[1];Da = za[0];Ea = za[1];I = 0;for (Aa = J.length; I < Aa; ++I) if ((Z = J[I], B.a(Ba[Z], Ca[Z], u), 256 < Z)) B.a(J[++I], J[++I], u), la = J[++I], B.a(Da[la], Ea[la], u), B.a(J[++I], J[++I], u);else if (256 === Z) break;this.b = B.finish();this.c = this.b.length;break;default:
                  throw "invalid compression type";}return this.b;
         };
         function qa(e, d) {
            this.length = e;this.g = d;
         }
         var Fa = (function () {
            function e(a) {
               switch (u) {case 3 === a:
                     return [257, a - 3, 0];case 4 === a:
                     return [258, a - 4, 0];case 5 === a:
                     return [259, a - 5, 0];case 6 === a:
                     return [260, a - 6, 0];case 7 === a:
                     return [261, a - 7, 0];case 8 === a:
                     return [262, a - 8, 0];case 9 === a:
                     return [263, a - 9, 0];case 10 === a:
                     return [264, a - 10, 0];case 12 >= a:
                     return [265, a - 11, 1];case 14 >= a:
                     return [266, a - 13, 1];case 16 >= a:
                     return [267, a - 15, 1];case 18 >= a:
                     return [268, a - 17, 1];case 22 >= a:
                     return [269, a - 19, 2];case 26 >= a:
                     return [270, a - 23, 2];case 30 >= a:
                     return [271, a - 27, 2];case 34 >= a:
                     return [272, a - 31, 2];case 42 >= a:
                     return [273, a - 35, 3];case 50 >= a:
                     return [274, a - 43, 3];case 58 >= a:
                     return [275, a - 51, 3];case 66 >= a:
                     return [276, a - 59, 3];case 82 >= a:
                     return [277, a - 67, 4];case 98 >= a:
                     return [278, a - 83, 4];case 114 >= a:
                     return [279, a - 99, 4];case 130 >= a:
                     return [280, a - 115, 4];case 162 >= a:
                     return [281, a - 131, 5];case 194 >= a:
                     return [282, a - 163, 5];case 226 >= a:
                     return [283, a - 195, 5];case 257 >= a:
                     return [284, a - 227, 5];case 258 === a:
                     return [285, a - 258, 0];default:
                     throw "invalid length: " + a;}
            }var d = [],
                c,
                f;for (c = 3; 258 >= c; c++) f = e(c), d[c] = f[2] << 24 | f[1] << 16 | f[0];return d;
         })(),
             Ga = C ? new Uint32Array(Fa) : Fa;
         function na(e, d) {
            function c(a, c) {
               var b = a.g,
                   d = [],
                   f = 0,
                   e;e = Ga[a.length];d[f++] = e & 65535;d[f++] = e >> 16 & 255;d[f++] = e >> 24;var g;switch (u) {case 1 === b:
                     g = [0, b - 1, 0];break;case 2 === b:
                     g = [1, b - 2, 0];break;case 3 === b:
                     g = [2, b - 3, 0];break;case 4 === b:
                     g = [3, b - 4, 0];break;case 6 >= b:
                     g = [4, b - 5, 1];break;case 8 >= b:
                     g = [5, b - 7, 1];break;case 12 >= b:
                     g = [6, b - 9, 2];break;case 16 >= b:
                     g = [7, b - 13, 2];break;case 24 >= b:
                     g = [8, b - 17, 3];break;case 32 >= b:
                     g = [9, b - 25, 3];break;case 48 >= b:
                     g = [10, b - 33, 4];break;case 64 >= b:
                     g = [11, b - 49, 4];break;case 96 >= b:
                     g = [12, b - 65, 5];break;case 128 >= b:
                     g = [13, b - 97, 5];break;case 192 >= b:
                     g = [14, b - 129, 6];break;case 256 >= b:
                     g = [15, b - 193, 6];break;case 384 >= b:
                     g = [16, b - 257, 7];break;case 512 >= b:
                     g = [17, b - 385, 7];break;case 768 >= b:
                     g = [18, b - 513, 8];break;case 1024 >= b:
                     g = [19, b - 769, 8];break;case 1536 >= b:
                     g = [20, b - 1025, 9];break;case 2048 >= b:
                     g = [21, b - 1537, 9];break;case 3072 >= b:
                     g = [22, b - 2049, 10];break;case 4096 >= b:
                     g = [23, b - 3073, 10];break;case 6144 >= b:
                     g = [24, b - 4097, 11];break;case 8192 >= b:
                     g = [25, b - 6145, 11];break;case 12288 >= b:
                     g = [26, b - 8193, 12];break;case 16384 >= b:
                     g = [27, b - 12289, 12];break;case 24576 >= b:
                     g = [28, b - 16385, 13];break;case 32768 >= b:
                     g = [29, b - 24577, 13];break;default:
                     throw "invalid distance";}e = g;d[f++] = e[0];d[f++] = e[1];d[f++] = e[2];var k, m;k = 0;for (m = d.length; k < m; ++k) l[h++] = d[k];t[d[0]]++;w[d[3]]++;q = a.length + c - 1;x = null;
            }var f,
                a,
                b,
                k,
                m,
                g = {},
                p,
                v,
                x,
                l = C ? new Uint16Array(2 * d.length) : [],
                h = 0,
                q = 0,
                t = new (C ? Uint32Array : Array)(286),
                w = new (C ? Uint32Array : Array)(30),
                da = e.f,
                z;if (!C) {
               for (b = 0; 285 >= b;) t[b++] = 0;for (b = 0; 29 >= b;) w[b++] = 0;
            }t[256] = 1;f = 0;for (a = d.length; f < a; ++f) {
               b = m = 0;for (k = 3; b < k && f + b !== a; ++b) m = m << 8 | d[f + b];g[m] === n && (g[m] = []);p = g[m];if (!(0 < q--)) {
                  for (; 0 < p.length && 32768 < f - p[0];) p.shift();if (f + 3 >= a) {
                     x && c(x, -1);b = 0;for (k = a - f; b < k; ++b) z = d[f + b], l[h++] = z, ++t[z];break;
                  }0 < p.length ? (v = Ha(d, f, p), x ? x.length < v.length ? (z = d[f - 1], l[h++] = z, ++t[z], c(v, 0)) : c(x, -1) : v.length < da ? x = v : c(v, 0)) : x ? c(x, -1) : (z = d[f], l[h++] = z, ++t[z]);
               }p.push(f);
            }l[h++] = 256;t[256]++;e.j = t;e.i = w;return C ? l.subarray(0, h) : l;
         }
         function Ha(e, d, c) {
            var f,
                a,
                b = 0,
                k,
                m,
                g,
                p,
                v = e.length;m = 0;p = c.length;a: for (; m < p; m++) {
               f = c[p - m - 1];k = 3;if (3 < b) {
                  for (g = b; 3 < g; g--) if (e[f + g - 1] !== e[d + g - 1]) continue a;k = b;
               }for (; 258 > k && d + k < v && e[f + k] === e[d + k];) ++k;k > b && (a = f, b = k);if (258 === k) break;
            }return new qa(b, d - a);
         }
         function oa(e, d) {
            var c = e.length,
                f = new ja(572),
                a = new (C ? Uint8Array : Array)(c),
                b,
                k,
                m,
                g,
                p;if (!C) for (g = 0; g < c; g++) a[g] = 0;for (g = 0; g < c; ++g) 0 < e[g] && f.push(g, e[g]);b = Array(f.length / 2);k = new (C ? Uint32Array : Array)(f.length / 2);if (1 === b.length) return a[f.pop().index] = 1, a;g = 0;for (p = f.length / 2; g < p; ++g) b[g] = f.pop(), k[g] = b[g].value;m = Ja(k, k.length, d);g = 0;for (p = b.length; g < p; ++g) a[b[g].index] = m[g];return a;
         }
         function Ja(e, d, c) {
            function f(a) {
               var b = g[a][p[a]];b === d ? (f(a + 1), f(a + 1)) : --k[b];++p[a];
            }var a = new (C ? Uint16Array : Array)(c),
                b = new (C ? Uint8Array : Array)(c),
                k = new (C ? Uint8Array : Array)(d),
                m = Array(c),
                g = Array(c),
                p = Array(c),
                v = (1 << c) - d,
                x = 1 << c - 1,
                l,
                h,
                q,
                t,
                w;a[c - 1] = d;for (h = 0; h < c; ++h) v < x ? b[h] = 0 : (b[h] = 1, v -= x), v <<= 1, a[c - 2 - h] = (a[c - 1 - h] / 2 | 0) + d;a[0] = b[0];m[0] = Array(a[0]);g[0] = Array(a[0]);for (h = 1; h < c; ++h) a[h] > 2 * a[h - 1] + b[h] && (a[h] = 2 * a[h - 1] + b[h]), m[h] = Array(a[h]), g[h] = Array(a[h]);for (l = 0; l < d; ++l) k[l] = c;for (q = 0; q < a[c - 1]; ++q) m[c - 1][q] = e[q], g[c - 1][q] = q;for (l = 0; l < c; ++l) p[l] = 0;1 === b[c - 1] && (--k[0], ++p[c - 1]);for (h = c - 2; 0 <= h; --h) {
               t = l = 0;w = p[h + 1];for (q = 0; q < a[h]; q++) t = m[h + 1][w] + m[h + 1][w + 1], t > e[l] ? (m[h][q] = t, g[h][q] = d, w += 2) : (m[h][q] = e[l], g[h][q] = l, ++l);p[h] = 0;1 === b[h] && f(h);
            }return k;
         }
         function pa(e) {
            var d = new (C ? Uint16Array : Array)(e.length),
                c = [],
                f = [],
                a = 0,
                b,
                k,
                m,
                g;b = 0;for (k = e.length; b < k; b++) c[e[b]] = (c[e[b]] | 0) + 1;b = 1;for (k = 16; b <= k; b++) f[b] = a, a += c[b] | 0, a <<= 1;b = 0;for (k = e.length; b < k; b++) {
               a = f[e[b]];f[e[b]] += 1;m = d[b] = 0;for (g = e[b]; m < g; m++) d[b] = d[b] << 1 | a & 1, a >>>= 1;
            }return d;
         };ba("Zlib.RawDeflate", ka);ba("Zlib.RawDeflate.prototype.compress", ka.prototype.h);var Ka = { NONE: 0, FIXED: 1, DYNAMIC: ma },
             V,
             La,
             $,
             Ma;if (Object.keys) V = Object.keys(Ka);else for (La in (V = [], $ = 0, Ka)) V[$++] = La;$ = 0;for (Ma = V.length; $ < Ma; ++$) La = V[$], ba("Zlib.RawDeflate.CompressionType." + La, Ka[La]);
      }).call(this); //@ sourceMappingURL=rawdeflate.min.js.map
   }).call(context);
   /*jshint +W004, +W018, +W030, +W032, +W033, +W034, +W037,+W040, +W055, +W056, +W061, +W064, +W093, +W117 */

   var compress = function compress(input) {
      var deflate = new context.Zlib.RawDeflate(input);
      return deflate.compress();
   };

   var USE_TYPEDARRAY = typeof Uint8Array !== 'undefined' && typeof Uint16Array !== 'undefined' && typeof Uint32Array !== 'undefined';

   // we add the compression method for JSZip
   if (!JSZip.compressions["DEFLATE"]) {
      JSZip.compressions["DEFLATE"] = {
         magic: "\x08\x00",
         compress: compress,
         compressInputType: USE_TYPEDARRAY ? "uint8array" : "array"
      };
   } else {
      JSZip.compressions["DEFLATE"].compress = compress;
      JSZip.compressions["DEFLATE"].compressInputType = USE_TYPEDARRAY ? "uint8array" : "array";
   }
})();

// enforcing Stuk's coding style
// vim: set shiftwidth=3 softtabstop=3:
(function () {
   "use strict";

   if (!JSZip) {
      throw "JSZip not defined";
   }

   /*jshint -W004, -W030, -W032, -W033, -W034, -W040, -W056, -W061, -W064, -W093 */
   var context = {};
   (function () {

      // https://github.com/imaya/zlib.js
      // tag 0.1.6
      // file bin/deflate.min.js

      /** @license zlib.js 2012 - imaya [ https://github.com/imaya/zlib.js ] The MIT License */(function () {
         'use strict';var l = void 0,
             p = this;function q(c, d) {
            var a = c.split("."),
                b = p;!(a[0] in b) && b.execScript && b.execScript("var " + a[0]);for (var e; a.length && (e = a.shift());) !a.length && d !== l ? b[e] = d : b = b[e] ? b[e] : b[e] = {};
         };var r = "undefined" !== typeof Uint8Array && "undefined" !== typeof Uint16Array && "undefined" !== typeof Uint32Array;function u(c) {
            var d = c.length,
                a = 0,
                b = Number.POSITIVE_INFINITY,
                e,
                f,
                g,
                h,
                k,
                m,
                s,
                n,
                t;for (n = 0; n < d; ++n) c[n] > a && (a = c[n]), c[n] < b && (b = c[n]);e = 1 << a;f = new (r ? Uint32Array : Array)(e);g = 1;h = 0;for (k = 2; g <= a;) {
               for (n = 0; n < d; ++n) if (c[n] === g) {
                  m = 0;s = h;for (t = 0; t < g; ++t) m = m << 1 | s & 1, s >>= 1;for (t = m; t < e; t += k) f[t] = g << 16 | n;++h;
               }++g;h <<= 1;k <<= 1;
            }return [f, a, b];
         };function v(c, d) {
            this.g = [];this.h = 32768;this.c = this.f = this.d = this.k = 0;this.input = r ? new Uint8Array(c) : c;this.l = !1;this.i = w;this.p = !1;if (d || !(d = {})) d.index && (this.d = d.index), d.bufferSize && (this.h = d.bufferSize), d.bufferType && (this.i = d.bufferType), d.resize && (this.p = d.resize);switch (this.i) {case x:
                  this.a = 32768;this.b = new (r ? Uint8Array : Array)(32768 + this.h + 258);break;case w:
                  this.a = 0;this.b = new (r ? Uint8Array : Array)(this.h);this.e = this.u;this.m = this.r;this.j = this.s;break;default:
                  throw Error("invalid inflate mode");
            }
         }var x = 0,
             w = 1;
         v.prototype.t = function () {
            for (; !this.l;) {
               var c = y(this, 3);c & 1 && (this.l = !0);c >>>= 1;switch (c) {case 0:
                     var d = this.input,
                         a = this.d,
                         b = this.b,
                         e = this.a,
                         f = l,
                         g = l,
                         h = l,
                         k = b.length,
                         m = l;this.c = this.f = 0;f = d[a++];if (f === l) throw Error("invalid uncompressed block header: LEN (first byte)");g = f;f = d[a++];if (f === l) throw Error("invalid uncompressed block header: LEN (second byte)");g |= f << 8;f = d[a++];if (f === l) throw Error("invalid uncompressed block header: NLEN (first byte)");h = f;f = d[a++];if (f === l) throw Error("invalid uncompressed block header: NLEN (second byte)");h |= f << 8;if (g === ~h) throw Error("invalid uncompressed block header: length verify");if (a + g > d.length) throw Error("input buffer is broken");switch (this.i) {case x:
                           for (; e + g > b.length;) {
                              m = k - e;g -= m;if (r) b.set(d.subarray(a, a + m), e), e += m, a += m;else for (; m--;) b[e++] = d[a++];this.a = e;b = this.e();e = this.a;
                           }break;case w:
                           for (; e + g > b.length;) b = this.e({ o: 2 });break;default:
                           throw Error("invalid inflate mode");}if (r) b.set(d.subarray(a, a + g), e), e += g, a += g;else for (; g--;) b[e++] = d[a++];this.d = a;this.a = e;this.b = b;break;case 1:
                     this.j(z, A);break;case 2:
                     B(this);break;default:
                     throw Error("unknown BTYPE: " + c);}
            }return this.m();
         };
         var C = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15],
             D = r ? new Uint16Array(C) : C,
             E = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 258, 258],
             F = r ? new Uint16Array(E) : E,
             G = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 0, 0],
             H = r ? new Uint8Array(G) : G,
             I = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577],
             J = r ? new Uint16Array(I) : I,
             K = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13],
             L = r ? new Uint8Array(K) : K,
             M = new (r ? Uint8Array : Array)(288),
             N,
             O;N = 0;for (O = M.length; N < O; ++N) M[N] = 143 >= N ? 8 : 255 >= N ? 9 : 279 >= N ? 7 : 8;var z = u(M),
             P = new (r ? Uint8Array : Array)(30),
             Q,
             R;Q = 0;for (R = P.length; Q < R; ++Q) P[Q] = 5;var A = u(P);function y(c, d) {
            for (var a = c.f, b = c.c, e = c.input, f = c.d, g; b < d;) {
               g = e[f++];if (g === l) throw Error("input buffer is broken");a |= g << b;b += 8;
            }g = a & (1 << d) - 1;c.f = a >>> d;c.c = b - d;c.d = f;return g;
         }
         function S(c, d) {
            for (var a = c.f, b = c.c, e = c.input, f = c.d, g = d[0], h = d[1], k, m, s; b < h;) {
               k = e[f++];if (k === l) break;a |= k << b;b += 8;
            }m = g[a & (1 << h) - 1];s = m >>> 16;c.f = a >> s;c.c = b - s;c.d = f;return m & 65535;
         }
         function B(c) {
            function d(a, c, b) {
               var d, f, e, g;for (g = 0; g < a;) switch ((d = S(this, c), d)) {case 16:
                     for (e = 3 + y(this, 2); e--;) b[g++] = f;break;case 17:
                     for (e = 3 + y(this, 3); e--;) b[g++] = 0;f = 0;break;case 18:
                     for (e = 11 + y(this, 7); e--;) b[g++] = 0;f = 0;break;default:
                     f = b[g++] = d;}return b;
            }var a = y(c, 5) + 257,
                b = y(c, 5) + 1,
                e = y(c, 4) + 4,
                f = new (r ? Uint8Array : Array)(D.length),
                g,
                h,
                k,
                m;for (m = 0; m < e; ++m) f[D[m]] = y(c, 3);g = u(f);h = new (r ? Uint8Array : Array)(a);k = new (r ? Uint8Array : Array)(b);c.j(u(d.call(c, a, g, h)), u(d.call(c, b, g, k)));
         }
         v.prototype.j = function (c, d) {
            var a = this.b,
                b = this.a;this.n = c;for (var e = a.length - 258, f, g, h, k; 256 !== (f = S(this, c));) if (256 > f) b >= e && (this.a = b, a = this.e(), b = this.a), a[b++] = f;else {
               g = f - 257;k = F[g];0 < H[g] && (k += y(this, H[g]));f = S(this, d);h = J[f];0 < L[f] && (h += y(this, L[f]));b >= e && (this.a = b, a = this.e(), b = this.a);for (; k--;) a[b] = a[b++ - h];
            }for (; 8 <= this.c;) this.c -= 8, this.d--;this.a = b;
         };
         v.prototype.s = function (c, d) {
            var a = this.b,
                b = this.a;this.n = c;for (var e = a.length, f, g, h, k; 256 !== (f = S(this, c));) if (256 > f) b >= e && (a = this.e(), e = a.length), a[b++] = f;else {
               g = f - 257;k = F[g];0 < H[g] && (k += y(this, H[g]));f = S(this, d);h = J[f];0 < L[f] && (h += y(this, L[f]));b + k > e && (a = this.e(), e = a.length);for (; k--;) a[b] = a[b++ - h];
            }for (; 8 <= this.c;) this.c -= 8, this.d--;this.a = b;
         };
         v.prototype.e = function () {
            var c = new (r ? Uint8Array : Array)(this.a - 32768),
                d = this.a - 32768,
                a,
                b,
                e = this.b;if (r) c.set(e.subarray(32768, c.length));else {
               a = 0;for (b = c.length; a < b; ++a) c[a] = e[a + 32768];
            }this.g.push(c);this.k += c.length;if (r) e.set(e.subarray(d, d + 32768));else for (a = 0; 32768 > a; ++a) e[a] = e[d + a];this.a = 32768;return e;
         };
         v.prototype.u = function (c) {
            var d,
                a = this.input.length / this.d + 1 | 0,
                b,
                e,
                f,
                g = this.input,
                h = this.b;c && ("number" === typeof c.o && (a = c.o), "number" === typeof c.q && (a += c.q));2 > a ? (b = (g.length - this.d) / this.n[2], f = 258 * (b / 2) | 0, e = f < h.length ? h.length + f : h.length << 1) : e = h.length * a;r ? (d = new Uint8Array(e), d.set(h)) : d = h;return this.b = d;
         };
         v.prototype.m = function () {
            var c = 0,
                d = this.b,
                a = this.g,
                b,
                e = new (r ? Uint8Array : Array)(this.k + (this.a - 32768)),
                f,
                g,
                h,
                k;if (0 === a.length) return r ? this.b.subarray(32768, this.a) : this.b.slice(32768, this.a);f = 0;for (g = a.length; f < g; ++f) {
               b = a[f];h = 0;for (k = b.length; h < k; ++h) e[c++] = b[h];
            }f = 32768;for (g = this.a; f < g; ++f) e[c++] = d[f];this.g = [];return this.buffer = e;
         };
         v.prototype.r = function () {
            var c,
                d = this.a;r ? this.p ? (c = new Uint8Array(d), c.set(this.b.subarray(0, d))) : c = this.b.subarray(0, d) : (this.b.length > d && (this.b.length = d), c = this.b);return this.buffer = c;
         };q("Zlib.RawInflate", v);q("Zlib.RawInflate.prototype.decompress", v.prototype.t);var T = { ADAPTIVE: w, BLOCK: x },
             U,
             V,
             W,
             X;if (Object.keys) U = Object.keys(T);else for (V in (U = [], W = 0, T)) U[W++] = V;W = 0;for (X = U.length; W < X; ++W) V = U[W], q("Zlib.RawInflate.BufferType." + V, T[V]);
      }).call(this); //@ sourceMappingURL=rawinflate.min.js.map
   }).call(context);
   /*jshint +W004, +W030, +W032, +W033, +W034, +W040, +W056, +W061, +W064, +W093 */

   var uncompress = function uncompress(input) {
      var inflate = new context.Zlib.RawInflate(input);
      return inflate.decompress();
   };

   var USE_TYPEDARRAY = typeof Uint8Array !== 'undefined' && typeof Uint16Array !== 'undefined' && typeof Uint32Array !== 'undefined';

   // we add the compression method for JSZip
   if (!JSZip.compressions["DEFLATE"]) {
      JSZip.compressions["DEFLATE"] = {
         magic: "\x08\x00",
         uncompress: uncompress,
         uncompressInputType: USE_TYPEDARRAY ? "uint8array" : "array"
      };
   } else {
      JSZip.compressions["DEFLATE"].uncompress = uncompress;
      JSZip.compressions["DEFLATE"].uncompressInputType = USE_TYPEDARRAY ? "uint8array" : "array";
   }
})();

// enforcing Stuk's coding style
// vim: set shiftwidth=3 softtabstop=3:
/**

JSZip - A Javascript class for generating and reading zip files
<http://stuartk.com/jszip>

(c) 2011 David Duponchel <d.duponchel@gmail.com>
Dual licenced under the MIT license or GPLv3. See LICENSE.markdown.

**/
/*global JSZip */
(function (root) {
   "use strict";

   var MAX_VALUE_16BITS = 65535;
   var MAX_VALUE_32BITS = -1; // well, "\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF" is parsed as -1

   /**
    * Prettify a string read as binary.
    * @param {string} str the string to prettify.
    * @return {string} a pretty string.
    */
   var pretty = function pretty(str) {
      var res = '',
          code,
          i;
      for (i = 0; i < (str || "").length; i++) {
         code = str.charCodeAt(i);
         res += '\\x' + (code < 16 ? "0" : "") + code.toString(16).toUpperCase();
      }
      return res;
   };

   /**
    * Find a compression registered in JSZip.
    * @param {string} compressionMethod the method magic to find.
    * @return {Object|null} the JSZip compression object, null if none found.
    */
   var findCompression = function findCompression(compressionMethod) {
      for (var method in JSZip.compressions) {
         if (!JSZip.compressions.hasOwnProperty(method)) {
            continue;
         }
         if (JSZip.compressions[method].magic === compressionMethod) {
            return JSZip.compressions[method];
         }
      }
      return null;
   };

   // class DataReader {{{
   /**
    * Read bytes from a source.
    * Developer tip : when debugging, a watch on pretty(this.reader.data.slice(this.reader.index))
    * is very useful :)
    * @constructor
    * @param {String|ArrayBuffer|Uint8Array|Buffer} data the data to read.
    */
   function DataReader(data) {
      this.data = null; // type : see implementation
      this.length = 0;
      this.index = 0;
   }
   DataReader.prototype = {
      /**
       * Check that the offset will not go too far.
       * @param {string} offset the additional offset to check.
       * @throws {Error} an Error if the offset is out of bounds.
       */
      checkOffset: function checkOffset(offset) {
         this.checkIndex(this.index + offset);
      },
      /**
       * Check that the specifed index will not be too far.
       * @param {string} newIndex the index to check.
       * @throws {Error} an Error if the index is out of bounds.
       */
      checkIndex: function checkIndex(newIndex) {
         if (this.length < newIndex || newIndex < 0) {
            throw new Error("End of data reached (data length = " + this.length + ", asked index = " + newIndex + "). Corrupted zip ?");
         }
      },
      /**
       * Change the index.
       * @param {number} newIndex The new index.
       * @throws {Error} if the new index is out of the data.
       */
      setIndex: function setIndex(newIndex) {
         this.checkIndex(newIndex);
         this.index = newIndex;
      },
      /**
       * Skip the next n bytes.
       * @param {number} n the number of bytes to skip.
       * @throws {Error} if the new index is out of the data.
       */
      skip: function skip(n) {
         this.setIndex(this.index + n);
      },
      /**
       * Get the byte at the specified index.
       * @param {number} i the index to use.
       * @return {number} a byte.
       */
      byteAt: function byteAt(i) {
         // see implementations
      },
      /**
       * Get the next number with a given byte size.
       * @param {number} size the number of bytes to read.
       * @return {number} the corresponding number.
       */
      readInt: function readInt(size) {
         var result = 0,
             i;
         this.checkOffset(size);
         for (i = this.index + size - 1; i >= this.index; i--) {
            result = (result << 8) + this.byteAt(i);
         }
         this.index += size;
         return result;
      },
      /**
       * Get the next string with a given byte size.
       * @param {number} size the number of bytes to read.
       * @return {string} the corresponding string.
       */
      readString: function readString(size) {
         return JSZip.utils.transformTo("string", this.readData(size));
      },
      /**
       * Get raw data without conversion, <size> bytes.
       * @param {number} size the number of bytes to read.
       * @return {Object} the raw data, implementation specific.
       */
      readData: function readData(size) {
         // see implementations
      },
      /**
       * Find the last occurence of a zip signature (4 bytes).
       * @param {string} sig the signature to find.
       * @return {number} the index of the last occurence, -1 if not found.
       */
      lastIndexOfSignature: function lastIndexOfSignature(sig) {
         // see implementations
      },
      /**
       * Get the next date.
       * @return {Date} the date.
       */
      readDate: function readDate() {
         var dostime = this.readInt(4);
         return new Date((dostime >> 25 & 0x7f) + 1980, // year
         (dostime >> 21 & 0x0f) - 1, // month
         dostime >> 16 & 0x1f, // day
         dostime >> 11 & 0x1f, // hour
         dostime >> 5 & 0x3f, // minute
         (dostime & 0x1f) << 1); // second
      }
   };

   /**
    * Read bytes from a string.
    * @constructor
    * @param {String} data the data to read.
    */
   function StringReader(data, optimizedBinaryString) {
      this.data = data;
      if (!optimizedBinaryString) {
         this.data = JSZip.utils.string2binary(this.data);
      }
      this.length = this.data.length;
      this.index = 0;
   }
   StringReader.prototype = new DataReader();
   /**
    * @see DataReader.byteAt
    */
   StringReader.prototype.byteAt = function (i) {
      return this.data.charCodeAt(i);
   };
   /**
    * @see DataReader.lastIndexOfSignature
    */
   StringReader.prototype.lastIndexOfSignature = function (sig) {
      return this.data.lastIndexOf(sig);
   };
   /**
    * @see DataReader.readData
    */
   StringReader.prototype.readData = function (size) {
      this.checkOffset(size);
      // this will work because the constructor applied the "& 0xff" mask.
      var result = this.data.slice(this.index, this.index + size);
      this.index += size;
      return result;
   };

   /**
    * Read bytes from an Uin8Array.
    * @constructor
    * @param {Uint8Array} data the data to read.
    */
   function Uint8ArrayReader(data) {
      if (data) {
         this.data = data;
         this.length = this.data.length;
         this.index = 0;
      }
   }
   Uint8ArrayReader.prototype = new DataReader();
   /**
    * @see DataReader.byteAt
    */
   Uint8ArrayReader.prototype.byteAt = function (i) {
      return this.data[i];
   };
   /**
    * @see DataReader.lastIndexOfSignature
    */
   Uint8ArrayReader.prototype.lastIndexOfSignature = function (sig) {
      var sig0 = sig.charCodeAt(0),
          sig1 = sig.charCodeAt(1),
          sig2 = sig.charCodeAt(2),
          sig3 = sig.charCodeAt(3);
      for (var i = this.length - 4; i >= 0; --i) {
         if (this.data[i] === sig0 && this.data[i + 1] === sig1 && this.data[i + 2] === sig2 && this.data[i + 3] === sig3) {
            return i;
         }
      }

      return -1;
   };
   /**
    * @see DataReader.readData
    */
   Uint8ArrayReader.prototype.readData = function (size) {
      this.checkOffset(size);
      var result = this.data.subarray(this.index, this.index + size);
      this.index += size;
      return result;
   };

   /**
    * Read bytes from a Buffer.
    * @constructor
    * @param {Buffer} data the data to read.
    */
   function NodeBufferReader(data) {
      this.data = data;
      this.length = this.data.length;
      this.index = 0;
   }
   NodeBufferReader.prototype = new Uint8ArrayReader();

   /**
    * @see DataReader.readData
    */
   NodeBufferReader.prototype.readData = function (size) {
      this.checkOffset(size);
      var result = this.data.slice(this.index, this.index + size);
      this.index += size;
      return result;
   };
   // }}} end of DataReader

   // class ZipEntry {{{
   /**
    * An entry in the zip file.
    * @constructor
    * @param {Object} options Options of the current file.
    * @param {Object} loadOptions Options for loading the data.
    */
   function ZipEntry(options, loadOptions) {
      this.options = options;
      this.loadOptions = loadOptions;
   }
   ZipEntry.prototype = {
      /**
       * say if the file is encrypted.
       * @return {boolean} true if the file is encrypted, false otherwise.
       */
      isEncrypted: function isEncrypted() {
         // bit 1 is set
         return (this.bitFlag & 0x0001) === 0x0001;
      },
      /**
       * say if the file has utf-8 filename/comment.
       * @return {boolean} true if the filename/comment is in utf-8, false otherwise.
       */
      useUTF8: function useUTF8() {
         // bit 11 is set
         return (this.bitFlag & 0x0800) === 0x0800;
      },
      /**
       * Prepare the function used to generate the compressed content from this ZipFile.
       * @param {DataReader} reader the reader to use.
       * @param {number} from the offset from where we should read the data.
       * @param {number} length the length of the data to read.
       * @return {Function} the callback to get the compressed content (the type depends of the DataReader class).
       */
      prepareCompressedContent: function prepareCompressedContent(reader, from, length) {
         return function () {
            var previousIndex = reader.index;
            reader.setIndex(from);
            var compressedFileData = reader.readData(length);
            reader.setIndex(previousIndex);

            return compressedFileData;
         };
      },
      /**
       * Prepare the function used to generate the uncompressed content from this ZipFile.
       * @param {DataReader} reader the reader to use.
       * @param {number} from the offset from where we should read the data.
       * @param {number} length the length of the data to read.
       * @param {JSZip.compression} compression the compression used on this file.
       * @param {number} uncompressedSize the uncompressed size to expect.
       * @return {Function} the callback to get the uncompressed content (the type depends of the DataReader class).
       */
      prepareContent: function prepareContent(reader, from, length, compression, uncompressedSize) {
         return function () {

            var compressedFileData = JSZip.utils.transformTo(compression.uncompressInputType, this.getCompressedContent());
            var uncompressedFileData = compression.uncompress(compressedFileData);

            if (uncompressedFileData.length !== uncompressedSize) {
               throw new Error("Bug : uncompressed data size mismatch");
            }

            return uncompressedFileData;
         };
      },
      /**
       * Read the local part of a zip file and add the info in this object.
       * @param {DataReader} reader the reader to use.
       */
      readLocalPart: function readLocalPart(reader) {
         var compression, localExtraFieldsLength;

         // we already know everything from the central dir !
         // If the central dir data are false, we are doomed.
         // On the bright side, the local part is scary  : zip64, data descriptors, both, etc.
         // The less data we get here, the more reliable this should be.
         // Let's skip the whole header and dash to the data !
         reader.skip(22);
         // in some zip created on windows, the filename stored in the central dir contains \ instead of /.
         // Strangely, the filename here is OK.
         // I would love to treat these zip files as corrupted (see http://www.info-zip.org/FAQ.html#backslashes
         // or APPNOTE#4.4.17.1, "All slashes MUST be forward slashes '/'") but there are a lot of bad zip generators...
         // Search "unzip mismatching "local" filename continuing with "central" filename version" on
         // the internet.
         //
         // I think I see the logic here : the central directory is used to display
         // content and the local directory is used to extract the files. Mixing / and \
         // may be used to display \ to windows users and use / when extracting the files.
         // Unfortunately, this lead also to some issues : http://seclists.org/fulldisclosure/2009/Sep/394
         this.fileNameLength = reader.readInt(2);
         localExtraFieldsLength = reader.readInt(2); // can't be sure this will be the same as the central dir
         this.fileName = reader.readString(this.fileNameLength);
         reader.skip(localExtraFieldsLength);

         if (this.compressedSize == -1 || this.uncompressedSize == -1) {
            throw new Error("Bug or corrupted zip : didn't get enough informations from the central directory " + "(compressedSize == -1 || uncompressedSize == -1)");
         }

         compression = findCompression(this.compressionMethod);
         if (compression === null) {
            // no compression found
            throw new Error("Corrupted zip : compression " + pretty(this.compressionMethod) + " unknown (inner file : " + this.fileName + ")");
         }
         this.decompressed = new JSZip.CompressedObject();
         this.decompressed.compressedSize = this.compressedSize;
         this.decompressed.uncompressedSize = this.uncompressedSize;
         this.decompressed.crc32 = this.crc32;
         this.decompressed.compressionMethod = this.compressionMethod;
         this.decompressed.getCompressedContent = this.prepareCompressedContent(reader, reader.index, this.compressedSize, compression);
         this.decompressed.getContent = this.prepareContent(reader, reader.index, this.compressedSize, compression, this.uncompressedSize);

         // we need to compute the crc32...
         if (this.loadOptions.checkCRC32) {
            this.decompressed = JSZip.utils.transformTo("string", this.decompressed.getContent());
            if (JSZip.prototype.crc32(this.decompressed) !== this.crc32) {
               throw new Error("Corrupted zip : CRC32 mismatch");
            }
         }
      },

      /**
       * Read the central part of a zip file and add the info in this object.
       * @param {DataReader} reader the reader to use.
       */
      readCentralPart: function readCentralPart(reader) {
         this.versionMadeBy = reader.readString(2);
         this.versionNeeded = reader.readInt(2);
         this.bitFlag = reader.readInt(2);
         this.compressionMethod = reader.readString(2);
         this.date = reader.readDate();
         this.crc32 = reader.readInt(4);
         this.compressedSize = reader.readInt(4);
         this.uncompressedSize = reader.readInt(4);
         this.fileNameLength = reader.readInt(2);
         this.extraFieldsLength = reader.readInt(2);
         this.fileCommentLength = reader.readInt(2);
         this.diskNumberStart = reader.readInt(2);
         this.internalFileAttributes = reader.readInt(2);
         this.externalFileAttributes = reader.readInt(4);
         this.localHeaderOffset = reader.readInt(4);

         if (this.isEncrypted()) {
            throw new Error("Encrypted zip are not supported");
         }

         this.fileName = reader.readString(this.fileNameLength);
         this.readExtraFields(reader);
         this.parseZIP64ExtraField(reader);
         this.fileComment = reader.readString(this.fileCommentLength);

         // warning, this is true only for zip with madeBy == DOS (plateform dependent feature)
         this.dir = this.externalFileAttributes & 0x00000010 ? true : false;
      },
      /**
       * Parse the ZIP64 extra field and merge the info in the current ZipEntry.
       * @param {DataReader} reader the reader to use.
       */
      parseZIP64ExtraField: function parseZIP64ExtraField(reader) {

         if (!this.extraFields[0x0001]) {
            return;
         }

         // should be something, preparing the extra reader
         var extraReader = new StringReader(this.extraFields[0x0001].value);

         // I really hope that these 64bits integer can fit in 32 bits integer, because js
         // won't let us have more.
         if (this.uncompressedSize === MAX_VALUE_32BITS) {
            this.uncompressedSize = extraReader.readInt(8);
         }
         if (this.compressedSize === MAX_VALUE_32BITS) {
            this.compressedSize = extraReader.readInt(8);
         }
         if (this.localHeaderOffset === MAX_VALUE_32BITS) {
            this.localHeaderOffset = extraReader.readInt(8);
         }
         if (this.diskNumberStart === MAX_VALUE_32BITS) {
            this.diskNumberStart = extraReader.readInt(4);
         }
      },
      /**
       * Read the central part of a zip file and add the info in this object.
       * @param {DataReader} reader the reader to use.
       */
      readExtraFields: function readExtraFields(reader) {
         var start = reader.index,
             extraFieldId,
             extraFieldLength,
             extraFieldValue;

         this.extraFields = this.extraFields || {};

         while (reader.index < start + this.extraFieldsLength) {
            extraFieldId = reader.readInt(2);
            extraFieldLength = reader.readInt(2);
            extraFieldValue = reader.readString(extraFieldLength);

            this.extraFields[extraFieldId] = {
               id: extraFieldId,
               length: extraFieldLength,
               value: extraFieldValue
            };
         }
      },
      /**
       * Apply an UTF8 transformation if needed.
       */
      handleUTF8: function handleUTF8() {
         if (this.useUTF8()) {
            this.fileName = JSZip.prototype.utf8decode(this.fileName);
            this.fileComment = JSZip.prototype.utf8decode(this.fileComment);
         }
      }
   };
   // }}} end of ZipEntry

   //  class ZipEntries {{{
   /**
    * All the entries in the zip file.
    * @constructor
    * @param {String|ArrayBuffer|Uint8Array|Buffer} data the binary data to load.
    * @param {Object} loadOptions Options for loading the data.
    */
   function ZipEntries(data, loadOptions) {
      this.files = [];
      this.loadOptions = loadOptions;
      if (data) {
         this.load(data);
      }
   }
   ZipEntries.prototype = {
      /**
       * Check that the reader is on the speficied signature.
       * @param {string} expectedSignature the expected signature.
       * @throws {Error} if it is an other signature.
       */
      checkSignature: function checkSignature(expectedSignature) {
         var signature = this.reader.readString(4);
         if (signature !== expectedSignature) {
            throw new Error("Corrupted zip or bug : unexpected signature " + "(" + pretty(signature) + ", expected " + pretty(expectedSignature) + ")");
         }
      },
      /**
       * Read the end of the central directory.
       */
      readBlockEndOfCentral: function readBlockEndOfCentral() {
         this.diskNumber = this.reader.readInt(2);
         this.diskWithCentralDirStart = this.reader.readInt(2);
         this.centralDirRecordsOnThisDisk = this.reader.readInt(2);
         this.centralDirRecords = this.reader.readInt(2);
         this.centralDirSize = this.reader.readInt(4);
         this.centralDirOffset = this.reader.readInt(4);

         this.zipCommentLength = this.reader.readInt(2);
         this.zipComment = this.reader.readString(this.zipCommentLength);
      },
      /**
       * Read the end of the Zip 64 central directory.
       * Not merged with the method readEndOfCentral :
       * The end of central can coexist with its Zip64 brother,
       * I don't want to read the wrong number of bytes !
       */
      readBlockZip64EndOfCentral: function readBlockZip64EndOfCentral() {
         this.zip64EndOfCentralSize = this.reader.readInt(8);
         this.versionMadeBy = this.reader.readString(2);
         this.versionNeeded = this.reader.readInt(2);
         this.diskNumber = this.reader.readInt(4);
         this.diskWithCentralDirStart = this.reader.readInt(4);
         this.centralDirRecordsOnThisDisk = this.reader.readInt(8);
         this.centralDirRecords = this.reader.readInt(8);
         this.centralDirSize = this.reader.readInt(8);
         this.centralDirOffset = this.reader.readInt(8);

         this.zip64ExtensibleData = {};
         var extraDataSize = this.zip64EndOfCentralSize - 44,
             index = 0,
             extraFieldId,
             extraFieldLength,
             extraFieldValue;
         while (index < extraDataSize) {
            extraFieldId = this.reader.readInt(2);
            extraFieldLength = this.reader.readInt(4);
            extraFieldValue = this.reader.readString(extraFieldLength);
            this.zip64ExtensibleData[extraFieldId] = {
               id: extraFieldId,
               length: extraFieldLength,
               value: extraFieldValue
            };
         }
      },
      /**
       * Read the end of the Zip 64 central directory locator.
       */
      readBlockZip64EndOfCentralLocator: function readBlockZip64EndOfCentralLocator() {
         this.diskWithZip64CentralDirStart = this.reader.readInt(4);
         this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8);
         this.disksCount = this.reader.readInt(4);
         if (this.disksCount > 1) {
            throw new Error("Multi-volumes zip are not supported");
         }
      },
      /**
       * Read the local files, based on the offset read in the central part.
       */
      readLocalFiles: function readLocalFiles() {
         var i, file;
         for (i = 0; i < this.files.length; i++) {
            file = this.files[i];
            this.reader.setIndex(file.localHeaderOffset);
            this.checkSignature(JSZip.signature.LOCAL_FILE_HEADER);
            file.readLocalPart(this.reader);
            file.handleUTF8();
         }
      },
      /**
       * Read the central directory.
       */
      readCentralDir: function readCentralDir() {
         var file;

         this.reader.setIndex(this.centralDirOffset);
         while (this.reader.readString(4) === JSZip.signature.CENTRAL_FILE_HEADER) {
            file = new ZipEntry({
               zip64: this.zip64
            }, this.loadOptions);
            file.readCentralPart(this.reader);
            this.files.push(file);
         }
      },
      /**
       * Read the end of central directory.
       */
      readEndOfCentral: function readEndOfCentral() {
         var offset = this.reader.lastIndexOfSignature(JSZip.signature.CENTRAL_DIRECTORY_END);
         if (offset === -1) {
            throw new Error("Corrupted zip : can't find end of central directory");
         }
         this.reader.setIndex(offset);
         this.checkSignature(JSZip.signature.CENTRAL_DIRECTORY_END);
         this.readBlockEndOfCentral();

         /* extract from the zip spec :
            4)  If one of the fields in the end of central directory
                record is too small to hold required data, the field
                should be set to -1 (0xFFFF or 0xFFFFFFFF) and the
                ZIP64 format record should be created.
            5)  The end of central directory record and the
                Zip64 end of central directory locator record must
                reside on the same disk when splitting or spanning
                an archive.
         */
         if (this.diskNumber === MAX_VALUE_16BITS || this.diskWithCentralDirStart === MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === MAX_VALUE_16BITS || this.centralDirRecords === MAX_VALUE_16BITS || this.centralDirSize === MAX_VALUE_32BITS || this.centralDirOffset === MAX_VALUE_32BITS) {
            this.zip64 = true;

            /*
            Warning : the zip64 extension is supported, but ONLY if the 64bits integer read from
            the zip file can fit into a 32bits integer. This cannot be solved : Javascript represents
            all numbers as 64-bit double precision IEEE 754 floating point numbers.
            So, we have 53bits for integers and bitwise operations treat everything as 32bits.
            see https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Operators/Bitwise_Operators
            and http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-262.pdf section 8.5
            */

            // should look for a zip64 EOCD locator
            offset = this.reader.lastIndexOfSignature(JSZip.signature.ZIP64_CENTRAL_DIRECTORY_LOCATOR);
            if (offset === -1) {
               throw new Error("Corrupted zip : can't find the ZIP64 end of central directory locator");
            }
            this.reader.setIndex(offset);
            this.checkSignature(JSZip.signature.ZIP64_CENTRAL_DIRECTORY_LOCATOR);
            this.readBlockZip64EndOfCentralLocator();

            // now the zip64 EOCD record
            this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir);
            this.checkSignature(JSZip.signature.ZIP64_CENTRAL_DIRECTORY_END);
            this.readBlockZip64EndOfCentral();
         }
      },
      prepareReader: function prepareReader(data) {
         var type = JSZip.utils.getTypeOf(data);
         if (type === "string" && !JSZip.support.uint8array) {
            this.reader = new StringReader(data, this.loadOptions.optimizedBinaryString);
         } else if (type === "nodebuffer") {
            this.reader = new NodeBufferReader(data);
         } else {
            this.reader = new Uint8ArrayReader(JSZip.utils.transformTo("uint8array", data));
         }
      },
      /**
       * Read a zip file and create ZipEntries.
       * @param {String|ArrayBuffer|Uint8Array|Buffer} data the binary string representing a zip file.
       */
      load: function load(data) {
         this.prepareReader(data);
         this.readEndOfCentral();
         this.readCentralDir();
         this.readLocalFiles();
      }
   };
   // }}} end of ZipEntries

   /**
    * Implementation of the load method of JSZip.
    * It uses the above classes to decode a zip file, and load every files.
    * @param {String|ArrayBuffer|Uint8Array|Buffer} data the data to load.
    * @param {Object} options Options for loading the data.
    *  options.base64 : is the data in base64 ? default : false
    */
   JSZip.prototype.load = function (data, options) {
      var files, zipEntries, i, input;
      options = options || {};
      if (options.base64) {
         data = JSZip.base64.decode(data);
      }

      zipEntries = new ZipEntries(data, options);
      files = zipEntries.files;
      for (i = 0; i < files.length; i++) {
         input = files[i];
         this.file(input.fileName, input.decompressed, {
            binary: true,
            optimizedBinaryString: true,
            date: input.date,
            dir: input.dir
         });
      }

      return this;
   };
})(undefined);
if (typeof exports !== 'undefined') exports.JSZip = JSZip;
// enforcing Stuk's coding style
// vim: set shiftwidth=3 softtabstop=3 foldmethod=marker:
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zY3JpcHRzL2pzemlwLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQTRCQSxJQUFJLEtBQUssR0FBRyxTQUFSLEtBQUssQ0FBWSxJQUFJLEVBQUUsT0FBTyxFQUFFOzs7Ozs7QUFNakMsT0FBSSxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUM7OztBQUdoQixPQUFJLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQzs7QUFFZixPQUFJLElBQUksRUFBRTtBQUNQLFVBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzNCO0NBQ0gsQ0FBQzs7QUFFRixLQUFLLENBQUMsU0FBUyxHQUFHO0FBQ2Ysb0JBQWlCLEVBQUUsa0JBQWtCO0FBQ3JDLHNCQUFtQixFQUFFLGtCQUFrQjtBQUN2Qyx3QkFBcUIsRUFBRSxrQkFBa0I7QUFDekMsa0NBQStCLEVBQUUsa0JBQWtCO0FBQ25ELDhCQUEyQixFQUFFLGtCQUFrQjtBQUMvQyxrQkFBZSxFQUFFLGtCQUFrQjtDQUNyQyxDQUFDOzs7QUFHRixLQUFLLENBQUMsUUFBUSxHQUFHO0FBQ2QsU0FBTSxFQUFFLEtBQUs7QUFDYixTQUFNLEVBQUUsS0FBSztBQUNiLE1BQUcsRUFBRSxLQUFLO0FBQ1YsT0FBSSxFQUFFLElBQUk7QUFDVixjQUFXLEVBQUUsSUFBSTtDQUNuQixDQUFDOzs7OztBQUtGLEtBQUssQ0FBQyxPQUFPLEdBQUc7O0FBRWIsY0FBVyxFQUFHLENBQUMsWUFBVTtBQUN0QixhQUFPLE9BQU8sV0FBVyxLQUFLLFdBQVcsSUFBSSxPQUFPLFVBQVUsS0FBSyxXQUFXLENBQUM7SUFDakYsQ0FBQSxFQUFHOztBQUVKLGFBQVUsRUFBRyxDQUFDLFlBQVU7QUFDckIsYUFBTyxPQUFPLE1BQU0sS0FBSyxXQUFXLENBQUM7SUFDdkMsQ0FBQSxFQUFHOztBQUVKLGFBQVUsRUFBRyxDQUFDLFlBQVU7QUFDckIsYUFBTyxPQUFPLFVBQVUsS0FBSyxXQUFXLENBQUM7SUFDM0MsQ0FBQSxFQUFHOztBQUVKLE9BQUksRUFBRyxDQUFDLFlBQVU7Ozs7Ozs7O0FBUWYsVUFBSSxPQUFPLFdBQVcsS0FBSyxXQUFXLEVBQUU7QUFDckMsZ0JBQU8sS0FBSyxDQUFDO09BQ2Y7QUFDRCxVQUFJLE1BQU0sR0FBRyxJQUFJLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNoQyxVQUFJO0FBQ0QsZ0JBQU8sSUFBSSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxpQkFBaUIsRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQztPQUNwRSxDQUNELE9BQU0sQ0FBQyxFQUFFLEVBQUU7O0FBRVgsVUFBSTtBQUNELGFBQUksV0FBVyxHQUFHLE1BQU0sQ0FBQyxXQUFXLElBQUksTUFBTSxDQUFDLGlCQUFpQixJQUFJLE1BQU0sQ0FBQyxjQUFjLElBQUksTUFBTSxDQUFDLGFBQWEsQ0FBQztBQUNsSCxhQUFJLE9BQU8sR0FBRyxJQUFJLFdBQVcsRUFBRSxDQUFDO0FBQ2hDLGdCQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3ZCLGdCQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDO09BQ3ZELENBQ0QsT0FBTSxDQUFDLEVBQUUsRUFBRTs7QUFFWCxhQUFPLEtBQUssQ0FBQztJQUNmLENBQUEsRUFBRztDQUNOLENBQUM7O0FBRUYsS0FBSyxDQUFDLFNBQVMsR0FBSSxDQUFBLFlBQVk7QUFDNUIsT0FBSSxXQUFXLEVBQUUsV0FBVyxDQUFDO0FBQzdCLE9BQ0csS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLElBQ3hCLE9BQU8sV0FBVyxLQUFLLFVBQVUsSUFDakMsT0FBTyxXQUFXLEtBQUssVUFBVSxFQUNsQztBQUNDLGlCQUFXLEdBQUcsSUFBSSxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDdkMsaUJBQVcsR0FBRyxJQUFJLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN6Qzs7Ozs7OztBQU9ELE9BQUksVUFBVSxHQUFHLFNBQWIsVUFBVSxDQUFhLElBQUksRUFBRTtBQUM5QixVQUFJLElBQUksQ0FBQyxLQUFLLFlBQVksS0FBSyxDQUFDLGdCQUFnQixFQUFFO0FBQy9DLGFBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQztBQUNyQyxhQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7QUFDM0IsYUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDOztBQUU1QixhQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxZQUFZLEVBQUU7QUFDckQsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7OztBQUd0QixnQkFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7O0FBRXpDLGdCQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO0FBQ3BCLG1CQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7YUFDMUI7VUFDSDtPQUNIO0FBQ0QsYUFBTyxJQUFJLENBQUMsS0FBSyxDQUFDO0lBQ3BCLENBQUM7Ozs7Ozs7QUFPRixPQUFJLGFBQWEsR0FBRyxTQUFoQixhQUFhLENBQWEsSUFBSSxFQUFFO0FBQ2pDLFVBQUksTUFBTSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUM7VUFBRSxJQUFJLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDcEUsVUFBSSxJQUFJLEtBQUssUUFBUSxFQUFFO0FBQ3BCLGFBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRTs7O0FBR3ZCLGdCQUFJLFdBQVcsRUFBRTtBQUNkLHNCQUFPLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7YUFDcEM7QUFDRCxnQkFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRTtBQUMzQixzQkFBTyxJQUFJLE1BQU0sQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7YUFDckM7VUFDSDtBQUNELGdCQUFPLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztPQUN6QjtBQUNELGFBQU8sTUFBTSxDQUFDO0lBQ2hCLENBQUM7Ozs7Ozs7QUFPRixPQUFJLFlBQVksR0FBRyxTQUFmLFlBQVksQ0FBYSxNQUFNLEVBQUU7QUFDbEMsVUFBSSxNQUFNLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzlCLFVBQUksTUFBTSxLQUFLLElBQUksSUFBSSxPQUFPLE1BQU0sS0FBSyxXQUFXLEVBQUU7QUFDbkQsZ0JBQU8sRUFBRSxDQUFDO09BQ1o7O0FBRUQsVUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRTtBQUN0QixlQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7T0FDdkM7QUFDRCxVQUFJLE1BQU0sSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRTs7O0FBR2hDLGVBQU0sR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztPQUM5QyxNQUFNOztBQUVKLGVBQU0sR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUM7T0FDckQ7O0FBRUQsVUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFO0FBQ2xDLGVBQU0sR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztPQUM5QztBQUNELGFBQU8sTUFBTSxDQUFDO0lBQ2hCLENBQUM7Ozs7Ozs7O0FBUUYsT0FBSSxTQUFTLEdBQUcsU0FBWixTQUFTLENBQWEsSUFBSSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUU7QUFDNUMsVUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7QUFDakIsVUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7QUFDbEIsVUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7SUFDekIsQ0FBQzs7QUFFRixZQUFTLENBQUMsU0FBUyxHQUFHOzs7OztBQUtuQixZQUFNLEVBQUcsa0JBQVk7QUFDbEIsZ0JBQU8sWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7T0FDdkM7Ozs7O0FBS0QsY0FBUSxFQUFHLG9CQUFZO0FBQ3BCLGdCQUFPLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO09BQ3hDOzs7OztBQUtELGtCQUFZLEVBQUcsd0JBQVk7QUFDeEIsYUFBSSxNQUFNLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2pDLGdCQUFPLEtBQUssQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLFlBQVksRUFBRSxNQUFNLENBQUMsQ0FBQztPQUN2RDs7Ozs7QUFLRCxrQkFBWSxFQUFHLHdCQUFZO0FBQ3hCLGFBQUksTUFBTSxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNqQyxnQkFBTyxLQUFLLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUUsTUFBTSxDQUFDLENBQUM7T0FDdkQ7Ozs7O0FBS0QsbUJBQWEsRUFBRyx5QkFBWTtBQUN6QixnQkFBTyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUMsTUFBTSxDQUFDO09BQ3BDO0lBQ0gsQ0FBQzs7Ozs7Ozs7O0FBU0YsT0FBSSxRQUFRLEdBQUcsU0FBWCxRQUFRLENBQVksR0FBRyxFQUFFLEtBQUssRUFBRTtBQUNqQyxVQUFJLEdBQUcsR0FBRyxFQUFFO1VBQUUsQ0FBQyxDQUFDO0FBQ2hCLFdBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQ3hCLFlBQUcsSUFBSSxNQUFNLENBQUMsWUFBWSxDQUFDLEdBQUcsR0FBQyxJQUFJLENBQUMsQ0FBQztBQUNyQyxZQUFHLEdBQUMsR0FBRyxLQUFHLENBQUMsQ0FBQztPQUNkO0FBQ0QsYUFBTyxHQUFHLENBQUM7SUFDYixDQUFDOzs7Ozs7OztBQVFGLE9BQUksTUFBTSxHQUFHLFNBQVQsTUFBTSxHQUFlO0FBQ3RCLFVBQUksTUFBTSxHQUFHLEVBQUU7VUFBRSxDQUFDO1VBQUUsSUFBSSxDQUFDO0FBQ3pCLFdBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTs7QUFDcEMsY0FBSyxJQUFJLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFO0FBQ3hCLGdCQUFJLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssV0FBVyxFQUFFO0FBQzNFLHFCQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQ3BDO1VBQ0g7T0FDSDtBQUNELGFBQU8sTUFBTSxDQUFDO0lBQ2hCLENBQUM7Ozs7Ozs7OztBQVNGLE9BQUksZ0JBQWdCLEdBQUcsU0FBbkIsZ0JBQWdCLENBQWEsQ0FBQyxFQUFFO0FBQ2pDLE9BQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDOztBQUVaLFVBQUksQ0FBQyxDQUFDLE1BQU0sS0FBSyxJQUFJLElBQUksQ0FBQyxDQUFDLE1BQU0sSUFBSSxJQUFJLEVBQUU7QUFDeEMsVUFBQyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7T0FDbEI7O0FBRUQsT0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQzlCLE9BQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLElBQUksSUFBSSxJQUFJLElBQUksRUFBRSxDQUFDO0FBQzlCLFVBQUksQ0FBQyxDQUFDLFdBQVcsS0FBSyxJQUFJLEVBQUUsQ0FBQyxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsV0FBVyxDQUFDLFdBQVcsRUFBRSxDQUFDOztBQUV4RSxhQUFPLENBQUMsQ0FBQztJQUNYLENBQUM7Ozs7Ozs7Ozs7QUFVRixPQUFJLE9BQU8sR0FBRyxTQUFWLE9BQU8sQ0FBYSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRTs7QUFFcEMsVUFBSSxNQUFNLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQztVQUFFLFFBQVEsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN4RSxVQUFJLE1BQU0sRUFBRTtBQUNULGtCQUFTLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztPQUMvQjs7QUFFRCxPQUFDLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7O0FBRXhCLFVBQUksQ0FBQyxDQUFDLEdBQUcsSUFBSSxJQUFJLEtBQUssSUFBSSxJQUFJLE9BQU8sSUFBSSxLQUFLLFdBQVcsRUFBRTtBQUN4RCxVQUFDLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztBQUNqQixVQUFDLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztBQUNqQixhQUFJLEdBQUcsSUFBSSxDQUFDO09BQ2QsTUFBTSxJQUFJLFFBQVEsS0FBSyxRQUFRLEVBQUU7QUFDL0IsYUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRTs7QUFFeEIsZ0JBQUksQ0FBQyxDQUFDLHFCQUFxQixLQUFLLElBQUksRUFBRTs7O0FBR25DLG1CQUFJLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7YUFDekM7VUFDSDtPQUNILE1BQU07O0FBQ0osVUFBQyxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7QUFDakIsVUFBQyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7O0FBRWhCLGFBQUksQ0FBQyxRQUFRLElBQUksRUFBRSxJQUFJLFlBQVksS0FBSyxDQUFDLGdCQUFnQixDQUFBLEFBQUMsRUFBRTtBQUN6RCxrQkFBTSxJQUFJLEtBQUssQ0FBQyxlQUFlLEdBQUcsSUFBSSxHQUFHLGlDQUFpQyxDQUFDLENBQUM7VUFDOUU7OztBQUdELGFBQUksUUFBUSxLQUFLLGFBQWEsRUFBRTtBQUM3QixnQkFBSSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsQ0FBQztVQUNyRDtPQUNIOztBQUVELFVBQUksTUFBTSxHQUFHLElBQUksU0FBUyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDMUMsVUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUM7QUFDMUIsYUFBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQzs7Ozs7Ozs7QUFTRixPQUFJLFlBQVksR0FBRyxTQUFmLFlBQVksQ0FBYSxJQUFJLEVBQUU7QUFDaEMsVUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxFQUFFO0FBQ3hCLGFBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO09BQzVDO0FBQ0QsVUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUN0QyxhQUFPLEFBQUMsU0FBUyxHQUFHLENBQUMsR0FBSSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDN0QsQ0FBQzs7Ozs7Ozs7QUFRRixPQUFJLFNBQVMsR0FBRyxTQUFaLFNBQVMsQ0FBYSxJQUFJLEVBQUU7O0FBRTdCLFVBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsRUFBRTtBQUN4QixhQUFJLElBQUksR0FBRyxDQUFDO09BQ2Q7OztBQUdELFVBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFO0FBQ3BCLGdCQUFPLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUMsR0FBRyxFQUFDLElBQUksRUFBQyxDQUFDLENBQUM7T0FDN0M7QUFDRCxhQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDMUIsQ0FBQzs7Ozs7Ozs7QUFRRixPQUFJLDRCQUE0QixHQUFHLFNBQS9CLDRCQUE0QixDQUFhLElBQUksRUFBRSxXQUFXLEVBQUU7QUFDN0QsVUFBSSxNQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMsZ0JBQWdCLEVBQUU7VUFBRSxPQUFPLENBQUM7OztBQUduRCxVQUFJLElBQUksQ0FBQyxLQUFLLFlBQVksS0FBSyxDQUFDLGdCQUFnQixFQUFFO0FBQy9DLGVBQU0sQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDO0FBQ3RELGVBQU0sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7O0FBRWhDLGFBQUksTUFBTSxDQUFDLGdCQUFnQixLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRTtBQUNwRCx1QkFBVyxHQUFHLEtBQUssQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDMUMsa0JBQU0sQ0FBQyxpQkFBaUIsR0FBRyxFQUFFLENBQUM7QUFDOUIsa0JBQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO1VBQ25CLE1BQU0sSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLGlCQUFpQixLQUFLLFdBQVcsQ0FBQyxLQUFLLEVBQUU7QUFDNUQsa0JBQU0sQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLG9CQUFvQixFQUFFLENBQUM7VUFDL0QsTUFBTTtBQUNKLG1CQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQzs7QUFFbEMsa0JBQU0sQ0FBQyxpQkFBaUIsR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1VBQ25IO09BQ0gsTUFBTTs7QUFFSixnQkFBTyxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUM5QixhQUFJLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFO0FBQ3ZELHVCQUFXLEdBQUcsS0FBSyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUMxQyxtQkFBTyxHQUFHLEVBQUUsQ0FBQztVQUNmO0FBQ0QsZUFBTSxDQUFDLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUM7QUFDekMsZUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQ25DLGVBQU0sQ0FBQyxpQkFBaUIsR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO09BQ25IOztBQUVELFlBQU0sQ0FBQyxjQUFjLEdBQUcsTUFBTSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQztBQUN4RCxZQUFNLENBQUMsaUJBQWlCLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQzs7QUFFN0MsYUFBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQzs7Ozs7Ozs7OztBQVVGLE9BQUksZ0JBQWdCLEdBQUcsU0FBbkIsZ0JBQWdCLENBQVksSUFBSSxFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLEVBQUU7QUFDbkUsVUFBSSxJQUFJLEdBQUcsZ0JBQWdCLENBQUMsaUJBQWlCO1VBQ3pDLGtCQUFrQixHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztVQUMvQyxPQUFPLEdBQUcsa0JBQWtCLEtBQUssSUFBSSxDQUFDLElBQUk7VUFDMUMsQ0FBQyxHQUFTLElBQUksQ0FBQyxPQUFPO1VBQ3RCLE9BQU87VUFDUCxPQUFPLENBQUM7Ozs7Ozs7QUFPWixhQUFPLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztBQUM1QixhQUFPLEdBQUcsT0FBTyxJQUFJLENBQUMsQ0FBQztBQUN2QixhQUFPLEdBQUcsT0FBTyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7QUFDeEMsYUFBTyxHQUFHLE9BQU8sSUFBSSxDQUFDLENBQUM7QUFDdkIsYUFBTyxHQUFHLE9BQU8sR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsQ0FBQzs7QUFFNUMsYUFBTyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEdBQUcsSUFBSSxDQUFDO0FBQ3RDLGFBQU8sR0FBRyxPQUFPLElBQUksQ0FBQyxDQUFDO0FBQ3ZCLGFBQU8sR0FBRyxPQUFPLEdBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLEFBQUMsQ0FBQztBQUM1QyxhQUFPLEdBQUcsT0FBTyxJQUFJLENBQUMsQ0FBQztBQUN2QixhQUFPLEdBQUcsT0FBTyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7O0FBR3JDLFVBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQzs7O0FBR2hCLFlBQU0sSUFBSSxVQUFVLENBQUM7OztBQUdyQixZQUFNLElBQUksT0FBTyxHQUFHLFVBQVUsR0FBRyxVQUFVLENBQUM7O0FBRTVDLFlBQU0sSUFBSSxnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQzs7QUFFN0MsWUFBTSxJQUFJLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7O0FBRS9CLFlBQU0sSUFBSSxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDOztBQUUvQixZQUFNLElBQUksUUFBUSxDQUFDLGdCQUFnQixDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQzs7QUFFOUMsWUFBTSxJQUFJLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUM7O0FBRXZELFlBQU0sSUFBSSxRQUFRLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLENBQUM7O0FBRXpELFlBQU0sSUFBSSxRQUFRLENBQUMsa0JBQWtCLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDOztBQUVqRCxZQUFNLElBQUksVUFBVSxDQUFDOztBQUdyQixVQUFJLFVBQVUsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLGlCQUFpQixHQUFHLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQzs7QUFFakYsVUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxtQkFBbUI7O0FBRW5ELGdCQUFVOztBQUVWLFlBQU07O0FBRU4sZ0JBQVU7O0FBRVYsZ0JBQVU7O0FBRVYsZ0JBQVU7O0FBRVQsVUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEtBQUcsSUFBSSxHQUFDLGtCQUFrQixHQUFDLGtCQUFrQixDQUFBLEFBQUM7O0FBRS9ELGNBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDOztBQUVuQix3QkFBa0IsQ0FBQzs7QUFHbkIsYUFBTztBQUNKLG1CQUFVLEVBQUcsVUFBVTtBQUN2QixrQkFBUyxFQUFHLFNBQVM7QUFDckIseUJBQWdCLEVBQUcsZ0JBQWdCO09BQ3JDLENBQUM7SUFDSixDQUFDOzs7Ozs7QUFNRixPQUFJLFlBQVksR0FBRyxTQUFmLFlBQVksR0FBZTtBQUM1QixVQUFJLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztJQUNqQixDQUFDO0FBQ0YsZUFBWSxDQUFDLFNBQVMsR0FBRzs7Ozs7QUFLdEIsWUFBTSxFQUFHLGdCQUFVLEtBQUssRUFBRTtBQUN2QixjQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQ2pELGFBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO09BQ3hCOzs7OztBQUtELGNBQVEsRUFBRyxvQkFBWTtBQUNwQixnQkFBTyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztPQUM1QjtJQUNILENBQUM7Ozs7OztBQU1GLE9BQUksZ0JBQWdCLEdBQUcsU0FBbkIsZ0JBQWdCLENBQWEsTUFBTSxFQUFFO0FBQ3RDLFVBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDbkMsVUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDakIsQ0FBQztBQUNGLG1CQUFnQixDQUFDLFNBQVMsR0FBRzs7Ozs7QUFLMUIsWUFBTSxFQUFHLGdCQUFVLEtBQUssRUFBRTtBQUN2QixhQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFOztBQUVyQixpQkFBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQztBQUNyRCxnQkFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNqQyxnQkFBSSxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDO1VBQzdCO09BQ0g7Ozs7O0FBS0QsY0FBUSxFQUFHLG9CQUFZO0FBQ3BCLGdCQUFPLElBQUksQ0FBQyxJQUFJLENBQUM7T0FDbkI7SUFDSCxDQUFDOzs7QUFHRixVQUFPOzs7Ozs7Ozs7QUFTSixVQUFJLEVBQUcsY0FBVSxNQUFNLEVBQUUsT0FBTyxFQUFFO0FBQy9CLGVBQU0sSUFBSSxLQUFLLENBQUMsa0VBQWtFLENBQUMsQ0FBQztPQUN0Rjs7Ozs7Ozs7O0FBU0QsWUFBTSxFQUFHLGdCQUFVLE1BQU0sRUFBRTtBQUN4QixhQUFJLE1BQU0sR0FBRyxFQUFFO2FBQUUsUUFBUTthQUFFLFlBQVk7YUFBRSxJQUFJO2FBQUUsU0FBUyxDQUFDO0FBQ3pELGNBQUssUUFBUSxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUU7QUFDMUIsZ0JBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsRUFBRztBQUFFLHdCQUFTO2FBQUU7QUFDekQsZ0JBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDOztBQUU1QixxQkFBUyxHQUFHLElBQUksU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFDdkUsd0JBQVksR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUNqRSxnQkFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLElBQUksQ0FBQyxJQUFJO0FBQ2pELGtCQUFNLENBQUMsWUFBWSxFQUFFLFNBQVMsQ0FBQyxFQUFFOztBQUNsQyxxQkFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQzthQUN6QjtVQUNIO0FBQ0QsZ0JBQU8sTUFBTSxDQUFDO09BQ2hCOzs7Ozs7Ozs7OztBQVdELFVBQUksRUFBRyxjQUFTLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFO0FBQzVCLGFBQUksU0FBUyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7QUFDekIsZ0JBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUU7QUFDN0IsbUJBQUksTUFBTSxHQUFHLElBQUksQ0FBQztBQUNsQixzQkFBTyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVMsWUFBWSxFQUFFLElBQUksRUFBRTtBQUM3Qyx5QkFBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7Z0JBQ3hELENBQUMsQ0FBQzthQUNMLE1BQU07O0FBQ0osc0JBQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLFlBQVksRUFBRSxJQUFJLEVBQUU7QUFDOUMseUJBQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsSUFBSSxZQUFZLEtBQUssSUFBSSxDQUFDO2dCQUNwRCxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUUsSUFBSSxDQUFDO2FBQ2Q7VUFDSCxNQUFNOztBQUNKLGdCQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksR0FBQyxJQUFJLENBQUM7QUFDdEIsbUJBQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7VUFDcEM7QUFDRCxnQkFBTyxJQUFJLENBQUM7T0FDZDs7Ozs7OztBQU9ELFlBQU0sRUFBRyxnQkFBUyxHQUFHLEVBQUU7QUFDcEIsYUFBSSxDQUFDLEdBQUcsRUFBRTtBQUNQLG1CQUFPLElBQUksQ0FBQztVQUNkOztBQUVELGFBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUU7QUFDNUIsbUJBQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFTLFlBQVksRUFBRSxJQUFJLEVBQUU7QUFDN0Msc0JBQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQzthQUNwRCxDQUFDLENBQUM7VUFDTDs7O0FBR0QsYUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksR0FBRyxHQUFHLENBQUM7QUFDM0IsYUFBSSxTQUFTLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7OztBQUczQyxhQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7QUFDdkIsWUFBRyxDQUFDLElBQUksR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDO0FBQzFCLGdCQUFPLEdBQUcsQ0FBQztPQUNiOzs7Ozs7O0FBT0QsWUFBTSxFQUFHLGdCQUFTLElBQUksRUFBRTtBQUNyQixhQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7QUFDeEIsYUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUM1QixhQUFJLENBQUMsSUFBSSxFQUFFOztBQUVSLGdCQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLEVBQUU7QUFDeEIsbUJBQUksSUFBSSxHQUFHLENBQUM7YUFDZDtBQUNELGdCQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztVQUMxQjs7QUFFRCxhQUFJLElBQUksRUFBRTtBQUNQLGdCQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUU7O0FBRXBCLHNCQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7YUFDMUIsTUFBTTs7QUFFSixtQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLFlBQVksRUFBRSxJQUFJLEVBQUU7QUFDbEQseUJBQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxJQUFJLENBQUM7Z0JBQ2xELENBQUMsQ0FBQztBQUNILG9CQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUNuQyx5QkFBTyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDbEM7YUFDSDtVQUNIOztBQUVELGdCQUFPLElBQUksQ0FBQztPQUNkOzs7Ozs7Ozs7O0FBVUQsY0FBUSxFQUFHLGtCQUFTLE9BQU8sRUFBRTtBQUMxQixnQkFBTyxHQUFHLE1BQU0sQ0FBQyxPQUFPLElBQUksRUFBRSxFQUFFO0FBQzdCLGtCQUFNLEVBQUcsSUFBSTtBQUNiLHVCQUFXLEVBQUcsT0FBTztBQUNyQixnQkFBSSxFQUFHLFFBQVE7VUFDakIsQ0FBQyxDQUFDOztBQUVILGNBQUssQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQzs7QUFFdkMsYUFBSSxPQUFPLEdBQUcsRUFBRTthQUFFLGNBQWMsR0FBRyxDQUFDO2FBQUUsZ0JBQWdCLEdBQUcsQ0FBQzthQUFFLE1BQU07YUFBRSxDQUFDLENBQUM7OztBQUl0RSxjQUFLLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUU7QUFDMUIsZ0JBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsRUFBRztBQUFFLHdCQUFTO2FBQUU7QUFDckQsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7O0FBRTVCLGdCQUFJLGVBQWUsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDLFdBQVcsRUFBRSxDQUFDO0FBQ3BGLGdCQUFJLFdBQVcsR0FBRyxLQUFLLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBQ3RELGdCQUFJLENBQUMsV0FBVyxFQUFFO0FBQ2YscUJBQU0sSUFBSSxLQUFLLENBQUMsZUFBZSxHQUFHLHNDQUFzQyxDQUFDLENBQUM7YUFDNUU7O0FBRUQsZ0JBQUksZ0JBQWdCLEdBQUcsNEJBQTRCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7O0FBRWxGLGdCQUFJLE9BQU8sR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFDeEYsMEJBQWMsSUFBSSxPQUFPLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxjQUFjLENBQUM7QUFDOUUsNEJBQWdCLElBQUksT0FBTyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFDN0MsbUJBQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7VUFDeEI7O0FBRUQsYUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDOzs7QUFHaEIsZUFBTSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMscUJBQXFCOztBQUU5QyxtQkFBVTs7QUFFVixtQkFBVTs7QUFFVixpQkFBUSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDOztBQUUzQixpQkFBUSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDOztBQUUzQixpQkFBUSxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQzs7QUFFN0IsaUJBQVEsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDOztBQUUzQixtQkFBVSxDQUFDOzs7O0FBS1gsaUJBQU8sT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUU7QUFDOUIsaUJBQUssWUFBWSxDQUFFO0FBQ25CLGlCQUFLLGFBQWEsQ0FBRTtBQUNwQixpQkFBSyxNQUFNLENBQUU7QUFDYixpQkFBSyxZQUFZO0FBQ2QscUJBQU0sR0FBRyxJQUFJLGdCQUFnQixDQUFDLGNBQWMsR0FBRyxnQkFBZ0IsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDakYscUJBQU07QUFBQTs7QUFHVDtBQUNHLHFCQUFNLEdBQUcsSUFBSSxZQUFZLENBQUMsY0FBYyxHQUFHLGdCQUFnQixHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUM3RSxxQkFBTTtBQUFBLFVBQ1g7O0FBRUQsY0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQ2xDLGtCQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUNyQyxrQkFBTSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsaUJBQWlCLENBQUMsQ0FBQztVQUMvRDtBQUNELGNBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUNsQyxrQkFBTSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7VUFDdEM7O0FBRUQsZUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQzs7QUFFdEIsYUFBSSxHQUFHLEdBQUcsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDOztBQUk1QixpQkFBTyxPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRTs7QUFFOUIsaUJBQUssWUFBWSxDQUFFO0FBQ25CLGlCQUFLLGFBQWEsQ0FBRTtBQUNwQixpQkFBSyxZQUFZO0FBQ2Qsc0JBQU8sS0FBSyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUFBLEFBQ25FLGlCQUFLLE1BQU07QUFDUixzQkFBTyxLQUFLLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLGFBQWEsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDOztBQUFBO0FBR3BGLGlCQUFLLFFBQVE7QUFDVixzQkFBTyxBQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDO0FBQUEsQUFDNUQ7O0FBQ0csc0JBQU8sR0FBRyxDQUFDO0FBQUEsVUFDaEI7T0FDSDs7Ozs7Ozs7QUFRRCxXQUFLLEVBQUcsU0FBUyxLQUFLLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRTtBQUNoQyxhQUFJLE9BQU8sS0FBSyxLQUFLLFdBQVcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUU7QUFDaEQsbUJBQU8sQ0FBQyxDQUFDO1VBQ1g7O0FBRUQsYUFBSSxPQUFPLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLEtBQUssUUFBUSxDQUFDOztBQUV4RCxhQUFJLEtBQUssR0FBRyxDQUNULFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM5QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzlDLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFDOUMsVUFBVSxFQUFF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QUFDLE1BQU0sS0FBRyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFBLEFBQUMsR0FBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLElBQUUsQ0FBQyxLQUFHLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxFQUFFLENBQUE7VUFBQyxDQUFDLElBQUksQ0FBQyxHQUFDLFdBQVcsS0FBRyxPQUFPLFVBQVUsSUFBRSxXQUFXLEtBQUcsT0FBTyxXQUFXLElBQUUsV0FBVyxLQUFHLE9BQU8sV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEVBQUM7QUFBQyxnQkFBSSxDQUFDLEtBQUssR0FBQyxRQUFRLEtBQUcsT0FBTyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFDLENBQUMsYUFBWSxDQUFDLEdBQUMsVUFBVSxHQUFDLEtBQUssQ0FBQSxBQUFDLEdBQUMsQ0FBQyxHQUFDLEtBQUssQ0FBQyxHQUFDLFVBQVUsR0FBQyxLQUFLLENBQUEsQ0FBRSxLQUFLLENBQUMsQ0FBQyxJQUFHLENBQUMsR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sSUFBRSxJQUFJLENBQUMsS0FBSyxFQUFDLE1BQU0sS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxJQUFFLElBQUksQ0FBQyxLQUFLLElBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFBO1VBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxFQUFDO0FBQUMsZ0JBQUksQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNO2dCQUFDLENBQUM7Z0JBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNO2dCQUFDLENBQUMsR0FBQyxLQUFLLENBQUMsR0FBQyxVQUFVLEdBQUMsS0FBSyxDQUFBLENBQUUsQ0FBQyxJQUFFLENBQUMsQ0FBQyxDQUFDLElBQUcsQ0FBQyxFQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFJLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUE7VUFBQztBQUNyeUIsVUFBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUMsVUFBUyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQztBQUFDLGdCQUFJLENBQUMsR0FBQyxJQUFJLENBQUMsTUFBTTtnQkFBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLEtBQUs7Z0JBQUMsQ0FBQyxHQUFDLElBQUksQ0FBQyxDQUFDO2dCQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUFDLENBQUMsQ0FBQyxDQUFDLElBQUUsQ0FBQyxHQUFDLENBQUMsS0FBRyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsR0FBRyxDQUFDLElBQUUsRUFBRSxHQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUcsQ0FBQyxHQUFDLEdBQUcsQ0FBQyxJQUFFLEVBQUUsR0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFHLEVBQUUsR0FBQyxHQUFHLENBQUMsSUFBRSxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsS0FBRyxFQUFFLEdBQUMsR0FBRyxDQUFDLENBQUEsSUFBRyxFQUFFLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBRSxDQUFDLEdBQUMsQ0FBQyxDQUFBLEFBQUMsQ0FBQyxJQUFHLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLElBQUUsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLElBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSSxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsRUFBRSxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsSUFBRSxDQUFDLEdBQUMsQ0FBQyxJQUFFLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEtBQUcsRUFBRSxDQUFDLEtBQUcsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEtBQUcsQ0FBQyxDQUFDLE1BQU0sS0FBRyxDQUFDLEdBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFBLEFBQUMsQ0FBQSxBQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFDLENBQUMsQ0FBQTtVQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUMsWUFBVTtBQUFDLGdCQUFJLENBQUMsR0FBQyxJQUFJLENBQUMsTUFBTTtnQkFBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLEtBQUs7Z0JBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBRyxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBRSxDQUFBLEFBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxJQUFFLENBQUMsQ0FBQyxNQUFNLEdBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLENBQUEsQUFBQyxDQUFDLE9BQU8sQ0FBQyxDQUFBO1VBQUMsQ0FBQztBQUM3ZSxhQUFJLEVBQUUsR0FBQyxLQUFLLENBQUMsR0FBQyxVQUFVLEdBQUMsS0FBSyxDQUFBLENBQUUsR0FBRyxDQUFDO2FBQUMsQ0FBQyxDQUFDLEtBQUksQ0FBQyxHQUFDLENBQUMsRUFBQyxHQUFHLEdBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxFQUFDO0FBQUMsaUJBQUksSUFBSSxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsRUFBRSxHQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxLQUFHLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxNQUFJLENBQUMsRUFBQyxDQUFDLEtBQUcsQ0FBQyxFQUFDLENBQUMsSUFBRSxDQUFDLEdBQUMsQ0FBQyxFQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsSUFBRSxFQUFFLEdBQUMsR0FBRyxDQUFBLEtBQUksQ0FBQyxDQUFBO1VBQUMsSUFBSSxDQUFDLEdBQUMsRUFBRSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsRUFBQztBQUFDLGdCQUFJLENBQUMsTUFBTSxHQUFDLEtBQUssQ0FBQyxHQUFDLFdBQVcsR0FBQyxLQUFLLENBQUEsQ0FBRSxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUE7VUFBQyxFQUFFLENBQUMsU0FBUyxDQUFDLFNBQVMsR0FBQyxVQUFTLENBQUMsRUFBQztBQUFDLG1CQUFPLENBQUMsSUFBRSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUEsR0FBRSxDQUFDLEdBQUMsQ0FBQyxDQUFBLEFBQUMsQ0FBQTtVQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEdBQUMsVUFBUyxDQUFDLEVBQUMsQ0FBQyxFQUFDO0FBQUMsZ0JBQUksQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUMsR0FBQyxJQUFJLENBQUMsTUFBTTtnQkFBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFDLENBQUMsQ0FBQyxLQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsR0FBRSxLQUFHLENBQUMsR0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUEsRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxLQUFLLE1BQU0sT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFBO1VBQUMsQ0FBQztBQUNuZ0IsV0FBRSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEdBQUMsWUFBVTtBQUFDLGdCQUFJLENBQUM7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLE1BQU07Z0JBQUMsQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUksQ0FBQyxHQUFDLENBQUMsSUFBRztBQUFDLGdCQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsSUFBRyxDQUFDLElBQUUsSUFBSSxDQUFDLE1BQU0sRUFBQyxNQUFNLENBQUMsR0FBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLE1BQU0sSUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBRyxDQUFDLElBQUUsQ0FBQyxDQUFBLEFBQUMsQ0FBQyxJQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUssTUFBTSxDQUFDLEdBQUMsQ0FBQyxDQUFBO2FBQUMsT0FBTSxFQUFDLEtBQUssRUFBQyxDQUFDLEVBQUMsS0FBSyxFQUFDLENBQUMsRUFBQyxNQUFNLEVBQUMsSUFBSSxDQUFDLE1BQU0sRUFBQyxDQUFBO1VBQUMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDO0FBQUMsZ0JBQUksQ0FBQyxDQUFDLEdBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLEdBQUMsQ0FBQyxJQUFFLENBQUMsWUFBWSxLQUFLLEdBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsS0FBRyxDQUFDLENBQUMsSUFBSSxLQUFHLElBQUksQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQSxBQUFDLEVBQUMsUUFBUSxLQUFHLE9BQU8sQ0FBQyxDQUFDLGVBQWUsS0FBRyxJQUFJLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxlQUFlLENBQUEsQUFBQyxFQUFDLENBQUMsQ0FBQyxZQUFZLEtBQUcsSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLElBQUUsQ0FBQyxDQUFDLFlBQVksWUFBWSxLQUFLLEdBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxHQUFDLENBQUMsQ0FBQyxZQUFZLENBQUEsQUFBQyxFQUFDLFFBQVEsS0FBRyxPQUFPLENBQUMsQ0FBQyxXQUFXLEtBQUcsSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsV0FBVyxDQUFBLEFBQUMsQ0FBQSxBQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBRyxJQUFJLENBQUMsQ0FBQyxHQUFDLEtBQUssQ0FBQyxHQUFDLFVBQVUsR0FBQyxLQUFLLENBQUEsQ0FBRSxLQUFLLENBQUMsQ0FBQSxBQUFDLENBQUE7VUFBQyxJQUFJLEVBQUUsR0FBQyxDQUFDO2FBQUMsQ0FBQyxHQUFDLEVBQUU7YUFBQyxDQUFDLENBQUM7QUFDanZCLGNBQUksQ0FBQyxHQUFDLENBQUMsRUFBQyxHQUFHLEdBQUMsQ0FBQyxFQUFDLENBQUMsRUFBRSxFQUFDLFFBQU8sQ0FBQyxHQUFFLEtBQUssR0FBRyxJQUFFLENBQUM7QUFBQyxnQkFBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssR0FBRyxJQUFFLENBQUM7QUFBQyxnQkFBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBQyxHQUFHLEdBQUMsR0FBRyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLEdBQUcsSUFBRSxDQUFDO0FBQUMsZ0JBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUMsR0FBRyxHQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxHQUFHLElBQUUsQ0FBQztBQUFDLGdCQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFDLEdBQUcsR0FBQyxHQUFHLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNO0FBQVEscUJBQUssbUJBQW1CLEdBQUMsQ0FBQyxDQUFDLENBQUM7QUFDek4sV0FBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUMsWUFBVTtBQUFDLGdCQUFJLENBQUM7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUM7Z0JBQUMsQ0FBQyxHQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBTyxJQUFJLENBQUMsQ0FBQyxHQUFFLEtBQUssQ0FBQztBQUFDLG1CQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUksQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUMsQ0FBQyxHQUFDLENBQUMsR0FBRTtBQUFDLHNCQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxLQUFLLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUMsQ0FBQzt5QkFBQyxDQUFDLEdBQUMsQ0FBQyxLQUFHLENBQUM7eUJBQUMsQ0FBQyxHQUFDLENBQUM7eUJBQUMsQ0FBQyxHQUFDLENBQUM7eUJBQUMsQ0FBQyxHQUFDLENBQUM7eUJBQUMsQ0FBQyxHQUFDLENBQUM7eUJBQUMsQ0FBQyxHQUFDLENBQUM7eUJBQUMsQ0FBQyxHQUFDLElBQUksQ0FBQyxDQUFDO3lCQUFDLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUcsQ0FBQyxFQUFDO0FBQUMsNkJBQUksQ0FBQyxHQUFDLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUMsQ0FBQyxDQUFDLE1BQU0sSUFBRSxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sR0FBQyxDQUFDLEdBQUUsQ0FBQyxHQUFDLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxNQUFNLElBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUE7c0JBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxHQUFDLEtBQUssR0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUMsQ0FBQyxHQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLEtBQUcsQ0FBQyxHQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLEdBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsS0FBRyxDQUFDLEdBQUMsR0FBRyxDQUFDLElBQUcsQ0FBQyxFQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsSUFBRSxDQUFDLENBQUMsTUFBTSxFQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFJO0FBQUMseUJBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUM5ZixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUE7c0JBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUE7bUJBQUMsTUFBTSxLQUFLLENBQUM7QUFBQyxzQkFBSSxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFDLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsRUFBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBQyxFQUFFLENBQUMsSUFBSSxFQUFDLENBQUMsQ0FBQztzQkFBQyxDQUFDO3NCQUFDLEVBQUU7c0JBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxFQUFFLEdBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBQyxDQUFDLEdBQUMsRUFBRSxFQUFDLENBQUMsRUFBRSxFQUFDLEtBQUcsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLEdBQUcsR0FBQyxDQUFDLENBQUEsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUcsR0FBRyxLQUFHLENBQUMsRUFBQyxNQUFNLElBQUksQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxLQUFLLEVBQUU7QUFBQyxzQkFBSSxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFDLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsRUFBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO3NCQUFDLEVBQUU7c0JBQUMsQ0FBQztzQkFBQyxDQUFDO3NCQUFDLENBQUM7c0JBQUMsQ0FBQztzQkFBQyxFQUFFLEdBQUMsQ0FBQyxFQUFFLEVBQUMsRUFBRSxFQUFDLEVBQUUsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLEVBQUUsRUFBQyxDQUFDLEVBQUMsRUFBRSxFQUFDLENBQUMsRUFBQyxFQUFFLEVBQUMsQ0FBQyxFQUFDLEVBQUUsRUFBQyxDQUFDLEVBQUMsRUFBRSxFQUFDLENBQUMsRUFBQyxFQUFFLENBQUM7c0JBQUMsQ0FBQztzQkFBQyxFQUFFO3NCQUFDLENBQUM7c0JBQUMsRUFBRTtzQkFBQyxFQUFFO3NCQUFDLEVBQUUsR0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO3NCQUN2ZixFQUFFO3NCQUFDLENBQUM7c0JBQUMsRUFBRTtzQkFBQyxDQUFDO3NCQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsR0FBRyxFQUFDLEdBQUcsR0FBQyxDQUFDLElBQUUsQ0FBQyxLQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFFLEVBQUUsS0FBSSxDQUFDLEdBQUMsRUFBRSxFQUFDLENBQUMsR0FBQyxDQUFDLElBQUUsQ0FBQyxLQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLEdBQUMsQ0FBQztzQkFBQyxFQUFFLEdBQUMsQ0FBQztzQkFBQyxDQUFDLEdBQUMsS0FBSyxDQUFDLEdBQUMsV0FBVyxHQUFDLEtBQUssQ0FBQSxDQUFFLEVBQUUsR0FBQyxFQUFFLENBQUM7c0JBQUMsQ0FBQztzQkFBQyxDQUFDO3NCQUFDLENBQUM7c0JBQUMsQ0FBQztzQkFBQyxDQUFDLEdBQUMsS0FBSyxDQUFDLEdBQUMsV0FBVyxHQUFDLEtBQUssQ0FBQSxDQUFFLEdBQUcsQ0FBQztzQkFBQyxDQUFDO3NCQUFDLENBQUM7c0JBQUMsQ0FBQyxHQUFDLEtBQUssQ0FBQyxHQUFDLFVBQVUsR0FBQyxLQUFLLENBQUEsQ0FBRSxFQUFFLENBQUMsQ0FBQyxLQUFJLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxFQUFFLEVBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUksQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsRUFBRSxFQUFDLENBQUMsRUFBRSxFQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFHLENBQUMsQ0FBQyxFQUFDO0FBQUMsc0JBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUE7bUJBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsSUFBRSxDQUFDLEVBQUM7QUFBQywwQkFBSSxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxJQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLENBQUMsSUFBRyxDQUFDLEtBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLElBQUcsQ0FBQyxHQUFDLENBQUMsRUFBQyxPQUFLLENBQUMsR0FBQyxDQUFDLEVBQUUsR0FBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLEVBQ3JmLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssT0FBSyxDQUFDLEdBQUMsQ0FBQyxHQUFFLENBQUMsR0FBQyxHQUFHLEdBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLElBQUUsQ0FBQyxHQUFDLENBQUMsS0FBRyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQSxBQUFDLEVBQUMsRUFBRSxJQUFFLENBQUMsSUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQSxJQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLEVBQUUsRUFBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLEdBQUMsRUFBRSxFQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFBLEFBQUMsRUFBQyxDQUFDLElBQUUsQ0FBQyxDQUFDLEtBQUssS0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQSxFQUFDLE9BQUssQ0FBQyxHQUFDLENBQUMsRUFBRSxHQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLE9BQUssQ0FBQyxHQUFDLENBQUMsR0FBRSxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxJQUFFLENBQUMsR0FBQyxDQUFDLEtBQUcsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUEsQUFBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLEVBQUUsRUFBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFDLENBQUMsSUFBRSxDQUFDLENBQUE7bUJBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUMsRUFBRSxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFJLENBQUMsR0FBQyxDQUFDLEVBQUMsRUFBRSxHQUFDLENBQUMsRUFBQyxDQUFDLEVBQUUsRUFBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUksQ0FBQyxHQUFDLEVBQUUsRUFBQyxDQUFDLEdBQUMsQ0FBQyxJQUFFLENBQUMsS0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsR0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsR0FBRyxFQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxFQUFFLEdBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBQyxDQUFDLEdBQUMsRUFBRSxFQUFDLENBQUMsRUFBRSxFQUFDLEtBQUcsQ0FBQyxHQUN4ZixDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxFQUFDLEVBQUUsSUFBRSxDQUFDLENBQUEsRUFBQztBQUFDLHNCQUFDLEVBQUUsQ0FBQyxRQUFPLENBQUMsR0FBRSxLQUFLLEVBQUU7QUFBQyw2QkFBRSxHQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssRUFBRTtBQUFDLDZCQUFFLEdBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxFQUFFO0FBQUMsNkJBQUUsR0FBQyxDQUFDLENBQUMsTUFBTTtBQUFRLGlDQUFLLGdCQUFnQixHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLEVBQUUsRUFBQyxDQUFDLENBQUMsQ0FBQTttQkFBQyxJQUFJLEVBQUUsR0FBQyxDQUFDLEVBQUUsRUFBQyxDQUFDLENBQUM7c0JBQUMsRUFBRSxHQUFDLENBQUMsRUFBRSxFQUFDLENBQUMsQ0FBQztzQkFBQyxDQUFDO3NCQUFDLEVBQUU7c0JBQUMsQ0FBQztzQkFBQyxFQUFFO3NCQUFDLEVBQUU7c0JBQUMsRUFBRTtzQkFBQyxFQUFFO3NCQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxFQUFFLEdBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBQyxDQUFDLEdBQUMsRUFBRSxFQUFDLEVBQUUsQ0FBQyxFQUFDLEtBQUcsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEVBQUMsR0FBRyxHQUFDLENBQUMsQ0FBQSxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEVBQUMsRUFBRSxHQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBRyxHQUFHLEtBQUcsQ0FBQyxFQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNO0FBQVEsd0JBQUssMEJBQTBCLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUE7VUFBQyxDQUFDO0FBQzVlLGtCQUFTLEVBQUUsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDO0FBQUMsZ0JBQUksQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFBO1VBQUM7QUFDeEMsYUFBSSxFQUFFLEdBQUMsQ0FBQSxZQUFVO0FBQUMscUJBQVMsQ0FBQyxDQUFDLENBQUMsRUFBQztBQUFDLHVCQUFPLENBQUMsR0FBRSxLQUFLLENBQUMsS0FBRyxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBRyxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBRyxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBRyxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBRyxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBRyxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBRyxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsS0FBRyxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLEVBQUUsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsSUFBRSxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLEVBQUUsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsSUFBRSxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLEVBQUUsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsSUFBRSxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLEVBQUUsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsSUFBRSxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLEVBQUUsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsSUFBRSxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLEVBQUUsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsSUFBRSxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLEVBQUUsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsSUFBRSxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQUMsQ0FBQyxHQUFDLEVBQUUsRUFBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsSUFBRSxDQUFDO0FBQUMsNEJBQU0sQ0FBQyxHQUFHLEVBQzNmLENBQUMsR0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLElBQUUsQ0FBQztBQUFDLDRCQUFNLENBQUMsR0FBRyxFQUFDLENBQUMsR0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLElBQUUsQ0FBQztBQUFDLDRCQUFNLENBQUMsR0FBRyxFQUFDLENBQUMsR0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLElBQUUsQ0FBQztBQUFDLDRCQUFNLENBQUMsR0FBRyxFQUFDLENBQUMsR0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLElBQUUsQ0FBQztBQUFDLDRCQUFNLENBQUMsR0FBRyxFQUFDLENBQUMsR0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLElBQUUsQ0FBQztBQUFDLDRCQUFNLENBQUMsR0FBRyxFQUFDLENBQUMsR0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLElBQUUsQ0FBQztBQUFDLDRCQUFNLENBQUMsR0FBRyxFQUFDLENBQUMsR0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLElBQUUsQ0FBQztBQUFDLDRCQUFNLENBQUMsR0FBRyxFQUFDLENBQUMsR0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLElBQUUsQ0FBQztBQUFDLDRCQUFNLENBQUMsR0FBRyxFQUFDLENBQUMsR0FBQyxHQUFHLEVBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLElBQUUsQ0FBQztBQUFDLDRCQUFNLENBQUMsR0FBRyxFQUFDLENBQUMsR0FBQyxHQUFHLEVBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLElBQUUsQ0FBQztBQUFDLDRCQUFNLENBQUMsR0FBRyxFQUFDLENBQUMsR0FBQyxHQUFHLEVBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLElBQUUsQ0FBQztBQUFDLDRCQUFNLENBQUMsR0FBRyxFQUFDLENBQUMsR0FBQyxHQUFHLEVBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLElBQUUsQ0FBQztBQUFDLDRCQUFNLENBQUMsR0FBRyxFQUFDLENBQUMsR0FBQyxHQUFHLEVBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLEtBQUcsQ0FBQztBQUFDLDRCQUFNLENBQUMsR0FBRyxFQUFDLENBQUMsR0FBQyxHQUFHLEVBQUMsQ0FBQyxDQUFDLENBQUM7QUFBUSwyQkFBSyxrQkFBa0IsR0FBQyxDQUFDLENBQUMsQ0FBQzthQUFDLElBQUksQ0FBQyxHQUFDLEVBQUU7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxFQUFDLEdBQUcsSUFBRSxDQUFDLEVBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFFLEVBQUUsR0FDcGYsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFFLEVBQUUsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUE7VUFBQyxDQUFBLEVBQUU7YUFBQyxFQUFFLEdBQUMsQ0FBQyxHQUFDLElBQUksV0FBVyxDQUFDLEVBQUUsQ0FBQyxHQUFDLEVBQUUsQ0FBQztBQUN0RCxrQkFBUyxFQUFFLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQztBQUFDLHFCQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDO0FBQUMsbUJBQUksQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDO21CQUFDLENBQUMsR0FBQyxFQUFFO21CQUFDLENBQUMsR0FBQyxDQUFDO21CQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLEdBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsSUFBRSxFQUFFLEdBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsSUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBTyxDQUFDLEdBQUUsS0FBSyxDQUFDLEtBQUcsQ0FBQztBQUFDLHNCQUFDLEdBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxLQUFHLENBQUM7QUFBQyxzQkFBQyxHQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsS0FBRyxDQUFDO0FBQUMsc0JBQUMsR0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLEtBQUcsQ0FBQztBQUFDLHNCQUFDLEdBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFFLENBQUM7QUFBQyxzQkFBQyxHQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBRSxDQUFDO0FBQUMsc0JBQUMsR0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxFQUFFLElBQUUsQ0FBQztBQUFDLHNCQUFDLEdBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssRUFBRSxJQUFFLENBQUM7QUFBQyxzQkFBQyxHQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLEVBQUUsSUFBRSxDQUFDO0FBQUMsc0JBQUMsR0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsRUFBRSxFQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxFQUFFLElBQUUsQ0FBQztBQUFDLHNCQUFDLEdBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLEVBQUUsRUFBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssRUFBRSxJQUFFLENBQUM7QUFBQyxzQkFBQyxHQUFDLENBQUMsRUFBRSxFQUFDLENBQUMsR0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLEVBQUUsSUFBRSxDQUFDO0FBQUMsc0JBQUMsR0FBQyxDQUFDLEVBQUUsRUFBQyxDQUFDLEdBQUMsRUFBRSxFQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxFQUFFLElBQUUsQ0FBQztBQUFDLHNCQUFDLEdBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQyxHQUNyZixFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLEdBQUcsSUFBRSxDQUFDO0FBQUMsc0JBQUMsR0FBQyxDQUFDLEVBQUUsRUFBQyxDQUFDLEdBQUMsRUFBRSxFQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxHQUFHLElBQUUsQ0FBQztBQUFDLHNCQUFDLEdBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQyxHQUFDLEdBQUcsRUFBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssR0FBRyxJQUFFLENBQUM7QUFBQyxzQkFBQyxHQUFDLENBQUMsRUFBRSxFQUFDLENBQUMsR0FBQyxHQUFHLEVBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLEdBQUcsSUFBRSxDQUFDO0FBQUMsc0JBQUMsR0FBQyxDQUFDLEVBQUUsRUFBQyxDQUFDLEdBQUMsR0FBRyxFQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxHQUFHLElBQUUsQ0FBQztBQUFDLHNCQUFDLEdBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQyxHQUFDLEdBQUcsRUFBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssR0FBRyxJQUFFLENBQUM7QUFBQyxzQkFBQyxHQUFDLENBQUMsRUFBRSxFQUFDLENBQUMsR0FBQyxHQUFHLEVBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLElBQUksSUFBRSxDQUFDO0FBQUMsc0JBQUMsR0FBQyxDQUFDLEVBQUUsRUFBQyxDQUFDLEdBQUMsR0FBRyxFQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxJQUFJLElBQUUsQ0FBQztBQUFDLHNCQUFDLEdBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQyxHQUFDLElBQUksRUFBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssSUFBSSxJQUFFLENBQUM7QUFBQyxzQkFBQyxHQUFDLENBQUMsRUFBRSxFQUFDLENBQUMsR0FBQyxJQUFJLEVBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLElBQUksSUFBRSxDQUFDO0FBQUMsc0JBQUMsR0FBQyxDQUFDLEVBQUUsRUFBQyxDQUFDLEdBQUMsSUFBSSxFQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sS0FBSyxJQUFJLElBQUUsQ0FBQztBQUFDLHNCQUFDLEdBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQyxHQUFDLElBQUksRUFBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLEtBQUssSUFBSSxJQUFFLENBQUM7QUFBQyxzQkFBQyxHQUFDLENBQUMsRUFBRSxFQUFDLENBQUMsR0FBQyxJQUFJLEVBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxLQUFLLElBQUksSUFBRSxDQUFDO0FBQUMsc0JBQUMsR0FBQyxDQUFDLEVBQUUsRUFBQyxDQUFDLEdBQUMsSUFBSSxFQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sS0FBSyxLQUFLLElBQUUsQ0FBQztBQUFDLHNCQUFDLEdBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQyxHQUFDLElBQUksRUFBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLEtBQUssS0FBSyxJQUN4ZixDQUFDO0FBQUMsc0JBQUMsR0FBQyxDQUFDLEVBQUUsRUFBQyxDQUFDLEdBQUMsS0FBSyxFQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sS0FBSyxLQUFLLElBQUUsQ0FBQztBQUFDLHNCQUFDLEdBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQyxHQUFDLEtBQUssRUFBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLEtBQUssS0FBSyxJQUFFLENBQUM7QUFBQyxzQkFBQyxHQUFDLENBQUMsRUFBRSxFQUFDLENBQUMsR0FBQyxLQUFLLEVBQUMsRUFBRSxDQUFDLENBQUMsTUFBTTtBQUFRLDJCQUFLLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxLQUFJLENBQUMsR0FBQyxDQUFDLENBQUMsTUFBTSxFQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsRUFBRSxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsTUFBTSxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLElBQUksQ0FBQTthQUFDLElBQUksQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUM7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUMsR0FBQyxFQUFFO2dCQUFDLENBQUM7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsSUFBSSxXQUFXLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBQyxFQUFFO2dCQUFDLENBQUMsR0FBQyxDQUFDO2dCQUFDLENBQUMsR0FBQyxDQUFDO2dCQUFDLENBQUMsR0FBQyxLQUFLLENBQUMsR0FBQyxXQUFXLEdBQUMsS0FBSyxDQUFBLENBQUUsR0FBRyxDQUFDO2dCQUFDLENBQUMsR0FBQyxLQUFLLENBQUMsR0FBQyxXQUFXLEdBQUMsS0FBSyxDQUFBLENBQUUsRUFBRSxDQUFDO2dCQUFDLEVBQUUsR0FBQyxDQUFDLENBQUMsQ0FBQztnQkFBQyxDQUFDLENBQUMsSUFBRyxDQUFDLENBQUMsRUFBQztBQUFDLG9CQUFJLENBQUMsR0FBQyxDQUFDLEVBQUMsR0FBRyxJQUFFLENBQUMsR0FBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxFQUFDLEVBQUUsSUFBRSxDQUFDLEdBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUMsQ0FBQyxDQUFBO2FBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUksQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsRUFBQztBQUFDLGdCQUFDLEdBQ3BmLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLElBQUUsQ0FBQyxHQUFDLENBQUMsS0FBRyxDQUFDLEVBQUMsRUFBRSxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsSUFBRSxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUcsQ0FBQyxLQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxFQUFFLENBQUEsQUFBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBRyxFQUFFLENBQUMsR0FBQyxDQUFDLEVBQUUsQ0FBQSxBQUFDLEVBQUM7QUFBQyx5QkFBSyxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sSUFBRSxLQUFLLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsSUFBRyxDQUFDLEdBQUMsQ0FBQyxJQUFFLENBQUMsRUFBQztBQUFDLHNCQUFDLElBQUUsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFLO21CQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsTUFBTSxJQUFFLENBQUMsR0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUMsTUFBTSxJQUFFLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFBLEdBQUUsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUMsRUFBRSxHQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQSxHQUFFLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLElBQUUsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLEVBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUEsQUFBQyxDQUFBO2dCQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUE7YUFBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFBO1VBQUM7QUFDN1osa0JBQVMsRUFBRSxDQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDO0FBQUMsZ0JBQUksQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUMsR0FBQyxDQUFDO2dCQUFDLENBQUM7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUM7Z0JBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUMsT0FBSyxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsRUFBRSxFQUFDO0FBQUMsZ0JBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLElBQUcsQ0FBQyxHQUFDLENBQUMsRUFBQztBQUFDLHVCQUFJLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEVBQUUsRUFBQyxJQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxLQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxFQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUE7Z0JBQUMsT0FBSyxHQUFHLEdBQUMsQ0FBQyxJQUFFLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxJQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUcsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsR0FBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxLQUFHLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQSxBQUFDLENBQUMsSUFBRyxHQUFHLEtBQUcsQ0FBQyxFQUFDLE1BQUs7YUFBQyxPQUFPLElBQUksRUFBRSxDQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUE7VUFBQztBQUMzUCxrQkFBUyxFQUFFLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQztBQUFDLGdCQUFJLENBQUMsR0FBQyxDQUFDLENBQUMsTUFBTTtnQkFBQyxDQUFDLEdBQUMsSUFBSSxFQUFFLENBQUMsR0FBRyxDQUFDO2dCQUFDLENBQUMsR0FBQyxLQUFLLENBQUMsR0FBQyxVQUFVLEdBQUMsS0FBSyxDQUFBLENBQUUsQ0FBQyxDQUFDO2dCQUFDLENBQUM7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUM7Z0JBQUMsQ0FBQyxDQUFDLElBQUcsQ0FBQyxDQUFDLEVBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxLQUFJLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsS0FBSyxDQUFDLEdBQUMsV0FBVyxHQUFDLEtBQUssQ0FBQSxDQUFFLENBQUMsQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFDLENBQUMsSUFBRyxDQUFDLEtBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUksQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsRUFBRSxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUMsRUFBRSxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsTUFBTSxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFBO1VBQUM7QUFDdFksa0JBQVMsRUFBRSxDQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDO0FBQUMscUJBQVMsQ0FBQyxDQUFDLENBQUMsRUFBQztBQUFDLG1CQUFJLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFHLENBQUMsSUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUEsR0FBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTthQUFDLElBQUksQ0FBQyxHQUFDLEtBQUssQ0FBQyxHQUFDLFdBQVcsR0FBQyxLQUFLLENBQUEsQ0FBRSxDQUFDLENBQUM7Z0JBQUMsQ0FBQyxHQUFDLEtBQUssQ0FBQyxHQUFDLFVBQVUsR0FBQyxLQUFLLENBQUEsQ0FBRSxDQUFDLENBQUM7Z0JBQUMsQ0FBQyxHQUFDLEtBQUssQ0FBQyxHQUFDLFVBQVUsR0FBQyxLQUFLLENBQUEsQ0FBRSxDQUFDLENBQUM7Z0JBQUMsQ0FBQyxHQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQUMsQ0FBQyxHQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQUMsQ0FBQyxHQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxJQUFFLENBQUMsQ0FBQSxHQUFFLENBQUM7Z0JBQUMsQ0FBQyxHQUFDLENBQUMsSUFBRSxDQUFDLEdBQUMsQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUM7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxLQUFJLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLElBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLElBQUUsQ0FBQyxDQUFBLEFBQUMsRUFBQyxDQUFDLEtBQUcsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQSxHQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFJLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUEsQUFBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFJLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUksQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxHQUM1ZixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsRUFBRSxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUcsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUEsQUFBQyxDQUFDLEtBQUksQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxJQUFFLENBQUMsRUFBQyxFQUFFLENBQUMsRUFBQztBQUFDLGdCQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFJLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEVBQUUsRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLElBQUUsQ0FBQyxDQUFBLElBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxDQUFBLEFBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsS0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO2FBQUMsT0FBTyxDQUFDLENBQUE7VUFBQztBQUN4UCxrQkFBUyxFQUFFLENBQUMsQ0FBQyxFQUFDO0FBQUMsZ0JBQUksQ0FBQyxHQUFDLEtBQUssQ0FBQyxHQUFDLFdBQVcsR0FBQyxLQUFLLENBQUEsQ0FBRSxDQUFDLENBQUMsTUFBTSxDQUFDO2dCQUFDLENBQUMsR0FBQyxFQUFFO2dCQUFDLENBQUMsR0FBQyxFQUFFO2dCQUFDLENBQUMsR0FBQyxDQUFDO2dCQUFDLENBQUM7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUksQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEVBQUUsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFBLEdBQUUsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsRUFBRSxFQUFDLENBQUMsSUFBRSxDQUFDLEVBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLElBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEtBQUcsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsRUFBRSxFQUFDO0FBQUMsZ0JBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxLQUFJLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEVBQUUsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFFLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsTUFBSSxDQUFDLENBQUE7YUFBQyxPQUFPLENBQUMsQ0FBQTtVQUFDLENBQUMsRUFBRSxDQUFDLGlCQUFpQixFQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxvQ0FBb0MsRUFBQyxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxHQUFDLEVBQUMsSUFBSSxFQUFDLENBQUMsRUFBQyxLQUFLLEVBQUMsQ0FBQyxFQUFDLE9BQU8sRUFBQyxFQUFFLEVBQUM7YUFBQyxDQUFDO2FBQUMsRUFBRTthQUFDLENBQUM7YUFBQyxFQUFFLENBQUMsSUFBRyxNQUFNLENBQUMsSUFBSSxFQUFDLENBQUMsR0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSSxFQUFFLEtBQUksQ0FBQyxHQUFDLEVBQUUsRUFBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQSxFQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUksRUFBRSxHQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUMsQ0FBQyxHQUFDLEVBQUUsRUFBQyxF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QUFDO2dCQUFDLENBQUM7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUM7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUMsQ0FBQyxLQUFJLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxLQUFHLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUEsQUFBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLEtBQUcsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxBQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsSUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFDLEtBQUssQ0FBQyxHQUFDLFdBQVcsR0FBQyxLQUFLLENBQUEsQ0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsSUFBRSxDQUFDLEdBQUU7QUFBQyxvQkFBSSxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsRUFBRSxDQUFDLEVBQUMsSUFBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUcsQ0FBQyxFQUFDO0FBQUMsbUJBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxLQUFJLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxJQUFFLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsS0FBRyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxJQUFFLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxJQUFFLEVBQUUsR0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7Z0JBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUcsQ0FBQyxDQUFBO2FBQUMsT0FBTSxDQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUE7VUFBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEVBQUM7QUFBQyxnQkFBSSxDQUFDLENBQUMsR0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFDLElBQUksQ0FBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBQyxDQUFDLEdBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFHLENBQUMsSUFBRSxFQUFFLENBQUMsR0FBQyxFQUFFLENBQUEsQUFBQyxFQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUcsSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSyxDQUFBLEFBQUMsRUFBQyxDQUFDLENBQUMsVUFBVSxLQUFHLElBQUksQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQSxBQUFDLEVBQUMsQ0FBQyxDQUFDLFVBQVUsS0FBRyxJQUFJLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxVQUFVLENBQUEsQUFBQyxFQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUcsSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsTUFBTSxDQUFBLEFBQUMsQ0FBQyxRQUFPLElBQUksQ0FBQyxDQUFDLEdBQUUsS0FBSyxDQUFDO0FBQUMsc0JBQUksQ0FBQyxDQUFDLEdBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUMsS0FBSyxDQUFDLEdBQUMsVUFBVSxHQUFDLEtBQUssQ0FBQSxDQUFFLEtBQUssR0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDO0FBQUMsc0JBQUksQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUMsS0FBSyxDQUFDLEdBQUMsVUFBVSxHQUFDLEtBQUssQ0FBQSxDQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNO0FBQVEsd0JBQU0sS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7QUFBQSxhQUM5dEM7VUFBQyxJQUFJLENBQUMsR0FBQyxDQUFDO2FBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQztBQUNkLFVBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxHQUFDLFlBQVU7QUFBQyxtQkFBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUU7QUFBQyxtQkFBSSxDQUFDLEdBQUMsQ0FBQyxDQUFDLElBQUksRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxLQUFHLElBQUksQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUEsQUFBQyxDQUFDLENBQUMsTUFBSSxDQUFDLENBQUMsUUFBTyxDQUFDLEdBQUUsS0FBSyxDQUFDO0FBQUMseUJBQUksQ0FBQyxHQUFDLElBQUksQ0FBQyxLQUFLO3lCQUFDLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQzt5QkFBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUM7eUJBQUMsQ0FBQyxHQUFDLElBQUksQ0FBQyxDQUFDO3lCQUFDLENBQUMsR0FBQyxDQUFDO3lCQUFDLENBQUMsR0FBQyxDQUFDO3lCQUFDLENBQUMsR0FBQyxDQUFDO3lCQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsTUFBTTt5QkFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUcsQ0FBQyxLQUFHLENBQUMsRUFBQyxNQUFNLEtBQUssQ0FBQyxxREFBcUQsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUcsQ0FBQyxLQUFHLENBQUMsRUFBQyxNQUFNLEtBQUssQ0FBQyxzREFBc0QsQ0FBQyxDQUFDLENBQUMsSUFBRSxDQUFDLElBQUUsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFHLENBQUMsS0FBRyxDQUFDLEVBQUMsTUFBTSxLQUFLLENBQUMsc0RBQXNELENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFHLENBQUMsS0FBRyxDQUFDLEVBQUMsTUFBTSxLQUFLLENBQUMsdURBQXVELENBQUMsQ0FBQyxDQUFDLElBQ2ppQixDQUFDLElBQUUsQ0FBQyxDQUFDLElBQUcsQ0FBQyxLQUFHLENBQUMsQ0FBQyxFQUFDLE1BQU0sS0FBSyxDQUFDLGtEQUFrRCxDQUFDLENBQUMsSUFBRyxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUMsTUFBTSxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxRQUFPLElBQUksQ0FBQyxDQUFDLEdBQUUsS0FBSyxDQUFDO0FBQUMsa0NBQUssQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsTUFBTSxHQUFFO0FBQUMsK0JBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsSUFBRSxDQUFDLENBQUMsSUFBRyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxJQUFFLENBQUMsRUFBQyxDQUFDLElBQUUsQ0FBQyxDQUFDLEtBQUssT0FBSyxDQUFDLEVBQUUsR0FBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBOzRCQUFDLE1BQU0sS0FBSyxDQUFDO0FBQUMsa0NBQUssQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsTUFBTSxHQUFFLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsTUFBTTtBQUFRLGlDQUFNLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsSUFBRyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxJQUFFLENBQUMsRUFBQyxDQUFDLElBQUUsQ0FBQyxDQUFDLEtBQUssT0FBSyxDQUFDLEVBQUUsR0FBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQztBQUFDLHlCQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDeGYsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUM7QUFBQyxzQkFBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU07QUFBUSwyQkFBTSxLQUFLLENBQUMsaUJBQWlCLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUFDLE9BQU8sSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFBO1VBQUMsQ0FBQztBQUMxRixhQUFJLENBQUMsR0FBQyxDQUFDLEVBQUUsRUFBQyxFQUFFLEVBQUMsRUFBRSxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsRUFBRSxFQUFDLENBQUMsRUFBQyxFQUFFLEVBQUMsQ0FBQyxFQUFDLEVBQUUsRUFBQyxDQUFDLEVBQUMsRUFBRSxFQUFDLENBQUMsRUFBQyxFQUFFLEVBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQzthQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsSUFBSSxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQzthQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxFQUFFLEVBQUMsRUFBRSxFQUFDLEVBQUUsRUFBQyxFQUFFLEVBQUMsRUFBRSxFQUFDLEVBQUUsRUFBQyxFQUFFLEVBQUMsRUFBRSxFQUFDLEVBQUUsRUFBQyxFQUFFLEVBQUMsRUFBRSxFQUFDLEVBQUUsRUFBQyxFQUFFLEVBQUMsRUFBRSxFQUFDLEVBQUUsRUFBQyxFQUFFLEVBQUMsR0FBRyxFQUFDLEdBQUcsRUFBQyxHQUFHLEVBQUMsR0FBRyxFQUFDLEdBQUcsRUFBQyxHQUFHLEVBQUMsR0FBRyxFQUFDLEdBQUcsQ0FBQzthQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsSUFBSSxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQzthQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQzthQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQzthQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxFQUFFLEVBQUMsRUFBRSxFQUFDLEVBQUUsRUFBQyxFQUFFLEVBQUMsRUFBRSxFQUFDLEVBQUUsRUFBQyxFQUFFLEVBQUMsR0FBRyxFQUFDLEdBQUcsRUFBQyxHQUFHLEVBQUMsR0FBRyxFQUFDLEdBQUcsRUFBQyxHQUFHLEVBQUMsSUFBSSxFQUFDLElBQUksRUFBQyxJQUFJLEVBQUMsSUFBSSxFQUFDLElBQUksRUFBQyxJQUFJLEVBQUMsSUFBSSxFQUFDLEtBQUssRUFBQyxLQUFLLEVBQUMsS0FBSyxDQUFDO2FBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxJQUFJLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDO2FBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLEVBQUUsRUFBQyxFQUFFLEVBQUMsRUFBRSxFQUFDLEVBQUUsRUFBQyxFQUFFLEVBQUMsRUFBRSxFQUFDLEVBQUUsRUFDcmYsRUFBRSxDQUFDO2FBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDO2FBQUMsQ0FBQyxHQUFDLEtBQUssQ0FBQyxHQUFDLFVBQVUsR0FBQyxLQUFLLENBQUEsQ0FBRSxHQUFHLENBQUM7YUFBQyxDQUFDO2FBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxHQUFHLElBQUUsQ0FBQyxHQUFDLENBQUMsR0FBQyxHQUFHLElBQUUsQ0FBQyxHQUFDLENBQUMsR0FBQyxHQUFHLElBQUUsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUFDLENBQUMsR0FBQyxLQUFLLENBQUMsR0FBQyxVQUFVLEdBQUMsS0FBSyxDQUFBLENBQUUsRUFBRSxDQUFDO2FBQUMsQ0FBQzthQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUksQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDO0FBQUMsaUJBQUksSUFBSSxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUssRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsR0FBRTtBQUFDLGdCQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBRyxDQUFDLEtBQUcsQ0FBQyxFQUFDLE1BQU0sS0FBSyxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxJQUFFLENBQUMsSUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFFLENBQUMsQ0FBQTthQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLElBQUUsQ0FBQyxDQUFBLEdBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxLQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUE7VUFBQztBQUN2WSxrQkFBUyxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQztBQUFDLGlCQUFJLElBQUksQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLEdBQUU7QUFBQyxnQkFBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUcsQ0FBQyxLQUFHLENBQUMsRUFBQyxNQUFNLENBQUMsSUFBRSxDQUFDLElBQUUsQ0FBQyxDQUFDLENBQUMsSUFBRSxDQUFDLENBQUE7YUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsSUFBRSxDQUFDLENBQUEsR0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxLQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsSUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFDLEtBQUssQ0FBQTtVQUFDO0FBQ2xMLGtCQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUM7QUFBQyxxQkFBUyxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUM7QUFBQyxtQkFBSSxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxDQUFDLEdBQUUsU0FBTyxDQUFDLEdBQUMsQ0FBQyxDQUFDLElBQUksRUFBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUEsR0FBRSxLQUFLLEVBQUU7QUFBQywwQkFBSSxDQUFDLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFFLEdBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxFQUFFO0FBQUMsMEJBQUksQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsSUFBSSxFQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBRSxHQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxFQUFFO0FBQUMsMEJBQUksQ0FBQyxHQUFDLEVBQUUsR0FBQyxDQUFDLENBQUMsSUFBSSxFQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBRSxHQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU07QUFBUSxzQkFBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsQ0FBQSxDQUFDLE9BQU8sQ0FBQyxDQUFBO2FBQUMsSUFBSSxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsR0FBQyxHQUFHO2dCQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxHQUFDLENBQUM7Z0JBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQztnQkFBQyxDQUFDLEdBQUMsS0FBSyxDQUFDLEdBQUMsVUFBVSxHQUFDLEtBQUssQ0FBQSxDQUFFLENBQUMsQ0FBQyxNQUFNLENBQUM7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUM7Z0JBQUMsQ0FBQyxDQUFDLEtBQUksQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLEtBQUssQ0FBQyxHQUFDLFVBQVUsR0FBQyxLQUFLLENBQUEsQ0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsS0FBSyxDQUFDLEdBQUMsVUFBVSxHQUFDLEtBQUssQ0FBQSxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7VUFBQztBQUMvZCxVQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsR0FBQyxVQUFTLENBQUMsRUFBQyxDQUFDLEVBQUM7QUFBQyxnQkFBSSxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQUMsQ0FBQyxHQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxJQUFJLENBQUMsR0FBQyxDQUFDLENBQUMsTUFBTSxHQUFDLEdBQUcsRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsR0FBRyxNQUFJLENBQUMsR0FBQyxDQUFDLENBQUMsSUFBSSxFQUFDLENBQUMsQ0FBQyxDQUFBLEFBQUMsR0FBRSxJQUFHLEdBQUcsR0FBQyxDQUFDLEVBQUMsQ0FBQyxJQUFFLENBQUMsS0FBRyxJQUFJLENBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxFQUFDLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBLEFBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSTtBQUFDLGdCQUFDLEdBQUMsQ0FBQyxHQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUcsQ0FBQyxJQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUEsQUFBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsSUFBSSxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBRyxDQUFDLElBQUUsQ0FBQyxDQUFDLElBQUksRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxBQUFDLENBQUMsQ0FBQyxJQUFFLENBQUMsS0FBRyxJQUFJLENBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxFQUFDLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBLEFBQUMsQ0FBQyxPQUFLLENBQUMsRUFBRSxHQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUMsQ0FBQyxDQUFDLENBQUE7YUFBQyxPQUFLLENBQUMsSUFBRSxJQUFJLENBQUMsQ0FBQyxHQUFFLElBQUksQ0FBQyxDQUFDLElBQUUsQ0FBQyxFQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQTtVQUFDLENBQUM7QUFDM1csVUFBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUMsVUFBUyxDQUFDLEVBQUMsQ0FBQyxFQUFDO0FBQUMsZ0JBQUksQ0FBQyxHQUFDLElBQUksQ0FBQyxDQUFDO2dCQUFDLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUksSUFBSSxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBQyxDQUFDLEVBQUMsQ0FBQyxFQUFDLENBQUMsRUFBQyxDQUFDLEVBQUMsR0FBRyxNQUFJLENBQUMsR0FBQyxDQUFDLENBQUMsSUFBSSxFQUFDLENBQUMsQ0FBQyxDQUFBLEFBQUMsR0FBRSxJQUFHLEdBQUcsR0FBQyxDQUFDLEVBQUMsQ0FBQyxJQUFFLENBQUMsS0FBRyxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxFQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsTUFBTSxDQUFBLEFBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSTtBQUFDLGdCQUFDLEdBQUMsQ0FBQyxHQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUcsQ0FBQyxJQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUEsQUFBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsSUFBSSxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBRyxDQUFDLElBQUUsQ0FBQyxDQUFDLElBQUksRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxBQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLEtBQUcsQ0FBQyxHQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsRUFBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQSxBQUFDLENBQUMsT0FBSyxDQUFDLEVBQUUsR0FBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFDLENBQUMsQ0FBQyxDQUFBO2FBQUMsT0FBSyxDQUFDLElBQUUsSUFBSSxDQUFDLENBQUMsR0FBRSxJQUFJLENBQUMsQ0FBQyxJQUFFLENBQUMsRUFBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUE7VUFBQyxDQUFDO0FBQzFWLFVBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxHQUFDLFlBQVU7QUFBQyxnQkFBSSxDQUFDLEdBQUMsS0FBSyxDQUFDLEdBQUMsVUFBVSxHQUFDLEtBQUssQ0FBQSxDQUFFLElBQUksQ0FBQyxDQUFDLEdBQUMsS0FBSyxDQUFDO2dCQUFDLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFDLEtBQUs7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUcsQ0FBQyxFQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSTtBQUFDLGdCQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUksQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxLQUFLLENBQUMsQ0FBQTthQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFHLENBQUMsRUFBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFDLENBQUMsR0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSSxDQUFDLEdBQUMsQ0FBQyxFQUFDLEtBQUssR0FBQyxDQUFDLEVBQUMsRUFBRSxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUE7VUFBQyxDQUFDO0FBQ3ZULFVBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxHQUFDLFVBQVMsQ0FBQyxFQUFDO0FBQUMsZ0JBQUksQ0FBQztnQkFBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUMsSUFBSSxDQUFDLENBQUMsR0FBQyxDQUFDLEdBQUMsQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUM7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLEtBQUs7Z0JBQUMsQ0FBQyxHQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFHLFFBQVEsS0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLEtBQUcsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUEsQUFBQyxFQUFDLFFBQVEsS0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLEtBQUcsQ0FBQyxJQUFFLENBQUMsQ0FBQyxDQUFDLENBQUEsQUFBQyxDQUFBLEFBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxJQUFFLENBQUMsR0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQSxHQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLEdBQUcsSUFBRSxDQUFDLEdBQUMsQ0FBQyxDQUFBLEFBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLElBQUUsQ0FBQyxDQUFBLEdBQUUsQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFDLENBQUMsSUFBRSxDQUFDLEdBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQSxHQUFFLENBQUMsR0FBQyxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsQ0FBQyxHQUFDLENBQUMsQ0FBQTtVQUFDLENBQUM7QUFDeFQsVUFBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUMsWUFBVTtBQUFDLGdCQUFJLENBQUMsR0FBQyxDQUFDO2dCQUFDLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQztnQkFBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDLEdBQUMsS0FBSyxDQUFDLEdBQUMsVUFBVSxHQUFDLEtBQUssQ0FBQSxDQUFFLElBQUksQ0FBQyxDQUFDLElBQUUsSUFBSSxDQUFDLENBQUMsR0FBQyxLQUFLLENBQUEsQUFBQyxDQUFDO2dCQUFDLENBQUM7Z0JBQUMsQ0FBQztnQkFBQyxDQUFDO2dCQUFDLENBQUMsQ0FBQyxJQUFHLENBQUMsS0FBRyxDQUFDLENBQUMsTUFBTSxFQUFDLE9BQU8sQ0FBQyxHQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEtBQUksQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxFQUFFLENBQUMsRUFBQztBQUFDLGdCQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLEdBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTthQUFDLENBQUMsR0FBQyxLQUFLLENBQUMsS0FBSSxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsRUFBQyxDQUFDLEdBQUMsQ0FBQyxFQUFDLEVBQUUsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFDLEVBQUUsQ0FBQyxPQUFPLElBQUksQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFBO1VBQUMsQ0FBQztBQUNwVixVQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsR0FBQyxZQUFVO0FBQUMsZ0JBQUksQ0FBQztnQkFBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUMsSUFBSSxDQUFDLENBQUMsSUFBRSxDQUFDLEdBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxHQUFFLENBQUMsR0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLElBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUMsQ0FBQyxLQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FB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SSxPQUFPLE9BQU8sS0FBSyxXQUFXLEVBQUUsT0FBTyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMiLCJmaWxlIjoianN6aXAuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcblxuSlNaaXAgLSBBIEphdmFzY3JpcHQgY2xhc3MgZm9yIGdlbmVyYXRpbmcgYW5kIHJlYWRpbmcgemlwIGZpbGVzXG48aHR0cDovL3N0dWFydGsuY29tL2pzemlwPlxuXG4oYykgMjAwOS0yMDEyIFN0dWFydCBLbmlnaHRsZXkgPHN0dWFydCBbYXRdIHN0dWFydGsuY29tPlxuRHVhbCBsaWNlbmNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2Ugb3IgR1BMdjMuIFNlZSBMSUNFTlNFLm1hcmtkb3duLlxuXG5Vc2FnZTpcbiAgIHppcCA9IG5ldyBKU1ppcCgpO1xuICAgemlwLmZpbGUoXCJoZWxsby50eHRcIiwgXCJIZWxsbywgV29ybGQhXCIpLmZpbGUoXCJ0ZW1wZmlsZVwiLCBcIm5vdGhpbmdcIik7XG4gICB6aXAuZm9sZGVyKFwiaW1hZ2VzXCIpLmZpbGUoXCJzbWlsZS5naWZcIiwgYmFzZTY0RGF0YSwge2Jhc2U2NDogdHJ1ZX0pO1xuICAgemlwLmZpbGUoXCJYbWFzLnR4dFwiLCBcIkhvIGhvIGhvICFcIiwge2RhdGUgOiBuZXcgRGF0ZShcIkRlY2VtYmVyIDI1LCAyMDA3IDAwOjAwOjAxXCIpfSk7XG4gICB6aXAucmVtb3ZlKFwidGVtcGZpbGVcIik7XG5cbiAgIGJhc2U2NHppcCA9IHppcC5nZW5lcmF0ZSgpO1xuXG4qKi9cbi8vIFdlIHVzZSBzdHJpY3QsIGJ1dCBpdCBzaG91bGQgbm90IGJlIHBsYWNlZCBvdXRzaWRlIG9mIGEgZnVuY3Rpb24gYmVjYXVzZVxuLy8gdGhlIGVudmlyb25tZW50IGlzIHNoYXJlZCBpbnNpZGUgdGhlIGJyb3dzZXIuXG4vLyBcInVzZSBzdHJpY3RcIjtcblxuLyoqXG4gKiBSZXByZXNlbnRhdGlvbiBhIG9mIHppcCBmaWxlIGluIGpzXG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7U3RyaW5nPXxBcnJheUJ1ZmZlcj18VWludDhBcnJheT18QnVmZmVyPX0gZGF0YSB0aGUgZGF0YSB0byBsb2FkLCBpZiBhbnkgKG9wdGlvbmFsKS5cbiAqIEBwYXJhbSB7T2JqZWN0PX0gb3B0aW9ucyB0aGUgb3B0aW9ucyBmb3IgY3JlYXRpbmcgdGhpcyBvYmplY3RzIChvcHRpb25hbCkuXG4gKi9cbnZhciBKU1ppcCA9IGZ1bmN0aW9uKGRhdGEsIG9wdGlvbnMpIHtcbiAgIC8vIG9iamVjdCBjb250YWluaW5nIHRoZSBmaWxlcyA6XG4gICAvLyB7XG4gICAvLyAgIFwiZm9sZGVyL1wiIDogey4uLn0sXG4gICAvLyAgIFwiZm9sZGVyL2RhdGEudHh0XCIgOiB7Li4ufVxuICAgLy8gfVxuICAgdGhpcy5maWxlcyA9IHt9O1xuXG4gICAvLyBXaGVyZSB3ZSBhcmUgaW4gdGhlIGhpZXJhcmNoeVxuICAgdGhpcy5yb290ID0gXCJcIjtcblxuICAgaWYgKGRhdGEpIHtcbiAgICAgIHRoaXMubG9hZChkYXRhLCBvcHRpb25zKTtcbiAgIH1cbn07XG5cbkpTWmlwLnNpZ25hdHVyZSA9IHtcbiAgIExPQ0FMX0ZJTEVfSEVBREVSOiBcIlxceDUwXFx4NGJcXHgwM1xceDA0XCIsXG4gICBDRU5UUkFMX0ZJTEVfSEVBREVSOiBcIlxceDUwXFx4NGJcXHgwMVxceDAyXCIsXG4gICBDRU5UUkFMX0RJUkVDVE9SWV9FTkQ6IFwiXFx4NTBcXHg0YlxceDA1XFx4MDZcIixcbiAgIFpJUDY0X0NFTlRSQUxfRElSRUNUT1JZX0xPQ0FUT1I6IFwiXFx4NTBcXHg0YlxceDA2XFx4MDdcIixcbiAgIFpJUDY0X0NFTlRSQUxfRElSRUNUT1JZX0VORDogXCJcXHg1MFxceDRiXFx4MDZcXHgwNlwiLFxuICAgREFUQV9ERVNDUklQVE9SOiBcIlxceDUwXFx4NGJcXHgwN1xceDA4XCJcbn07XG5cbi8vIERlZmF1bHQgcHJvcGVydGllcyBmb3IgYSBuZXcgZmlsZVxuSlNaaXAuZGVmYXVsdHMgPSB7XG4gICBiYXNlNjQ6IGZhbHNlLFxuICAgYmluYXJ5OiBmYWxzZSxcbiAgIGRpcjogZmFsc2UsXG4gICBkYXRlOiBudWxsLFxuICAgY29tcHJlc3Npb246IG51bGxcbn07XG5cbi8qXG4gKiBMaXN0IGZlYXR1cmVzIHRoYXQgcmVxdWlyZSBhIG1vZGVybiBicm93c2VyLCBhbmQgaWYgdGhlIGN1cnJlbnQgYnJvd3NlciBzdXBwb3J0IHRoZW0uXG4gKi9cbkpTWmlwLnN1cHBvcnQgPSB7XG4gICAvLyBjb250YWlucyB0cnVlIGlmIEpTWmlwIGNhbiByZWFkL2dlbmVyYXRlIEFycmF5QnVmZmVyLCBmYWxzZSBvdGhlcndpc2UuXG4gICBhcnJheWJ1ZmZlciA6IChmdW5jdGlvbigpe1xuICAgICAgcmV0dXJuIHR5cGVvZiBBcnJheUJ1ZmZlciAhPT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgVWludDhBcnJheSAhPT0gXCJ1bmRlZmluZWRcIjtcbiAgIH0pKCksXG4gICAvLyBjb250YWlucyB0cnVlIGlmIEpTWmlwIGNhbiByZWFkL2dlbmVyYXRlIG5vZGVqcyBCdWZmZXIsIGZhbHNlIG90aGVyd2lzZS5cbiAgIG5vZGVidWZmZXIgOiAoZnVuY3Rpb24oKXtcbiAgICAgIHJldHVybiB0eXBlb2YgQnVmZmVyICE9PSBcInVuZGVmaW5lZFwiO1xuICAgfSkoKSxcbiAgIC8vIGNvbnRhaW5zIHRydWUgaWYgSlNaaXAgY2FuIHJlYWQvZ2VuZXJhdGUgVWludDhBcnJheSwgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgdWludDhhcnJheSA6IChmdW5jdGlvbigpe1xuICAgICAgcmV0dXJuIHR5cGVvZiBVaW50OEFycmF5ICE9PSBcInVuZGVmaW5lZFwiO1xuICAgfSkoKSxcbiAgIC8vIGNvbnRhaW5zIHRydWUgaWYgSlNaaXAgY2FuIHJlYWQvZ2VuZXJhdGUgQmxvYiwgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgYmxvYiA6IChmdW5jdGlvbigpe1xuICAgICAgLy8gdGhlIHNwZWMgc3RhcnRlZCB3aXRoIEJsb2JCdWlsZGVyIHRoZW4gcmVwbGFjZWQgaXQgd2l0aCBhIGNvbnN0cnV0b3IgZm9yIEJsb2IuXG4gICAgICAvLyBSZXN1bHQgOiB3ZSBoYXZlIGJyb3dzZXJzIHRoYXQgOlxuICAgICAgLy8gKiBrbm93IHRoZSBCbG9iQnVpbGRlciAoYnV0IHdpdGggcHJlZml4KVxuICAgICAgLy8gKiBrbm93IHRoZSBCbG9iIGNvbnN0cnVjdG9yXG4gICAgICAvLyAqIGtub3cgYWJvdXQgQmxvYiBidXQgbm90IGFib3V0IGhvdyB0byBidWlsZCB0aGVtXG4gICAgICAvLyBBYm91dCB0aGUgXCI9PT0gMFwiIHRlc3QgOiBpZiBnaXZlbiB0aGUgd3JvbmcgdHlwZSwgaXQgbWF5IGJlIGNvbnZlcnRlZCB0byBhIHN0cmluZy5cbiAgICAgIC8vIEluc3RlYWQgb2YgYW4gZW1wdHkgY29udGVudCwgd2Ugd2lsbCBnZXQgXCJbb2JqZWN0IFVpbnQ4QXJyYXldXCIgZm9yIGV4YW1wbGUuXG4gICAgICBpZiAodHlwZW9mIEFycmF5QnVmZmVyID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICB2YXIgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKDApO1xuICAgICAgdHJ5IHtcbiAgICAgICAgIHJldHVybiBuZXcgQmxvYihbYnVmZmVyXSwgeyB0eXBlOiBcImFwcGxpY2F0aW9uL3ppcFwiIH0pLnNpemUgPT09IDA7XG4gICAgICB9XG4gICAgICBjYXRjaChlKSB7fVxuXG4gICAgICB0cnkge1xuICAgICAgICAgdmFyIEJsb2JCdWlsZGVyID0gd2luZG93LkJsb2JCdWlsZGVyIHx8IHdpbmRvdy5XZWJLaXRCbG9iQnVpbGRlciB8fCB3aW5kb3cuTW96QmxvYkJ1aWxkZXIgfHwgd2luZG93Lk1TQmxvYkJ1aWxkZXI7XG4gICAgICAgICB2YXIgYnVpbGRlciA9IG5ldyBCbG9iQnVpbGRlcigpO1xuICAgICAgICAgYnVpbGRlci5hcHBlbmQoYnVmZmVyKTtcbiAgICAgICAgIHJldHVybiBidWlsZGVyLmdldEJsb2IoJ2FwcGxpY2F0aW9uL3ppcCcpLnNpemUgPT09IDA7XG4gICAgICB9XG4gICAgICBjYXRjaChlKSB7fVxuXG4gICAgICByZXR1cm4gZmFsc2U7XG4gICB9KSgpXG59O1xuXG5KU1ppcC5wcm90b3R5cGUgPSAoZnVuY3Rpb24gKCkge1xuICAgdmFyIHRleHRFbmNvZGVyLCB0ZXh0RGVjb2RlcjtcbiAgIGlmIChcbiAgICAgIEpTWmlwLnN1cHBvcnQudWludDhhcnJheSAmJlxuICAgICAgdHlwZW9mIFRleHRFbmNvZGVyID09PSBcImZ1bmN0aW9uXCIgJiZcbiAgICAgIHR5cGVvZiBUZXh0RGVjb2RlciA9PT0gXCJmdW5jdGlvblwiXG4gICApIHtcbiAgICAgIHRleHRFbmNvZGVyID0gbmV3IFRleHRFbmNvZGVyKFwidXRmLThcIik7XG4gICAgICB0ZXh0RGVjb2RlciA9IG5ldyBUZXh0RGVjb2RlcihcInV0Zi04XCIpO1xuICAgfVxuXG4gICAvKipcbiAgICAqIFJldHVybnMgdGhlIHJhdyBkYXRhIG9mIGEgWmlwT2JqZWN0LCBkZWNvbXByZXNzIHRoZSBjb250ZW50IGlmIG5lY2Vzc2FyeS5cbiAgICAqIEBwYXJhbSB7WmlwT2JqZWN0fSBmaWxlIHRoZSBmaWxlIHRvIHVzZS5cbiAgICAqIEByZXR1cm4ge1N0cmluZ3xBcnJheUJ1ZmZlcnxVaW50OEFycmF5fEJ1ZmZlcn0gdGhlIGRhdGEuXG4gICAgKi9cbiAgIHZhciBnZXRSYXdEYXRhID0gZnVuY3Rpb24gKGZpbGUpIHtcbiAgICAgIGlmIChmaWxlLl9kYXRhIGluc3RhbmNlb2YgSlNaaXAuQ29tcHJlc3NlZE9iamVjdCkge1xuICAgICAgICAgZmlsZS5fZGF0YSA9IGZpbGUuX2RhdGEuZ2V0Q29udGVudCgpO1xuICAgICAgICAgZmlsZS5vcHRpb25zLmJpbmFyeSA9IHRydWU7XG4gICAgICAgICBmaWxlLm9wdGlvbnMuYmFzZTY0ID0gZmFsc2U7XG5cbiAgICAgICAgIGlmIChKU1ppcC51dGlscy5nZXRUeXBlT2YoZmlsZS5fZGF0YSkgPT09IFwidWludDhhcnJheVwiKSB7XG4gICAgICAgICAgICB2YXIgY29weSA9IGZpbGUuX2RhdGE7XG4gICAgICAgICAgICAvLyB3aGVuIHJlYWRpbmcgYW4gYXJyYXlidWZmZXIsIHRoZSBDb21wcmVzc2VkT2JqZWN0IG1lY2hhbmlzbSB3aWxsIGtlZXAgaXQgYW5kIHN1YmFycmF5KCkgYSBVaW50OEFycmF5LlxuICAgICAgICAgICAgLy8gaWYgd2UgcmVxdWVzdCBhIGZpbGUgaW4gdGhlIHNhbWUgZm9ybWF0LCB3ZSBtaWdodCBnZXQgdGhlIHNhbWUgVWludDhBcnJheSBvciBpdHMgQXJyYXlCdWZmZXIgKHRoZSBvcmlnaW5hbCB6aXAgZmlsZSkuXG4gICAgICAgICAgICBmaWxlLl9kYXRhID0gbmV3IFVpbnQ4QXJyYXkoY29weS5sZW5ndGgpO1xuICAgICAgICAgICAgLy8gd2l0aCBhbiBlbXB0eSBVaW50OEFycmF5LCBPcGVyYSBmYWlscyB3aXRoIGEgXCJPZmZzZXQgbGFyZ2VyIHRoYW4gYXJyYXkgc2l6ZVwiXG4gICAgICAgICAgICBpZiAoY29weS5sZW5ndGggIT09IDApIHtcbiAgICAgICAgICAgICAgIGZpbGUuX2RhdGEuc2V0KGNvcHksIDApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGZpbGUuX2RhdGE7XG4gICB9O1xuXG4gICAvKipcbiAgICAqIFJldHVybnMgdGhlIGRhdGEgb2YgYSBaaXBPYmplY3QgaW4gYSBiaW5hcnkgZm9ybS4gSWYgdGhlIGNvbnRlbnQgaXMgYW4gdW5pY29kZSBzdHJpbmcsIGVuY29kZSBpdC5cbiAgICAqIEBwYXJhbSB7WmlwT2JqZWN0fSBmaWxlIHRoZSBmaWxlIHRvIHVzZS5cbiAgICAqIEByZXR1cm4ge1N0cmluZ3xBcnJheUJ1ZmZlcnxVaW50OEFycmF5fEJ1ZmZlcn0gdGhlIGRhdGEuXG4gICAgKi9cbiAgIHZhciBnZXRCaW5hcnlEYXRhID0gZnVuY3Rpb24gKGZpbGUpIHtcbiAgICAgIHZhciByZXN1bHQgPSBnZXRSYXdEYXRhKGZpbGUpLCB0eXBlID0gSlNaaXAudXRpbHMuZ2V0VHlwZU9mKHJlc3VsdCk7XG4gICAgICBpZiAodHlwZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgaWYgKCFmaWxlLm9wdGlvbnMuYmluYXJ5KSB7XG4gICAgICAgICAgICAvLyB1bmljb2RlIHRleHQgIVxuICAgICAgICAgICAgLy8gdW5pY29kZSBzdHJpbmcgPT4gYmluYXJ5IHN0cmluZyBpcyBhIHBhaW5mdWwgcHJvY2VzcywgY2hlY2sgaWYgd2UgY2FuIGF2b2lkIGl0LlxuICAgICAgICAgICAgaWYgKHRleHRFbmNvZGVyKSB7XG4gICAgICAgICAgICAgICByZXR1cm4gdGV4dEVuY29kZXIuZW5jb2RlKHJlc3VsdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoSlNaaXAuc3VwcG9ydC5ub2RlYnVmZmVyKSB7XG4gICAgICAgICAgICAgICByZXR1cm4gbmV3IEJ1ZmZlcihyZXN1bHQsIFwidXRmLThcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICB9XG4gICAgICAgICByZXR1cm4gZmlsZS5hc0JpbmFyeSgpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgIH07XG5cbiAgIC8qKlxuICAgICogVHJhbnNmb3JtIHRoaXMuX2RhdGEgaW50byBhIHN0cmluZy5cbiAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGZpbHRlciBhIGZ1bmN0aW9uIFN0cmluZyAtPiBTdHJpbmcsIGFwcGxpZWQgaWYgbm90IG51bGwgb24gdGhlIHJlc3VsdC5cbiAgICAqIEByZXR1cm4ge1N0cmluZ30gdGhlIHN0cmluZyByZXByZXNlbnRpbmcgdGhpcy5fZGF0YS5cbiAgICAqL1xuICAgdmFyIGRhdGFUb1N0cmluZyA9IGZ1bmN0aW9uIChhc1VURjgpIHtcbiAgICAgIHZhciByZXN1bHQgPSBnZXRSYXdEYXRhKHRoaXMpO1xuICAgICAgaWYgKHJlc3VsdCA9PT0gbnVsbCB8fCB0eXBlb2YgcmVzdWx0ID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgIH1cbiAgICAgIC8vIGlmIHRoZSBkYXRhIGlzIGEgYmFzZTY0IHN0cmluZywgd2UgZGVjb2RlIGl0IGJlZm9yZSBjaGVja2luZyB0aGUgZW5jb2RpbmcgIVxuICAgICAgaWYgKHRoaXMub3B0aW9ucy5iYXNlNjQpIHtcbiAgICAgICAgIHJlc3VsdCA9IEpTWmlwLmJhc2U2NC5kZWNvZGUocmVzdWx0KTtcbiAgICAgIH1cbiAgICAgIGlmIChhc1VURjggJiYgdGhpcy5vcHRpb25zLmJpbmFyeSkge1xuICAgICAgICAgLy8gSlNaaXAucHJvdG90eXBlLnV0ZjhkZWNvZGUgc3VwcG9ydHMgYXJyYXlzIGFzIGlucHV0XG4gICAgICAgICAvLyBza2lwIHRvIGFycmF5ID0+IHN0cmluZyBzdGVwLCB1dGY4ZGVjb2RlIHdpbGwgZG8gaXQuXG4gICAgICAgICByZXN1bHQgPSBKU1ppcC5wcm90b3R5cGUudXRmOGRlY29kZShyZXN1bHQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgIC8vIG5vIHV0ZjggdHJhbnNmb3JtYXRpb24sIGRvIHRoZSBhcnJheSA9PiBzdHJpbmcgc3RlcC5cbiAgICAgICAgIHJlc3VsdCA9IEpTWmlwLnV0aWxzLnRyYW5zZm9ybVRvKFwic3RyaW5nXCIsIHJlc3VsdCk7XG4gICAgICB9XG5cbiAgICAgIGlmICghYXNVVEY4ICYmICF0aGlzLm9wdGlvbnMuYmluYXJ5KSB7XG4gICAgICAgICByZXN1bHQgPSBKU1ppcC5wcm90b3R5cGUudXRmOGVuY29kZShyZXN1bHQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgIH07XG4gICAvKipcbiAgICAqIEEgc2ltcGxlIG9iamVjdCByZXByZXNlbnRpbmcgYSBmaWxlIGluIHRoZSB6aXAgZmlsZS5cbiAgICAqIEBjb25zdHJ1Y3RvclxuICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgdGhlIG5hbWUgb2YgdGhlIGZpbGVcbiAgICAqIEBwYXJhbSB7U3RyaW5nfEFycmF5QnVmZmVyfFVpbnQ4QXJyYXl8QnVmZmVyfSBkYXRhIHRoZSBkYXRhXG4gICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyB0aGUgb3B0aW9ucyBvZiB0aGUgZmlsZVxuICAgICovXG4gICB2YXIgWmlwT2JqZWN0ID0gZnVuY3Rpb24gKG5hbWUsIGRhdGEsIG9wdGlvbnMpIHtcbiAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgICB0aGlzLl9kYXRhID0gZGF0YTtcbiAgICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gICB9O1xuXG4gICBaaXBPYmplY3QucHJvdG90eXBlID0ge1xuICAgICAgLyoqXG4gICAgICAgKiBSZXR1cm4gdGhlIGNvbnRlbnQgYXMgVVRGOCBzdHJpbmcuXG4gICAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IHRoZSBVVEY4IHN0cmluZy5cbiAgICAgICAqL1xuICAgICAgYXNUZXh0IDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgcmV0dXJuIGRhdGFUb1N0cmluZy5jYWxsKHRoaXMsIHRydWUpO1xuICAgICAgfSxcbiAgICAgIC8qKlxuICAgICAgICogUmV0dXJucyB0aGUgYmluYXJ5IGNvbnRlbnQuXG4gICAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IHRoZSBjb250ZW50IGFzIGJpbmFyeS5cbiAgICAgICAqL1xuICAgICAgYXNCaW5hcnkgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICByZXR1cm4gZGF0YVRvU3RyaW5nLmNhbGwodGhpcywgZmFsc2UpO1xuICAgICAgfSxcbiAgICAgIC8qKlxuICAgICAgICogUmV0dXJucyB0aGUgY29udGVudCBhcyBhIG5vZGVqcyBCdWZmZXIuXG4gICAgICAgKiBAcmV0dXJuIHtCdWZmZXJ9IHRoZSBjb250ZW50IGFzIGEgQnVmZmVyLlxuICAgICAgICovXG4gICAgICBhc05vZGVCdWZmZXIgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICB2YXIgcmVzdWx0ID0gZ2V0QmluYXJ5RGF0YSh0aGlzKTtcbiAgICAgICAgIHJldHVybiBKU1ppcC51dGlscy50cmFuc2Zvcm1UbyhcIm5vZGVidWZmZXJcIiwgcmVzdWx0KTtcbiAgICAgIH0sXG4gICAgICAvKipcbiAgICAgICAqIFJldHVybnMgdGhlIGNvbnRlbnQgYXMgYW4gVWludDhBcnJheS5cbiAgICAgICAqIEByZXR1cm4ge1VpbnQ4QXJyYXl9IHRoZSBjb250ZW50IGFzIGFuIFVpbnQ4QXJyYXkuXG4gICAgICAgKi9cbiAgICAgIGFzVWludDhBcnJheSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgIHZhciByZXN1bHQgPSBnZXRCaW5hcnlEYXRhKHRoaXMpO1xuICAgICAgICAgcmV0dXJuIEpTWmlwLnV0aWxzLnRyYW5zZm9ybVRvKFwidWludDhhcnJheVwiLCByZXN1bHQpO1xuICAgICAgfSxcbiAgICAgIC8qKlxuICAgICAgICogUmV0dXJucyB0aGUgY29udGVudCBhcyBhbiBBcnJheUJ1ZmZlci5cbiAgICAgICAqIEByZXR1cm4ge0FycmF5QnVmZmVyfSB0aGUgY29udGVudCBhcyBhbiBBcnJheUJ1ZmVyLlxuICAgICAgICovXG4gICAgICBhc0FycmF5QnVmZmVyIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgcmV0dXJuIHRoaXMuYXNVaW50OEFycmF5KCkuYnVmZmVyO1xuICAgICAgfVxuICAgfTtcblxuICAgLyoqXG4gICAgKiBUcmFuc2Zvcm0gYW4gaW50ZWdlciBpbnRvIGEgc3RyaW5nIGluIGhleGFkZWNpbWFsLlxuICAgICogQHByaXZhdGVcbiAgICAqIEBwYXJhbSB7bnVtYmVyfSBkZWMgdGhlIG51bWJlciB0byBjb252ZXJ0LlxuICAgICogQHBhcmFtIHtudW1iZXJ9IGJ5dGVzIHRoZSBudW1iZXIgb2YgYnl0ZXMgdG8gZ2VuZXJhdGUuXG4gICAgKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcmVzdWx0LlxuICAgICovXG4gICB2YXIgZGVjVG9IZXggPSBmdW5jdGlvbihkZWMsIGJ5dGVzKSB7XG4gICAgICB2YXIgaGV4ID0gXCJcIiwgaTtcbiAgICAgIGZvcihpID0gMDsgaSA8IGJ5dGVzOyBpKyspIHtcbiAgICAgICAgIGhleCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGRlYyYweGZmKTtcbiAgICAgICAgIGRlYz1kZWM+Pj44O1xuICAgICAgfVxuICAgICAgcmV0dXJuIGhleDtcbiAgIH07XG5cbiAgIC8qKlxuICAgICogTWVyZ2UgdGhlIG9iamVjdHMgcGFzc2VkIGFzIHBhcmFtZXRlcnMgaW50byBhIG5ldyBvbmUuXG4gICAgKiBAcHJpdmF0ZVxuICAgICogQHBhcmFtIHsuLi5PYmplY3R9IHZhcl9hcmdzIEFsbCBvYmplY3RzIHRvIG1lcmdlLlxuICAgICogQHJldHVybiB7T2JqZWN0fSBhIG5ldyBvYmplY3Qgd2l0aCB0aGUgZGF0YSBvZiB0aGUgb3RoZXJzLlxuICAgICovXG4gICB2YXIgZXh0ZW5kID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHJlc3VsdCA9IHt9LCBpLCBhdHRyO1xuICAgICAgZm9yIChpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykgeyAvLyBhcmd1bWVudHMgaXMgbm90IGVudW1lcmFibGUgaW4gc29tZSBicm93c2Vyc1xuICAgICAgICAgZm9yIChhdHRyIGluIGFyZ3VtZW50c1tpXSkge1xuICAgICAgICAgICAgaWYgKGFyZ3VtZW50c1tpXS5oYXNPd25Qcm9wZXJ0eShhdHRyKSAmJiB0eXBlb2YgcmVzdWx0W2F0dHJdID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICAgICByZXN1bHRbYXR0cl0gPSBhcmd1bWVudHNbaV1bYXR0cl07XG4gICAgICAgICAgICB9XG4gICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgfTtcblxuICAgLyoqXG4gICAgKiBUcmFuc2Zvcm1zIHRoZSAoaW5jb21wbGV0ZSkgb3B0aW9ucyBmcm9tIHRoZSB1c2VyIGludG8gdGhlIGNvbXBsZXRlXG4gICAgKiBzZXQgb2Ygb3B0aW9ucyB0byBjcmVhdGUgYSBmaWxlLlxuICAgICogQHByaXZhdGVcbiAgICAqIEBwYXJhbSB7T2JqZWN0fSBvIHRoZSBvcHRpb25zIGZyb20gdGhlIHVzZXIuXG4gICAgKiBAcmV0dXJuIHtPYmplY3R9IHRoZSBjb21wbGV0ZSBzZXQgb2Ygb3B0aW9ucy5cbiAgICAqL1xuICAgdmFyIHByZXBhcmVGaWxlQXR0cnMgPSBmdW5jdGlvbiAobykge1xuICAgICAgbyA9IG8gfHwge307XG4gICAgICAvKmpzaGludCAtVzA0MSAqL1xuICAgICAgaWYgKG8uYmFzZTY0ID09PSB0cnVlICYmIG8uYmluYXJ5ID09IG51bGwpIHtcbiAgICAgICAgIG8uYmluYXJ5ID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIC8qanNoaW50ICtXMDQxICovXG4gICAgICBvID0gZXh0ZW5kKG8sIEpTWmlwLmRlZmF1bHRzKTtcbiAgICAgIG8uZGF0ZSA9IG8uZGF0ZSB8fCBuZXcgRGF0ZSgpO1xuICAgICAgaWYgKG8uY29tcHJlc3Npb24gIT09IG51bGwpIG8uY29tcHJlc3Npb24gPSBvLmNvbXByZXNzaW9uLnRvVXBwZXJDYXNlKCk7XG5cbiAgICAgIHJldHVybiBvO1xuICAgfTtcblxuICAgLyoqXG4gICAgKiBBZGQgYSBmaWxlIGluIHRoZSBjdXJyZW50IGZvbGRlci5cbiAgICAqIEBwcml2YXRlXG4gICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSB0aGUgbmFtZSBvZiB0aGUgZmlsZVxuICAgICogQHBhcmFtIHtTdHJpbmd8QXJyYXlCdWZmZXJ8VWludDhBcnJheXxCdWZmZXJ9IGRhdGEgdGhlIGRhdGEgb2YgdGhlIGZpbGVcbiAgICAqIEBwYXJhbSB7T2JqZWN0fSBvIHRoZSBvcHRpb25zIG9mIHRoZSBmaWxlXG4gICAgKiBAcmV0dXJuIHtPYmplY3R9IHRoZSBuZXcgZmlsZS5cbiAgICAqL1xuICAgdmFyIGZpbGVBZGQgPSBmdW5jdGlvbiAobmFtZSwgZGF0YSwgbykge1xuICAgICAgLy8gYmUgc3VyZSBzdWIgZm9sZGVycyBleGlzdFxuICAgICAgdmFyIHBhcmVudCA9IHBhcmVudEZvbGRlcihuYW1lKSwgZGF0YVR5cGUgPSBKU1ppcC51dGlscy5nZXRUeXBlT2YoZGF0YSk7XG4gICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICBmb2xkZXJBZGQuY2FsbCh0aGlzLCBwYXJlbnQpO1xuICAgICAgfVxuXG4gICAgICBvID0gcHJlcGFyZUZpbGVBdHRycyhvKTtcblxuICAgICAgaWYgKG8uZGlyIHx8IGRhdGEgPT09IG51bGwgfHwgdHlwZW9mIGRhdGEgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgIG8uYmFzZTY0ID0gZmFsc2U7XG4gICAgICAgICBvLmJpbmFyeSA9IGZhbHNlO1xuICAgICAgICAgZGF0YSA9IG51bGw7XG4gICAgICB9IGVsc2UgaWYgKGRhdGFUeXBlID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICBpZiAoby5iaW5hcnkgJiYgIW8uYmFzZTY0KSB7XG4gICAgICAgICAgICAvLyBvcHRpbWl6ZWRCaW5hcnlTdHJpbmcgPT0gdHJ1ZSBtZWFucyB0aGF0IHRoZSBmaWxlIGhhcyBhbHJlYWR5IGJlZW4gZmlsdGVyZWQgd2l0aCBhIDB4RkYgbWFza1xuICAgICAgICAgICAgaWYgKG8ub3B0aW1pemVkQmluYXJ5U3RyaW5nICE9PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAvLyB0aGlzIGlzIGEgc3RyaW5nLCBub3QgaW4gYSBiYXNlNjQgZm9ybWF0LlxuICAgICAgICAgICAgICAgLy8gQmUgc3VyZSB0aGF0IHRoaXMgaXMgYSBjb3JyZWN0IFwiYmluYXJ5IHN0cmluZ1wiXG4gICAgICAgICAgICAgICBkYXRhID0gSlNaaXAudXRpbHMuc3RyaW5nMmJpbmFyeShkYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgIH1cbiAgICAgIH0gZWxzZSB7IC8vIGFycmF5YnVmZmVyLCB1aW50OGFycmF5LCAuLi5cbiAgICAgICAgIG8uYmFzZTY0ID0gZmFsc2U7XG4gICAgICAgICBvLmJpbmFyeSA9IHRydWU7XG5cbiAgICAgICAgIGlmICghZGF0YVR5cGUgJiYgIShkYXRhIGluc3RhbmNlb2YgSlNaaXAuQ29tcHJlc3NlZE9iamVjdCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZSBkYXRhIG9mICdcIiArIG5hbWUgKyBcIicgaXMgaW4gYW4gdW5zdXBwb3J0ZWQgZm9ybWF0ICFcIik7XG4gICAgICAgICB9XG5cbiAgICAgICAgIC8vIHNwZWNpYWwgY2FzZSA6IGl0J3Mgd2F5IGVhc2llciB0byB3b3JrIHdpdGggVWludDhBcnJheSB0aGFuIHdpdGggQXJyYXlCdWZmZXJcbiAgICAgICAgIGlmIChkYXRhVHlwZSA9PT0gXCJhcnJheWJ1ZmZlclwiKSB7XG4gICAgICAgICAgICBkYXRhID0gSlNaaXAudXRpbHMudHJhbnNmb3JtVG8oXCJ1aW50OGFycmF5XCIsIGRhdGEpO1xuICAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgb2JqZWN0ID0gbmV3IFppcE9iamVjdChuYW1lLCBkYXRhLCBvKTtcbiAgICAgIHRoaXMuZmlsZXNbbmFtZV0gPSBvYmplY3Q7XG4gICAgICByZXR1cm4gb2JqZWN0O1xuICAgfTtcblxuXG4gICAvKipcbiAgICAqIEZpbmQgdGhlIHBhcmVudCBmb2xkZXIgb2YgdGhlIHBhdGguXG4gICAgKiBAcHJpdmF0ZVxuICAgICogQHBhcmFtIHtzdHJpbmd9IHBhdGggdGhlIHBhdGggdG8gdXNlXG4gICAgKiBAcmV0dXJuIHtzdHJpbmd9IHRoZSBwYXJlbnQgZm9sZGVyLCBvciBcIlwiXG4gICAgKi9cbiAgIHZhciBwYXJlbnRGb2xkZXIgPSBmdW5jdGlvbiAocGF0aCkge1xuICAgICAgaWYgKHBhdGguc2xpY2UoLTEpID09ICcvJykge1xuICAgICAgICAgcGF0aCA9IHBhdGguc3Vic3RyaW5nKDAsIHBhdGgubGVuZ3RoIC0gMSk7XG4gICAgICB9XG4gICAgICB2YXIgbGFzdFNsYXNoID0gcGF0aC5sYXN0SW5kZXhPZignLycpO1xuICAgICAgcmV0dXJuIChsYXN0U2xhc2ggPiAwKSA/IHBhdGguc3Vic3RyaW5nKDAsIGxhc3RTbGFzaCkgOiBcIlwiO1xuICAgfTtcblxuICAgLyoqXG4gICAgKiBBZGQgYSAoc3ViKSBmb2xkZXIgaW4gdGhlIGN1cnJlbnQgZm9sZGVyLlxuICAgICogQHByaXZhdGVcbiAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIHRoZSBmb2xkZXIncyBuYW1lXG4gICAgKiBAcmV0dXJuIHtPYmplY3R9IHRoZSBuZXcgZm9sZGVyLlxuICAgICovXG4gICB2YXIgZm9sZGVyQWRkID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIC8vIENoZWNrIHRoZSBuYW1lIGVuZHMgd2l0aCBhIC9cbiAgICAgIGlmIChuYW1lLnNsaWNlKC0xKSAhPSBcIi9cIikge1xuICAgICAgICAgbmFtZSArPSBcIi9cIjsgLy8gSUUgZG9lc24ndCBsaWtlIHN1YnN0cigtMSlcbiAgICAgIH1cblxuICAgICAgLy8gRG9lcyB0aGlzIGZvbGRlciBhbHJlYWR5IGV4aXN0P1xuICAgICAgaWYgKCF0aGlzLmZpbGVzW25hbWVdKSB7XG4gICAgICAgICBmaWxlQWRkLmNhbGwodGhpcywgbmFtZSwgbnVsbCwge2Rpcjp0cnVlfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5maWxlc1tuYW1lXTtcbiAgIH07XG5cbiAgIC8qKlxuICAgICogR2VuZXJhdGUgYSBKU1ppcC5Db21wcmVzc2VkT2JqZWN0IGZvciBhIGdpdmVuIHppcE9qZWN0LlxuICAgICogQHBhcmFtIHtaaXBPYmplY3R9IGZpbGUgdGhlIG9iamVjdCB0byByZWFkLlxuICAgICogQHBhcmFtIHtKU1ppcC5jb21wcmVzc2lvbn0gY29tcHJlc3Npb24gdGhlIGNvbXByZXNzaW9uIHRvIHVzZS5cbiAgICAqIEByZXR1cm4ge0pTWmlwLkNvbXByZXNzZWRPYmplY3R9IHRoZSBjb21wcmVzc2VkIHJlc3VsdC5cbiAgICAqL1xuICAgdmFyIGdlbmVyYXRlQ29tcHJlc3NlZE9iamVjdEZyb20gPSBmdW5jdGlvbiAoZmlsZSwgY29tcHJlc3Npb24pIHtcbiAgICAgIHZhciByZXN1bHQgPSBuZXcgSlNaaXAuQ29tcHJlc3NlZE9iamVjdCgpLCBjb250ZW50O1xuXG4gICAgICAvLyB0aGUgZGF0YSBoYXMgbm90IGJlZW4gZGVjb21wcmVzc2VkLCB3ZSBtaWdodCByZXVzZSB0aGluZ3MgIVxuICAgICAgaWYgKGZpbGUuX2RhdGEgaW5zdGFuY2VvZiBKU1ppcC5Db21wcmVzc2VkT2JqZWN0KSB7XG4gICAgICAgICByZXN1bHQudW5jb21wcmVzc2VkU2l6ZSA9IGZpbGUuX2RhdGEudW5jb21wcmVzc2VkU2l6ZTtcbiAgICAgICAgIHJlc3VsdC5jcmMzMiA9IGZpbGUuX2RhdGEuY3JjMzI7XG5cbiAgICAgICAgIGlmIChyZXN1bHQudW5jb21wcmVzc2VkU2l6ZSA9PT0gMCB8fCBmaWxlLm9wdGlvbnMuZGlyKSB7XG4gICAgICAgICAgICBjb21wcmVzc2lvbiA9IEpTWmlwLmNvbXByZXNzaW9uc1snU1RPUkUnXTtcbiAgICAgICAgICAgIHJlc3VsdC5jb21wcmVzc2VkQ29udGVudCA9IFwiXCI7XG4gICAgICAgICAgICByZXN1bHQuY3JjMzIgPSAwO1xuICAgICAgICAgfSBlbHNlIGlmIChmaWxlLl9kYXRhLmNvbXByZXNzaW9uTWV0aG9kID09PSBjb21wcmVzc2lvbi5tYWdpYykge1xuICAgICAgICAgICAgcmVzdWx0LmNvbXByZXNzZWRDb250ZW50ID0gZmlsZS5fZGF0YS5nZXRDb21wcmVzc2VkQ29udGVudCgpO1xuICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnRlbnQgPSBmaWxlLl9kYXRhLmdldENvbnRlbnQoKTtcbiAgICAgICAgICAgIC8vIG5lZWQgdG8gZGVjb21wcmVzcyAvIHJlY29tcHJlc3NcbiAgICAgICAgICAgIHJlc3VsdC5jb21wcmVzc2VkQ29udGVudCA9IGNvbXByZXNzaW9uLmNvbXByZXNzKEpTWmlwLnV0aWxzLnRyYW5zZm9ybVRvKGNvbXByZXNzaW9uLmNvbXByZXNzSW5wdXRUeXBlLCBjb250ZW50KSk7XG4gICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgLy8gaGF2ZSB1bmNvbXByZXNzZWQgZGF0YVxuICAgICAgICAgY29udGVudCA9IGdldEJpbmFyeURhdGEoZmlsZSk7XG4gICAgICAgICBpZiAoIWNvbnRlbnQgfHwgY29udGVudC5sZW5ndGggPT09IDAgfHwgZmlsZS5vcHRpb25zLmRpcikge1xuICAgICAgICAgICAgY29tcHJlc3Npb24gPSBKU1ppcC5jb21wcmVzc2lvbnNbJ1NUT1JFJ107XG4gICAgICAgICAgICBjb250ZW50ID0gXCJcIjtcbiAgICAgICAgIH1cbiAgICAgICAgIHJlc3VsdC51bmNvbXByZXNzZWRTaXplID0gY29udGVudC5sZW5ndGg7XG4gICAgICAgICByZXN1bHQuY3JjMzIgPSB0aGlzLmNyYzMyKGNvbnRlbnQpO1xuICAgICAgICAgcmVzdWx0LmNvbXByZXNzZWRDb250ZW50ID0gY29tcHJlc3Npb24uY29tcHJlc3MoSlNaaXAudXRpbHMudHJhbnNmb3JtVG8oY29tcHJlc3Npb24uY29tcHJlc3NJbnB1dFR5cGUsIGNvbnRlbnQpKTtcbiAgICAgIH1cblxuICAgICAgcmVzdWx0LmNvbXByZXNzZWRTaXplID0gcmVzdWx0LmNvbXByZXNzZWRDb250ZW50Lmxlbmd0aDtcbiAgICAgIHJlc3VsdC5jb21wcmVzc2lvbk1ldGhvZCA9IGNvbXByZXNzaW9uLm1hZ2ljO1xuXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgfTtcblxuICAgLyoqXG4gICAgKiBHZW5lcmF0ZSB0aGUgdmFyaW91cyBwYXJ0cyB1c2VkIGluIHRoZSBjb25zdHJ1Y3Rpb24gb2YgdGhlIGZpbmFsIHppcCBmaWxlLlxuICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgdGhlIGZpbGUgbmFtZS5cbiAgICAqIEBwYXJhbSB7WmlwT2JqZWN0fSBmaWxlIHRoZSBmaWxlIGNvbnRlbnQuXG4gICAgKiBAcGFyYW0ge0pTWmlwLkNvbXByZXNzZWRPYmplY3R9IGNvbXByZXNzZWRPYmplY3QgdGhlIGNvbXByZXNzZWQgb2JqZWN0LlxuICAgICogQHBhcmFtIHtudW1iZXJ9IG9mZnNldCB0aGUgY3VycmVudCBvZmZzZXQgZnJvbSB0aGUgc3RhcnQgb2YgdGhlIHppcCBmaWxlLlxuICAgICogQHJldHVybiB7b2JqZWN0fSB0aGUgemlwIHBhcnRzLlxuICAgICovXG4gICB2YXIgZ2VuZXJhdGVaaXBQYXJ0cyA9IGZ1bmN0aW9uKG5hbWUsIGZpbGUsIGNvbXByZXNzZWRPYmplY3QsIG9mZnNldCkge1xuICAgICAgdmFyIGRhdGEgPSBjb21wcmVzc2VkT2JqZWN0LmNvbXByZXNzZWRDb250ZW50LFxuICAgICAgICAgIHV0ZkVuY29kZWRGaWxlTmFtZSA9IHRoaXMudXRmOGVuY29kZShmaWxlLm5hbWUpLFxuICAgICAgICAgIHVzZVVURjggPSB1dGZFbmNvZGVkRmlsZU5hbWUgIT09IGZpbGUubmFtZSxcbiAgICAgICAgICBvICAgICAgID0gZmlsZS5vcHRpb25zLFxuICAgICAgICAgIGRvc1RpbWUsXG4gICAgICAgICAgZG9zRGF0ZTtcblxuICAgICAgLy8gZGF0ZVxuICAgICAgLy8gQHNlZSBodHRwOi8vd3d3LmRlbG9yaWUuY29tL2RqZ3BwL2RvYy9yYmludGVyL2l0LzUyLzEzLmh0bWxcbiAgICAgIC8vIEBzZWUgaHR0cDovL3d3dy5kZWxvcmllLmNvbS9kamdwcC9kb2MvcmJpbnRlci9pdC82NS8xNi5odG1sXG4gICAgICAvLyBAc2VlIGh0dHA6Ly93d3cuZGVsb3JpZS5jb20vZGpncHAvZG9jL3JiaW50ZXIvaXQvNjYvMTYuaHRtbFxuXG4gICAgICBkb3NUaW1lID0gby5kYXRlLmdldEhvdXJzKCk7XG4gICAgICBkb3NUaW1lID0gZG9zVGltZSA8PCA2O1xuICAgICAgZG9zVGltZSA9IGRvc1RpbWUgfCBvLmRhdGUuZ2V0TWludXRlcygpO1xuICAgICAgZG9zVGltZSA9IGRvc1RpbWUgPDwgNTtcbiAgICAgIGRvc1RpbWUgPSBkb3NUaW1lIHwgby5kYXRlLmdldFNlY29uZHMoKSAvIDI7XG5cbiAgICAgIGRvc0RhdGUgPSBvLmRhdGUuZ2V0RnVsbFllYXIoKSAtIDE5ODA7XG4gICAgICBkb3NEYXRlID0gZG9zRGF0ZSA8PCA0O1xuICAgICAgZG9zRGF0ZSA9IGRvc0RhdGUgfCAoby5kYXRlLmdldE1vbnRoKCkgKyAxKTtcbiAgICAgIGRvc0RhdGUgPSBkb3NEYXRlIDw8IDU7XG4gICAgICBkb3NEYXRlID0gZG9zRGF0ZSB8IG8uZGF0ZS5nZXREYXRlKCk7XG5cblxuICAgICAgdmFyIGhlYWRlciA9IFwiXCI7XG5cbiAgICAgIC8vIHZlcnNpb24gbmVlZGVkIHRvIGV4dHJhY3RcbiAgICAgIGhlYWRlciArPSBcIlxceDBBXFx4MDBcIjtcbiAgICAgIC8vIGdlbmVyYWwgcHVycG9zZSBiaXQgZmxhZ1xuICAgICAgLy8gc2V0IGJpdCAxMSBpZiB1dGY4XG4gICAgICBoZWFkZXIgKz0gdXNlVVRGOCA/IFwiXFx4MDBcXHgwOFwiIDogXCJcXHgwMFxceDAwXCI7XG4gICAgICAvLyBjb21wcmVzc2lvbiBtZXRob2RcbiAgICAgIGhlYWRlciArPSBjb21wcmVzc2VkT2JqZWN0LmNvbXByZXNzaW9uTWV0aG9kO1xuICAgICAgLy8gbGFzdCBtb2QgZmlsZSB0aW1lXG4gICAgICBoZWFkZXIgKz0gZGVjVG9IZXgoZG9zVGltZSwgMik7XG4gICAgICAvLyBsYXN0IG1vZCBmaWxlIGRhdGVcbiAgICAgIGhlYWRlciArPSBkZWNUb0hleChkb3NEYXRlLCAyKTtcbiAgICAgIC8vIGNyYy0zMlxuICAgICAgaGVhZGVyICs9IGRlY1RvSGV4KGNvbXByZXNzZWRPYmplY3QuY3JjMzIsIDQpO1xuICAgICAgLy8gY29tcHJlc3NlZCBzaXplXG4gICAgICBoZWFkZXIgKz0gZGVjVG9IZXgoY29tcHJlc3NlZE9iamVjdC5jb21wcmVzc2VkU2l6ZSwgNCk7XG4gICAgICAvLyB1bmNvbXByZXNzZWQgc2l6ZVxuICAgICAgaGVhZGVyICs9IGRlY1RvSGV4KGNvbXByZXNzZWRPYmplY3QudW5jb21wcmVzc2VkU2l6ZSwgNCk7XG4gICAgICAvLyBmaWxlIG5hbWUgbGVuZ3RoXG4gICAgICBoZWFkZXIgKz0gZGVjVG9IZXgodXRmRW5jb2RlZEZpbGVOYW1lLmxlbmd0aCwgMik7XG4gICAgICAvLyBleHRyYSBmaWVsZCBsZW5ndGhcbiAgICAgIGhlYWRlciArPSBcIlxceDAwXFx4MDBcIjtcblxuXG4gICAgICB2YXIgZmlsZVJlY29yZCA9IEpTWmlwLnNpZ25hdHVyZS5MT0NBTF9GSUxFX0hFQURFUiArIGhlYWRlciArIHV0ZkVuY29kZWRGaWxlTmFtZTtcblxuICAgICAgdmFyIGRpclJlY29yZCA9IEpTWmlwLnNpZ25hdHVyZS5DRU5UUkFMX0ZJTEVfSEVBREVSICtcbiAgICAgIC8vIHZlcnNpb24gbWFkZSBieSAoMDA6IERPUylcbiAgICAgIFwiXFx4MTRcXHgwMFwiICtcbiAgICAgIC8vIGZpbGUgaGVhZGVyIChjb21tb24gdG8gZmlsZSBhbmQgY2VudHJhbCBkaXJlY3RvcnkpXG4gICAgICBoZWFkZXIgK1xuICAgICAgLy8gZmlsZSBjb21tZW50IGxlbmd0aFxuICAgICAgXCJcXHgwMFxceDAwXCIgK1xuICAgICAgLy8gZGlzayBudW1iZXIgc3RhcnRcbiAgICAgIFwiXFx4MDBcXHgwMFwiICtcbiAgICAgIC8vIGludGVybmFsIGZpbGUgYXR0cmlidXRlcyBUT0RPXG4gICAgICBcIlxceDAwXFx4MDBcIiArXG4gICAgICAvLyBleHRlcm5hbCBmaWxlIGF0dHJpYnV0ZXNcbiAgICAgIChmaWxlLm9wdGlvbnMuZGlyPT09dHJ1ZT9cIlxceDEwXFx4MDBcXHgwMFxceDAwXCI6XCJcXHgwMFxceDAwXFx4MDBcXHgwMFwiKStcbiAgICAgIC8vIHJlbGF0aXZlIG9mZnNldCBvZiBsb2NhbCBoZWFkZXJcbiAgICAgIGRlY1RvSGV4KG9mZnNldCwgNCkgK1xuICAgICAgLy8gZmlsZSBuYW1lXG4gICAgICB1dGZFbmNvZGVkRmlsZU5hbWU7XG5cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgIGZpbGVSZWNvcmQgOiBmaWxlUmVjb3JkLFxuICAgICAgICAgZGlyUmVjb3JkIDogZGlyUmVjb3JkLFxuICAgICAgICAgY29tcHJlc3NlZE9iamVjdCA6IGNvbXByZXNzZWRPYmplY3RcbiAgICAgIH07XG4gICB9O1xuXG4gICAvKipcbiAgICAqIEFuIG9iamVjdCB0byB3cml0ZSBhbnkgY29udGVudCB0byBhIHN0cmluZy5cbiAgICAqIEBjb25zdHJ1Y3RvclxuICAgICovXG4gICB2YXIgU3RyaW5nV3JpdGVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5kYXRhID0gW107XG4gICB9O1xuICAgU3RyaW5nV3JpdGVyLnByb3RvdHlwZSA9IHtcbiAgICAgIC8qKlxuICAgICAgICogQXBwZW5kIGFueSBjb250ZW50IHRvIHRoZSBjdXJyZW50IHN0cmluZy5cbiAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBpbnB1dCB0aGUgY29udGVudCB0byBhZGQuXG4gICAgICAgKi9cbiAgICAgIGFwcGVuZCA6IGZ1bmN0aW9uIChpbnB1dCkge1xuICAgICAgICAgaW5wdXQgPSBKU1ppcC51dGlscy50cmFuc2Zvcm1UbyhcInN0cmluZ1wiLCBpbnB1dCk7XG4gICAgICAgICB0aGlzLmRhdGEucHVzaChpbnB1dCk7XG4gICAgICB9LFxuICAgICAgLyoqXG4gICAgICAgKiBGaW5hbGl6ZSB0aGUgY29uc3RydWN0aW9uIGFuIHJldHVybiB0aGUgcmVzdWx0LlxuICAgICAgICogQHJldHVybiB7c3RyaW5nfSB0aGUgZ2VuZXJhdGVkIHN0cmluZy5cbiAgICAgICAqL1xuICAgICAgZmluYWxpemUgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICByZXR1cm4gdGhpcy5kYXRhLmpvaW4oXCJcIik7XG4gICAgICB9XG4gICB9O1xuICAgLyoqXG4gICAgKiBBbiBvYmplY3QgdG8gd3JpdGUgYW55IGNvbnRlbnQgdG8gYW4gVWludDhBcnJheS5cbiAgICAqIEBjb25zdHJ1Y3RvclxuICAgICogQHBhcmFtIHtudW1iZXJ9IGxlbmd0aCBUaGUgbGVuZ3RoIG9mIHRoZSBhcnJheS5cbiAgICAqL1xuICAgdmFyIFVpbnQ4QXJyYXlXcml0ZXIgPSBmdW5jdGlvbiAobGVuZ3RoKSB7XG4gICAgICB0aGlzLmRhdGEgPSBuZXcgVWludDhBcnJheShsZW5ndGgpO1xuICAgICAgdGhpcy5pbmRleCA9IDA7XG4gICB9O1xuICAgVWludDhBcnJheVdyaXRlci5wcm90b3R5cGUgPSB7XG4gICAgICAvKipcbiAgICAgICAqIEFwcGVuZCBhbnkgY29udGVudCB0byB0aGUgY3VycmVudCBhcnJheS5cbiAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBpbnB1dCB0aGUgY29udGVudCB0byBhZGQuXG4gICAgICAgKi9cbiAgICAgIGFwcGVuZCA6IGZ1bmN0aW9uIChpbnB1dCkge1xuICAgICAgICAgaWYgKGlucHV0Lmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgLy8gd2l0aCBhbiBlbXB0eSBVaW50OEFycmF5LCBPcGVyYSBmYWlscyB3aXRoIGEgXCJPZmZzZXQgbGFyZ2VyIHRoYW4gYXJyYXkgc2l6ZVwiXG4gICAgICAgICAgICBpbnB1dCA9IEpTWmlwLnV0aWxzLnRyYW5zZm9ybVRvKFwidWludDhhcnJheVwiLCBpbnB1dCk7XG4gICAgICAgICAgICB0aGlzLmRhdGEuc2V0KGlucHV0LCB0aGlzLmluZGV4KTtcbiAgICAgICAgICAgIHRoaXMuaW5kZXggKz0gaW5wdXQubGVuZ3RoO1xuICAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIC8qKlxuICAgICAgICogRmluYWxpemUgdGhlIGNvbnN0cnVjdGlvbiBhbiByZXR1cm4gdGhlIHJlc3VsdC5cbiAgICAgICAqIEByZXR1cm4ge1VpbnQ4QXJyYXl9IHRoZSBnZW5lcmF0ZWQgYXJyYXkuXG4gICAgICAgKi9cbiAgICAgIGZpbmFsaXplIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgcmV0dXJuIHRoaXMuZGF0YTtcbiAgICAgIH1cbiAgIH07XG5cbiAgIC8vIHJldHVybiB0aGUgYWN0dWFsIHByb3RvdHlwZSBvZiBKU1ppcFxuICAgcmV0dXJuIHtcbiAgICAgIC8qKlxuICAgICAgICogUmVhZCBhbiBleGlzdGluZyB6aXAgYW5kIG1lcmdlIHRoZSBkYXRhIGluIHRoZSBjdXJyZW50IEpTWmlwIG9iamVjdC5cbiAgICAgICAqIFRoZSBpbXBsZW1lbnRhdGlvbiBpcyBpbiBqc3ppcC1sb2FkLmpzLCBkb24ndCBmb3JnZXQgdG8gaW5jbHVkZSBpdC5cbiAgICAgICAqIEBwYXJhbSB7U3RyaW5nfEFycmF5QnVmZmVyfFVpbnQ4QXJyYXl8QnVmZmVyfSBzdHJlYW0gIFRoZSBzdHJlYW0gdG8gbG9hZFxuICAgICAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgT3B0aW9ucyBmb3IgbG9hZGluZyB0aGUgc3RyZWFtLlxuICAgICAgICogIG9wdGlvbnMuYmFzZTY0IDogaXMgdGhlIHN0cmVhbSBpbiBiYXNlNjQgPyBkZWZhdWx0IDogZmFsc2VcbiAgICAgICAqIEByZXR1cm4ge0pTWmlwfSB0aGUgY3VycmVudCBKU1ppcCBvYmplY3RcbiAgICAgICAqL1xuICAgICAgbG9hZCA6IGZ1bmN0aW9uIChzdHJlYW0sIG9wdGlvbnMpIHtcbiAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkxvYWQgbWV0aG9kIGlzIG5vdCBkZWZpbmVkLiBJcyB0aGUgZmlsZSBqc3ppcC1sb2FkLmpzIGluY2x1ZGVkID9cIik7XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIEZpbHRlciBuZXN0ZWQgZmlsZXMvZm9sZGVycyB3aXRoIHRoZSBzcGVjaWZpZWQgZnVuY3Rpb24uXG4gICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBzZWFyY2ggdGhlIHByZWRpY2F0ZSB0byB1c2UgOlxuICAgICAgICogZnVuY3Rpb24gKHJlbGF0aXZlUGF0aCwgZmlsZSkgey4uLn1cbiAgICAgICAqIEl0IHRha2VzIDIgYXJndW1lbnRzIDogdGhlIHJlbGF0aXZlIHBhdGggYW5kIHRoZSBmaWxlLlxuICAgICAgICogQHJldHVybiB7QXJyYXl9IEFuIGFycmF5IG9mIG1hdGNoaW5nIGVsZW1lbnRzLlxuICAgICAgICovXG4gICAgICBmaWx0ZXIgOiBmdW5jdGlvbiAoc2VhcmNoKSB7XG4gICAgICAgICB2YXIgcmVzdWx0ID0gW10sIGZpbGVuYW1lLCByZWxhdGl2ZVBhdGgsIGZpbGUsIGZpbGVDbG9uZTtcbiAgICAgICAgIGZvciAoZmlsZW5hbWUgaW4gdGhpcy5maWxlcykge1xuICAgICAgICAgICAgaWYgKCAhdGhpcy5maWxlcy5oYXNPd25Qcm9wZXJ0eShmaWxlbmFtZSkgKSB7IGNvbnRpbnVlOyB9XG4gICAgICAgICAgICBmaWxlID0gdGhpcy5maWxlc1tmaWxlbmFtZV07XG4gICAgICAgICAgICAvLyByZXR1cm4gYSBuZXcgb2JqZWN0LCBkb24ndCBsZXQgdGhlIHVzZXIgbWVzcyB3aXRoIG91ciBpbnRlcm5hbCBvYmplY3RzIDopXG4gICAgICAgICAgICBmaWxlQ2xvbmUgPSBuZXcgWmlwT2JqZWN0KGZpbGUubmFtZSwgZmlsZS5fZGF0YSwgZXh0ZW5kKGZpbGUub3B0aW9ucykpO1xuICAgICAgICAgICAgcmVsYXRpdmVQYXRoID0gZmlsZW5hbWUuc2xpY2UodGhpcy5yb290Lmxlbmd0aCwgZmlsZW5hbWUubGVuZ3RoKTtcbiAgICAgICAgICAgIGlmIChmaWxlbmFtZS5zbGljZSgwLCB0aGlzLnJvb3QubGVuZ3RoKSA9PT0gdGhpcy5yb290ICYmIC8vIHRoZSBmaWxlIGlzIGluIHRoZSBjdXJyZW50IHJvb3RcbiAgICAgICAgICAgICAgICBzZWFyY2gocmVsYXRpdmVQYXRoLCBmaWxlQ2xvbmUpKSB7IC8vIGFuZCB0aGUgZmlsZSBtYXRjaGVzIHRoZSBmdW5jdGlvblxuICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goZmlsZUNsb25lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgIH1cbiAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIEFkZCBhIGZpbGUgdG8gdGhlIHppcCBmaWxlLCBvciBzZWFyY2ggYSBmaWxlLlxuICAgICAgICogQHBhcmFtICAge3N0cmluZ3xSZWdFeHB9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIGZpbGUgdG8gYWRkIChpZiBkYXRhIGlzIGRlZmluZWQpLFxuICAgICAgICogdGhlIG5hbWUgb2YgdGhlIGZpbGUgdG8gZmluZCAoaWYgbm8gZGF0YSkgb3IgYSByZWdleCB0byBtYXRjaCBmaWxlcy5cbiAgICAgICAqIEBwYXJhbSAgIHtTdHJpbmd8QXJyYXlCdWZmZXJ8VWludDhBcnJheXxCdWZmZXJ9IGRhdGEgIFRoZSBmaWxlIGRhdGEsIGVpdGhlciByYXcgb3IgYmFzZTY0IGVuY29kZWRcbiAgICAgICAqIEBwYXJhbSAgIHtPYmplY3R9IG8gICAgIEZpbGUgb3B0aW9uc1xuICAgICAgICogQHJldHVybiAge0pTWmlwfE9iamVjdHxBcnJheX0gdGhpcyBKU1ppcCBvYmplY3QgKHdoZW4gYWRkaW5nIGEgZmlsZSksXG4gICAgICAgKiBhIGZpbGUgKHdoZW4gc2VhcmNoaW5nIGJ5IHN0cmluZykgb3IgYW4gYXJyYXkgb2YgZmlsZXMgKHdoZW4gc2VhcmNoaW5nIGJ5IHJlZ2V4KS5cbiAgICAgICAqL1xuICAgICAgZmlsZSA6IGZ1bmN0aW9uKG5hbWUsIGRhdGEsIG8pIHtcbiAgICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICBpZiAoSlNaaXAudXRpbHMuaXNSZWdFeHAobmFtZSkpIHtcbiAgICAgICAgICAgICAgIHZhciByZWdleHAgPSBuYW1lO1xuICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmlsdGVyKGZ1bmN0aW9uKHJlbGF0aXZlUGF0aCwgZmlsZSkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuICFmaWxlLm9wdGlvbnMuZGlyICYmIHJlZ2V4cC50ZXN0KHJlbGF0aXZlUGF0aCk7XG4gICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7IC8vIHRleHRcbiAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmZpbHRlcihmdW5jdGlvbiAocmVsYXRpdmVQYXRoLCBmaWxlKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gIWZpbGUub3B0aW9ucy5kaXIgJiYgcmVsYXRpdmVQYXRoID09PSBuYW1lO1xuICAgICAgICAgICAgICAgfSlbMF18fG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICB9IGVsc2UgeyAvLyBtb3JlIHRoYW4gb25lIGFyZ3VtZW50IDogd2UgaGF2ZSBkYXRhICFcbiAgICAgICAgICAgIG5hbWUgPSB0aGlzLnJvb3QrbmFtZTtcbiAgICAgICAgICAgIGZpbGVBZGQuY2FsbCh0aGlzLCBuYW1lLCBkYXRhLCBvKTtcbiAgICAgICAgIH1cbiAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfSxcblxuICAgICAgLyoqXG4gICAgICAgKiBBZGQgYSBkaXJlY3RvcnkgdG8gdGhlIHppcCBmaWxlLCBvciBzZWFyY2guXG4gICAgICAgKiBAcGFyYW0gICB7U3RyaW5nfFJlZ0V4cH0gYXJnIFRoZSBuYW1lIG9mIHRoZSBkaXJlY3RvcnkgdG8gYWRkLCBvciBhIHJlZ2V4IHRvIHNlYXJjaCBmb2xkZXJzLlxuICAgICAgICogQHJldHVybiAge0pTWmlwfSBhbiBvYmplY3Qgd2l0aCB0aGUgbmV3IGRpcmVjdG9yeSBhcyB0aGUgcm9vdCwgb3IgYW4gYXJyYXkgY29udGFpbmluZyBtYXRjaGluZyBmb2xkZXJzLlxuICAgICAgICovXG4gICAgICBmb2xkZXIgOiBmdW5jdGlvbihhcmcpIHtcbiAgICAgICAgIGlmICghYXJnKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgIH1cblxuICAgICAgICAgaWYgKEpTWmlwLnV0aWxzLmlzUmVnRXhwKGFyZykpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZpbHRlcihmdW5jdGlvbihyZWxhdGl2ZVBhdGgsIGZpbGUpIHtcbiAgICAgICAgICAgICAgIHJldHVybiBmaWxlLm9wdGlvbnMuZGlyICYmIGFyZy50ZXN0KHJlbGF0aXZlUGF0aCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgIH1cblxuICAgICAgICAgLy8gZWxzZSwgbmFtZSBpcyBhIG5ldyBmb2xkZXJcbiAgICAgICAgIHZhciBuYW1lID0gdGhpcy5yb290ICsgYXJnO1xuICAgICAgICAgdmFyIG5ld0ZvbGRlciA9IGZvbGRlckFkZC5jYWxsKHRoaXMsIG5hbWUpO1xuXG4gICAgICAgICAvLyBBbGxvdyBjaGFpbmluZyBieSByZXR1cm5pbmcgYSBuZXcgb2JqZWN0IHdpdGggdGhpcyBmb2xkZXIgYXMgdGhlIHJvb3RcbiAgICAgICAgIHZhciByZXQgPSB0aGlzLmNsb25lKCk7XG4gICAgICAgICByZXQucm9vdCA9IG5ld0ZvbGRlci5uYW1lO1xuICAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgIH0sXG5cbiAgICAgIC8qKlxuICAgICAgICogRGVsZXRlIGEgZmlsZSwgb3IgYSBkaXJlY3RvcnkgYW5kIGFsbCBzdWItZmlsZXMsIGZyb20gdGhlIHppcFxuICAgICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgdGhlIG5hbWUgb2YgdGhlIGZpbGUgdG8gZGVsZXRlXG4gICAgICAgKiBAcmV0dXJuIHtKU1ppcH0gdGhpcyBKU1ppcCBvYmplY3RcbiAgICAgICAqL1xuICAgICAgcmVtb3ZlIDogZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgbmFtZSA9IHRoaXMucm9vdCArIG5hbWU7XG4gICAgICAgICB2YXIgZmlsZSA9IHRoaXMuZmlsZXNbbmFtZV07XG4gICAgICAgICBpZiAoIWZpbGUpIHtcbiAgICAgICAgICAgIC8vIExvb2sgZm9yIGFueSBmb2xkZXJzXG4gICAgICAgICAgICBpZiAobmFtZS5zbGljZSgtMSkgIT0gXCIvXCIpIHtcbiAgICAgICAgICAgICAgIG5hbWUgKz0gXCIvXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmaWxlID0gdGhpcy5maWxlc1tuYW1lXTtcbiAgICAgICAgIH1cblxuICAgICAgICAgaWYgKGZpbGUpIHtcbiAgICAgICAgICAgIGlmICghZmlsZS5vcHRpb25zLmRpcikge1xuICAgICAgICAgICAgICAgLy8gZmlsZVxuICAgICAgICAgICAgICAgZGVsZXRlIHRoaXMuZmlsZXNbbmFtZV07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgLy8gZm9sZGVyXG4gICAgICAgICAgICAgICB2YXIga2lkcyA9IHRoaXMuZmlsdGVyKGZ1bmN0aW9uIChyZWxhdGl2ZVBhdGgsIGZpbGUpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBmaWxlLm5hbWUuc2xpY2UoMCwgbmFtZS5sZW5ndGgpID09PSBuYW1lO1xuICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGtpZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzLmZpbGVzW2tpZHNbaV0ubmFtZV07XG4gICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICB9XG5cbiAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfSxcblxuICAgICAgLyoqXG4gICAgICAgKiBHZW5lcmF0ZSB0aGUgY29tcGxldGUgemlwIGZpbGVcbiAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIHRoZSBvcHRpb25zIHRvIGdlbmVyYXRlIHRoZSB6aXAgZmlsZSA6XG4gICAgICAgKiAtIGJhc2U2NCwgKGRlcHJlY2F0ZWQsIHVzZSB0eXBlIGluc3RlYWQpIHRydWUgdG8gZ2VuZXJhdGUgYmFzZTY0LlxuICAgICAgICogLSBjb21wcmVzc2lvbiwgXCJTVE9SRVwiIGJ5IGRlZmF1bHQuXG4gICAgICAgKiAtIHR5cGUsIFwiYmFzZTY0XCIgYnkgZGVmYXVsdC4gVmFsdWVzIGFyZSA6IHN0cmluZywgYmFzZTY0LCB1aW50OGFycmF5LCBhcnJheWJ1ZmZlciwgYmxvYi5cbiAgICAgICAqIEByZXR1cm4ge1N0cmluZ3xVaW50OEFycmF5fEFycmF5QnVmZmVyfEJ1ZmZlcnxCbG9ifSB0aGUgemlwIGZpbGVcbiAgICAgICAqL1xuICAgICAgZ2VuZXJhdGUgOiBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgICBvcHRpb25zID0gZXh0ZW5kKG9wdGlvbnMgfHwge30sIHtcbiAgICAgICAgICAgIGJhc2U2NCA6IHRydWUsXG4gICAgICAgICAgICBjb21wcmVzc2lvbiA6IFwiU1RPUkVcIixcbiAgICAgICAgICAgIHR5cGUgOiBcImJhc2U2NFwiXG4gICAgICAgICB9KTtcblxuICAgICAgICAgSlNaaXAudXRpbHMuY2hlY2tTdXBwb3J0KG9wdGlvbnMudHlwZSk7XG5cbiAgICAgICAgIHZhciB6aXBEYXRhID0gW10sIGxvY2FsRGlyTGVuZ3RoID0gMCwgY2VudHJhbERpckxlbmd0aCA9IDAsIHdyaXRlciwgaTtcblxuXG4gICAgICAgICAvLyBmaXJzdCwgZ2VuZXJhdGUgYWxsIHRoZSB6aXAgcGFydHMuXG4gICAgICAgICBmb3IgKHZhciBuYW1lIGluIHRoaXMuZmlsZXMpIHtcbiAgICAgICAgICAgIGlmICggIXRoaXMuZmlsZXMuaGFzT3duUHJvcGVydHkobmFtZSkgKSB7IGNvbnRpbnVlOyB9XG4gICAgICAgICAgICB2YXIgZmlsZSA9IHRoaXMuZmlsZXNbbmFtZV07XG5cbiAgICAgICAgICAgIHZhciBjb21wcmVzc2lvbk5hbWUgPSBmaWxlLm9wdGlvbnMuY29tcHJlc3Npb24gfHwgb3B0aW9ucy5jb21wcmVzc2lvbi50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgdmFyIGNvbXByZXNzaW9uID0gSlNaaXAuY29tcHJlc3Npb25zW2NvbXByZXNzaW9uTmFtZV07XG4gICAgICAgICAgICBpZiAoIWNvbXByZXNzaW9uKSB7XG4gICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoY29tcHJlc3Npb25OYW1lICsgXCIgaXMgbm90IGEgdmFsaWQgY29tcHJlc3Npb24gbWV0aG9kICFcIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBjb21wcmVzc2VkT2JqZWN0ID0gZ2VuZXJhdGVDb21wcmVzc2VkT2JqZWN0RnJvbS5jYWxsKHRoaXMsIGZpbGUsIGNvbXByZXNzaW9uKTtcblxuICAgICAgICAgICAgdmFyIHppcFBhcnQgPSBnZW5lcmF0ZVppcFBhcnRzLmNhbGwodGhpcywgbmFtZSwgZmlsZSwgY29tcHJlc3NlZE9iamVjdCwgbG9jYWxEaXJMZW5ndGgpO1xuICAgICAgICAgICAgbG9jYWxEaXJMZW5ndGggKz0gemlwUGFydC5maWxlUmVjb3JkLmxlbmd0aCArIGNvbXByZXNzZWRPYmplY3QuY29tcHJlc3NlZFNpemU7XG4gICAgICAgICAgICBjZW50cmFsRGlyTGVuZ3RoICs9IHppcFBhcnQuZGlyUmVjb3JkLmxlbmd0aDtcbiAgICAgICAgICAgIHppcERhdGEucHVzaCh6aXBQYXJ0KTtcbiAgICAgICAgIH1cblxuICAgICAgICAgdmFyIGRpckVuZCA9IFwiXCI7XG5cbiAgICAgICAgIC8vIGVuZCBvZiBjZW50cmFsIGRpciBzaWduYXR1cmVcbiAgICAgICAgIGRpckVuZCA9IEpTWmlwLnNpZ25hdHVyZS5DRU5UUkFMX0RJUkVDVE9SWV9FTkQgK1xuICAgICAgICAgLy8gbnVtYmVyIG9mIHRoaXMgZGlza1xuICAgICAgICAgXCJcXHgwMFxceDAwXCIgK1xuICAgICAgICAgLy8gbnVtYmVyIG9mIHRoZSBkaXNrIHdpdGggdGhlIHN0YXJ0IG9mIHRoZSBjZW50cmFsIGRpcmVjdG9yeVxuICAgICAgICAgXCJcXHgwMFxceDAwXCIgK1xuICAgICAgICAgLy8gdG90YWwgbnVtYmVyIG9mIGVudHJpZXMgaW4gdGhlIGNlbnRyYWwgZGlyZWN0b3J5IG9uIHRoaXMgZGlza1xuICAgICAgICAgZGVjVG9IZXgoemlwRGF0YS5sZW5ndGgsIDIpICtcbiAgICAgICAgIC8vIHRvdGFsIG51bWJlciBvZiBlbnRyaWVzIGluIHRoZSBjZW50cmFsIGRpcmVjdG9yeVxuICAgICAgICAgZGVjVG9IZXgoemlwRGF0YS5sZW5ndGgsIDIpICtcbiAgICAgICAgIC8vIHNpemUgb2YgdGhlIGNlbnRyYWwgZGlyZWN0b3J5ICAgNCBieXRlc1xuICAgICAgICAgZGVjVG9IZXgoY2VudHJhbERpckxlbmd0aCwgNCkgK1xuICAgICAgICAgLy8gb2Zmc2V0IG9mIHN0YXJ0IG9mIGNlbnRyYWwgZGlyZWN0b3J5IHdpdGggcmVzcGVjdCB0byB0aGUgc3RhcnRpbmcgZGlzayBudW1iZXJcbiAgICAgICAgIGRlY1RvSGV4KGxvY2FsRGlyTGVuZ3RoLCA0KSArXG4gICAgICAgICAvLyAuWklQIGZpbGUgY29tbWVudCBsZW5ndGhcbiAgICAgICAgIFwiXFx4MDBcXHgwMFwiO1xuXG5cbiAgICAgICAgIC8vIHdlIGhhdmUgYWxsIHRoZSBwYXJ0cyAoYW5kIHRoZSB0b3RhbCBsZW5ndGgpXG4gICAgICAgICAvLyB0aW1lIHRvIGNyZWF0ZSBhIHdyaXRlciAhXG4gICAgICAgICBzd2l0Y2gob3B0aW9ucy50eXBlLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgICAgICAgIGNhc2UgXCJ1aW50OGFycmF5XCIgOlxuICAgICAgICAgICAgY2FzZSBcImFycmF5YnVmZmVyXCIgOlxuICAgICAgICAgICAgY2FzZSBcImJsb2JcIiA6XG4gICAgICAgICAgICBjYXNlIFwibm9kZWJ1ZmZlclwiIDpcbiAgICAgICAgICAgICAgIHdyaXRlciA9IG5ldyBVaW50OEFycmF5V3JpdGVyKGxvY2FsRGlyTGVuZ3RoICsgY2VudHJhbERpckxlbmd0aCArIGRpckVuZC5sZW5ndGgpO1xuICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAvLyBjYXNlIFwiYmFzZTY0XCIgOlxuICAgICAgICAgICAgLy8gY2FzZSBcInN0cmluZ1wiIDpcbiAgICAgICAgICAgIGRlZmF1bHQgOlxuICAgICAgICAgICAgICAgd3JpdGVyID0gbmV3IFN0cmluZ1dyaXRlcihsb2NhbERpckxlbmd0aCArIGNlbnRyYWxEaXJMZW5ndGggKyBkaXJFbmQubGVuZ3RoKTtcbiAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgfVxuXG4gICAgICAgICBmb3IgKGkgPSAwOyBpIDwgemlwRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgd3JpdGVyLmFwcGVuZCh6aXBEYXRhW2ldLmZpbGVSZWNvcmQpO1xuICAgICAgICAgICAgd3JpdGVyLmFwcGVuZCh6aXBEYXRhW2ldLmNvbXByZXNzZWRPYmplY3QuY29tcHJlc3NlZENvbnRlbnQpO1xuICAgICAgICAgfVxuICAgICAgICAgZm9yIChpID0gMDsgaSA8IHppcERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHdyaXRlci5hcHBlbmQoemlwRGF0YVtpXS5kaXJSZWNvcmQpO1xuICAgICAgICAgfVxuXG4gICAgICAgICB3cml0ZXIuYXBwZW5kKGRpckVuZCk7XG5cbiAgICAgICAgIHZhciB6aXAgPSB3cml0ZXIuZmluYWxpemUoKTtcblxuXG5cbiAgICAgICAgIHN3aXRjaChvcHRpb25zLnR5cGUudG9Mb3dlckNhc2UoKSkge1xuICAgICAgICAgICAgLy8gY2FzZSBcInppcCBpcyBhbiBVaW50OEFycmF5XCJcbiAgICAgICAgICAgIGNhc2UgXCJ1aW50OGFycmF5XCIgOlxuICAgICAgICAgICAgY2FzZSBcImFycmF5YnVmZmVyXCIgOlxuICAgICAgICAgICAgY2FzZSBcIm5vZGVidWZmZXJcIiA6XG4gICAgICAgICAgICAgICByZXR1cm4gSlNaaXAudXRpbHMudHJhbnNmb3JtVG8ob3B0aW9ucy50eXBlLnRvTG93ZXJDYXNlKCksIHppcCk7XG4gICAgICAgICAgICBjYXNlIFwiYmxvYlwiIDpcbiAgICAgICAgICAgICAgIHJldHVybiBKU1ppcC51dGlscy5hcnJheUJ1ZmZlcjJCbG9iKEpTWmlwLnV0aWxzLnRyYW5zZm9ybVRvKFwiYXJyYXlidWZmZXJcIiwgemlwKSk7XG5cbiAgICAgICAgICAgIC8vIGNhc2UgXCJ6aXAgaXMgYSBzdHJpbmdcIlxuICAgICAgICAgICAgY2FzZSBcImJhc2U2NFwiIDpcbiAgICAgICAgICAgICAgIHJldHVybiAob3B0aW9ucy5iYXNlNjQpID8gSlNaaXAuYmFzZTY0LmVuY29kZSh6aXApIDogemlwO1xuICAgICAgICAgICAgZGVmYXVsdCA6IC8vIGNhc2UgXCJzdHJpbmdcIiA6XG4gICAgICAgICAgICAgICByZXR1cm4gemlwO1xuICAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgLyoqXG4gICAgICAgKlxuICAgICAgICogIEphdmFzY3JpcHQgY3JjMzJcbiAgICAgICAqICBodHRwOi8vd3d3LndlYnRvb2xraXQuaW5mby9cbiAgICAgICAqXG4gICAgICAgKi9cbiAgICAgIGNyYzMyIDogZnVuY3Rpb24gY3JjMzIoaW5wdXQsIGNyYykge1xuICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dCA9PT0gXCJ1bmRlZmluZWRcIiB8fCAhaW5wdXQubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgIH1cblxuICAgICAgICAgdmFyIGlzQXJyYXkgPSBKU1ppcC51dGlscy5nZXRUeXBlT2YoaW5wdXQpICE9PSBcInN0cmluZ1wiO1xuXG4gICAgICAgICB2YXIgdGFibGUgPSBbXG4gICAgICAgICAgICAweDAwMDAwMDAwLCAweDc3MDczMDk2LCAweEVFMEU2MTJDLCAweDk5MDk1MUJBLFxuICAgICAgICAgICAgMHgwNzZEQzQxOSwgMHg3MDZBRjQ4RiwgMHhFOTYzQTUzNSwgMHg5RTY0OTVBMyxcbiAgICAgICAgICAgIDB4MEVEQjg4MzIsIDB4NzlEQ0I4QTQsIDB4RTBENUU5MUUsIDB4OTdEMkQ5ODgsXG4gICAgICAgICAgICAweDA5QjY0QzJCLCAweDdFQjE3Q0JELCAweEU3QjgyRDA3LCAweDkwQkYxRDkxLFxuICAgICAgICAgICAgMHgxREI3MTA2NCwgMHg2QUIwMjBGMiwgMHhGM0I5NzE0OCwgMHg4NEJFNDFERSxcbiAgICAgICAgICAgIDB4MUFEQUQ0N0QsIDB4NkREREU0RUIsIDB4RjRENEI1NTEsIDB4ODNEMzg1QzcsXG4gICAgICAgICAgICAweDEzNkM5ODU2LCAweDY0NkJBOEMwLCAweEZENjJGOTdBLCAweDhBNjVDOUVDLFxuICAgICAgICAgICAgMHgxNDAxNUM0RiwgMHg2MzA2NkNEOSwgMHhGQTBGM0Q2MywgMHg4RDA4MERGNSxcbiAgICAgICAgICAgIDB4M0I2RTIwQzgsIDB4NEM2OTEwNUUsIDB4RDU2MDQxRTQsIDB4QTI2NzcxNzIsXG4gICAgICAgICAgICAweDNDMDNFNEQxLCAweDRCMDRENDQ3LCAweEQyMEQ4NUZELCAweEE1MEFCNTZCLFxuICAgICAgICAgICAgMHgzNUI1QThGQSwgMHg0MkIyOTg2QywgMHhEQkJCQzlENiwgMHhBQ0JDRjk0MCxcbiAgICAgICAgICAgIDB4MzJEODZDRTMsIDB4NDVERjVDNzUsIDB4RENENjBEQ0YsIDB4QUJEMTNENTksXG4gICAgICAgICAgICAweDI2RDkzMEFDLCAweDUxREUwMDNBLCAweEM4RDc1MTgwLCAweEJGRDA2MTE2LFxuICAgICAgICAgICAgMHgyMUI0RjRCNSwgMHg1NkIzQzQyMywgMHhDRkJBOTU5OSwgMHhCOEJEQTUwRixcbiAgICAgICAgICAgIDB4MjgwMkI4OUUsIDB4NUYwNTg4MDgsIDB4QzYwQ0Q5QjIsIDB4QjEwQkU5MjQsXG4gICAgICAgICAgICAweDJGNkY3Qzg3LCAweDU4Njg0QzExLCAweEMxNjExREFCLCAweEI2NjYyRDNELFxuICAgICAgICAgICAgMHg3NkRDNDE5MCwgMHgwMURCNzEwNiwgMHg5OEQyMjBCQywgMHhFRkQ1MTAyQSxcbiAgICAgICAgICAgIDB4NzFCMTg1ODksIDB4MDZCNkI1MUYsIDB4OUZCRkU0QTUsIDB4RThCOEQ0MzMsXG4gICAgICAgICAgICAweDc4MDdDOUEyLCAweDBGMDBGOTM0LCAweDk2MDlBODhFLCAweEUxMEU5ODE4LFxuICAgICAgICAgICAgMHg3RjZBMERCQiwgMHgwODZEM0QyRCwgMHg5MTY0NkM5NywgMHhFNjYzNUMwMSxcbiAgICAgICAgICAgIDB4NkI2QjUxRjQsIDB4MUM2QzYxNjIsIDB4ODU2NTMwRDgsIDB4RjI2MjAwNEUsXG4gICAgICAgICAgICAweDZDMDY5NUVELCAweDFCMDFBNTdCLCAweDgyMDhGNEMxLCAweEY1MEZDNDU3LFxuICAgICAgICAgICAgMHg2NUIwRDlDNiwgMHgxMkI3RTk1MCwgMHg4QkJFQjhFQSwgMHhGQ0I5ODg3QyxcbiAgICAgICAgICAgIDB4NjJERDFEREYsIDB4MTVEQTJENDksIDB4OENEMzdDRjMsIDB4RkJENDRDNjUsXG4gICAgICAgICAgICAweDREQjI2MTU4LCAweDNBQjU1MUNFLCAweEEzQkMwMDc0LCAweEQ0QkIzMEUyLFxuICAgICAgICAgICAgMHg0QURGQTU0MSwgMHgzREQ4OTVENywgMHhBNEQxQzQ2RCwgMHhEM0Q2RjRGQixcbiAgICAgICAgICAgIDB4NDM2OUU5NkEsIDB4MzQ2RUQ5RkMsIDB4QUQ2Nzg4NDYsIDB4REE2MEI4RDAsXG4gICAgICAgICAgICAweDQ0MDQyRDczLCAweDMzMDMxREU1LCAweEFBMEE0QzVGLCAweEREMEQ3Q0M5LFxuICAgICAgICAgICAgMHg1MDA1NzEzQywgMHgyNzAyNDFBQSwgMHhCRTBCMTAxMCwgMHhDOTBDMjA4NixcbiAgICAgICAgICAgIDB4NTc2OEI1MjUsIDB4MjA2Rjg1QjMsIDB4Qjk2NkQ0MDksIDB4Q0U2MUU0OUYsXG4gICAgICAgICAgICAweDVFREVGOTBFLCAweDI5RDlDOTk4LCAweEIwRDA5ODIyLCAweEM3RDdBOEI0LFxuICAgICAgICAgICAgMHg1OUIzM0QxNywgMHgyRUI0MEQ4MSwgMHhCN0JENUMzQiwgMHhDMEJBNkNBRCxcbiAgICAgICAgICAgIDB4RURCODgzMjAsIDB4OUFCRkIzQjYsIDB4MDNCNkUyMEMsIDB4NzRCMUQyOUEsXG4gICAgICAgICAgICAweEVBRDU0NzM5LCAweDlERDI3N0FGLCAweDA0REIyNjE1LCAweDczREMxNjgzLFxuICAgICAgICAgICAgMHhFMzYzMEIxMiwgMHg5NDY0M0I4NCwgMHgwRDZENkEzRSwgMHg3QTZBNUFBOCxcbiAgICAgICAgICAgIDB4RTQwRUNGMEIsIDB4OTMwOUZGOUQsIDB4MEEwMEFFMjcsIDB4N0QwNzlFQjEsXG4gICAgICAgICAgICAweEYwMEY5MzQ0LCAweDg3MDhBM0QyLCAweDFFMDFGMjY4LCAweDY5MDZDMkZFLFxuICAgICAgICAgICAgMHhGNzYyNTc1RCwgMHg4MDY1NjdDQiwgMHgxOTZDMzY3MSwgMHg2RTZCMDZFNyxcbiAgICAgICAgICAgIDB4RkVENDFCNzYsIDB4ODlEMzJCRTAsIDB4MTBEQTdBNUEsIDB4NjdERDRBQ0MsXG4gICAgICAgICAgICAweEY5QjlERjZGLCAweDhFQkVFRkY5LCAweDE3QjdCRTQzLCAweDYwQjA4RUQ1LFxuICAgICAgICAgICAgMHhENkQ2QTNFOCwgMHhBMUQxOTM3RSwgMHgzOEQ4QzJDNCwgMHg0RkRGRjI1MixcbiAgICAgICAgICAgIDB4RDFCQjY3RjEsIDB4QTZCQzU3NjcsIDB4M0ZCNTA2REQsIDB4NDhCMjM2NEIsXG4gICAgICAgICAgICAweEQ4MEQyQkRBLCAweEFGMEExQjRDLCAweDM2MDM0QUY2LCAweDQxMDQ3QTYwLFxuICAgICAgICAgICAgMHhERjYwRUZDMywgMHhBODY3REY1NSwgMHgzMTZFOEVFRiwgMHg0NjY5QkU3OSxcbiAgICAgICAgICAgIDB4Q0I2MUIzOEMsIDB4QkM2NjgzMUEsIDB4MjU2RkQyQTAsIDB4NTI2OEUyMzYsXG4gICAgICAgICAgICAweENDMEM3Nzk1LCAweEJCMEI0NzAzLCAweDIyMDIxNkI5LCAweDU1MDUyNjJGLFxuICAgICAgICAgICAgMHhDNUJBM0JCRSwgMHhCMkJEMEIyOCwgMHgyQkI0NUE5MiwgMHg1Q0IzNkEwNCxcbiAgICAgICAgICAgIDB4QzJEN0ZGQTcsIDB4QjVEMENGMzEsIDB4MkNEOTlFOEIsIDB4NUJERUFFMUQsXG4gICAgICAgICAgICAweDlCNjRDMkIwLCAweEVDNjNGMjI2LCAweDc1NkFBMzlDLCAweDAyNkQ5MzBBLFxuICAgICAgICAgICAgMHg5QzA5MDZBOSwgMHhFQjBFMzYzRiwgMHg3MjA3Njc4NSwgMHgwNTAwNTcxMyxcbiAgICAgICAgICAgIDB4OTVCRjRBODIsIDB4RTJCODdBMTQsIDB4N0JCMTJCQUUsIDB4MENCNjFCMzgsXG4gICAgICAgICAgICAweDkyRDI4RTlCLCAweEU1RDVCRTBELCAweDdDRENFRkI3LCAweDBCREJERjIxLFxuICAgICAgICAgICAgMHg4NkQzRDJENCwgMHhGMUQ0RTI0MiwgMHg2OEREQjNGOCwgMHgxRkRBODM2RSxcbiAgICAgICAgICAgIDB4ODFCRTE2Q0QsIDB4RjZCOTI2NUIsIDB4NkZCMDc3RTEsIDB4MThCNzQ3NzcsXG4gICAgICAgICAgICAweDg4MDg1QUU2LCAweEZGMEY2QTcwLCAweDY2MDYzQkNBLCAweDExMDEwQjVDLFxuICAgICAgICAgICAgMHg4RjY1OUVGRiwgMHhGODYyQUU2OSwgMHg2MTZCRkZEMywgMHgxNjZDQ0Y0NSxcbiAgICAgICAgICAgIDB4QTAwQUUyNzgsIDB4RDcwREQyRUUsIDB4NEUwNDgzNTQsIDB4MzkwM0IzQzIsXG4gICAgICAgICAgICAweEE3NjcyNjYxLCAweEQwNjAxNkY3LCAweDQ5Njk0NzRELCAweDNFNkU3N0RCLFxuICAgICAgICAgICAgMHhBRUQxNkE0QSwgMHhEOUQ2NUFEQywgMHg0MERGMEI2NiwgMHgzN0Q4M0JGMCxcbiAgICAgICAgICAgIDB4QTlCQ0FFNTMsIDB4REVCQjlFQzUsIDB4NDdCMkNGN0YsIDB4MzBCNUZGRTksXG4gICAgICAgICAgICAweEJEQkRGMjFDLCAweENBQkFDMjhBLCAweDUzQjM5MzMwLCAweDI0QjRBM0E2LFxuICAgICAgICAgICAgMHhCQUQwMzYwNSwgMHhDREQ3MDY5MywgMHg1NERFNTcyOSwgMHgyM0Q5NjdCRixcbiAgICAgICAgICAgIDB4QjM2NjdBMkUsIDB4QzQ2MTRBQjgsIDB4NUQ2ODFCMDIsIDB4MkE2RjJCOTQsXG4gICAgICAgICAgICAweEI0MEJCRTM3LCAweEMzMEM4RUExLCAweDVBMDVERjFCLCAweDJEMDJFRjhEXG4gICAgICAgICBdO1xuXG4gICAgICAgICBpZiAodHlwZW9mKGNyYykgPT0gXCJ1bmRlZmluZWRcIikgeyBjcmMgPSAwOyB9XG4gICAgICAgICB2YXIgeCA9IDA7XG4gICAgICAgICB2YXIgeSA9IDA7XG4gICAgICAgICB2YXIgYnl0ZSA9IDA7XG5cbiAgICAgICAgIGNyYyA9IGNyYyBeICgtMSk7XG4gICAgICAgICBmb3IoIHZhciBpID0gMCwgaVRvcCA9IGlucHV0Lmxlbmd0aDsgaSA8IGlUb3A7IGkrKyApIHtcbiAgICAgICAgICAgIGJ5dGUgPSBpc0FycmF5ID8gaW5wdXRbaV0gOiBpbnB1dC5jaGFyQ29kZUF0KGkpO1xuICAgICAgICAgICAgeSA9ICggY3JjIF4gYnl0ZSApICYgMHhGRjtcbiAgICAgICAgICAgIHggPSB0YWJsZVt5XTtcbiAgICAgICAgICAgIGNyYyA9ICggY3JjID4+PiA4ICkgXiB4O1xuICAgICAgICAgfVxuXG4gICAgICAgICByZXR1cm4gY3JjIF4gKC0xKTtcbiAgICAgIH0sXG5cbiAgICAgIC8vIEluc3BpcmVkIGJ5IGh0dHA6Ly9teS5vcGVyYS5jb20vR3JleVd5dmVybi9ibG9nL3Nob3cuZG1sLzE3MjUxNjVcbiAgICAgIGNsb25lIDogZnVuY3Rpb24oKSB7XG4gICAgICAgICB2YXIgbmV3T2JqID0gbmV3IEpTWmlwKCk7XG4gICAgICAgICBmb3IgKHZhciBpIGluIHRoaXMpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdGhpc1tpXSAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICBuZXdPYmpbaV0gPSB0aGlzW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgfVxuICAgICAgICAgcmV0dXJuIG5ld09iajtcbiAgICAgIH0sXG5cblxuICAgICAgLyoqXG4gICAgICAgKiBodHRwOi8vd3d3LndlYnRvb2xraXQuaW5mby9qYXZhc2NyaXB0LXV0ZjguaHRtbFxuICAgICAgICovXG4gICAgICB1dGY4ZW5jb2RlIDogZnVuY3Rpb24gKHN0cmluZykge1xuICAgICAgICAgLy8gVGV4dEVuY29kZXIgKyBVaW50OEFycmF5IHRvIGJpbmFyeSBzdHJpbmcgaXMgZmFzdGVyIHRoYW4gY2hlY2tpbmcgZXZlcnkgYnl0ZXMgb24gbG9uZyBzdHJpbmdzLlxuICAgICAgICAgLy8gaHR0cDovL2pzcGVyZi5jb20vdXRmOGVuY29kZS12cy10ZXh0ZW5jb2RlclxuICAgICAgICAgLy8gT24gc2hvcnQgc3RyaW5ncyAoZmlsZSBuYW1lcyBmb3IgZXhhbXBsZSksIHRoZSBUZXh0RW5jb2RlciBBUEkgaXMgKGN1cnJlbnRseSkgc2xvd2VyLlxuICAgICAgICAgaWYgKHRleHRFbmNvZGVyKSB7XG4gICAgICAgICAgICB2YXIgdTggPSB0ZXh0RW5jb2Rlci5lbmNvZGUoc3RyaW5nKTtcbiAgICAgICAgICAgIHJldHVybiBKU1ppcC51dGlscy50cmFuc2Zvcm1UbyhcInN0cmluZ1wiLCB1OCk7XG4gICAgICAgICB9XG4gICAgICAgICBpZiAoSlNaaXAuc3VwcG9ydC5ub2RlYnVmZmVyKSB7XG4gICAgICAgICAgICByZXR1cm4gSlNaaXAudXRpbHMudHJhbnNmb3JtVG8oXCJzdHJpbmdcIiwgbmV3IEJ1ZmZlcihzdHJpbmcsIFwidXRmLThcIikpO1xuICAgICAgICAgfVxuXG4gICAgICAgICAvLyBhcnJheS5qb2luIG1heSBiZSBzbG93ZXIgdGhhbiBzdHJpbmcgY29uY2F0ZW5hdGlvbiBidXQgZ2VuZXJhdGVzIGxlc3Mgb2JqZWN0cyAobGVzcyB0aW1lIHNwZW50IGdhcmJhZ2UgY29sbGVjdGluZykuXG4gICAgICAgICAvLyBTZWUgYWxzbyBodHRwOi8vanNwZXJmLmNvbS9hcnJheS1kaXJlY3QtYXNzaWdubWVudC12cy1wdXNoLzMxXG4gICAgICAgICB2YXIgcmVzdWx0ID0gW10sIHJlc0luZGV4ID0gMDtcblxuICAgICAgICAgZm9yICh2YXIgbiA9IDA7IG4gPCBzdHJpbmcubGVuZ3RoOyBuKyspIHtcblxuICAgICAgICAgICAgdmFyIGMgPSBzdHJpbmcuY2hhckNvZGVBdChuKTtcblxuICAgICAgICAgICAgaWYgKGMgPCAxMjgpIHtcbiAgICAgICAgICAgICAgIHJlc3VsdFtyZXNJbmRleCsrXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoYyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKChjID4gMTI3KSAmJiAoYyA8IDIwNDgpKSB7XG4gICAgICAgICAgICAgICByZXN1bHRbcmVzSW5kZXgrK10gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKChjID4+IDYpIHwgMTkyKTtcbiAgICAgICAgICAgICAgIHJlc3VsdFtyZXNJbmRleCsrXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoKGMgJiA2MykgfCAxMjgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgIHJlc3VsdFtyZXNJbmRleCsrXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoKGMgPj4gMTIpIHwgMjI0KTtcbiAgICAgICAgICAgICAgIHJlc3VsdFtyZXNJbmRleCsrXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoKChjID4+IDYpICYgNjMpIHwgMTI4KTtcbiAgICAgICAgICAgICAgIHJlc3VsdFtyZXNJbmRleCsrXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoKGMgJiA2MykgfCAxMjgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICB9XG5cbiAgICAgICAgIHJldHVybiByZXN1bHQuam9pbihcIlwiKTtcbiAgICAgIH0sXG5cbiAgICAgIC8qKlxuICAgICAgICogaHR0cDovL3d3dy53ZWJ0b29sa2l0LmluZm8vamF2YXNjcmlwdC11dGY4Lmh0bWxcbiAgICAgICAqL1xuICAgICAgdXRmOGRlY29kZSA6IGZ1bmN0aW9uIChpbnB1dCkge1xuICAgICAgICAgdmFyIHJlc3VsdCA9IFtdLCByZXNJbmRleCA9IDA7XG4gICAgICAgICB2YXIgdHlwZSA9IEpTWmlwLnV0aWxzLmdldFR5cGVPZihpbnB1dCk7XG4gICAgICAgICB2YXIgaXNBcnJheSA9IHR5cGUgIT09IFwic3RyaW5nXCI7XG4gICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgICB2YXIgYyA9IDAsIGMxID0gMCwgYzIgPSAwLCBjMyA9IDA7XG5cbiAgICAgICAgIC8vIGNoZWNrIGlmIHdlIGNhbiB1c2UgdGhlIFRleHREZWNvZGVyIEFQSVxuICAgICAgICAgLy8gc2VlIGh0dHA6Ly9lbmNvZGluZy5zcGVjLndoYXR3Zy5vcmcvI2FwaVxuICAgICAgICAgaWYgKHRleHREZWNvZGVyKSB7XG4gICAgICAgICAgICByZXR1cm4gdGV4dERlY29kZXIuZGVjb2RlKFxuICAgICAgICAgICAgICAgSlNaaXAudXRpbHMudHJhbnNmb3JtVG8oXCJ1aW50OGFycmF5XCIsIGlucHV0KVxuICAgICAgICAgICAgKTtcbiAgICAgICAgIH1cbiAgICAgICAgIGlmIChKU1ppcC5zdXBwb3J0Lm5vZGVidWZmZXIpIHtcbiAgICAgICAgICAgIHJldHVybiBKU1ppcC51dGlscy50cmFuc2Zvcm1UbyhcIm5vZGVidWZmZXJcIiwgaW5wdXQpLnRvU3RyaW5nKFwidXRmLThcIik7XG4gICAgICAgICB9XG5cbiAgICAgICAgIHdoaWxlICggaSA8IGlucHV0Lmxlbmd0aCApIHtcblxuICAgICAgICAgICAgYyA9IGlzQXJyYXkgPyBpbnB1dFtpXSA6IGlucHV0LmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgICAgIGlmIChjIDwgMTI4KSB7XG4gICAgICAgICAgICAgICByZXN1bHRbcmVzSW5kZXgrK10gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGMpO1xuICAgICAgICAgICAgICAgaSsrO1xuICAgICAgICAgICAgfSBlbHNlIGlmICgoYyA+IDE5MSkgJiYgKGMgPCAyMjQpKSB7XG4gICAgICAgICAgICAgICBjMiA9IGlzQXJyYXkgPyBpbnB1dFtpKzFdIDogaW5wdXQuY2hhckNvZGVBdChpKzEpO1xuICAgICAgICAgICAgICAgcmVzdWx0W3Jlc0luZGV4KytdID0gU3RyaW5nLmZyb21DaGFyQ29kZSgoKGMgJiAzMSkgPDwgNikgfCAoYzIgJiA2MykpO1xuICAgICAgICAgICAgICAgaSArPSAyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgIGMyID0gaXNBcnJheSA/IGlucHV0W2krMV0gOiBpbnB1dC5jaGFyQ29kZUF0KGkrMSk7XG4gICAgICAgICAgICAgICBjMyA9IGlzQXJyYXkgPyBpbnB1dFtpKzJdIDogaW5wdXQuY2hhckNvZGVBdChpKzIpO1xuICAgICAgICAgICAgICAgcmVzdWx0W3Jlc0luZGV4KytdID0gU3RyaW5nLmZyb21DaGFyQ29kZSgoKGMgJiAxNSkgPDwgMTIpIHwgKChjMiAmIDYzKSA8PCA2KSB8IChjMyAmIDYzKSk7XG4gICAgICAgICAgICAgICBpICs9IDM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgIH1cblxuICAgICAgICAgcmV0dXJuIHJlc3VsdC5qb2luKFwiXCIpO1xuICAgICAgfVxuICAgfTtcbn0oKSk7XG5cbi8qXG4gKiBDb21wcmVzc2lvbiBtZXRob2RzXG4gKiBUaGlzIG9iamVjdCBpcyBmaWxsZWQgaW4gYXMgZm9sbG93IDpcbiAqIG5hbWUgOiB7XG4gKiAgICBtYWdpYyAvLyB0aGUgMiBieXRlcyBpbmRlbnRpZnlpbmcgdGhlIGNvbXByZXNzaW9uIG1ldGhvZFxuICogICAgY29tcHJlc3MgLy8gZnVuY3Rpb24sIHRha2UgdGhlIHVuY29tcHJlc3NlZCBjb250ZW50IGFuZCByZXR1cm4gaXQgY29tcHJlc3NlZC5cbiAqICAgIHVuY29tcHJlc3MgLy8gZnVuY3Rpb24sIHRha2UgdGhlIGNvbXByZXNzZWQgY29udGVudCBhbmQgcmV0dXJuIGl0IHVuY29tcHJlc3NlZC5cbiAqICAgIGNvbXByZXNzSW5wdXRUeXBlIC8vIHN0cmluZywgdGhlIHR5cGUgYWNjZXB0ZWQgYnkgdGhlIGNvbXByZXNzIG1ldGhvZC4gbnVsbCB0byBhY2NlcHQgZXZlcnl0aGluZy5cbiAqICAgIHVuY29tcHJlc3NJbnB1dFR5cGUgLy8gc3RyaW5nLCB0aGUgdHlwZSBhY2NlcHRlZCBieSB0aGUgdW5jb21wcmVzcyBtZXRob2QuIG51bGwgdG8gYWNjZXB0IGV2ZXJ5dGhpbmcuXG4gKiB9XG4gKlxuICogU1RPUkUgaXMgdGhlIGRlZmF1bHQgY29tcHJlc3Npb24gbWV0aG9kLCBzbyBpdCdzIGluY2x1ZGVkIGluIHRoaXMgZmlsZS5cbiAqIE90aGVyIG1ldGhvZHMgc2hvdWxkIGdvIHRvIHNlcGFyYXRlZCBmaWxlcyA6IHRoZSB1c2VyIHdhbnRzIG1vZHVsYXJpdHkuXG4gKi9cbkpTWmlwLmNvbXByZXNzaW9ucyA9IHtcbiAgIFwiU1RPUkVcIiA6IHtcbiAgICAgIG1hZ2ljIDogXCJcXHgwMFxceDAwXCIsXG4gICAgICBjb21wcmVzcyA6IGZ1bmN0aW9uIChjb250ZW50KSB7XG4gICAgICAgICByZXR1cm4gY29udGVudDsgLy8gbm8gY29tcHJlc3Npb25cbiAgICAgIH0sXG4gICAgICB1bmNvbXByZXNzIDogZnVuY3Rpb24gKGNvbnRlbnQpIHtcbiAgICAgICAgIHJldHVybiBjb250ZW50OyAvLyBubyBjb21wcmVzc2lvblxuICAgICAgfSxcbiAgICAgIGNvbXByZXNzSW5wdXRUeXBlIDogbnVsbCxcbiAgICAgIHVuY29tcHJlc3NJbnB1dFR5cGUgOiBudWxsXG4gICB9XG59O1xuXG4oZnVuY3Rpb24gKCkge1xuICAgSlNaaXAudXRpbHMgPSB7XG4gICAgICAvKipcbiAgICAgICAqIENvbnZlcnQgYSBzdHJpbmcgdG8gYSBcImJpbmFyeSBzdHJpbmdcIiA6IGEgc3RyaW5nIGNvbnRhaW5pbmcgb25seSBjaGFyIGNvZGVzIGJldHdlZW4gMCBhbmQgMjU1LlxuICAgICAgICogQHBhcmFtIHtzdHJpbmd9IHN0ciB0aGUgc3RyaW5nIHRvIHRyYW5zZm9ybS5cbiAgICAgICAqIEByZXR1cm4ge1N0cmluZ30gdGhlIGJpbmFyeSBzdHJpbmcuXG4gICAgICAgKi9cbiAgICAgIHN0cmluZzJiaW5hcnkgOiBmdW5jdGlvbiAoc3RyKSB7XG4gICAgICAgICB2YXIgcmVzdWx0ID0gXCJcIjtcbiAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICByZXN1bHQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShzdHIuY2hhckNvZGVBdChpKSAmIDB4ZmYpO1xuICAgICAgICAgfVxuICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH0sXG4gICAgICAvKipcbiAgICAgICAqIENyZWF0ZSBhIFVpbnQ4QXJyYXkgZnJvbSB0aGUgc3RyaW5nLlxuICAgICAgICogQHBhcmFtIHtzdHJpbmd9IHN0ciB0aGUgc3RyaW5nIHRvIHRyYW5zZm9ybS5cbiAgICAgICAqIEByZXR1cm4ge1VpbnQ4QXJyYXl9IHRoZSB0eXBlZCBhcnJheS5cbiAgICAgICAqIEB0aHJvd3Mge0Vycm9yfSBhbiBFcnJvciBpZiB0aGUgYnJvd3NlciBkb2Vzbid0IHN1cHBvcnQgdGhlIHJlcXVlc3RlZCBmZWF0dXJlLlxuICAgICAgICogQGRlcHJlY2F0ZWQgOiB1c2UgSlNaaXAudXRpbHMudHJhbnNmb3JtVG8gaW5zdGVhZC5cbiAgICAgICAqL1xuICAgICAgc3RyaW5nMlVpbnQ4QXJyYXkgOiBmdW5jdGlvbiAoc3RyKSB7XG4gICAgICAgICByZXR1cm4gSlNaaXAudXRpbHMudHJhbnNmb3JtVG8oXCJ1aW50OGFycmF5XCIsIHN0cik7XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIENyZWF0ZSBhIHN0cmluZyBmcm9tIHRoZSBVaW50OEFycmF5LlxuICAgICAgICogQHBhcmFtIHtVaW50OEFycmF5fSBhcnJheSB0aGUgYXJyYXkgdG8gdHJhbnNmb3JtLlxuICAgICAgICogQHJldHVybiB7c3RyaW5nfSB0aGUgc3RyaW5nLlxuICAgICAgICogQHRocm93cyB7RXJyb3J9IGFuIEVycm9yIGlmIHRoZSBicm93c2VyIGRvZXNuJ3Qgc3VwcG9ydCB0aGUgcmVxdWVzdGVkIGZlYXR1cmUuXG4gICAgICAgKiBAZGVwcmVjYXRlZCA6IHVzZSBKU1ppcC51dGlscy50cmFuc2Zvcm1UbyBpbnN0ZWFkLlxuICAgICAgICovXG4gICAgICB1aW50OEFycmF5MlN0cmluZyA6IGZ1bmN0aW9uIChhcnJheSkge1xuICAgICAgICAgcmV0dXJuIEpTWmlwLnV0aWxzLnRyYW5zZm9ybVRvKFwic3RyaW5nXCIsIGFycmF5KTtcbiAgICAgIH0sXG4gICAgICAvKipcbiAgICAgICAqIENyZWF0ZSBhIGJsb2IgZnJvbSB0aGUgZ2l2ZW4gQXJyYXlCdWZmZXIuXG4gICAgICAgKiBAcGFyYW0ge0FycmF5QnVmZmVyfSBidWZmZXIgdGhlIGJ1ZmZlciB0byB0cmFuc2Zvcm0uXG4gICAgICAgKiBAcmV0dXJuIHtCbG9ifSB0aGUgcmVzdWx0LlxuICAgICAgICogQHRocm93cyB7RXJyb3J9IGFuIEVycm9yIGlmIHRoZSBicm93c2VyIGRvZXNuJ3Qgc3VwcG9ydCB0aGUgcmVxdWVzdGVkIGZlYXR1cmUuXG4gICAgICAgKi9cbiAgICAgIGFycmF5QnVmZmVyMkJsb2IgOiBmdW5jdGlvbiAoYnVmZmVyKSB7XG4gICAgICAgICBKU1ppcC51dGlscy5jaGVja1N1cHBvcnQoXCJibG9iXCIpO1xuXG4gICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gQmxvYiBjb25zdHJ1Y3RvclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBCbG9iKFtidWZmZXJdLCB7IHR5cGU6IFwiYXBwbGljYXRpb24vemlwXCIgfSk7XG4gICAgICAgICB9XG4gICAgICAgICBjYXRjaChlKSB7fVxuXG4gICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gZGVwcmVjYXRlZCwgYnJvd3NlciBvbmx5LCBvbGQgd2F5XG4gICAgICAgICAgICB2YXIgQmxvYkJ1aWxkZXIgPSB3aW5kb3cuQmxvYkJ1aWxkZXIgfHwgd2luZG93LldlYktpdEJsb2JCdWlsZGVyIHx8IHdpbmRvdy5Nb3pCbG9iQnVpbGRlciB8fCB3aW5kb3cuTVNCbG9iQnVpbGRlcjtcbiAgICAgICAgICAgIHZhciBidWlsZGVyID0gbmV3IEJsb2JCdWlsZGVyKCk7XG4gICAgICAgICAgICBidWlsZGVyLmFwcGVuZChidWZmZXIpO1xuICAgICAgICAgICAgcmV0dXJuIGJ1aWxkZXIuZ2V0QmxvYignYXBwbGljYXRpb24vemlwJyk7XG4gICAgICAgICB9XG4gICAgICAgICBjYXRjaChlKSB7fVxuXG4gICAgICAgICAvLyB3ZWxsLCBmdWNrID8hXG4gICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJCdWcgOiBjYW4ndCBjb25zdHJ1Y3QgdGhlIEJsb2IuXCIpO1xuICAgICAgfSxcbiAgICAgIC8qKlxuICAgICAgICogQ3JlYXRlIGEgYmxvYiBmcm9tIHRoZSBnaXZlbiBzdHJpbmcuXG4gICAgICAgKiBAcGFyYW0ge3N0cmluZ30gc3RyIHRoZSBzdHJpbmcgdG8gdHJhbnNmb3JtLlxuICAgICAgICogQHJldHVybiB7QmxvYn0gdGhlIHJlc3VsdC5cbiAgICAgICAqIEB0aHJvd3Mge0Vycm9yfSBhbiBFcnJvciBpZiB0aGUgYnJvd3NlciBkb2Vzbid0IHN1cHBvcnQgdGhlIHJlcXVlc3RlZCBmZWF0dXJlLlxuICAgICAgICovXG4gICAgICBzdHJpbmcyQmxvYiA6IGZ1bmN0aW9uIChzdHIpIHtcbiAgICAgICAgIHZhciBidWZmZXIgPSBKU1ppcC51dGlscy50cmFuc2Zvcm1UbyhcImFycmF5YnVmZmVyXCIsIHN0cik7XG4gICAgICAgICByZXR1cm4gSlNaaXAudXRpbHMuYXJyYXlCdWZmZXIyQmxvYihidWZmZXIpO1xuICAgICAgfVxuICAgfTtcblxuICAgLyoqXG4gICAgKiBUaGUgaWRlbnRpdHkgZnVuY3Rpb24uXG4gICAgKiBAcGFyYW0ge09iamVjdH0gaW5wdXQgdGhlIGlucHV0LlxuICAgICogQHJldHVybiB7T2JqZWN0fSB0aGUgc2FtZSBpbnB1dC5cbiAgICAqL1xuICAgZnVuY3Rpb24gaWRlbnRpdHkoaW5wdXQpIHtcbiAgICAgIHJldHVybiBpbnB1dDtcbiAgIH1cblxuICAgLyoqXG4gICAgKiBGaWxsIGluIGFuIGFycmF5IHdpdGggYSBzdHJpbmcuXG4gICAgKiBAcGFyYW0ge1N0cmluZ30gc3RyIHRoZSBzdHJpbmcgdG8gdXNlLlxuICAgICogQHBhcmFtIHtBcnJheXxBcnJheUJ1ZmZlcnxVaW50OEFycmF5fEJ1ZmZlcn0gYXJyYXkgdGhlIGFycmF5IHRvIGZpbGwgaW4gKHdpbGwgYmUgbXV0YXRlZCkuXG4gICAgKiBAcmV0dXJuIHtBcnJheXxBcnJheUJ1ZmZlcnxVaW50OEFycmF5fEJ1ZmZlcn0gdGhlIHVwZGF0ZWQgYXJyYXkuXG4gICAgKi9cbiAgIGZ1bmN0aW9uIHN0cmluZ1RvQXJyYXlMaWtlKHN0ciwgYXJyYXkpIHtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICBhcnJheVtpXSA9IHN0ci5jaGFyQ29kZUF0KGkpICYgMHhGRjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhcnJheTtcbiAgIH1cblxuICAgLyoqXG4gICAgKiBUcmFuc2Zvcm0gYW4gYXJyYXktbGlrZSBvYmplY3QgdG8gYSBzdHJpbmcuXG4gICAgKiBAcGFyYW0ge0FycmF5fEFycmF5QnVmZmVyfFVpbnQ4QXJyYXl8QnVmZmVyfSBhcnJheSB0aGUgYXJyYXkgdG8gdHJhbnNmb3JtLlxuICAgICogQHJldHVybiB7U3RyaW5nfSB0aGUgcmVzdWx0LlxuICAgICovXG4gICBmdW5jdGlvbiBhcnJheUxpa2VUb1N0cmluZyhhcnJheSkge1xuICAgICAgLy8gUGVyZm9ybWFuY2VzIG5vdGVzIDpcbiAgICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAvLyBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGFycmF5KSBpcyB0aGUgZmFzdGVzdCwgc2VlXG4gICAgICAvLyBzZWUgaHR0cDovL2pzcGVyZi5jb20vY29udmVydGluZy1hLXVpbnQ4YXJyYXktdG8tYS1zdHJpbmcvMlxuICAgICAgLy8gYnV0IHRoZSBzdGFjayBpcyBsaW1pdGVkIChhbmQgd2UgY2FuIGdldCBodWdlIGFycmF5cyAhKS5cbiAgICAgIC8vXG4gICAgICAvLyByZXN1bHQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShhcnJheVtpXSk7IGdlbmVyYXRlIHRvbyBtYW55IHN0cmluZ3MgIVxuICAgICAgLy9cbiAgICAgIC8vIFRoaXMgY29kZSBpcyBpbnNwaXJlZCBieSBodHRwOi8vanNwZXJmLmNvbS9hcnJheWJ1ZmZlci10by1zdHJpbmctYXBwbHktcGVyZm9ybWFuY2UvMlxuICAgICAgdmFyIGNodW5rID0gNjU1MzY7XG4gICAgICB2YXIgcmVzdWx0ID0gW10sIGxlbiA9IGFycmF5Lmxlbmd0aCwgdHlwZSA9IEpTWmlwLnV0aWxzLmdldFR5cGVPZihhcnJheSksIGsgPSAwO1xuXG4gICAgICB2YXIgY2FuVXNlQXBwbHkgPSB0cnVlO1xuICAgICAgdHJ5IHtcbiAgICAgICAgIHN3aXRjaCh0eXBlKSB7XG4gICAgICAgICAgICBjYXNlIFwidWludDhhcnJheVwiOlxuICAgICAgICAgICAgICAgU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBuZXcgVWludDhBcnJheSgwKSk7XG4gICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJub2RlYnVmZmVyXCI6XG4gICAgICAgICAgICAgICBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIG5ldyBCdWZmZXIoMCkpO1xuICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICB9XG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgIGNhblVzZUFwcGx5ID0gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIC8vIG5vIGFwcGx5IDogc2xvdyBhbmQgcGFpbmZ1bCBhbGdvcml0aG1cbiAgICAgIC8vIGRlZmF1bHQgYnJvd3NlciBvbiBhbmRyb2lkIDQuKlxuICAgICAgaWYgKCFjYW5Vc2VBcHBseSkge1xuICAgICAgICAgdmFyIHJlc3VsdFN0ciA9IFwiXCI7XG4gICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoO2krKykge1xuICAgICAgICAgICAgcmVzdWx0U3RyICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYXJyYXlbaV0pO1xuICAgICAgICAgfVxuICAgICAgICAgcmV0dXJuIHJlc3VsdFN0cjtcbiAgICAgIH1cblxuICAgICAgd2hpbGUgKGsgPCBsZW4gJiYgY2h1bmsgPiAxKSB7XG4gICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKHR5cGUgPT09IFwiYXJyYXlcIiB8fCB0eXBlID09PSBcIm5vZGVidWZmZXJcIikge1xuICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBhcnJheS5zbGljZShrLCBNYXRoLm1pbihrICsgY2h1bmssIGxlbikpKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBhcnJheS5zdWJhcnJheShrLCBNYXRoLm1pbihrICsgY2h1bmssIGxlbikpKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBrICs9IGNodW5rO1xuICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY2h1bmsgPSBNYXRoLmZsb29yKGNodW5rIC8gMik7XG4gICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0LmpvaW4oXCJcIik7XG4gICB9XG5cbiAgIC8qKlxuICAgICogQ29weSB0aGUgZGF0YSBmcm9tIGFuIGFycmF5LWxpa2UgdG8gYW4gb3RoZXIgYXJyYXktbGlrZS5cbiAgICAqIEBwYXJhbSB7QXJyYXl8QXJyYXlCdWZmZXJ8VWludDhBcnJheXxCdWZmZXJ9IGFycmF5RnJvbSB0aGUgb3JpZ2luIGFycmF5LlxuICAgICogQHBhcmFtIHtBcnJheXxBcnJheUJ1ZmZlcnxVaW50OEFycmF5fEJ1ZmZlcn0gYXJyYXlUbyB0aGUgZGVzdGluYXRpb24gYXJyYXkgd2hpY2ggd2lsbCBiZSBtdXRhdGVkLlxuICAgICogQHJldHVybiB7QXJyYXl8QXJyYXlCdWZmZXJ8VWludDhBcnJheXxCdWZmZXJ9IHRoZSB1cGRhdGVkIGRlc3RpbmF0aW9uIGFycmF5LlxuICAgICovXG4gICBmdW5jdGlvbiBhcnJheUxpa2VUb0FycmF5TGlrZShhcnJheUZyb20sIGFycmF5VG8pIHtcbiAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBhcnJheUZyb20ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgIGFycmF5VG9baV0gPSBhcnJheUZyb21baV07XG4gICAgICB9XG4gICAgICByZXR1cm4gYXJyYXlUbztcbiAgIH1cblxuICAgLy8gYSBtYXRyaXggY29udGFpbmluZyBmdW5jdGlvbnMgdG8gdHJhbnNmb3JtIGV2ZXJ5dGhpbmcgaW50byBldmVyeXRoaW5nLlxuICAgdmFyIHRyYW5zZm9ybSA9IHt9O1xuXG4gICAvLyBzdHJpbmcgdG8gP1xuICAgdHJhbnNmb3JtW1wic3RyaW5nXCJdID0ge1xuICAgICAgXCJzdHJpbmdcIiA6IGlkZW50aXR5LFxuICAgICAgXCJhcnJheVwiIDogZnVuY3Rpb24gKGlucHV0KSB7XG4gICAgICAgICByZXR1cm4gc3RyaW5nVG9BcnJheUxpa2UoaW5wdXQsIG5ldyBBcnJheShpbnB1dC5sZW5ndGgpKTtcbiAgICAgIH0sXG4gICAgICBcImFycmF5YnVmZmVyXCIgOiBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgICAgICAgIHJldHVybiB0cmFuc2Zvcm1bXCJzdHJpbmdcIl1bXCJ1aW50OGFycmF5XCJdKGlucHV0KS5idWZmZXI7XG4gICAgICB9LFxuICAgICAgXCJ1aW50OGFycmF5XCIgOiBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgICAgICAgIHJldHVybiBzdHJpbmdUb0FycmF5TGlrZShpbnB1dCwgbmV3IFVpbnQ4QXJyYXkoaW5wdXQubGVuZ3RoKSk7XG4gICAgICB9LFxuICAgICAgXCJub2RlYnVmZmVyXCIgOiBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgICAgICAgIHJldHVybiBzdHJpbmdUb0FycmF5TGlrZShpbnB1dCwgbmV3IEJ1ZmZlcihpbnB1dC5sZW5ndGgpKTtcbiAgICAgIH1cbiAgIH07XG5cbiAgIC8vIGFycmF5IHRvID9cbiAgIHRyYW5zZm9ybVtcImFycmF5XCJdID0ge1xuICAgICAgXCJzdHJpbmdcIiA6IGFycmF5TGlrZVRvU3RyaW5nLFxuICAgICAgXCJhcnJheVwiIDogaWRlbnRpdHksXG4gICAgICBcImFycmF5YnVmZmVyXCIgOiBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgICAgICAgIHJldHVybiAobmV3IFVpbnQ4QXJyYXkoaW5wdXQpKS5idWZmZXI7XG4gICAgICB9LFxuICAgICAgXCJ1aW50OGFycmF5XCIgOiBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgICAgICAgIHJldHVybiBuZXcgVWludDhBcnJheShpbnB1dCk7XG4gICAgICB9LFxuICAgICAgXCJub2RlYnVmZmVyXCIgOiBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgICAgICAgIHJldHVybiBuZXcgQnVmZmVyKGlucHV0KTtcbiAgICAgIH1cbiAgIH07XG5cbiAgIC8vIGFycmF5YnVmZmVyIHRvID9cbiAgIHRyYW5zZm9ybVtcImFycmF5YnVmZmVyXCJdID0ge1xuICAgICAgXCJzdHJpbmdcIiA6IGZ1bmN0aW9uIChpbnB1dCkge1xuICAgICAgICAgcmV0dXJuIGFycmF5TGlrZVRvU3RyaW5nKG5ldyBVaW50OEFycmF5KGlucHV0KSk7XG4gICAgICB9LFxuICAgICAgXCJhcnJheVwiIDogZnVuY3Rpb24gKGlucHV0KSB7XG4gICAgICAgICByZXR1cm4gYXJyYXlMaWtlVG9BcnJheUxpa2UobmV3IFVpbnQ4QXJyYXkoaW5wdXQpLCBuZXcgQXJyYXkoaW5wdXQuYnl0ZUxlbmd0aCkpO1xuICAgICAgfSxcbiAgICAgIFwiYXJyYXlidWZmZXJcIiA6IGlkZW50aXR5LFxuICAgICAgXCJ1aW50OGFycmF5XCIgOiBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgICAgICAgIHJldHVybiBuZXcgVWludDhBcnJheShpbnB1dCk7XG4gICAgICB9LFxuICAgICAgXCJub2RlYnVmZmVyXCIgOiBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgICAgICAgIHJldHVybiBuZXcgQnVmZmVyKG5ldyBVaW50OEFycmF5KGlucHV0KSk7XG4gICAgICB9XG4gICB9O1xuXG4gICAvLyB1aW50OGFycmF5IHRvID9cbiAgIHRyYW5zZm9ybVtcInVpbnQ4YXJyYXlcIl0gPSB7XG4gICAgICBcInN0cmluZ1wiIDogYXJyYXlMaWtlVG9TdHJpbmcsXG4gICAgICBcImFycmF5XCIgOiBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgICAgICAgIHJldHVybiBhcnJheUxpa2VUb0FycmF5TGlrZShpbnB1dCwgbmV3IEFycmF5KGlucHV0Lmxlbmd0aCkpO1xuICAgICAgfSxcbiAgICAgIFwiYXJyYXlidWZmZXJcIiA6IGZ1bmN0aW9uIChpbnB1dCkge1xuICAgICAgICAgcmV0dXJuIGlucHV0LmJ1ZmZlcjtcbiAgICAgIH0sXG4gICAgICBcInVpbnQ4YXJyYXlcIiA6IGlkZW50aXR5LFxuICAgICAgXCJub2RlYnVmZmVyXCIgOiBmdW5jdGlvbihpbnB1dCkge1xuICAgICAgICAgcmV0dXJuIG5ldyBCdWZmZXIoaW5wdXQpO1xuICAgICAgfVxuICAgfTtcblxuICAgLy8gbm9kZWJ1ZmZlciB0byA/XG4gICB0cmFuc2Zvcm1bXCJub2RlYnVmZmVyXCJdID0ge1xuICAgICAgXCJzdHJpbmdcIiA6IGFycmF5TGlrZVRvU3RyaW5nLFxuICAgICAgXCJhcnJheVwiIDogZnVuY3Rpb24gKGlucHV0KSB7XG4gICAgICAgICByZXR1cm4gYXJyYXlMaWtlVG9BcnJheUxpa2UoaW5wdXQsIG5ldyBBcnJheShpbnB1dC5sZW5ndGgpKTtcbiAgICAgIH0sXG4gICAgICBcImFycmF5YnVmZmVyXCIgOiBmdW5jdGlvbiAoaW5wdXQpIHtcbiAgICAgICAgIHJldHVybiB0cmFuc2Zvcm1bXCJub2RlYnVmZmVyXCJdW1widWludDhhcnJheVwiXShpbnB1dCkuYnVmZmVyO1xuICAgICAgfSxcbiAgICAgIFwidWludDhhcnJheVwiIDogZnVuY3Rpb24gKGlucHV0KSB7XG4gICAgICAgICByZXR1cm4gYXJyYXlMaWtlVG9BcnJheUxpa2UoaW5wdXQsIG5ldyBVaW50OEFycmF5KGlucHV0Lmxlbmd0aCkpO1xuICAgICAgfSxcbiAgICAgIFwibm9kZWJ1ZmZlclwiIDogaWRlbnRpdHlcbiAgIH07XG5cbiAgIC8qKlxuICAgICogVHJhbnNmb3JtIGFuIGlucHV0IGludG8gYW55IHR5cGUuXG4gICAgKiBUaGUgc3VwcG9ydGVkIG91dHB1dCB0eXBlIGFyZSA6IHN0cmluZywgYXJyYXksIHVpbnQ4YXJyYXksIGFycmF5YnVmZmVyLCBub2RlYnVmZmVyLlxuICAgICogSWYgbm8gb3V0cHV0IHR5cGUgaXMgc3BlY2lmaWVkLCB0aGUgdW5tb2RpZmllZCBpbnB1dCB3aWxsIGJlIHJldHVybmVkLlxuICAgICogQHBhcmFtIHtTdHJpbmd9IG91dHB1dFR5cGUgdGhlIG91dHB1dCB0eXBlLlxuICAgICogQHBhcmFtIHtTdHJpbmd8QXJyYXl8QXJyYXlCdWZmZXJ8VWludDhBcnJheXxCdWZmZXJ9IGlucHV0IHRoZSBpbnB1dCB0byBjb252ZXJ0LlxuICAgICogQHRocm93cyB7RXJyb3J9IGFuIEVycm9yIGlmIHRoZSBicm93c2VyIGRvZXNuJ3Qgc3VwcG9ydCB0aGUgcmVxdWVzdGVkIG91dHB1dCB0eXBlLlxuICAgICovXG4gICBKU1ppcC51dGlscy50cmFuc2Zvcm1UbyA9IGZ1bmN0aW9uIChvdXRwdXRUeXBlLCBpbnB1dCkge1xuICAgICAgaWYgKCFpbnB1dCkge1xuICAgICAgICAgLy8gdW5kZWZpbmVkLCBudWxsLCBldGNcbiAgICAgICAgIC8vIGFuIGVtcHR5IHN0cmluZyB3b24ndCBoYXJtLlxuICAgICAgICAgaW5wdXQgPSBcIlwiO1xuICAgICAgfVxuICAgICAgaWYgKCFvdXRwdXRUeXBlKSB7XG4gICAgICAgICByZXR1cm4gaW5wdXQ7XG4gICAgICB9XG4gICAgICBKU1ppcC51dGlscy5jaGVja1N1cHBvcnQob3V0cHV0VHlwZSk7XG4gICAgICB2YXIgaW5wdXRUeXBlID0gSlNaaXAudXRpbHMuZ2V0VHlwZU9mKGlucHV0KTtcbiAgICAgIHZhciByZXN1bHQgPSB0cmFuc2Zvcm1baW5wdXRUeXBlXVtvdXRwdXRUeXBlXShpbnB1dCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgfTtcblxuICAgLyoqXG4gICAgKiBSZXR1cm4gdGhlIHR5cGUgb2YgdGhlIGlucHV0LlxuICAgICogVGhlIHR5cGUgd2lsbCBiZSBpbiBhIGZvcm1hdCB2YWxpZCBmb3IgSlNaaXAudXRpbHMudHJhbnNmb3JtVG8gOiBzdHJpbmcsIGFycmF5LCB1aW50OGFycmF5LCBhcnJheWJ1ZmZlci5cbiAgICAqIEBwYXJhbSB7T2JqZWN0fSBpbnB1dCB0aGUgaW5wdXQgdG8gaWRlbnRpZnkuXG4gICAgKiBAcmV0dXJuIHtTdHJpbmd9IHRoZSAobG93ZXJjYXNlKSB0eXBlIG9mIHRoZSBpbnB1dC5cbiAgICAqL1xuICAgSlNaaXAudXRpbHMuZ2V0VHlwZU9mID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gICAgICBpZiAodHlwZW9mIGlucHV0ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICByZXR1cm4gXCJzdHJpbmdcIjtcbiAgICAgIH1cbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoaW5wdXQpID09PSBcIltvYmplY3QgQXJyYXldXCIpIHtcbiAgICAgICAgIHJldHVybiBcImFycmF5XCI7XG4gICAgICB9XG4gICAgICBpZiAoSlNaaXAuc3VwcG9ydC5ub2RlYnVmZmVyICYmIEJ1ZmZlci5pc0J1ZmZlcihpbnB1dCkpIHtcbiAgICAgICAgIHJldHVybiBcIm5vZGVidWZmZXJcIjtcbiAgICAgIH1cbiAgICAgIGlmIChKU1ppcC5zdXBwb3J0LnVpbnQ4YXJyYXkgJiYgaW5wdXQgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XG4gICAgICAgICByZXR1cm4gXCJ1aW50OGFycmF5XCI7XG4gICAgICB9XG4gICAgICBpZiAoSlNaaXAuc3VwcG9ydC5hcnJheWJ1ZmZlciAmJiBpbnB1dCBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG4gICAgICAgICByZXR1cm4gXCJhcnJheWJ1ZmZlclwiO1xuICAgICAgfVxuICAgfTtcblxuICAgLyoqXG4gICAgKiBDcm9zcy13aW5kb3csIGNyb3NzLU5vZGUtY29udGV4dCByZWd1bGFyIGV4cHJlc3Npb24gZGV0ZWN0aW9uXG4gICAgKiBAcGFyYW0gIHtPYmplY3R9ICBvYmplY3QgQW55dGhpbmdcbiAgICAqIEByZXR1cm4ge0Jvb2xlYW59ICAgICAgICB0cnVlIGlmIHRoZSBvYmplY3QgaXMgYSByZWd1bGFyIGV4cHJlc3Npb24sXG4gICAgKiBmYWxzZSBvdGhlcndpc2VcbiAgICAqL1xuICAgSlNaaXAudXRpbHMuaXNSZWdFeHAgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iamVjdCkgPT09IFwiW29iamVjdCBSZWdFeHBdXCI7XG4gICB9O1xuXG4gICAvKipcbiAgICAqIFRocm93IGFuIGV4Y2VwdGlvbiBpZiB0aGUgdHlwZSBpcyBub3Qgc3VwcG9ydGVkLlxuICAgICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgdGhlIHR5cGUgdG8gY2hlY2suXG4gICAgKiBAdGhyb3dzIHtFcnJvcn0gYW4gRXJyb3IgaWYgdGhlIGJyb3dzZXIgZG9lc24ndCBzdXBwb3J0IHRoZSByZXF1ZXN0ZWQgdHlwZS5cbiAgICAqL1xuICAgSlNaaXAudXRpbHMuY2hlY2tTdXBwb3J0ID0gZnVuY3Rpb24gKHR5cGUpIHtcbiAgICAgIHZhciBzdXBwb3J0ZWQgPSB0cnVlO1xuICAgICAgc3dpdGNoICh0eXBlLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgICAgIGNhc2UgXCJ1aW50OGFycmF5XCI6XG4gICAgICAgICAgICBzdXBwb3J0ZWQgPSBKU1ppcC5zdXBwb3J0LnVpbnQ4YXJyYXk7XG4gICAgICAgICBicmVhaztcbiAgICAgICAgIGNhc2UgXCJhcnJheWJ1ZmZlclwiOlxuICAgICAgICAgICAgc3VwcG9ydGVkID0gSlNaaXAuc3VwcG9ydC5hcnJheWJ1ZmZlcjtcbiAgICAgICAgIGJyZWFrO1xuICAgICAgICAgY2FzZSBcIm5vZGVidWZmZXJcIjpcbiAgICAgICAgICAgIHN1cHBvcnRlZCA9IEpTWmlwLnN1cHBvcnQubm9kZWJ1ZmZlcjtcbiAgICAgICAgIGJyZWFrO1xuICAgICAgICAgY2FzZSBcImJsb2JcIjpcbiAgICAgICAgICAgIHN1cHBvcnRlZCA9IEpTWmlwLnN1cHBvcnQuYmxvYjtcbiAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgaWYgKCFzdXBwb3J0ZWQpIHtcbiAgICAgICAgIHRocm93IG5ldyBFcnJvcih0eXBlICsgXCIgaXMgbm90IHN1cHBvcnRlZCBieSB0aGlzIGJyb3dzZXJcIik7XG4gICAgICB9XG4gICB9O1xuXG5cbn0pKCk7XG5cbihmdW5jdGlvbiAoKXtcbiAgIC8qKlxuICAgICogUmVwcmVzZW50cyBhbiBlbnRyeSBpbiB0aGUgemlwLlxuICAgICogVGhlIGNvbnRlbnQgbWF5IG9yIG1heSBub3QgYmUgY29tcHJlc3NlZC5cbiAgICAqIEBjb25zdHJ1Y3RvclxuICAgICovXG4gICBKU1ppcC5Db21wcmVzc2VkT2JqZWN0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgdGhpcy5jb21wcmVzc2VkU2l6ZSA9IDA7XG4gICAgICAgICB0aGlzLnVuY29tcHJlc3NlZFNpemUgPSAwO1xuICAgICAgICAgdGhpcy5jcmMzMiA9IDA7XG4gICAgICAgICB0aGlzLmNvbXByZXNzaW9uTWV0aG9kID0gbnVsbDtcbiAgICAgICAgIHRoaXMuY29tcHJlc3NlZENvbnRlbnQgPSBudWxsO1xuICAgfTtcblxuICAgSlNaaXAuQ29tcHJlc3NlZE9iamVjdC5wcm90b3R5cGUgPSB7XG4gICAgICAvKipcbiAgICAgICAqIFJldHVybiB0aGUgZGVjb21wcmVzc2VkIGNvbnRlbnQgaW4gYW4gdW5zcGVjaWZpZWQgZm9ybWF0LlxuICAgICAgICogVGhlIGZvcm1hdCB3aWxsIGRlcGVuZCBvbiB0aGUgZGVjb21wcmVzc29yLlxuICAgICAgICogQHJldHVybiB7T2JqZWN0fSB0aGUgZGVjb21wcmVzc2VkIGNvbnRlbnQuXG4gICAgICAgKi9cbiAgICAgIGdldENvbnRlbnQgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICByZXR1cm4gbnVsbDsgLy8gc2VlIGltcGxlbWVudGF0aW9uXG4gICAgICB9LFxuICAgICAgLyoqXG4gICAgICAgKiBSZXR1cm4gdGhlIGNvbXByZXNzZWQgY29udGVudCBpbiBhbiB1bnNwZWNpZmllZCBmb3JtYXQuXG4gICAgICAgKiBUaGUgZm9ybWF0IHdpbGwgZGVwZW5kIG9uIHRoZSBjb21wcmVzc2VkIGNvbnRlbiBzb3VyY2UuXG4gICAgICAgKiBAcmV0dXJuIHtPYmplY3R9IHRoZSBjb21wcmVzc2VkIGNvbnRlbnQuXG4gICAgICAgKi9cbiAgICAgIGdldENvbXByZXNzZWRDb250ZW50IDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgcmV0dXJuIG51bGw7IC8vIHNlZSBpbXBsZW1lbnRhdGlvblxuICAgICAgfVxuICAgfTtcbn0pKCk7XG5cbi8qKlxuICpcbiAqICBCYXNlNjQgZW5jb2RlIC8gZGVjb2RlXG4gKiAgaHR0cDovL3d3dy53ZWJ0b29sa2l0LmluZm8vXG4gKlxuICogIEhhY2tlZCBzbyB0aGF0IGl0IGRvZXNuJ3QgdXRmOCBlbi9kZWNvZGUgZXZlcnl0aGluZ1xuICoqL1xuSlNaaXAuYmFzZTY0ID0gKGZ1bmN0aW9uKCkge1xuICAgLy8gcHJpdmF0ZSBwcm9wZXJ0eVxuICAgdmFyIF9rZXlTdHIgPSBcIkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky89XCI7XG5cbiAgIHJldHVybiB7XG4gICAgICAvLyBwdWJsaWMgbWV0aG9kIGZvciBlbmNvZGluZ1xuICAgICAgZW5jb2RlIDogZnVuY3Rpb24oaW5wdXQsIHV0ZjgpIHtcbiAgICAgICAgIHZhciBvdXRwdXQgPSBcIlwiO1xuICAgICAgICAgdmFyIGNocjEsIGNocjIsIGNocjMsIGVuYzEsIGVuYzIsIGVuYzMsIGVuYzQ7XG4gICAgICAgICB2YXIgaSA9IDA7XG5cbiAgICAgICAgIHdoaWxlIChpIDwgaW5wdXQubGVuZ3RoKSB7XG5cbiAgICAgICAgICAgIGNocjEgPSBpbnB1dC5jaGFyQ29kZUF0KGkrKyk7XG4gICAgICAgICAgICBjaHIyID0gaW5wdXQuY2hhckNvZGVBdChpKyspO1xuICAgICAgICAgICAgY2hyMyA9IGlucHV0LmNoYXJDb2RlQXQoaSsrKTtcblxuICAgICAgICAgICAgZW5jMSA9IGNocjEgPj4gMjtcbiAgICAgICAgICAgIGVuYzIgPSAoKGNocjEgJiAzKSA8PCA0KSB8IChjaHIyID4+IDQpO1xuICAgICAgICAgICAgZW5jMyA9ICgoY2hyMiAmIDE1KSA8PCAyKSB8IChjaHIzID4+IDYpO1xuICAgICAgICAgICAgZW5jNCA9IGNocjMgJiA2MztcblxuICAgICAgICAgICAgaWYgKGlzTmFOKGNocjIpKSB7XG4gICAgICAgICAgICAgICBlbmMzID0gZW5jNCA9IDY0O1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc05hTihjaHIzKSkge1xuICAgICAgICAgICAgICAgZW5jNCA9IDY0O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBvdXRwdXQgPSBvdXRwdXQgK1xuICAgICAgICAgICAgICAgX2tleVN0ci5jaGFyQXQoZW5jMSkgKyBfa2V5U3RyLmNoYXJBdChlbmMyKSArXG4gICAgICAgICAgICAgICBfa2V5U3RyLmNoYXJBdChlbmMzKSArIF9rZXlTdHIuY2hhckF0KGVuYzQpO1xuXG4gICAgICAgICB9XG5cbiAgICAgICAgIHJldHVybiBvdXRwdXQ7XG4gICAgICB9LFxuXG4gICAgICAvLyBwdWJsaWMgbWV0aG9kIGZvciBkZWNvZGluZ1xuICAgICAgZGVjb2RlIDogZnVuY3Rpb24oaW5wdXQsIHV0ZjgpIHtcbiAgICAgICAgIHZhciBvdXRwdXQgPSBcIlwiO1xuICAgICAgICAgdmFyIGNocjEsIGNocjIsIGNocjM7XG4gICAgICAgICB2YXIgZW5jMSwgZW5jMiwgZW5jMywgZW5jNDtcbiAgICAgICAgIHZhciBpID0gMDtcblxuICAgICAgICAgaW5wdXQgPSBpbnB1dC5yZXBsYWNlKC9bXkEtWmEtejAtOVxcK1xcL1xcPV0vZywgXCJcIik7XG5cbiAgICAgICAgIHdoaWxlIChpIDwgaW5wdXQubGVuZ3RoKSB7XG5cbiAgICAgICAgICAgIGVuYzEgPSBfa2V5U3RyLmluZGV4T2YoaW5wdXQuY2hhckF0KGkrKykpO1xuICAgICAgICAgICAgZW5jMiA9IF9rZXlTdHIuaW5kZXhPZihpbnB1dC5jaGFyQXQoaSsrKSk7XG4gICAgICAgICAgICBlbmMzID0gX2tleVN0ci5pbmRleE9mKGlucHV0LmNoYXJBdChpKyspKTtcbiAgICAgICAgICAgIGVuYzQgPSBfa2V5U3RyLmluZGV4T2YoaW5wdXQuY2hhckF0KGkrKykpO1xuXG4gICAgICAgICAgICBjaHIxID0gKGVuYzEgPDwgMikgfCAoZW5jMiA+PiA0KTtcbiAgICAgICAgICAgIGNocjIgPSAoKGVuYzIgJiAxNSkgPDwgNCkgfCAoZW5jMyA+PiAyKTtcbiAgICAgICAgICAgIGNocjMgPSAoKGVuYzMgJiAzKSA8PCA2KSB8IGVuYzQ7XG5cbiAgICAgICAgICAgIG91dHB1dCA9IG91dHB1dCArIFN0cmluZy5mcm9tQ2hhckNvZGUoY2hyMSk7XG5cbiAgICAgICAgICAgIGlmIChlbmMzICE9IDY0KSB7XG4gICAgICAgICAgICAgICBvdXRwdXQgPSBvdXRwdXQgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKGNocjIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGVuYzQgIT0gNjQpIHtcbiAgICAgICAgICAgICAgIG91dHB1dCA9IG91dHB1dCArIFN0cmluZy5mcm9tQ2hhckNvZGUoY2hyMyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgIH1cblxuICAgICAgICAgcmV0dXJuIG91dHB1dDtcblxuICAgICAgfVxuICAgfTtcbn0oKSk7XG5cbi8vIGVuZm9yY2luZyBTdHVrJ3MgY29kaW5nIHN0eWxlXG4vLyB2aW06IHNldCBzaGlmdHdpZHRoPTMgc29mdHRhYnN0b3A9MzpcbihmdW5jdGlvbiAoKSB7XG4gICBcInVzZSBzdHJpY3RcIjtcblxuICAgaWYoIUpTWmlwKSB7XG4gICAgICB0aHJvdyBcIkpTWmlwIG5vdCBkZWZpbmVkXCI7XG4gICB9XG5cbiAgIC8qanNoaW50IC1XMDA0LCAtVzAxOCwgLVcwMzAsIC1XMDMyLCAtVzAzMywgLVcwMzQsIC1XMDM3LC1XMDQwLCAtVzA1NSwgLVcwNTYsIC1XMDYxLCAtVzA2NCwgLVcwOTMsIC1XMTE3ICovXG4gICB2YXIgY29udGV4dCA9IHt9O1xuICAgKGZ1bmN0aW9uICgpIHtcblxuICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2ltYXlhL3psaWIuanNcbiAgICAgIC8vIHRhZyAwLjEuNlxuICAgICAgLy8gZmlsZSBiaW4vZGVmbGF0ZS5taW4uanNcblxuLyoqIEBsaWNlbnNlIHpsaWIuanMgMjAxMiAtIGltYXlhIFsgaHR0cHM6Ly9naXRodWIuY29tL2ltYXlhL3psaWIuanMgXSBUaGUgTUlUIExpY2Vuc2UgKi8oZnVuY3Rpb24oKSB7J3VzZSBzdHJpY3QnO3ZhciBuPXZvaWQgMCx1PSEwLGFhPXRoaXM7ZnVuY3Rpb24gYmEoZSxkKXt2YXIgYz1lLnNwbGl0KFwiLlwiKSxmPWFhOyEoY1swXWluIGYpJiZmLmV4ZWNTY3JpcHQmJmYuZXhlY1NjcmlwdChcInZhciBcIitjWzBdKTtmb3IodmFyIGE7Yy5sZW5ndGgmJihhPWMuc2hpZnQoKSk7KSFjLmxlbmd0aCYmZCE9PW4/ZlthXT1kOmY9ZlthXT9mW2FdOmZbYV09e319O3ZhciBDPVwidW5kZWZpbmVkXCIhPT10eXBlb2YgVWludDhBcnJheSYmXCJ1bmRlZmluZWRcIiE9PXR5cGVvZiBVaW50MTZBcnJheSYmXCJ1bmRlZmluZWRcIiE9PXR5cGVvZiBVaW50MzJBcnJheTtmdW5jdGlvbiBLKGUsZCl7dGhpcy5pbmRleD1cIm51bWJlclwiPT09dHlwZW9mIGQ/ZDowO3RoaXMuZD0wO3RoaXMuYnVmZmVyPWUgaW5zdGFuY2VvZihDP1VpbnQ4QXJyYXk6QXJyYXkpP2U6bmV3IChDP1VpbnQ4QXJyYXk6QXJyYXkpKDMyNzY4KTtpZigyKnRoaXMuYnVmZmVyLmxlbmd0aDw9dGhpcy5pbmRleCl0aHJvdyBFcnJvcihcImludmFsaWQgaW5kZXhcIik7dGhpcy5idWZmZXIubGVuZ3RoPD10aGlzLmluZGV4JiZjYSh0aGlzKX1mdW5jdGlvbiBjYShlKXt2YXIgZD1lLmJ1ZmZlcixjLGY9ZC5sZW5ndGgsYT1uZXcgKEM/VWludDhBcnJheTpBcnJheSkoZjw8MSk7aWYoQylhLnNldChkKTtlbHNlIGZvcihjPTA7YzxmOysrYylhW2NdPWRbY107cmV0dXJuIGUuYnVmZmVyPWF9XG5LLnByb3RvdHlwZS5hPWZ1bmN0aW9uKGUsZCxjKXt2YXIgZj10aGlzLmJ1ZmZlcixhPXRoaXMuaW5kZXgsYj10aGlzLmQsaz1mW2FdLG07YyYmMTxkJiYoZT04PGQ/KExbZSYyNTVdPDwyNHxMW2U+Pj44JjI1NV08PDE2fExbZT4+PjE2JjI1NV08PDh8TFtlPj4+MjQmMjU1XSk+PjMyLWQ6TFtlXT4+OC1kKTtpZig4PmQrYilrPWs8PGR8ZSxiKz1kO2Vsc2UgZm9yKG09MDttPGQ7KyttKWs9azw8MXxlPj5kLW0tMSYxLDg9PT0rK2ImJihiPTAsZlthKytdPUxba10saz0wLGE9PT1mLmxlbmd0aCYmKGY9Y2EodGhpcykpKTtmW2FdPWs7dGhpcy5idWZmZXI9Zjt0aGlzLmQ9Yjt0aGlzLmluZGV4PWF9O0sucHJvdG90eXBlLmZpbmlzaD1mdW5jdGlvbigpe3ZhciBlPXRoaXMuYnVmZmVyLGQ9dGhpcy5pbmRleCxjOzA8dGhpcy5kJiYoZVtkXTw8PTgtdGhpcy5kLGVbZF09TFtlW2RdXSxkKyspO0M/Yz1lLnN1YmFycmF5KDAsZCk6KGUubGVuZ3RoPWQsYz1lKTtyZXR1cm4gY307XG52YXIgZ2E9bmV3IChDP1VpbnQ4QXJyYXk6QXJyYXkpKDI1NiksTTtmb3IoTT0wOzI1Nj5NOysrTSl7Zm9yKHZhciBSPU0sUz1SLGhhPTcsUj1SPj4+MTtSO1I+Pj49MSlTPDw9MSxTfD1SJjEsLS1oYTtnYVtNXT0oUzw8aGEmMjU1KT4+PjB9dmFyIEw9Z2E7ZnVuY3Rpb24gamEoZSl7dGhpcy5idWZmZXI9bmV3IChDP1VpbnQxNkFycmF5OkFycmF5KSgyKmUpO3RoaXMubGVuZ3RoPTB9amEucHJvdG90eXBlLmdldFBhcmVudD1mdW5jdGlvbihlKXtyZXR1cm4gMiooKGUtMikvNHwwKX07amEucHJvdG90eXBlLnB1c2g9ZnVuY3Rpb24oZSxkKXt2YXIgYyxmLGE9dGhpcy5idWZmZXIsYjtjPXRoaXMubGVuZ3RoO2FbdGhpcy5sZW5ndGgrK109ZDtmb3IoYVt0aGlzLmxlbmd0aCsrXT1lOzA8YzspaWYoZj10aGlzLmdldFBhcmVudChjKSxhW2NdPmFbZl0pYj1hW2NdLGFbY109YVtmXSxhW2ZdPWIsYj1hW2MrMV0sYVtjKzFdPWFbZisxXSxhW2YrMV09YixjPWY7ZWxzZSBicmVhaztyZXR1cm4gdGhpcy5sZW5ndGh9O1xuamEucHJvdG90eXBlLnBvcD1mdW5jdGlvbigpe3ZhciBlLGQsYz10aGlzLmJ1ZmZlcixmLGEsYjtkPWNbMF07ZT1jWzFdO3RoaXMubGVuZ3RoLT0yO2NbMF09Y1t0aGlzLmxlbmd0aF07Y1sxXT1jW3RoaXMubGVuZ3RoKzFdO2ZvcihiPTA7Oyl7YT0yKmIrMjtpZihhPj10aGlzLmxlbmd0aClicmVhazthKzI8dGhpcy5sZW5ndGgmJmNbYSsyXT5jW2FdJiYoYSs9Mik7aWYoY1thXT5jW2JdKWY9Y1tiXSxjW2JdPWNbYV0sY1thXT1mLGY9Y1tiKzFdLGNbYisxXT1jW2ErMV0sY1thKzFdPWY7ZWxzZSBicmVhaztiPWF9cmV0dXJue2luZGV4OmUsdmFsdWU6ZCxsZW5ndGg6dGhpcy5sZW5ndGh9fTtmdW5jdGlvbiBrYShlLGQpe3RoaXMuZT1tYTt0aGlzLmY9MDt0aGlzLmlucHV0PUMmJmUgaW5zdGFuY2VvZiBBcnJheT9uZXcgVWludDhBcnJheShlKTplO3RoaXMuYz0wO2QmJihkLmxhenkmJih0aGlzLmY9ZC5sYXp5KSxcIm51bWJlclwiPT09dHlwZW9mIGQuY29tcHJlc3Npb25UeXBlJiYodGhpcy5lPWQuY29tcHJlc3Npb25UeXBlKSxkLm91dHB1dEJ1ZmZlciYmKHRoaXMuYj1DJiZkLm91dHB1dEJ1ZmZlciBpbnN0YW5jZW9mIEFycmF5P25ldyBVaW50OEFycmF5KGQub3V0cHV0QnVmZmVyKTpkLm91dHB1dEJ1ZmZlciksXCJudW1iZXJcIj09PXR5cGVvZiBkLm91dHB1dEluZGV4JiYodGhpcy5jPWQub3V0cHV0SW5kZXgpKTt0aGlzLmJ8fCh0aGlzLmI9bmV3IChDP1VpbnQ4QXJyYXk6QXJyYXkpKDMyNzY4KSl9dmFyIG1hPTIsVD1bXSxVO1xuZm9yKFU9MDsyODg+VTtVKyspc3dpdGNoKHUpe2Nhc2UgMTQzPj1VOlQucHVzaChbVSs0OCw4XSk7YnJlYWs7Y2FzZSAyNTU+PVU6VC5wdXNoKFtVLTE0NCs0MDAsOV0pO2JyZWFrO2Nhc2UgMjc5Pj1VOlQucHVzaChbVS0yNTYrMCw3XSk7YnJlYWs7Y2FzZSAyODc+PVU6VC5wdXNoKFtVLTI4MCsxOTIsOF0pO2JyZWFrO2RlZmF1bHQ6dGhyb3dcImludmFsaWQgbGl0ZXJhbDogXCIrVTt9XG5rYS5wcm90b3R5cGUuaD1mdW5jdGlvbigpe3ZhciBlLGQsYyxmLGE9dGhpcy5pbnB1dDtzd2l0Y2godGhpcy5lKXtjYXNlIDA6Yz0wO2ZvcihmPWEubGVuZ3RoO2M8Zjspe2Q9Qz9hLnN1YmFycmF5KGMsYys2NTUzNSk6YS5zbGljZShjLGMrNjU1MzUpO2MrPWQubGVuZ3RoO3ZhciBiPWQsaz1jPT09ZixtPW4sZz1uLHA9bix2PW4seD1uLGw9dGhpcy5iLGg9dGhpcy5jO2lmKEMpe2ZvcihsPW5ldyBVaW50OEFycmF5KHRoaXMuYi5idWZmZXIpO2wubGVuZ3RoPD1oK2IubGVuZ3RoKzU7KWw9bmV3IFVpbnQ4QXJyYXkobC5sZW5ndGg8PDEpO2wuc2V0KHRoaXMuYil9bT1rPzE6MDtsW2grK109bXwwO2c9Yi5sZW5ndGg7cD1+Zys2NTUzNiY2NTUzNTtsW2grK109ZyYyNTU7bFtoKytdPWc+Pj44JjI1NTtsW2grK109cCYyNTU7bFtoKytdPXA+Pj44JjI1NTtpZihDKWwuc2V0KGIsaCksaCs9Yi5sZW5ndGgsbD1sLnN1YmFycmF5KDAsaCk7ZWxzZXt2PTA7Zm9yKHg9Yi5sZW5ndGg7djx4OysrdilsW2grK109XG5iW3ZdO2wubGVuZ3RoPWh9dGhpcy5jPWg7dGhpcy5iPWx9YnJlYWs7Y2FzZSAxOnZhciBxPW5ldyBLKEM/bmV3IFVpbnQ4QXJyYXkodGhpcy5iLmJ1ZmZlcik6dGhpcy5iLHRoaXMuYyk7cS5hKDEsMSx1KTtxLmEoMSwyLHUpO3ZhciB0PW5hKHRoaXMsYSksdyxkYSx6O3c9MDtmb3IoZGE9dC5sZW5ndGg7dzxkYTt3KyspaWYoej10W3ddLEsucHJvdG90eXBlLmEuYXBwbHkocSxUW3pdKSwyNTY8eilxLmEodFsrK3ddLHRbKyt3XSx1KSxxLmEodFsrK3ddLDUpLHEuYSh0Wysrd10sdFsrK3ddLHUpO2Vsc2UgaWYoMjU2PT09eilicmVhazt0aGlzLmI9cS5maW5pc2goKTt0aGlzLmM9dGhpcy5iLmxlbmd0aDticmVhaztjYXNlIG1hOnZhciBCPW5ldyBLKEM/bmV3IFVpbnQ4QXJyYXkodGhpcy5iLmJ1ZmZlcik6dGhpcy5iLHRoaXMuYykscmEsSixOLE8sUCxJYT1bMTYsMTcsMTgsMCw4LDcsOSw2LDEwLDUsMTEsNCwxMiwzLDEzLDIsMTQsMSwxNV0sVyxzYSxYLHRhLGVhLGlhPUFycmF5KDE5KSxcbnVhLFEsZmEseSx2YTtyYT1tYTtCLmEoMSwxLHUpO0IuYShyYSwyLHUpO0o9bmEodGhpcyxhKTtXPW9hKHRoaXMuaiwxNSk7c2E9cGEoVyk7WD1vYSh0aGlzLmksNyk7dGE9cGEoWCk7Zm9yKE49Mjg2OzI1NzxOJiYwPT09V1tOLTFdO04tLSk7Zm9yKE89MzA7MTxPJiYwPT09WFtPLTFdO08tLSk7dmFyIHdhPU4seGE9TyxGPW5ldyAoQz9VaW50MzJBcnJheTpBcnJheSkod2EreGEpLHIsRyxzLFksRT1uZXcgKEM/VWludDMyQXJyYXk6QXJyYXkpKDMxNiksRCxBLEg9bmV3IChDP1VpbnQ4QXJyYXk6QXJyYXkpKDE5KTtmb3Iocj1HPTA7cjx3YTtyKyspRltHKytdPVdbcl07Zm9yKHI9MDtyPHhhO3IrKylGW0crK109WFtyXTtpZighQyl7cj0wO2ZvcihZPUgubGVuZ3RoO3I8WTsrK3IpSFtyXT0wfXI9RD0wO2ZvcihZPUYubGVuZ3RoO3I8WTtyKz1HKXtmb3IoRz0xO3IrRzxZJiZGW3IrR109PT1GW3JdOysrRyk7cz1HO2lmKDA9PT1GW3JdKWlmKDM+cylmb3IoOzA8cy0tOylFW0QrK109MCxcbkhbMF0rKztlbHNlIGZvcig7MDxzOylBPTEzOD5zP3M6MTM4LEE+cy0zJiZBPHMmJihBPXMtMyksMTA+PUE/KEVbRCsrXT0xNyxFW0QrK109QS0zLEhbMTddKyspOihFW0QrK109MTgsRVtEKytdPUEtMTEsSFsxOF0rKykscy09QTtlbHNlIGlmKEVbRCsrXT1GW3JdLEhbRltyXV0rKyxzLS0sMz5zKWZvcig7MDxzLS07KUVbRCsrXT1GW3JdLEhbRltyXV0rKztlbHNlIGZvcig7MDxzOylBPTY+cz9zOjYsQT5zLTMmJkE8cyYmKEE9cy0zKSxFW0QrK109MTYsRVtEKytdPUEtMyxIWzE2XSsrLHMtPUF9ZT1DP0Uuc3ViYXJyYXkoMCxEKTpFLnNsaWNlKDAsRCk7ZWE9b2EoSCw3KTtmb3IoeT0wOzE5Pnk7eSsrKWlhW3ldPWVhW0lhW3ldXTtmb3IoUD0xOTs0PFAmJjA9PT1pYVtQLTFdO1AtLSk7dWE9cGEoZWEpO0IuYShOLTI1Nyw1LHUpO0IuYShPLTEsNSx1KTtCLmEoUC00LDQsdSk7Zm9yKHk9MDt5PFA7eSsrKUIuYShpYVt5XSwzLHUpO3k9MDtmb3IodmE9ZS5sZW5ndGg7eTx2YTt5KyspaWYoUT1cbmVbeV0sQi5hKHVhW1FdLGVhW1FdLHUpLDE2PD1RKXt5Kys7c3dpdGNoKFEpe2Nhc2UgMTY6ZmE9MjticmVhaztjYXNlIDE3OmZhPTM7YnJlYWs7Y2FzZSAxODpmYT03O2JyZWFrO2RlZmF1bHQ6dGhyb3dcImludmFsaWQgY29kZTogXCIrUTt9Qi5hKGVbeV0sZmEsdSl9dmFyIHlhPVtzYSxXXSx6YT1bdGEsWF0sSSxBYSxaLGxhLEJhLENhLERhLEVhO0JhPXlhWzBdO0NhPXlhWzFdO0RhPXphWzBdO0VhPXphWzFdO0k9MDtmb3IoQWE9Si5sZW5ndGg7STxBYTsrK0kpaWYoWj1KW0ldLEIuYShCYVtaXSxDYVtaXSx1KSwyNTY8WilCLmEoSlsrK0ldLEpbKytJXSx1KSxsYT1KWysrSV0sQi5hKERhW2xhXSxFYVtsYV0sdSksQi5hKEpbKytJXSxKWysrSV0sdSk7ZWxzZSBpZigyNTY9PT1aKWJyZWFrO3RoaXMuYj1CLmZpbmlzaCgpO3RoaXMuYz10aGlzLmIubGVuZ3RoO2JyZWFrO2RlZmF1bHQ6dGhyb3dcImludmFsaWQgY29tcHJlc3Npb24gdHlwZVwiO31yZXR1cm4gdGhpcy5ifTtcbmZ1bmN0aW9uIHFhKGUsZCl7dGhpcy5sZW5ndGg9ZTt0aGlzLmc9ZH1cbnZhciBGYT1mdW5jdGlvbigpe2Z1bmN0aW9uIGUoYSl7c3dpdGNoKHUpe2Nhc2UgMz09PWE6cmV0dXJuWzI1NyxhLTMsMF07Y2FzZSA0PT09YTpyZXR1cm5bMjU4LGEtNCwwXTtjYXNlIDU9PT1hOnJldHVyblsyNTksYS01LDBdO2Nhc2UgNj09PWE6cmV0dXJuWzI2MCxhLTYsMF07Y2FzZSA3PT09YTpyZXR1cm5bMjYxLGEtNywwXTtjYXNlIDg9PT1hOnJldHVyblsyNjIsYS04LDBdO2Nhc2UgOT09PWE6cmV0dXJuWzI2MyxhLTksMF07Y2FzZSAxMD09PWE6cmV0dXJuWzI2NCxhLTEwLDBdO2Nhc2UgMTI+PWE6cmV0dXJuWzI2NSxhLTExLDFdO2Nhc2UgMTQ+PWE6cmV0dXJuWzI2NixhLTEzLDFdO2Nhc2UgMTY+PWE6cmV0dXJuWzI2NyxhLTE1LDFdO2Nhc2UgMTg+PWE6cmV0dXJuWzI2OCxhLTE3LDFdO2Nhc2UgMjI+PWE6cmV0dXJuWzI2OSxhLTE5LDJdO2Nhc2UgMjY+PWE6cmV0dXJuWzI3MCxhLTIzLDJdO2Nhc2UgMzA+PWE6cmV0dXJuWzI3MSxhLTI3LDJdO2Nhc2UgMzQ+PWE6cmV0dXJuWzI3MixcbmEtMzEsMl07Y2FzZSA0Mj49YTpyZXR1cm5bMjczLGEtMzUsM107Y2FzZSA1MD49YTpyZXR1cm5bMjc0LGEtNDMsM107Y2FzZSA1OD49YTpyZXR1cm5bMjc1LGEtNTEsM107Y2FzZSA2Nj49YTpyZXR1cm5bMjc2LGEtNTksM107Y2FzZSA4Mj49YTpyZXR1cm5bMjc3LGEtNjcsNF07Y2FzZSA5OD49YTpyZXR1cm5bMjc4LGEtODMsNF07Y2FzZSAxMTQ+PWE6cmV0dXJuWzI3OSxhLTk5LDRdO2Nhc2UgMTMwPj1hOnJldHVyblsyODAsYS0xMTUsNF07Y2FzZSAxNjI+PWE6cmV0dXJuWzI4MSxhLTEzMSw1XTtjYXNlIDE5ND49YTpyZXR1cm5bMjgyLGEtMTYzLDVdO2Nhc2UgMjI2Pj1hOnJldHVyblsyODMsYS0xOTUsNV07Y2FzZSAyNTc+PWE6cmV0dXJuWzI4NCxhLTIyNyw1XTtjYXNlIDI1OD09PWE6cmV0dXJuWzI4NSxhLTI1OCwwXTtkZWZhdWx0OnRocm93XCJpbnZhbGlkIGxlbmd0aDogXCIrYTt9fXZhciBkPVtdLGMsZjtmb3IoYz0zOzI1OD49YztjKyspZj1lKGMpLGRbY109ZlsyXTw8MjR8XG5mWzFdPDwxNnxmWzBdO3JldHVybiBkfSgpLEdhPUM/bmV3IFVpbnQzMkFycmF5KEZhKTpGYTtcbmZ1bmN0aW9uIG5hKGUsZCl7ZnVuY3Rpb24gYyhhLGMpe3ZhciBiPWEuZyxkPVtdLGY9MCxlO2U9R2FbYS5sZW5ndGhdO2RbZisrXT1lJjY1NTM1O2RbZisrXT1lPj4xNiYyNTU7ZFtmKytdPWU+PjI0O3ZhciBnO3N3aXRjaCh1KXtjYXNlIDE9PT1iOmc9WzAsYi0xLDBdO2JyZWFrO2Nhc2UgMj09PWI6Zz1bMSxiLTIsMF07YnJlYWs7Y2FzZSAzPT09YjpnPVsyLGItMywwXTticmVhaztjYXNlIDQ9PT1iOmc9WzMsYi00LDBdO2JyZWFrO2Nhc2UgNj49YjpnPVs0LGItNSwxXTticmVhaztjYXNlIDg+PWI6Zz1bNSxiLTcsMV07YnJlYWs7Y2FzZSAxMj49YjpnPVs2LGItOSwyXTticmVhaztjYXNlIDE2Pj1iOmc9WzcsYi0xMywyXTticmVhaztjYXNlIDI0Pj1iOmc9WzgsYi0xNywzXTticmVhaztjYXNlIDMyPj1iOmc9WzksYi0yNSwzXTticmVhaztjYXNlIDQ4Pj1iOmc9WzEwLGItMzMsNF07YnJlYWs7Y2FzZSA2ND49YjpnPVsxMSxiLTQ5LDRdO2JyZWFrO2Nhc2UgOTY+PWI6Zz1bMTIsYi1cbjY1LDVdO2JyZWFrO2Nhc2UgMTI4Pj1iOmc9WzEzLGItOTcsNV07YnJlYWs7Y2FzZSAxOTI+PWI6Zz1bMTQsYi0xMjksNl07YnJlYWs7Y2FzZSAyNTY+PWI6Zz1bMTUsYi0xOTMsNl07YnJlYWs7Y2FzZSAzODQ+PWI6Zz1bMTYsYi0yNTcsN107YnJlYWs7Y2FzZSA1MTI+PWI6Zz1bMTcsYi0zODUsN107YnJlYWs7Y2FzZSA3Njg+PWI6Zz1bMTgsYi01MTMsOF07YnJlYWs7Y2FzZSAxMDI0Pj1iOmc9WzE5LGItNzY5LDhdO2JyZWFrO2Nhc2UgMTUzNj49YjpnPVsyMCxiLTEwMjUsOV07YnJlYWs7Y2FzZSAyMDQ4Pj1iOmc9WzIxLGItMTUzNyw5XTticmVhaztjYXNlIDMwNzI+PWI6Zz1bMjIsYi0yMDQ5LDEwXTticmVhaztjYXNlIDQwOTY+PWI6Zz1bMjMsYi0zMDczLDEwXTticmVhaztjYXNlIDYxNDQ+PWI6Zz1bMjQsYi00MDk3LDExXTticmVhaztjYXNlIDgxOTI+PWI6Zz1bMjUsYi02MTQ1LDExXTticmVhaztjYXNlIDEyMjg4Pj1iOmc9WzI2LGItODE5MywxMl07YnJlYWs7Y2FzZSAxNjM4ND49XG5iOmc9WzI3LGItMTIyODksMTJdO2JyZWFrO2Nhc2UgMjQ1NzY+PWI6Zz1bMjgsYi0xNjM4NSwxM107YnJlYWs7Y2FzZSAzMjc2OD49YjpnPVsyOSxiLTI0NTc3LDEzXTticmVhaztkZWZhdWx0OnRocm93XCJpbnZhbGlkIGRpc3RhbmNlXCI7fWU9ZztkW2YrK109ZVswXTtkW2YrK109ZVsxXTtkW2YrK109ZVsyXTt2YXIgayxtO2s9MDtmb3IobT1kLmxlbmd0aDtrPG07KytrKWxbaCsrXT1kW2tdO3RbZFswXV0rKzt3W2RbM11dKys7cT1hLmxlbmd0aCtjLTE7eD1udWxsfXZhciBmLGEsYixrLG0sZz17fSxwLHYseCxsPUM/bmV3IFVpbnQxNkFycmF5KDIqZC5sZW5ndGgpOltdLGg9MCxxPTAsdD1uZXcgKEM/VWludDMyQXJyYXk6QXJyYXkpKDI4Niksdz1uZXcgKEM/VWludDMyQXJyYXk6QXJyYXkpKDMwKSxkYT1lLmYsejtpZighQyl7Zm9yKGI9MDsyODU+PWI7KXRbYisrXT0wO2ZvcihiPTA7Mjk+PWI7KXdbYisrXT0wfXRbMjU2XT0xO2Y9MDtmb3IoYT1kLmxlbmd0aDtmPGE7KytmKXtiPVxubT0wO2ZvcihrPTM7YjxrJiZmK2IhPT1hOysrYiltPW08PDh8ZFtmK2JdO2dbbV09PT1uJiYoZ1ttXT1bXSk7cD1nW21dO2lmKCEoMDxxLS0pKXtmb3IoOzA8cC5sZW5ndGgmJjMyNzY4PGYtcFswXTspcC5zaGlmdCgpO2lmKGYrMz49YSl7eCYmYyh4LC0xKTtiPTA7Zm9yKGs9YS1mO2I8azsrK2Ipej1kW2YrYl0sbFtoKytdPXosKyt0W3pdO2JyZWFrfTA8cC5sZW5ndGg/KHY9SGEoZCxmLHApLHg/eC5sZW5ndGg8di5sZW5ndGg/KHo9ZFtmLTFdLGxbaCsrXT16LCsrdFt6XSxjKHYsMCkpOmMoeCwtMSk6di5sZW5ndGg8ZGE/eD12OmModiwwKSk6eD9jKHgsLTEpOih6PWRbZl0sbFtoKytdPXosKyt0W3pdKX1wLnB1c2goZil9bFtoKytdPTI1Njt0WzI1Nl0rKztlLmo9dDtlLmk9dztyZXR1cm4gQz9sLnN1YmFycmF5KDAsaCk6bH1cbmZ1bmN0aW9uIEhhKGUsZCxjKXt2YXIgZixhLGI9MCxrLG0sZyxwLHY9ZS5sZW5ndGg7bT0wO3A9Yy5sZW5ndGg7YTpmb3IoO208cDttKyspe2Y9Y1twLW0tMV07az0zO2lmKDM8Yil7Zm9yKGc9YjszPGc7Zy0tKWlmKGVbZitnLTFdIT09ZVtkK2ctMV0pY29udGludWUgYTtrPWJ9Zm9yKDsyNTg+ayYmZCtrPHYmJmVbZitrXT09PWVbZCtrXTspKytrO2s+YiYmKGE9ZixiPWspO2lmKDI1OD09PWspYnJlYWt9cmV0dXJuIG5ldyBxYShiLGQtYSl9XG5mdW5jdGlvbiBvYShlLGQpe3ZhciBjPWUubGVuZ3RoLGY9bmV3IGphKDU3MiksYT1uZXcgKEM/VWludDhBcnJheTpBcnJheSkoYyksYixrLG0sZyxwO2lmKCFDKWZvcihnPTA7ZzxjO2crKylhW2ddPTA7Zm9yKGc9MDtnPGM7KytnKTA8ZVtnXSYmZi5wdXNoKGcsZVtnXSk7Yj1BcnJheShmLmxlbmd0aC8yKTtrPW5ldyAoQz9VaW50MzJBcnJheTpBcnJheSkoZi5sZW5ndGgvMik7aWYoMT09PWIubGVuZ3RoKXJldHVybiBhW2YucG9wKCkuaW5kZXhdPTEsYTtnPTA7Zm9yKHA9Zi5sZW5ndGgvMjtnPHA7KytnKWJbZ109Zi5wb3AoKSxrW2ddPWJbZ10udmFsdWU7bT1KYShrLGsubGVuZ3RoLGQpO2c9MDtmb3IocD1iLmxlbmd0aDtnPHA7KytnKWFbYltnXS5pbmRleF09bVtnXTtyZXR1cm4gYX1cbmZ1bmN0aW9uIEphKGUsZCxjKXtmdW5jdGlvbiBmKGEpe3ZhciBiPWdbYV1bcFthXV07Yj09PWQ/KGYoYSsxKSxmKGErMSkpOi0ta1tiXTsrK3BbYV19dmFyIGE9bmV3IChDP1VpbnQxNkFycmF5OkFycmF5KShjKSxiPW5ldyAoQz9VaW50OEFycmF5OkFycmF5KShjKSxrPW5ldyAoQz9VaW50OEFycmF5OkFycmF5KShkKSxtPUFycmF5KGMpLGc9QXJyYXkoYykscD1BcnJheShjKSx2PSgxPDxjKS1kLHg9MTw8Yy0xLGwsaCxxLHQsdzthW2MtMV09ZDtmb3IoaD0wO2g8YzsrK2gpdjx4P2JbaF09MDooYltoXT0xLHYtPXgpLHY8PD0xLGFbYy0yLWhdPShhW2MtMS1oXS8yfDApK2Q7YVswXT1iWzBdO21bMF09QXJyYXkoYVswXSk7Z1swXT1BcnJheShhWzBdKTtmb3IoaD0xO2g8YzsrK2gpYVtoXT4yKmFbaC0xXStiW2hdJiYoYVtoXT0yKmFbaC0xXStiW2hdKSxtW2hdPUFycmF5KGFbaF0pLGdbaF09QXJyYXkoYVtoXSk7Zm9yKGw9MDtsPGQ7KytsKWtbbF09Yztmb3IocT0wO3E8YVtjLTFdOysrcSltW2MtXG4xXVtxXT1lW3FdLGdbYy0xXVtxXT1xO2ZvcihsPTA7bDxjOysrbClwW2xdPTA7MT09PWJbYy0xXSYmKC0ta1swXSwrK3BbYy0xXSk7Zm9yKGg9Yy0yOzA8PWg7LS1oKXt0PWw9MDt3PXBbaCsxXTtmb3IocT0wO3E8YVtoXTtxKyspdD1tW2grMV1bd10rbVtoKzFdW3crMV0sdD5lW2xdPyhtW2hdW3FdPXQsZ1toXVtxXT1kLHcrPTIpOihtW2hdW3FdPWVbbF0sZ1toXVtxXT1sLCsrbCk7cFtoXT0wOzE9PT1iW2hdJiZmKGgpfXJldHVybiBrfVxuZnVuY3Rpb24gcGEoZSl7dmFyIGQ9bmV3IChDP1VpbnQxNkFycmF5OkFycmF5KShlLmxlbmd0aCksYz1bXSxmPVtdLGE9MCxiLGssbSxnO2I9MDtmb3Ioaz1lLmxlbmd0aDtiPGs7YisrKWNbZVtiXV09KGNbZVtiXV18MCkrMTtiPTE7Zm9yKGs9MTY7Yjw9aztiKyspZltiXT1hLGErPWNbYl18MCxhPDw9MTtiPTA7Zm9yKGs9ZS5sZW5ndGg7YjxrO2IrKyl7YT1mW2VbYl1dO2ZbZVtiXV0rPTE7bT1kW2JdPTA7Zm9yKGc9ZVtiXTttPGc7bSsrKWRbYl09ZFtiXTw8MXxhJjEsYT4+Pj0xfXJldHVybiBkfTtiYShcIlpsaWIuUmF3RGVmbGF0ZVwiLGthKTtiYShcIlpsaWIuUmF3RGVmbGF0ZS5wcm90b3R5cGUuY29tcHJlc3NcIixrYS5wcm90b3R5cGUuaCk7dmFyIEthPXtOT05FOjAsRklYRUQ6MSxEWU5BTUlDOm1hfSxWLExhLCQsTWE7aWYoT2JqZWN0LmtleXMpVj1PYmplY3Qua2V5cyhLYSk7ZWxzZSBmb3IoTGEgaW4gVj1bXSwkPTAsS2EpVlskKytdPUxhOyQ9MDtmb3IoTWE9Vi5sZW5ndGg7JDxNYTsrKyQpTGE9VlskXSxiYShcIlpsaWIuUmF3RGVmbGF0ZS5Db21wcmVzc2lvblR5cGUuXCIrTGEsS2FbTGFdKTt9KS5jYWxsKHRoaXMpOyAvL0Agc291cmNlTWFwcGluZ1VSTD1yYXdkZWZsYXRlLm1pbi5qcy5tYXBcblxuXG4gICB9KS5jYWxsKGNvbnRleHQpO1xuICAgLypqc2hpbnQgK1cwMDQsICtXMDE4LCArVzAzMCwgK1cwMzIsICtXMDMzLCArVzAzNCwgK1cwMzcsK1cwNDAsICtXMDU1LCArVzA1NiwgK1cwNjEsICtXMDY0LCArVzA5MywgK1cxMTcgKi9cblxuICAgdmFyIGNvbXByZXNzID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gICAgICB2YXIgZGVmbGF0ZSA9IG5ldyBjb250ZXh0LlpsaWIuUmF3RGVmbGF0ZShpbnB1dCk7XG4gICAgICByZXR1cm4gZGVmbGF0ZS5jb21wcmVzcygpO1xuICAgfTtcblxuICAgdmFyIFVTRV9UWVBFREFSUkFZID1cbiAgICAgICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpICYmXG4gICAgICAodHlwZW9mIFVpbnQxNkFycmF5ICE9PSAndW5kZWZpbmVkJykgJiZcbiAgICAgICh0eXBlb2YgVWludDMyQXJyYXkgIT09ICd1bmRlZmluZWQnKTtcblxuXG4gICAvLyB3ZSBhZGQgdGhlIGNvbXByZXNzaW9uIG1ldGhvZCBmb3IgSlNaaXBcbiAgIGlmKCFKU1ppcC5jb21wcmVzc2lvbnNbXCJERUZMQVRFXCJdKSB7XG4gICAgICBKU1ppcC5jb21wcmVzc2lvbnNbXCJERUZMQVRFXCJdID0ge1xuICAgICAgICAgbWFnaWMgOiBcIlxceDA4XFx4MDBcIixcbiAgICAgICAgIGNvbXByZXNzIDogY29tcHJlc3MsXG4gICAgICAgICBjb21wcmVzc0lucHV0VHlwZSA6IFVTRV9UWVBFREFSUkFZID8gXCJ1aW50OGFycmF5XCIgOiBcImFycmF5XCJcbiAgICAgIH07XG4gICB9IGVsc2Uge1xuICAgICAgSlNaaXAuY29tcHJlc3Npb25zW1wiREVGTEFURVwiXS5jb21wcmVzcyA9IGNvbXByZXNzO1xuICAgICAgSlNaaXAuY29tcHJlc3Npb25zW1wiREVGTEFURVwiXS5jb21wcmVzc0lucHV0VHlwZSA9IFVTRV9UWVBFREFSUkFZID8gXCJ1aW50OGFycmF5XCIgOiBcImFycmF5XCI7XG4gICB9XG59KSgpO1xuXG4vLyBlbmZvcmNpbmcgU3R1aydzIGNvZGluZyBzdHlsZVxuLy8gdmltOiBzZXQgc2hpZnR3aWR0aD0zIHNvZnR0YWJzdG9wPTM6XG4oZnVuY3Rpb24gKCkge1xuICAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgIGlmKCFKU1ppcCkge1xuICAgICAgdGhyb3cgXCJKU1ppcCBub3QgZGVmaW5lZFwiO1xuICAgfVxuXG4gICAvKmpzaGludCAtVzAwNCwgLVcwMzAsIC1XMDMyLCAtVzAzMywgLVcwMzQsIC1XMDQwLCAtVzA1NiwgLVcwNjEsIC1XMDY0LCAtVzA5MyAqL1xuICAgdmFyIGNvbnRleHQgPSB7fTtcbiAgIChmdW5jdGlvbiAoKSB7XG5cbiAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9pbWF5YS96bGliLmpzXG4gICAgICAvLyB0YWcgMC4xLjZcbiAgICAgIC8vIGZpbGUgYmluL2RlZmxhdGUubWluLmpzXG5cbi8qKiBAbGljZW5zZSB6bGliLmpzIDIwMTIgLSBpbWF5YSBbIGh0dHBzOi8vZ2l0aHViLmNvbS9pbWF5YS96bGliLmpzIF0gVGhlIE1JVCBMaWNlbnNlICovKGZ1bmN0aW9uKCkgeyd1c2Ugc3RyaWN0Jzt2YXIgbD12b2lkIDAscD10aGlzO2Z1bmN0aW9uIHEoYyxkKXt2YXIgYT1jLnNwbGl0KFwiLlwiKSxiPXA7IShhWzBdaW4gYikmJmIuZXhlY1NjcmlwdCYmYi5leGVjU2NyaXB0KFwidmFyIFwiK2FbMF0pO2Zvcih2YXIgZTthLmxlbmd0aCYmKGU9YS5zaGlmdCgpKTspIWEubGVuZ3RoJiZkIT09bD9iW2VdPWQ6Yj1iW2VdP2JbZV06YltlXT17fX07dmFyIHI9XCJ1bmRlZmluZWRcIiE9PXR5cGVvZiBVaW50OEFycmF5JiZcInVuZGVmaW5lZFwiIT09dHlwZW9mIFVpbnQxNkFycmF5JiZcInVuZGVmaW5lZFwiIT09dHlwZW9mIFVpbnQzMkFycmF5O2Z1bmN0aW9uIHUoYyl7dmFyIGQ9Yy5sZW5ndGgsYT0wLGI9TnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLGUsZixnLGgsayxtLHMsbix0O2ZvcihuPTA7bjxkOysrbiljW25dPmEmJihhPWNbbl0pLGNbbl08YiYmKGI9Y1tuXSk7ZT0xPDxhO2Y9bmV3IChyP1VpbnQzMkFycmF5OkFycmF5KShlKTtnPTE7aD0wO2ZvcihrPTI7Zzw9YTspe2ZvcihuPTA7bjxkOysrbilpZihjW25dPT09Zyl7bT0wO3M9aDtmb3IodD0wO3Q8ZzsrK3QpbT1tPDwxfHMmMSxzPj49MTtmb3IodD1tO3Q8ZTt0Kz1rKWZbdF09Zzw8MTZ8bjsrK2h9KytnO2g8PD0xO2s8PD0xfXJldHVybltmLGEsYl19O2Z1bmN0aW9uIHYoYyxkKXt0aGlzLmc9W107dGhpcy5oPTMyNzY4O3RoaXMuYz10aGlzLmY9dGhpcy5kPXRoaXMuaz0wO3RoaXMuaW5wdXQ9cj9uZXcgVWludDhBcnJheShjKTpjO3RoaXMubD0hMTt0aGlzLmk9dzt0aGlzLnA9ITE7aWYoZHx8IShkPXt9KSlkLmluZGV4JiYodGhpcy5kPWQuaW5kZXgpLGQuYnVmZmVyU2l6ZSYmKHRoaXMuaD1kLmJ1ZmZlclNpemUpLGQuYnVmZmVyVHlwZSYmKHRoaXMuaT1kLmJ1ZmZlclR5cGUpLGQucmVzaXplJiYodGhpcy5wPWQucmVzaXplKTtzd2l0Y2godGhpcy5pKXtjYXNlIHg6dGhpcy5hPTMyNzY4O3RoaXMuYj1uZXcgKHI/VWludDhBcnJheTpBcnJheSkoMzI3NjgrdGhpcy5oKzI1OCk7YnJlYWs7Y2FzZSB3OnRoaXMuYT0wO3RoaXMuYj1uZXcgKHI/VWludDhBcnJheTpBcnJheSkodGhpcy5oKTt0aGlzLmU9dGhpcy51O3RoaXMubT10aGlzLnI7dGhpcy5qPXRoaXMuczticmVhaztkZWZhdWx0OnRocm93IEVycm9yKFwiaW52YWxpZCBpbmZsYXRlIG1vZGVcIik7XG59fXZhciB4PTAsdz0xO1xudi5wcm90b3R5cGUudD1mdW5jdGlvbigpe2Zvcig7IXRoaXMubDspe3ZhciBjPXkodGhpcywzKTtjJjEmJih0aGlzLmw9ITApO2M+Pj49MTtzd2l0Y2goYyl7Y2FzZSAwOnZhciBkPXRoaXMuaW5wdXQsYT10aGlzLmQsYj10aGlzLmIsZT10aGlzLmEsZj1sLGc9bCxoPWwsaz1iLmxlbmd0aCxtPWw7dGhpcy5jPXRoaXMuZj0wO2Y9ZFthKytdO2lmKGY9PT1sKXRocm93IEVycm9yKFwiaW52YWxpZCB1bmNvbXByZXNzZWQgYmxvY2sgaGVhZGVyOiBMRU4gKGZpcnN0IGJ5dGUpXCIpO2c9ZjtmPWRbYSsrXTtpZihmPT09bCl0aHJvdyBFcnJvcihcImludmFsaWQgdW5jb21wcmVzc2VkIGJsb2NrIGhlYWRlcjogTEVOIChzZWNvbmQgYnl0ZSlcIik7Z3w9Zjw8ODtmPWRbYSsrXTtpZihmPT09bCl0aHJvdyBFcnJvcihcImludmFsaWQgdW5jb21wcmVzc2VkIGJsb2NrIGhlYWRlcjogTkxFTiAoZmlyc3QgYnl0ZSlcIik7aD1mO2Y9ZFthKytdO2lmKGY9PT1sKXRocm93IEVycm9yKFwiaW52YWxpZCB1bmNvbXByZXNzZWQgYmxvY2sgaGVhZGVyOiBOTEVOIChzZWNvbmQgYnl0ZSlcIik7aHw9XG5mPDw4O2lmKGc9PT1+aCl0aHJvdyBFcnJvcihcImludmFsaWQgdW5jb21wcmVzc2VkIGJsb2NrIGhlYWRlcjogbGVuZ3RoIHZlcmlmeVwiKTtpZihhK2c+ZC5sZW5ndGgpdGhyb3cgRXJyb3IoXCJpbnB1dCBidWZmZXIgaXMgYnJva2VuXCIpO3N3aXRjaCh0aGlzLmkpe2Nhc2UgeDpmb3IoO2UrZz5iLmxlbmd0aDspe209ay1lO2ctPW07aWYociliLnNldChkLnN1YmFycmF5KGEsYSttKSxlKSxlKz1tLGErPW07ZWxzZSBmb3IoO20tLTspYltlKytdPWRbYSsrXTt0aGlzLmE9ZTtiPXRoaXMuZSgpO2U9dGhpcy5hfWJyZWFrO2Nhc2Ugdzpmb3IoO2UrZz5iLmxlbmd0aDspYj10aGlzLmUoe286Mn0pO2JyZWFrO2RlZmF1bHQ6dGhyb3cgRXJyb3IoXCJpbnZhbGlkIGluZmxhdGUgbW9kZVwiKTt9aWYociliLnNldChkLnN1YmFycmF5KGEsYStnKSxlKSxlKz1nLGErPWc7ZWxzZSBmb3IoO2ctLTspYltlKytdPWRbYSsrXTt0aGlzLmQ9YTt0aGlzLmE9ZTt0aGlzLmI9YjticmVhaztjYXNlIDE6dGhpcy5qKHosXG5BKTticmVhaztjYXNlIDI6Qih0aGlzKTticmVhaztkZWZhdWx0OnRocm93IEVycm9yKFwidW5rbm93biBCVFlQRTogXCIrYyk7fX1yZXR1cm4gdGhpcy5tKCl9O1xudmFyIEM9WzE2LDE3LDE4LDAsOCw3LDksNiwxMCw1LDExLDQsMTIsMywxMywyLDE0LDEsMTVdLEQ9cj9uZXcgVWludDE2QXJyYXkoQyk6QyxFPVszLDQsNSw2LDcsOCw5LDEwLDExLDEzLDE1LDE3LDE5LDIzLDI3LDMxLDM1LDQzLDUxLDU5LDY3LDgzLDk5LDExNSwxMzEsMTYzLDE5NSwyMjcsMjU4LDI1OCwyNThdLEY9cj9uZXcgVWludDE2QXJyYXkoRSk6RSxHPVswLDAsMCwwLDAsMCwwLDAsMSwxLDEsMSwyLDIsMiwyLDMsMywzLDMsNCw0LDQsNCw1LDUsNSw1LDAsMCwwXSxIPXI/bmV3IFVpbnQ4QXJyYXkoRyk6RyxJPVsxLDIsMyw0LDUsNyw5LDEzLDE3LDI1LDMzLDQ5LDY1LDk3LDEyOSwxOTMsMjU3LDM4NSw1MTMsNzY5LDEwMjUsMTUzNywyMDQ5LDMwNzMsNDA5Nyw2MTQ1LDgxOTMsMTIyODksMTYzODUsMjQ1NzddLEo9cj9uZXcgVWludDE2QXJyYXkoSSk6SSxLPVswLDAsMCwwLDEsMSwyLDIsMywzLDQsNCw1LDUsNiw2LDcsNyw4LDgsOSw5LDEwLDEwLDExLDExLDEyLDEyLDEzLFxuMTNdLEw9cj9uZXcgVWludDhBcnJheShLKTpLLE09bmV3IChyP1VpbnQ4QXJyYXk6QXJyYXkpKDI4OCksTixPO049MDtmb3IoTz1NLmxlbmd0aDtOPE87KytOKU1bTl09MTQzPj1OPzg6MjU1Pj1OPzk6Mjc5Pj1OPzc6ODt2YXIgej11KE0pLFA9bmV3IChyP1VpbnQ4QXJyYXk6QXJyYXkpKDMwKSxRLFI7UT0wO2ZvcihSPVAubGVuZ3RoO1E8UjsrK1EpUFtRXT01O3ZhciBBPXUoUCk7ZnVuY3Rpb24geShjLGQpe2Zvcih2YXIgYT1jLmYsYj1jLmMsZT1jLmlucHV0LGY9Yy5kLGc7YjxkOyl7Zz1lW2YrK107aWYoZz09PWwpdGhyb3cgRXJyb3IoXCJpbnB1dCBidWZmZXIgaXMgYnJva2VuXCIpO2F8PWc8PGI7Yis9OH1nPWEmKDE8PGQpLTE7Yy5mPWE+Pj5kO2MuYz1iLWQ7Yy5kPWY7cmV0dXJuIGd9XG5mdW5jdGlvbiBTKGMsZCl7Zm9yKHZhciBhPWMuZixiPWMuYyxlPWMuaW5wdXQsZj1jLmQsZz1kWzBdLGg9ZFsxXSxrLG0scztiPGg7KXtrPWVbZisrXTtpZihrPT09bClicmVhazthfD1rPDxiO2IrPTh9bT1nW2EmKDE8PGgpLTFdO3M9bT4+PjE2O2MuZj1hPj5zO2MuYz1iLXM7Yy5kPWY7cmV0dXJuIG0mNjU1MzV9XG5mdW5jdGlvbiBCKGMpe2Z1bmN0aW9uIGQoYSxjLGIpe3ZhciBkLGYsZSxnO2ZvcihnPTA7ZzxhOylzd2l0Y2goZD1TKHRoaXMsYyksZCl7Y2FzZSAxNjpmb3IoZT0zK3kodGhpcywyKTtlLS07KWJbZysrXT1mO2JyZWFrO2Nhc2UgMTc6Zm9yKGU9Myt5KHRoaXMsMyk7ZS0tOyliW2crK109MDtmPTA7YnJlYWs7Y2FzZSAxODpmb3IoZT0xMSt5KHRoaXMsNyk7ZS0tOyliW2crK109MDtmPTA7YnJlYWs7ZGVmYXVsdDpmPWJbZysrXT1kfXJldHVybiBifXZhciBhPXkoYyw1KSsyNTcsYj15KGMsNSkrMSxlPXkoYyw0KSs0LGY9bmV3IChyP1VpbnQ4QXJyYXk6QXJyYXkpKEQubGVuZ3RoKSxnLGgsayxtO2ZvcihtPTA7bTxlOysrbSlmW0RbbV1dPXkoYywzKTtnPXUoZik7aD1uZXcgKHI/VWludDhBcnJheTpBcnJheSkoYSk7az1uZXcgKHI/VWludDhBcnJheTpBcnJheSkoYik7Yy5qKHUoZC5jYWxsKGMsYSxnLGgpKSx1KGQuY2FsbChjLGIsZyxrKSkpfVxudi5wcm90b3R5cGUuaj1mdW5jdGlvbihjLGQpe3ZhciBhPXRoaXMuYixiPXRoaXMuYTt0aGlzLm49Yztmb3IodmFyIGU9YS5sZW5ndGgtMjU4LGYsZyxoLGs7MjU2IT09KGY9Uyh0aGlzLGMpKTspaWYoMjU2PmYpYj49ZSYmKHRoaXMuYT1iLGE9dGhpcy5lKCksYj10aGlzLmEpLGFbYisrXT1mO2Vsc2V7Zz1mLTI1NztrPUZbZ107MDxIW2ddJiYoays9eSh0aGlzLEhbZ10pKTtmPVModGhpcyxkKTtoPUpbZl07MDxMW2ZdJiYoaCs9eSh0aGlzLExbZl0pKTtiPj1lJiYodGhpcy5hPWIsYT10aGlzLmUoKSxiPXRoaXMuYSk7Zm9yKDtrLS07KWFbYl09YVtiKystaF19Zm9yKDs4PD10aGlzLmM7KXRoaXMuYy09OCx0aGlzLmQtLTt0aGlzLmE9Yn07XG52LnByb3RvdHlwZS5zPWZ1bmN0aW9uKGMsZCl7dmFyIGE9dGhpcy5iLGI9dGhpcy5hO3RoaXMubj1jO2Zvcih2YXIgZT1hLmxlbmd0aCxmLGcsaCxrOzI1NiE9PShmPVModGhpcyxjKSk7KWlmKDI1Nj5mKWI+PWUmJihhPXRoaXMuZSgpLGU9YS5sZW5ndGgpLGFbYisrXT1mO2Vsc2V7Zz1mLTI1NztrPUZbZ107MDxIW2ddJiYoays9eSh0aGlzLEhbZ10pKTtmPVModGhpcyxkKTtoPUpbZl07MDxMW2ZdJiYoaCs9eSh0aGlzLExbZl0pKTtiK2s+ZSYmKGE9dGhpcy5lKCksZT1hLmxlbmd0aCk7Zm9yKDtrLS07KWFbYl09YVtiKystaF19Zm9yKDs4PD10aGlzLmM7KXRoaXMuYy09OCx0aGlzLmQtLTt0aGlzLmE9Yn07XG52LnByb3RvdHlwZS5lPWZ1bmN0aW9uKCl7dmFyIGM9bmV3IChyP1VpbnQ4QXJyYXk6QXJyYXkpKHRoaXMuYS0zMjc2OCksZD10aGlzLmEtMzI3NjgsYSxiLGU9dGhpcy5iO2lmKHIpYy5zZXQoZS5zdWJhcnJheSgzMjc2OCxjLmxlbmd0aCkpO2Vsc2V7YT0wO2ZvcihiPWMubGVuZ3RoO2E8YjsrK2EpY1thXT1lW2ErMzI3NjhdfXRoaXMuZy5wdXNoKGMpO3RoaXMuays9Yy5sZW5ndGg7aWYocillLnNldChlLnN1YmFycmF5KGQsZCszMjc2OCkpO2Vsc2UgZm9yKGE9MDszMjc2OD5hOysrYSllW2FdPWVbZCthXTt0aGlzLmE9MzI3Njg7cmV0dXJuIGV9O1xudi5wcm90b3R5cGUudT1mdW5jdGlvbihjKXt2YXIgZCxhPXRoaXMuaW5wdXQubGVuZ3RoL3RoaXMuZCsxfDAsYixlLGYsZz10aGlzLmlucHV0LGg9dGhpcy5iO2MmJihcIm51bWJlclwiPT09dHlwZW9mIGMubyYmKGE9Yy5vKSxcIm51bWJlclwiPT09dHlwZW9mIGMucSYmKGErPWMucSkpOzI+YT8oYj0oZy5sZW5ndGgtdGhpcy5kKS90aGlzLm5bMl0sZj0yNTgqKGIvMil8MCxlPWY8aC5sZW5ndGg/aC5sZW5ndGgrZjpoLmxlbmd0aDw8MSk6ZT1oLmxlbmd0aCphO3I/KGQ9bmV3IFVpbnQ4QXJyYXkoZSksZC5zZXQoaCkpOmQ9aDtyZXR1cm4gdGhpcy5iPWR9O1xudi5wcm90b3R5cGUubT1mdW5jdGlvbigpe3ZhciBjPTAsZD10aGlzLmIsYT10aGlzLmcsYixlPW5ldyAocj9VaW50OEFycmF5OkFycmF5KSh0aGlzLmsrKHRoaXMuYS0zMjc2OCkpLGYsZyxoLGs7aWYoMD09PWEubGVuZ3RoKXJldHVybiByP3RoaXMuYi5zdWJhcnJheSgzMjc2OCx0aGlzLmEpOnRoaXMuYi5zbGljZSgzMjc2OCx0aGlzLmEpO2Y9MDtmb3IoZz1hLmxlbmd0aDtmPGc7KytmKXtiPWFbZl07aD0wO2ZvcihrPWIubGVuZ3RoO2g8azsrK2gpZVtjKytdPWJbaF19Zj0zMjc2ODtmb3IoZz10aGlzLmE7ZjxnOysrZillW2MrK109ZFtmXTt0aGlzLmc9W107cmV0dXJuIHRoaXMuYnVmZmVyPWV9O1xudi5wcm90b3R5cGUucj1mdW5jdGlvbigpe3ZhciBjLGQ9dGhpcy5hO3I/dGhpcy5wPyhjPW5ldyBVaW50OEFycmF5KGQpLGMuc2V0KHRoaXMuYi5zdWJhcnJheSgwLGQpKSk6Yz10aGlzLmIuc3ViYXJyYXkoMCxkKToodGhpcy5iLmxlbmd0aD5kJiYodGhpcy5iLmxlbmd0aD1kKSxjPXRoaXMuYik7cmV0dXJuIHRoaXMuYnVmZmVyPWN9O3EoXCJabGliLlJhd0luZmxhdGVcIix2KTtxKFwiWmxpYi5SYXdJbmZsYXRlLnByb3RvdHlwZS5kZWNvbXByZXNzXCIsdi5wcm90b3R5cGUudCk7dmFyIFQ9e0FEQVBUSVZFOncsQkxPQ0s6eH0sVSxWLFcsWDtpZihPYmplY3Qua2V5cylVPU9iamVjdC5rZXlzKFQpO2Vsc2UgZm9yKFYgaW4gVT1bXSxXPTAsVClVW1crK109VjtXPTA7Zm9yKFg9VS5sZW5ndGg7VzxYOysrVylWPVVbV10scShcIlpsaWIuUmF3SW5mbGF0ZS5CdWZmZXJUeXBlLlwiK1YsVFtWXSk7fSkuY2FsbCh0aGlzKTsgLy9AIHNvdXJjZU1hcHBpbmdVUkw9cmF3aW5mbGF0ZS5taW4uanMubWFwXG5cblxuICAgfSkuY2FsbChjb250ZXh0KTtcbiAgIC8qanNoaW50ICtXMDA0LCArVzAzMCwgK1cwMzIsICtXMDMzLCArVzAzNCwgK1cwNDAsICtXMDU2LCArVzA2MSwgK1cwNjQsICtXMDkzICovXG5cbiAgIHZhciB1bmNvbXByZXNzID0gZnVuY3Rpb24gKGlucHV0KSB7XG4gICAgICB2YXIgaW5mbGF0ZSA9IG5ldyBjb250ZXh0LlpsaWIuUmF3SW5mbGF0ZShpbnB1dCk7XG4gICAgICByZXR1cm4gaW5mbGF0ZS5kZWNvbXByZXNzKCk7XG4gICB9O1xuXG4gICB2YXIgVVNFX1RZUEVEQVJSQVkgPVxuICAgICAgKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJykgJiZcbiAgICAgICh0eXBlb2YgVWludDE2QXJyYXkgIT09ICd1bmRlZmluZWQnKSAmJlxuICAgICAgKHR5cGVvZiBVaW50MzJBcnJheSAhPT0gJ3VuZGVmaW5lZCcpO1xuXG5cbiAgIC8vIHdlIGFkZCB0aGUgY29tcHJlc3Npb24gbWV0aG9kIGZvciBKU1ppcFxuICAgaWYoIUpTWmlwLmNvbXByZXNzaW9uc1tcIkRFRkxBVEVcIl0pIHtcbiAgICAgIEpTWmlwLmNvbXByZXNzaW9uc1tcIkRFRkxBVEVcIl0gPSB7XG4gICAgICAgICBtYWdpYyA6IFwiXFx4MDhcXHgwMFwiLFxuICAgICAgICAgdW5jb21wcmVzcyA6IHVuY29tcHJlc3MsXG4gICAgICAgICB1bmNvbXByZXNzSW5wdXRUeXBlIDogVVNFX1RZUEVEQVJSQVkgPyBcInVpbnQ4YXJyYXlcIiA6IFwiYXJyYXlcIlxuICAgICAgfTtcbiAgIH0gZWxzZSB7XG4gICAgICBKU1ppcC5jb21wcmVzc2lvbnNbXCJERUZMQVRFXCJdLnVuY29tcHJlc3MgPSB1bmNvbXByZXNzO1xuICAgICAgSlNaaXAuY29tcHJlc3Npb25zW1wiREVGTEFURVwiXS51bmNvbXByZXNzSW5wdXRUeXBlID0gVVNFX1RZUEVEQVJSQVkgPyBcInVpbnQ4YXJyYXlcIiA6IFwiYXJyYXlcIjtcbiAgIH1cbn0pKCk7XG5cbi8vIGVuZm9yY2luZyBTdHVrJ3MgY29kaW5nIHN0eWxlXG4vLyB2aW06IHNldCBzaGlmdHdpZHRoPTMgc29mdHRhYnN0b3A9Mzpcbi8qKlxuXG5KU1ppcCAtIEEgSmF2YXNjcmlwdCBjbGFzcyBmb3IgZ2VuZXJhdGluZyBhbmQgcmVhZGluZyB6aXAgZmlsZXNcbjxodHRwOi8vc3R1YXJ0ay5jb20vanN6aXA+XG5cbihjKSAyMDExIERhdmlkIER1cG9uY2hlbCA8ZC5kdXBvbmNoZWxAZ21haWwuY29tPlxuRHVhbCBsaWNlbmNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2Ugb3IgR1BMdjMuIFNlZSBMSUNFTlNFLm1hcmtkb3duLlxuXG4qKi9cbi8qZ2xvYmFsIEpTWmlwICovXG4oZnVuY3Rpb24gKHJvb3QpIHtcbiAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgIHZhciBNQVhfVkFMVUVfMTZCSVRTID0gNjU1MzU7XG4gICB2YXIgTUFYX1ZBTFVFXzMyQklUUyA9IC0xOyAvLyB3ZWxsLCBcIlxceEZGXFx4RkZcXHhGRlxceEZGXFx4RkZcXHhGRlxceEZGXFx4RkZcIiBpcyBwYXJzZWQgYXMgLTFcblxuICAgLyoqXG4gICAgKiBQcmV0dGlmeSBhIHN0cmluZyByZWFkIGFzIGJpbmFyeS5cbiAgICAqIEBwYXJhbSB7c3RyaW5nfSBzdHIgdGhlIHN0cmluZyB0byBwcmV0dGlmeS5cbiAgICAqIEByZXR1cm4ge3N0cmluZ30gYSBwcmV0dHkgc3RyaW5nLlxuICAgICovXG4gICB2YXIgcHJldHR5ID0gZnVuY3Rpb24gKHN0cikge1xuICAgICAgdmFyIHJlcyA9ICcnLCBjb2RlLCBpO1xuICAgICAgZm9yIChpID0gMDsgaSA8IChzdHJ8fFwiXCIpLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICBjb2RlID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgICByZXMgKz0gJ1xcXFx4JyArIChjb2RlIDwgMTYgPyBcIjBcIiA6IFwiXCIpICsgY29kZS50b1N0cmluZygxNikudG9VcHBlckNhc2UoKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXM7XG4gICB9O1xuXG4gICAvKipcbiAgICAqIEZpbmQgYSBjb21wcmVzc2lvbiByZWdpc3RlcmVkIGluIEpTWmlwLlxuICAgICogQHBhcmFtIHtzdHJpbmd9IGNvbXByZXNzaW9uTWV0aG9kIHRoZSBtZXRob2QgbWFnaWMgdG8gZmluZC5cbiAgICAqIEByZXR1cm4ge09iamVjdHxudWxsfSB0aGUgSlNaaXAgY29tcHJlc3Npb24gb2JqZWN0LCBudWxsIGlmIG5vbmUgZm91bmQuXG4gICAgKi9cbiAgIHZhciBmaW5kQ29tcHJlc3Npb24gPSBmdW5jdGlvbiAoY29tcHJlc3Npb25NZXRob2QpIHtcbiAgICAgIGZvciAodmFyIG1ldGhvZCBpbiBKU1ppcC5jb21wcmVzc2lvbnMpIHtcbiAgICAgICAgIGlmKCAhSlNaaXAuY29tcHJlc3Npb25zLmhhc093blByb3BlcnR5KG1ldGhvZCkgKSB7IGNvbnRpbnVlOyB9XG4gICAgICAgICBpZiAoSlNaaXAuY29tcHJlc3Npb25zW21ldGhvZF0ubWFnaWMgPT09IGNvbXByZXNzaW9uTWV0aG9kKSB7XG4gICAgICAgICAgICByZXR1cm4gSlNaaXAuY29tcHJlc3Npb25zW21ldGhvZF07XG4gICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbDtcbiAgIH07XG5cbiAgIC8vIGNsYXNzIERhdGFSZWFkZXIge3t7XG4gICAvKipcbiAgICAqIFJlYWQgYnl0ZXMgZnJvbSBhIHNvdXJjZS5cbiAgICAqIERldmVsb3BlciB0aXAgOiB3aGVuIGRlYnVnZ2luZywgYSB3YXRjaCBvbiBwcmV0dHkodGhpcy5yZWFkZXIuZGF0YS5zbGljZSh0aGlzLnJlYWRlci5pbmRleCkpXG4gICAgKiBpcyB2ZXJ5IHVzZWZ1bCA6KVxuICAgICogQGNvbnN0cnVjdG9yXG4gICAgKiBAcGFyYW0ge1N0cmluZ3xBcnJheUJ1ZmZlcnxVaW50OEFycmF5fEJ1ZmZlcn0gZGF0YSB0aGUgZGF0YSB0byByZWFkLlxuICAgICovXG4gICBmdW5jdGlvbiBEYXRhUmVhZGVyKGRhdGEpIHtcbiAgICAgIHRoaXMuZGF0YSA9IG51bGw7IC8vIHR5cGUgOiBzZWUgaW1wbGVtZW50YXRpb25cbiAgICAgIHRoaXMubGVuZ3RoID0gMDtcbiAgICAgIHRoaXMuaW5kZXggPSAwO1xuICAgfVxuICAgRGF0YVJlYWRlci5wcm90b3R5cGUgPSB7XG4gICAgICAvKipcbiAgICAgICAqIENoZWNrIHRoYXQgdGhlIG9mZnNldCB3aWxsIG5vdCBnbyB0b28gZmFyLlxuICAgICAgICogQHBhcmFtIHtzdHJpbmd9IG9mZnNldCB0aGUgYWRkaXRpb25hbCBvZmZzZXQgdG8gY2hlY2suXG4gICAgICAgKiBAdGhyb3dzIHtFcnJvcn0gYW4gRXJyb3IgaWYgdGhlIG9mZnNldCBpcyBvdXQgb2YgYm91bmRzLlxuICAgICAgICovXG4gICAgICBjaGVja09mZnNldCA6IGZ1bmN0aW9uIChvZmZzZXQpIHtcbiAgICAgICAgIHRoaXMuY2hlY2tJbmRleCh0aGlzLmluZGV4ICsgb2Zmc2V0KTtcbiAgICAgIH0sXG4gICAgICAvKipcbiAgICAgICAqIENoZWNrIHRoYXQgdGhlIHNwZWNpZmVkIGluZGV4IHdpbGwgbm90IGJlIHRvbyBmYXIuXG4gICAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmV3SW5kZXggdGhlIGluZGV4IHRvIGNoZWNrLlxuICAgICAgICogQHRocm93cyB7RXJyb3J9IGFuIEVycm9yIGlmIHRoZSBpbmRleCBpcyBvdXQgb2YgYm91bmRzLlxuICAgICAgICovXG4gICAgICBjaGVja0luZGV4IDogZnVuY3Rpb24gKG5ld0luZGV4KSB7XG4gICAgICAgICBpZiAodGhpcy5sZW5ndGggPCBuZXdJbmRleCB8fCBuZXdJbmRleCA8IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkVuZCBvZiBkYXRhIHJlYWNoZWQgKGRhdGEgbGVuZ3RoID0gXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubGVuZ3RoICsgXCIsIGFza2VkIGluZGV4ID0gXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIChuZXdJbmRleCkgKyBcIikuIENvcnJ1cHRlZCB6aXAgP1wiKTtcbiAgICAgICAgIH1cbiAgICAgIH0sXG4gICAgICAvKipcbiAgICAgICAqIENoYW5nZSB0aGUgaW5kZXguXG4gICAgICAgKiBAcGFyYW0ge251bWJlcn0gbmV3SW5kZXggVGhlIG5ldyBpbmRleC5cbiAgICAgICAqIEB0aHJvd3Mge0Vycm9yfSBpZiB0aGUgbmV3IGluZGV4IGlzIG91dCBvZiB0aGUgZGF0YS5cbiAgICAgICAqL1xuICAgICAgc2V0SW5kZXggOiBmdW5jdGlvbiAobmV3SW5kZXgpIHtcbiAgICAgICAgIHRoaXMuY2hlY2tJbmRleChuZXdJbmRleCk7XG4gICAgICAgICB0aGlzLmluZGV4ID0gbmV3SW5kZXg7XG4gICAgICB9LFxuICAgICAgLyoqXG4gICAgICAgKiBTa2lwIHRoZSBuZXh0IG4gYnl0ZXMuXG4gICAgICAgKiBAcGFyYW0ge251bWJlcn0gbiB0aGUgbnVtYmVyIG9mIGJ5dGVzIHRvIHNraXAuXG4gICAgICAgKiBAdGhyb3dzIHtFcnJvcn0gaWYgdGhlIG5ldyBpbmRleCBpcyBvdXQgb2YgdGhlIGRhdGEuXG4gICAgICAgKi9cbiAgICAgIHNraXAgOiBmdW5jdGlvbiAobikge1xuICAgICAgICAgdGhpcy5zZXRJbmRleCh0aGlzLmluZGV4ICsgbik7XG4gICAgICB9LFxuICAgICAgLyoqXG4gICAgICAgKiBHZXQgdGhlIGJ5dGUgYXQgdGhlIHNwZWNpZmllZCBpbmRleC5cbiAgICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpIHRoZSBpbmRleCB0byB1c2UuXG4gICAgICAgKiBAcmV0dXJuIHtudW1iZXJ9IGEgYnl0ZS5cbiAgICAgICAqL1xuICAgICAgYnl0ZUF0IDogZnVuY3Rpb24oaSkge1xuICAgICAgICAgLy8gc2VlIGltcGxlbWVudGF0aW9uc1xuICAgICAgfSxcbiAgICAgIC8qKlxuICAgICAgICogR2V0IHRoZSBuZXh0IG51bWJlciB3aXRoIGEgZ2l2ZW4gYnl0ZSBzaXplLlxuICAgICAgICogQHBhcmFtIHtudW1iZXJ9IHNpemUgdGhlIG51bWJlciBvZiBieXRlcyB0byByZWFkLlxuICAgICAgICogQHJldHVybiB7bnVtYmVyfSB0aGUgY29ycmVzcG9uZGluZyBudW1iZXIuXG4gICAgICAgKi9cbiAgICAgIHJlYWRJbnQgOiBmdW5jdGlvbiAoc2l6ZSkge1xuICAgICAgICAgdmFyIHJlc3VsdCA9IDAsIGk7XG4gICAgICAgICB0aGlzLmNoZWNrT2Zmc2V0KHNpemUpO1xuICAgICAgICAgZm9yKGkgPSB0aGlzLmluZGV4ICsgc2l6ZSAtIDE7IGkgPj0gdGhpcy5pbmRleDsgaS0tKSB7XG4gICAgICAgICAgICByZXN1bHQgPSAocmVzdWx0IDw8IDgpICsgdGhpcy5ieXRlQXQoaSk7XG4gICAgICAgICB9XG4gICAgICAgICB0aGlzLmluZGV4ICs9IHNpemU7XG4gICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfSxcbiAgICAgIC8qKlxuICAgICAgICogR2V0IHRoZSBuZXh0IHN0cmluZyB3aXRoIGEgZ2l2ZW4gYnl0ZSBzaXplLlxuICAgICAgICogQHBhcmFtIHtudW1iZXJ9IHNpemUgdGhlIG51bWJlciBvZiBieXRlcyB0byByZWFkLlxuICAgICAgICogQHJldHVybiB7c3RyaW5nfSB0aGUgY29ycmVzcG9uZGluZyBzdHJpbmcuXG4gICAgICAgKi9cbiAgICAgIHJlYWRTdHJpbmcgOiBmdW5jdGlvbiAoc2l6ZSkge1xuICAgICAgICAgcmV0dXJuIEpTWmlwLnV0aWxzLnRyYW5zZm9ybVRvKFwic3RyaW5nXCIsIHRoaXMucmVhZERhdGEoc2l6ZSkpO1xuICAgICAgfSxcbiAgICAgIC8qKlxuICAgICAgICogR2V0IHJhdyBkYXRhIHdpdGhvdXQgY29udmVyc2lvbiwgPHNpemU+IGJ5dGVzLlxuICAgICAgICogQHBhcmFtIHtudW1iZXJ9IHNpemUgdGhlIG51bWJlciBvZiBieXRlcyB0byByZWFkLlxuICAgICAgICogQHJldHVybiB7T2JqZWN0fSB0aGUgcmF3IGRhdGEsIGltcGxlbWVudGF0aW9uIHNwZWNpZmljLlxuICAgICAgICovXG4gICAgICByZWFkRGF0YSA6IGZ1bmN0aW9uIChzaXplKSB7XG4gICAgICAgICAvLyBzZWUgaW1wbGVtZW50YXRpb25zXG4gICAgICB9LFxuICAgICAgLyoqXG4gICAgICAgKiBGaW5kIHRoZSBsYXN0IG9jY3VyZW5jZSBvZiBhIHppcCBzaWduYXR1cmUgKDQgYnl0ZXMpLlxuICAgICAgICogQHBhcmFtIHtzdHJpbmd9IHNpZyB0aGUgc2lnbmF0dXJlIHRvIGZpbmQuXG4gICAgICAgKiBAcmV0dXJuIHtudW1iZXJ9IHRoZSBpbmRleCBvZiB0aGUgbGFzdCBvY2N1cmVuY2UsIC0xIGlmIG5vdCBmb3VuZC5cbiAgICAgICAqL1xuICAgICAgbGFzdEluZGV4T2ZTaWduYXR1cmUgOiBmdW5jdGlvbiAoc2lnKSB7XG4gICAgICAgICAvLyBzZWUgaW1wbGVtZW50YXRpb25zXG4gICAgICB9LFxuICAgICAgLyoqXG4gICAgICAgKiBHZXQgdGhlIG5leHQgZGF0ZS5cbiAgICAgICAqIEByZXR1cm4ge0RhdGV9IHRoZSBkYXRlLlxuICAgICAgICovXG4gICAgICByZWFkRGF0ZSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgIHZhciBkb3N0aW1lID0gdGhpcy5yZWFkSW50KDQpO1xuICAgICAgICAgcmV0dXJuIG5ldyBEYXRlKFxuICAgICAgICAgICAgKChkb3N0aW1lID4+IDI1KSAmIDB4N2YpICsgMTk4MCwgLy8geWVhclxuICAgICAgICAgICAgKChkb3N0aW1lID4+IDIxKSAmIDB4MGYpIC0gMSwgLy8gbW9udGhcbiAgICAgICAgICAgIChkb3N0aW1lID4+IDE2KSAmIDB4MWYsIC8vIGRheVxuICAgICAgICAgICAgKGRvc3RpbWUgPj4gMTEpICYgMHgxZiwgLy8gaG91clxuICAgICAgICAgICAgKGRvc3RpbWUgPj4gNSkgJiAweDNmLCAvLyBtaW51dGVcbiAgICAgICAgICAgIChkb3N0aW1lICYgMHgxZikgPDwgMSk7IC8vIHNlY29uZFxuICAgICAgfVxuICAgfTtcblxuXG4gICAvKipcbiAgICAqIFJlYWQgYnl0ZXMgZnJvbSBhIHN0cmluZy5cbiAgICAqIEBjb25zdHJ1Y3RvclxuICAgICogQHBhcmFtIHtTdHJpbmd9IGRhdGEgdGhlIGRhdGEgdG8gcmVhZC5cbiAgICAqL1xuICAgZnVuY3Rpb24gU3RyaW5nUmVhZGVyKGRhdGEsIG9wdGltaXplZEJpbmFyeVN0cmluZykge1xuICAgICAgdGhpcy5kYXRhID0gZGF0YTtcbiAgICAgIGlmICghb3B0aW1pemVkQmluYXJ5U3RyaW5nKSB7XG4gICAgICAgICB0aGlzLmRhdGEgPSBKU1ppcC51dGlscy5zdHJpbmcyYmluYXJ5KHRoaXMuZGF0YSk7XG4gICAgICB9XG4gICAgICB0aGlzLmxlbmd0aCA9IHRoaXMuZGF0YS5sZW5ndGg7XG4gICAgICB0aGlzLmluZGV4ID0gMDtcbiAgIH1cbiAgIFN0cmluZ1JlYWRlci5wcm90b3R5cGUgPSBuZXcgRGF0YVJlYWRlcigpO1xuICAgLyoqXG4gICAgKiBAc2VlIERhdGFSZWFkZXIuYnl0ZUF0XG4gICAgKi9cbiAgIFN0cmluZ1JlYWRlci5wcm90b3R5cGUuYnl0ZUF0ID0gZnVuY3Rpb24oaSkge1xuICAgICAgcmV0dXJuIHRoaXMuZGF0YS5jaGFyQ29kZUF0KGkpO1xuICAgfTtcbiAgIC8qKlxuICAgICogQHNlZSBEYXRhUmVhZGVyLmxhc3RJbmRleE9mU2lnbmF0dXJlXG4gICAgKi9cbiAgIFN0cmluZ1JlYWRlci5wcm90b3R5cGUubGFzdEluZGV4T2ZTaWduYXR1cmUgPSBmdW5jdGlvbiAoc2lnKSB7XG4gICAgICByZXR1cm4gdGhpcy5kYXRhLmxhc3RJbmRleE9mKHNpZyk7XG4gICB9O1xuICAgLyoqXG4gICAgKiBAc2VlIERhdGFSZWFkZXIucmVhZERhdGFcbiAgICAqL1xuICAgU3RyaW5nUmVhZGVyLnByb3RvdHlwZS5yZWFkRGF0YSA9IGZ1bmN0aW9uIChzaXplKSB7XG4gICAgICB0aGlzLmNoZWNrT2Zmc2V0KHNpemUpO1xuICAgICAgLy8gdGhpcyB3aWxsIHdvcmsgYmVjYXVzZSB0aGUgY29uc3RydWN0b3IgYXBwbGllZCB0aGUgXCImIDB4ZmZcIiBtYXNrLlxuICAgICAgdmFyIHJlc3VsdCA9IHRoaXMuZGF0YS5zbGljZSh0aGlzLmluZGV4LCB0aGlzLmluZGV4ICsgc2l6ZSk7XG4gICAgICB0aGlzLmluZGV4ICs9IHNpemU7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgfTtcblxuXG4gICAvKipcbiAgICAqIFJlYWQgYnl0ZXMgZnJvbSBhbiBVaW44QXJyYXkuXG4gICAgKiBAY29uc3RydWN0b3JcbiAgICAqIEBwYXJhbSB7VWludDhBcnJheX0gZGF0YSB0aGUgZGF0YSB0byByZWFkLlxuICAgICovXG4gICBmdW5jdGlvbiBVaW50OEFycmF5UmVhZGVyKGRhdGEpIHtcbiAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICB0aGlzLmRhdGEgPSBkYXRhO1xuICAgICAgICAgdGhpcy5sZW5ndGggPSB0aGlzLmRhdGEubGVuZ3RoO1xuICAgICAgICAgdGhpcy5pbmRleCA9IDA7XG4gICAgICB9XG4gICB9XG4gICBVaW50OEFycmF5UmVhZGVyLnByb3RvdHlwZSA9IG5ldyBEYXRhUmVhZGVyKCk7XG4gICAvKipcbiAgICAqIEBzZWUgRGF0YVJlYWRlci5ieXRlQXRcbiAgICAqL1xuICAgVWludDhBcnJheVJlYWRlci5wcm90b3R5cGUuYnl0ZUF0ID0gZnVuY3Rpb24oaSkge1xuICAgICAgcmV0dXJuIHRoaXMuZGF0YVtpXTtcbiAgIH07XG4gICAvKipcbiAgICAqIEBzZWUgRGF0YVJlYWRlci5sYXN0SW5kZXhPZlNpZ25hdHVyZVxuICAgICovXG4gICBVaW50OEFycmF5UmVhZGVyLnByb3RvdHlwZS5sYXN0SW5kZXhPZlNpZ25hdHVyZSA9IGZ1bmN0aW9uIChzaWcpIHtcbiAgICAgIHZhciBzaWcwID0gc2lnLmNoYXJDb2RlQXQoMCksXG4gICAgICBzaWcxID0gc2lnLmNoYXJDb2RlQXQoMSksXG4gICAgICBzaWcyID0gc2lnLmNoYXJDb2RlQXQoMiksXG4gICAgICBzaWczID0gc2lnLmNoYXJDb2RlQXQoMyk7XG4gICAgICBmb3IodmFyIGkgPSB0aGlzLmxlbmd0aCAtIDQ7aSA+PSAwOy0taSkge1xuICAgICAgICAgaWYgKHRoaXMuZGF0YVtpXSA9PT0gc2lnMCAmJiB0aGlzLmRhdGFbaSsxXSA9PT0gc2lnMSAmJiB0aGlzLmRhdGFbaSsyXSA9PT0gc2lnMiAmJiB0aGlzLmRhdGFbaSszXSA9PT0gc2lnMykge1xuICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiAtMTtcbiAgIH07XG4gICAvKipcbiAgICAqIEBzZWUgRGF0YVJlYWRlci5yZWFkRGF0YVxuICAgICovXG4gICBVaW50OEFycmF5UmVhZGVyLnByb3RvdHlwZS5yZWFkRGF0YSA9IGZ1bmN0aW9uIChzaXplKSB7XG4gICAgICB0aGlzLmNoZWNrT2Zmc2V0KHNpemUpO1xuICAgICAgdmFyIHJlc3VsdCA9IHRoaXMuZGF0YS5zdWJhcnJheSh0aGlzLmluZGV4LCB0aGlzLmluZGV4ICsgc2l6ZSk7XG4gICAgICB0aGlzLmluZGV4ICs9IHNpemU7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgfTtcblxuICAgLyoqXG4gICAgKiBSZWFkIGJ5dGVzIGZyb20gYSBCdWZmZXIuXG4gICAgKiBAY29uc3RydWN0b3JcbiAgICAqIEBwYXJhbSB7QnVmZmVyfSBkYXRhIHRoZSBkYXRhIHRvIHJlYWQuXG4gICAgKi9cbiAgIGZ1bmN0aW9uIE5vZGVCdWZmZXJSZWFkZXIoZGF0YSkge1xuICAgICAgdGhpcy5kYXRhID0gZGF0YTtcbiAgICAgIHRoaXMubGVuZ3RoID0gdGhpcy5kYXRhLmxlbmd0aDtcbiAgICAgIHRoaXMuaW5kZXggPSAwO1xuICAgfVxuICAgTm9kZUJ1ZmZlclJlYWRlci5wcm90b3R5cGUgPSBuZXcgVWludDhBcnJheVJlYWRlcigpO1xuXG4gICAvKipcbiAgICAqIEBzZWUgRGF0YVJlYWRlci5yZWFkRGF0YVxuICAgICovXG4gICBOb2RlQnVmZmVyUmVhZGVyLnByb3RvdHlwZS5yZWFkRGF0YSA9IGZ1bmN0aW9uIChzaXplKSB7XG4gICAgICB0aGlzLmNoZWNrT2Zmc2V0KHNpemUpO1xuICAgICAgdmFyIHJlc3VsdCA9IHRoaXMuZGF0YS5zbGljZSh0aGlzLmluZGV4LCB0aGlzLmluZGV4ICsgc2l6ZSk7XG4gICAgICB0aGlzLmluZGV4ICs9IHNpemU7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgfTtcbiAgIC8vIH19fSBlbmQgb2YgRGF0YVJlYWRlclxuXG4gICAvLyBjbGFzcyBaaXBFbnRyeSB7e3tcbiAgIC8qKlxuICAgICogQW4gZW50cnkgaW4gdGhlIHppcCBmaWxlLlxuICAgICogQGNvbnN0cnVjdG9yXG4gICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBPcHRpb25zIG9mIHRoZSBjdXJyZW50IGZpbGUuXG4gICAgKiBAcGFyYW0ge09iamVjdH0gbG9hZE9wdGlvbnMgT3B0aW9ucyBmb3IgbG9hZGluZyB0aGUgZGF0YS5cbiAgICAqL1xuICAgZnVuY3Rpb24gWmlwRW50cnkob3B0aW9ucywgbG9hZE9wdGlvbnMpIHtcbiAgICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgICB0aGlzLmxvYWRPcHRpb25zID0gbG9hZE9wdGlvbnM7XG4gICB9XG4gICBaaXBFbnRyeS5wcm90b3R5cGUgPSB7XG4gICAgICAvKipcbiAgICAgICAqIHNheSBpZiB0aGUgZmlsZSBpcyBlbmNyeXB0ZWQuXG4gICAgICAgKiBAcmV0dXJuIHtib29sZWFufSB0cnVlIGlmIHRoZSBmaWxlIGlzIGVuY3J5cHRlZCwgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgICAgICovXG4gICAgICBpc0VuY3J5cHRlZCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgIC8vIGJpdCAxIGlzIHNldFxuICAgICAgICAgcmV0dXJuICh0aGlzLmJpdEZsYWcgJiAweDAwMDEpID09PSAweDAwMDE7XG4gICAgICB9LFxuICAgICAgLyoqXG4gICAgICAgKiBzYXkgaWYgdGhlIGZpbGUgaGFzIHV0Zi04IGZpbGVuYW1lL2NvbW1lbnQuXG4gICAgICAgKiBAcmV0dXJuIHtib29sZWFufSB0cnVlIGlmIHRoZSBmaWxlbmFtZS9jb21tZW50IGlzIGluIHV0Zi04LCBmYWxzZSBvdGhlcndpc2UuXG4gICAgICAgKi9cbiAgICAgIHVzZVVURjggOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAvLyBiaXQgMTEgaXMgc2V0XG4gICAgICAgICByZXR1cm4gKHRoaXMuYml0RmxhZyAmIDB4MDgwMCkgPT09IDB4MDgwMDtcbiAgICAgIH0sXG4gICAgICAvKipcbiAgICAgICAqIFByZXBhcmUgdGhlIGZ1bmN0aW9uIHVzZWQgdG8gZ2VuZXJhdGUgdGhlIGNvbXByZXNzZWQgY29udGVudCBmcm9tIHRoaXMgWmlwRmlsZS5cbiAgICAgICAqIEBwYXJhbSB7RGF0YVJlYWRlcn0gcmVhZGVyIHRoZSByZWFkZXIgdG8gdXNlLlxuICAgICAgICogQHBhcmFtIHtudW1iZXJ9IGZyb20gdGhlIG9mZnNldCBmcm9tIHdoZXJlIHdlIHNob3VsZCByZWFkIHRoZSBkYXRhLlxuICAgICAgICogQHBhcmFtIHtudW1iZXJ9IGxlbmd0aCB0aGUgbGVuZ3RoIG9mIHRoZSBkYXRhIHRvIHJlYWQuXG4gICAgICAgKiBAcmV0dXJuIHtGdW5jdGlvbn0gdGhlIGNhbGxiYWNrIHRvIGdldCB0aGUgY29tcHJlc3NlZCBjb250ZW50ICh0aGUgdHlwZSBkZXBlbmRzIG9mIHRoZSBEYXRhUmVhZGVyIGNsYXNzKS5cbiAgICAgICAqL1xuICAgICAgcHJlcGFyZUNvbXByZXNzZWRDb250ZW50IDogZnVuY3Rpb24gKHJlYWRlciwgZnJvbSwgbGVuZ3RoKSB7XG4gICAgICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHByZXZpb3VzSW5kZXggPSByZWFkZXIuaW5kZXg7XG4gICAgICAgICAgICByZWFkZXIuc2V0SW5kZXgoZnJvbSk7XG4gICAgICAgICAgICB2YXIgY29tcHJlc3NlZEZpbGVEYXRhID0gcmVhZGVyLnJlYWREYXRhKGxlbmd0aCk7XG4gICAgICAgICAgICByZWFkZXIuc2V0SW5kZXgocHJldmlvdXNJbmRleCk7XG5cbiAgICAgICAgICAgIHJldHVybiBjb21wcmVzc2VkRmlsZURhdGE7XG4gICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIC8qKlxuICAgICAgICogUHJlcGFyZSB0aGUgZnVuY3Rpb24gdXNlZCB0byBnZW5lcmF0ZSB0aGUgdW5jb21wcmVzc2VkIGNvbnRlbnQgZnJvbSB0aGlzIFppcEZpbGUuXG4gICAgICAgKiBAcGFyYW0ge0RhdGFSZWFkZXJ9IHJlYWRlciB0aGUgcmVhZGVyIHRvIHVzZS5cbiAgICAgICAqIEBwYXJhbSB7bnVtYmVyfSBmcm9tIHRoZSBvZmZzZXQgZnJvbSB3aGVyZSB3ZSBzaG91bGQgcmVhZCB0aGUgZGF0YS5cbiAgICAgICAqIEBwYXJhbSB7bnVtYmVyfSBsZW5ndGggdGhlIGxlbmd0aCBvZiB0aGUgZGF0YSB0byByZWFkLlxuICAgICAgICogQHBhcmFtIHtKU1ppcC5jb21wcmVzc2lvbn0gY29tcHJlc3Npb24gdGhlIGNvbXByZXNzaW9uIHVzZWQgb24gdGhpcyBmaWxlLlxuICAgICAgICogQHBhcmFtIHtudW1iZXJ9IHVuY29tcHJlc3NlZFNpemUgdGhlIHVuY29tcHJlc3NlZCBzaXplIHRvIGV4cGVjdC5cbiAgICAgICAqIEByZXR1cm4ge0Z1bmN0aW9ufSB0aGUgY2FsbGJhY2sgdG8gZ2V0IHRoZSB1bmNvbXByZXNzZWQgY29udGVudCAodGhlIHR5cGUgZGVwZW5kcyBvZiB0aGUgRGF0YVJlYWRlciBjbGFzcykuXG4gICAgICAgKi9cbiAgICAgIHByZXBhcmVDb250ZW50IDogZnVuY3Rpb24gKHJlYWRlciwgZnJvbSwgbGVuZ3RoLCBjb21wcmVzc2lvbiwgdW5jb21wcmVzc2VkU2l6ZSkge1xuICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcblxuICAgICAgICAgICAgdmFyIGNvbXByZXNzZWRGaWxlRGF0YSA9IEpTWmlwLnV0aWxzLnRyYW5zZm9ybVRvKGNvbXByZXNzaW9uLnVuY29tcHJlc3NJbnB1dFR5cGUsIHRoaXMuZ2V0Q29tcHJlc3NlZENvbnRlbnQoKSk7XG4gICAgICAgICAgICB2YXIgdW5jb21wcmVzc2VkRmlsZURhdGEgPSBjb21wcmVzc2lvbi51bmNvbXByZXNzKGNvbXByZXNzZWRGaWxlRGF0YSk7XG5cbiAgICAgICAgICAgIGlmICh1bmNvbXByZXNzZWRGaWxlRGF0YS5sZW5ndGggIT09IHVuY29tcHJlc3NlZFNpemUpIHtcbiAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkJ1ZyA6IHVuY29tcHJlc3NlZCBkYXRhIHNpemUgbWlzbWF0Y2hcIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB1bmNvbXByZXNzZWRGaWxlRGF0YTtcbiAgICAgICAgIH07XG4gICAgICB9LFxuICAgICAgLyoqXG4gICAgICAgKiBSZWFkIHRoZSBsb2NhbCBwYXJ0IG9mIGEgemlwIGZpbGUgYW5kIGFkZCB0aGUgaW5mbyBpbiB0aGlzIG9iamVjdC5cbiAgICAgICAqIEBwYXJhbSB7RGF0YVJlYWRlcn0gcmVhZGVyIHRoZSByZWFkZXIgdG8gdXNlLlxuICAgICAgICovXG4gICAgICByZWFkTG9jYWxQYXJ0IDogZnVuY3Rpb24ocmVhZGVyKSB7XG4gICAgICAgICB2YXIgY29tcHJlc3Npb24sIGxvY2FsRXh0cmFGaWVsZHNMZW5ndGg7XG5cbiAgICAgICAgIC8vIHdlIGFscmVhZHkga25vdyBldmVyeXRoaW5nIGZyb20gdGhlIGNlbnRyYWwgZGlyICFcbiAgICAgICAgIC8vIElmIHRoZSBjZW50cmFsIGRpciBkYXRhIGFyZSBmYWxzZSwgd2UgYXJlIGRvb21lZC5cbiAgICAgICAgIC8vIE9uIHRoZSBicmlnaHQgc2lkZSwgdGhlIGxvY2FsIHBhcnQgaXMgc2NhcnkgIDogemlwNjQsIGRhdGEgZGVzY3JpcHRvcnMsIGJvdGgsIGV0Yy5cbiAgICAgICAgIC8vIFRoZSBsZXNzIGRhdGEgd2UgZ2V0IGhlcmUsIHRoZSBtb3JlIHJlbGlhYmxlIHRoaXMgc2hvdWxkIGJlLlxuICAgICAgICAgLy8gTGV0J3Mgc2tpcCB0aGUgd2hvbGUgaGVhZGVyIGFuZCBkYXNoIHRvIHRoZSBkYXRhICFcbiAgICAgICAgIHJlYWRlci5za2lwKDIyKTtcbiAgICAgICAgIC8vIGluIHNvbWUgemlwIGNyZWF0ZWQgb24gd2luZG93cywgdGhlIGZpbGVuYW1lIHN0b3JlZCBpbiB0aGUgY2VudHJhbCBkaXIgY29udGFpbnMgXFwgaW5zdGVhZCBvZiAvLlxuICAgICAgICAgLy8gU3RyYW5nZWx5LCB0aGUgZmlsZW5hbWUgaGVyZSBpcyBPSy5cbiAgICAgICAgIC8vIEkgd291bGQgbG92ZSB0byB0cmVhdCB0aGVzZSB6aXAgZmlsZXMgYXMgY29ycnVwdGVkIChzZWUgaHR0cDovL3d3dy5pbmZvLXppcC5vcmcvRkFRLmh0bWwjYmFja3NsYXNoZXNcbiAgICAgICAgIC8vIG9yIEFQUE5PVEUjNC40LjE3LjEsIFwiQWxsIHNsYXNoZXMgTVVTVCBiZSBmb3J3YXJkIHNsYXNoZXMgJy8nXCIpIGJ1dCB0aGVyZSBhcmUgYSBsb3Qgb2YgYmFkIHppcCBnZW5lcmF0b3JzLi4uXG4gICAgICAgICAvLyBTZWFyY2ggXCJ1bnppcCBtaXNtYXRjaGluZyBcImxvY2FsXCIgZmlsZW5hbWUgY29udGludWluZyB3aXRoIFwiY2VudHJhbFwiIGZpbGVuYW1lIHZlcnNpb25cIiBvblxuICAgICAgICAgLy8gdGhlIGludGVybmV0LlxuICAgICAgICAgLy9cbiAgICAgICAgIC8vIEkgdGhpbmsgSSBzZWUgdGhlIGxvZ2ljIGhlcmUgOiB0aGUgY2VudHJhbCBkaXJlY3RvcnkgaXMgdXNlZCB0byBkaXNwbGF5XG4gICAgICAgICAvLyBjb250ZW50IGFuZCB0aGUgbG9jYWwgZGlyZWN0b3J5IGlzIHVzZWQgdG8gZXh0cmFjdCB0aGUgZmlsZXMuIE1peGluZyAvIGFuZCBcXFxuICAgICAgICAgLy8gbWF5IGJlIHVzZWQgdG8gZGlzcGxheSBcXCB0byB3aW5kb3dzIHVzZXJzIGFuZCB1c2UgLyB3aGVuIGV4dHJhY3RpbmcgdGhlIGZpbGVzLlxuICAgICAgICAgLy8gVW5mb3J0dW5hdGVseSwgdGhpcyBsZWFkIGFsc28gdG8gc29tZSBpc3N1ZXMgOiBodHRwOi8vc2VjbGlzdHMub3JnL2Z1bGxkaXNjbG9zdXJlLzIwMDkvU2VwLzM5NFxuICAgICAgICAgdGhpcy5maWxlTmFtZUxlbmd0aCA9IHJlYWRlci5yZWFkSW50KDIpO1xuICAgICAgICAgbG9jYWxFeHRyYUZpZWxkc0xlbmd0aCA9IHJlYWRlci5yZWFkSW50KDIpOyAvLyBjYW4ndCBiZSBzdXJlIHRoaXMgd2lsbCBiZSB0aGUgc2FtZSBhcyB0aGUgY2VudHJhbCBkaXJcbiAgICAgICAgIHRoaXMuZmlsZU5hbWUgPSByZWFkZXIucmVhZFN0cmluZyh0aGlzLmZpbGVOYW1lTGVuZ3RoKTtcbiAgICAgICAgIHJlYWRlci5za2lwKGxvY2FsRXh0cmFGaWVsZHNMZW5ndGgpO1xuXG4gICAgICAgICBpZiAodGhpcy5jb21wcmVzc2VkU2l6ZSA9PSAtMSB8fCB0aGlzLnVuY29tcHJlc3NlZFNpemUgPT0gLTEpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkJ1ZyBvciBjb3JydXB0ZWQgemlwIDogZGlkbid0IGdldCBlbm91Z2ggaW5mb3JtYXRpb25zIGZyb20gdGhlIGNlbnRyYWwgZGlyZWN0b3J5IFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIihjb21wcmVzc2VkU2l6ZSA9PSAtMSB8fCB1bmNvbXByZXNzZWRTaXplID09IC0xKVwiKTtcbiAgICAgICAgIH1cblxuICAgICAgICAgY29tcHJlc3Npb24gPSBmaW5kQ29tcHJlc3Npb24odGhpcy5jb21wcmVzc2lvbk1ldGhvZCk7XG4gICAgICAgICBpZiAoY29tcHJlc3Npb24gPT09IG51bGwpIHsgLy8gbm8gY29tcHJlc3Npb24gZm91bmRcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvcnJ1cHRlZCB6aXAgOiBjb21wcmVzc2lvbiBcIiArIHByZXR0eSh0aGlzLmNvbXByZXNzaW9uTWV0aG9kKSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgdW5rbm93biAoaW5uZXIgZmlsZSA6IFwiICsgdGhpcy5maWxlTmFtZSArIFwiKVwiKTtcbiAgICAgICAgIH1cbiAgICAgICAgIHRoaXMuZGVjb21wcmVzc2VkID0gbmV3IEpTWmlwLkNvbXByZXNzZWRPYmplY3QoKTtcbiAgICAgICAgIHRoaXMuZGVjb21wcmVzc2VkLmNvbXByZXNzZWRTaXplID0gdGhpcy5jb21wcmVzc2VkU2l6ZTtcbiAgICAgICAgIHRoaXMuZGVjb21wcmVzc2VkLnVuY29tcHJlc3NlZFNpemUgPSB0aGlzLnVuY29tcHJlc3NlZFNpemU7XG4gICAgICAgICB0aGlzLmRlY29tcHJlc3NlZC5jcmMzMiA9IHRoaXMuY3JjMzI7XG4gICAgICAgICB0aGlzLmRlY29tcHJlc3NlZC5jb21wcmVzc2lvbk1ldGhvZCA9IHRoaXMuY29tcHJlc3Npb25NZXRob2Q7XG4gICAgICAgICB0aGlzLmRlY29tcHJlc3NlZC5nZXRDb21wcmVzc2VkQ29udGVudCA9IHRoaXMucHJlcGFyZUNvbXByZXNzZWRDb250ZW50KHJlYWRlciwgcmVhZGVyLmluZGV4LCB0aGlzLmNvbXByZXNzZWRTaXplLCBjb21wcmVzc2lvbik7XG4gICAgICAgICB0aGlzLmRlY29tcHJlc3NlZC5nZXRDb250ZW50ID0gdGhpcy5wcmVwYXJlQ29udGVudChyZWFkZXIsIHJlYWRlci5pbmRleCwgdGhpcy5jb21wcmVzc2VkU2l6ZSwgY29tcHJlc3Npb24sIHRoaXMudW5jb21wcmVzc2VkU2l6ZSk7XG5cbiAgICAgICAgIC8vIHdlIG5lZWQgdG8gY29tcHV0ZSB0aGUgY3JjMzIuLi5cbiAgICAgICAgIGlmICh0aGlzLmxvYWRPcHRpb25zLmNoZWNrQ1JDMzIpIHtcbiAgICAgICAgICAgIHRoaXMuZGVjb21wcmVzc2VkID0gSlNaaXAudXRpbHMudHJhbnNmb3JtVG8oXCJzdHJpbmdcIiwgdGhpcy5kZWNvbXByZXNzZWQuZ2V0Q29udGVudCgpKTtcbiAgICAgICAgICAgIGlmIChKU1ppcC5wcm90b3R5cGUuY3JjMzIodGhpcy5kZWNvbXByZXNzZWQpICE9PSB0aGlzLmNyYzMyKSB7XG4gICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3JydXB0ZWQgemlwIDogQ1JDMzIgbWlzbWF0Y2hcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIFJlYWQgdGhlIGNlbnRyYWwgcGFydCBvZiBhIHppcCBmaWxlIGFuZCBhZGQgdGhlIGluZm8gaW4gdGhpcyBvYmplY3QuXG4gICAgICAgKiBAcGFyYW0ge0RhdGFSZWFkZXJ9IHJlYWRlciB0aGUgcmVhZGVyIHRvIHVzZS5cbiAgICAgICAqL1xuICAgICAgcmVhZENlbnRyYWxQYXJ0IDogZnVuY3Rpb24ocmVhZGVyKSB7XG4gICAgICAgICB0aGlzLnZlcnNpb25NYWRlQnkgICAgICAgICAgPSByZWFkZXIucmVhZFN0cmluZygyKTtcbiAgICAgICAgIHRoaXMudmVyc2lvbk5lZWRlZCAgICAgICAgICA9IHJlYWRlci5yZWFkSW50KDIpO1xuICAgICAgICAgdGhpcy5iaXRGbGFnICAgICAgICAgICAgICAgID0gcmVhZGVyLnJlYWRJbnQoMik7XG4gICAgICAgICB0aGlzLmNvbXByZXNzaW9uTWV0aG9kICAgICAgPSByZWFkZXIucmVhZFN0cmluZygyKTtcbiAgICAgICAgIHRoaXMuZGF0ZSAgICAgICAgICAgICAgICAgICA9IHJlYWRlci5yZWFkRGF0ZSgpO1xuICAgICAgICAgdGhpcy5jcmMzMiAgICAgICAgICAgICAgICAgID0gcmVhZGVyLnJlYWRJbnQoNCk7XG4gICAgICAgICB0aGlzLmNvbXByZXNzZWRTaXplICAgICAgICAgPSByZWFkZXIucmVhZEludCg0KTtcbiAgICAgICAgIHRoaXMudW5jb21wcmVzc2VkU2l6ZSAgICAgICA9IHJlYWRlci5yZWFkSW50KDQpO1xuICAgICAgICAgdGhpcy5maWxlTmFtZUxlbmd0aCAgICAgICAgID0gcmVhZGVyLnJlYWRJbnQoMik7XG4gICAgICAgICB0aGlzLmV4dHJhRmllbGRzTGVuZ3RoICAgICAgPSByZWFkZXIucmVhZEludCgyKTtcbiAgICAgICAgIHRoaXMuZmlsZUNvbW1lbnRMZW5ndGggICAgICA9IHJlYWRlci5yZWFkSW50KDIpO1xuICAgICAgICAgdGhpcy5kaXNrTnVtYmVyU3RhcnQgICAgICAgID0gcmVhZGVyLnJlYWRJbnQoMik7XG4gICAgICAgICB0aGlzLmludGVybmFsRmlsZUF0dHJpYnV0ZXMgPSByZWFkZXIucmVhZEludCgyKTtcbiAgICAgICAgIHRoaXMuZXh0ZXJuYWxGaWxlQXR0cmlidXRlcyA9IHJlYWRlci5yZWFkSW50KDQpO1xuICAgICAgICAgdGhpcy5sb2NhbEhlYWRlck9mZnNldCAgICAgID0gcmVhZGVyLnJlYWRJbnQoNCk7XG5cbiAgICAgICAgIGlmICh0aGlzLmlzRW5jcnlwdGVkKCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkVuY3J5cHRlZCB6aXAgYXJlIG5vdCBzdXBwb3J0ZWRcIik7XG4gICAgICAgICB9XG5cbiAgICAgICAgIHRoaXMuZmlsZU5hbWUgPSByZWFkZXIucmVhZFN0cmluZyh0aGlzLmZpbGVOYW1lTGVuZ3RoKTtcbiAgICAgICAgIHRoaXMucmVhZEV4dHJhRmllbGRzKHJlYWRlcik7XG4gICAgICAgICB0aGlzLnBhcnNlWklQNjRFeHRyYUZpZWxkKHJlYWRlcik7XG4gICAgICAgICB0aGlzLmZpbGVDb21tZW50ID0gcmVhZGVyLnJlYWRTdHJpbmcodGhpcy5maWxlQ29tbWVudExlbmd0aCk7XG5cbiAgICAgICAgIC8vIHdhcm5pbmcsIHRoaXMgaXMgdHJ1ZSBvbmx5IGZvciB6aXAgd2l0aCBtYWRlQnkgPT0gRE9TIChwbGF0ZWZvcm0gZGVwZW5kZW50IGZlYXR1cmUpXG4gICAgICAgICB0aGlzLmRpciA9IHRoaXMuZXh0ZXJuYWxGaWxlQXR0cmlidXRlcyAmIDB4MDAwMDAwMTAgPyB0cnVlIDogZmFsc2U7XG4gICAgICB9LFxuICAgICAgLyoqXG4gICAgICAgKiBQYXJzZSB0aGUgWklQNjQgZXh0cmEgZmllbGQgYW5kIG1lcmdlIHRoZSBpbmZvIGluIHRoZSBjdXJyZW50IFppcEVudHJ5LlxuICAgICAgICogQHBhcmFtIHtEYXRhUmVhZGVyfSByZWFkZXIgdGhlIHJlYWRlciB0byB1c2UuXG4gICAgICAgKi9cbiAgICAgIHBhcnNlWklQNjRFeHRyYUZpZWxkIDogZnVuY3Rpb24ocmVhZGVyKSB7XG5cbiAgICAgICAgIGlmKCF0aGlzLmV4dHJhRmllbGRzWzB4MDAwMV0pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgIH1cblxuICAgICAgICAgLy8gc2hvdWxkIGJlIHNvbWV0aGluZywgcHJlcGFyaW5nIHRoZSBleHRyYSByZWFkZXJcbiAgICAgICAgIHZhciBleHRyYVJlYWRlciA9IG5ldyBTdHJpbmdSZWFkZXIodGhpcy5leHRyYUZpZWxkc1sweDAwMDFdLnZhbHVlKTtcblxuICAgICAgICAgLy8gSSByZWFsbHkgaG9wZSB0aGF0IHRoZXNlIDY0Yml0cyBpbnRlZ2VyIGNhbiBmaXQgaW4gMzIgYml0cyBpbnRlZ2VyLCBiZWNhdXNlIGpzXG4gICAgICAgICAvLyB3b24ndCBsZXQgdXMgaGF2ZSBtb3JlLlxuICAgICAgICAgaWYodGhpcy51bmNvbXByZXNzZWRTaXplID09PSBNQVhfVkFMVUVfMzJCSVRTKSB7XG4gICAgICAgICAgICB0aGlzLnVuY29tcHJlc3NlZFNpemUgPSBleHRyYVJlYWRlci5yZWFkSW50KDgpO1xuICAgICAgICAgfVxuICAgICAgICAgaWYodGhpcy5jb21wcmVzc2VkU2l6ZSA9PT0gTUFYX1ZBTFVFXzMyQklUUykge1xuICAgICAgICAgICAgdGhpcy5jb21wcmVzc2VkU2l6ZSA9IGV4dHJhUmVhZGVyLnJlYWRJbnQoOCk7XG4gICAgICAgICB9XG4gICAgICAgICBpZih0aGlzLmxvY2FsSGVhZGVyT2Zmc2V0ID09PSBNQVhfVkFMVUVfMzJCSVRTKSB7XG4gICAgICAgICAgICB0aGlzLmxvY2FsSGVhZGVyT2Zmc2V0ID0gZXh0cmFSZWFkZXIucmVhZEludCg4KTtcbiAgICAgICAgIH1cbiAgICAgICAgIGlmKHRoaXMuZGlza051bWJlclN0YXJ0ID09PSBNQVhfVkFMVUVfMzJCSVRTKSB7XG4gICAgICAgICAgICB0aGlzLmRpc2tOdW1iZXJTdGFydCA9IGV4dHJhUmVhZGVyLnJlYWRJbnQoNCk7XG4gICAgICAgICB9XG4gICAgICB9LFxuICAgICAgLyoqXG4gICAgICAgKiBSZWFkIHRoZSBjZW50cmFsIHBhcnQgb2YgYSB6aXAgZmlsZSBhbmQgYWRkIHRoZSBpbmZvIGluIHRoaXMgb2JqZWN0LlxuICAgICAgICogQHBhcmFtIHtEYXRhUmVhZGVyfSByZWFkZXIgdGhlIHJlYWRlciB0byB1c2UuXG4gICAgICAgKi9cbiAgICAgIHJlYWRFeHRyYUZpZWxkcyA6IGZ1bmN0aW9uKHJlYWRlcikge1xuICAgICAgICAgdmFyIHN0YXJ0ID0gcmVhZGVyLmluZGV4LFxuICAgICAgICAgICAgIGV4dHJhRmllbGRJZCxcbiAgICAgICAgICAgICBleHRyYUZpZWxkTGVuZ3RoLFxuICAgICAgICAgICAgIGV4dHJhRmllbGRWYWx1ZTtcblxuICAgICAgICAgdGhpcy5leHRyYUZpZWxkcyA9IHRoaXMuZXh0cmFGaWVsZHMgfHwge307XG5cbiAgICAgICAgIHdoaWxlIChyZWFkZXIuaW5kZXggPCBzdGFydCArIHRoaXMuZXh0cmFGaWVsZHNMZW5ndGgpIHtcbiAgICAgICAgICAgIGV4dHJhRmllbGRJZCAgICAgPSByZWFkZXIucmVhZEludCgyKTtcbiAgICAgICAgICAgIGV4dHJhRmllbGRMZW5ndGggPSByZWFkZXIucmVhZEludCgyKTtcbiAgICAgICAgICAgIGV4dHJhRmllbGRWYWx1ZSAgPSByZWFkZXIucmVhZFN0cmluZyhleHRyYUZpZWxkTGVuZ3RoKTtcblxuICAgICAgICAgICAgdGhpcy5leHRyYUZpZWxkc1tleHRyYUZpZWxkSWRdID0ge1xuICAgICAgICAgICAgICAgaWQ6ICAgICBleHRyYUZpZWxkSWQsXG4gICAgICAgICAgICAgICBsZW5ndGg6IGV4dHJhRmllbGRMZW5ndGgsXG4gICAgICAgICAgICAgICB2YWx1ZTogIGV4dHJhRmllbGRWYWx1ZVxuICAgICAgICAgICAgfTtcbiAgICAgICAgIH1cbiAgICAgIH0sXG4gICAgICAvKipcbiAgICAgICAqIEFwcGx5IGFuIFVURjggdHJhbnNmb3JtYXRpb24gaWYgbmVlZGVkLlxuICAgICAgICovXG4gICAgICBoYW5kbGVVVEY4IDogZnVuY3Rpb24oKSB7XG4gICAgICAgICBpZiAodGhpcy51c2VVVEY4KCkpIHtcbiAgICAgICAgICAgIHRoaXMuZmlsZU5hbWUgICAgPSBKU1ppcC5wcm90b3R5cGUudXRmOGRlY29kZSh0aGlzLmZpbGVOYW1lKTtcbiAgICAgICAgICAgIHRoaXMuZmlsZUNvbW1lbnQgPSBKU1ppcC5wcm90b3R5cGUudXRmOGRlY29kZSh0aGlzLmZpbGVDb21tZW50KTtcbiAgICAgICAgIH1cbiAgICAgIH1cbiAgIH07XG4gICAvLyB9fX0gZW5kIG9mIFppcEVudHJ5XG5cbiAgIC8vICBjbGFzcyBaaXBFbnRyaWVzIHt7e1xuICAgLyoqXG4gICAgKiBBbGwgdGhlIGVudHJpZXMgaW4gdGhlIHppcCBmaWxlLlxuICAgICogQGNvbnN0cnVjdG9yXG4gICAgKiBAcGFyYW0ge1N0cmluZ3xBcnJheUJ1ZmZlcnxVaW50OEFycmF5fEJ1ZmZlcn0gZGF0YSB0aGUgYmluYXJ5IGRhdGEgdG8gbG9hZC5cbiAgICAqIEBwYXJhbSB7T2JqZWN0fSBsb2FkT3B0aW9ucyBPcHRpb25zIGZvciBsb2FkaW5nIHRoZSBkYXRhLlxuICAgICovXG4gICBmdW5jdGlvbiBaaXBFbnRyaWVzKGRhdGEsIGxvYWRPcHRpb25zKSB7XG4gICAgICB0aGlzLmZpbGVzID0gW107XG4gICAgICB0aGlzLmxvYWRPcHRpb25zID0gbG9hZE9wdGlvbnM7XG4gICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgdGhpcy5sb2FkKGRhdGEpO1xuICAgICAgfVxuICAgfVxuICAgWmlwRW50cmllcy5wcm90b3R5cGUgPSB7XG4gICAgICAvKipcbiAgICAgICAqIENoZWNrIHRoYXQgdGhlIHJlYWRlciBpcyBvbiB0aGUgc3BlZmljaWVkIHNpZ25hdHVyZS5cbiAgICAgICAqIEBwYXJhbSB7c3RyaW5nfSBleHBlY3RlZFNpZ25hdHVyZSB0aGUgZXhwZWN0ZWQgc2lnbmF0dXJlLlxuICAgICAgICogQHRocm93cyB7RXJyb3J9IGlmIGl0IGlzIGFuIG90aGVyIHNpZ25hdHVyZS5cbiAgICAgICAqL1xuICAgICAgY2hlY2tTaWduYXR1cmUgOiBmdW5jdGlvbihleHBlY3RlZFNpZ25hdHVyZSkge1xuICAgICAgICAgdmFyIHNpZ25hdHVyZSA9IHRoaXMucmVhZGVyLnJlYWRTdHJpbmcoNCk7XG4gICAgICAgICBpZiAoc2lnbmF0dXJlICE9PSBleHBlY3RlZFNpZ25hdHVyZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ29ycnVwdGVkIHppcCBvciBidWcgOiB1bmV4cGVjdGVkIHNpZ25hdHVyZSBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIoXCIgKyBwcmV0dHkoc2lnbmF0dXJlKSArIFwiLCBleHBlY3RlZCBcIiArIHByZXR0eShleHBlY3RlZFNpZ25hdHVyZSkgKyBcIilcIik7XG4gICAgICAgICB9XG4gICAgICB9LFxuICAgICAgLyoqXG4gICAgICAgKiBSZWFkIHRoZSBlbmQgb2YgdGhlIGNlbnRyYWwgZGlyZWN0b3J5LlxuICAgICAgICovXG4gICAgICByZWFkQmxvY2tFbmRPZkNlbnRyYWwgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICB0aGlzLmRpc2tOdW1iZXIgICAgICAgICAgICAgICAgICA9IHRoaXMucmVhZGVyLnJlYWRJbnQoMik7XG4gICAgICAgICB0aGlzLmRpc2tXaXRoQ2VudHJhbERpclN0YXJ0ICAgICA9IHRoaXMucmVhZGVyLnJlYWRJbnQoMik7XG4gICAgICAgICB0aGlzLmNlbnRyYWxEaXJSZWNvcmRzT25UaGlzRGlzayA9IHRoaXMucmVhZGVyLnJlYWRJbnQoMik7XG4gICAgICAgICB0aGlzLmNlbnRyYWxEaXJSZWNvcmRzICAgICAgICAgICA9IHRoaXMucmVhZGVyLnJlYWRJbnQoMik7XG4gICAgICAgICB0aGlzLmNlbnRyYWxEaXJTaXplICAgICAgICAgICAgICA9IHRoaXMucmVhZGVyLnJlYWRJbnQoNCk7XG4gICAgICAgICB0aGlzLmNlbnRyYWxEaXJPZmZzZXQgICAgICAgICAgICA9IHRoaXMucmVhZGVyLnJlYWRJbnQoNCk7XG5cbiAgICAgICAgIHRoaXMuemlwQ29tbWVudExlbmd0aCAgICAgICAgICAgID0gdGhpcy5yZWFkZXIucmVhZEludCgyKTtcbiAgICAgICAgIHRoaXMuemlwQ29tbWVudCAgICAgICAgICAgICAgICAgID0gdGhpcy5yZWFkZXIucmVhZFN0cmluZyh0aGlzLnppcENvbW1lbnRMZW5ndGgpO1xuICAgICAgfSxcbiAgICAgIC8qKlxuICAgICAgICogUmVhZCB0aGUgZW5kIG9mIHRoZSBaaXAgNjQgY2VudHJhbCBkaXJlY3RvcnkuXG4gICAgICAgKiBOb3QgbWVyZ2VkIHdpdGggdGhlIG1ldGhvZCByZWFkRW5kT2ZDZW50cmFsIDpcbiAgICAgICAqIFRoZSBlbmQgb2YgY2VudHJhbCBjYW4gY29leGlzdCB3aXRoIGl0cyBaaXA2NCBicm90aGVyLFxuICAgICAgICogSSBkb24ndCB3YW50IHRvIHJlYWQgdGhlIHdyb25nIG51bWJlciBvZiBieXRlcyAhXG4gICAgICAgKi9cbiAgICAgIHJlYWRCbG9ja1ppcDY0RW5kT2ZDZW50cmFsIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgdGhpcy56aXA2NEVuZE9mQ2VudHJhbFNpemUgICAgICAgPSB0aGlzLnJlYWRlci5yZWFkSW50KDgpO1xuICAgICAgICAgdGhpcy52ZXJzaW9uTWFkZUJ5ICAgICAgICAgICAgICAgPSB0aGlzLnJlYWRlci5yZWFkU3RyaW5nKDIpO1xuICAgICAgICAgdGhpcy52ZXJzaW9uTmVlZGVkICAgICAgICAgICAgICAgPSB0aGlzLnJlYWRlci5yZWFkSW50KDIpO1xuICAgICAgICAgdGhpcy5kaXNrTnVtYmVyICAgICAgICAgICAgICAgICAgPSB0aGlzLnJlYWRlci5yZWFkSW50KDQpO1xuICAgICAgICAgdGhpcy5kaXNrV2l0aENlbnRyYWxEaXJTdGFydCAgICAgPSB0aGlzLnJlYWRlci5yZWFkSW50KDQpO1xuICAgICAgICAgdGhpcy5jZW50cmFsRGlyUmVjb3Jkc09uVGhpc0Rpc2sgPSB0aGlzLnJlYWRlci5yZWFkSW50KDgpO1xuICAgICAgICAgdGhpcy5jZW50cmFsRGlyUmVjb3JkcyAgICAgICAgICAgPSB0aGlzLnJlYWRlci5yZWFkSW50KDgpO1xuICAgICAgICAgdGhpcy5jZW50cmFsRGlyU2l6ZSAgICAgICAgICAgICAgPSB0aGlzLnJlYWRlci5yZWFkSW50KDgpO1xuICAgICAgICAgdGhpcy5jZW50cmFsRGlyT2Zmc2V0ICAgICAgICAgICAgPSB0aGlzLnJlYWRlci5yZWFkSW50KDgpO1xuXG4gICAgICAgICB0aGlzLnppcDY0RXh0ZW5zaWJsZURhdGEgPSB7fTtcbiAgICAgICAgIHZhciBleHRyYURhdGFTaXplID0gdGhpcy56aXA2NEVuZE9mQ2VudHJhbFNpemUgLSA0NCxcbiAgICAgICAgIGluZGV4ID0gMCxcbiAgICAgICAgIGV4dHJhRmllbGRJZCxcbiAgICAgICAgIGV4dHJhRmllbGRMZW5ndGgsXG4gICAgICAgICBleHRyYUZpZWxkVmFsdWU7XG4gICAgICAgICB3aGlsZShpbmRleCA8IGV4dHJhRGF0YVNpemUpIHtcbiAgICAgICAgICAgIGV4dHJhRmllbGRJZCAgICAgPSB0aGlzLnJlYWRlci5yZWFkSW50KDIpO1xuICAgICAgICAgICAgZXh0cmFGaWVsZExlbmd0aCA9IHRoaXMucmVhZGVyLnJlYWRJbnQoNCk7XG4gICAgICAgICAgICBleHRyYUZpZWxkVmFsdWUgID0gdGhpcy5yZWFkZXIucmVhZFN0cmluZyhleHRyYUZpZWxkTGVuZ3RoKTtcbiAgICAgICAgICAgIHRoaXMuemlwNjRFeHRlbnNpYmxlRGF0YVtleHRyYUZpZWxkSWRdID0ge1xuICAgICAgICAgICAgICAgaWQ6ICAgICBleHRyYUZpZWxkSWQsXG4gICAgICAgICAgICAgICBsZW5ndGg6IGV4dHJhRmllbGRMZW5ndGgsXG4gICAgICAgICAgICAgICB2YWx1ZTogIGV4dHJhRmllbGRWYWx1ZVxuICAgICAgICAgICAgfTtcbiAgICAgICAgIH1cbiAgICAgIH0sXG4gICAgICAvKipcbiAgICAgICAqIFJlYWQgdGhlIGVuZCBvZiB0aGUgWmlwIDY0IGNlbnRyYWwgZGlyZWN0b3J5IGxvY2F0b3IuXG4gICAgICAgKi9cbiAgICAgIHJlYWRCbG9ja1ppcDY0RW5kT2ZDZW50cmFsTG9jYXRvciA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgIHRoaXMuZGlza1dpdGhaaXA2NENlbnRyYWxEaXJTdGFydCAgICAgICA9IHRoaXMucmVhZGVyLnJlYWRJbnQoNCk7XG4gICAgICAgICB0aGlzLnJlbGF0aXZlT2Zmc2V0RW5kT2ZaaXA2NENlbnRyYWxEaXIgPSB0aGlzLnJlYWRlci5yZWFkSW50KDgpO1xuICAgICAgICAgdGhpcy5kaXNrc0NvdW50ICAgICAgICAgICAgICAgICAgICAgICAgID0gdGhpcy5yZWFkZXIucmVhZEludCg0KTtcbiAgICAgICAgIGlmICh0aGlzLmRpc2tzQ291bnQgPiAxKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJNdWx0aS12b2x1bWVzIHppcCBhcmUgbm90IHN1cHBvcnRlZFwiKTtcbiAgICAgICAgIH1cbiAgICAgIH0sXG4gICAgICAvKipcbiAgICAgICAqIFJlYWQgdGhlIGxvY2FsIGZpbGVzLCBiYXNlZCBvbiB0aGUgb2Zmc2V0IHJlYWQgaW4gdGhlIGNlbnRyYWwgcGFydC5cbiAgICAgICAqL1xuICAgICAgcmVhZExvY2FsRmlsZXMgOiBmdW5jdGlvbigpIHtcbiAgICAgICAgIHZhciBpLCBmaWxlO1xuICAgICAgICAgZm9yKGkgPSAwOyBpIDwgdGhpcy5maWxlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgZmlsZSA9IHRoaXMuZmlsZXNbaV07XG4gICAgICAgICAgICB0aGlzLnJlYWRlci5zZXRJbmRleChmaWxlLmxvY2FsSGVhZGVyT2Zmc2V0KTtcbiAgICAgICAgICAgIHRoaXMuY2hlY2tTaWduYXR1cmUoSlNaaXAuc2lnbmF0dXJlLkxPQ0FMX0ZJTEVfSEVBREVSKTtcbiAgICAgICAgICAgIGZpbGUucmVhZExvY2FsUGFydCh0aGlzLnJlYWRlcik7XG4gICAgICAgICAgICBmaWxlLmhhbmRsZVVURjgoKTtcbiAgICAgICAgIH1cbiAgICAgIH0sXG4gICAgICAvKipcbiAgICAgICAqIFJlYWQgdGhlIGNlbnRyYWwgZGlyZWN0b3J5LlxuICAgICAgICovXG4gICAgICByZWFkQ2VudHJhbERpciA6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgdmFyIGZpbGU7XG5cbiAgICAgICAgIHRoaXMucmVhZGVyLnNldEluZGV4KHRoaXMuY2VudHJhbERpck9mZnNldCk7XG4gICAgICAgICB3aGlsZSh0aGlzLnJlYWRlci5yZWFkU3RyaW5nKDQpID09PSBKU1ppcC5zaWduYXR1cmUuQ0VOVFJBTF9GSUxFX0hFQURFUikge1xuICAgICAgICAgICAgZmlsZSA9IG5ldyBaaXBFbnRyeSh7XG4gICAgICAgICAgICAgICB6aXA2NDogdGhpcy56aXA2NFxuICAgICAgICAgICAgfSwgdGhpcy5sb2FkT3B0aW9ucyk7XG4gICAgICAgICAgICBmaWxlLnJlYWRDZW50cmFsUGFydCh0aGlzLnJlYWRlcik7XG4gICAgICAgICAgICB0aGlzLmZpbGVzLnB1c2goZmlsZSk7XG4gICAgICAgICB9XG4gICAgICB9LFxuICAgICAgLyoqXG4gICAgICAgKiBSZWFkIHRoZSBlbmQgb2YgY2VudHJhbCBkaXJlY3RvcnkuXG4gICAgICAgKi9cbiAgICAgIHJlYWRFbmRPZkNlbnRyYWwgOiBmdW5jdGlvbigpIHtcbiAgICAgICAgIHZhciBvZmZzZXQgPSB0aGlzLnJlYWRlci5sYXN0SW5kZXhPZlNpZ25hdHVyZShKU1ppcC5zaWduYXR1cmUuQ0VOVFJBTF9ESVJFQ1RPUllfRU5EKTtcbiAgICAgICAgIGlmIChvZmZzZXQgPT09IC0xKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3JydXB0ZWQgemlwIDogY2FuJ3QgZmluZCBlbmQgb2YgY2VudHJhbCBkaXJlY3RvcnlcIik7XG4gICAgICAgICB9XG4gICAgICAgICB0aGlzLnJlYWRlci5zZXRJbmRleChvZmZzZXQpO1xuICAgICAgICAgdGhpcy5jaGVja1NpZ25hdHVyZShKU1ppcC5zaWduYXR1cmUuQ0VOVFJBTF9ESVJFQ1RPUllfRU5EKTtcbiAgICAgICAgIHRoaXMucmVhZEJsb2NrRW5kT2ZDZW50cmFsKCk7XG5cblxuICAgICAgICAgLyogZXh0cmFjdCBmcm9tIHRoZSB6aXAgc3BlYyA6XG4gICAgICAgICAgICA0KSAgSWYgb25lIG9mIHRoZSBmaWVsZHMgaW4gdGhlIGVuZCBvZiBjZW50cmFsIGRpcmVjdG9yeVxuICAgICAgICAgICAgICAgIHJlY29yZCBpcyB0b28gc21hbGwgdG8gaG9sZCByZXF1aXJlZCBkYXRhLCB0aGUgZmllbGRcbiAgICAgICAgICAgICAgICBzaG91bGQgYmUgc2V0IHRvIC0xICgweEZGRkYgb3IgMHhGRkZGRkZGRikgYW5kIHRoZVxuICAgICAgICAgICAgICAgIFpJUDY0IGZvcm1hdCByZWNvcmQgc2hvdWxkIGJlIGNyZWF0ZWQuXG4gICAgICAgICAgICA1KSAgVGhlIGVuZCBvZiBjZW50cmFsIGRpcmVjdG9yeSByZWNvcmQgYW5kIHRoZVxuICAgICAgICAgICAgICAgIFppcDY0IGVuZCBvZiBjZW50cmFsIGRpcmVjdG9yeSBsb2NhdG9yIHJlY29yZCBtdXN0XG4gICAgICAgICAgICAgICAgcmVzaWRlIG9uIHRoZSBzYW1lIGRpc2sgd2hlbiBzcGxpdHRpbmcgb3Igc3Bhbm5pbmdcbiAgICAgICAgICAgICAgICBhbiBhcmNoaXZlLlxuICAgICAgICAgKi9cbiAgICAgICAgIGlmICh0aGlzLmRpc2tOdW1iZXIgICAgICAgICAgICAgICAgID09PSBNQVhfVkFMVUVfMTZCSVRTIHx8XG4gICAgICAgICAgICB0aGlzLmRpc2tXaXRoQ2VudHJhbERpclN0YXJ0ICAgICA9PT0gTUFYX1ZBTFVFXzE2QklUUyB8fFxuICAgICAgICAgICAgdGhpcy5jZW50cmFsRGlyUmVjb3Jkc09uVGhpc0Rpc2sgPT09IE1BWF9WQUxVRV8xNkJJVFMgfHxcbiAgICAgICAgICAgIHRoaXMuY2VudHJhbERpclJlY29yZHMgICAgICAgICAgID09PSBNQVhfVkFMVUVfMTZCSVRTIHx8XG4gICAgICAgICAgICB0aGlzLmNlbnRyYWxEaXJTaXplICAgICAgICAgICAgICA9PT0gTUFYX1ZBTFVFXzMyQklUUyB8fFxuICAgICAgICAgICAgdGhpcy5jZW50cmFsRGlyT2Zmc2V0ICAgICAgICAgICAgPT09IE1BWF9WQUxVRV8zMkJJVFNcbiAgICAgICAgICkge1xuICAgICAgICAgICAgdGhpcy56aXA2NCA9IHRydWU7XG5cbiAgICAgICAgICAgIC8qXG4gICAgICAgICAgICBXYXJuaW5nIDogdGhlIHppcDY0IGV4dGVuc2lvbiBpcyBzdXBwb3J0ZWQsIGJ1dCBPTkxZIGlmIHRoZSA2NGJpdHMgaW50ZWdlciByZWFkIGZyb21cbiAgICAgICAgICAgIHRoZSB6aXAgZmlsZSBjYW4gZml0IGludG8gYSAzMmJpdHMgaW50ZWdlci4gVGhpcyBjYW5ub3QgYmUgc29sdmVkIDogSmF2YXNjcmlwdCByZXByZXNlbnRzXG4gICAgICAgICAgICBhbGwgbnVtYmVycyBhcyA2NC1iaXQgZG91YmxlIHByZWNpc2lvbiBJRUVFIDc1NCBmbG9hdGluZyBwb2ludCBudW1iZXJzLlxuICAgICAgICAgICAgU28sIHdlIGhhdmUgNTNiaXRzIGZvciBpbnRlZ2VycyBhbmQgYml0d2lzZSBvcGVyYXRpb25zIHRyZWF0IGV2ZXJ5dGhpbmcgYXMgMzJiaXRzLlxuICAgICAgICAgICAgc2VlIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvSmF2YVNjcmlwdC9SZWZlcmVuY2UvT3BlcmF0b3JzL0JpdHdpc2VfT3BlcmF0b3JzXG4gICAgICAgICAgICBhbmQgaHR0cDovL3d3dy5lY21hLWludGVybmF0aW9uYWwub3JnL3B1YmxpY2F0aW9ucy9maWxlcy9FQ01BLVNUL0VDTUEtMjYyLnBkZiBzZWN0aW9uIDguNVxuICAgICAgICAgICAgKi9cblxuICAgICAgICAgICAgLy8gc2hvdWxkIGxvb2sgZm9yIGEgemlwNjQgRU9DRCBsb2NhdG9yXG4gICAgICAgICAgICBvZmZzZXQgPSB0aGlzLnJlYWRlci5sYXN0SW5kZXhPZlNpZ25hdHVyZShKU1ppcC5zaWduYXR1cmUuWklQNjRfQ0VOVFJBTF9ESVJFQ1RPUllfTE9DQVRPUik7XG4gICAgICAgICAgICBpZiAob2Zmc2V0ID09PSAtMSkge1xuICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ29ycnVwdGVkIHppcCA6IGNhbid0IGZpbmQgdGhlIFpJUDY0IGVuZCBvZiBjZW50cmFsIGRpcmVjdG9yeSBsb2NhdG9yXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZWFkZXIuc2V0SW5kZXgob2Zmc2V0KTtcbiAgICAgICAgICAgIHRoaXMuY2hlY2tTaWduYXR1cmUoSlNaaXAuc2lnbmF0dXJlLlpJUDY0X0NFTlRSQUxfRElSRUNUT1JZX0xPQ0FUT1IpO1xuICAgICAgICAgICAgdGhpcy5yZWFkQmxvY2taaXA2NEVuZE9mQ2VudHJhbExvY2F0b3IoKTtcblxuICAgICAgICAgICAgLy8gbm93IHRoZSB6aXA2NCBFT0NEIHJlY29yZFxuICAgICAgICAgICAgdGhpcy5yZWFkZXIuc2V0SW5kZXgodGhpcy5yZWxhdGl2ZU9mZnNldEVuZE9mWmlwNjRDZW50cmFsRGlyKTtcbiAgICAgICAgICAgIHRoaXMuY2hlY2tTaWduYXR1cmUoSlNaaXAuc2lnbmF0dXJlLlpJUDY0X0NFTlRSQUxfRElSRUNUT1JZX0VORCk7XG4gICAgICAgICAgICB0aGlzLnJlYWRCbG9ja1ppcDY0RW5kT2ZDZW50cmFsKCk7XG4gICAgICAgICB9XG4gICAgICB9LFxuICAgICAgcHJlcGFyZVJlYWRlciA6IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICB2YXIgdHlwZSA9IEpTWmlwLnV0aWxzLmdldFR5cGVPZihkYXRhKTtcbiAgICAgICAgIGlmICh0eXBlID09PSBcInN0cmluZ1wiICYmICFKU1ppcC5zdXBwb3J0LnVpbnQ4YXJyYXkpIHtcbiAgICAgICAgICAgIHRoaXMucmVhZGVyID0gbmV3IFN0cmluZ1JlYWRlcihkYXRhLCB0aGlzLmxvYWRPcHRpb25zLm9wdGltaXplZEJpbmFyeVN0cmluZyk7XG4gICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IFwibm9kZWJ1ZmZlclwiKSB7XG4gICAgICAgICAgICB0aGlzLnJlYWRlciA9IG5ldyBOb2RlQnVmZmVyUmVhZGVyKGRhdGEpO1xuICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucmVhZGVyID0gbmV3IFVpbnQ4QXJyYXlSZWFkZXIoSlNaaXAudXRpbHMudHJhbnNmb3JtVG8oXCJ1aW50OGFycmF5XCIsIGRhdGEpKTtcbiAgICAgICAgIH1cbiAgICAgIH0sXG4gICAgICAvKipcbiAgICAgICAqIFJlYWQgYSB6aXAgZmlsZSBhbmQgY3JlYXRlIFppcEVudHJpZXMuXG4gICAgICAgKiBAcGFyYW0ge1N0cmluZ3xBcnJheUJ1ZmZlcnxVaW50OEFycmF5fEJ1ZmZlcn0gZGF0YSB0aGUgYmluYXJ5IHN0cmluZyByZXByZXNlbnRpbmcgYSB6aXAgZmlsZS5cbiAgICAgICAqL1xuICAgICAgbG9hZCA6IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgIHRoaXMucHJlcGFyZVJlYWRlcihkYXRhKTtcbiAgICAgICAgIHRoaXMucmVhZEVuZE9mQ2VudHJhbCgpO1xuICAgICAgICAgdGhpcy5yZWFkQ2VudHJhbERpcigpO1xuICAgICAgICAgdGhpcy5yZWFkTG9jYWxGaWxlcygpO1xuICAgICAgfVxuICAgfTtcbiAgIC8vIH19fSBlbmQgb2YgWmlwRW50cmllc1xuXG4gICAvKipcbiAgICAqIEltcGxlbWVudGF0aW9uIG9mIHRoZSBsb2FkIG1ldGhvZCBvZiBKU1ppcC5cbiAgICAqIEl0IHVzZXMgdGhlIGFib3ZlIGNsYXNzZXMgdG8gZGVjb2RlIGEgemlwIGZpbGUsIGFuZCBsb2FkIGV2ZXJ5IGZpbGVzLlxuICAgICogQHBhcmFtIHtTdHJpbmd8QXJyYXlCdWZmZXJ8VWludDhBcnJheXxCdWZmZXJ9IGRhdGEgdGhlIGRhdGEgdG8gbG9hZC5cbiAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIE9wdGlvbnMgZm9yIGxvYWRpbmcgdGhlIGRhdGEuXG4gICAgKiAgb3B0aW9ucy5iYXNlNjQgOiBpcyB0aGUgZGF0YSBpbiBiYXNlNjQgPyBkZWZhdWx0IDogZmFsc2VcbiAgICAqL1xuICAgSlNaaXAucHJvdG90eXBlLmxvYWQgPSBmdW5jdGlvbihkYXRhLCBvcHRpb25zKSB7XG4gICAgICB2YXIgZmlsZXMsIHppcEVudHJpZXMsIGksIGlucHV0O1xuICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICBpZihvcHRpb25zLmJhc2U2NCkge1xuICAgICAgICAgZGF0YSA9IEpTWmlwLmJhc2U2NC5kZWNvZGUoZGF0YSk7XG4gICAgICB9XG5cbiAgICAgIHppcEVudHJpZXMgPSBuZXcgWmlwRW50cmllcyhkYXRhLCBvcHRpb25zKTtcbiAgICAgIGZpbGVzID0gemlwRW50cmllcy5maWxlcztcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBmaWxlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgaW5wdXQgPSBmaWxlc1tpXTtcbiAgICAgICAgIHRoaXMuZmlsZShpbnB1dC5maWxlTmFtZSwgaW5wdXQuZGVjb21wcmVzc2VkLCB7XG4gICAgICAgICAgICBiaW5hcnk6dHJ1ZSxcbiAgICAgICAgICAgIG9wdGltaXplZEJpbmFyeVN0cmluZzp0cnVlLFxuICAgICAgICAgICAgZGF0ZTppbnB1dC5kYXRlLFxuICAgICAgICAgICAgZGlyOmlucHV0LmRpclxuICAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzO1xuICAgfTtcblxufSh0aGlzKSk7XG5pZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSBleHBvcnRzLkpTWmlwID0gSlNaaXA7XG4vLyBlbmZvcmNpbmcgU3R1aydzIGNvZGluZyBzdHlsZVxuLy8gdmltOiBzZXQgc2hpZnR3aWR0aD0zIHNvZnR0YWJzdG9wPTMgZm9sZG1ldGhvZD1tYXJrZXI6Il19
