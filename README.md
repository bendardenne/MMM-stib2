# MMM-stib2

This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/).

This module shows waiting times for STIB transport (Brussels). It is a re-write of <https://github.com/danito/MMM-stib> which didn't really fit the bill for me.

This module will group stops and will only show a single bus (or tram, metro) route once. I.e. the same line will not show in multiple stops. This reduces noise if you want to configure the module to show multiple stops that belong to the same line (but have overall different sets of lines.)

![Example screenshot](https://raw.githubusercontent.com/bendardenne/MMM-stib2/master/img/screenshot.png)

The module also queries the STIB messages API for disruptions and shows such disruptions. It also shows icons when the actual waiting time is unknown (only theoretical time is available), the vehicle is blocked or the vehicle is the last of the day (end of service).

It relies on the STIB OpenData API: <https://opendata.stib-mivb.be> . It requires an access token that can be obtained for free.

I wrote this module for my own usage, and it comes with no guarantee. However, I'm not opposed to fixing (small) issues or merging pull requests.

## Known issue

There seems to be a problem with the STIB server related to HTTP2 which prevent CORS pre-flight requests from succeding when HTTP2 is used. When using chromium, use the `--disable-http2` flag to workaround the problem.

If the issue persists, we could make the requests in the node helper to bypass CORS.

## Using the module

To use this module, add the following configuration block to the modules array in the `config/config.js` file:

```javascript
var config = {
    modules: [
      {
        module: "MMM-stib2",
        position: "bottom_right",
        config: {
          apiToken: "STIB OPEN DATA API TOKEN",
          DisplayArrivalTime: "both",
          timeFormat: "12h",
          pollInterval: "20000",
          stops: [{
            name: "Delta",
            id: ["3546", "3520"]
          }, {
            name: "Flagey",
            id: ["1280", "1354", "3508", "3572"]
          }]
        }
      }
    ]
}
```

See below for details.



## Configuration options

Option     | Description
---------- | ----------------------------------------------------------------------------------------------------------------
`apiToken` | _Required_ STIB opendata API key. See below for instructions on getting your API key .
`DisplayArrivalTime` | _Default is both_ Display actual time of arrival. It can replace waiting time or be displayed beside it.
`timeFormat` | _Default is 24h_ Use 12h or 24h format.
`pollInterval` | _Default is 20000_ Time between API Queries in milliseconds. Data are updated by STIB every 20 seconds - don't use values under 20000. 
`stops`    | _Required_ Array of stop objects. A stop object has a freetext `name` and an `ìd` property. `id` is an array of ids for bus stops. These ids can be found in the `stops.txt` file from the STIB GTFS dataset -> <https://stibmivb.opendatasoft.com/explore/dataset/gtfs-files-production/table/>.


## STIB OpenData

To create a STIB OpenData API key, go to <https://stibmivb.opendatasoft.com/> and create a free account.
Oncel logged in, click on your name in the top right corner of the page and then "API Keys" to generate a new key. Copy the Key value in the configuration of this module as "apiToken".
The module can actually be used without an API key, but the STIB API limits anonymous users to 100 queries per day, so the use of an API key is necessary for production use.

## Ideas / TODO list

- Scroll vertically if too many lines need to be shown (?)
- Internationalize. Messages are currently hardcoded to French.
