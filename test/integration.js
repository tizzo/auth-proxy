var assert = require("assert")
var AuthProxy = require('../index.js');
var request = require('request');
var http = require('http');
var async = require('async');
var MultiPortFinder = require('../lib/test/MultiPortFinder.js');
var MockAuth = require('../lib/plugins/MockAuth.js');
var path = require('path');
require('should');

var app = AuthProxy.Proxy;

// We use self-signed certs for testing but unfortunately in
// some versions of node this global flag seems to be necessary.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var ports = [];
var testServers = [];

var app = new app();

describe('Integration', function(){
  before(function(done) {
    var clearWinstonTransports = function(cb) {
      app.logger.transports = [];
      cb();
    };
    var checkRedisConnection = function(cb) {
      if (app.redisClient.connected === true) {
        return cb();
      }
      // Sometimes it takes a second to connect to redis...
      setTimeout(function() {
        if (app.redisClient.connected === false) {
          done(new Error('Tests require a redis instance.'));
        }
      }, 250);
    };
    var findPorts = function(cb) {
      MultiPortFinder(7, function(error, foundPorts) {
        ports = foundPorts;
        app.configSet('port', ports[0]);
        app.configSet('httpPort', ports[1]);
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
    var tasks = [
      app.configure.bind(app, path.join(__dirname, 'config.yaml')),
      clearWinstonTransports,
      checkRedisConnection,
      findPorts,
      startTestServer1,
      startTestServer2,
      app.start,
    ];
    async.waterfall(tasks, done);
  });
  after(function() {
    app.stop();
    var i = null;
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
      body.should.match(/^Moved Temporarily\. Redirecting to https:\/\/127\.0\.0\.1(:\d+)?\/login$/);
      done(error);
    });
  });
  it('should serve css assets if not authenticated', function(done) {
    var options = {
      uri: 'https://127.0.0.1:' + ports[0] + '/css/bootstrap.css',
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
      response.statusCode.should.equal(200);
      done(error);
    });
  });
  it('should serve image assets if not authenticated', function(done) {
    var options = {
      uri: 'https://127.0.0.1:' + ports[0] + '/img/glyphicons-halflings.png',
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
      response.statusCode.should.equal(200);
      done(error);
    });
  });
  it('should allow proxying to an annonymous user for a public route.', function(done) {
    app.setRoutes([
      new AuthProxy.Route({
        host: '127.0.0.1',
        port: ports[2],
        public: true,
      })
    ]);
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
    app.setRoutes([
      new AuthProxy.Route({
        host: '127.0.0.1',
        port: ports[2]
      })
    ]);
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
  it('should proxy to a route based on hostname pattern', function (done) {
    app.setRoutes([
      new AuthProxy.Route({
        host: '127.0.0.1',
        port: ports[2],
        hostPattern: 'someroute.com',
      }),
      new AuthProxy.Route({
        host: '127.0.0.1',
        port: ports[3],
        hostPattern: 'otherroute.com',
      })
    ]);
    var options = {
      followRedirect: false,
      headers: {
        host: "someroute.com",
        authenticated: true
      }
    };
    options.uri = 'https://127.0.0.1:' + ports[0];
    async.series([
      function (cb) {
        options.uri = options.uri + '/mockAuth';
        request(options, cb);
      },
      function(cb) {
        options.uri = 'https://127.0.0.1:' + ports[0];
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
    app.setRoutes([
      new AuthProxy.Route({
        link: '/bar',
        name: 'Enabled one',
        description: 'Route one',
        hostPattern: 'someroute.com'
      }),
      new AuthProxy.Route({
        name: 'Enabled two',
        link: '/baz',
        description: 'Route two',
        hostPattern: 'otherroute.com',
      }),
      new AuthProxy.Route({
        name: 'Disabled',
        link: '/baz',
        description: 'Route three',
        hostPattern: 'thirdrroute.com',
        list: false,
      }),
      new AuthProxy.Route({
        name: 'Incomplete',
        hostPattern: 'thirdrroute.com',
      })
    ]);
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
  it ('should add basic http auth headers if they are configured on the route', function(done) {
    var testUser = 'Bart Simpson';
    var testPassword = 'Eat My Shorts';
    app.setRoutes([
      new AuthProxy.Route({
        'host': '127.0.0.1',
        'port': ports[4],
        'basicAuth': {
          'name': testUser,
          'password': testPassword,
        }
      })
    ]);
    options = {};
    options.uri = 'https://127.0.0.1:' + ports[0] + '/foo';
    var server = http.createServer(function(req, res){
        var header = req.headers['authorization'] || '';
        var token = header.split(/\s+/).pop() || '';
        var auth = new Buffer(token, 'base64').toString();
        var parts = auth.split(/:/);
        var username = parts[0];
        var password = parts[1];

      res.writeHead(200,{'Content-Type':'text/plain'});
      res.end(JSON.stringify({'username': username, 'password': password}));
    });
    server.listen(ports[4], function() {
      request(options, function(error, response, body) {
        if (error) return done(error);
        var values = JSON.parse(body);
        values.username.should.equal(testUser);
        values.password.should.equal(testPassword);
        server.close(done);
      });
    });
  });
  it('should proxy to the appropriate backend based on path pattern.', function(done) {
    app.setRoutes([
      new AuthProxy.Route({
        host: '127.0.0.1',
        port: ports[2],
        pathPattern: "^/one/?",
        public: true,
      }),
      new AuthProxy.Route({
        host: '127.0.0.1',
        port: ports[3],
        pathPattern: "^/two/?",
        public: true,
      })
    ]);
    var options = {
      followRedirect: false,
      jar: new request.jar(),
      strictSSL: false,
      rejectUnauthorized : false,
    }
    options.uri = 'https://127.0.0.1:' + ports[0] + '/one';
    request(options, function(error, response, body) {
      if (error) return done(error);
      body.should.equal('Proxied successfully to server 1.');
      options.uri = 'https://127.0.0.1:' + ports[0] + '/two';
      request(options, function(error, response, body) {
        body.should.equal('Proxied successfully to server 2.');
        done(error);
      });
    });
  });
  it('should not have one request block another request.', function(done) {
    var slowServer = null;
    // Configure our two routes, one fast one slow.
    app.setRoutes([
      new AuthProxy.Route({
        'host': '127.0.0.1',
        'port': ports[5],
        'pathPattern': '^/slow/?',
        'public': true
      }),
      new AuthProxy.Route({
        'host': '127.0.0.1',
        'port': ports[2],
        'pathPattern': '^/fast/?',
        'public': true
      })
    ]);
    // Our history array used to track the order in which events occur.
    var history = [];
    // Our slow server which waits 300ms before responding and logs when the
    // request is received in our history array.
    var startSlowServer = function(cb) {
      slowServer = http.createServer(function(req, res) {
        history.push('slow request received');
        setTimeout(function() {
          res.writeHead(200);
          res.end('slow response');
        }, 300);
      });
      testServers.push(slowServer);
      slowServer.listen(ports[5], cb);
    };
    var sendRequests = function(cb) {
      var options = {
        followRedirect: false,
        strictSSL: false,
        rejectUnauthorized : false,
        // Empty out the cookie jar to ensure we don't accidentally auth if
        // these tests run twice.
        jar: new request.jar()
      };
      history.push('slow request sent');
      options.uri = 'https://127.0.0.1:' + ports[0] + '/slow';
      // Run a slow request and a fast request in parallel.
      async.parallel([
        function(localCb) {
          request(options, function(error, response, body) {
            if (body === 'slow response') {
              history.push('slow response received');
            }
            localCb(error);
          });
        },
        function(localCb) {
          options.uri = 'https://127.0.0.1:' + ports[0] + '/fast';
          history.push('fast request sent');
          request(options, function(error, response, body) {
            if (body === 'Proxied successfully to server 1.') {
              history.push('fast response received');
            }
            localCb();
          });
        },
      ], cb)
    };
    var performAssertions = function(cb) {
      history[0].should.equal('slow request sent');
      history[1].should.equal('fast request sent');
      history[2].should.equal('slow request received');
      history[3].should.equal('fast response received');
      history[4].should.equal('slow response received');
      cb();
    }
    async.series([
      startSlowServer,
      sendRequests,
      performAssertions
    ], function() {
      done();
    });
  });
});
