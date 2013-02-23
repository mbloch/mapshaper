
##A wish list for features

- Graphical interface, similar to the original Flash-based mapshaper web app
- Add support for reading/writing TopoJSON, improve GeoJSON support, consider supporting other formats
- Prepare a set of test files, either snippets from Shapefiles that isolate particular problems or toy files
- Heal minor topology problems
- Option to export polyline file attributed with boundary type
- Prevent shapes from being simplified away, as an option (Matthew Ericson)
- Add parameter to specify the degree of smoothing w/ modified Visvalingam
- Work on preventing or removing intersections
- Selections and aggregations, using attributes or geometry
- Option to specify different simplification to a selection of parts or shapes
- Option to export aggregated layers alongside original layer (e.g. states + country from county-level data)
- Start a Wiki for tips and discussion
- Think about replacing depencency on old utility functions with underscore.js