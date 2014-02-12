
var fs = require('fs');
var path = require('path');
var util = require('util');

module.exports.logErrors = true;

module.exports.load = function() {
  // Load defaults from our default configuration file.
  var config = require(path.join('..', 'default.config'));
  // If a confg file exists, override the defaults with values
  // from that file.
  var confPath = path.join(__dirname, '..', 'config.json');
  if (fs.existsSync(confPath)) {
    var overrides = JSON.parse(fs.readFileSync(confPath, 'utf8'));
    for (i in overrides) {
      config[i] = overrides[i];
    }
  }
  // If environment variables exist, override default values with env vars.
  for (item in config) {
    // Covert camel case into environment variables (all upper with underscores).
    var environmentVariableName = item.replace(/[A-Z]/g, function(match) { return '_' + match}).toUpperCase();
    if (process.env[environmentVariableName]) {
      config[item] = process.env[environmentVariableName];
    }
  }
  return config;
}

module.exports.loadDir = function(dir, done) {
  fs.readdir(dir, function(error, files) {
    var conf = {};
    for (i in files) {
      var newlyLoadedConf = null;
      var filePath = path.join(dir, files[i]);
      try {
        newlyLoadedConf = require(filePath);
        for (prop in newlyLoadedConf) {
          conf[prop] = newlyLoadedConf[prop];
        }
      }
      catch (e) {
        if (module.exports.logErrors) {
          console.error('Could not parse ', filePath);
        }
      }
    }
    done(null, conf);
  });
}
