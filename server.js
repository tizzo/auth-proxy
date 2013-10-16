var fs = require('fs')
  , express = require('express')
  , passport = require('passport')
  , util = require('util')
  , LocalStrategy = require('passport-local').Strategy
  , https = require('https')
  , httpProxy = require('http-proxy')
  , path = require('path');

var ConfigLoader = require('./lib/ConfigLoader');

var config = ConfigLoader.load();


console.log(config);

var app = express();
var proxy = new httpProxy.RoutingProxy();
