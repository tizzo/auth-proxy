
var Route = function(options) {
  for (item in options) {
    this[item] = options[item];
  }
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

module.exports = Route;
