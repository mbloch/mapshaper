
###Using mapshaper

- Currently, there is a commandline script (bin/mapshaper) that runs in Node.js. A graphical interface is in the works.
- To view a list of options and examples, run `$ mapshaper -h`.
- Simplification methods include: Douglas-Peucker, Visvalingam and a modified version of Visvalingam's algorithm designed to smooth spiky features.
- Mapshaper currently reads Shapefiles and writes Shapefiles and GeoJSON files.


###Building
- Run `$ build` in the project directory to rebuild the mapshaper library from source files.
- Run `$ mocha -R spec` in the project directory to run the tests


###Wish list

- Start a Wiki for tips and discussion
- Improved GeoJSON support, reading/writing TopoJSON, support for other formats via OGR2OGR bindings
- Support for selections and aggregations using attributes or geometry
- Option to specify different simplification for a selection of parts or shapes
- Option to export aggregated layers alongside original layer (e.g. states + country from county-level data)
- Update the original "modified Visvalingam" method, add control over degree of smoothing
- Think about replacing depencency on old utility functions with underscore.js
- Work on preventing or removing vector intersections
- Experiment with more advanced simplification methods and smoothing
