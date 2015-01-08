/**
 * This class finds the nextStopTime given a certain station id, 
 */
var q = require('q')
  , HttpFetcher = require('../lib/HttpFetcher.js')
  , XmlStream = require('xml-stream')
  , util = require('util')
  , Readable = require('stream').Readable
  , parseString = require('xml2js').parseString
  , cache = require('rediscache');

function NextStopTimeResolver () {
  //initiate cache and HTTP fetcher
  this.fetcher = new HttpFetcher(10);  
  cache.connect(6379).configure({
    expiry: 86400
  });
}

NextStopTimeResolver.prototype = {

  promiseNextStopTime : function (previousstoptimeobject) {
    // First, get the date for the request
    var dt = new Date();
    if (previousstoptimeobject.arrivalTime) {
      dt = previousstoptimeobject.arrivalTime;
    } else {
      dt = previousstoptimeobject.departureTime;
    }
    // Next, get the shortname of the route
    var shortName = previousstoptimeobject.route.shortName;
    //Now we're going to request a URI to query
    var self = this;
    return this.promiseQueryUrl(dt,shortName).then(function(url) {
      return self.promiseNextStopTimeUrl(url, dt, previousstoptimeobject);
    });
  },

  promiseNextStopTimeUrl: function (url, datetime, previous) {
    var deferredUrl = q.defer();
    var self = this;
    cache.fetch(url).otherwise(function(deferred) {
      //if we didn't find it in the cache, put it in the cache
      self.fetcher.get(url).then(function (response) {
        //fix the response xml
        var body = response.body.replace(/\<br\s?\/>/g, " ").replace(/&#39;/g,"'").replace(/&apos;/g,"'").replace(/&/g,"");
        deferred.resolve(body);
      }, function (error) {
        deferred.reject(error);
      });
    }).then(function (body) {
      //when we've found it, read the body and process it
      parseString(body, function (err, result) {
        if (err) {
          deferredUrl.reject(err);
        }
        if (result.Err) {
          deferredUrl.reject(result.Err.$["text"]);
        }
        var nextStop = false;
        if (result.Journey && result.Journey.St) {
          for (var i in result.Journey.St) {
            var stop = result.Journey.St[i];
            if (nextStop && previous.route && previous.route.shortName) {
              // pay attention to trains that transfer a day
              // Bug! 0 for e.g., January
              var nextStopTimeUrl = "http://irail.be/stations/NMBS/00" + stop.$["evaId"] + "/stoptimes/" + datetime.getFullYear() + (parseInt(datetime.getMonth()) + 1) + datetime.getDate() + previous.route.shortName + "#stoptime";
              deferredUrl.resolve(nextStopTimeUrl);
            } else if (stop && stop.$["evaId"] && previous.stop.indexOf(stop.$["evaId"]) > -1) {
              //set flag for next encounter
              nextStop = true;
            }
          }
          //if we get here, then it means our for loop didn't resolve our promise. In other words: we didn't find a nextStopTime (probably this is the last stoptime of the trip)
          deferredUrl.resolve(null);
        } else {
          deferredUrl.reject("Didn't find any journeys");
        }
      });
    }).fail(function (error) {
      deferredUrl.reject(error);
    });
    return deferredUrl.promise;
  },

  /**
   * Promises a URL which can be used to get the stoptimes over a trip
   */
  promiseQueryUrl: function (datetime, shortName) {
    var deferredUrl = q.defer();
    var self = this;
    var url = "http://www.belgianrail.be/jp/sncb-nmbs-routeplanner/trainsearch.exe/en?vtModeTs=weekday&productClassFilter=69&clientType=ANDROID&androidversion=3.1.10%20(31397)&hcount=0&maxResults=50&clientSystem=Android21&date=" + datetime.getDate() + "." + (parseInt(datetime.getMonth()) + 1) + "." + datetime.getFullYear() + "&trainname=" + shortName + "&clientDevice=Android%20SDK%20built%20for%20x86&htype=Android%20SDK%20built%20for%20x86&L=vs_json.vs_hap";
    cache.fetch(url).otherwise(function(deferred) {
      // Fetch the body from HTTP because we don't have a cache object currently.
      self.fetcher.get(url).then(function (response) {
        //for some reason, a semicolon was added. Deleting it to make it proper JSON
        var result = response.body.replace(/}\s?;/,'}');
        //store the data in the redis cache
        deferred.resolve(JSON.parse(result));
      }, function (error) {
        deferred.reject(error);
      });
    }).then(function(result) {
      if (result.suggestions && result.suggestions[0] && result.suggestions[0].trainLink) {
        var trainLink = result.suggestions[0].trainLink;
        var url = "http://www.belgianrail.be/jp/sncb-nmbs-routeplanner/traininfo.exe/en/" + trainLink + "?clientType=ANDROID&androidversion=3.1.10%20(31397)&hcount=0&clientSystem=Android21&date=" + datetime.getDate() + "." + (parseInt(datetime.getMonth()) + 1) + "." + datetime.getFullYear() +"&clientDevice=Android%20SDK%20built%20for%20x86&htype=Android%20SDK%20built%20for%20x86&L=vs_java3&rt=1&";
        deferredUrl.resolve(url);
      } else {
        deferredUrl.reject("no trainlink found for " + shortName  + " : " + JSON.stringify(result));
      }
    }).fail(function (error) {
      deferredUrl.reject(error);
    });
    return deferredUrl.promise;
  }
};

module.exports = NextStopTimeResolver; 