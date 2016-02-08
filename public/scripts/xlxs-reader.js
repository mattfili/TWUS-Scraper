'use strict';

(function (undefined) {
    'use strict';
    // Check if dependecies are available.
    if (typeof XLSX === 'undefined') {
        console.log('xlsx.js is required. Get it from https://github.com/SheetJS/js-xlsx');
        return;
    }

    if (typeof _ === 'undefined') {
        console.log('Lodash.js is required. Get it from http://lodash.com/');
        return;
    }

    // Baseline setup
    // --------------

    // Establish the root object, `window` in the browser, or `exports` on the server.
    var root = this;

    // Save the previous value of the `XLSXReader` variable.

    // Create a safe reference to the XLSXReader object for use below.
    var XLSXReader = function XLSXReader(file, readCells, toJSON, handler) {
        var obj = {};
        XLSXReader.utils.intializeFromFile(obj, file, readCells, toJSON, handler);
        return obj;
    };

    // var previousXLSXReader = root.XLSXReader;

    // Export the XLSXReader object for **Node.js**, with
    // backwards-compatibility for the old `require()` API. If we're in
    // the browser, add `XLSXReader` as a global object via a string identifier,
    // for Closure Compiler 'advanced' mode.
    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = XLSXReader;
        }
        exports.XLSXReader = XLSXReader;
    }
    // } else {
    //     root.XLSXReader = XLSXReader;
    // }

    // Current version.
    XLSXReader.VERSION = '0.0.1';

    XLSXReader.utils = {
        'intializeFromFile': function intializeFromFile(obj, file, readCells, toJSON, handler) {
            var reader = new FileReader();

            reader.onload = function (e) {
                var data = e.target.result;
                var workbook = XLSX.read(data, {
                    type: 'binary'
                });

                obj.sheets = XLSXReader.utils.parseWorkbook(workbook, readCells, toJSON);
                handler(obj);
            };

            reader.readAsBinaryString(file);
        },
        'parseWorkbook': function parseWorkbook(workbook, readCells, toJSON) {
            if (toJSON === true) {
                return XLSXReader.utils.to_json(workbook);
            }

            var sheets = {};

            _.forEachRight(workbook.SheetNames, function (sheetName) {
                var sheet = workbook.Sheets[sheetName];
                sheets[sheetName] = XLSXReader.utils.parseSheet(sheet, readCells);
            });

            return sheets;
        },
        'parseSheet': function parseSheet(sheet, readCells) {
            var range = XLSX.utils.decode_range(sheet['!ref']);
            var sheetData = [];

            if (readCells === true) {
                _.forEachRight(_.range(range.s.r, range.e.r + 1), function (row) {
                    var rowData = [];
                    _.forEachRight(_.range(range.s.c, range.e.c + 1), function (column) {
                        var cellIndex = XLSX.utils.encode_cell({
                            'c': column,
                            'r': row
                        });
                        var cell = sheet[cellIndex];
                        rowData[column] = cell ? cell.v : undefined;
                    });
                    sheetData[row] = rowData;
                });
            }

            return {
                'data': sheetData,
                'name': sheet.name,
                'col_size': range.e.c + 1,
                'row_size': range.e.r + 1
            };
        },
        to_json: function to_json(workbook) {
            var result = {};
            workbook.SheetNames.forEach(function (sheetName) {
                var roa = XLSX.utils.sheet_to_row_object_array(workbook.Sheets[sheetName]);
                if (roa.length > 0) {
                    result[sheetName] = roa;
                }
            });
            return result;
        }
    };
}).call(undefined);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zY3JpcHRzL3hseHMtcmVhZGVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsQ0FBQyxVQUFTLFNBQVMsRUFBRTtBQUNqQixnQkFBWSxDQUFDOztBQUViLFFBQUksT0FBTyxJQUFJLEtBQUssV0FBVyxFQUFFO0FBQzdCLGVBQU8sQ0FBQyxHQUFHLENBQUMscUVBQXFFLENBQUMsQ0FBQztBQUNuRixlQUFPO0tBQ1Y7O0FBRUQsUUFBSSxPQUFPLENBQUMsS0FBSyxXQUFXLEVBQUU7QUFDMUIsZUFBTyxDQUFDLEdBQUcsQ0FBQyx1REFBdUQsQ0FBQyxDQUFDO0FBQ3JFLGVBQU87S0FDVjs7Ozs7O0FBTUQsUUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDOzs7OztBQU9oQixRQUFJLFVBQVUsR0FBRyxTQUFiLFVBQVUsQ0FBWSxJQUFJLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUU7QUFDeEQsWUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQ2Isa0JBQVUsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQzFFLGVBQU8sR0FBRyxDQUFDO0tBQ2QsQ0FBQTs7Ozs7Ozs7QUFRRCxRQUFJLE9BQU8sT0FBTyxLQUFLLFdBQVcsRUFBRTtBQUNoQyxZQUFJLE9BQU8sTUFBTSxLQUFLLFdBQVcsSUFBSSxNQUFNLENBQUMsT0FBTyxFQUFFO0FBQ2pELG1CQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sR0FBRyxVQUFVLENBQUM7U0FDekM7QUFDRCxlQUFPLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztLQUNuQzs7Ozs7O0FBTUQsY0FBVSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7O0FBRTdCLGNBQVUsQ0FBQyxLQUFLLEdBQUc7QUFDZiwyQkFBbUIsRUFBRSwyQkFBUyxHQUFHLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFO0FBQ2pFLGdCQUFJLE1BQU0sR0FBRyxJQUFJLFVBQVUsRUFBRSxDQUFDOztBQUU5QixrQkFBTSxDQUFDLE1BQU0sR0FBRyxVQUFTLENBQUMsRUFBRTtBQUN4QixvQkFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7QUFDM0Isb0JBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFO0FBQzNCLHdCQUFJLEVBQUUsUUFBUTtpQkFDakIsQ0FBQyxDQUFDOztBQUVILG1CQUFHLENBQUMsTUFBTSxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDekUsdUJBQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQzthQUNoQixDQUFBOztBQUVELGtCQUFNLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDbkM7QUFDRCx1QkFBZSxFQUFFLHVCQUFTLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFO0FBQ25ELGdCQUFJLE1BQU0sS0FBSyxJQUFJLEVBQUU7QUFDakIsdUJBQU8sVUFBVSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7YUFDN0M7O0FBRUQsZ0JBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQzs7QUFFaEIsYUFBQyxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLFVBQVMsU0FBUyxFQUFFO0FBQ3BELG9CQUFJLEtBQUssR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ3ZDLHNCQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2FBQ3JFLENBQUMsQ0FBQzs7QUFFSCxtQkFBTyxNQUFNLENBQUM7U0FDakI7QUFDRCxvQkFBWSxFQUFFLG9CQUFTLEtBQUssRUFBRSxTQUFTLEVBQUU7QUFDckMsZ0JBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQ25ELGdCQUFJLFNBQVMsR0FBRyxFQUFFLENBQUM7O0FBRW5CLGdCQUFJLFNBQVMsS0FBSyxJQUFJLEVBQUU7QUFDcEIsaUJBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxVQUFTLEdBQUcsRUFBRTtBQUM1RCx3QkFBSSxPQUFPLEdBQUcsRUFBRSxDQUFDO0FBQ2pCLHFCQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsVUFBUyxNQUFNLEVBQUU7QUFDL0QsNEJBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDO0FBQ25DLCtCQUFHLEVBQUUsTUFBTTtBQUNYLCtCQUFHLEVBQUUsR0FBRzt5QkFDWCxDQUFDLENBQUM7QUFDSCw0QkFBSSxJQUFJLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQzVCLCtCQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQyxDQUFDLEdBQUcsU0FBUyxDQUFDO3FCQUMvQyxDQUFDLENBQUM7QUFDSCw2QkFBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLE9BQU8sQ0FBQztpQkFDNUIsQ0FBQyxDQUFDO2FBQ047O0FBRUQsbUJBQU87QUFDSCxzQkFBTSxFQUFFLFNBQVM7QUFDakIsc0JBQU0sRUFBRSxLQUFLLENBQUMsSUFBSTtBQUNsQiwwQkFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7QUFDekIsMEJBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO2FBQzVCLENBQUE7U0FDSjtBQUNELGVBQU8sRUFBRSxpQkFBUyxRQUFRLEVBQUU7QUFDeEIsZ0JBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztBQUNoQixvQkFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsVUFBUyxTQUFTLEVBQUU7QUFDNUMsb0JBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMseUJBQXlCLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQzNFLG9CQUFJLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQ2hCLDBCQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsR0FBRyxDQUFDO2lCQUMzQjthQUNKLENBQUMsQ0FBQztBQUNILG1CQUFPLE1BQU0sQ0FBQztTQUNqQjtLQUNKLENBQUE7Q0FDSixDQUFBLENBQUUsSUFBSSxXQUFNLENBQUMiLCJmaWxlIjoieGx4cy1yZWFkZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24odW5kZWZpbmVkKSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuICAgIC8vIENoZWNrIGlmIGRlcGVuZGVjaWVzIGFyZSBhdmFpbGFibGUuXG4gICAgaWYgKHR5cGVvZiBYTFNYID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBjb25zb2xlLmxvZygneGxzeC5qcyBpcyByZXF1aXJlZC4gR2V0IGl0IGZyb20gaHR0cHM6Ly9naXRodWIuY29tL1NoZWV0SlMvanMteGxzeCcpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBfID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBjb25zb2xlLmxvZygnTG9kYXNoLmpzIGlzIHJlcXVpcmVkLiBHZXQgaXQgZnJvbSBodHRwOi8vbG9kYXNoLmNvbS8nKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEJhc2VsaW5lIHNldHVwXG4gICAgLy8gLS0tLS0tLS0tLS0tLS1cblxuICAgIC8vIEVzdGFibGlzaCB0aGUgcm9vdCBvYmplY3QsIGB3aW5kb3dgIGluIHRoZSBicm93c2VyLCBvciBgZXhwb3J0c2Agb24gdGhlIHNlcnZlci5cbiAgICB2YXIgcm9vdCA9IHRoaXM7XG5cbiAgICAvLyBTYXZlIHRoZSBwcmV2aW91cyB2YWx1ZSBvZiB0aGUgYFhMU1hSZWFkZXJgIHZhcmlhYmxlLlxuXG5cblxuICAgIC8vIENyZWF0ZSBhIHNhZmUgcmVmZXJlbmNlIHRvIHRoZSBYTFNYUmVhZGVyIG9iamVjdCBmb3IgdXNlIGJlbG93LlxuICAgIHZhciBYTFNYUmVhZGVyID0gZnVuY3Rpb24oZmlsZSwgcmVhZENlbGxzLCB0b0pTT04sIGhhbmRsZXIpIHtcbiAgICAgICAgdmFyIG9iaiA9IHt9O1xuICAgICAgICBYTFNYUmVhZGVyLnV0aWxzLmludGlhbGl6ZUZyb21GaWxlKG9iaiwgZmlsZSwgcmVhZENlbGxzLCB0b0pTT04sIGhhbmRsZXIpO1xuICAgICAgICByZXR1cm4gb2JqO1xuICAgIH1cblxuICAgIC8vIHZhciBwcmV2aW91c1hMU1hSZWFkZXIgPSByb290LlhMU1hSZWFkZXI7XG5cbiAgICAvLyBFeHBvcnQgdGhlIFhMU1hSZWFkZXIgb2JqZWN0IGZvciAqKk5vZGUuanMqKiwgd2l0aFxuICAgIC8vIGJhY2t3YXJkcy1jb21wYXRpYmlsaXR5IGZvciB0aGUgb2xkIGByZXF1aXJlKClgIEFQSS4gSWYgd2UncmUgaW5cbiAgICAvLyB0aGUgYnJvd3NlciwgYWRkIGBYTFNYUmVhZGVyYCBhcyBhIGdsb2JhbCBvYmplY3QgdmlhIGEgc3RyaW5nIGlkZW50aWZpZXIsXG4gICAgLy8gZm9yIENsb3N1cmUgQ29tcGlsZXIgJ2FkdmFuY2VkJyBtb2RlLlxuICAgIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgICAgICAgICBleHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBYTFNYUmVhZGVyO1xuICAgICAgICB9XG4gICAgICAgIGV4cG9ydHMuWExTWFJlYWRlciA9IFhMU1hSZWFkZXI7XG4gICAgfVxuICAgIC8vIH0gZWxzZSB7XG4gICAgLy8gICAgIHJvb3QuWExTWFJlYWRlciA9IFhMU1hSZWFkZXI7XG4gICAgLy8gfVxuXG4gICAgLy8gQ3VycmVudCB2ZXJzaW9uLlxuICAgIFhMU1hSZWFkZXIuVkVSU0lPTiA9ICcwLjAuMSc7XG5cbiAgICBYTFNYUmVhZGVyLnV0aWxzID0ge1xuICAgICAgICAnaW50aWFsaXplRnJvbUZpbGUnOiBmdW5jdGlvbihvYmosIGZpbGUsIHJlYWRDZWxscywgdG9KU09OLCBoYW5kbGVyKSB7XG4gICAgICAgICAgICB2YXIgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcblxuICAgICAgICAgICAgcmVhZGVyLm9ubG9hZCA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICB2YXIgZGF0YSA9IGUudGFyZ2V0LnJlc3VsdDtcbiAgICAgICAgICAgICAgICB2YXIgd29ya2Jvb2sgPSBYTFNYLnJlYWQoZGF0YSwge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnYmluYXJ5J1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgb2JqLnNoZWV0cyA9IFhMU1hSZWFkZXIudXRpbHMucGFyc2VXb3JrYm9vayh3b3JrYm9vaywgcmVhZENlbGxzLCB0b0pTT04pO1xuICAgICAgICAgICAgICAgIGhhbmRsZXIob2JqKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVhZGVyLnJlYWRBc0JpbmFyeVN0cmluZyhmaWxlKTtcbiAgICAgICAgfSxcbiAgICAgICAgJ3BhcnNlV29ya2Jvb2snOiBmdW5jdGlvbih3b3JrYm9vaywgcmVhZENlbGxzLCB0b0pTT04pIHtcbiAgICAgICAgICAgIGlmICh0b0pTT04gPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gWExTWFJlYWRlci51dGlscy50b19qc29uKHdvcmtib29rKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHNoZWV0cyA9IHt9O1xuXG4gICAgICAgICAgICBfLmZvckVhY2hSaWdodCh3b3JrYm9vay5TaGVldE5hbWVzLCBmdW5jdGlvbihzaGVldE5hbWUpIHtcbiAgICAgICAgICAgICAgICB2YXIgc2hlZXQgPSB3b3JrYm9vay5TaGVldHNbc2hlZXROYW1lXTtcbiAgICAgICAgICAgICAgICBzaGVldHNbc2hlZXROYW1lXSA9IFhMU1hSZWFkZXIudXRpbHMucGFyc2VTaGVldChzaGVldCwgcmVhZENlbGxzKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gc2hlZXRzO1xuICAgICAgICB9LFxuICAgICAgICAncGFyc2VTaGVldCc6IGZ1bmN0aW9uKHNoZWV0LCByZWFkQ2VsbHMpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IFhMU1gudXRpbHMuZGVjb2RlX3JhbmdlKHNoZWV0WychcmVmJ10pO1xuICAgICAgICAgICAgdmFyIHNoZWV0RGF0YSA9IFtdO1xuXG4gICAgICAgICAgICBpZiAocmVhZENlbGxzID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgXy5mb3JFYWNoUmlnaHQoXy5yYW5nZShyYW5nZS5zLnIsIHJhbmdlLmUuciArIDEpLCBmdW5jdGlvbihyb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJvd0RhdGEgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgXy5mb3JFYWNoUmlnaHQoXy5yYW5nZShyYW5nZS5zLmMsIHJhbmdlLmUuYyArIDEpLCBmdW5jdGlvbihjb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjZWxsSW5kZXggPSBYTFNYLnV0aWxzLmVuY29kZV9jZWxsKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnYyc6IGNvbHVtbixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAncic6IHJvd1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgY2VsbCA9IHNoZWV0W2NlbGxJbmRleF07XG4gICAgICAgICAgICAgICAgICAgICAgICByb3dEYXRhW2NvbHVtbl0gPSBjZWxsID8gY2VsbC52IDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc2hlZXREYXRhW3Jvd10gPSByb3dEYXRhO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICdkYXRhJzogc2hlZXREYXRhLFxuICAgICAgICAgICAgICAgICduYW1lJzogc2hlZXQubmFtZSxcbiAgICAgICAgICAgICAgICAnY29sX3NpemUnOiByYW5nZS5lLmMgKyAxLFxuICAgICAgICAgICAgICAgICdyb3dfc2l6ZSc6IHJhbmdlLmUuciArIDFcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgdG9fanNvbjogZnVuY3Rpb24od29ya2Jvb2spIHtcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSB7fTtcbiAgICAgICAgICAgIHdvcmtib29rLlNoZWV0TmFtZXMuZm9yRWFjaChmdW5jdGlvbihzaGVldE5hbWUpIHtcbiAgICAgICAgICAgICAgICB2YXIgcm9hID0gWExTWC51dGlscy5zaGVldF90b19yb3dfb2JqZWN0X2FycmF5KHdvcmtib29rLlNoZWV0c1tzaGVldE5hbWVdKTtcbiAgICAgICAgICAgICAgICBpZiAocm9hLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0W3NoZWV0TmFtZV0gPSByb2E7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgfVxufSkuY2FsbCh0aGlzKTsiXX0=
