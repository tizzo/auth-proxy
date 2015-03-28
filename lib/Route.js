
var Route = function(options) {
  var item = null;
  for (item in options) {
    this[item] = options[item];
  }
  this.isMatch = this.isMatch.bind(this);
  this.hostMatches = this.hostMatches.bind(this);
  this.pathMatches = this.pathMatches.bind(this);
}

Route.prototype.name = '';
Route.prototype.description = '';
Route.prototype.host = '';
Route.prototype.port = '';
Route.prototype.link = '';

Route.prototype.pathPattern = false;
Route.prototype.hostPattern = false;
Route.prototype.pathRewritePattern = null;
Route.prototype.hostRewritePattern = null;
Route.prototype.requireAuth = true;

// Whether this route should be listed on the list page.
Route.prototype.list = true;

// Whether to this route should be accessible without authetnicating.
Route.prototype.public = false;

// Check all relevant attributes of the request to determine whether this
// route is a match.
Route.prototype.isMatch = function(request) {
  var route = this;
  // We default to assuming that we have a match.
  var match = true;
  if (!this.hostMatches(request)) {
    match = false;
  }
  if (!this.pathMatches(request)) {
    match = false;
  }
  return match;
};

// Check to see if the host matches this configured pattern.
Route.prototype.hostMatches = function(request) {
  if (this.hostPattern && request.headers && request.headers.host) {
    var hostRegex = new RegExp(this.hostPattern);
    if (hostRegex.test(request.headers.host)) {
      return true;
    }
    return false;
  }
  else {
    return true;
  }
};

// Check to see if the path matches this configured pattern.
Route.prototype.pathMatches = function(request) {
  if (this.pathPattern) {
    var pathRegex = new RegExp(this.pathPattern);
    if (pathRegex.test(request.url)) {
      return true;
    }
    return false;
  }
  else {
    return true;
  }
};

Route.prototype.rewriteRequest = function(request) {
  if (this.pathRewritePattern !== null) {
    var pathRewriteRegex = new RegExp(route.pathPattern);
    request.url = request.url.replace(pathRewriteRegex, this.pathRewritePattern);
  }
  if (this.hostPattern && this.hostRewritePattern) {
    var hostRewriteRegex = new RegExp(this.hostPattern)
    request.headers.host = request.headers.host.replace(hostRewriteRegex, this.hostRewritePattern);
  }
  if (request.user && request.user.email) {
    request.headers['X-Forwarded-User'] = request.user.email;
  }
  request.headers['X-Forwarded-Proto'] = 'https';
  // Allow the auth proxy to supply basic auth for systems that require some form of auth.
  if (this.basicAuth && this.basicAuth.name && this.basicAuth.password) {
    var authString = (new Buffer(this.basicAuth.name + ':' + this.basicAuth.password, "ascii")).toString("base64");
    request.headers.Authorization = 'Basic ' + authString;
  }
  if (request.user && request.user.email) {
    request.headers['X-Forwarded-User'] = request.user.email;
  }
  return request;
};

// Rewrite the request to ensure that the location header is properly rewritten.
Route.prototype.rewriteResponse = function(response) {
  var self = this;
  var _writeHead = response.writeHead
  var sent = false;
  response.writeHead = function() {
    if (sent) {
      logger.error('Response headers already sent but http-proxy tried to send them again.');
      response.end();
      return;
    }
    // TODO: Due to https://github.com/nodejitsu/node-http-proxy/pull/388 we
    // need to make sure we don't send headers twice.
    // TODO: Can we just catch the error?
    if (arguments[1] && arguments[1].headers && arguments[1].headers.host) {
      if (self.hostPattern && self.hostRewritePattern) {
        arguments[1].headers.host = arguments[1].headers.host.replace(self.hostPattern, self.hostRewritePattern);
      }
    }
    if (arguments[1] && arguments[1].location) {
      // Ensure that our location is being written with the ssl protocol.
      arguments[1].location = arguments[1].location.replace(/^http:/, 'https:');
      if (self.hostPattern && self.hostRewritePattern) {
        arguments[1].location = arguments[1].location.replace(self.hostPattern, self.hostRewritePattern);
      }
    }
    sent = true;
    _writeHead.apply(this, arguments);
  };
  return response;
};

// Check to see whether this route should be included in the list of available services.
Route.prototype.isListable = function() {
  return (this.name !== '' && this.description !== '' && this.link !== '' && this.list);
}

module.exports = Route;
