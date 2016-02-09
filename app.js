var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var request = require('request');
var app = express();


// ROUTE REQUIRES
var scraper = require('./routes/scraper')
var exporter = require('./routes/export')

// MIDDLEWARES
app.use(logger('common'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, 'public')));



// // PRE-LOGIN ENDPOINTS
app.use('/api', scraper)
app.use('/api', exporter)


// POST LOGIN ENDPOINTS


// CATCH ALL FOR HTML 5 MODE (allows UI-Router driven states)
app.get('*', function (req, res) {
  res.redirect('/#' + req.originalUrl)
})


// ERROR HANDLING
app.use(function(req, res, next) {
  var err = new Error("Can't find it: " + err.status);
  err.status = 404;
  next(err);
});

if (app.get('env') === 'development') {
  console.log('That casual '+ app.get('env') +' environment right?')
}

if (app.get('env') === 'production') {
  console.log('That hardcore '+ app.get('env') +' environment right?')
}

app.use(function(err, req, res, next) {
  res.status(err.status || 500);
});

// SERVER CONNECT

var port = process.env.PORT || 8080;

var server = app.listen(port, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log("You're listening to http://localhost:" +port + " home of the internet's smoothest jazz and easy listening" );
});


module.exports = app;
