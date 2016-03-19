var express = require('express');
var _ = require('lodash');
var request = require('request');
var cheerio = require('cheerio');
var Regex = require("regex");

var htmlAPI = 'http://www.tntexpress.com.au/InterAction/ASPs/CnmHxAS.asp?';
var xmlAPI = 'http://sttrackandtrace.startrack.com.au/Consignment/GetConsignmentEventsByConsignmentGuid/';


module.exports.getTNT = function (con, cb) {
	// console.log(con)
	request.get(htmlAPI + con, function (error, response, body) {
		var conArray = []
		var dataArray = []
		if (error) { return error}
		else if (!error) {

			var $ = cheerio.load(body)

			$('.f2').each(function(i, elem) {
				conArray[i] = $(this).text()
			})
			var pattern = new Regex(/(No data)/i)

			// console.log(pattern.test(conArray[0]))

			if (!conArray || conArray[0].split(' ')[0] == 'No') {
				cb('No Data for consignment number ' + con)
			} else {

				var consignment = _
	                .chain(conArray)
	                .drop()
	                .chunk(4)
	                .last()
	                .value()
 
	                // console.log(consignment)

		                sendObj = {
		                  conNum: '',
		                  status: '',
		                  date: '',
		                  time: '',
		                  depot: ''
		                }

	                	sendObj.conNum = conArray[0].split(' ')[2]
	                    sendObj.status = consignment[0]
	                    sendObj.date = consignment[1]
	                    sendObj.time = consignment[2]
	                    sendObj.depot = consignment[3]


				cb(sendObj)
			}
		}
	})
}



