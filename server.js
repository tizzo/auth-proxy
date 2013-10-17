var fs = require('fs')
  , express = require('express')
  , passport = require('passport')
  , util = require('util')
  , LocalStrategy = require('passport-local').Strategy
  , http = require('http')
  , httpProxy = require('http-proxy')
  , path = require('path');

var ConfigLoader = require('./lib/ConfigLoader');

var config = ConfigLoader.load();

var app = express();
var proxy = new httpProxy.RoutingProxy();

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

app.get('/proxy-logout', function(req, res){
  req.logout();
  res.redirect('/');
});

var options = {}
server = http.createServer(app);
server.listen(config.port, function() {
  console.log('now listening on ' + config.port);
});
