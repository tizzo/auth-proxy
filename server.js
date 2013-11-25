var fs = require('fs')
  , express = require('express')
  , passport = require('passport')
  , util = require('util')
  , LocalStrategy = require('passport-local').Strategy
  , https = require('https')
  , http = require('http')
  , httpProxy = require('http-proxy')
  , path = require('path')
  , GoogleStrategy = require('passport-google-oauth').OAuth2Strategy
  , redis = require('redis')
  , RedisStore = require('connect-redis')(express)
  , winston = require('winston');

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

// Dead simple serialization does not actually save user info.
passport.serializeUser(function(user, done) {
  done(null, user);
});

// Dead simple serialization does not actually load user info.
passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

// Check to see if the user profile is in an allowed domian.
function inAllowedDomains(domain) {
  return config.allowedDomains.indexOf(domain) !== -1;
}

// Check to see if the user profile is in an allowed email list.
function inAllowedEmails(email) {
  return config.allowedEmails.indexOf(email) !== -1;
}

// Use the GoogleStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and Google
//   profile), and invoke a callback with a user object.
passport.use(new GoogleStrategy({
    clientID: config.googleClientId,
    clientSecret: config.googleClientSecret,
    callbackURL: "https://" + config.host + ":" + config.port + "/oauth2callback",
    failureRedirect: "login"
  },
  function(accessToken, refreshToken, profile, done) {
    // TODO: Improve serialize/deserialize so we don't use naked _json here.
    if (!inAllowedDomains(profile._json.hd)) {
      logger.info('user from domain %s denied access to requested resource', profile._json.hd);
      return done(null, null);
    }
    // TODO: Improve serialize/deserialize so we don't use naked _json here.
    if (!inAllowedEmails(profile._json.email)) {
      logger.info('%s denied access to requested resource', profile._json.email);
      return done(null, null);
    }
    return done(null, profile);
  }
));

// Configure Express
app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.cookieParser());
  app.use(express.methodOverride());
  var sessionConfig = {
    key: 'sid',
    secret: config.sessionSecret,
    store: new RedisStore({ host: config.redisHost, port: config.redisPort })
  };
  var session = express.session(sessionConfig)
  app.use(session);
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(ensureAuthenticated);
  app.use(proxyRoute);
  app.use(express.logger());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

// A path to login to the proxy, only accessible if you are not logged in.
app.get('/login', function(req, res){
  if (req.isAuthenticated()) {
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
  res.render('index', { name: config.name, routes: config.routes });
});

app.get('/account', function(req, res){
  res.render('account', { user: req.user });
});

// GET /auth/google
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Google authentication will involve
//   redirecting the user to google.com.  After authorization, Google
//   will redirect the user back to this application at /auth/google/callback
var googleConf = {
  scope: [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
  ]
};
app.get('/auth/google', passport.authenticate('google', googleConf));

// GET /auth/google/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/oauth2callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    if (req.session.redirectTo) {
      res.redirect(req.session.redirectTo);
    }
    else {
      res.redirect('/');
    }
  }
);

// A route to logout the user.
app.get('/proxy-logout', function(req, res){
  req.logout();
  res.redirect('/');
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
  res.end();
});
httpServer.on('listening', function() {
  var message = 'now redirecting http requests on port %d to https on port %s';
  logger.info(message, config.httpPort, config.port);
});

// Start the server(s).
function start() {
  if (config.httpPort) {
    httpServer.listen(config.httpPort);
  }
  server.listen(config.port);
}

// Stop the server(s).
function stop() {
  server.close(function() {
    logger.info('stopping https server on %s', config.port);
  });
  if (config.httpPort) {
    httpServer.close(function() {
      logger.info('stopping http redirect server on %s', config.httpPort);
    });
  }
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
  if (req.isAuthenticated() || inURLWhiteList(req.url)) {
    return next();
  }
  // TODO: Is there a better way to find people using favicons?
  if (req.url.match('favicon.ico') == null) {
    req.session.redirectTo = req.url;
  }
  res.redirect('/login');
}

// Accepts a req, looks up the route.
function lookupRoute(req) {
  var possibleMatches = [];
  var routes = config.routes;
  for (i in routes) {
    var route = routes[i];
    var match = true;
    if (route.hostPattern && req.location) {
      var hostRegex = new RegExp(route.hostPattern);
      if (!hostRegex.test(req.location)) {
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
      return route;
    }
  }
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
  req.headers['X-Forwarded-User'] = req.user._json.email;
  // Allow the auth proxy to supply basic auth for systems that require some form of auth.
  if (route.basicAuth && route.basicAuth.name && route.basicAuth.password) {
    var authString = (new Buffer(route.basicAuth.name + ':' + route.basicAuth.password, "ascii")).toString("base64");
    req.headers.Authorization = 'Basic ' + authString;
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

    if (arguments[1].location) {
      if (route.hostPattern && route.hostRewritePattern) {
        arguments[1].location = arguments[1].location.replace(route.hostPattern, route.hostRewritePattern);
      }
      // Ensure that our location is being written with the ssl protocol.
      arguments[1].location = arguments[1].location.replace(/^http:/, 'https:');
    }
    sent = true;
    _writeHead.apply(this, arguments);
  };
  return res;
}

// Middleware to proxy a route.
function proxyRoute(req, res, next) {
  // Lookup the route based on configuration.
  var route = lookupRoute(req);
  if (route) {
    var originalReq = req.headers.host + req.url;
    // Rewrite the request as configured for this route.
    req = rewriteRequest(req, route);
    res = rewriteResponse(res, route);
    var newRequest = route.host + ':' + route.port + req.url;
    logger.info('%s at %s has requested %s proxying to %s', req.user._json.email, req.connection.remoteAddress, originalReq, newRequest);
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
module.exports.config = config;
module.exports.server = server;
module.exports.logger = logger;
module.exports.start = start;
module.exports.stop = stop;

