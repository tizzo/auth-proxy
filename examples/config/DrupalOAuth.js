authenticationStrategies:
  DrupalOAuth:
    providerURL: "http://yourdruplasite.com/"
    consumerKey: "YOUR_KEY"
    consumerSecret: "YOUR_SECRET"
    requestTokenURL: "http://yourdruplasite.com/oauth/request_token"
    accessTokenURL: "http://yourdruplasite.com/oauth/access_token"
    userAuthorizationURL: "http://yourdruplasite/oauth/authorize"
    resourceURL: "http://yourdruplasite/rest/system/connect/user/info"
    resourceEndpoint: "rest/system/connect" // <-- thats the default
