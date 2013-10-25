
var fs = require('fs'),
    path = require('path');

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
