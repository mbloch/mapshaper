---
title: GeoPackage
description: How Mapshaper reads and writes GeoPackage (.gpkg), the OGC's SQLite-based GIS container.
---

# GeoPackage

GeoPackage is the OGC's modern, open replacement for Shapefile &mdash; a single SQLite database file that holds one or many vector layers along with their CRS metadata. It solves most of Shapefile's problems (long field names, UTF-8 encoding, no companion files, multiple layers per file, no 2 GB cap) and is well-supported across QGIS, ArcGIS and `ogr2ogr`.

**File extension:** `.gpkg` &middot; **Read:** &check; &middot; **Write:** &check; &middot; **Multi-layer:** &check;

### CLI examples

```bash
mapshaper basemap.gpkg -info
mapshaper basemap.gpkg -o format=geojson regions.geojson
mapshaper -i basemap.gpkg layers=provinces,cities -info
mapshaper provinces.shp -o provinces.gpkg
mapshaper a.shp b.shp -o combined.gpkg
```

### Format-specific input options

- `layers=` &mdash; comma-separated list of layer names to import. Useful for picking a subset out of a large multi-layer GeoPackage. Omit to import everything.

### Format-specific output options

There are no GeoPackage-specific `-o` options. The format honors the general flags (`precision=`, `gzip`, `zip`, etc.) where they apply.

### Practical notes

- By default, every vector layer in the file is imported as a separate Mapshaper layer. To pick a subset, use the `layers=` option on the CLI; in the web app, tick the **with advanced options** checkbox in the import dialog to bring up a per-layer selection list.
- When multiple layers are exported to a single `.gpkg`, each becomes a separate layer table inside the database, named after the source layer.
- Raster tile layers (the OGC GeoPackage spec also covers tiles) are ignored &mdash; Mapshaper is vector-only.


## External resources

- [geopackage.org](https://www.geopackage.org/) &mdash; project home with spec, FAQs and tool support.
- [QGIS user manual: supported data formats](https://docs.qgis.org/latest/en/docs/user_manual/managing_data_source/supported_data.html) &mdash; the practical reference on how QGIS treats GeoPackage, including multi-layer use and project storage.
- [Learn spatial SQL and master GeoPackage with QGIS](https://www.gispo.fi/en/blog/learn-spatial-sql-and-master-geopackage-with-qgis-3/) &mdash; tutorial from Gispo showing how to query GeoPackage layers with SQL directly from QGIS.
- GeoPackage reading and writing in Mapshaper is delegated to NGA's [`@ngageoint/geopackage`](https://github.com/ngageoint/geopackage-js) library, which handles the underlying SQLite database, the OGC table schemas and the WKB-to-GeoJSON geometry conversions.
