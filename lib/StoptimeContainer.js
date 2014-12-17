
/**
 * The stoptime container is going to merge arrival and departure object
 * 
 */
function StoptimeContainer () {
  this.stoptimes = {};
}

StoptimeContainer.prototype = {
  
  addStoptime : function (name, stoptime) {
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

};

module.exports = StoptimeContainer;