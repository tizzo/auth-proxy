var fs = require('fs')
  , express = require('express')
  , passport = require('passport')
  , util = require('util')
  , LocalStrategy = require('passport-local').Strategy
  , http = require('http')
  , httpProxy = require('http-proxy')
  , path = require('path')
  , GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;

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

// Use the GoogleStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and Google
//   profile), and invoke a callback with a user object.
passport.use(new GoogleStrategy({
    clientID: config.googleClientId,
    clientSecret: config.googleClientSecret,
    callbackURL: "http://" + config.host + ":" + config.port + "/oauth2callback"
  },
  function(accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function () {
      // To keep the example simple, the user's Google profile is returned to
      // represent the logged-in user.  In a typical application, you would want
      // to associate the Google account with a user record in your database,
      // and return that user instead.
      return done(null, profile);
    });
  }
));

// configure Express
app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.logger());
  app.use(express.cookieParser());
  app.use(express.methodOverride());
  var sessionConfig = {
    key: 'sid',
    secret: config.sessionSecret
  };
  var session = express.session(sessionConfig)
  app.use(session);
  // Initialize Passport!  Also use passport.session() middleware, to support
  // persistent login sessions (recommended).
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});
app.get('/login', function(req, res){
  res.render('login', {name: config.name, imageURL: config.imageURL, imageAlt: config.imageAlt});
});

// We add the express bodyparser middleware here so that we don't
// intercept posts in any other context.
app.post('/login', express.bodyParser(),
  passport.authenticate('local', { failureRedirect: '/proxy-login', failureFlash: true }),
  function(req, res) {
    res.redirect('/');
  }
);

app.get('/account', ensureAuthenticated, function(req, res){
  console.log(req.user);
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

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.route.path = '/login' || req.isAuthenticated()) { return next(); }
  res.redirect('/login');
}
