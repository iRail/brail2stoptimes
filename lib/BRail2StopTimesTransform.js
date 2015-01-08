/**
 * Converts the stream of XML towards stoptimes
 * @author Pieter Colpaert
 */
var q = require('q')
  , Stoptime = require('../lib/Stoptime.js')


function BRail2StopTimesTransform (arrdep, stationid) {
  this._arrdep = arrdep;
  this._stationid = stationid;
}

/**
 * Function puts all the XML straight into a stoptime object
 */
BRail2StopTimesTransform.prototype.getStopTime = function (journey) {
  var arrdep = this._arrdep;
  var stationid = this._stationid;
  var stoptime = new Stoptime();
  var self = this;
  /**
     example output:
     { HIMMessage:{ '$': { header: 'Strike of train drivers/some of the train drivers.', lead: 'Strike of train drivers/some of the train drivers.', display: '0' },
     '$name': 'HIMMessage' },
     '$': {
     fpTime: '15:13',
     fpDate: '11/12/14',
     delay: 'cancel',
     platform: '5',
     targetLoc: 'Genk [NMBS/SNCB]',
     dirnr: '8831765',
     hafasname: 'IC  2215',
     prod: 'IC  2215#IC K',
     class: '4',
     dir: 'Genk [NMBS/SNCB]',
     administration: '88____',
     is_reachable: '0' },
     '$name': 'Journey' }
  */
  //used a for-loop with a switch construction as everything is optional: we scrape what we find and add it to the array
  for (var key in journey.$) {
    switch (key) {
    case "fpTime":
      var matches = /(\d\d):(\d\d)/.exec(journey.$[key]);
      var seconds = matches[1] * 3600 + matches[2] * 60;
      if (arrdep === "arr"){
        stoptime.addToArrivalTime(seconds);
      } else {
        stoptime.addToDepartureTime(seconds);
      }
      break;
    case "fpDate":
      var matches = /(\d\d)\/(\d\d)\/(\d\d)/.exec(journey.$[key]);
      var seconds = (new Date("20" + matches[3], matches[2]-1, matches[1]).getTime() / 1000);
      if (arrdep === "arr"){
        stoptime.addToArrivalTime(seconds);
      } else {
        stoptime.addToDepartureTime(seconds);
      }
      break;
    case "delay":
      //can be 'cancel', '-' or a number of seconds 
      break;
    case "e_delay":
      //expected delay
      break;
    case "platform":
      stoptime.addPlatform(journey.$[key]);
      break;
    case "targetLoc":
      if (arrdep === "arr") {
        stoptime.provenance = journey.$[key].replace(" [NMBS/SNCB]", "");
      } else {
        stoptime.setHeadsign(journey.$[key].replace(" [NMBS/SNCB]", ""));
      }
      break;
    case "dirnr":
      //Is this an identifier for a gtfs:Route?
      break;
    case "hafasname":
      //This is a parsable name to identify the gtfs:Route this vehicle follows.
      //It also includes the type of train. E.g., P stands for a peek hour train
      //This will be unique within 1 output and it will be the same within both arrival and departure output
      stoptime.route = {};
      stoptime.route.shortName = journey.$["hafasname"].replace(/[ ]+/g, "");
      break;
    case "prod":
      //this is the hafasname extended with a hash. No idea what it does exactly
      break;
    case "class":
      //this is 4. No idea what this property does.
      break;
    case "administration":
      // No idea what this property does.
      break;
    case "dir":
      //this seems like a copy of targetLoc. No idea whether it is ever different
      break;
    case "is_reachable":
      //this is mostly 0. No idea what this property does.
      break;
    }
  }
  if (!journey.$["platform"]) {
    stoptime.addPlatform("station");
  }
  stoptime.addStationId(stationid);
  if (arrdep === "arr") {
    //TODO (bug) mind that we need an extra 0 to be added
    stoptime["@id"] = "http://irail.be/stations/NMBS/" + stationid + "/stoptimes/" + stoptime.arrivalTime.getFullYear() + (parseInt(stoptime.arrivalTime.getMonth())+1) + stoptime.arrivalTime.getDate() + journey.$["hafasname"].replace(/[ ]+/g, "") + "#stoptime";
  } else {
    stoptime["@id"] = "http://irail.be/stations/NMBS/" + stationid + "/stoptimes/" + stoptime.departureTime.getFullYear() + (parseInt(stoptime.departureTime.getMonth())+1) + stoptime.departureTime.getDate() + journey.$["hafasname"].replace(/[ ]+/g, "") + "#stoptime";
  }
  return stoptime;
}

module.exports = BRail2StopTimesTransform;