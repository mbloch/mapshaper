---
title: GeoParquet
description: How Mapshaper reads GeoParquet (.parquet), a columnar binary vector format.
---

# GeoParquet

GeoParquet is a compact columnar format that stores vector geometries alongside tabular attributes. It is now a common cloud-native interchange format for vector data: the Overture Maps Foundation publishes its global releases in GeoParquet, and tools such as DuckDB (with spatial), GeoPandas, BigQuery, Athena and Synapse can query GeoParquet datasets directly.

**File extensions:** `.parquet`, `.geoparquet` &middot; **Read:** &check; &middot; **Write:** &check; &middot; **Multi-layer:** no (one layer per file)

### CLI examples

```bash
mapshaper roads.parquet -info
mapshaper roads.parquet -o roads.geojson
mapshaper roads.geojson -o roads.parquet
```

### Format-specific input options

There are no GeoParquet-specific `-i` options.

### Format-specific output options

- `compression=snappy|zstd|none` &mdash; select Parquet column compression. The default is `snappy`. Use `none` to write uncompressed Parquet data. Snappy is designed for fast compression and decompression at moderate compression ratios. ZSTD is slower to compress but typically produces smaller files and is often preferred when file size matters more than write speed (e.g. files published for download or stored in a cloud bucket).
- `level=` &mdash; set the ZSTD compression level when using `compression=zstd`. Valid values are integers from 1 to 22. If omitted, the ZSTD library default is used.

### Practical notes

- Mapshaper imports one geometry column per file (the GeoParquet `primary_column` when present). Additional geometry columns are currently ignored.
- Mapshaper writes a single WKB geometry column named `geometry`.
- There is no fixed maximum GeoParquet file size. Limits are memory-driven:
  - In the regular CLI, the limit is your Node heap. For very large files, use `mapshaper-xl`, which starts with an 8 GB heap by default (and can be increased, e.g. `mapshaper-xl 16gb ...`).
  - In the web app, very large imports (often in the hundreds of MB, depending on browser/device) can run out of memory and crash the tab. For large GeoParquet files, prefer the CLI / `mapshaper-xl`.

## External resources

- [GeoParquet specification](https://geoparquet.org/) &mdash; official format specification and metadata model.
- [Apache Parquet geospatial logical types](https://github.com/apache/parquet-format/blob/apache-parquet-format-2.12.0/Geospatial.md) &mdash; core Parquet geospatial typing details.
- Cloud-Native Geospatial Formats Guide: GeoParquet &mdash; [Overview](https://guide.cloudnativegeo.org/geoparquet/) and [Example](https://guide.cloudnativegeo.org/geoparquet/geoparquet-example.html) pages.
- GeoParquet import in Mapshaper uses the [`hyparquet`](https://github.com/hyparam/hyparquet) JavaScript library.
