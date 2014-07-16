# mapshaper

### Introduction

Mapshaper is a program for editing polygon and polyline datasets for mapping. The command line interface has commands for line simplification, attribute field calculation, filtering, clipping, splitting, dissolving, table joins and more. The [web-based gui](http://www.mapshaper.org) focuses on interactive simplification.

Mapshaper can read and write Shapefile, GeoJSON and [TopoJSON](https://github.com/mbostock/topojson/wiki) files.

See the [project wiki](https://github.com/mbloch/mapshaper/wiki) for more information about using mapshaper.

### Installation

Mapshaper requires [Node.js](http://nodejs.org). There are easy [installers](http://nodejs.org/download/) for Microsoft Windows and other platforms.

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

The `mapshaper` script has been used successfully under OS X, Ubuntu Linux and Windows 8.

### Interactive tool

The mapshaper distribution includes the script `mapshaper-gui`, which runs mapshaper's web interface locally. You can also visit [mapshaper.org](http://www.mapshaper.org) to use mapshaper online. All processing is done in the browser, so your data stays private, even when using the public website.

Browser compatibility: mapshaper works in recent versions of Chrome and Firefox as well as IE 10+. Exporting is not supported in Safari. If you encounter out-of-memory errors using Chrome, try Firefox, which can handle Shapefiles larger than 1GB.

### Command line tool

The [Command Reference](https://github.com/mbloch/mapshaper/wiki/v0.2-Command-Reference) has detailed usage information.

Examples

Simplify counties.shp retaining 10% of removable vertices.
`mapshaper counties.shp -simplify 10% -o output/counties_simple.shp`

Convert all the Shapefiles in a directory into GeoJSON.
`mapshaper *.shp -o format=geojson output/`

Generate state-level polygons by dissolving a layer of counties.
`mapshaper counties.shp -dissolve STATE copy-fields=STATE_NAME -o states.shp`

Extract the border between two states.
`mapshaper states.shp -filter "STATE=='OR' || STATE=='WA'" -innerlines`

Generate two new fields using a JavaScript expression.
`mapshaper counties.shp -each "STATE_FIPS=CNTY_FIPS.substr(0, 5), AREA=$.area"`

Join a csv table to a Shapefile (the :str suffix prevents FIPS field from being converted to numbers)
`mapshaper -i states.shp -join demographics.txt keys=STATE_FIPS,FIPS:str`

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
