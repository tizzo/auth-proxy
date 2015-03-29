'use strict';
var fs = require('fs')
  , express = require('express')
  , passport = require('passport')
  , util = require('util')
  , LocalStrategy = require('passport-local').Strategy
  , https = require('https')
  , http = require('http')
  , httpProxy = require('http-proxy')
  , path = require('path')
  , redis = require('redis')
  , RedisStore = require('connect-redis')(express)
  , winston = require('winston')
  , async = require('async');

// Load custom modules.
var Route = require('./Route')
  , Route = require('./Route')
  , PassportPlugins = require('./plugins')
  , RouteLoader = require('./RouteLoader')
  , chainParser = require('./certChainParser')
;

/**
 * The AuthProxy server.
 *
 * This is the javascript object exported by this file.
 */
var AuthProxy = function() {
  var self = this;
  this.start = this.start.bind(this);
  this.stop = this.stop.bind(this);
  this.configure = this.configure.bind(this);
  this.createHttpsServer = this.createHttpsServer.bind(this);
  this.createHttpServer = this.createHttpServer.bind(this);
  this.ensureAuthenticated = this.ensureAuthenticated.bind(this);
  this.proxyRoute = this.proxyRoute.bind(this);
  this.lookupRoute = this.lookupRoute.bind(this);
  this.proxy = new httpProxy.createProxyServer();
  this.config = {};
  // Configurations for the winston Console transport.
  this.loggers = {
    text: {
      colorize: true,
      timestamp: true,
    },
    logstash: {
      timestamp: true,
      logstash: true,
    },
    bunyan: {
      timestamp: true,
      formatter: function(options) {
        var levels = {
          silly: 10,
          debug: 20,
          verbose: 30,
          info: 40,
          warn: 50,
          error: 60,
        };
        var date = new Date();
        var output = {
          v: 0,
          name: self.config.name,
          pid: process.pid,
          level: levels[options.level],
          msg: options.message,
          time: date.toISOString(),
          hostname: self.config.host,
        };
        if (Object.keys(options.meta).length > 0) {
          output.data = options.meta;
        }
        return JSON.stringify(output);
      },
    },
    json: {
      timestamp: true,
      formatter: function(options) {
        var date = new Date();
        var output = {
          name: self.config.name,
          pid: process.pid,
          level: options.level,
          message: options.message,
          time: date.toISOString(),
          v: 0,
        };
        if (Object.keys(options.meta).length > 0) {
          output.data = options.meta;
        }
        return JSON.stringify(output);
      }
    },
  };
};

/**
 * Load configuration.
 *
 * @param confPath
 *   A path for the configuration file to load.
 */
AuthProxy.prototype.configure = function configure(localConfig, done) {

  var self = this;
  var app = this.app = express();
  if (this.loggers[localConfig.logger]) {
    var options = this.loggers[localConfig.logger];
  }
  else {
    return done(new Error('Unsupported log format'));
  }
  var logger = new winston.Logger();
  logger.add(winston.transports.Console, options);
  this.logger = logger;

  // Set the name of our process.
  process.title = self.config.processName;
  http.globalAgent.maxSockets = 3000;

  // Dead simple serialization does not actually save user info.
  passport.serializeUser(function(user, done) {
    done(null, user);
  });

  // Dead simple serialization does not actually load user info.
  passport.deserializeUser(function(obj, done) {
    done(null, obj);
  });


  // Configure Express
  app.configure(function() {
    app.set('views', path.join(__dirname, '..', 'views'));
    app.set('view engine', 'ejs');
    app.use(express.cookieParser());
    app.use(express.methodOverride());
    var redisClient = redis.createClient({ host: localConfig.redisHost, port: localConfig.redisPort });
    self.redisClient = redisClient;
    redisClient.on('connect', function() {
      if (done) {
        done();
      }
    });
    var sessionConfig = {
      name: localConfig.cookieSid,
      secure: true,
      secret: localConfig.sessionSecret,
      store: new RedisStore({ client: redisClient })
    };
    if (localConfig.cookieDomain) {
      sessionConfig.cookie = { domain: localConfig.cookieDomain };
    }
    var session = express.session(sessionConfig)
    app.use(session);
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(self.lookupRoute);
    app.use(self.ensureAuthenticated);
    app.use(self.proxyRoute);
    // Allow this to be toggleable with verbose logging.
    if (localConfig.verbose) {
      app.use(express.logger());
    }
    app.use(app.router);
    app.use(express.static(path.resolve(path.join(__dirname, '..', 'public'))));
  });

  localConfig.routeWhiteList.push(localConfig.loginPath);
  var routes = [];
  for (i in localConfig.routes) {
    routes.push(new Route(localConfig.routes[i]));
  }

  localConfig.routes = routes;
  self.config = localConfig;
  self.authenticationStrategies = [];
  passport.strategies = {};
  for (name in self.config.authenticationStrategies) {
    var strategyConfig = self.config.authenticationStrategies[name];
    // If we do not ship with a plugin by the name listed in the
    // configuration, try to require it.
    authenticationStrategies[name] = PassportPlugins[name] || require(name);
    authenticationStrategies[name].attach(passport, app, self.config, strategyConfig, logger);
  }

  // Clear the configured express routes and reattach them from
  // the configuration.
  app.routes = {};
  RouteLoader(app, self.authenticationStrategies, self.config);
};

/**
 * Creates a standard HTTP server (non-ssl) to redirect requests to SSL.
 */
AuthProxy.prototype.createHttpServer = function createHttpServer(done) {
  var self = this;
  var logger = self.logger;
  // Create a server for redirecting unencrypted requests to SSL.
  var httpServer = http.createServer(function (req, res) {
    if (req.headers && req.headers.host && req.headers.host.split) {
      var host = req.headers.host.split(':')[0];
    }
    else {
      var host = self.config.host;
    }
    if (self.config.port !== '443') {
      host = host + ':' + self.config.port;
    }
    var location = host + req.url;
    logger.info('Redirecting http://%s to https://%s', location, location);
    res.writeHead(301, { location: 'https://' + location });
    res.end('This resource is only available over SSL, please use https://' + location);
  });
  
  httpServer.on('listening', function() {
    var message = 'now redirecting http requests on port %d to https on port %s';
    logger.info(message, self.config.httpPort, self.config.port);
  });
  this.httpServer = httpServer;
  done();
};

/**
 * Creates the main HTTPS server for proxying requests.
 */
AuthProxy.prototype.createHttpsServer = function createHttpsServer(done) {
  var self = this;
  var logger = this.logger;
  var files = [self.config.sslKey, self.config.sslCert];
  if (self.config.sslCA) {
    files.push(self.config.sslCA);
  }

  async.map(files, fs.readFile, function(error, results) {

    var options = {
      key: results[0],
      cert: results[1]
    };

    if (self.config.sslCA) {
      options['ca'] = chainParser(results[2].toString('utf8'));
    }

    var server = https.createServer(options, function(req, res) {
      self.app(req, res);
    });
    server.on('listening', function() {
      logger.info('now listening to https traffic on port %s', self.config.port);
      if (self.config.proxyUser) {
        logger.info('switching to user ' + self.config.proxyUser);
        process.setuid(self.config.proxyUser);
      }
      if (self.config.proxyGroup) {
        logger.info('switching to group ' + self.config.proxyGroup);
        process.setgid(self.config.proxyGroup);
      }
    });

    // Support websocket request upgrades.
    server.on('upgrade', function(req, socket, head) {
      logger.info('proxying websocket request to %s', req.headers.host);
      if (!req.authProxyRoute) return;
      var route = req.authProxyRoute;
      self.proxy.ws(req, res, {
        target: {
          host: route.host,
          port: route.port,
        },
      });
    });
    self.server = server;

    done();

  });
};

/**
 * Set the routes on the app.
 */
AuthProxy.prototype.setRoutes = function setRoutes(routes) {
  this.config.routes = routes;
};

/**
 * Set a configuration key to a given value.
 */
AuthProxy.prototype.configSet = function configSet(name, value) {
  this.config[name] = value;
};

/**
 * Start the server(s).
 */
AuthProxy.prototype.start = function start(done) {
  var self = this;
  var actions = [
    this.createHttpsServer,
    this.createHttpServer,
    function(cb) {
      self.server.listen(self.config.port, cb);
    }
  ];
  if (self.config.httpPort) {
    actions.push(function(cb) {
      self.httpServer.listen(self.config.httpPort, cb);
    });
  }
  async.series(actions, done);
};

/**
 * Stop the server(s).
 */
AuthProxy.prototype.stop = function stop(done) {
  var self = this;
  var logger = self.logger;
  var server = this.server;
  var httpServer = this.httpServer;
  if (!done) {
    done = function() {};
  }
  var tasks = [];
  tasks.push(function(cb) {
    server.on('close', function() {
      logger.info('stopped https server on %s', self.config.port);
      cb();
    });
    server.close();
  });
  // TODO: Redis isn't sutting down properly. Why?
  tasks.push(function(cb) {
    cb();
    self.redisClient.end();
  });
  if (self.config.httpPort) {
    httpServer.on('close', function() {
    });
    tasks.push(function(cb) {
      httpServer.on('close', function() {
        logger.info('stopped http redirect server on %s', self.config.httpPort);
        cb();
      });
      httpServer.close();
    });
  }
  async.parallel(tasks, done);
};

/**
 * Check whether the url is in a white-list of paths that do
 * not require authentication.
 */
AuthProxy.prototype.inURLWhiteList = function inURLWhiteList(url) {
  var url = url.split('?')[0];
  return this.config.routeWhiteList.indexOf(url) !== -1;
};

/**
 * Simple route middleware to ensure user is authenticated.
 *   Use this route middleware on any resource that needs to be protected.  If
 *   the request is authenticated (typically via a persistent login session),
 *   the request will proceed.  Otherwise, the user will be redirected to the
 *   login page.
 */
AuthProxy.prototype.ensureAuthenticated = function ensureAuthenticated(req, res, next) {
  var logger = this.logger;
  if (req.isAuthenticated() || this.inURLWhiteList(req.url) || (req.authProxyRoute && req.authProxyRoute.public)) {
    return next();
  }
  // Browsers often send favicon requests after the initial load.
  // We don't want to redirect people to the favicon.
  // If it's not a favicon, save the original destination
  // in the session.
  if (req.url.match('favicon.ico') == null && !this.inURLWhiteList(req.url) && req.session) {
    req.session.redirectTo = req.url;
  }
  var redirectDest = 'https://' + this.config.host + ':' + this.config.port + this.config.loginPath;
  var originalReq = req.headers.host + req.url;
  logger.info('Redirecting request for %s from IP %s to %s', originalReq, req.connection.remoteAddress, redirectDest);
  res.redirect(redirectDest);
}

// A route lookup middleware - accepts a req, looks up the route.
AuthProxy.prototype.lookupRoute = function lookupRoute(req, res, next) {
  req.authProxyRoute = false;
  // We shouldn't pass anything in the whitelist to the backend.
  if (this.inURLWhiteList(req.url)) {
    return next();
  }
  for (i in this.config.routes) {
    var route = this.config.routes[i];
    if (route.isMatch(req)) {
      req.authProxyRoute = route;
      return next();
    }
  }
  next();
}

/**
 * Middleware to proxy a route.
 */
AuthProxy.prototype.proxyRoute = function proxyRoute(req, res, next) {
  var self = this;
  var logger = self.logger;
  // Lookup the route based on configuration.
  var route = req.authProxyRoute;
  if (route) {
    var originalReq = req.headers.host + req.url;

    // Rewrite the request as configured for this route.
    if (typeof route.rewriteRequest == 'function') {
      req = route.rewriteRequest(req, route);
    }
    if (typeof route.rewriteResponse == 'function') {
      res = route.rewriteResponse(res, route);
    }

    self.logProxyRequest(originalReq, req, route);

    // Log any proxy errors and close the open connection.
    self.proxy.on('error', function(error) {
      var message = 'There was an error proxying to the backend.';
      logger.error(message, route.name);
      res.end();
    });

    // Proxy the request to the route backend.
    self.proxy.web(req, res, {
      target: {
        host: route.host,
        port: route.port,
      },
      enable: {
        xforward: true
      }
    });
    return;
  }
  return next();
};

/**
 * Log a proxied request.
 */
AuthProxy.prototype.logProxyRequest = function(originalReq, req, route) {
  var url = req.headers.url || '';
  var newRequest = route.host + ':' + route.port + url;
  var user = (req.user && req.user.email) ? req.user.email : 'Anonymous';
  var string = '%s at %s has requested %s proxying to %s';
  this.logger.info(string, user, req.connection.remoteAddress, originalReq, newRequest);
};

module.exports = AuthProxy;
