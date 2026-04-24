---
title: JavaScript expressions
description: Reference for the JS expressions used in -each, -filter, -calc, -where, -sort, -if, -run and other Mapshaper commands.
---

# JavaScript expressions

Many Mapshaper commands take a **JS expression** as an argument or option. Expressions let you read and write per-feature attributes, derive new fields, filter records, sort, generate templated commands, and inspect layer-level metadata. The same expression syntax and execution context are reused across commands, so once you've learned the shape of a `-each` expression you can use it almost everywhere.

```bash
mapshaper counties.shp \
  -each 'STATE_FIPS = COUNTY_FIPS.substr(0, 2),
         AREA_KM2 = this.area / 1e6' \
  -o out.shp
```

Expressions are plain JavaScript. They can use any built-in language feature (arithmetic, string methods, conditionals, regex, etc.). Some commands also expect the expression to return a particular kind of value &mdash; `-filter` and `-inspect` expect `true` or `false`, `-sort` expects a sort key, `-split` expects a group identifier, and so on.

## Where expressions appear

| Command | Expression role | Type |
| --- | --- | --- |
| [`-each`](/docs/reference.html#-each) | Run side-effects per feature, including assignments to data fields | feature |
| [`-filter`](/docs/reference.html#-filter) | Boolean test, kept if `true` | feature, returns boolean |
| [`-sort`](/docs/reference.html#-sort) | Returns the sort key for each feature | feature |
| [`-inspect`](/docs/reference.html#-inspect) | Boolean test, prints matching feature(s) | feature, returns boolean |
| [`-split`](/docs/reference.html#-split) | Returns the value used to group features into output layers | feature |
| [`-subdivide`](/docs/reference.html#-subdivide) | Boolean test driving recursive partitioning, can call group functions like `sum()` | feature, returns boolean |
| [`-calc` and `calc=` options](/docs/reference.html#-calc) | Aggregations across a group of features (`sum`, `count`, `median`, etc.) | calc |
| `where=` (on `-filter`, `-each`, `-affine`, `-dashlines`, `-dissolve`, `-innerlines`, `-join`, `-style`, `-symbols`, `-calc`) | Sub-filter applied before the main operation | feature, returns boolean |
| `weight=` on `-dissolve`/`-points` | Weighting expression for centroid calculation | feature |
| Attribute options on [`-style`](/docs/reference.html#-style) and [`-symbols`](/docs/reference.html#-symbols) | Most values (`fill=`, `stroke=`, `stroke-width=`, `opacity=`, `r=`, `label-text=`, `dx=`, `dy=`, `font-size=`, etc.) accept either a literal or a JS expression evaluated per feature | feature |
| [`-lines where=` and `each=`](/docs/reference.html#-lines) | Operates on **pairs** of features either side of a path, exposed as `A` and `B` | pair |
| [`-if` / `-elif`](/docs/reference.html#-if) | Boolean test on layer-level metadata | layer |
| [`-define`](/docs/reference.html#-define) | Stores variables and helper functions in a global namespace shared by later expressions | layer |
| [`-run`](/docs/reference.html#-run) | Generates command strings, with embedded `{...}` template substitutions | template |

<!-- | `bbox=` on `-rectangles` | Returns a `[xmin, ymin, xmax, ymax]` per feature | feature | -->
These five flavors &mdash; **feature**, **calc**, **pair**, **layer** and **template** &mdash; share most of their context but differ in which variables are available and which functions are in scope.

## The execution context

Inside any feature-level expression you have access to:

- **Field names as bare variables.** Reading a field name returns its value. Assigning to a field name updates the current feature's record (and creates the field on first use). If a field name is not a valid JavaScript identifier (e.g. it contains spaces or starts with a digit), use `d["field name"]` to reference it.
- **`this`**, the feature proxy. Provides geometry-derived properties (`this.area`, `this.bbox`, etc.) and read/write access to the feature's `properties`, `geojson` and `coordinates`.
- **`d`**, a reference to the data record (the same object as `this.properties`).
- **`global`**, an object that persists across commands. Variables created by `-define`, by assignment in a `-calc` expression, or by writing to `global.foo = ...` inside `-each` end up here. Values set by [`-vars`](/docs/reference.html#-vars) and [`-defaults`](/docs/reference.html#-defaults) live in a separate *templating* scope (read by `{{X}}` substitution) and are **not** visible by bare name in expressions; use `-define` if you want a value reachable from both `{{X}}` and JS expressions.
- **`console.log()`** for printing values to stderr while debugging.
- **Built-in helpers** (see [Helper functions](#helper-functions) below).
- **User helpers** loaded by [`-define`](/docs/reference.html#-define), [`-include`](/docs/reference.html#-include) or [`-require`](/docs/reference.html#-require).

If a name is referenced but not present in any of the above, JavaScript treats it as `undefined`, *not* an error. This is convenient when chaining expressions across heterogeneous datasets but can mask typos &mdash; double-check field names with `mapshaper -info` if a `-filter` returns a suspiciously empty result.

### Field assignment

Assigning to a bare name creates or updates a data field on the current feature:

```bash
mapshaper counties.shp -each 'POP_DENSITY = POPULATION / (this.area / 1e6)' -o
```

Bare assignments like `POP_DENSITY = ...` will create the data table if the layer doesn't already have one. Assignments routed through `this.properties.X = ...` or `d.X = ...` only update an existing data table &mdash; prefer a bare assignment if you're not sure the layer has one yet.

To delete a field, use the JS `delete` operator:

```bash
mapshaper states.shp -each 'delete STATE_NAME, delete GEOID' -o
```

To replace the entire record, assign to `this.properties`:

```bash
mapshaper states.shp -each 'this.properties = {FID: this.id, NAME: NAME}' -o
```

### Multiple statements

Use commas to evaluate multiple sub-expressions. The value of the whole expression is the value of the last sub-expression (relevant for `-filter`, `-sort`, `-split`):

```bash
mapshaper data.csv -each 'A = parseInt(A), B = A * 2, C = A + B'
```

Inside command files, you can also break a long expression across lines with `\`:

```
-each '
  STATE_FIPS = COUNTY_FIPS.substr(0, 2),  \
  AREA_KM2   = this.area / 1e6,           \
  CENTROID_X = this.centroidX,            \
  CENTROID_Y = this.centroidY
'
```

## Feature properties (`this`)

`this` is a proxy for the current feature. It gives you geometry-derived properties and a few editing affordances. The properties below are read-only unless the description says otherwise.

### All layer types

| Name | Description |
| --- | --- |
| `this.id` | 0-based numerical id of the feature |
| `this.layer_name` | Name of the layer (or empty string) |
| `this.properties` | Data record. Read/write &mdash; assign a new object to replace all attributes. |
| `this.layer` | Layer proxy &mdash; see [Layer-level properties](#layer-level-properties-thislayer) |
| `this.geojson` | GeoJSON Feature (geometry + properties). Read/write &mdash; assign a new Feature to replace this one. |
| `this.geometry` | Just the GeoJSON geometry. Read/write. |

### Polygon, polyline and point layers (with geometry)

| Name | Description |
| --- | --- |
| `this.partCount` | 1 for single-part features, >1 for multi-part, 0 for null |
| `this.isNull` | `true` if `partCount === 0` |
| `this.bbox` | `[xmin, ymin, xmax, ymax]` |
| `this.width`, `this.height` | Bounding-box width and height |
| `this.bboxContainsPoint(x, y)` | `true` if the bbox covers the point |
| `this.bboxIntersectsRectangle(a, b, c, d)` | `true` if the bbox overlaps the rectangle |
| `this.bboxContainsRectangle(a, b, c, d)` | `true` if the bbox fully contains the rectangle |
| `this.bboxContainedByRectangle(a, b, c, d)` | `true` if the bbox is fully inside the rectangle |

### Polygon-only

| Name | Description |
| --- | --- |
| `this.area` | Area in source units (square meters for unprojected lat/long, computed on a sphere) |
| `this.planarArea` | Treats lat/long as planar &mdash; useful inside expressions that already account for projection |
| `this.originalArea` | Area before any `-simplify` was applied |
| `this.perimeter` | Perimeter length (meters for unprojected lat/long) |
| `this.compactness` | Polsby-Popper compactness ratio (0&ndash;1) |
| `this.innerPct` | Fraction of the perimeter that is shared with neighboring polygons |
| `this.centroidX`, `this.centroidY` | Centroid coordinates (computed from the largest ring; ignores holes) |
| `this.innerX`, `this.innerY` | An interior point useful for placing a label or symbol |

### Polyline-only

| Name | Description |
| --- | --- |
| `this.length` | Total length (meters for unprojected lat/long) |

### Point-only

| Name | Description |
| --- | --- |
| `this.coordinates` | The full nested coordinate array, or `null`. Read/write &mdash; assign `null` to drop the geometry. |
| `this.x`, `this.y` | Coordinates of the first point of the (possibly multi-) feature. Read/write. |

> **Why it matters for unprojected data:** `this.area` and `this.length` use *spherical* (not planar or ellipsoidal) geometry on lat/long datasets. Results are in square meters / meters and accurate to within ~0.5% for most use cases. If you need ellipsoidal accuracy, project first with `-proj`.

## Layer-level properties (`this.layer`)

`this.layer` exposes information about the layer the feature belongs to. Useful in expressions that need to know about other features:

| Name | Description |
| --- | --- |
| `this.layer.name` | Layer name |
| `this.layer.type` | `'polygon'`, `'polyline'`, `'point'` or `null` |
| `this.layer.size` | Feature count |
| `this.layer.empty` | `true` if `size === 0` |
| `this.layer.bbox` | `[xmin, ymin, xmax, ymax]`, with extra `cx`, `cy`, `width`, `height`, `left`, `right`, `top`, `bottom` properties |
| `this.layer.data` | The full array of data records (use sparingly inside per-feature loops) |
| `this.layer.field_exists(name)` | Returns `true` if a field exists |
| `this.layer.field_type(name)` | Returns `'string'`, `'number'`, `'object'` etc., or `null` |
| `this.layer.field_includes(name, value)` | Returns `true` if any record's `name` field equals `value` |

## Helper functions

These are always in scope inside feature expressions:

- `round(num [, decimals])` &mdash; Round to N decimal places (default 0). Faster and easier than `Math.round`.
- `sprintf(fmt, ...)` &mdash; printf-style formatter (uses [printj](https://github.com/SheetJS/printj) syntax).
- `format_dms(coord [, fmt])` &mdash; Format a number as a degrees/minutes/seconds string. Common formats: `'DD° MM′ SS.SSSSS″ [NS]'`, `'DdMmSs [EW]'`, `'[+-]DDDMM.MMMMM'`, `'[-]DD.DDDDD°'`.
- `parse_dms(string [, fmt])` &mdash; Parse a DMS string back to a number.
- `blend(c1, c2, ...)` &mdash; Mix CSS color strings together (returns a hex string).
- `console.log(...)` &mdash; Write to stderr.

JavaScript's built-in `Math`, `JSON`, `Number`, `String`, `Array`, `Date`, `Object` etc. are all available. Node-specific globals like `process`, `require` and `setTimeout` are not.

## Calc expressions

`-calc` and any command's `calc=` option use the same context as `-each` plus a set of *aggregate* functions that operate over the entire group of features (or the entire layer for `-calc`). Each aggregate function takes a per-feature expression and reduces it to a single value across the group.

| Function | Description |
| --- | --- |
| `count()` | Number of records in the collection |
| `sum(<expr>)` | Sum of the per-feature expression |
| `mean(<expr>)`, `average(<expr>)` | Arithmetic mean |
| `median(<expr>)` | Median value |
| `mode(<expr>)` | Most common value (first one wins ties) |
| `min(<expr>)`, `max(<expr>)` | Extremes |
| `quartile1(<expr>)`, `quartile2(<expr>)`, `quartile3(<expr>)` | Quartiles |
| `iqr(<expr>)` | Interquartile range |
| `quantile(<expr>, <pct>)` | Arbitrary percentile (0&ndash;1) |
| `collect(<expr>)` | Array of all values (preserves order) |
| `collectIds()` | Array of feature ids |
| `first(<expr>)`, `last(<expr>)` | First / last value seen |
| `every(<expr>)`, `some(<expr>)` | Boolean reductions |

Argument expressions use the same syntax as `-each`, so per-feature properties and helpers are available:

```bash
mapshaper counties.shp \
  -calc 'TOTAL_POP = sum(POP),
         MEAN_AREA_KM2 = sum(this.area / 1e6) / count(),
         TOP_DENSITY = max(POP / this.area)'
```

Calc expressions can also use assignments to expose values to subsequent commands via the `global` namespace (see [Sharing state across commands](#sharing-state-across-commands) below).

## Pair expressions (`A` and `B`)

The `-lines where=` and `each=` options operate on path segments shared between two adjacent features. Inside these expressions:

- `A` is the feature on one side of the path
- `B` is the feature on the other side, or `null` for outer boundaries

Both `A` and `B` give you the full set of feature properties (`A.properties`, `A.area`, `A.id`, etc.).

```bash
# Keep only inner boundaries between two different states
mapshaper counties.shp \
  -lines where='B && A.STATE != B.STATE' \
  -o state-borders.shp
```

## Layer-level expressions (`-if`, `-define`)

The `-if` family and `-define` evaluate against the *current command's target layer(s)*, not per feature. The context exposes:

- `target` &mdash; the proxy for the single target layer (only set when there's exactly one target)
- `targets` &mdash; an array-like of layer proxies, also indexable by name (`targets.states`)
- `layer_name`, `data`, `type`, `size`, `empty`, `bbox`
- `field_exists(name)`, `field_type(name)`, `field_includes(name, value)`
- `layer_exists(name [, geometry_type])`
- `file_exists(path)`
- `global` &mdash; the shared variable namespace

```bash
mapshaper data.csv \
  -calc 'N = count()' \
  -if 'global.N < 5' -print 'LOW SAMPLE SIZE, STOPPING' -stop -endif
```

Each entry in `targets` exposes useful summary stats from `-info`: `layer_name`, `feature_count`, `null_shape_count`, `null_data_count`, `bbox`, `proj4`. Reading `targets[0].geojson` returns the layer as a GeoJSON FeatureCollection; assigning to it replaces the layer with the FeatureCollection you provide.

## Template expressions (`-run`)

`-run` accepts either a path to a [command file](/docs/reference.html#command-files) or a string containing one or more curly-brace template expressions. Each `{...}` is evaluated as a JS expression and substituted into the resulting command string before Mapshaper parses it.

```bash
# Project to a transverse Mercator centred on the layer
mapshaper -i country.shp -require projection.js \
  -run '-proj {tmerc(target.bbox)}' -o
```

Inside the curly braces you have:

- `target` and `targets` (same as `-if`)
- `io.ifile(filename, data)` &mdash; spill data to a temp file and yield its path, useful for piping computed JSON back into `-i`
- Anything loaded by `-require` or `-define`

Bare function calls outside curly braces are also evaluated directly, so `-run 'tmerc(target.bbox)'` works the same as `-run '{tmerc(target.bbox)}'` when the function name was loaded via `-require`.

## Loading helpers

Three commands extend the expression context with your own variables and helpers:

- [`-define`](/docs/reference.html#-define) takes an inline JS expression and stores any assignments on the global namespace. Good for one-liners.
- [`-include`](/docs/reference.html#-include) loads a `.js` file containing a single object literal; each property of that object becomes a variable in subsequent expressions.
- [`-require`](/docs/reference.html#-require) loads an installed npm module or a local module file. With `alias=foo` the module is bound to that name; without an alias, the module's exported names are added directly to the context.

```bash
mapshaper data.json \
  -require ./helpers.mjs \
  -each 'displayname = formatName(d)' \
  -o data.json
```

```bash
mapshaper -define 'KM_PER_MILE = 1.609344' \
  routes.geojson \
  -each 'KM = MILES * global.KM_PER_MILE' \
  -o
```

## Sharing state across commands

Mapshaper has two scopes for values that persist between commands. They share a name lookup for `{{X}}` substitution but are otherwise independent.

- **Expression scope (`global`)** &mdash; written by `-define`, `-include`, `-require`, `-colorizer`, and `-calc` assignments (e.g. `N = count()`) or any `global.foo = ...` inside `-each`. Values can be any JavaScript value (numbers, strings, functions, objects). Read by JS expressions as bare names, and as `global.X` everywhere. `{{X}}` substitution falls back to this scope, so `-define base = "out"` &rarr; `-o {{base}}.geojson` and `-calc 'N = count()'` &rarr; `-if '{{N}} > 100'` work as you'd expect.
- **Templating scope** &mdash; written by [`-vars`](/docs/reference.html#-vars) and [`-defaults`](/docs/reference.html#-defaults). Values must be primitives (string / number / boolean / null) and are validated at write time. Read by `{{X}}` substitution; `{{X}}` checks the templating scope first, then falls back to the expression scope. **Not** visible by bare name in JS expressions &mdash; that's deliberate, so a string set by `-vars N=5` can't silently coerce into arithmetic.

If you want one value usable in both contexts, set it once with `-define`. If you only need it in command strings, use `-vars` (or `-defaults` for command-file overridable defaults).

```bash
mapshaper counties.shp \
  -calc 'BIG = count("POP > 1000000")' \
  -if 'global.BIG > 0' \
    -filter 'POP > 1000000' \
    -o big-counties.shp \
  -endif
```

## Common pitfalls

- **Quoting.** In bash/zsh, wrap expressions in single quotes so the shell doesn't expand `!`, `$` or backticks. In Windows `cmd.exe`, use double quotes and escape inner quotes with backslashes. In PowerShell, prefer single quotes, or escape `$` with a backtick.
- **Type coercion from CSVs.** Numeric-looking strings in CSVs are parsed as numbers by default; identifier-like strings (FIPS, ZIP) need `string-fields=` on `-i` to preserve leading zeros. See [CSV practical notes](/docs/formats/csv.html#practical-notes).
- **Field name collisions.** A field called `area`, `length`, `id` etc. shadows the built-in property of the same name. Mapshaper prints a warning. Either rename the field with `-rename-fields`, or read the property via `this.area` rather than the bare name.
- **Lat/long area surprises.** `this.area` on an unprojected polygon returns *square meters on a sphere*, not square degrees. To get square kilometres, divide by `1e6`. To get planar square degrees (e.g. for sanity checks), use `this.planarArea`.
- **Centroids ignore holes.** `this.centroidX/Y` is the centroid of the largest ring. For a labelling point that's guaranteed inside the polygon, use `innerX`/`innerY`.
- **`-each` doesn't return values.** Its expression is evaluated for side-effects only. Use `-filter`, `-sort` or `-calc` if you want the return value to drive behavior.
- **Reserved names.** `this`, `d`, `_`, `global`, `console`, `target`, `targets` and the helper function names listed above are not safe to use as field names.
- **Auto-vivification of fields.** Assigning to a name that isn't a known field creates a new field on every record. If you only want to set a field on *some* records, wrap it in a conditional and assign explicit `null` for the others, otherwise downstream readers may see `undefined` instead of a real null.

## Examples

```bash
# Add two derived fields
mapshaper counties.shp \
  -each 'STATE_FIPS = COUNTY_FIPS.substr(0, 2),
         AREA_KM2 = round(this.area / 1e6, 2)' \
  -o out.shp

# Drop features outside a date window
mapshaper events.csv \
  -filter 'new Date(DATE) >= new Date("2020-01-01")' \
  -o recent.csv

# Sort polygons largest-first
mapshaper countries.geojson \
  -sort '-this.area' \
  -o sorted.geojson

# Look up one feature
mapshaper states.geojson -inspect 'NAME == "Delaware"'

# Aggregate stats during a dissolve
mapshaper counties.shp \
  -dissolve STATE calc='N = count(),
                        POP = sum(POP),
                        MEDIAN_INC = median(MEDIAN_INC)' \
  -o states.shp

# Conditional pipeline based on a calc result
mapshaper data.csv \
  -calc 'N = count()' \
  -if 'global.N == 0' -stop -endif \
  -o data.csv

# Filter shared boundaries
mapshaper counties.shp \
  -lines where='B && A.STATE != B.STATE' \
  -o state-borders.shp

# Per-feature styling: circle radius from POP, fill from an expression
mapshaper cities.geojson \
  -style r='Math.sqrt(POP) / 40' \
         fill='POP > 1e6 ? "#c33" : "#39c"' \
         opacity=0.7 \
  -o cities.svg

# Project to a layer-specific CRS
mapshaper -i country.shp -require ./projection.js \
  -run '-proj {tmerc(target.bbox)}' -o
```

## See also

- [`-each`](/docs/reference.html#-each) &mdash; the canonical feature-expression command
- [`-filter`](/docs/reference.html#-filter)
- [`-calc`](/docs/reference.html#-calc)
- [`-define`](/docs/reference.html#-define), [`-include`](/docs/reference.html#-include), [`-require`](/docs/reference.html#-require)
- [`-run`](/docs/reference.html#-run)
- [Basics](/docs/examples/basics.html) &mdash; recipes that put expressions to work
