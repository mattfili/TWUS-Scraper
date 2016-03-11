var express = require('express');
var _ = require('lodash');
var request = require('request');
var cheerio = require('cheerio');

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

			var consignment = _
                .chain(conArray)
                .drop()
                .chunk(4)
                .value()


                // console.log(consignment)

                for (var i = 0; i < consignment.length; i++) {

	                sendObj = {
	                  conNum: '',
	                  status: '',
	                  date: '',
	                  time: '',
	                  depot: ''
	                }

                	sendObj.conNum = conArray[0].split(' ')[2]
                    sendObj.status = consignment[i][0]
                    sendObj.date = consignment[i][1]
                    sendObj.time = consignment[i][2]
                    sendObj.depot = consignment[i][3]

                    // console.log(sendObj)
                    dataArray.push(sendObj)
                }

                // console.log(dataArray)


			cb(dataArray)
		}
	})
}

// Loop through each consignment, passing it to the request module
// For the length of 
// {
// 	Status: 'Data Electronically Recieved',
// 	Data: 'Date',
// 	Time: '15:50:50',
// 	Depot: 'Sydney - Eskine Park'
// },
// {
// 	status: 'Data Electronically Recieved',
// 	Data: 'Date',
// 	Time: '15:50:50',
// 	Depot: 'Sydney - Eskine Park'
// },
// {
// 	status: 'Data Electronically Recieved',
// 	Data: 'Date',
// 	Time: '15:50:50',
// 	Depot: 'Sydney - Eskine Park'
// }



