'use strict';
var DStrategy = require('passport-drupal').DrupalStrategy;

module.exports = {};
/* istanbul ignore next: we can't really unit test this  */
module.exports.attach = function(passport, app, config, pluginConfig, logger) {
  var options = {
    consumerKey: pluginConfig.consumerKey, 
    consumerSecret: pluginConfig.consumerSecret,
    providerURL: pluginConfig.providerURL, 
    resourceEndpoint: config.resourceEndpoint, // <---- optional. Defaults to `rest/system/connect`
    callbackURL: config.host + ":" + config.port + "/auth/drupal/callback",
    requestTokenURL: pluginConfig.requestTokenURL,
    accessTokenURL: pluginConfig.accessTokenURL,
    userAuthorizationURL: pluginConfig.userAuthorizationURL,
    resourceURL: pluginConfig.resourceURL
  };
  var profileUnpacker = function(token, tokenSecret, profile, done) {
    profile.oauth = { token: token, token_secret: tokenSecret };
    done(null, profile);
  };
  var strategy = new DStrategy(options, profileUnpacker);
  passport.use();

  config.routeWhiteList.push('/auth/drupal');
  config.routeWhiteList.push('/auth/drupal/callback');

  app.get('/auth/drupal',
    passport.authenticate('drupal'),
    function(req, res) {
      // The request will be redirected to the Drupal website for
      // authentication, so this function will not be called.
    }
  );

  app.get('/auth/drupal/callback',
    passport.authenticate('drupal', { failureRedirect: config.loginPath }),
    function(req, res) {
      if (req.session.redirectTo) {
          res.redirect(req.session.redirectTo);
      }
      else{
          res.redirect('/');
      }
  });
  
  app.get('/error', function(req, res) {
    res.writeHead(200);
    res.end("Could not sign in");
  });
}
module.exports.renderLogin = function() {
  return '<a href="/auth/drupal">Login with Drupal</a>';
};

