var express = require('express');
var fs = require('fs');
var request = require('request');
var cheerio = require('cheerio');
var async = require('async');
var _ = require('lodash');
var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();
var Excel = require("exceljs");
var multer  = require('multer');
var upload = multer({ dest: 'uploads/' });
var tnt = require('../controller/tntHandler');
var async = require('async');





var router = express.Router();

router.post('/tnt', multipartMiddleware, function (req, res, next) {

  async.waterfall([
    function (done) {
      var workbook = new Excel.Workbook();
      workbook.xlsx.readFile(req.files.file.path)
  

      .then(function() {

        var worksheet = workbook.getWorksheet(1)
          var colH = worksheet.getColumn(1)
          var dataArray = []

        colH.eachCell({includeEmpty: false}, function(cell, rowNumber) {


          if (rowNumber != 1) {
          var conNoteNumber = cell.value

          tnt.getTNT(conNoteNumber, function (data) {
              // console.log(data)

              dataArray.push(data)

            if (dataArray.length == worksheet.lastRow.number -1 ) {
                done(null, dataArray)
              }

          })
        }
        })
      })
    }

  ], function done(err, dataArray) {
    // console.log(bundle)
    if (err) return next(err);
    // console.log(dataArray.length)
    var flattenedArray = _.flattenDeep(dataArray)
    res.send(flattenedArray)
    res.end()

   })

})

module.exports = router;






                // console.log(dataArray)




           //    starTrack.getGuid(conNoteNumber, function (guid) {

           //      starTrack.getConEvents(guid[0], function (events) {

           //      // var last =  _.last(events)
     
           //        starTrack.getConSummary(guid[0], function (summary) {

           //          var conData = {
           //            rowNum: rowNumber,
           //        conNum: conNoteNumber,
           //        date: last['EventDate'],
           //        time: last['Time'],
           //        location: last['Location'],
           //        status: last['Status'],
           //        time: last['Time'],
           //        summary: summary['StatusDescription']
           //          }
           //          dataArray.push(conData)   
           // //         var xls = json2xls(dataArray)
           //      // fs.writeFileSync(__dirname+ '/data.xlsx', xls, 'binary')   

           //      if (dataArray.length == worksheet.lastRow.number -1 ) {
           //        done(null, dataArray)
           //      }
           //        })
           //      })
           //    })
