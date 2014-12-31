/**
 * This class finds the nextStopTime given a certain station id, 
 */
var q = require('q')
  , http = require('http')
  , XmlStream = require('xml-stream')
  , util = require('util')
  , Readable = require('stream').Readable
  , HafasXMLFixer = require('../lib/HafasXMLFixer.js')

function NextStopTimeResolver () {
  //initiate cache
  //...

}

NextStopTimeResolver.prototype = {

  promiseNextStopTime : function (previousstoptimeobject, callback) {
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
    var req = http.request(url, function (response) {
      var result = "";
      response.setEncoding('utf8');
      var xmlfixer = new HafasXMLFixer();
      response.pipe(xmlfixer);
      var xml = new XmlStream(xmlfixer);
      xml.on('updateElement: Err', function (error) {
        deferredUrl.reject("External error: " + error.$["text"]);
      });
      var nextStop = false;
      xml.on('updateElement: St', function(stop) {
        //find previous stop by checking whether this one is the next one
        if (nextStop && previous.route && previous.route.shortName) {
          // pay attention to trains that transfer a day
          var nextStopTimeUrl = "http://irail.be/stations/NMBS/00" + stop.$["evaId"] + "/stoptimes/" + datetime.getFullYear() + (parseInt(datetime.getMonth()) + 1) + datetime.getDate() + previous.route.shortName + "#stoptime";
          deferredUrl.resolve(nextStopTimeUrl);
        } else if (stop && stop.$["evaId"] && previous.stop.indexOf(stop.$["evaId"]) > -1) {
          //set flag for next encounter
          nextStop = true;
        }
      });
      xml.on('end', function () {
        //we didn't find a next stop time
        deferredUrl.resolve(null); 
      });
    });
    req.setTimeout(2000);
    req.on("timeout", function () {
      req.destroy();
    });
    req.on("error", function (error) {
      deferredUrl.reject(error);
    });
    req.end();
    return deferredUrl.promise;
  },

  /**
   * Promises a URL which can be used to get the stoptimes over a trip
   * TODO: implement caching
   */
  promiseQueryUrl: function (datetime, shortName) {
    var deferredUrl = q.defer();
    var path = "/jp/sncb-nmbs-routeplanner/trainsearch.exe/en?vtModeTs=weekday&productClassFilter=69&clientType=ANDROID&androidversion=3.1.10%20(31397)&hcount=0&maxResults=50&clientSystem=Android21&date=" + datetime.getDate() + "." + (parseInt(datetime.getMonth()) + 1) + "." + datetime.getFullYear() + "&trainname=" + shortName + "&clientDevice=Android%20SDK%20built%20for%20x86&htype=Android%20SDK%20built%20for%20x86&L=vs_json.vs_hap";
    var req = http.request({
      host: "www.belgianrail.be",
      path: path
    }, function (response) {
      var result = "";
      response.on("data",function(chunk) {
        result += chunk;
      });
      response.on("end", function () {
        result = result.replace(/}\s?;/,'}'); //for some reason, a semicolon was added. Deleting it to make it proper JSON
        result = JSON.parse(result);
        if (result.suggestions && result.suggestions[0] && result.suggestions[0].trainLink) {
          var trainLink = result.suggestions[0].trainLink;
          var url = {
            host: "www.belgianrail.be",
            path: "/jp/sncb-nmbs-routeplanner/traininfo.exe/en/" + trainLink + "?clientType=ANDROID&androidversion=3.1.10%20(31397)&hcount=0&clientSystem=Android21&date=" + datetime.getDate() + "." + (parseInt(datetime.getMonth()) + 1) + "." + datetime.getFullYear() +"&clientDevice=Android%20SDK%20built%20for%20x86&htype=Android%20SDK%20built%20for%20x86&L=vs_java3&rt=1&"
          };
          deferredUrl.resolve(url);
        } else {
          deferredUrl.reject("no trainlink found for " + shortName  + " : " + JSON.stringify(result));
        }
      });
      
    });
    req.setTimeout(2000);
    req.on("timeout", function () {
      req.destroy();
    });
    req.on("error", function (error) {
      deferredUrl.reject(error);
    });
    req.end();
    return deferredUrl.promise;
  }
};

module.exports = NextStopTimeResolver; 