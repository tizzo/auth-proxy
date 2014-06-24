module.exports = function(app, config) {

  // A path to login to the proxy, only accessible if you are not logged in.
  app.get(config.loginPath, function(req, res){
    if (req.isAuthenticated() && req.session.redirectTo) {
      res.redirect(req.session.redirectTo);
    }
    var options = {
      name: config.name,
      imageURL: config.imageURL,
      imageAlt: config.imageAlt
    };
    res.render('login', options);
  });

  // An index of available services and their descriptions.
  app.get('/', function(req, res) {
    var renderableRoutes = [];
    for (i in config.routes) {
      var route = config.routes[i];
      if (route.isListable()) {
        renderableRoutes.push(route);
      }
    }
    res.render('index', { name: config.name, routes: renderableRoutes });
  });

  // A route to logout the user.
  app.get('/proxy-logout', function(req, res){
    req.logout();
    res.redirect('https://' + config.host + '/');
  });


}
