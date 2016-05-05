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
var starTrack = require('../controller/commHandler');
var async = require('async');


var router = express.Router();

router.post('/st', multipartMiddleware, function (req, res, next) {

	async.waterfall([
		function (done) {
			var workbook = new Excel.Workbook();
			workbook.xlsx.readFile(req.files.file.path)
	

		    .then(function() {

		    	var worksheet = workbook.getWorksheet(1)
		        var colH = worksheet.getColumn(1)
		        var dataArray = []

		        colH.eachCell({includeEmpty: false}, function(cell, rowNumber) {
		        	if (rowNumber == 1) {
		        		return
		        	} else {
			        	var conNoteNumber = cell.value

			        	starTrack.getGuid(conNoteNumber, function (guid) {

			        		if (!guid.length) {
			        			var conData = {
			        				rowNum: rowNumber,
			        				conNum: conNoteNumber,
									date: '',
									time: '',
									location: '',
									status: '',
									time: '',
									summary: 'Consignment Number Error'
			        			}
			        			dataArray.push(conData)
			        		} else {

				        		starTrack.getConEvents(guid[0], function (events) {

				        		var last =	_.last(events)
				 
				        			starTrack.getConSummary(guid[0], function (summary) {

				        				var conData = {
				        					rowNum: rowNumber,
											conNum: conNoteNumber,
											date: last['EventDate'] || 'No Date',
											time: last['Time'] || 'No Time',
											location: last['Location'] || 'No Location',
											status: last['Status'] || 'No Status',
											time: last['Time'] || 'No Time',
											summary: summary['StatusDescription'] || 'No Summary'
				        				}
					        			dataArray.push(conData)   


										if (dataArray.length == worksheet.lastRow.number -1) {
				 							done(null, dataArray)
				 						}
				        			})
				        		})
			        		}
			        	})
		        	}
		        })
		    })
		}

	], function done(err, dataArray) {
		// console.log(bundle)
		if (err) return next(err);
		// console.log(dataArray)
		res.send(dataArray)
		res.end()

	 })

})

module.exports = router;

			     //    			var xls = json2xls(dataArray)
								// fs.writeFileSync(__dirname+ '/data.xlsx', xls, 'binary')   
