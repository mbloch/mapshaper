#mapshaper

##Introduction

Mapshaper is a program for simplifying cartographic lines while preserving the topological relationships between adjacent polygons and intersecting polyline paths.

This software was inspired by the original mapshaper program, which I wrote at the University of Wisconsin, Madison in 2006-2007. That version is still available online at mapshaper.com.

The new mapshaper was rewritten from scratch in JavaScript and improves on the original version in a few ways. The old mapshaper sent data to a server to be processed; the new version does all its processing locally, so the program can be used offline and user data stays private. The new version has a better algorithm for topology processing. And there is a non-interactive script in addition to the web-based tool.

##Interactive tool

To set up mapshaper's web interface for online use, copy the files in gui/www/ to a web server. All processing is done in the browser; there is no backend service to run.

Browser compatibility: The web interface works well in recent versions of Chrome and Firefox. Chrome seems more likely to run out of memory when loading large .shp files (say, >300MB). Exporting doesn't work in Safari. Opera and Internet Explorer are not supported.

To run the mapshaper gui directly from the filesystem, open gui/www/index.html in a web browser. Firefox works well in this mode; offline exporting is not fully supported in Chrome.

##Commandline tool

bin/mapshaper is a [Node.js](http://nodejs.org) script. It was developed on OS X and is untested on other platforms.
 
`$ mapshaper -p 0.1 counties.shp`  Retain 10% of removable vertices using default simplification.

`$ mapshaper -i 100 states.shp --dp `  Remove features smaller than ~100 meters using Douglas-Peucker simplification.

`$ mapshaper -h` Read a help message.

##Building and testing

You will need to regenerate mapshaper.js if you edit any of the files in the src/ or lib/ directories. Run `$ build` to update mapshaper.js (used by the commandline tool); run `$ build gui` to update gui/www/mapshaper.js (used by the web interface). The build script requires [Node.js](http://nodejs.org).

`$ build [gui] -f` continuously monitors source files and regenerates  mapshaper.js whenever a source file is modified.

Run `$ mocha` in the project directory to run mapshaper's unit tests.


##License

This software is licensed under the [MPL](http://www.mozilla.org/MPL/2.0/) 2.0

According to Mozilla's [FAQ](http://www.mozilla.org/MPL/2.0/FAQ.html), "The MPL's "file-level" copyleft is designed to encourage contributors to share modifications they make to your code, while still allowing them to combine your code with code under other licenses (open or proprietary) with minimal restrictions."

##Upcoming features + wish list

To suggest additions to this list, add a github issue.

- GeoJSON input
- Import Shapefile attribute table (.dbf file)
- Selection and aggregation, using attribute queries and mouse selection
- Ability to prevent or remove polygon overlaps and self-intersections
- Update the original "modified Visvalingam" method, add control over degree of smoothing.
- Experiment with new simplification and smoothing methods.

