
var fs = require('fs');
var path = require('path');
var util = require('util');
var async = require('async');
var yaml = require('js-yaml');

module.exports.logErrors = true;

/**
 * Load configuration from the default file, override it with confuration from a
 * path, and then merge that with environment variables.
 */
module.exports.load = function(confPath, done) {
  // Load defaults from our default configuration file.
  var config = require(path.join('..', 'default.config'));
  var tasks = [];
  tasks.push(fs.readFile.bind(fs, path.join(__dirname, '..', 'default.config.json'), 'utf8'));
  tasks.push(function(defaults, cb) {
    config = JSON.parse(defaults);
    cb();
  });
  if (typeof confPath === 'string') {
    tasks.push(function(cb) {
      fs.exists(confPath, function(exists) {
        if (exists) {
          fs.readFile(confPath, 'utf8', function(error, data) {
            config = mergeConifguration(config, JSON.parse(data));
            return cb(null);
          });
        }
        else {
          cb(null);
        }
      });
    });
  }
  // If environment variables exist, override default values with env vars.
  tasks.push(function(cb) {
    for (item in config) {
      // Covert camel case into environment variables (into all upper with
      // underscores).
      var replacer = function(match) { return '_' + match};
      var envVariableName = item.replace(/[A-Z]/g, replacer).toUpperCase();
      if (process.env[envVariableName]) {
        config[item] = process.env[envVariableName];
      }
    }
    cb(null, config);
  });
  async.waterfall(tasks, done);
};

/**
 * Load a directory of yaml files into an array of those object.
 */
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

/**
 * Load a direcotry of configuration and mergethe items into one object.
 */
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
