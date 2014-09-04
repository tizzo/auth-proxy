
GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;

module.exports = {};
module.exports.attach = function(passport, app, config, pluginConfig, logger) {
  // Check to see if the user profile is in an allowed domian.
  function inAllowedDomains(domain) {
    var checkDomains = pluginConfig.allowedDomains ? true : false;
    return checkDomains && pluginConfig.allowedDomains.indexOf(domain) !== -1;
  }

  // Check to see if the user profile is in an allowed email list.
  function inAllowedEmails(email) {
    var checkEmails = pluginConfig.allowedEmails ? true : false;
    return checkEmails && pluginConfig.allowedEmails.indexOf(email) !== -1;
  }


  // Use the GoogleStrategy within Passport.
  //   Strategies in Passport require a `verify` function, which accept
  //   credentials (in this case, an accessToken, refreshToken, and Google
  //   profile), and invoke a callback with a user object.
  passport.use(new GoogleStrategy({
      clientID: pluginConfig.googleClientId,
      clientSecret: pluginConfig.googleClientSecret,
      callbackURL: "https://" + config.host + ":" + config.port + "/oauth2callback",
      failureRedirect: "login"
    },
    function(accessToken, refreshToken, profile, done) {
      if (!inAllowedDomains(profile._json.hd)) {
        logger.info('user from domain %s denied access to requested resource', profile._json.hd);
        return done(null, null);
      }
      if (!inAllowedEmails(profile._json.email)) {
        logger.info('%s denied access to requested resource', profile._json.email);
        return done(null, null);
      }
      var user = {
        email: profile._json.email,
        domain: profile._json.hd,
      };
      return done(null, user);
    }
  ));


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
};

module.exports.renderLogin = function() {
  return '<a href="/auth/google">Login with Google</a>';
};
