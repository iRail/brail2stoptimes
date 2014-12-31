# Belgian Rail 2 stoptimes

This project generates a stream of real stoptimes between 2 time intervals for a list of stops

## A stoptime?

Yes! A stoptime is 1 arrival and departure of 1 train on 1 location (a platform or station).

We particularly use the term "stoptime", as we use the [stoptime ontology](https://github.com/opentransport/vocabulary) defined by the Open Knowledge Open Transport Working Group.

1 stoptime looks something like this:
```javascript
{ "stop" : "http://irail.be/stations/NMBS/008821121#10",
  "departureTime" : "2014-12-15T18:02:00Z",
  "headsign" : "Antwerpen-Centraal",
  "@id" : "http://irail.be/stations/NMBS/008821121/stoptimes/201411115IC4517#stoptime",
  "arrivalTime" : "2014-12-15T18:00:00Z",
  "provenance" : "Charleroi-Sud"
}
```
## How do I use it?

Easy! You install this repo using npm in your own project and you can start doing fun things:

```
npm install brail2stoptimes --save
```

And now use it in your project as follows:

```javascript
var BRail2StopTimesStream = require("brail2stoptimes");
//you can find these identifiers in our https://github.com/iRail/stations repository or check the bin/example.js file
var stations = ["008718201","008718206","008500010","008832664"];
var stoptimesstream = new BRail2StopTimesStream(stations, "en", new Date(), new Date() + 2); //get for 2 days
stoptimesstream.on("data", function (data) {
  //do something with it:
  console.log(data);
});
```

## What now?

You can ingest this data in e.g., mongodb (check the bin directory) or start creating data dumps such as a GTFS dump. If you've done something, please let me know through the issue tracker.

## How does it work?

It works in two steps:
 * It scrapes all stations for arrival and departure times over one day (starting at 3am clock round)
 * It stores the train numbers and stores a link to the nextStopTime

For each stoptime, we thus need 3 requests:
 1. To obtain the departures in a station
 2. To obtain the arrivals in a station and link them to the departures
 3. To obtain the nextStopTime
