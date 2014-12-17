/**
 * Uses the stoptimes vocabulary at http://github.com/opentransport/vocabulary to store railway data
 * A class built for converting hafas interface data to stoptimes
 */
function Stoptime () {
  //public variables:
  this.arrivalTime; //http://semweb.mmlab.be/ns/stoptimes#arrivalTime
  this.departureTime; //http://semweb.mmlab.be/ns/stoptimes#departureTime
  this.stop = "http://irail.be/stations/NMBS/{stationid}#{platformid}"; //http://vocab.gtfs.org/terms#Stop
  this.nextStopTime; //http://semweb.mmlab.be/ns/stoptimes#nextStopTime
  this.headsign; //http://vocab.gtfs.org/terms#headsign
  this.hafasname;
}

Stoptime.prototype = {
  
  /**
   * Add a certain amount of seconds to the arrivalTime
   */
  addToArrivalTime : function (s) {
    if (!this.arrivalTime) {
      this.arrivalTime = new Date(0);
    }
    this.arrivalTime.setTime(parseInt(this.arrivalTime.getTime()) + s * 1000);
  },

  /**
   * Add a certain amount of seconds to the departureTime
   */
  addToDepartureTime : function (s) {
    if (!this.departureTime) {
      this.departureTime = new Date(0);
    }
    this.departureTime.setTime(parseInt(this.departureTime.getTime()) + s * 1000);
  },

  addPlatform : function (platform) {
    //replace {platformid} with stopid
    this.stop = this.stop.replace("{platformid}",platform);
  },
  
  addStationId : function (stationid) {
    //replace {stationid} with stationid
    this.stop = this.stop.replace("{stationid}",stationid);
  },

  setHeadsign : function (headsign) {
    this.headsign = headsign;
  },

  setNextStopTime : function () {
    // next stop time
    //TODO
  }
  
};

module.exports = Stoptime;