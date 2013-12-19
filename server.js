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

var proxy = new httpProxy.RoutingProxy();

var logger = new winston.Logger();
var options = {
  timestamp: true,
  colorize: true
};
logger.add(winston.transports.Console, options);

// Load configuration.
// TODO: Support specifying a configuration file path (maybe yaml?).
var ConfigLoader = require('./lib/ConfigLoader');
var config = ConfigLoader.load();

// Set the name of our process.
process.title = config.processName;

// Load the modules that do all of the work.
var app = express();
var proxy = new httpProxy.RoutingProxy();
var redisClient = null;

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
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.cookieParser());
  app.use(express.methodOverride());
  redisClient = redis.createClient({ host: config.redisHost, port: config.redisPort });
  var sessionConfig = {
    key: 'sid',
    secret: config.sessionSecret,
    store: new RedisStore({ client: redisClient })
  };
  if (config.cookieDomain) {
    console.log('setting cookie domain to ' + config.cookieDomain);
    sessionConfig.cookie = { domain: config.cookieDomain };
  }
  var session = express.session(sessionConfig)
  app.use(session);
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(lookupRoute);
  app.use(ensureAuthenticated);
  app.use(proxyRoute);
  // Allow this to be toggleable with verbose logging.
  if (config.verbose) {
    app.use(express.logger());
  }
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

// A path to login to the proxy, only accessible if you are not logged in.
app.get('/login', function(req, res){
  if (req.isAuthenticated() && req.session.redirectTo) {
    res.redirect(req.session.redirectTo);
  }
  var options = {
    name: config.name,
    imageURL: config.imageURL,
    imageAlt: config.imageAlt
  };
  res.render('login', options);
});

// An index of available services and their descriptions.
app.get('/', function(req, res) {
  var renderableRoutes = [];
  for (i in config.routes) {
    var route = config.routes[i];
    if (route.name && route.description && route.link) {
      if (route.list == undefined || (route.list != undefined && route.list == true)) {
        renderableRoutes.push(route);
      }
    }
  }
  res.render('index', { name: config.name, routes: renderableRoutes });
});

// A route to logout the user.
app.get('/proxy-logout', function(req, res){
  req.logout();
  res.redirect('https://' + config.host + '/');
});

var options = {
  key: fs.readFileSync(config.sslKey),
  cert: fs.readFileSync(config.sslCert)
};

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

// Start the server(s).
function start(done) {
  server.listen(config.port, function(error) {
    if (config.httpPort) {
      httpServer.listen(config.httpPort, done);
    }
    else {
      done(error);
    }
  });
}

// Stop the server(s).
function stop(done) {
  if (!done) {
    done = function() {};
  }
  var tasks = [];
  tasks.push(function(cb) {
    logger.info('stopping https server on %s', config.port);
    server.on('close', cb);
    server.close();
  });
  tasks.push(function(cb) {
    redisClient.quit();
    redisClient.on('end', function() {
      logger.info('redis client disconnected');
      cb();
    });
  });
  if (config.httpPort) {
    httpServer.on('close', function() {
    });
    tasks.push(function(cb) {
      logger.info('stopping http redirect server on %s', config.httpPort);
      httpServer.on('close', cb);
      httpServer.close();
    });
  }
  async.parallel(tasks, done);
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

// Check whether the url is in a white-list of paths that do
// not require authentication.
function inURLWhiteList(url) {
  var whiteList = [
    '/login',
    '/mockAuth',
    '/auth/google',
    '/oauth2callback',
    '/css/bootstrap.css'
  ];
  var url = url.split('?')[0];
  return whiteList.indexOf(url) !== -1;
}

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated() || inURLWhiteList(req.url) || (req.authProxyRoute && req.authProxyRoute.public)) {
    return next();
  }
  // Browsers often send favicon requests after the initial load.
  // We don't want to redirect people to the favicon.
  // If it's not a favicon, save the original destination
  // in the session.
  if (req.url.match('favicon.ico') == null && req.session) {
    req.session.redirectTo = req.url;
  }
  res.redirect('https://' + config.host + '/login');
}

// Accepts a req, looks up the route.
function lookupRoute(req, res, next) {
  req.authProxyRoute = false;
  // TODO: There may be a better way to do this, but we shouldn't pass
  // anything in the whitelist to the backend.
  if (inURLWhiteList(req.url)) {
    return next();
  }
  var possibleMatches = [];
  var routes = config.routes;
  for (i in routes) {
    var route = routes[i];
    var match = true;
    if (route.hostPattern && req.headers && req.headers.host) {
      var hostRegex = new RegExp(route.hostPattern);
      if (!hostRegex.test(req.headers.host)) {
        match = false;
      }
    }
    if (route.pathPattern) {
      var pathRegex = new RegExp(route.pathPattern);
      if (!pathRegex.test(req.url)) {
        match = false;
      }
    }
    if (match) {
      req.authProxyRoute = route;
      return next();
    }
  }
  next();
}

// Rewrite the request object based on configured patterns.
function rewriteRequest(req, route) {
  if (route.pathRewritePattern !== undefined) {
    var pathRewriteRegex = new RegExp(route.pathPattern);
    req.url = req.url.replace(pathRewriteRegex, route.pathRewritePattern);
  }
  if (route.hostPattern && route.hostRewritePattern) {
    var hostRewriteRegex = new RegExp(route.hostPattern)
    req.headers.host = req.headers.host.replace(hostRewriteRegex, route.hostRewritePattern);
  }
  if (req.user && req.user._json && req.user._json.email) {
    req.headers['X-Forwarded-User'] = req.user._json.email;
  }
  // Allow the auth proxy to supply basic auth for systems that require some form of auth.
  if (route.basicAuth && route.basicAuth.name && route.basicAuth.password) {
    var authString = (new Buffer(route.basicAuth.name + ':' + route.basicAuth.password, "ascii")).toString("base64");
    req.headers.Authorization = 'Basic ' + authString;
  }
  if (req.user && req.user._json && req.user._json.email) {
    req.headers['X-Forwarded-User'] = req.user._json.email;
  }
  return req;
}

// Rewrite the request to ensure that the location header is properly rewritten.
function rewriteResponse(res, route) {
  var _writeHead = res.writeHead
  var sent = false;
  res.writeHead = function() {
    if (sent) {
      logger.error('Response headers already sent but http-proxy tried to send them again.');
      res.end();
      return;
    }
    // TODO: Due to https://github.com/nodejitsu/node-http-proxy/pull/388 we
    // need to make sure we don't send headers twice.

    if (arguments[1] && arguments[1].headers && arguments[1].headers.host) {
      if (route.hostPattern && route.hostRewritePattern) {
        arguments[1].headers.host = arguments[1].headers.host.replace(route.hostPattern, route.hostRewritePattern);
      }
      if (arguments[1].location) {
        // Ensure that our location is being written with the ssl protocol.
        arguments[1].location = arguments[1].location.replace(/^http:/, 'https:');
      }
    }
    sent = true;
    _writeHead.apply(this, arguments);
  };
  return res;
}

// Middleware to proxy a route.
function proxyRoute(req, res, next) {
  // Lookup the route based on configuration.
  var route = req.authProxyRoute;
  if (route) {
    var originalReq = req.headers.host + req.url;
    // Rewrite the request as configured for this route.
    req = rewriteRequest(req, route);
    res = rewriteResponse(res, route);
    var newRequest = route.host + ':' + route.port + req.url;
    if (req.user && req.user._json && req.user._json.email) {
      logger.info('%s at %s has requested %s proxying to %s', req.user._json.email, req.connection.remoteAddress, originalReq, newRequest);
    }
    else {
      logger.info('Annonymous at %s has requested %s proxying to %s', req.connection.remoteAddress, originalReq, newRequest);
    }
    // Proxy the request and response.
    proxy.proxyRequest(req, res, {
      host: route.host,
      port: route.port,
      enable: {
        xforward: true
      }
    });
    return;
  }
  return next();
}

module.exports = {};
module.exports.app = app;
module.exports.passport = passport;
module.exports.config = config;
module.exports.server = server;
module.exports.logger = logger;
module.exports.start = start;
module.exports.stop = stop;

