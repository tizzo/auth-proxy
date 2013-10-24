# Authenitcating Proxy

**STATUS - This project is under active development and does not *actually work yet*, I'll keep the README up to date as this project takes shape.**

This module is a little bit of glue wrapping [express](http://expressjs.com/), [passport](http://passportjs.org/), and [HTTP Proxy](https://github.com/nodejitsu/node-http-proxy).  It allows you to setup a simple reverse proxy server to provide authentication for otherwise unsecured services in your infrastructure. It currently ships with integration with single signon using google apps oauth2. You must add apps domains and allowed users to a whitelist for each site.

Patches adding support for 

## Installation

1. Clone the repo
2. `cd` into the directory and run `npm install`
3. Create a config.json in the root of the repository, any configuration added to this json file will override the defaults (set in `default.config.json`)
4. Setup your domain and email white lists and add your google apps credentials to the config.json file.
5. Start the server with `npm start`

### Defining Routes

The routes configuration key is an array of route objects. This list of routes is searched (in the order they are defined) when any incomming request is received in the proxy. A path and/or a hostname are checked (if configured - both optional) and the first matching route is used. For a small performance gain the most commonly used routes should probably be at the beginning of the list.

#### Required configuration keys

- `name` A name for the route
- `description` A description for the route.
- `host` The host to proxy matching requests to.
- `port` The port at `host` to route the requests to.

#### Optional configuration keys

- `path` A regex of the path to match, usually this should start with a `^/` (to match only instances at the beginning of the path and end with `/?` to optionally allow a trailing slash.
- `hostPattern` A regex to search for host to match for incomming routes. This allows you to route to different applications based on host name.
- `pathRewritePattern` This rewrites the request path sent to the backend used for this route. This may use regex matches from the `path` setting in normal javascript `replace()` syntax.
- `hostRewritePattern` This rewrite the request host sent in the headers to the backend for this route. Like `pathRewritePattern` this may use tokens from the `hostPattern` regex as per the normal javascript `replace()` syntax.

#### Configuration example

```javascript
"routes": [
  {
    "name": "Unfoggle",
    "description": "Tracking time ahs never been so easy!",
    "host": "localhost",
    "port": 3000,
    "path": "^/unfoggle/?"
  },
  {
    "name": "Taskaholic",
    "description": "A brutal task master",
    "pathRewritePattern": "/",
    "host": "localhost",
    "port": 9001,
    "path": "^/taskaholic/?"
  },
  {
    "name": "test route",
    "path": "^/test/?",
    "description": "debug info",
    "pathRewritePattern": "/",
    "host": "localhost",
    "hostPattern": "127.0.0.1",
    "hostRewritePattern": "fooozbazzzz",
    "port": 8989
  }
]
```

