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
var starTrack = require('../model/commHandler');
var async = require('async');
var json2xls = require('json2xls');
var express = require('express');
var XLSX = require('xlsx');



var router = express.Router();

router.post('/load', multipartMiddleware, function (req, res, next) {

	async.waterfall([
		function (callback) {
			var workbook = new Excel.Workbook();
			workbook.xlsx.readFile(req.files.file.path)

		    .then(function() {

		    	var worksheet = workbook.getWorksheet(1)
		        var colH = worksheet.getColumn(8)
		        var data = [];

		        colH.eachCell(function(cell, rowNumber) {

		        	var conNoteNumber = cell.value

		        	starTrack.getGuid(conNoteNumber, function (guid) {

		        		starTrack.getConEvents(guid[0], function (events) {

		        		var last =	_.last(events)
		 
		        			starTrack.getConSummary(guid[0], function (summary) {

		        				var conData = {
		        					rowNum: rowNumber,
									conNum: conNoteNumber,
									date: last['EventDate'],
									time: last['Time'],
									location: last['Location'],
									status: last['Status'],
									time: last['Time'],
									summary: summary['StatusDescription']
		        				}
		        				data.push(conData)       	

		        				var xls = json2xls(data);
								fs.writeFileSync(__dirname+ 'data.xlsx', xls, 'binary')

		        				callback(null, data)
		        			})
		        		})
		        	})
		        })
		    })
		}

	], function (err, data) {
		// console.log(bundle)
		if (err) return next(err);
		// console.log(data)
		res.send(200)
		res.end()

	 })

})

module.exports = router;

