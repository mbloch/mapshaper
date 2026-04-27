---
title: File formats
description: A quick comparison of every file format Mapshaper can read and write, with links to per-format details.
---

# File formats

This section explains how each supported file format is handled, what format-specific options are available, and what to watch out for.

## Comparison

<div class="formats-table-wrap">

| Format | Extension | Read | Write | Geometry | Attributes | Topology | Multi-layer |
|---|---|:---:|:---:|---|---|:---:|:---:|
| [Shapefile](/docs/formats/shapefile.html) | `.shp` `.shx` `.dbf` `.prj` `.cpg` | &check; | &check; | vector | DBF (10-char names) | &mdash; | &mdash; |
| [GeoJSON](/docs/formats/geojson.html) | `.json` `.geojson` | &check; | &check; | vector | yes | &mdash; | &mdash; |
| [TopoJSON](/docs/formats/topojson.html) | `.json` `.topojson` | &check; | &check; | vector | yes | **&check;** | &check; |
| [GeoPackage](/docs/formats/geopackage.html) | `.gpkg` | &check; | &check; | vector | yes | &mdash; | &check; |
| [FlatGeobuf](/docs/formats/flatgeobuf.html) | `.fgb` | &check; | &check; | vector | yes | &mdash; | &mdash; |
| [KML / KMZ](/docs/formats/kml.html) | `.kml` `.kmz` | &check; | &check; | vector | limited | &mdash; | &check; |
| [CSV / TSV](/docs/formats/csv.html) | `.csv` `.tsv` | &check; | &check; | points (X/Y) | yes | &mdash; | &mdash; |
| [DBF](/docs/formats/dbf.html) | `.dbf` | &check; | &check; | none | yes | &mdash; | &mdash; |
| [JSON records](/docs/formats/json.html) | `.json` | &check; | &check; | none | yes | &mdash; | &mdash; |
| [SVG](/docs/formats/svg.html) | `.svg` | &check; | &check; | vector | as `data-*` | &mdash; | &check; |
| [Mapshaper snapshot](/docs/formats/snapshot.html) | `.msx` | &check; | &check; | vector | yes | **&check;** | &check; |

</div>

A few things worth knowing across all formats:

- **Auto-detection by extension.** You usually don't need to tell Mapshaper what format a file is — the input and output format are both inferred from the file extension. Use `format=` on `-i` or `-o` to override.
- **TopoJSON is the only interchange format that preserves topology** in the file itself. Topology-aware operations like [`-dissolve`](/docs/reference.html#-dissolve), [`-clean`](/docs/reference.html#-clean) and [`-simplify`](/docs/reference.html#-simplify) work correctly regardless of the input format, but only TopoJSON keeps shared boundaries between adjacent polygons from being duplicated on disk. (Mapshaper's own [`.msx`](/docs/formats/snapshot.html) snapshots also preserve topology, but they're not readable by other tools.)
- **Encoding.** The `encoding=` option on `-i` and `-o` applies to Shapefile, DBF and CSV/TSV i/o (UTF-8 is the default) &mdash; the other formats are UTF-8-only.
