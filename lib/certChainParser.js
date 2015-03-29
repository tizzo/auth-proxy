'use strict';
module.exports = function(chain) {
  chain = chain.split("\n");
  var cert = [];
  var ca = [];

  var i = null;
  var line = null;
  for (i = 0; i < chain.length; i++) {
    line = chain[i];
    if (!(line.length !== 0)) {
      continue;
    }
    cert.push(line);
    if (line.match(/-END CERTIFICATE-/)) {
      ca.push(cert.join("\n"));
      cert = [];
    }
  }
  return ca;
};
