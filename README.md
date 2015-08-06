# mapshaper

### Introduction

Mapshaper is software for editing Shapefile, GeoJSON, [TopoJSON](https://github.com/mbostock/topojson/wiki) and several other data formats, written in JavaScript.

The `mapshaper` command line program supports common map making tasks like simplifying shapes, editing attribute data, clipping, erasing, dissolving, filtering and more.

There is a [web UI](http://www.mapshaper.org) that supports interactive simplification and attribute editing. The web interface also has as a built in console for running cli commands.

See the [project wiki](https://github.com/mbloch/mapshaper/wiki) for documentation on using mapshaper.

To suggest improvements, add an [issue](https://github.com/mbloch/mapshaper/issues).

To learn about recent updates, read the [changelog](https://github.com/mbloch/mapshaper/releases).

### Command line tool

The `mapshaper` command line program has been used successfully under Mac OS X, Linux and Windows.

The project wiki has an [introduction](https://github.com/mbloch/mapshaper/wiki/Introduction-to-the-Command-Line-Tool) to using the command line tool that includes many simple examples.

For a detailed reference, see the [Command Reference](https://github.com/mbloch/mapshaper/wiki/Command-Reference).

### Interactive tool

The web UI works in recent versions of Chrome and Firefox as well as IE 10+. Exporting is not supported in Safari. If you encounter out-of-memory errors using Chrome, try Firefox, which can handle Shapefiles larger than 1GB.

The mapshaper distribution includes the script `mapshaper-gui`, which runs mapshaper's web interface locally. You can also visit [mapshaper.org](http://www.mapshaper.org) to use mapshaper online.

All processing is done in the browser, so your data stays private, even when using the public website.

### Installation

Mapshaper requires [Node.js](http://nodejs.org/download/) or [io.js](https://iojs.org).

With Node or io.js installed, you can install the latest release version of mapshaper using npm. Install with the "-g" flag to make the executable scripts available systemwide.

```bash
npm install -g mapshaper
```

To install and run the latest development code from github:

```bash
git clone git@github.com:mbloch/mapshaper.git
cd mapshaper
npm install
bin/mapshaper-gui # use the web UI locally
bin/mapshaper     # run the command line program
```

### Building and testing

Run the `build` script after editing any of the files in the src/ or lib/ directories.

Run `npm test` in the project directory to run mapshaper's tests.

### License

This software is licensed under [MPL 2.0](http://www.mozilla.org/MPL/2.0/).

According to Mozilla's [FAQ](http://www.mozilla.org/MPL/2.0/FAQ.html), "The MPL's ‘file-level’ copyleft is designed to encourage contributors to share modifications they make to your code, while still allowing them to combine your code with code under other licenses (open or proprietary) with minimal restrictions."

### Acknowledgements

Gregor Aisch, Mike Bostock, Shan Carter and Zhou Yi, for suggesting improvements and general helpfulness.

Mark Harrower, for collaborating on the original MapShaper program at the University of Wisconsin&ndash;Madison.
