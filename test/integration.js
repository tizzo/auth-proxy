var assert = require("assert")
var app = require('../index.js');
var request = require('request');
var http = require('http');
var async = require('async');
var passport = require('passport');
var util = require('util');
var MultiPortFinder = require('../lib/test/MultiPortFinder.js');
require('should');

// We use self-signed certs for testing but unfortunately in
// some versions of node this global flag seems to be necessary.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var ports = [];
var testServers = [];

describe('Server', function(){
  before(function(done) {
    app.logger.transports = [];
    var MockStrategy = function(options, verify) {
      this.name = 'mock';
      this.verify = function(cb) {
        console.log(arguments);
        cb();
      };
    };
    util.inherits(MockStrategy, passport.Strategy);
    MockStrategy.prototype.name = 'mockSession';
    MockStrategy.prototype.authenticate = function(req) {
      if (req.headers.authenticated) {
        var user = {
          _json: {
            email: 'homer@simpson.com'
          }
        };
        this.success(user, user);
      }
      else {
        this.fail(new Error('User failed to auth'));
      }
    };
    app.passport.unuse('google');
    app.passport.use(new MockStrategy());
    app.app.get('/mockAuth', passport.authenticate('mock'));
    var findPorts = function(cb) {
      MultiPortFinder(5, function(error, foundPorts) {
        ports = foundPorts;
        app.config.port = ports[0];
        app.config.httpPort = ports[1];
        cb();
      });
    };
    var startTestServer1 = function(cb) {
      testServers.push(http.createServer(function(req, res) {
        res.writeHead(200);
        res.end('Proxied successfully to server 1.');
      }));
      testServers[0].listen(ports[2], function(error) {
        cb(error);
      });
    };
    var startTestServer2 = function(cb) {
      testServers.push(http.createServer(function(req, res) {
        res.writeHead(200);
        res.end('Proxied successfully to server 2.');
      }));
      testServers[1].listen(ports[3], function(error) {
        cb(error);
      });
    };
    async.waterfall([findPorts, startTestServer1, startTestServer2, app.start], done);
  });
  after(function() {
    app.stop();
    for (i in testServers) {
      testServers[i].close();
    }
  });
  it('should redirect to login if not authenticated', function(done) {
    var options = {
      uri: 'https://127.0.0.1:' + ports[0],
      followRedirect: false,
      strictSSL: false,
      rejectUnauthorized : false,
      // Empty out the cookie jar to ensure we don't accidentally auth if these tests run twice.
      jar: new request.jar()
    };
    request(options, function(error, response, body) {
      if (error) {
        done(error);
      }
      body.should.equal('Moved Temporarily. Redirecting to /login');
      done(error);
    });
  });
  it('should proxy to a route without any patterns to match', function (done) {
    app.config.routes = [
      {
        host: '127.0.0.1',
        port: ports[2]
      }
    ];
    var options = {
      followRedirect: false,
      headers: {
        host: "someroute.com",
        authenticated: true
      }
    };
    options.uri = 'https://127.0.0.1:' + ports[0] + '/mockAuth';
    request(options, function(error, response, body) {
      options.uri = 'https://127.0.0.1:' + ports[0] + '/wherever';
      request(options, function(error, response, body) {
        if (error) {
          done(error);
        }
        body.should.equal('Proxied successfully to server 1.');
        done(error);
      });
    });
  });
  it ('should proxy to a route based on hostname pattern', function (done) {
    app.config.routes = [
      {
        host: '127.0.0.1',
        port: ports[2],
        hostPattern: 'someroute.com',
      },
      {
        host: '127.0.0.1',
        port: ports[3],
        hostPattern: 'otherroute.com',
      }
    ];
    var options = {
      followRedirect: false,
      headers: {
        host: "someroute.com",
        authenticated: true
      }
    };
    options.uri = 'https://127.0.0.1:' + ports[0];
    async.waterfall([
      function(cb) {
        request(options, function(error, response, body) {
          body.should.equal('Proxied successfully to server 1.');
          cb(error);
        });
      },
      function(cb) {
        options.headers.host = 'otherroute.com';
        request(options, function(error, response, body) {
          body.should.equal('Proxied successfully to server 2.');
          done(error);
        });
      }
    ], done);
  });
});
