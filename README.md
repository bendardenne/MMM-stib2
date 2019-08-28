# MMM-stib2

This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/).

This module shows waiting times for STIB transport (Brussels). It is a re-write of <https://github.com/danito/MMM-stib> which didn't really fit the bill for me.

This module will group stops and will only a single bus (or tram, metro) route once. I.e. the same line will not show in multiple stops. This reduces noise if you want to configure the module to show multiple stops that belong to the same line (but have overall different sets of lines.)

The module also queries the STIB messages API for disruptions and shows such disruptions. It also shows icons when the actual waiting time is unknown (only theoretical time is available), the vehicle is blocked or the vehicle is the last of the day (end of service).

It relies on the STIB OpenData API: <https://opendata.stib-mivb.be> . It requires an access token that can be obtained for free.

I wrote this module for my own usage, and it comes with no guarantee. However, I'm not opposed to fixing (small) issues or merging pull requests.

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

See below for details



## Configuration options

Option     | Description
---------- | ----------------------------------------------------------------------------------------------------------------
`apiToken` | _Required_ STIB open data API token. See below for instructions on getting such a token.
`stops`    | _Required_ Array of stop objects. A stop object has a freetext `name` and an `ìd` property. `id` is an array of ids for bus stops. These id can be found in the `stops.txt` file from the STIB GTFS dataset. Currently, due to a limitation of the STIB open data API, there may be at most 10 IDs in the whole config.


## STIB OpenData

To create a STIB OpenData token, go to <https://opendata.stib-mivb.be/> and create an account.
In "My Space", click on "Operation Monitoring", then "Subscribe".
Then, click regenerate. The token you should use in the configuration of this module is the "Access Token".

## Ideas / TODO list

- Allow setting more than 10 ids.
- Scroll vertically if too many lines need to be shown (?)
- Internationalize. Messages are currently hardcoded to French.