---
title: TopoJSON
description: How Mapshaper reads and writes TopoJSON, including quantization and multi-layer output.
---

# TopoJSON

TopoJSON is a JSON-based format that encodes geographic topology: shared boundaries between adjacent features are stored once instead of duplicated. For datasets with shared boundaries (administrative divisions, watersheds, anything with adjacency) the resulting file is often 2&ndash;5&times; smaller than the equivalent GeoJSON. A single TopoJSON file can hold multiple layers, making it a natural choice for shipping a complete map (e.g. countries + states + cities) in one HTTP request.

**File extensions:** `.json`, `.topojson` &middot; **Read:** &check; &middot; **Write:** &check; &middot; **Multi-layer:** &check;

### CLI examples

```bash
mapshaper world.topojson -info
mapshaper world.topojson -o format=geojson world.geojson
mapshaper provinces.shp -o provinces.topojson
mapshaper provinces.shp -o quantization=10000 provinces.topojson
mapshaper countries.shp states.shp -o singles output/
```

### Format-specific input options

- `id-field=` &mdash; import the `id` property of each Feature into a data field of the given name.
- `json-path=` &mdash; for files where the TopoJSON object is nested inside a larger document.

### Format-specific output options

- `quantization=` &mdash; number of distinct integer values that x and y coordinates are quantized to, *per axis*. For example, `quantization=10000` produces a 10000&times;10000 integer grid regardless of the bounding box's aspect ratio (x and y use independent scales). Lower values produce smaller files at the cost of precision. Equivalent to the [`topoquantize`](https://github.com/topojson/topojson-server/blob/master/README.md#topoquantize) CLI's parameter.
- `topojson-precision=` &mdash; alternative way to set quantization, expressed as a fraction of the average segment length.
- `no-quantization` &mdash; emit full-precision arc coordinates.
- `singles` &mdash; write each layer as a separate file, named after the layer.
- `prettify` &mdash; pretty-print the JSON.
- `id-field=` &mdash; promote an attribute field to the `id` property of each output object.
- `bbox` &mdash; add a top-level `bbox` array.
- `extension=` &mdash; override the default `.json` extension (e.g. `extension=topojson`).
- `width=` / `height=` / `pixels=` / `margin=` &mdash; switch the output coordinate system from geographic units to pixels, flipping the Y axis. Useful when generating a TopoJSON intended for direct use as SVG path data.

### Practical notes

- Quantization is on by default with a value calibrated to the geometry (about 0.02 of the average segment length), which keeps files compact while staying visually lossless. Use the `quantization=` option to override the default.
- Use `no-quantization` to save coordinates losslessly.
- TopoJSON does not store coordinate system metadata. If your data is in a projected coordinate system, you'll need to manage the projection separately.
- Output is minified by default; pass `prettify` for human-readable JSON.
- Aggressive quantization can introduce visible misalignments and sliver overlaps. If this happens, raise the `quantization=` value.

## External resources

- [TopoJSON specification](https://github.com/topojson/topojson-specification) &mdash; the format spec on GitHub.
- [How To Infer Topology](https://bost.ocks.org/mike/topology/) &mdash; Mike Bostock's original explainer of the algorithm and data model behind TopoJSON. Required reading if you want to understand what makes the format compact.

## See also

- [Quantized TopoJSON](/docs/examples/basics.html.md#quantized-topojson)
