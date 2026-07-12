---
title: Map projections
description: How to reproject geographic data with Mapshaper, including CRS notation, built-in aliases, and the albersusa composite projection.
---

# Map projections

Mapshaper's [`-proj`](/docs/reference.html#-proj) command reprojects a dataset from one coordinate reference system (CRS) to another, using a JavaScript port of the [PROJ](https://proj.org/) coordinate transformation library.

Run `mapshaper -projections` (or just `projection` in the web app console) to print the full list of available projections.

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

**PROJ codes** are sequences of `+key=value` parameters used by the [PROJ](https://proj.org/) projection system and supported by Mapshaper. You will often see PROJ codes from other sources with a large number of parameters containing default values, such as `+units=m` and `+x_0=0 +y_0=0` &mdash; these parameters can safely be omitted.

Examples of PROJ codes for some common projections (with default values omitted)
```bash
# Lambert Conformal Conic
+proj=lcc +lat_1=33 +lat_2=45 +lat_0=39 +lon_0=-96
# Albers Equal Area Conic
+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=23 +lon_0=-96
# Transverse Mercator
+proj=tmerc +lon_0=-75 +lat_0=0
# Orthographic
+proj=ortho +lat_0=45 +lon_0=-100
# Robinson
+proj=robin
# Mollweide
+proj=moll
# Mercator
+proj=merc
# Web Mercator
+proj=merc +a=6378137 +b=6378137
```

Example of using a PROJ code with the `-proj` command

```bash
mapshaper unprojected.shp \
-proj +proj=lcc +lat_1=33 +lat_2=45 +lat_0=39 +lon_0=-96 \
-o projected.shp
```

**Bare projection name**

You can also use a bare PROJ projection name (without `+proj=`) as shorthand:

```bash
mapshaper world.shp -proj robin -o
```

**EPSG and ESRI codes** are numeric CRS identifiers from the [EPSG registry](https://epsg.io/) and from ESRI. Mapshaper supports many of them.

```bash
mapshaper data.shp -proj EPSG:3857 -o   # Web Mercator
mapshaper data.shp -proj EPSG:32611 -o  # UTM zone 11N (WGS84)
```

**Aliases** are short names for common projections. The built-in aliases are:

| Alias | Equivalent PROJ string |
|---|---|
| `wgs84` | `+proj=longlat +datum=WGS84` |
| `webmercator` | `+proj=merc +a=6378137 +b=6378137` |
| `robinson` | `+proj=robin +datum=WGS84` |
| `albersusa` | [Composite U.S. projection](#albersusa) (see below) |



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

When Mapshaper auto-fits parameters, it prints the expanded PROJ string so you can see exactly what was applied. An example message: `Converted "lcc" to "+proj=lcc +lon_0=-95.5 +lat_1=30.17 +lat_2=44.83"`. You can copy this PROJ string and use it explicitly if you need reproducible output.

## albersusa

`albersusa` is a Mapshaper-specific composite projection for maps of the United States. It applies Albers Equal Area Conic to the contiguous 48 states, then places Alaska (scaled down) and Hawaii as insets in the lower-left corner of the map.

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

## Interrupted world projections

### Goode Homolosine and Mollweide projections

- `igh` — Interrupted Goode Homolosine, land emphasis
- `imoll` — Interrupted Mollweide, land emphasis
- `igh_o` — Interrupted Goode Homolosine, ocean emphasis
- `imoll_o` — Interrupted Mollweide, ocean emphasis

![Interrupted Mollweide world projection](/docs/images/interrupted-mollweide.png)

The ocean-emphasis projections default to `+lon_0=-160`; an explicit
`+lon_0=` overrides this default.

```bash
# Project world polygons using Goode Homolosine; add a graticule
mapshaper world.geojson \
  -proj +proj=igh \
  -o world-igh.geojson \
  -graticule \
  -o graticule-igh.geojson

# Create an ocean-emphasis Interrupted Mollweide layer with a neatline
mapshaper world.geojson \
  -proj +proj=imoll_o \
  -o world-imoll-o.fgb \
  -graticule outline \
  -o neatline-imoll-o.fgb
```

### Dymaxion projections

Mapshaper includes two versions of Buckminster Fuller's Airocean
(Dymaxion) icosahedral layout:

- `dymaxion` — Gray-Fuller transformation within each triangular facet
- `dymaxion2` — gnomonic transformation within each facet

The Gray-Fuller version minimizes shape and area distortion; the gnomonic version maps great-circle segments to straight lines within each facet.

```bash
mapshaper world.geojson \
  -proj +proj=dymaxion densify \
  -o world-dymaxion.geojson \
  -graticule outline \
  -o neatline-dymaxion.geojson
```

### Octahedral projections

Mapshaper includes two aspects of a butterfly projection, plus the M-shaped Cahill-Keyes projection. Like the 1909 Cahill projection and the later Waterman butterfly projection, Mapshaper's butterfly projections arrange the globe's eight octahedral facets in a butterfly layout, but each facet is projected using Keyes' 12-zone method rather than Cahill's or Waterman's original facet transformations.

![Butterfly projection, Pacific and Atlantic aspects](/docs/images/butterfly-projection.png)

- `butterfly` — Pacific-centered, with a default central meridian of
  157.5°E
- `butterfly2` — Atlantic-centered, with a default central meridian of
  20°W
- `cahill_keyes` — Cahill-Keyes M-shaped profile, with a
  default central meridian of 20°W

```bash
mapshaper world.geojson \
  -proj +proj=butterfly densify \
  -o world-butterfly.geojson \
  -graticule outline \
  -o neatline-butterfly.geojson
```

All projections in this section are forward-only: no inverse formulas are
available, and raster reprojection is not supported.

## Finding CRS definitions

Several websites provide PROJ strings and EPSG codes for coordinate systems worldwide:

- **[EPSG.io](https://epsg.io/)** — search by place name, CRS name, or EPSG code. Each entry shows the PROJ string and WKT definition and lets you preview the projection on a map.
- **[SpatialReference.org](https://spatialreference.org/)** — similar database built directly from the PROJ library. Good for browsing the full set of supported systems.
- **[PROJ documentation](https://proj.org/operations/projections/)** — reference for every projection in PROJ, including all supported parameters. Mapshaper's JavaScript port supports most but not all of them; run `mapshaper -projections` to see the exact list.

## Coordinate system quirks and limitations

- GeoJSON and TopoJSON files are assumed to use WGS84 when their bounding boxes fall within the normal range for decimal degree coordinates.
- Mapshaper does not support coordinate transformations that require grid-shift files (for example, NAD27 → WGS84). If a transformation silently fails, this is the likely cause.
- Projections that can only represent part of the globe — including orthographic (`ortho`), near-side perspective (`nsper`, `geos`), gnomonic (`gnom`), stereographic (`stere`), and Lambert Azimuthal Equal-Area (`laea`) — automatically clip input data to the projection's valid extent before projecting. This prevents distorted or invalid geometry from coordinates outside the visible area.
- Interrupted and polyhedral projections (`igh`, `imoll`, `igh_o`, `imoll_o`, `dymaxion`, `dymaxion2`, `butterfly`, `butterfly2`, `cahill_keyes`) are forward-only; inverse projection and raster reprojection are not supported.
- For projections that introduce significant curvature along straight lines, add the `densify` option to interpolate extra vertices along long segments:

  ```bash
  mapshaper data.shp -proj +proj=ortho +lat_0=45 +lon_0=-100 densify -o
  ```

- When `-proj` targets a layer, all topologically related layers (those sharing the same geometry) are also reprojected. To reproject all layers, use `target=*`.
- The `init=` option is available for files whose source CRS is unknown and cannot be inferred from a `.prj` file. Shapefiles normally carry a `.prj` sidecar; GeoJSON and TopoJSON are assumed to be WGS84 when their coordinates fall within the standard lat/long range.
