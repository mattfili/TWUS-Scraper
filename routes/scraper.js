var express = require('express');
var fs = require('fs');
var request = require('request');
var cheerio = require('cheerio');
var async = require('async');
var _ = require('lodash');
var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();
var Excel = require("exceljs");
var url = require('url')
var multer  = require('multer')
var upload = multer({ dest: 'uploads/' })
var phantom = require('phantom');


var router = express.Router();

router.post('/load', multipartMiddleware, function (req, res, next) {

	var url = 'http://sttrackandtrace.startrack.com.au/'

	var workbook = new Excel.Workbook();

	workbook.xlsx.readFile(req.files.file.path)


    .then(function() {
    	// grab the workbook
    	var worksheet = workbook.getWorksheet(1)

    	// grab col H and iterate through the values 
        var hCol = worksheet.getColumn(8)
        hCol.eachCell(function(cell, rowNumber) {
        	var conNote = cell.values

        	phantom.create(function(ph) {
  				return ph.createPage(function(page) {
 
				    //From here on in, we can use PhantomJS' API methods
				    return page.open(url + conNote, function(status) {
			            //The page is now open      
			            console.log("opened site? ", status);
			            page.injectJs('http://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js', function() {

			            		setTimeout(function() {
								    return page.evaluate(function() {
								 
								        // //Get what you want from the page using jQuery. 
								        // //A good way is to populate an object with all the jQuery commands that you need and then return the object.
								 
								        // var h2Arr = [], //array that holds all html for h2 elements
								        // pArr = []; //array that holds all html for p elements
								 
								        // //Populate the two arrays
								        // $('h2').each(function() {
								        //     h2Arr.push($(this).html());
								        // });
								 
								        // $('p').each(function() {
								        //     pArr.push($(this).html());
								        // });
								 
								        // //Return this data
								        // return {
								        //     h2: h2Arr,
								        //     p: pArr
								        // }


								        return $('#ConsignmentScans tbody tr:last td').text()
								    }, function(result) {
								        console.log(result); //Log out the data.
								        ph.exit();
								    });
								}, 5000);

			            });
 
        			});
    			});
			});


        })
    });





})

module.exports = router;