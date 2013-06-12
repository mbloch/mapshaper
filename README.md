#mapshaper

Tools for topologically-aware Shapefile simplification

###Interactive tool

- To setup mapshaper's web interface for online use, copy the files in gui/www/ to a web server. All processing is done in the browser, there is no backend service to run.

- The web interface works well in recent versions of Chrome and Firefox. Exporting doesn't work in Safari, Internet Explorer 10 hasn't been tested, Opera and IE9- don't work at all.

- To run the mapshaper gui directly from the filesystem, open gui/www/index.html in a web browser. Firefox works well in this mode, exporting is not fully supported in Chrome.

###Commandline tool

- `bin/mapshaper` is a [Node.js](http://nodejs.org) script.

- Example commands:
 
	`$ mapshaper -p 0.1 counties.shp`  Retain 10% of removable vertices using default simplification.

	`$ mapshaper -i 100 states.shp --dp `  Remove features smaller than ~100 meters using Douglas-Peucker simplification.

	`$ mapshaper -h` Get help.

###Building and testing

- The `build` script rebuilds the JavaScript libraries used by the commandline and web interfaces. Run `$ build` and `$ build gui` after editing files in the src/ directory. `$ build [gui] -f` continuously monitors the source files and updates the library files when files are modified.

- Run `$ mocha` or `$ mocha -R spec` in the project directory to run tests.

###Wish list

- Support for GeoJSON, TopoJSON and other formats.
- Support for creating and exporting selections and aggregations.
- Update the original "modified Visvalingam" method, add control over degree of smoothing.
- Work on preventing or removing vector intersections.
- Experiment with more advanced simplification and smoothing methods.
