---
title: The command-line tool
description: Install the mapshaper CLI, run your first commands and learn how Mapshaper organizes data into layers.
---

# The command-line tool

Mapshaper ships as a command-line tool and a [web app](/docs/essentials/web-app.html). This page is a tour of the CLI and the most common things you'll use it for.

## Install

Mapshaper requires [Node.js](https://nodejs.org). With Node installed:

```bash
npm install -g mapshaper
```

That gives you three executables:

- `mapshaper` &mdash; the main CLI.
- `mapshaper-xl` &mdash; same as `mapshaper`, but launched with a larger Node heap (8 GB by default) for processing very large files. Override the limit with `mapshaper-xl 16gb [commands]`.
- `mapshaper-gui` &mdash; runs the [web UI](/docs/essentials/web-app.html) locally on `http://localhost:5555`.

You can also run mapshaper without installing it via [Bun](https://bun.sh/) (`bunx mapshaper [commands]`) or with `npx mapshaper [commands]`.

Check the install with:

```bash
mapshaper -v
```

## Anatomy of a Mapshaper command

A Mapshaper invocation is a sequence of commands run left-to-right. Each command starts with a hyphen-prefixed name and is followed by zero or more options. The initial `-i` (input) command is implied if the first argument is a file path.

```bash
mapshaper provinces.shp -simplify dp 20% -o precision=0.00001 output.geojson
```

This reads a Shapefile, simplifies it using the Douglas-Peucker algorithm to 20% of its vertices, and writes a GeoJSON file with rounded coordinates.

Options come in three forms:

- **Values** like `provinces.shp` and `output.geojson`.
- **Flags** like `dp`.
- **Name/value pairs** like `precision=0.00001`.

For the full reference, see the [command reference](/docs/reference.html).

## Some examples

### Get help

```bash
mapshaper -h                 # list all commands
mapshaper -h simplify        # detailed options for one command
```

### Chain commands

```bash
# From census blocks: dissolve populated Census blocks to tract level.
mapshaper tabblock2010_36_pophu.shp \
  -filter 'POP10 > 0' \
  -each 'TRACT=BLOCKID10.substr(0,11)' \
  -dissolve TRACT sum-fields=POP10 \
  -o tracts.shp
```

```bash
# Generate state and national boundaries from one county-level Shapefile.
# Output: states.shp, usa.shp and other Shapefile component files
mapshaper counties.shp \
  -dissolve STATE_FIPS name=states \
  -dissolve + name=usa \
  -o target='*'
```

For a broader set of recipes — filtering, joining, dissolving, reprojection, styling and more — see [Basics](/docs/examples/basics.html).

## Working with layers

Most commands operate on **layers** of data features. A layer is a collection of features with the same geometry type and a consistent attribute schema. Mapshaper supports polygon, polyline and point layers; a single feature may contain one shape, multiple shapes, or no shapes at all.

The simplest case is a single layer in, a single layer out:

```bash
mapshaper counties.shp -filter 'this.isNull === false' -o counties_notnull.shp
```

When a command runs on a multi-layer dataset, it acts on the **target** layer(s). Most commands accept a `target=` option, and the [`-target`](/docs/reference.html#-target) command sets the target for everything that follows.

The `+` option keeps the original layer and creates a new one from the command's output. Combined with `name=`, it's the idiomatic way to derive a new layer:

```bash
# Output: out/provinces.json and out/lines.json
mapshaper provinces.shp \
  -simplify 20% \
  -innerlines + name=lines \
  -target provinces,lines \
  -o format=geojson out/
```

This produces `out/provinces.json` and `out/lines.json`.

When importing a TopoJSON file, each named object becomes a layer:

```bash
mapshaper usa.topojson \
  -filter 'STATE == "HI"' target=states \
  -o out/hawaii.geojson
```
