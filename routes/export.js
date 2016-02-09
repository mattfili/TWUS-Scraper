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

router.get('/export', function (req, res, next) {

	// var workbook = XLXS.readFile('data.xlsx')
	// XLSX.writeFile(workbook, 'finaldata.xlsx')

	var wopts = { bookType:'xlsx', bookSST:false, type:'binary' };
	var wbout = XLSX.write('data.xlsx',wopts);     
	// Send the buffer:
	res.send( wbout );

});

module.exports = router;