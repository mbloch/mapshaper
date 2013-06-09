#mapshaper

Tools for topologically-aware Shapefile simplification

###Interactive tool

- To setup the mapshaper gui for online use, copy the files in gui/www/ to a web server. All processing in done in the browser, there is no backend process to run.

- You can run the mapshaper gui directly from the filesystem by opening gui/www/index.html in a web browser.

- Mapshaper works well in recent versions of Chrome, Safari and Firefox.

###Commandline tool

- `bin/mapshaper` is a [Node.js](http://nodejs.org) script.

- Example commands:
 
	`$ mapshaper -p 0.1 counties.shp` Retain 10% of removable vertices using default simplification.

	`$ mapshaper -i 100 states.shp --dp` Remove features smaller than ~100 meters using Douglas-Peucker simplification

	`$ mapshaper -h` Print help information

###Building and testing

- The `build` script rebuilds the JavaScript files used by the commandline and gui interfaces. Run `$ build` and `$ build gui` if you make any changes to files in the src/ directory. `$ build [gui] -f` watches for changes to source files and auto-updates the library files.

- Run `$ mocha` or `$ mocha -R spec` in the project directory to run the tests.

###Wish list

- Support for GeoJSON, TopoJSON and other formats.
- Support for creating and exporting selections and aggregations.
- Update the original "modified Visvalingam" method, add control over degree of smoothing
- Work on preventing or removing vector intersections
- Experiment with more advanced simplification and smoothing methods
