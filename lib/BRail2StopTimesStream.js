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
  , NextStopTimeResolver = require('../lib/NextStopTimeResolver.js')
  , BRail2StopTimesTransform = require('../lib/BRail2StopTimesTransform.js');

util.inherits(BRail2StopTimesStream, Readable);

function BRail2StopTimesStream (stationids, languagecode, startdatetime, stopdatetime) {
  Readable.call(this, {objectMode: true});
  this.languagecode = languagecode;
  this.stopdatetime = stopdatetime;
  this.stationbaseuri = "http://irail.be/stations/NMBS";
  this.stationids = [];
  this.nextStopTimeResolver = new NextStopTimeResolver();
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
      //Add it, unless we're done
      if (nextdatetime < this.stopdatetime) {
        query.datetime = nextdatetime;
        self.stationids.push(query);
      }
      self.push(result);
    }, function (error) {
      //write the error to stderror
      console.error(error);
      //add the query id again to the back of the execution heap
      self.stationids.push(query);
    });
  } else {
    // This marks the end of the stream
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
    var container = new StoptimeContainer();
    var transformjourneystream = new BRail2StopTimesTransform(arrdep, stationid, self.nextStopTimeResolver);
    transformjourneystream.pipe(container);
    xml.on('updateElement: Journey', function(journey) {
      transformjourneystream.write(journey);
    });

    transformjourneystream.on("end", function () {
      deferred.resolve(container.stoptimes);
    });

    xml.on("end", function () {
      if (callbackcount > 0 ) {
        //the stream for journeystream ends when both arrival and departure streams are done
        transformjourneystream.end();
      }
      callbackcount++;
    });
    xml.on("error", function (error) {
      deferred.reject(error);
    });
    response.on("error", function (error) {
      deferred.reject(error);
    });
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
  /*
    For example, run this in command line:
    $  curl "http://www.belgianrail.be/jp/sncb-nmbs-routeplanner/stboard.exe/en?start=yes&time=15%3a12&date=01.12.2014&inputTripelId=A=1@O=@X=@Y=@U=80@L=008892007@B=1@p=@&maxJourneys=50&boardType=dep&hcount=1&htype=NokiaC7-00%2f022.014%2fsw_platform%3dS60%3bsw_platform_version%3d5.2%3bjava_build_version%3d2.2.54&L=vs_java3&productsFilter=0111111000000000"
  */

  req2.on("error", function () {
    deferred.reject("departure request timed out");
  });
  req2.end();
  
  return deferred.promise;
}

module.exports = BRail2StopTimesStream;
