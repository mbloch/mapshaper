# mapshaper

### Introduction

Mapshaper is a program for simplifying cartographic lines while preserving the topological relationships between adjacent polygons and intersecting polyline paths. It can read and write Shapefile, GeoJSON and [TopoJSON](https://github.com/mbostock/topojson/wiki) files. The current version can be found at [mapshaper.org](http://www.mapshaper.org).

This software is loosely based on the original MapShaper program that I wrote at the University of Wisconsin, Madison in 2006-2007. That version is still available [here](http://mapshaper.com/test/OldMapShaper.swf).

The new mapshaper was rewritten from scratch in JavaScript and improves on the original in a few ways. The earlier program sent data to a server to be processed; the new version does all its processing locally, so the program can be used offline and user data stays private. The new version has a better algorithm for topology processing. There is also a command line tool.

### Installation

Mapshaper requires [Node.js](http://nodejs.org). With Node installed, you can install mapshaper by running:

	npm install -g mapshaper

### Interactive tool

The mapshaper distribution includes the script `mapshaper-gui`, which opens mapshaper's web interface in a browser. You can also visit [mapshaper.org](http://www.mapshaper.org) to use mapshaper online.

Browser compatibility: mapshaper works well in recent versions of Chrome and Firefox. Large files (say, >200MB) may cause out-of-memory errors in Chrome. Exporting is not supported in Safari. Mapshaper appears to work in Opera 15+ and Internet Explorer 11.

### Command line tool

The `mapshaper` script runs well in OS X and has also been used successfully on Ubuntu 13.04 and Windows 8.

`$ mapshaper -p 0.1 counties.shp`  Retain 10% of removable vertices using default simplification.

`$ mapshaper -i 100 states.shp --dp `  Remove features smaller than ~100 meters using Douglas-Peucker simplification.

`$ mapshaper -h` Read a help message.

### Building and testing

You will need to regenerate mapshaper.js if you edit any of the files in the src/ or lib/ directories. Run `$ build` to update mapshaper.js (used by the command line tool); run `$ build gui` to update www/mapshaper.js (used by the web interface).

`$ build [gui] -f` continuously monitors source files and regenerates  mapshaper.js whenever a source file is modified.

Run `$ mocha` in the project directory to run mapshaper's tests.

### License

This software is licensed under the [MPL](http://www.mozilla.org/MPL/2.0/) 2.0

According to Mozilla's [FAQ](http://www.mozilla.org/MPL/2.0/FAQ.html), "The MPL's "file-level" copyleft is designed to encourage contributors to share modifications they make to your code, while still allowing them to combine your code with code under other licenses (open or proprietary) with minimal restrictions."

### Upcoming features + wish list

To suggest additions to this list, add an [issue](https://github.com/mbloch/mapshaper/issues).

- Import Shapefile attribute table (.dbf file)
- Selection and aggregation, using attribute queries and mouse selection
- Ability to heal minor topological problems in source data
- Ability to prevent or remove polygon overlaps and self-intersections
- Update the original "modified Visvalingam" method, add control over degree of smoothing.
- Experiment with new simplification and smoothing methods.

