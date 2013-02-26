###High priority

- Graphical interface, similar to the original Flash-based mapshaper web app
- Testing with a set of snippets from Shapefiles that isolate particular problems and toy files
- Option to export polyline file attributed with boundary type
- Prevent shapes from being simplified away, as an option (Matthew Ericson)
- Let users specify degree of simplification in projected coordinates (currently by percent only)
- Finish support for simplifying unprojected Shapefiles using spherical coordinates
- Heal minor topology problems

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
