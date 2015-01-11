/**
 * B-Rail 2 stoptimes scrapes the Belgian railway's website and converts it to the stoptimes ontology
 * @author Pieter Colpaert
 */
var q = require('q')
  , HttpFetcher = require('../lib/HttpFetcher.js')
  , Stoptime = require('../lib/Stoptime.js')
  , StoptimeContainer = require('../lib/StoptimeContainer.js')
  , util = require('util')
  , Readable = require('stream').Readable
  , NextStopTimeResolver = require('../lib/NextStopTimeResolver.js')
  , BRail2StopTimesTransform = require('../lib/BRail2StopTimesTransform.js')
  , parseString = require('xml2js').parseString;

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
  this.fetcher = new HttpFetcher(4); // max 4 concurrent requests
}

BRail2StopTimesStream.prototype._read = function () {
  //prepare configuration
  var query = this.stationids.shift();
  if (query) {
    console.error("Querying for station ", query.id, " at time ", query.datetime);
    var self = this;
    //fire it
    this.getStopTimesInStation(query.id, this.languagecode, query.datetime).then(function (stoptimes) {
      //send it all separately and store new configuration
      var result = [];
      var nextdatetime = null;
      for (var key in stoptimes) {
        result.push(stoptimes[key]);
        if (stoptimes[key].departureTime) 
          nextdatetime = stoptimes[key].departureTime;
      }
      if (!nextdatetime) {
        nextdatetime = new Date(query.datetime.getTime() + (60000 * 60 * 12)); //0.5 days later
      }
      //Add it, unless we're done
      if (nextdatetime < this.stopdatetime) {
        query.datetime = nextdatetime;
        self.stationids.push(query);
      }
      self.push(result);
    }, function (error) {
      //write the error to stderror
      console.error("Error in readstream: " + error);
      // don't add the query id again to the back of the execution heap: this station gives an error
      // you could uncomment this if you'd like to add this behaviour again, but if it keeps failing, the stream will never end
      // self.stationids.push(query);
      //These stations give problems currently:
      // 008821022, 008891611, 008718213, 008821048
      self.push({});
    });
  } else {
    console.error("Stream ended");
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

  this.stationuri = this.stationbaseuri + "/" + stationid + "#station";
  this.stoptimebaseuri = this.stationbaseuri + "/" + stationid + "/stoptimes/";

  var callbackcount = 0;
  var self = this;
  var container = new StoptimeContainer();
  var processResponse = function (arrdep, response) {
    //fix XML of the body
    var body = response.body.replace(/\<br\s?\/>/g, " ").replace(/&#39;/g,"'").replace(/&apos;/g,"'").replace(/&/g,"");
    //parse the XML
    parseString(body, function (err, result) {
      if (err) {
        deferred.reject(err);
      }
      var b2st = new BRail2StopTimesTransform(arrdep, stationid);
      if (result.StationTable && result.StationTable.Journey) {
        for (var i in result.StationTable.Journey) {
          var journey = result.StationTable.Journey[i];
          var stoptime = b2st.getStopTime(journey);
          container.addStopTime(stoptime.route.shortName, stoptime);
        }
        //augment the callback count
        callbackcount ++;
        //we need 2 callbacks before our result is complete
        if (callbackcount === 2) {
          //Now, for each of the stoptimes, let's search for a next stop time
          if (container.stoptimes) {
            //an async for-loop pattern
            var finishcount = 0;
            var tryToFindNextStopTime = function (i) {
              var stoptime = container.stoptimes[Object.keys(container.stoptimes)[i]];
              self.nextStopTimeResolver.promiseNextStopTime(stoptime).then(function (nextStopTime) {
                if (nextStopTime) {
                  stoptime.nextStopTime = nextStopTime;
                }
                if (finishcount+1 === Object.keys(container.stoptimes).length) {
                  //this was the last to be finished
                  deferred.resolve(container.stoptimes);
                }
                finishcount++;
              }).fail(function (error) {
                console.error("No nextstoptime: ", error)
                if (finishcount+1 === Object.keys(container.stoptimes).length) {
                  deferred.resolve(container.stoptimes);
                }
                finishcount ++;
              });
              tryToFindNextStopTime(i+1);
            }
            tryToFindNextStopTime(0);
          } else {
            deferred.reject("no stoptimes in this station");
          }
        }
      } else if (result.Err && result.Err.$["text"]) {
        deferred.reject(result.Err.$["text"]);
      } else {
        deferred.reject("Unknown error");
      }
    });
  }

  var processArrivalResponse = function (response) {
    processResponse("arr", response);
  }
  
  var processDepartureResponse = function (response) {
    processResponse("dep", response);
  }

  /*
    For example, run this on command line:
    $  curl "http://www.belgianrail.be/jp/sncb-nmbs-routeplanner/stboard.exe/en?start=yes&time=15%3a12&date=01.12.2014&inputTripelId=A=1@O=@X=@Y=@U=80@L=008892007@B=1@p=@&maxJourneys=50&boardType=dep&hcount=1&htype=NokiaC7-00%2f022.014%2fsw_platform%3dS60%3bsw_platform_version%3d5.2%3bjava_build_version%3d2.2.54&L=vs_java3&productsFilter=0111111000000000"
  */

  //do the arrivals request
  var arrivalsUrl = "http://www.belgianrail.be/jp/sncb-nmbs-routeplanner/stboard.exe/" + languagecode + "?start=yes&time=" + datetime.getHours() + "%3a" + datetime.getMinutes() + "&date=" + datetime.getDate() + "." + (parseInt(datetime.getMonth()) + 1) + "." + datetime.getFullYear() + "&inputTripelId=A=1@O=@X=@Y=@U=80@L=" + stationid + "@B=1@p=@&maxJourneys=50&boardType=arr&hcount=1&htype=NokiaC7-00%2f022.014%2fsw_platform%3dS60%3bsw_platform_version%3d5.2%3bjava_build_version%3d2.2.54&L=vs_java3&productsFilter=0111111000000000";
  this.fetcher.get(arrivalsUrl).then(processArrivalResponse, function (error) {
    console.error(error);
    deferred.reject(error);
  });

  var departuresUrl = "http://www.belgianrail.be/jp/sncb-nmbs-routeplanner/stboard.exe/" + languagecode + "?start=yes&time=" + datetime.getHours() + "%3a" + datetime.getMinutes() + "&date=" + datetime.getDate() + "." + (parseInt(datetime.getMonth()) + 1) + "." + datetime.getFullYear() + "&inputTripelId=A=1@O=@X=@Y=@U=80@L=" + stationid + "@B=1@p=@&maxJourneys=50&boardType=dep&hcount=1&htype=NokiaC7-00%2f022.014%2fsw_platform%3dS60%3bsw_platform_version%3d5.2%3bjava_build_version%3d2.2.54&L=vs_java3&productsFilter=0111111000000000";
  this.fetcher.get(departuresUrl).then(processDepartureResponse, function (error) {
    console.error(error);
    deferred.reject(error);
  });
  
  return deferred.promise;
}

module.exports = BRail2StopTimesStream;
