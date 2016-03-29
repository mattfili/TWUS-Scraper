var express = require('express');
request = require('request-json');
var client = request.createClient('http://localhost:8888/');

var ut = Math.round(new Date().getTime()/1000.0);
var guidApi = 'http://sttrackandtrace.startrack.com.au/Consignment/GetConsignmentsBySearchCriteriaShort/';
var conEvents = 'http://sttrackandtrace.startrack.com.au/Consignment/GetConsignmentEventsByConsignmentGuid/';
var conSummary = 'http://sttrackandtrace.startrack.com.au/Consignment/GetConsignmentSummariesByConsignmentGuid/';
var querySep = '?t=';


module.exports.getGuid = function (note, cb) {
	client.get(guidApi + note + querySep + ut, function (error, response, body) {
		if (error) { return error}
		else if (!error && response.statusCode == 200) {
			// console.log(body.toString())
			// console.log()
			console.log(body)

			cb(body)
		}
	})
}

module.exports.getConEvents = function (guid, cb) {
	client.get(conEvents + guid + querySep + ut, function (error, response, body) {

		if (error) { return error}
		else if (!error && response.statusCode == 200) {

			cb(body)
		}
	})
}

module.exports.getConSummary = function (guid, cb) {
	client.get(conSummary + guid + querySep + ut, function (error, response, body) {
			
		if (error) { return error}
		else if (!error && response.statusCode == 200) {
	
			cb(body)
		}
	})
}

