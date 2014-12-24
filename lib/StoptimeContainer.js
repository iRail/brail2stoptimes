/**
 * The stoptime container is going to merge arrival and departure object
 */

var util = require('util')
  , Writable = require('stream').Writable

util.inherits(StoptimeContainer, Writable);

function StoptimeContainer () {
  Writable.call(this, {objectMode: true});
  this.stoptimes = {};
}

StoptimeContainer.prototype._write = function (stoptime, encoding, done) {
  this.addStoptime(stoptime.route.shortName, stoptime);
  done();
}

StoptimeContainer.prototype.addStoptime = function (name, stoptime) {
  if (!this.stoptimes[name]) {
    this.stoptimes[name] = {}
  }
  //merge both objects
  for (var key in stoptime) {
    if (typeof stoptime[key] !== 'function') {
      this.stoptimes[name][key] = stoptime[key];
    } 
  }
}

module.exports = StoptimeContainer;