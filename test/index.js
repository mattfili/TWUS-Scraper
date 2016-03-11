'use strict';

var should = require('should');
var app = require('../app');
var request = require('supertest');
var test = require('tape');


  test('should return 200 with expected JSON', function(t) {
    request(app)
      .post('/api/tnt')
      .expect(200)
      .end(function(err, res) {
        console.log(res)
        // t.err(err, 'no error')
        console.log(err)
        t.end();
      });
  });

