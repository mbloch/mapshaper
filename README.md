#mapshaper

Tools for topologically-aware Shapefile simplification

###Interactive tool

- To setup the mapshaper gui for online use, copy the files in gui/www/ to a web server. All processing is done in the browser, there is no backend service to run.

- To run the mapshaper gui directly from the filesystem, open gui/www/index.html in a web browser.

- Mapshaper works well in recent versions of Chrome, Safari and Firefox.

###Commandline tool

- `bin/mapshaper` is a [Node.js](http://nodejs.org) script.

- Example commands:
 
	`$ mapshaper -p 0.1 counties.shp` Retain 10% of removable vertices using default simplification.

	`$ mapshaper -i 100 states.shp --dp` Remove features smaller than ~100 meters using Douglas-Peucker simplification.

	`$ mapshaper -h` Print help information.

###Building and testing

- The `build` script rebuilds the JavaScript libraries used by the commandline and web interfaces. Run `$ build` and `$ build gui` after editing files in the src/ directory. `$ build [gui] -f` continuously monitors the source files and updates the library files when files are modified.

- Run `$ mocha` or `$ mocha -R spec` in the project directory to run tests.

###Wish list

- Support for GeoJSON, TopoJSON and other formats.
- Support for creating and exporting selections and aggregations.
- Update the original "modified Visvalingam" method, add control over degree of smoothing.
- Work on preventing or removing vector intersections.
- Experiment with more advanced simplification and smoothing methods.
