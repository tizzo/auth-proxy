var path = require('path');
module.exports = {
  MockAuth: require(path.join(__dirname, 'MockAuth')),
  GoogleOAuth2: require(path.join(__dirname, 'GoogleOAuth2')),
};
