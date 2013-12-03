var util = require('util');
var passport = require('passport');
var MockStrategy = function(options, verify) {
  this.name = 'mock';
  this.verify = function(cb) {
    console.log(arguments);
    cb();
  };
};
util.inherits(MockStrategy, passport.Strategy);
MockStrategy.prototype.name = 'mockSession';
MockStrategy.prototype.authenticate = function(req) {
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
