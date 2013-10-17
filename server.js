var fs = require('fs')
  , express = require('express')
  , passport = require('passport')
  , util = require('util')
  , LocalStrategy = require('passport-local').Strategy
  , https = require('https')
  , httpProxy = require('http-proxy')
  , path = require('path');

var ConfigLoader = require('./lib/ConfigLoader');

var config = ConfigLoader.load();


console.log(config);

var app = express();
var proxy = new httpProxy.RoutingProxy();

// configure Express
app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.logger());
  app.use(express.cookieParser());
  app.use(express.methodOverride());
  app.use(express.session({ key: 'sid', cookie: { domain: config.cookieDomain }, secret: config.sessionSecret }));
  // Initialize Passport!  Also use passport.session() middleware, to support
  // persistent login sessions (recommended).
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.get('/login', function(req, res){
  res.render('login', { user: req.user, message: req.flash('error') });
});

// We add the express bodyparser middleware here so that we don't
// intercept posts in any other context.
app.post('/login', express.bodyParser(),
  passport.authenticate('local', { failureRedirect: '/proxy-login', failureFlash: true }),
  function(req, res) {
    res.redirect('/');
  }
);

app.get('/proxy-logout', function(req, res){
  req.logout();
  res.redirect('/');
});

server = https.createServer(options, app);
server.listen(config.port);
