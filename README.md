# Authenitcating Proxy

**STATUS - This project is under active development and while it is currently functional it is not yet table or properly documented, I'll keep the README up to date as this project takes shape.**

This module is a little bit of glue wrapping [express](http://expressjs.com/), [passport](http://passportjs.org/), and [HTTP Proxy](https://github.com/nodejitsu/node-http-proxy).  It allows you to setup a simple reverse proxy server to provide authentication for otherwise unsecured services in your infrastructure. It currently ships with integration with single signon using google apps oauth2. You must add apps domains and allowed users to a whitelist before anyone can authenticate, you'll also need to define your proxy routes.

Patches adding support for other authentication strategies are most welcome.

## Installation

1. Clone the repo
2. `cd` into the directory and run `npm install`
3. Create a config.json in the root of the repository, any configuration added to this json file will override the defaults (set in `default.config.json`)
4. Setup your domain and email white lists and add your google apps credentials to the config.json file.
5. Setup your routes in config.json (see the documentation and examples below).
6. Start the server with `npm start`

### Configuring

The `default.config.json` file holds the default configuration used by the proxy. If a `config.json` file is created in the root of the repository then any keys set will override defaults set in the default configuration file. Environment variables will override anything set in the configuration files. Environment variables can be set for any configuration key but are converted (all capital letters with underscores rather than camel case.

### Defining Routes

The routes configuration key is an array of route objects. This list of routes is searched (in the order they are defined) when any incomming request is received in the proxy. A path and/or a hostname are checked (if configured - both optional) and the first matching route is used. For a small performance gain the most commonly used routes should probably be at the beginning of the list.

#### Required configuration keys

- `name` A name for the route
- `description` A description for the route.
- `host` The host to proxy matching requests to.
- `port` The port at `host` to route the requests to.
- `link` This is used on the home page to link to this resource. This can be relative if paths are used to match or absolute for hosts.

#### Optional configuration keys

- `pathPattern` A regex of the path to match, usually this should start with a `^/` (to match only instances at the beginning of the path and end with `/?` to optionally allow a trailing slash.
- `hostPattern` A regex to search for host to match for incomming routes. This allows you to route to different applications based on host name.
- `pathRewritePattern` This rewrites the request path sent to the backend used for this route. This may use regex matches from the `pathPattern` setting in normal javascript `replace()` syntax.
- `hostRewritePattern` This rewrite the request host sent in the headers to the backend for this route. Like `pathRewritePattern` this may use tokens from the `hostPattern` regex as per the normal javascript `replace()` syntax.

#### Configuration example

```javascript
"routes": [
  {
    "name": "Unfoggle",

    "description": "Tracking time ahs never been so easy!",
    "host": "localhost",
    "port": 3000,
    "pathPattern": "^/unfoggle/?"
  },
  {
    "name": "Taskaholic",
    "description": "A brutal task master",
    "pathRewritePattern": "/",
    "host": "localhost",
    "port": 9001,
    "pathPattern": "^/taskaholic/?"
  },
  {
    "name": "test route",
    "pathPattern": "^/test/?",
    "description": "debug info",
    "pathRewritePattern": "/",
    "host": "localhost",
    "hostPattern": "127.0.0.1",
    "hostRewritePattern": "fooozbazzzz",
    "port": 8989
  }
]
```

