var util = require('util');
var passport = require('passport');
var MockStrategy = function(options, verify) {
  this.name = 'mock';
  this.verify = function(cb) {
    cb();
  };
};
util.inherits(MockStrategy, passport.Strategy);
MockStrategy.prototype.name = 'mockSession';
MockStrategy.prototype.authenticate = function(req, res) {
  if (req.headers.authenticated) {
    var user = {
      _json: {
        email: 'homer@simpson.com'
      }
    };
    this.success(user, user);
  }
  else {
    this.fail(new Error('User failed to auth'));
  }
};
module.exports = {};
module.exports.MockStrategy = MockStrategy;


module.exports.attach = function(passport, app, config, logger) {
  console.log('attach');
  passport.use(new MockStrategy({}));
  app.get('/mockAuth', passport.authenticate('mock'), function(req, res, next) {
    console.log(req);
    res.redirect('/');
  });
  return this;
};

module.exports.renderLogin = function() {
  return 'Set the <code>`authenticated`</code> header and <a href="mockAuth">then you can login</a>.';
};
