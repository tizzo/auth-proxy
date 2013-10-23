var fs = require('fs')
  , express = require('express')
  , passport = require('passport')
  , util = require('util')
  , LocalStrategy = require('passport-local').Strategy
  , http = require('http')
  , httpProxy = require('http-proxy')
  , path = require('path')
  , GoogleStrategy = require('passport-google-oauth').OAuth2Strategy
  , redis = require('redis')
  , RedisStore = require('connect-redis')(express);

var ConfigLoader = require('./lib/ConfigLoader');

var config = ConfigLoader.load();

var app = express();
var proxy = new httpProxy.RoutingProxy();

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

// Check to see if the user profile is in an allowed domian.
function inAllowedDomain(profile) {
  return config.allowedDomains.indexOf(profile._json.hd) !== -1;
}
// Check to see if the user profile is in an allowed email list.
function inAllowedEmails(profile) {
  return config.allowedEmails.indexOf(profile._json.email) !== -1;
}

// Use the GoogleStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and Google
//   profile), and invoke a callback with a user object.
passport.use(new GoogleStrategy({
    clientID: config.googleClientId,
    clientSecret: config.googleClientSecret,
    callbackURL: "http://" + config.host + ":" + config.port + "/oauth2callback",
    failureRedirect: "login"
  },
  function(accessToken, refreshToken, profile, done) {
    if (!inAllowedDomain(profile) || !inAllowedEmails(profile)) {
      return done(null, null);
    }
    return done(null, profile);
  }
));

// configure Express
app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  //app.use(express.logger());
  app.use(express.cookieParser());
  app.use(express.methodOverride());
  var sessionConfig = {
    key: 'sid',
    secret: config.sessionSecret,
    store: new RedisStore({ host: config.redisHost, port: config.redisPort })
  };
  var session = express.session(sessionConfig)
  app.use(session);
  // Initialize Passport!  Also use passport.session() middleware, to support
  // persistent login sessions (recommended).
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(ensureAuthenticated);
  app.use(proxyRoute);
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});
app.get('/login', function(req, res){
  var options = {
    name: config.name,
    imageURL: config.imageURL,
    imageAlt: config.imageAlt
  };
  res.render('login', options);
});

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
app.get('/auth/google',
  passport.authenticate('google', { scope: ['https://www.googleapis.com/auth/userinfo.profile',
                                            'https://www.googleapis.com/auth/userinfo.email'] }),
  function(req, res){
    // The request will be redirected to Google for authentication, so this
    // function will not be called.
  });

// GET /auth/google/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/oauth2callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });



app.get('/proxy-logout', function(req, res){
  req.logout();
  res.redirect('/');
});

var options = {}
server = http.createServer(app);
server.listen(config.port, function() {
  console.log('now listening on ' + config.port);
});

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
  res.redirect('/login');
}

http.createServer(function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.write('request successfully proxied: ' + req.url +'\n' + JSON.stringify(req.headers, true, 2));
        res.end();
}).listen(9000); 

var proxy = new httpProxy.RoutingProxy();

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
    if (route.path) {
      var pathRegex = new RegExp(route.path);
      if (!pathRegex.test(req.url)) {
        match = false;
      }
    }
    if (match) {
      return route;
    }
  }
}

function rewriteRequest(req, res, route) {
  if (route.pathRewritePattern !== undefined) {
    var pathRewriteRegex = new RegExp(route.path);
    req.url = req.url.replace(pathRewriteRegex, route.pathRewritePattern);
  }
  if (route.hostPattern && route.hostRewritePattern) {
    var hostRewriteRegex = new RegExp(route.hostPattern)
    req.headers.host = req.headers.host.replace(hostRewriteRegex, route.hostRewritePattern);
  }
  return req;
}

function proxyRoute(req, res, next) {
  var route = lookupRoute(req);
  if (route) {
    req = rewriteRequest(req, res, route);
    proxy.proxyRequest(req, res, {
      host: route.host,
      port: route.port
    });
    return;
  }
  return next();
}
