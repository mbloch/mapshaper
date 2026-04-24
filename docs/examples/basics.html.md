---
title: Basics
description: A scannable collection of short Mapshaper recipes for common GIS tasks — format conversion, joins, simplification, dissolves, projection, classification, web export and more.
---

# Basics

Short Mapshaper recipes for common GIS tasks. The filenames and field names are illustrative &mdash; substitute your own. Most recipes also work in the [web app's](/docs/essentials/web-app.html.md) console: drop the leading `mapshaper` and the input filename, since the GUI already has the layer loaded.

> Looking for the syntax of a particular command or option? See the [command reference](/docs/reference.html.md). For the JS expression context used by `-each`, `-filter`, `calc=` and other commands, see [JavaScript expressions](/docs/guides/expressions.html.md).

## Inspecting and exploring

### Print a summary of a dataset

```bash
mapshaper input.shp -info
```

`-info` prints the geometry type, feature count, CRS (if known), bounding box, and the name and type of every attribute field. It's the fastest way to remind yourself what a file actually contains. Add `save-to=info.json` to capture it as JSON.


### Count features grouped by a field

```bash
mapshaper counties.shp \
  -drop geometry \
  -dissolve STATE calc='N = count(), POP = sum(POP)' \
  -o state_data.csv
```

A dissolve with a `calc=` clause is an idiomatic way to aggregate data values.

## Filtering and selecting

### Keep features matching a condition

```bash
mapshaper countries.geojson -filter 'CONTINENT == "Asia" && POP > 1e7' \
  -o output.geojson
```

`-filter` keeps features for which the expression returns `true`.

### Keep features inside a bounding box

```bash
mapshaper world.shp -clip bbox=-10,35,30,60 -o europe.shp
```

The four bbox numbers are `xmin,ymin,xmax,ymax` in the layer's own coordinates.

### Keep the top N features by some attribute

```bash
mapshaper cities.geojson \
  -sort POP descending \
  -filter 'this.id < 50' \
  -o top50.geojson
```

`-sort POP descending` orders by population from largest to smallest. Features have numerical ids starting with `0`, so `this.id < 50` keeps the first 50.

### Drop features with empty geometry

```bash
mapshaper messy.geojson -filter remove-empty -o clean.geojson
```

The `remove-empty` flag drops features with missing or empty geometry.

## Editing attributes

### Add derived fields

```bash
mapshaper counties.shp \
  -each 'STATE_FIPS = COUNTY_FIPS.substr(0, 2),
         AREA_KM2 = round(this.area / 1e6, 1)' \
  -o out.shp
```

`-each` runs a JS expression on each feature; assigning to a bare name creates or updates a field. `round(x, 1)` is Mapshaper's rounding helper (one decimal here). On unprojected lat/long data, `this.area` returns square meters, dividing by 1e6 converts to square kilometers.

### Rename and filter fields

```bash
mapshaper data.csv \
  -rename-fields POPULATION=POP,MEDIAN_INCOME=MEDIAN_INC \
  -filter-fields STATE,COUNTY,POPULATION,MEDIAN_INCOME \
  -o cleaned.csv
```

`-rename-fields` takes `NEW=OLD` pairs. `-filter-fields` keeps only the listed fields, in the listed order &mdash; convenient for shaping CSV output.

### Preserve leading zeros from a CSV

```bash
mapshaper -i counties.csv string-fields=FIPS,STATEFIPS \
  -o counties.shp
```

By default Mapshaper parses any numeric-looking CSV column as a number, which silently drops leading zeros from FIPS, ZIP and similar identifier columns. `string-fields=` forces the named columns to stay as strings.

## Joining data

### Join a CSV to a Shapefile by key

```bash
mapshaper states.shp \
  -join demographics.csv keys=STATE_FIPS,FIPS string-fields=FIPS \
  -o states_with_data.shp
```

`keys=A,B` means "match the target's `A` field to the source's `B` field". `string-fields=FIPS` (passed through to the CSV import) keeps the FIPS code as a string so `"06"` matches `"06"` rather than being parsed to `6`. To pull just a few columns from the source, add `fields=FIELD_A,FIELD_B`.

### Spatial join: tag points with the polygon they fall in

```bash
mapshaper crimes.geojson \
  -join precinct_polygons.shp \
  -o crimes_with_precinct.geojson
```

When `keys=` is omitted, `-join` falls back to a spatial join based on the geometry types involved. Here, every point inherits the attributes of the polygon containing it. Use `fields=PRECINCT_ID,DIVISION` to keep just specific columns.

### Many-to-one join with an aggregation

```bash
mapshaper precincts.shp \
  -join crimes.geojson calc='N = count(), AVG_SEVERITY = mean(SEVERITY)' \
  -o precincts_with_stats.shp
```

A polygon-to-many-points join can use `calc=` to summarize the matched source records into one or more new fields per target feature. The functions in `calc=` are the same set documented under [`-calc`](/docs/reference.html.md#-calc).

## Simplifying

### Simplify a polygon layer for the web

```bash
mapshaper provinces.shp \
  -simplify 5% keep-shapes \
  -clean \
  -o format=topojson provinces.topojson
```

`-simplify 5%` keeps 5% of the original vertices using the default weighted Visvalingam algorithm. `keep-shapes` prevents simplification from wiping out very small polygons. `-clean` mops up any topology errors introduced by aggressive simplification. TopoJSON output is usually 2&ndash;5x smaller than the equivalent GeoJSON.

### Simplify multiple files with shared topology

```bash
mapshaper -i states.shp counties.shp combine-files \
  -simplify 10% \
  -o out/
```

`combine-files` merges the inputs into one dataset before Mapshaper builds its arc topology, so vertices shared between layers stay shared after simplification &mdash; no gaps or overlaps along state/county boundaries. Each input still gets written back out as a separate file in `out/`. In the web app, add `combine-files` in the **Advanced options** field at import time to get the same behavior.

### Repair topology errors

```bash
mapshaper messy.shp -clean -o cleaned.shp
```

`-clean` snaps near-duplicate vertices, removes tiny gaps and overlaps between polygons, and fixes self-intersecting lines. It's a safe first step before any spatial operation. You can tune `gap-fill-area=`, `sliver-control=` or `snap-interval=` if necessary.

## Aggregating

### Dissolve to a parent geography

```bash
mapshaper counties.shp -dissolve STATE -o states.shp
```

`-dissolve` merges adjacent polygons that share a value in the named field.

### Dissolve while computing per-group stats

```bash
mapshaper counties.shp \
  -dissolve STATE calc='N = count(),
                        POP = sum(POP),
                        MEDIAN_INC = median(MEDIAN_INC)' \
  -o states_with_stats.shp
```

`calc=` works inside `-dissolve` as well as `-join`. The named functions (`count`, `sum`, `mean`, `median`, `mode`, `min`, `max`, `quartile1/2/3`, `iqr`, `quantile`, `collect`, `every`, `some`, `first`, `last`) all see the same per-feature context as `-each`.

### Convert points to population-weighted centroids

```bash
mapshaper cities.shp \
  -dissolve STATE_FIPS weight=POPULATION \
  -o state_centers.shp
```

Dissolve groups of points that share a `STATE_FIPS` value into a single weighted centroid per group. The `weight=` option accepts a field name or a JS expression. Omitting a grouping field dissolves all points into one centroid.

## Spatial operations

### Erase one layer from another

```bash
mapshaper land.shp -erase lakes.shp -o land_no_lakes.shp
```

`-erase` removes the parts of the target layer that fall inside the source layer's polygons. Useful for masking out water, parks, or any "do-not-count" region. The inverse is `-clip`, which keeps the inside instead.

### Compute interior boundaries

```bash
mapshaper counties.shp -innerlines -o county_borders.shp
```

`-innerlines` returns the shared boundaries between polygons as a polyline layer, which is usually used for adding a stroke to interior boundaries on a styled map. Use [`-lines`](/docs/reference.html.md#-lines) instead if you want to retain both outer and inner boundaries.

### Generate a hex grid covering a layer

```bash
mapshaper region.shp \
  -grid type=hex interval=10km name=hex \
  -o hex.shp
```

`-grid` builds a regular grid (`square`, `hex`, `hex2`) covering the target's bounding box. Pair it with a spatial join to style the grid cells using interpolated count data (`-join interpolate=POPULATION`).

## Reprojection

### Project to a named CRS

```bash
mapshaper world.geojson -proj robinson -o world_robinson.geojson
```

`-proj` accepts EPSG codes (`EPSG:3857`), PROJ strings (`+proj=tmerc +lon_0=...`), or short aliases (`wgs84`, `webmercator`, `robinson`, `albersusa`). See the [Projections guide](/docs/guides/projections.html.md) for details.

### Match the projection of another file

```bash
mapshaper points.shp -proj match=basemap.shp -o points_aligned.shp
```

`match=` reads the CRS of another file and projects the target to match it &mdash; handy when assembling multiple datasets that need to share a coordinate system.

## Classification and styling

### Quantile-classify into a color ramp

```bash
mapshaper covid_cases.geojson \
  -classify save-as=fill quantile classes=6 color-scheme=Oranges \
  -o themed.geojson
```

`-classify` writes a class index or a derived value (here, a fill color) into the named field. The default is sequential quantile classification, but you can switch to `equal-interval`, `nice`, `categorical` or `non-adjacent`. Run `mapshaper -colors` to list the built-in color schemes.

### Add SVG styling for export

```bash
mapshaper boundaries.shp \
  -style stroke="#444" stroke-width=0.5 fill=none \
  -style where='RANK == 0' stroke="#000" stroke-width=1.5 \
  -o map.svg
```

`-style` writes SVG presentation attributes onto each feature; the `where=` form lets you set them conditionally. The result is a valid SVG you can drop into a print or web layout.

## Output and conversion

### Convert Shapefile &harr; GeoJSON

```bash
mapshaper input.shp -o input.geojson
mapshaper input.geojson -o input.shp
```

The output format is inferred from the file extension. Use `format=` to force it (e.g. `-o format=topojson out.json`). When writing a Shapefile, Mapshaper produces `.shp`, `.shx`, `.dbf`, and `.prj`. If no output filename is given, the output file takes the name of the targeted layer.

### Quantized TopoJSON

```bash
mapshaper boundaries.shp -o boundaries.topojson
```

TopoJSON output is quantized by default — Mapshaper picks a quantization level based on the data's coordinate range. Quantization rounds coordinates to a grid, which dramatically shrinks file size. The default can be overridden with `quantization=` (e.g. `quantization=1e5`). Combined with `-simplify` and TopoJSON's shared-arc encoding, quantized output is routinely 2&ndash;5&times; smaller than equivalent GeoJSON.

### Output as ndjson

```bash
mapshaper big.geojson -o ndjson big.ndjson
```

Newline-delimited JSON is friendlier to line-oriented tools like jq, BigQuery, and DuckDB. One Feature per line, no enclosing FeatureCollection.

### Split a layer into multiple files

```bash
mapshaper counties.shp \
  -split STATE \
  -o out/ extension=geojson
```

`-split FIELD` partitions features into separate layers by the value of `FIELD`; `-o` to a directory then writes one file per layer, named after the field value.

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

Long pipelines can be kept in a [command file](/docs/reference.html.md#command-files).

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
- [Guides](/docs/guides/index.html.md) &mdash; longer-form walk-throughs of simplification, topology cleaning, and more
