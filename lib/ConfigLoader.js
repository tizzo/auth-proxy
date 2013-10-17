
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
  for (i in config) {
    if (process.env[i.toUpperCase()]) {
      config[i] = process.env[i.toUpperCase()];
    }
  }
  return config;
}
