var assert = require("assert")
var app = require('../index.js');
var request = require('request');
require('should');

var Route = app.Route;

describe('Route', function(){
  it('should check a hostname on a request for a match', function() {
    var route = new Route({
      hostPattern: 'google.com'
    });
    var mockRequest = {
      headers: {
        host: 'google.com'
      }
    };
    assert.equal(route.hostMatches(mockRequest), true, 'host pattern matches');
    mockRequest.headers.host = 'yahoo.com';
    assert.notEqual(route.hostMatches(mockRequest), true, 'host pattern does not match');
  });
  it ('should check the path on a request for a match', function() {
    var route = new Route({
      pathPattern: '/jenkins/?'
    });
    var mockRequest = {
      url: '/jenkins'
    };
    assert.equal(route.pathMatches(mockRequest), true, 'host pattern matches');
    mockRequest.url = '/phpMyAdmin';
    assert.notEqual(route.pathMatches(mockRequest), true, 'host pattern does not match');
  });
  it ('should check both host and path for a match', function() {
    var route = new Route({
      hostPattern: '^ops.somecompany.com$',
      pathPattern: '/jenkins/?'
    });
    var mockRequest = {
      headers: {
        host: 'ops.somecompany.com'
      },
      url: '/jenkins/'
    }
    assert.equal(route.isMatch(mockRequest), true, 'host and path properly match');
    mockRequest.url = '/jenkins';
    assert.equal(route.isMatch(mockRequest), true, 'host and path properly match, regex properly evaluated');
    mockRequest.url = '/phpMyAdmin';
    assert.equal(route.isMatch(mockRequest), false, 'host matches but path doesn\'t');
    mockRequest.url = '/jenkins';
    mockRequest.headers.host = 'yahoo.com';
    assert.equal(route.isMatch(mockRequest), false, 'path matches but host doesn\'t');
    mockRequest.url = '/broken';
    mockRequest.headers.host = 'ops.somecompany.com';
    assert.equal(route.isMatch(mockRequest), false, 'neither host nor path match');
  });
});
