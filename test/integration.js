var assert = require("assert")
var app = require('../index.js');
var request = require('request');
var http = require('http');
var async = require('async');
var MultiPortFinder = require('../lib/test/MultiPortFinder.js');
var MockAuth = require('../lib/plugins/MockAuth.js');
require('should');

// We use self-signed certs for testing but unfortunately in
// some versions of node this global flag seems to be necessary.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var ports = [];
var testServers = [];

describe('Server', function(){
  before(function(done) {
    app.logger.transports = [];
    app.passport.unuse('google');
    app.passport.use(new MockAuth.MockStrategy());
    app.app.get('/mockAuth', app.passport.authenticate('mock'));
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
  it ('should allow proxying to an annonymous user for a public route.', function(done) {
    app.config.routes = [
      {
        host: '127.0.0.1',
        port: ports[2],
        public: true,
      }
    ];
    var options = {
      followRedirect: false,
      jar: new request.jar(),
      strictSSL: false,
      rejectUnauthorized : false,
    }
    options.uri = 'https://127.0.0.1:' + ports[0] + '/somewhere';
    request(options, function(error, response, body) {
      if (error) return done(error);
      body.should.equal('Proxied successfully to server 1.');
      done();
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
  it ('should list only listable routes on the main page', function(done) {
    options = {};
    options.uri = 'https://127.0.0.1:' + ports[0];
    app.config.routes = [
      {
        link: '/bar',
        name: 'Enabled one',
        description: 'Route one',
        hostPattern: 'someroute.com'
      },
      {
        name: 'Enabled two',
        link: '/baz',
        description: 'Route two',
        hostPattern: 'otherroute.com',
      },
      {
        name: 'Disabled',
        link: '/baz',
        description: 'Route three',
        hostPattern: 'thirdrroute.com',
        list: false,
      },
      {
        name: 'Incomplete',
        hostPattern: 'thirdrroute.com',
      }
    ];
    request(options, function(error, response, body) {
      if (error) return done(error);
      body.should.include('Enabled one');
      body.should.include('Enabled two');
      body.should.include('Route two');
      body.should.not.include('Disabled');
      body.should.not.include('Incomplete');
      done();
    });
  });
});
