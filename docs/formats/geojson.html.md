---
title: GeoJSON
description: How Mapshaper reads and writes GeoJSON, including precision, ndjson and RFC 7946 options.
---

# GeoJSON

GeoJSON is a simple, human-readable format for geospatial vector data. It is used by many web mapping APIs, although formats like TopoJSON, FlatGeobuf, GeoParquet, and vector tiles have replaced it for specific use cases such as large-file efficiency, cloud-optimized access, and tiled rendering.

**File extensions:** `.json`, `.geojson` &middot; **Read:** &check; &middot; **Write:** &check; &middot; **Multi-layer:** one layer per file (combinable)

### CLI examples

```bash
mapshaper input.shp -o provinces.geojson
mapshaper input.shp -o precision=0.001 prettify provinces.geojson
```

### Format-specific input options

- `id-field=` &mdash; import the value of each Feature's top-level `id` property into a data field of the given name.
- `json-path=` &mdash; for files where the GeoJSON object is nested inside a larger JSON document, e.g. `json-path=data/regions`.

### Format-specific output options

- `precision=` &mdash; round coordinates to a fixed precision. This is a simple way to reduce file size.
- `prettify` &mdash; pretty-print the JSON with line breaks and indentation.
- `id-field=` &mdash; promote one or more attribute fields to the GeoJSON `id` property (comma-separated; first matching field per layer is used).
- `bbox` &mdash; add a `bbox` array to the top-level FeatureCollection.
- `extension=` &mdash; override the default `.json` extension (e.g. `extension=geojson`).
- `combine-layers` &mdash; merge multiple layers into a single GeoJSON output file (geometries are kept separate as Features, attribute schemas are unioned).
- `geojson-type=` &mdash; output a `Feature`, `FeatureCollection` or bare `GeometryCollection` instead of the default FeatureCollection.
- `no-null-props` &mdash; emit `"properties": {}` instead of `"properties": null` for Features without attributes.
- `hoist=` &mdash; promote one or more properties out of the `properties` object onto the Feature itself. Useful for non-standard consumers like [tippecanoe](https://github.com/felt/tippecanoe).
- `gj2008` &mdash; emit pre-RFC-7946 GeoJSON (clockwise outer rings).
- `reverse-winding` &mdash; reverse the winding order of polygon rings on export.
- `ndjson` &mdash; write one Feature per line as newline-delimited JSON (works with the [`json` records](/docs/formats/json.html.md) family of options as well).
- `id-prefix=` &mdash; prefix layer/feature ids when exporting multiple layers.

### Practical notes

- The GeoJSON spec states that GeoJSON uses WGS-84 coordinates (the lat-long coordinate system used by GPS), but Mapshaper will also export GeoJSON files with projected coordinates.
- Coordinates are emitted at full precision &mdash; consider `precision=` to reduce file size. `precision=0.0001` equates to ~11 m at the equator, ~8 m in New York City, and ~6 m in Reykjavík, Iceland.
- Polygon ring winding follows RFC 7946 (CCW outer, CW holes); use `reverse-winding` to write CW outer rings and CCW holes.
- Output is minified by default; pass `prettify` for human-readable JSON.
- If you are loading the data into a web map, see [Preparing data for D3 and web maps](/docs/guides/geojson-for-web-maps.html.md) for notes on WGS84, projected coordinates, polygon winding and D3 rendering.
- If you are loading the data into a web map and you want the smallest possible file size, consider [TopoJSON](/docs/formats/topojson.html.md) as an alternative to GeoJSON. For datasets with shared boundaries, file sizes are often a fraction of the equivalent GeoJSON size.
- `precision=` rounding can introduce sliver overlaps at boundaries. Pair it with `fix-geometry` if downstream tools are strict.

### Reading very large GeoJSON files

Mapshaper uses a custom GeoJSON parser, so it is not constrained in the same way as tools that must load an entire file into a JavaScript string and call `JSON.parse()`.

In both Node.js and browsers, `JSON.parse()` workflows hit string-size and memory limits much earlier than the raw file-size limit. In practice, browser imports can fail well below 1 GB, and large files may crash the tab. If a GeoJSON is too big for the [web app](/docs/essentials/web-app.html.md), use the CLI (or `mapshaper-xl`) instead.

`mapshaper-xl` can handle multi-gigabyte files. It allocates 8 GB of memory by default, but you can assign more.

```bash
mapshaper-xl huge.geojson -info
mapshaper-xl 32gb huge.geojson -simplify 5% -o huge.topojson
```

## External resources

- [RFC 7946: The GeoJSON Format](https://datatracker.ietf.org/doc/html/rfc7946) &mdash; the IETF specification Mapshaper writes by default.
- [More than you ever wanted to know about GeoJSON](https://macwright.com/2015/03/23/geojson-second-bite.html) &mdash; Tom MacWright's detailed practical introduction.
- [geojson.org](https://geojson.org/) &mdash; spec home with links to tooling and validators.
