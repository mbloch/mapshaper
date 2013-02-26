###mapshaper is a tool for simplifying polygon datasets.

- Currently, there is a commandline script (bin/mapshaper) that runs in Node.js. A graphical interface is in the works.
- To view a list of options and examples, run `$ mapshaper -h`.
- Simplification methods include: Douglas-Peucker, Visvalingam and a modified version of Visvalingam's algorithm designed to smooth spiky features.
- Mapshaper currently reads Shapefiles and writes Shapefiles and GeoJSON files.
- Run `$ build` in the project directory to rebuild the mapshaper library from source files.
- See TODO.md for a list of planned features.
