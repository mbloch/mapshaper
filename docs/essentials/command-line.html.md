---
title: The command-line tool
description: Install the mapshaper CLI, run your first commands and learn how Mapshaper organizes data into layers.
---

# The command-line tool

Mapshaper ships as a command-line tool and a [web app](/docs/essentials/web-app.html.md). This page is a tour of the CLI and the most common things you'll use it for.

## Install

Mapshaper requires [Node.js](https://nodejs.org). With Node installed:

```bash
npm install -g mapshaper
```

That gives you three executables:

- `mapshaper` &mdash; the main CLI.
- `mapshaper-xl` &mdash; same as `mapshaper`, but launched with a larger Node heap (8 GB by default) for processing very large files. Override the limit with `mapshaper-xl 16gb [commands]`.
- `mapshaper-gui` &mdash; runs the [web UI](/docs/essentials/web-app.html.md) locally on `http://localhost:5555`.

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

For the full reference, see the [command reference](/docs/reference.html.md).

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

For a broader set of recipes — filtering, joining, dissolving, reprojection, styling and more — see [Basics](/docs/examples/basics.html.md).

## Working with layers

Most commands operate on **layers** of data features. A layer is a collection of features with the same geometry type and a consistent attribute schema. Mapshaper supports polygon, polyline and point layers; a single feature may contain one shape, multiple shapes, or no shapes at all.

The simplest case is a single layer in, a single layer out:

```bash
mapshaper counties.shp -filter 'this.isNull === false' -o counties_notnull.shp
```

When a command runs on a multi-layer dataset, it acts on the **target** layer(s). Most commands accept a `target=` option, and the [`-target`](/docs/reference.html.md#-target) command sets the target for everything that follows.

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

## Command files

As an alternative to typing commands on the command line, you can put them in a plain-text command file and run them with the mapshaper CLI.

Command files offer a few conveniences over a shell script or Makefile:

- Hash-delimited (`#`) comments, both on their own line and at the end of a line.
- No need to escape `*` or other shell metacharacters; commands aren't passed through the shell.
- Trailing-backslash line continuations are accepted but not required &mdash; lines that don't begin with `-` are joined onto the previous command.
- Variable interpolation using `{{VAR}}` placeholders. See [variables](#variables) below.

(Support for running command files in the mapshaper web UI is planned for a future release.)

### File format

A mapshaper command file is a `.txt` file whose first non-blank, non-comment line starts with `mapshaper`.

```
mapshaper
-i provinces.shp
# Use Douglas Peucker simplification
-simplify dp 20%
-o precision=0.00001 output.geojson
```

If you write the command file using shell-compatible syntax &mdash; trailing `\` for line continuations and no `#` comments &mdash; it can also be pasted directly onto a bash command line, where the leading `mapshaper` word invokes the CLI. To make the above example shell compatible, you could write:

```
mapshaper \
-i provinces.shp \
-simplify dp 20% \
-o precision=0.00001 output.geojson
```

### Running a command file

The command for running a command file is [`-run`](#-run):

```bash
mapshaper -run build.txt
```

`mapshaper commands.txt` is a shortcut for `mapshaper -run commands.txt`.

## Variable interpolation

Command files and command lines may contain `{{VAR}}` placeholders, which are substituted just before each command runs. Two forms are recognized:

- `{{VAR}}` &mdash; substituted with the value of `VAR`.
- `{{env.NAME}}` &mdash; substituted with the value of the `NAME` environment variable.

This syntax allows you to interpolate all or part of a command option. For example, `-simplify {{SIMPLIFY_METHOD}} resolution={{SIMPLIFY_RESOLUTION}}`.

Variables can be set in several ways:
- The [`-vars`](#-vars) command sets one or more variables, always overwriting any previous value.
- The [`-defaults`](#-defaults) command set only those values that do not already exist.
- Assignments in `-calc` and `-define` expressions create new variables.
- Assigning a property to the `global` object in an `-each` expression creates a new variable.

`-vars` and `-defaults` write to a templating-scope store; the other commands write to an expression-scope store (`global`). `{{X}}` substitution checks the templating scope first and falls back to the expression scope, so values from any of the four mechanisms above are reachable. Bare names in JS expressions only see the expression scope &mdash; a name set by `-vars` is *not* readable by bare name from inside `-each`, `-filter`, etc. See [JavaScript expressions](/docs/guides/expressions.html.md#sharing-state-across-commands) for the full story.

#### Example

`build.txt`:
```
mapshaper
-defaults YEAR=2024 PCT=10                    # overridable defaults
-i sources/counties_{{YEAR}}.shp
-simplify {{PCT}}%
-o out/counties_{{YEAR}}_simplified.shp
```

Run with the command file's defaults:
```bash
mapshaper build.txt
```

Or override default values from the command line:
```bash
mapshaper -vars YEAR=2030 PCT=5 -run build.txt
```
