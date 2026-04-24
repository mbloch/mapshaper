---
title: Using Mapshaper from Node.js
description: Integrating Mapshaper into JavaScript builds and applications via its Node.js API.
---

# Using Mapshaper from Node.js

This page is for developers who want to use Mapshaper's geoprocessing functions inside their own programs &mdash; either by shelling out to the CLI from a build tool, or by calling Mapshaper's API from Node.js code directly.

## Calling the CLI from a build tool

The simplest way to script Mapshaper is to invoke the `mapshaper` (or `mapshaper-xl`) command from `make` or a shell script.

Example `Makefile` target:

```make
europe.topojson: shp/world_countries.shp
	mapshaper $< \
	  -filter "CONTINENT == 'Europe'" \
	  -simplify interval=100m keep-shapes \
	  -o $@
```

An alternative to embedding a long series of Mapshaper commands on the command line is to put them in a `.txt` file and pass the file to `mapshaper`. See [command files](/docs/reference.html#command-files) and [variable interpolation](/docs/reference.html#variable-interpolation) in the reference.

## The Node.js API

Mapshaper exposes three top-level functions for running editing commands programmatically. All three accept the same command-line string format as the `mapshaper` CLI.

### `runCommands(commands[, input][, callback])`

Runs a command line against files on disk (or in-memory). The `-o` command(s) write their output to disk.

- `commands` &mdash; a command-line string.
- `input` (optional) &mdash; an object whose keys are filenames and whose values are file contents. Files referenced by `-i` are looked up here first, then on the filesystem.
- `callback` (optional) &mdash; a Node-style `function(err)`. Without a callback, `runCommands` returns a Promise.

```javascript
import mapshaper from 'mapshaper';

await mapshaper.runCommands('-i shapefiles/*.shp -o geojson/ format=geojson');
```

### `applyCommands(commands[, input][, callback])`

Same signature as `runCommands`, but instead of writing files to disk, the contents produced by `-o` are returned to the caller as a `{ filename: Buffer }` object. Useful for processing data without touching the filesystem.

```javascript
import mapshaper from 'mapshaper';

const input = { 'input.csv': 'lat,lng,value\n40.3,-72.3,1000' };
const cmd   = '-i input.csv -points x=lng y=lat -o output.geojson';

const output = await mapshaper.applyCommands(cmd, input);
// output['output.geojson'] is a Buffer containing GeoJSON
```

### `runCommandsXL(commands[, options][, callback])`

Like `runCommands`, but the work runs in a child Node process configured with a larger maximum heap (8 GB by default). Equivalent to running `mapshaper-xl` from the command line. Override the heap size with the `xl` option:

```javascript
await mapshaper.runCommandsXL(commands, { xl: '16gb' });
```

This function reads input only from the filesystem &mdash; there's no `input` argument as on `runCommands`/`applyCommands`.

## Working with Shapefiles in `applyCommands`

Shapefiles are really a set of component files. To import one through `applyCommands`, pass the contents of all the parts you care about:

- `.shp` &mdash; geometry (Buffer or ArrayBuffer)
- `.dbf` &mdash; attribute table (Buffer or ArrayBuffer)
- `.prj` &mdash; coordinate system (string)

Without `.dbf` you'll get geometry but no attributes; without `.prj`, projection-dependent commands won't have a coordinate system to work from.

```javascript
const input = {
  'world.shp': shpBuffer,
  'world.dbf': dbfBuffer,
  'world.prj': prjString
};
const output = await mapshaper.applyCommands(
  '-i world.shp -simplify 10% -o world.geojson', input
);
```

## Versioning

The Node API is stable across minor Mapshaper releases, but new options and commands appear regularly. The full set of accepted command-line options is the same as the CLI's, so the [command reference](/docs/reference.html) is the authoritative list of what you can put into the `commands` string.
