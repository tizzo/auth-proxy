var should = require('should');
var path = require('path');
var app = require('../index');

var ConfigLoader = app.ConfigLoader;

describe('ConfigLoader', function() {
  describe('loadDir', function() {
    it ('should combine config objects', function(done) {
      var configDir = path.resolve(path.join('.', 'test', 'fixtures', 'config-dir'));
      ConfigLoader.logErrors = false;
      ConfigLoader.loadDir(configDir, function(error, conf) {
        should.exist(conf);
        conf.foo.should.equal('bar');
        conf.bar.should.equal('bot');
        conf.plink.should.equal('plunk');
        done(error);
      });
    });
  });
});
