# Authenitcating Proxy

[![Build Status](https://travis-ci.org/tizzo/auth-proxy.png?branch=master)](https://travis-ci.org/tizzo/auth-proxy)
[![Coverage Status](https://coveralls.io/repos/tizzo/auth-proxy/badge.png)](https://coveralls.io/r/tizzo/auth-proxy)

**STATUS - This project is under active development and while it is currently functional it is not yet stable or properly documented, I'll keep the README up to date as this project takes shape.**

This module is a little bit of glue wrapping [express](http://expressjs.com/), [passport](http://passportjs.org/), and [HTTP Proxy](https://github.com/nodejitsu/node-http-proxy).  It allows you to setup a simple reverse proxy server to provide authentication for otherwise unsecured services in your infrastructure. It currently ships with authentication using either [Google apps oauth2](http://npmjs.org/package/passport-google-oauth). You must add apps domains and allowed users to a whitelist before anyone can authenticate, you'll also need to define your proxy routes before auth-proxy does anything useful for you.

Pull requests adding support for other authentication strategies are most welcome.

## Installation

1. Clone the repo
2. `cd` into the directory and run `npm install`
3. Create a config.yaml in the root of the repository, any configuration added to this yaml file will override the defaults (set in `default.config.yaml`)
4. Setup your authentication strategies in the config.yaml file.  See `examples/config` for more.
5. Setup your routes in config.yaml (see the documentation and examples below).
6. Verify that you have your configuration correct by starting the server with `npm start`.
7. Copy and edit the appropriate init script from the init directory to your system daemon.

### Configuring

The `default.config.yaml` file holds the default configuration used by the proxy. If a `config.yaml` file is created in the root of the repository then any keys set will override defaults set in the default configuration file. Environment variables will override anything set in the configuration files. Environment variables can be set for any configuration key but are converted (all capital letters with underscores rather than camel case).

### Defining Routes

The routes configuration key is an array of route objects. This list of routes is searched (in the order they are defined) when any incomming request is received in the proxy. A path and/or a hostname are checked (if configured - both optional) and the first matching route is used. For a small performance gain the most commonly used routes should probably be at the beginning of the list.

#### Required configuration keys

- `host` The host to proxy matching requests to.
- `port` The port at `host` to route the requests to.

#### Optional configuration keys

- `name` A name for the route; used on the index page to list this service.
- `description` A description for the route; used on the index page.
- `link` Used on the index page to link to this resource. This can be relative if paths are used to match or absolute for hosts.
- `pathPattern` A regex of the path to match, usually this should start with a `^/` (to match only instances at the beginning of the path and end with `/?` to optionally allow a trailing slash.
- `hostPattern` A regex to search for host to match for incomming routes. This allows you to route to different applications based on host name.
- `pathRewritePattern` This rewrites the request path sent to the backend used for this route. This may use regex matches from the `pathPattern` setting in normal javascript `replace()` syntax.
- `hostRewritePattern` This rewrite the request host sent in the headers to the backend for this route. Like `pathRewritePattern` this may use tokens from the `hostPattern` regex as per the normal javascript `replace()` syntax.
- `basicAuth` An object with attributes of `name` and `password`. This will be added as http basic auth for all requests proxied through this route.

#### Configuration example

```yaml
routes:
  - name: "Jenkins"
    description: "An extendable open source continuous integration server."
    host: localhost
    port: 8080
    pathPattern: "^/jenkins/?"
    link: /jenkins
  - name: "Jenkins Git Calback"
    description: A brutal task master
    pathRewritePattern: /
    host: localhost
    port: 8080
    pathPattern: "^/jenkins/?"
  - name: test route
    pathPattern: "/test/?"
    description: debug info
    pathRewritePattern: "/"
    host: localhost
    hostPattern: 127.0.0.1
    link: test
    hostRewritePattern: fooozbazzzz
    port: 8989
```

## Authentication Strategy Plugins

Auth-proxy uses a plugin system for authentication strategies which are pluggable.  It ships with a couple of strategies but if a strategy is specified
in configuration that is not found when requiring `lib/plugins/index.js` than a global require will be attempted.

### Built in strategies

  1. Google OAuth 2
  2. Mock Strategy

### Writing a Passport Authentication Strategy Plugin 

An auth-proxy strategy plugin is a simple wrapper around the passport strategy responsible for receiving it's configuration,
instantiating the underlying passport plugin, registering any necessary express routes, and rendering whatever widget needs to
appear on the login page.

#### Required methods:

##### 1. attach()

``` javasctipt
attach = function(passport, app, config, logger) {}
```

**Parameters:**

  - `passport`: The instantiated and configured passport object.
  - `app`: The express app object, use this to register new routes needed for authentication.
  - `config`: The configuration for this specific plugin.
  - `logger`: The instantiated and configured [winston](https://www.npmjs.org/package/winston) logger object.

##### 2. renderLogin()

Render login is responsible for rendering the necessary logn widget for the login page. It receives no parameters and if the module needs to use configurationfor this portion it should be retained from the `attach()` call which will always run first.
