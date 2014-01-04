# mapshaper

### Introduction

Mapshaper is a program for editing polygon and polyline datasets for mapping. The command line interface has commands for line simplification, polygon aggregation, attribute field calculation, filtering, splitting, table joins and more. The [web-based gui](http://www.mapshaper.org) focuses on interactive simplification.

Mapshaper can read and write Shapefile, GeoJSON and [TopoJSON](https://github.com/mbostock/topojson/wiki) files.

See the [project wiki](https://github.com/mbloch/mapshaper/wiki) for more information about using mapshaper.

### Installation

Mapshaper requires [Node.js](http://nodejs.org).

With Node installed, you can install the latest release version from the npm registry. Install with the "-g" flag to make the executable scripts available systemwide.

```bash
npm install -g mapshaper
```

To install and run the latest development code from github:

```bash
git clone git@github.com:mbloch/mapshaper.git
cd mapshaper
npm install
bin/mapshaper-gui # use the web interface locally
bin/mapshaper     # use the command line tool
```

### Interactive tool

The mapshaper distribution includes the script `mapshaper-gui`, which runs mapshaper's web interface locally. You can also visit [mapshaper.org](http://www.mapshaper.org) to use mapshaper online. All processing is done in the browser, so user data stays private.

Browser compatibility: mapshaper works in recent versions of Chrome and Firefox as well as IE 10+. Exporting is not supported in Safari. Firefox seems better able to handle large files (say >200MB) than other browsers without encountering out-of-memory errors.

### Command line tool

The [Command Reference](https://github.com/mbloch/mapshaper/wiki/Command-Reference) had detailed usage information.

Examples

Simplify counties.shp retaining 10% of removable vertices, export as GeoJSON.
`mapshaper -p 0.1 counties.shp -f geojson -o counties_simple.json`

Convert counties to states.
`mapshaper --dissolve STATE --copy-fields STATE_NAME counties.shp -o states.shp`

Extract the border between two states.
`mapshaper --filter "STATE=='OR' || STATE=='WA'" --innerlines states.shp`

Generate two new fields using JavaScript.
`mapshaper --expression "STATE_FIPS=CNTY_FIPS.substr(0, 5), AREA=$.area" counties.shp`

Join a csv table to a Shapefile (:str suffix prevents FIPS field from being converted to numbers)
`mapshaper --join demographics.txt --join-keys STATE_FIPS,FIPS:str states.shp`

The `mapshaper` script has been used successfully in OS X, Ubuntu Linux and Windows 8.

### Building and testing

You will need to regenerate mapshaper.js if you edit any of the files in the src/ or lib/ directories. Run `build` to update mapshaper.js (used by the command line tool); run `build gui` to update www/mapshaper.js (used by the web interface).

`build [gui] -f` continuously monitors source files and regenerates  mapshaper.js whenever a source file is modified.

Run `mocha` in the project directory to run mapshaper's tests.

### License

This software is licensed under the [MPL](http://www.mozilla.org/MPL/2.0/) 2.0

According to Mozilla's [FAQ](http://www.mozilla.org/MPL/2.0/FAQ.html), "The MPL's "file-level" copyleft is designed to encourage contributors to share modifications they make to your code, while still allowing them to combine your code with code under other licenses (open or proprietary) with minimal restrictions."

### Acknowledgements

Thanks to [Shan Carter](https://github.com/shancarter) for help designing mapshaper's web interface.

Thanks to Mark Harrower for collaborating on the [original MapShaper program](http://mapshaper.com/test/OldMapShaper.swf) at the University of Wisconsin &ndash; Madison.

### Future development

To suggest improvements, add an [issue](https://github.com/mbloch/mapshaper/issues).
