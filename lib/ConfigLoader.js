
var fs = require('fs');
var path = require('path');
var util = require('util');
var async = require('async');
var yaml = require('js-yaml');

module.exports.logErrors = true;

module.exports.load = function(confPath) {
  // Load defaults from our default configuration file.
  var config = require(path.join('..', 'default.config'));
  if (fs.existsSync(confPath)) {
    var overrides = JSON.parse(fs.readFileSync(confPath, 'utf8'));
    for (i in overrides) {
      config[i] = overrides[i];
    }
  }
  // If environment variables exist, override default values with env vars.
  for (item in config) {
    // Covert camel case into environment variables (into all upper with
    // underscores).
    var environmentVariableName = item.replace(/[A-Z]/g, function(match) { return '_' + match}).toUpperCase();
    if (process.env[environmentVariableName]) {
      config[item] = process.env[environmentVariableName];
    }
  }
  return config;
};

module.exports.loadDirAsArray = function(dir, done) {
  fs.readdir(dir, function(error, files) {
    if (error) throw error;
    var files = files.map(function(file) { return path.join(dir, file); });
    var outputConfig = [];
    async.map(files, function(file, cb){ fs.readFile(file, 'utf8', cb) }, function(error, confs) {
      for (i in confs) {
        outputConfig.push(yaml.safeLoad(confs[i]));
      }
      done(null, outputConfig);
    });
  });
};

module.exports.loadDirAsMergedObject = function(dir, done) {
  var config = {};
  fs.readdir(dir, function(error, files) {
    if (error) throw error;
    var files = files.map(function(file) { return path.join(dir, file); });
    async.map(files, function(file, cb){ fs.readFile(file, 'utf8', cb) }, function(error, confs) {
      var config = {};
      for (i in confs) {
        conf = yaml.safeLoad(confs[i]);
        mergeConifguration(config, conf);
      }
      done(error, config);
    });
  });
};

/**
 * Merge two confiugration objects overriding values on the first with values on
 * the second.
 */
var mergeConifguration = function(one, two) {
  for (i in two) {
    if (two.hasOwnProperty(i)) {
      one[i] = two[i];
    }
  }
  return one;
};
