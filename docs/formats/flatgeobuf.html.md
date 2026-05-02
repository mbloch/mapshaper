---
title: FlatGeobuf
description: How Mapshaper reads and writes FlatGeobuf (.fgb), a streamable binary vector format.
---

# FlatGeobuf

FlatGeobuf is a modern binary vector format designed for fast streaming reads. A single self-contained file with UTF-8 text encoding, it avoids the companion-file clutter of Shapefile. Its optional embedded spatial index enables efficient bounding-box queries without reading the whole file, making it well-suited to large datasets served over HTTP. It also works well as a general-purpose GIS exchange format.

**File extension:** `.fgb` &middot; **Read:** &check; &middot; **Write:** &check; &middot; **Multi-layer:** no (one layer per file)

### CLI examples

```bash
mapshaper buildings.fgb -info
mapshaper buildings.fgb -simplify 5% -o buildings.geojson
mapshaper provinces.shp -o provinces.fgb
```

### Format-specific input options

There are no FlatGeobuf-specific `-i` options.

### Format-specific output options

There are no FlatGeobuf-specific `-o` options. The format honors the general flags (`precision=`, `gzip`, `zip`, etc.) where they apply.

### Practical notes

- Mapshaper does not write the optional packed R-tree spatial index, and it doesn't use the index for selective reads of indexed input either &mdash; the whole file is read into memory. If you need an indexed `.fgb` for HTTP range-request reads, build it with `ogr2ogr` or the [`flatgeobuf` CLI](https://github.com/flatgeobuf/flatgeobuf).

## External resources

- [flatgeobuf.org](https://flatgeobuf.org/) &mdash; project home with spec links and language bindings.
- [Kicking the Tires: FlatGeobuf](https://worace.works/2022/02/23/kicking-the-tires-flatgeobuf/) &mdash; an independent practical writeup with benchmarks against Shapefile, GeoJSON and GeoPackage.
- [Bryce Mecum: Flatgeobuf](https://brycemecum.com/2022/04/04/flatgeobuf/) &mdash; a hands-on exploration of streaming reads in the browser, including a worth-knowing gotcha about the spatial index sitting at the front of the file.
- Cloud-Native Geospatial Formats Guide: FlatGeobuf &mdash; [Overview](https://guide.cloudnativegeo.org/flatgeobuf/intro.html) and [Example](https://guide.cloudnativegeo.org/flatgeobuf/flatgeobuf.html) pages.
- FlatGeobuf reading and writing in Mapshaper is built on the official [`flatgeobuf`](https://github.com/flatgeobuf/flatgeobuf) JavaScript library, which provides the FlatBuffers schema, header parsing and feature serialisation primitives.
