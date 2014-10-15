module.exports = function(chain) {
  chain = chain.split("\n");
  var cert = [];
  var ca = [];

  var _i, _len, line = null;
  for (_i = 0, _len = chain.length; _i < _len; _i++) {
    line = chain[_i];
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
