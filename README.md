# Mapshaper

## Introduction

Mapshaper is software for editing Shapefile, GeoJSON, [TopoJSON](https://github.com/mbostock/topojson/wiki), CSV and several other data formats, written in JavaScript.

Mapshaper supports essential map making tasks like simplifying shapes, editing attribute data, clipping, erasing, dissolving, filtering and more.

See the [project wiki](https://github.com/mbloch/mapshaper/wiki) for documentation on how to use mapshaper.

To suggest improvements, add an [issue](https://github.com/mbloch/mapshaper/issues).


## Command line tools

Mapshaper includes several command line programs, which can be run under Mac OS X, Linux and Windows.

* `mapshaper` Runs mapshaper commands.
* `mapshaper-bun` Runs mapshaper commands with [bun](https://bun.sh/) instead of node.
* `mapshaper-xl` Works the same as `mapshaper`, but runs with more RAM to support larger files.
* `mapshaper-gui` Runs the mapshaper Web interface locally.

The project wiki has an [introduction](https://github.com/mbloch/mapshaper/wiki/Introduction-to-the-Command-Line-Tool) to using the command line tool that includes many simple examples.

For a detailed reference, see the [Command Reference](https://github.com/mbloch/mapshaper/wiki/Command-Reference).


## Interactive web interface

Visit the public website at [www.mapshaper.org](http://www.mapshaper.org) or use the web UI locally via the `mapshaper-gui` script.

All processing is done in the browser, so your data stays private, even when using the public website.

The web UI works in recent desktop versions of Chrome, Firefox, Safari and Internet Explorer. Safari before v10.1 and IE before v10 are not supported.

## User-contributed resources

[rmapshaper](https://github.com/ateucher/rmapshaper) is an R package written by Andy Teucher that gives R users access to many of mapshaper's editing commands.

[Here](https://hub.docker.com/r/freifunkhamm/mapshaper) are resources for using mapshaper with Docker, provided by Christian Weiss.

You can find a number of mapshaper tutorials online, including a [two](https://moriartynaps.org/command-carto-part-one/) [part](https://moriartynaps.org/command-line-carto-two/) guide to command line cartography by Dylan Moriarty and [this introduction](https://handsondataviz.org/mapshaper.html) by Jack Dougherty.


## Large file support

**Web interface**

Firefox is able to load Shapefiles and GeoJSON files larger than 1GB. Chrome has improved in recent versions, but is still prone to out-of-memory errors when importing files larger than several hundred megabytes.

**Command line interface**

There are hard limits for reading and writing most file types. The maximum output size of a single file of any type is 2GB. Some file types (GeoJSON, CSV, .shp, .dbf) are read incrementally, so much larger files can be imported.

When working with very large files, mapshaper may become unresponsive or crash with the message "JavaScript heap out of memory."

You can use `mapshaper-xl` as a replacement for the standard `mapshaper` program to allocate more heap memory (8GB by default). You can allocate even more memory like this: `mapshaper-xl 20gb [commands]`.

Another option is to run Node directly with the `--max-old-space-size` option. The following example (Mac or Linux) allocates 16GB of heap memory:
```bash
$ node  --max-old-space-size=16000 `which mapshaper` <mapshaper commands>
```

## Installation

Mapshaper requires [Node.js](http://nodejs.org).

With Node installed, you can install the latest release version of mapshaper using npm. Install with the "-g" flag to make the executable scripts available systemwide.

```bash
npm install -g mapshaper
```

To install and run the latest development code from github:

```bash
git clone git@github.com:mbloch/mapshaper.git
cd mapshaper
npm install       # install dependencies
npm run build     # bundle source code files
npm link          # (optional) add global symlinks so scripts are available systemwide
```

## Building and testing

From the project directory, run `npm run build` to build both the cli and web UI modules.

Run `npm test` to run mapshaper's tests.

## License

This software is licensed under [MPL 2.0](http://www.mozilla.org/MPL/2.0/).

According to Mozilla's [FAQ](http://www.mozilla.org/MPL/2.0/FAQ.html), "The MPL's ‘file-level’ copyleft is designed to encourage contributors to share modifications they make to your code, while still allowing them to combine your code with code under other licenses (open or proprietary) with minimal restrictions."



## Acknowledgements

My colleagues at The New York Times, for countless suggestions, bug reports and general helpfulness.

Mark Harrower, for collaborating on the original "MapShaper" program at the University of Wisconsin&ndash;Madison.
