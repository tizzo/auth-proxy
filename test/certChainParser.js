var should = require('should');
var fs = require('fs');
var path = require('path');
var chainParser = require('../lib/certChainParser');

describe('CertificateChainParser', function() {
  it('should parse a valid certificate chain', function(done) {
    fs.readFile(path.resolve(path.join('test', 'ssl', 'testChain.pem')), 'utf8', function(error, file) {
      var ca = chainParser(file);
      ca.length.should.equal(4);
      done();
    });
  });
});
