var portfinder = require('portfinder');
var async = require('async');

module.exports = function(numberOfPorts, done) {
  tasks = [];
  var i = 1;
  while (i <= numberOfPorts) {
    tasks.push(portfinder.getPort);
    i++;
  }
  async.parallel(tasks, done);
}
