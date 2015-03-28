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
  , yaml = require('js-yaml')
  , async = require('async');

// Load custom modules.
var ConfigLoader = require('./ConfigLoader')
  , Route = require('./Route')
  , PassportPlugins = require('./plugins')
  , chainParser = require('./certChainParser');

var AuthProxy = function() {
  this.start = this.start.bind(this);
  this.stop = this.stop.bind(this);
  this.configure = this.configure.bind(this);
  this.createHttpsServer = this.createHttpsServer.bind(this);
  this.createHttpServer = this.createHttpServer.bind(this);
  this.ensureAuthenticated = this.ensureAuthenticated.bind(this);
  this.proxyRoute = this.proxyRoute.bind(this);
  var logger = new winston.Logger();
  var options = {
    timestamp: true,
    colorize: true
  };
  logger.add(winston.transports.Console, options);
  this.logger = logger;
};

// Import the function that attaches our routes to the express server.
var RouteLoader = require('./RouteLoader');

// Set app defaults.
// TODO: We shouldn't be doing this at startup, we might end up with the wrong values.
var config = yaml.safeLoad(fs.readFileSync(path.resolve(path.join(__dirname, '..', 'default.config.yaml')), 'utf8'));

// Set the name of our process.
process.title = config.processName;

// Load the modules that do all of the work.
var app = express();
var proxy = new httpProxy.createProxyServer();
var redisClient = null;
var authenticationStrategies = [];

// Dead simple serialization does not actually save user info.
passport.serializeUser(function(user, done) {
  done(null, user);
});

// Dead simple serialization does not actually load user info.
passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

http.globalAgent.maxSockets = 3000;

var httpServer = null;
function createHttpServer(done) {
  var logger = this.logger;
  // Create a server for redirecting unencrypted requests to SSL.
  httpServer = http.createServer(function (req, res) {
    if (req.headers && req.headers.host && req.headers.host.split) {
      var host = req.headers.host.split(':')[0];
    }
    else {
      var host = config.host;
    }
    if (config.port !== '443') {
      host = host + ':' + config.port;
    }
    var location = host + req.url;
    logger.info('Redirecting http://%s to https://%s', location, location);
    res.writeHead(301, { location: 'https://' + location });
    res.end('This resource is only available over SSL, please use https://' + location);
  });
  
  httpServer.on('listening', function() {
    var message = 'now redirecting http requests on port %d to https on port %s';
    logger.info(message, config.httpPort, config.port);
  });
  done();
};
AuthProxy.prototype.createHttpServer = createHttpServer;

var server = null;
function createHttpsServer(done) {
  var logger = this.logger;
  var files = [config.sslKey, config.sslCert];
  if (config.sslCA) {
    files.push(config.sslCA);
  }

  async.map(files, fs.readFile, function(error, results) {

    var options = {
      key: results[0],
      cert: results[1]
    };

    if (config.sslCA) {
      options['ca'] = chainParser(results[2].toString('utf8'));
    }

    server = https.createServer(options, app);
    server.on('listening', function() {
      logger.info('now listening to https traffic on port %s', config.port);
      if (config.proxyUser) {
        logger.info('switching to user ' + config.proxyUser);
        process.setuid(config.proxyUser);
      }
      if (config.proxyGroup) {
        logger.info('switching to group ' + config.proxyGroup);
        process.setgid(config.proxyGroup);
      }
    });
    server.on('upgrade', function(req, socket, head) {
      logger.info('proxying websocket request to %s', req.headers.host);
      if (!req.authProxyRoute) return;
      var route = req.authProxyRoute;
      proxy.ws(req, res, {
        target: {
          host: route.host,
          port: route.port,
        },
      });

    });
    done();
  });
};
AuthProxy.prototype.createHttpsServer = createHttpsServer;


/**
 * Load configuration.
 *
 * @param confPath
 *   A path for the configuration file to load.
 *
 * TODO: Reset route paths somehow.
 */
function configure(confPath, done) {
  var self = this;
  var logger = this.logger;
  fs.readFile(path.join(__dirname, '..', 'default.config.yaml'), 'utf8', function(error, defaults) {
    var defaults = yaml.safeLoad(defaults);
    ConfigLoader.load(defaults, confPath, function(error, localConfig) {
      if (error) return done(error);
      // Configure Express
      app.configure(function() {
        app.set('views', path.join(__dirname, '..', 'views'));
        app.set('view engine', 'ejs');
        app.use(express.cookieParser());
        app.use(express.methodOverride());
        redisClient = redis.createClient({ host: localConfig.redisHost, port: localConfig.redisPort });
        AuthProxy.prototype.redisClient = redisClient;
        module.exports.redisClient = redisClient;
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
        app.use(lookupRoute);
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
      module.exports.config = config = localConfig;
      authenticationStrategies = [];
      passport.strategies = {};
      for (name in config.authenticationStrategies) {
        var strategyConfig = config.authenticationStrategies[name];
        // If we do not ship with a plugin by the name listed in the
        // configuration, try to require it.
        authenticationStrategies[name] = PassportPlugins[name] || require(name);
        authenticationStrategies[name].attach(passport, app, config, strategyConfig, logger);
      }

      // Clear the configured express routes and reattach them from
      // the configuration.
      app.routes = {};
      RouteLoader(app, authenticationStrategies, config);
    });
  });
}

AuthProxy.prototype.configure = configure;

/**
 * Set the routes on the app.
 */
function setRoutes(routes) {
  config.routes = routes;
}
AuthProxy.prototype.setRoutes = setRoutes;

/**
 * Set a configuration key to a given value.
 */
function configSet(name, value) {
  config[name] = value;
}
AuthProxy.prototype.configSet = configSet;


/**
 * Start the server(s).
 */
function start(done) {
  console.log(typeof this);
  var actions = [
    this.createHttpsServer,
    this.createHttpServer,
    function(cb) {
      server.listen(config.port, cb);
    }
  ];
  if (config.httpPort) {
    actions.push(function(cb) {
      httpServer.listen(config.httpPort, cb);
    });
  }
  async.series(actions, done);
}
AuthProxy.prototype.start = start;

/**
 * Stop the server(s).
 */
function stop(done) {
  var logger = this.logger;
  if (!done) {
    done = function() {};
  }
  var tasks = [];
  tasks.push(function(cb) {
    server.on('close', function() {
      logger.info('stopped https server on %s', config.port);
      cb();
    });
    server.close();
  });
  // TODO: Redis isn't sutting down properly. Why?
  /*
  tasks.push(function(cb) {
    cb();
    redisClient.quit();
  });
  */
  if (config.httpPort) {
    httpServer.on('close', function() {
    });
    tasks.push(function(cb) {
      httpServer.on('close', function() {
        logger.info('stopped http redirect server on %s', config.httpPort);
        cb();
      });
      httpServer.close();
    });
  }
  async.parallel(tasks, done);
}
AuthProxy.prototype.stop = stop;


// Check whether the url is in a white-list of paths that do
// not require authentication.
function inURLWhiteList(url) {
  var url = url.split('?')[0];
  return config.routeWhiteList.indexOf(url) !== -1;
}

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  var logger = this.logger;
  if (req.isAuthenticated() || inURLWhiteList(req.url) || (req.authProxyRoute && req.authProxyRoute.public)) {
    return next();
  }
  // Browsers often send favicon requests after the initial load.
  // We don't want to redirect people to the favicon.
  // If it's not a favicon, save the original destination
  // in the session.
  if (req.url.match('favicon.ico') == null && !inURLWhiteList(req.url) && req.session) {
    req.session.redirectTo = req.url;
  }
  var redirectDest = 'https://' + config.host + ':' + config.port + config.loginPath;
  var originalReq = req.headers.host + req.url;
  logger.info('Redirecting request for %s from IP %s to %s', originalReq, req.connection.remoteAddress, redirectDest);
  res.redirect(redirectDest);
}
AuthProxy.prototype.ensureAuthenticated = ensureAuthenticated;

// A route lookup middleware - accepts a req, looks up the route.
function lookupRoute(req, res, next) {
  req.authProxyRoute = false;
  // We shouldn't pass anything in the whitelist to the backend.
  if (inURLWhiteList(req.url)) {
    return next();
  }
  for (i in config.routes) {
    var route = config.routes[i];
    if (route.isMatch(req)) {
      req.authProxyRoute = route;
      return next();
    }
  }
  next();
}

// Rewrite the request object based on configured patterns.
function rewriteRequest(req, route) {
  route.rewriteRequest(req);
  return req;
}

// Rewrite the request to ensure that the location header is properly rewritten.
function rewriteResponse(res, route) {
  route.rewriteResponse(res);
  return res;
}

// Middleware to proxy a route.
function proxyRoute(req, res, next) {
  var logger = this.logger;
  // Lookup the route based on configuration.
  var route = req.authProxyRoute;
  if (route) {
    var originalReq = req.headers.host + req.url;

    // Rewrite the request as configured for this route.
    // TODO: Move these functions into the route object.
    req = rewriteRequest(req, route);
    res = rewriteResponse(res, route);

    // Log the route.
    var url = req.headers.url || '';
    var newRequest = route.host + ':' + route.port + url;
    var user = (req.user && req.user.email) ? req.user.email : 'Anonymous';
    var string = '%s at %s has requested %s proxying to %s';
    logger.info(string, user, req.connection.remoteAddress, originalReq, newRequest);

    // Proxy the request and response.
    proxy.on('error', function(error) {
      var message = 'There was an error proxying to the backend.';
      logger.error(message, route.name);
      /*
      // TODO: Should this be in `lib/routes.js`?
      var options = {
        name: config.name,
        imageURL: config.imageURL,
        imageAlt: config.imageAlt,
        error: error,
      };
      res.render('bad-route', options);
      */
    });
    proxy.web(req, res, {
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
}
AuthProxy.prototype.proxyRoute = proxyRoute;

module.exports = AuthProxy;
