# Authenitcating Proxy

**STATUS - This project is under active development and does not *actually work yet*, I'll keep the README up to date as this project takes shape.**

This module allows you to setup a simple reverse proxy server to provide authentication for otherwise unsecured services in your infrastructure. It currently ships with integration with single signon using google apps oauth2. You must add apps domains and allowed users to a whitelist for each site.

Patches adding support for 

## Installation

1. Clone the repo
2. `cd` into the directory and run `npm install`
3. Create a config.json in the root of the repository, any configuration added to this json file will override the defaults (set in `default.config.json`)
4. Setup your domain and email white lists and add your google apps credentials to the config.json file.
5. Start the server with `npm start`

## Implementation

This module is a little bit of glue wrapping [express](http://expressjs.com/), [passport](http://passportjs.org/), and [HTTP Proxy](https://github.com/nodejitsu/node-http-proxy).
