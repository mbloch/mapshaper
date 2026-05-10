---
title: Basics
description: A scannable collection of short Mapshaper recipes for common GIS tasks — format conversion, joins, simplification, dissolves, projection, classification, web export and more.
---

# Basics

Short Mapshaper recipes for common tasks. The examples are written for the [web app's](/docs/essentials/web-app.html.md) Console: load your data first, then run the commands shown here. Filenames, layer names and field names are illustrative &mdash; substitute your own.

These examples keep the leading `-` on command names because that style works in both the web console and the CLI, and because command sequences need it after the first command. To run most examples from the command line, add `mapshaper input-file` before the command sequence and `-o output-file` after it.

> Looking for the syntax of a particular command or option? See the [command reference](/docs/reference.html.md). For the JS expression context used by `-each`, `-filter`, `calc=` and other commands, see [JavaScript expressions](/docs/guides/expressions.html.md).

## Inspecting and exploring

### Print a summary of a dataset

```text
-info
```

`-info` prints the geometry type, feature count, CRS (if known), bounding box, and the name and type of every attribute field. It's the fastest way to remind yourself what a file actually contains. In the CLI, add `save-to=info.json` to capture it as JSON.

### Run a command on another layer

```text
-info target=counties
```

Commands run on the currently selected layer by default. Use `target=` to name a different layer, or `target=*` to run a command on every layer.

### Count features grouped by a field

```text
-drop geometry \
  -dissolve STATE calc='N = count(), POP = sum(POP)'
```

A dissolve with a `calc=` clause is an idiomatic way to aggregate data values. Here, `-drop geometry` turns the result into a table, ready to export as CSV.

## Filtering and selecting

### Keep features matching a condition

```text
-filter 'CONTINENT == "Asia" && POP > 1e7'
```

`-filter` keeps features for which the expression returns `true`.

### Keep the original layer while filtering

```text
-filter 'POP > 100000' + name=large_places
```

The `+` flag saves the result as a new layer instead of replacing the active layer. Use `name=` to give the new layer a useful name.

### Keep features inside a bounding box

```text
-clip bbox=-10,35,30,60
```

The four bbox numbers are `xmin,ymin,xmax,ymax` in the layer's own coordinates.

### Keep the top N features by some attribute

```text
-sort POP descending \
  -filter 'this.id < 50'
```

`-sort POP descending` orders by population from largest to smallest. Features have numerical ids starting with `0`, so `this.id < 50` keeps the first 50.

### Drop features with empty geometry

```text
-filter remove-empty
```

The `remove-empty` flag drops features with missing or empty geometry.

## Editing attributes

### Add derived fields

```text
-each 'STATE_FIPS = COUNTY_FIPS.substr(0, 2),
       AREA_KM2 = round(this.area / 1e6, 1)'
```

`-each` runs a JS expression on each feature; assigning to a bare name creates or updates a field. `round(x, 1)` is Mapshaper's rounding helper (one decimal here). On unprojected lat/long data, `this.area` returns square meters, dividing by 1e6 converts to square kilometers.

### Rename and filter fields

```text
-rename-fields POPULATION=POP,MEDIAN_INCOME=MEDIAN_INC \
  -filter-fields STATE,COUNTY,POPULATION,MEDIAN_INCOME
```

`-rename-fields` takes `NEW=OLD` pairs. `-filter-fields` keeps only the listed fields, in the listed order &mdash; convenient for shaping CSV output.

### Preserve leading zeros from a CSV

```text
string-fields=FIPS,STATEFIPS
```

By default Mapshaper parses any numeric-looking CSV column as a number, which silently drops leading zeros from FIPS, ZIP and similar identifier columns. In the web app, enter `string-fields=FIPS,STATEFIPS` in the **Advanced options** field when importing the CSV. In the CLI, pass it with `-i`: `mapshaper -i counties.csv string-fields=FIPS,STATEFIPS`.

## Joining data

### Join a CSV to a Shapefile by key

```text
-join demographics keys=STATE_FIPS,FIPS
```

Load both the target layer and the CSV before running the join. `keys=A,B` means "match the target's `A` field to the source's `B` field". If the source key is a FIPS, ZIP or other code with leading zeros, import the CSV with `string-fields=FIPS` so `"06"` matches `"06"` rather than being parsed to `6`. To pull just a few columns from the source, add `fields=FIELD_A,FIELD_B`.

### Spatial join: tag points with the polygon they fall in

```text
-join precinct_polygons
```

When `keys=` is omitted, `-join` falls back to a spatial join based on the geometry types involved. Here, every point inherits the attributes of the polygon containing it. Use `fields=PRECINCT_ID,DIVISION` to keep just specific columns.

### Many-to-one join with an aggregation

```text
-join crimes calc='N = count(), AVG_SEVERITY = mean(SEVERITY)'
```

A polygon-to-many-points join can use `calc=` to summarize the matched source records into one or more new fields per target feature. The functions in `calc=` are the same set documented under [`-calc`](/docs/reference.html.md#-calc).

## Simplifying

### Simplify a polygon layer for the web

```text
-simplify 5% keep-shapes \
  -clean
```

`-simplify 5%` keeps 5% of the original vertices using the default weighted Visvalingam algorithm. `keep-shapes` prevents simplification from wiping out very small polygons. `-clean` mops up any topology errors introduced by aggressive simplification. TopoJSON output is usually 2&ndash;5x smaller than the equivalent GeoJSON; choose TopoJSON in the Export dialog or use `-o format=topojson provinces.topojson` in the CLI.

### Simplify multiple files with shared topology

```text
-simplify 10%
```

When importing the files in the web app, add `combine-files` in the **Advanced options** field. This merges the inputs into one dataset before Mapshaper builds its arc topology, so vertices shared between layers stay shared after simplification &mdash; no gaps or overlaps along state/county boundaries.

### Repair topology errors

```text
-clean
```

`-clean` snaps near-duplicate vertices, removes tiny gaps and overlaps between polygons, and fixes self-intersecting lines. It's a safe first step before any spatial operation. You can tune `gap-fill-area=`, `sliver-control=` or `snap-interval=` if necessary.

## Aggregating

### Dissolve to a parent geography

```text
-dissolve STATE
```

`-dissolve` merges adjacent polygons that share a value in the named field.

### Dissolve while computing per-group stats

```text
-dissolve STATE calc='N = count(),
                      POP = sum(POP),
                      MEDIAN_INC = median(MEDIAN_INC)'
```

`calc=` works inside `-dissolve` as well as `-join`. The named functions (`count`, `sum`, `mean`, `median`, `mode`, `min`, `max`, `quartile1/2/3`, `iqr`, `quantile`, `collect`, `every`, `some`, `first`, `last`) all see the same per-feature context as `-each`.

### Convert points to population-weighted centroids

```text
-dissolve STATE_FIPS weight=POPULATION
```

Dissolve groups of points that share a `STATE_FIPS` value into a single weighted centroid per group. The `weight=` option accepts a field name or a JS expression. Omitting a grouping field dissolves all points into one centroid.

## Spatial operations

### Erase one layer from another

```text
-erase lakes
```

`-erase` removes the parts of the target layer that fall inside the source layer's polygons. Useful for masking out water, parks, or any "do-not-count" region. The inverse is `-clip`, which keeps the inside instead.

### Compute interior boundaries

```text
-innerlines
```

`-innerlines` returns the shared boundaries between polygons as a polyline layer, which is usually used for adding a stroke to interior boundaries on a styled map. Use [`-lines`](/docs/reference.html.md#-lines) instead if you want to retain both outer and inner boundaries.

### Generate a hex grid covering a layer

```text
-grid type=hex interval=10km name=hex
```

```text
-grid type=hex cols=40 name=hex
```

`-grid` builds a regular grid (`square`, `square2`, `hex`, `hex2`, `rhombus`, `rhombus2`, `triangle`, `triangle2`) covering the target's bounding box. Use `interval=` to set the cell side length directly, or `cols=`, `rows=` or `cells=` to set an approximate grid resolution. Use `cell-scale=` to shrink or expand cells from their centers. Pair it with a spatial join to style the grid cells using interpolated count data (`-join interpolate=POPULATION`).

### Merge compatible layers

```text
-merge-layers target=OR,WA,CA,AK name=pacific_states
```

`-merge-layers` combines layers with compatible geometry types into one layer. Use `force` if the layers have different attribute fields and you want Mapshaper to fill missing values.

## Reprojection

### Project to a named CRS

```text
-proj robinson
```

`-proj` accepts EPSG codes (`EPSG:3857`), PROJ strings (`+proj=tmerc +lon_0=...`), or short aliases (`wgs84`, `webmercator`, `robinson`, `albersusa`). See the [Projections guide](/docs/guides/projections.html.md) for details.

### Match the projection of another file

```text
-proj match=basemap
```

`match=` reads the CRS of another layer or `.prj` file and projects the target to match it &mdash; handy when assembling multiple datasets that need to share a coordinate system.

## Classification and styling

### Quantile-classify into a color ramp

```text
-classify save-as=fill quantile classes=6 color-scheme=Oranges
```

`-classify` writes a class index or a derived value (here, a fill color) into the named field. The default is sequential quantile classification, but you can switch to `equal-interval`, `nice`, `categorical` or `non-adjacent`. In the CLI, run `mapshaper -colors` to list the built-in color schemes.

### Add SVG styling for export

```text
-style stroke="#444" stroke-width=0.5 fill=none \
  -style where='RANK == 0' stroke="#000" stroke-width=1.5
```

`-style` writes SVG presentation attributes onto each feature; the `where=` form lets you set them conditionally. Export as SVG when you're ready to use the styled map in a print or web layout.

## Output and conversion

### Convert Shapefile &harr; GeoJSON

Use the Export button and choose GeoJSON or Shapefile.

In the CLI, the output format is inferred from the file extension:

```bash
mapshaper input.shp -o input.geojson
mapshaper input.geojson -o input.shp
```

Use `format=` to force a format (e.g. `-o format=topojson out.json`). When writing a Shapefile, Mapshaper produces `.shp`, `.shx`, `.dbf`, and `.prj`. If no output filename is given, the output file takes the name of the targeted layer.

### Quantized TopoJSON

Use the Export button and choose TopoJSON.

TopoJSON output is quantized by default — Mapshaper picks a quantization level based on the data's coordinate range. Quantization rounds coordinates to a grid, which dramatically shrinks file size. The default can be overridden with `quantization=` (e.g. `quantization=1e5`). Combined with `-simplify` and TopoJSON's shared-arc encoding, quantized output is routinely 2&ndash;5&times; smaller than equivalent GeoJSON.

### Output as ndjson

```bash
mapshaper big.geojson -o ndjson big.ndjson
```

Newline-delimited JSON is friendlier to line-oriented tools like jq, BigQuery, and DuckDB. One Feature per line, no enclosing FeatureCollection. This is mainly a CLI workflow.

### Split a layer into multiple files

```bash
mapshaper counties.shp \
  -split STATE \
  -o out/ extension=geojson
```

`-split FIELD` partitions features into separate layers by the value of `FIELD`; `-o` to a directory then writes one file per layer, named after the field value. This is mainly a CLI workflow.

## Workflow patterns

### Run a chain of commands from a file

```
# build.txt
mapshaper
-i counties.shp
-rename-fields POP=POPULATION
-dissolve STATE calc='POP = sum(POP)'
-simplify 5%
-o out/states.topojson
```

```bash
mapshaper -run build.txt
# or simply:
mapshaper build.txt
```

Long pipelines can be kept in a [command file](/docs/essentials/command-line.html.md#command-files). This is a CLI workflow; support for running command files in the web app is planned for a future release.

### Parameterize a command file

```bash
mapshaper -vars YEAR=2024 PCT=10 -run build.txt
```

```
# build.txt
mapshaper
-defaults YEAR=2020 PCT=5
-i sources/counties_{{YEAR}}.shp
-simplify {{PCT}}%
-o out/counties_{{YEAR}}.shp
```

`{{VAR}}` placeholders are substituted at parse time. `-defaults` sets values that the caller can override with `-vars` (or with `{{env.NAME}}` for environment variables).

### Stop a pipeline early on bad input

```bash
mapshaper input.csv \
  -calc 'N = count()' \
  -if 'global.N == 0' \
    -print 'No records, exiting' \
    -stop \
  -endif \
  -o out.csv
```

`-calc` expressions can publish values to the `global` object via simple assignment. `-if`/`-stop` then guard the rest of the pipeline. Useful in scripts where bad upstream data should fail loudly rather than silently produce empty output.

### Increase the heap for very large files

```bash
mapshaper-xl 16gb counties_5m.shp -simplify 10% -o counties_5m.topojson
```

`mapshaper-xl` is a wrapper that launches Node with extra heap space (default 8 GB; pass a size to override). Use it whenever you see "JavaScript heap out of memory" errors.

## See also

- [Command reference](/docs/reference.html.md) &mdash; every command and option
- [JavaScript expressions](/docs/guides/expressions.html.md) &mdash; the syntax and context used by `-each`, `-filter`, `calc=`, etc.
