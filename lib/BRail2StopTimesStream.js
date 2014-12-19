/**
 * B-Rail 2 stoptimes scrapes the Belgian railway's website and converts it to the stoptimes ontology
 * @author Pieter Colpaert
 */
var q = require('q')
  , http = require('http')
  , XmlStream = require('xml-stream')
  , Stoptime = require('../lib/Stoptime.js')
  , StoptimeContainer = require('../lib/StoptimeContainer.js')
  , util = require('util')
  , Readable = require('stream').Readable
, HafasXMLFixer = require('../lib/HafasXMLFixer.js')

util.inherits(BRail2StopTimesStream, Readable);

function BRail2StopTimesStream (stationids, languagecode, startdatetime, stopdatetime) {
  Readable.call(this, {objectMode: true});
  this.languagecode = languagecode;
  this.stopdatetime = stopdatetime;
  this.stationbaseuri = "http://irail.be/stations/NMBS";
  this.stationids = [];
  if (!startdatetime) {
    startdatetime = new Date();
  }
  //prepare execution heap
  for (var i in stationids) {
    this.stationids.push({id:stationids[i], datetime: startdatetime});
  }
}

BRail2StopTimesStream.prototype._read = function () {
  //prepare configuration
  var query = this.stationids.shift();
  if (query) {
    console.error("Querying for station ", query.id, " at time ", query.datetime);
    //fire it
    var self = this;
    this.getStopTimesInStation(query.id, this.languagecode, query.datetime).then(function (stoptimes) {
      //send it all separately and store new configuration
      var result = [];
      var nextdatetime;
      for (var key in stoptimes) {
        result.push(stoptimes[key]);
        if (stoptimes[key].departureTime) 
          nextdatetime = stoptimes[key].departureTime;
      }
      if (!nextdatetime) {
        nextdatetime = new Date(query.datetime.getTime() + 600000); //10 minutes later
      }

      query.datetime = nextdatetime;
      self.stationids.push(query);
      self.push(result);
    }, function (error) {
      //write the error to stderror
      console.error(error);
      //add the query id again to the back of the execution heap
      self.stationids.push(query);
    });
  } else {
    this.push(null);
  }
}

BRail2StopTimesStream.prototype.getStopTimesInStation = function (stationid, languagecode, datetime) {
  var deferred = q.defer();
  var stoptimes = new StoptimeContainer();

  if (!stationid) {
    throw "No station id given";
  }

  if (!languagecode) {
    languagecode = "en";
  }

  if (!datetime) {
    datetime = new Date();
  } else {
    datetime = new Date(datetime);
  }

  this.stationuri = this.stationbaseuri +  "/" + stationid + "#station";
  this.stoptimebaseuri = this.stationbaseuri + "/" + stationid + "/stoptimes/";

  //first, get the XML from a service
  /*
    For example, run this in command line:
    $  curl "http://www.belgianrail.be/jp/sncb-nmbs-routeplanner/stboard.exe/en?start=yes&time=15%3a12&date=01.12.2014&inputTripelId=A=1@O=@X=@Y=@U=80@L=008892007@B=1@p=@&maxJourneys=50&boardType=dep&hcount=1&htype=NokiaC7-00%2f022.014%2fsw_platform%3dS60%3bsw_platform_version%3d5.2%3bjava_build_version%3d2.2.54&L=vs_java3&productsFilter=0111111000000000"
  */


  var callbackcount = 0;
  var self = this;
  var processResponse = function (arrdep, response) {
    response.setEncoding('utf8');
    var xmlfixer = new HafasXMLFixer();
    response.pipe(xmlfixer);
    var xml = new XmlStream(xmlfixer);
    xml.on('updateElement: Err', function (error) {
      stoptimes.stoptimes = {};
      console.error("External error: ",error.$["text"]);
    });

    xml.on('updateElement: Journey', function(journey) {
      var stoptime = new Stoptime();
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
        stoptime["@id"] = self.stoptimebaseuri + stoptime.arrivalTime.getFullYear() + (parseInt(stoptime.arrivalTime.getMonth())+1) + stoptime.arrivalTime.getDate() + journey.$["hafasname"].replace(/[ ]+/g, "") + "#stoptime";
      } else {
        stoptime["@id"] = self.stoptimebaseuri + stoptime.departureTime.getFullYear() + (parseInt(stoptime.departureTime.getMonth())+1) + stoptime.departureTime.getDate() + journey.$["hafasname"].replace(/[ ]+/g, "") + "#stoptime";
      }
      stoptimes.addStoptime(journey.$["hafasname"].replace(/[ ]+/g, ""),stoptime);
    });

    xml.on("end", function () {
      if (callbackcount > 0 ) {
        //we're only interested in the second callback
        deferred.resolve(stoptimes.stoptimes);
      }
      callbackcount++;
    });
    xml.on("error", function (error) {
      deferred.reject(error);
    });
    response.on("error", function (error) {
      deferred.reject(error);
    });
    //todo: on error XML tag?
  }

  var processArrivalResponse = function (response) {
    processResponse("arr", response);
  }
  
  var processDepartureResponse = function (response) {
    processResponse("dep", response);
  }

  //do the arrivals request
  var req1 = http.request({
    host: "www.belgianrail.be",
    path : "/jp/sncb-nmbs-routeplanner/stboard.exe/" + languagecode + "?start=yes&time=" + datetime.getHours() + "%3a" + datetime.getMinutes() + "&date=" + datetime.getDate() + "." + (parseInt(datetime.getMonth()) + 1) + "." + datetime.getFullYear() + "&inputTripelId=A=1@O=@X=@Y=@U=80@L=" + stationid + "@B=1@p=@&maxJourneys=50&boardType=arr&hcount=1&htype=NokiaC7-00%2f022.014%2fsw_platform%3dS60%3bsw_platform_version%3d5.2%3bjava_build_version%3d2.2.54&L=vs_java3&productsFilter=0111111000000000"
  }, processArrivalResponse);
  req1.setTimeout(2000);
  req1.on("timeout", function () {
    req1.destroy();
  });
  req1.on("error", function () {
    deferred.reject("arrival request timed out");
  });
  req1.end();

  //do the departures request
  var req2 = http.request({
    host: "www.belgianrail.be",
    path : "/jp/sncb-nmbs-routeplanner/stboard.exe/" + languagecode + "?start=yes&time=" + datetime.getHours() + "%3a" + datetime.getMinutes() + "&date=" + datetime.getDate() + "." + (parseInt(datetime.getMonth()) + 1) + "." + datetime.getFullYear() + "&inputTripelId=A=1@O=@X=@Y=@U=80@L=" + stationid + "@B=1@p=@&maxJourneys=50&boardType=dep&hcount=1&htype=NokiaC7-00%2f022.014%2fsw_platform%3dS60%3bsw_platform_version%3d5.2%3bjava_build_version%3d2.2.54&L=vs_java3&productsFilter=0111111000000000"
  }, processDepartureResponse);
  req2.setTimeout(2000);
  req2.on("timeout", function() {
    req2.destroy();
  });

  req2.on("error", function () {
    deferred.reject("departure request timed out");
  });
  req2.end();
  
  return deferred.promise;
}

module.exports = BRail2StopTimesStream;
