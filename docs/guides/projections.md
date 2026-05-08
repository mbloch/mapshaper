---
title: Map projections
description: How to reproject geographic data with Mapshaper, including CRS notation, built-in aliases, and the albersusa composite projection.
---

# Map projections

Mapshaper's [`-proj`](/docs/reference.html#-proj) command reprojects a dataset from one coordinate reference system (CRS) to another, using a JavaScript port of the [PROJ](https://proj.org/) coordinate transformation library.

**Examples**

```bash
# Project a Shapefile to UTM zone 11N using a PROJ string
mapshaper nevada.shp -proj +proj=utm +zone=11 -o

# Convert a projected Shapefile to WGS84 — the following are equivalent:
mapshaper nyc.shp -proj EPSG:4326 -o
mapshaper nyc.shp -proj wgs84 -o
mapshaper nyc.shp -proj +proj=longlat +datum=WGS84 -o

# Composite projection for U.S. maps with Alaska, Hawaii, and Puerto Rico insets
mapshaper us-states.shp -proj albersusa +PR -o
```

## Forms of CRS notation

`-proj` accepts a CRS in any of three forms.

**PROJ strings** are sequences of `+key=value` parameters. They are the lowest-level form and expose the full set of options for each projection. Parameters that have sensible defaults (datum, units, false easting/northing) can usually be omitted.

```bash
mapshaper data.shp -proj +proj=lcc +lat_1=33 +lat_2=45 +lat_0=39 +lon_0=-96 -o
```

**EPSG codes** are numeric identifiers from the [EPSG registry](https://epsg.io/). Thousands of national and regional coordinate systems have EPSG codes, making them a compact and unambiguous way to specify a CRS.

```bash
mapshaper data.shp -proj EPSG:3857 -o   # Web Mercator
mapshaper data.shp -proj EPSG:32611 -o  # UTM zone 11N (WGS84)
```

**Aliases** are short names for common projections. Run `mapshaper -projections` to print the full list. The built-in aliases are:

| Alias | Equivalent PROJ string |
|---|---|
| `wgs84` | `+proj=longlat +datum=WGS84` |
| `webmercator` | `+proj=merc +a=6378137 +b=6378137` |
| `robinson` | `+proj=robin +datum=WGS84` |
| `albersusa` | [Composite U.S. projection](#albersusa) (see below) |

You can also use a bare PROJ projection name (without `+proj=`) as shorthand when no extra parameters are required:

```bash
mapshaper world.shp -proj robin -o
```

## Auto-fitted parameters

For some conic and cylindrical projections, you can supply just the projection name and Mapshaper will calculate suitable parameters from the extent of the data. This is useful when you want a locally appropriate projection without looking up specific values.

For **Lambert Conformal Conic** (`lcc`) and **Albers Equal Area Conic** (`aea`), Mapshaper calculates the central meridian (`lon_0`) and two standard parallels (`lat_1`, `lat_2`) using the one-sixth rule applied to the data's bounding box.

For **Transverse Mercator** (`tmerc`, `etmerc`), it calculates the central meridian and latitude of origin (`lon_0`, `lat_0`) from the center of the bounding box.

For **Universal Transverse Mercator** (`utm`), it calculates the UTM zone from the center longitude of the bounding box and adds `+south` when the center latitude is in the southern hemisphere.

```bash
# Mapshaper fills in lon_0, lat_1, lat_2 based on the data extent
mapshaper region.geojson -proj lcc -o region_lcc.geojson

# Equivalent — Mapshaper fills in lon_0 and lat_0
mapshaper region.geojson -proj tmerc -o region_tmerc.geojson

# Equivalent — Mapshaper fills in zone and hemisphere
mapshaper region.geojson -proj utm -o region_utm.geojson
```

When Mapshaper auto-fits parameters, it prints the expanded PROJ string so you can see exactly what was applied — for example: `Converted "lcc" to "+proj=lcc +lon_0=-95.5 +lat_1=30.17 +lat_2=44.83"`. You can copy that string and use it explicitly if you need reproducible output.

## albersusa

`albersusa` is a Mapshaper-specific composite projection for maps of the United States. It is not part of the PROJ library. It applies Albers Equal Area Conic to the contiguous 48 states, then tiles Alaska (scaled down) and Hawaii as insets in the lower-left corner of the map.

```bash
mapshaper us-states.shp -proj albersusa -o
```

Two optional flags add insets for outlying territories:

- `+PR` — Puerto Rico
- `+VI` — U.S. Virgin Islands (placed alongside Puerto Rico)

```bash
mapshaper us-states.shp -proj albersusa +PR +VI -o
```

The position, scale, rotation, and other properties of each inset can be overridden with named parameters if the defaults do not suit your map. See the [`-proj` reference](/docs/reference.html#-proj) for the full option syntax.

## Finding CRS definitions

Several websites provide PROJ strings and EPSG codes for coordinate systems worldwide:

- **[EPSG.io](https://epsg.io/)** — search by place name, CRS name, or EPSG code. Each entry shows the PROJ string and WKT definition and lets you preview the projection on a map.
- **[SpatialReference.org](https://spatialreference.org/)** — similar database built directly from the PROJ library. Good for browsing the full set of supported systems.
- **[PROJ documentation](https://proj.org/operations/projections/)** — reference for every projection in PROJ, including all supported parameters. Mapshaper's JavaScript port supports most but not all of them; run `mapshaper -projections` to see the exact list.

## Coordinate system quirks and limitations

- GeoJSON and TopoJSON files are assumed to use WGS84 when their bounding boxes fall within the normal range for decimal degree coordinates.
- Mapshaper does not support coordinate transformations that require grid-shift files (for example, NAD27 → WGS84). If a transformation silently fails, this is the likely cause.
- Projections that can only represent part of the globe — including orthographic (`ortho`), near-side perspective (`nsper`, `geos`), gnomonic (`gnom`), stereographic (`stere`), and Lambert Azimuthal Equal-Area (`laea`) — automatically clip input data to the projection's valid extent before projecting. This prevents distorted or invalid geometry from coordinates outside the visible area.
- For projections that introduce significant curvature along straight lines, add the `densify` option to interpolate extra vertices along long segments:

  ```bash
  mapshaper data.shp -proj +proj=ortho +lat_0=45 +lon_0=-100 densify -o
  ```

- When `-proj` targets a layer, all topologically related layers (those sharing the same geometry) are also reprojected. To reproject all layers, use `target=*`.
- The `init=` option is available for files whose source CRS is unknown and cannot be inferred from a `.prj` file. Shapefiles normally carry a `.prj` sidecar; GeoJSON and TopoJSON are assumed to be WGS84 when their coordinates fall within the standard lat/long range.

## The -proj command

See the [`-proj` reference](/docs/reference.html#-proj) for the full list of options.
