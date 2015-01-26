# mapshaper

### Introduction

Mapshaper is software for editing Shapefile, GeoJSON and [TopoJSON](https://github.com/mbostock/topojson/wiki) files, written in JavaScript.

The `mapshaper` command line program supports common map making tasks like simplifying shapes, editing attribute data, clipping, erasing, dissolving, filtering and more.

There is a [web-based gui](http://www.mapshaper.org) for interactive simplification.

See the [project wiki](https://github.com/mbloch/mapshaper/wiki) for documentation on using mapshaper.

To suggest improvements, add an [issue](https://github.com/mbloch/mapshaper/issues).

### Command line tool

The `mapshaper` command line program has been used successfully under Mac OS X, Linux and Windows.

The project wiki has an [introduction](https://github.com/mbloch/mapshaper/wiki/Introduction-to-the-Command-Line-Tool) to using the command line tool that includes many simple examples.

For a detailed reference, see the [Command Reference](https://github.com/mbloch/mapshaper/wiki/Command-Reference).

### Interactive tool

The interactive web interface works in recent versions of Chrome and Firefox as well as IE 10+. Exporting is not supported in Safari. If you encounter out-of-memory errors using Chrome, try Firefox, which can handle Shapefiles larger than 1GB.

The mapshaper distribution includes the script `mapshaper-gui`, which runs mapshaper's web interface locally. You can also visit [mapshaper.org](http://www.mapshaper.org) to use mapshaper online.

All processing is done in the browser, so your data stays private, even when using the public website.

### Installation

Mapshaper requires [Node.js](http://nodejs.org). There are easy [installers](http://nodejs.org/download/) for Microsoft Windows and other platforms.

With Node installed, you can install the latest release version using npm. Install with the "-g" flag to make the executable scripts available systemwide.

```bash
npm install -g mapshaper
```

To install and run the latest development code from github:

```bash
git clone git@github.com:mbloch/mapshaper.git
cd mapshaper
npm install
bin/mapshaper-gui # use the web interface locally
bin/mapshaper     # use the command line tool
```

### Building and testing

Run the `build` script after editing any of the files in the src/ or lib/ directories.

Run `npm test` in the project directory to run mapshaper's tests.

### License

This software is licensed under [MPL 2.0](http://www.mozilla.org/MPL/2.0/).

According to Mozilla's [FAQ](http://www.mozilla.org/MPL/2.0/FAQ.html), "The MPL's ‘file-level’ copyleft is designed to encourage contributors to share modifications they make to your code, while still allowing them to combine your code with code under other licenses (open or proprietary) with minimal restrictions."

### Acknowledgements

[Mike Bostock](https://github.com/mbostock), for developing the TopoJSON format and for all-around helpfulness.

[Shan Carter](https://github.com/shancarter), for help designing mapshaper's web interface.

Mark Harrower, for collaborating on the [original MapShaper program](http://mapshaper.com/test/OldMapShaper.swf) at the University of Wisconsin&ndash;Madison.
