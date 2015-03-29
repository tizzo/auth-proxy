'use strict';
module.exports = function(app, authenticationStrategies, config) {

  // A path to login to the proxy, only accessible if you are not logged in.
  app.get(config.loginPath, function(req, res){
    if (req.isAuthenticated() && req.session.redirectTo) {
      res.redirect(req.session.redirectTo);
    }
    var options = {
      name: config.name,
      imageURL: config.imageURL,
      imageAlt: config.imageAlt,
      strategies: [],
    };
    var strategy = null;
    for (strategy in authenticationStrategies) {
      options.strategies.push(authenticationStrategies[strategy].renderLogin());
    }
    res.render('login', options);
  });

  // An index of available services and their descriptions.
  app.get(config.indexPath, function(req, res) {
    var renderableRoutes = [];
    var i = null;
    for (i in config.routes) {
      var route = config.routes[i];
      if (route.isListable()) {
        renderableRoutes.push(route);
      }
    }
    var options = {
      name: config.name,
      routes: renderableRoutes
    };
    res.render('index', options);
  });

  // A route to logout the user.
  app.get(config.logoutPath, function(req, res){
    req.logout();
    var host = config.host;
    if (config.port !== '443') {
      host = host + ':' + config.port;
    }
    res.redirect('https://' + host + '/');
  });

  app.get('/error', function(req, res) {
    res.writeHead(200);
    res.end("Could not sign in");
  });

}
