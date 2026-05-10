---
title: Preparing data for D3 and web maps
description: Practical recipes for preparing GeoJSON, TopoJSON, and vector tile source data for D3, Leaflet, MapLibre, and other web mapping tools.
---

# Preparing data for D3 and web maps

GeoJSON is the common exchange format for web maps, but different tools make different assumptions about coordinates, polygon winding, and projection. This page covers the fixes for the most common problems when moving data from Mapshaper into D3, Leaflet, MapLibre, Mapbox GL, Observable notebooks, and similar JavaScript workflows.

## Quick recipes

### Export GeoJSON for Leaflet, MapLibre, Mapbox GL, and most web map APIs

Most web map libraries expect GeoJSON coordinates in WGS84 longitude/latitude, even when the map is displayed in Web Mercator. If your source file has coordinates other than WGS84, reproject to WGS84 before exporting:

```bash
mapshaper input.shp -proj wgs84 -o output.geojson
```

If you're unsure what CRS your data file is using, you can look it up using mapshaper's `-info` command. It will give you the CRS in proj4 format, which is used by Mapshaper's `-proj` command.

```bash
mapshaper input.shp -info
```

If your input is a (non-standard) GeoJSON or TopoJSON file with projected coordinates, you'll have to tell Mapshaper what CRS the coordinates are in before reprojecting. If you do not know the CRS, look for documentation on the source dataset's CRS. In the example below, you would replace `EPSG:3857` (Web Mercator) with the correct source CRS.

```bash
mapshaper projected.geojson \
  -proj init=EPSG:3857 \
  -proj wgs84 \
  -o output.geojson
```

### Optimize GeoJSON for web delivery

For browser delivery, you can shrink the size of a file by reducing coordinate precision and removing fields you do not need:

```bash
mapshaper input.shp \
  -filter-fields name,id,population \
  -proj wgs84 \
  -o precision=0.00001 output.geojson
```

`precision=0.00001` is about one metre at the equator. Use a coarser value for smaller files when your map scale allows it.

### Export GeoJSON for D3's `d3.geoPath()`

D3's geographic projections, such as `d3.geoMercator()` and `d3.geoAlbers()`, expect GeoJSON in WGS84 longitude/latitude. For polygon data, also pass `reverse-winding`, which reverses the ring orientation to match D3's spherical polygon convention (see [Winding order and filled polygons](#winding-order-and-filled-polygons) below for details).

```bash
mapshaper input.shp \
  -proj wgs84 \
  -o reverse-winding output.geojson
```

In JavaScript:

```js
const projection = d3.geoMercator().fitSize([width, height], geojson);
const path = d3.geoPath(projection);

svg.selectAll("path")
  .data(geojson.features)
  .join("path")
  .attr("d", path);
```

### Use projected coordinates with D3

If you intentionally export projected coordinates from Mapshaper, do not pass the data to `d3.geoMercator()` or another D3 geographic projection. The coordinates are already projected. Use `d3.geoIdentity()` instead, or export SVG directly from Mapshaper.

```bash
mapshaper input.shp -proj albersusa -o projected.geojson
```

```js
const projection = d3.geoIdentity()
  .reflectY(true)
  .fitSize([width, height], geojson);
const path = d3.geoPath(projection);
```

This treats the coordinates as planar x/y values. It is useful for custom SVG or Canvas rendering, but it is not the format expected by Leaflet, MapLibre, Mapbox GL, or most tile-based web maps.

### Export TopoJSON for D3

TopoJSON is often a better format than GeoJSON for D3 maps of polygon mosaics, such as countries, states, counties, or census areas. It stores shared boundaries once and typically uses quantized, delta-encoded path coordinates, so files are usually much smaller.

```bash
mapshaper counties.shp \
  -proj wgs84 \
  -simplify 10% keep-shapes \
  -o counties.topojson
```

In D3, load the TopoJSON file and convert the object you want to draw back to GeoJSON features with the `topojson-client` library:

```js
const topology = await d3.json("counties.topojson");
const counties = topojson.feature(topology, topology.objects.counties);

const projection = d3.geoAlbersUsa().fitSize([width, height], counties);
const path = d3.geoPath(projection);
```

TopoJSON still has the same coordinate-system question as GeoJSON. To use D3's projection system, export WGS84 longitude/latitude and let D3 project in the browser. For pre-projected planar drawing, use `d3.geoIdentity()` after exporting projected TopoJSON.

If you are combining multiple layers for one D3 map, TopoJSON can keep them in one file:

```bash
mapshaper -i combine-files states.shp counties.shp places.shp \
  -proj wgs84 \
  -o format=topojson map-data.topojson
```


## Understanding the warnings

### "RFC 7946 warning: non-WGS84 GeoJSON output"

RFC 7946, the current GeoJSON specification, defines GeoJSON coordinates as WGS84 longitude/latitude. Mapshaper can still write GeoJSON with projected coordinates, but it prints this warning because some tools will place the data in the wrong location or refuse to read it. For most web maps, reproject to WGS84 before export. The warning is informational when projected GeoJSON is intentional, such as for D3 planar rendering with `d3.geoIdentity()`.

### "My GeoJSON has projected coordinates but no CRS"

GeoJSON no longer has a standard `crs` member. If a projected GeoJSON is saved and re-opened later, Mapshaper cannot infer its CRS unless the coordinate bounds happen to look like longitude/latitude. Set the source CRS explicitly:

```bash
mapshaper projected.geojson -proj init=EPSG:5070 -proj wgs84 -o output.geojson
```

To preserve CRS metadata between editing sessions, use Shapefile, GeoPackage, FlatGeobuf, GeoParquet, or a Mapshaper snapshot (`.msx`) instead of projected GeoJSON.

## Winding order and filled polygons

Polygon winding controls which side of a ring is treated as the polygon interior. For most small land polygons:

- RFC 7946 GeoJSON uses counter-clockwise outer rings and clockwise holes.
- D3's spherical polygon convention uses the opposite orientation (see the [d3-geo winding order notebook](https://observablehq.com/@d3/winding-order) and the [d3-geo overview](https://d3js.org/d3-geo) for details).
- SVG and Canvas planar rendering usually care less, but holes can still render incorrectly when winding is inconsistent.

Mapshaper writes RFC 7946 winding by default. For D3 geographic rendering, try:

```bash
mapshaper input.shp -proj wgs84 -o reverse-winding output.geojson
```

If polygons disappear, holes fill in, or the entire world appears filled except your intended polygon, winding order is a likely cause.

`reverse-winding` is a practical fix for ordinary land polygons. It does not apply D3's special spherical rules for very large polygons, ocean masks, or polygons larger than a hemisphere. For those cases, prefer land polygons over ocean polygons, clip the data to the visible area, or test the output carefully in D3.

## Antimeridian and ocean caveats

The antimeridian is the 180° longitude line on the opposite side of the globe from the prime meridian. Geometries that cross it — such as features covering Fiji, Russia, the Aleutian Islands, or any Pacific-spanning or global dataset — must be split into two parts at the 180° boundary. Tools like Mapshaper and QGIS expect geometries to be divided this way, and will produce rendering artifacts if they aren't. Without splitting, a polygon or line that should neatly cross the antimeridian will instead render as a streak shooting across the entire map, because the renderer interprets the coordinate jump from +180° to −180° as a straight line through planar space rather than a short hop across the date line.

For D3 geographic projections, keep coordinates in WGS84 and let D3 handle spherical projection, clipping and removal of antimeridian cuts:

```bash
mapshaper world.shp -proj wgs84 -o reverse-winding world.geojson
```

For planar rendering or libraries that do not handle dateline wrapping well, split or clean the geometry before export and test the result at the target map extent:

```bash
mapshaper world.shp -clean -proj wgs84 -o world.geojson
```

Ocean polygons and "world minus land" masks are harder than ordinary land polygons because their intended interior may cover most of the globe. Winding and clipping rules differ between spherical and planar renderers. If your goal is a land map, exporting land polygons is usually more robust than exporting an ocean polygon with holes.

## Planar vs spherical rendering

When troubleshooting, first decide which rendering model you are using.

**Spherical rendering** means the JavaScript library receives longitude/latitude and projects it at draw time. This is the normal model for:

- D3 with `d3.geoMercator()`, `d3.geoAlbers()`, `d3.geoNaturalEarth1()`, etc.
- Leaflet, MapLibre, Mapbox GL, and other web map libraries
- GeoJSON meant to be shared with other tools

Use WGS84 GeoJSON:

```bash
mapshaper input.shp -proj wgs84 -o output.geojson
```

**Planar rendering** means coordinates are already x/y values in the drawing coordinate system or in a projected CRS. This is useful for static SVG/Canvas maps, custom D3 layouts, and pre-projected publication maps. Use Mapshaper to project first, then use `d3.geoIdentity()` to render as planar geometry — see [Use projected coordinates with D3](#use-projected-coordinates-with-d3) above for an example.

If a map appears in the wrong place, appears tiny, or is wildly distorted, the most common cause is mixing these models: projected coordinates sent to a spherical web map, or longitude/latitude coordinates treated as planar pixels.

## Preparing data for vector tile pipelines

Mapshaper is useful before a vector tile generator such as [Tippecanoe](https://github.com/felt/tippecanoe), Mapbox Tiling Service, or a similar hosted tile pipeline. Use Mapshaper for the editing steps it is good at: reprojecting to WGS84, cleaning topology, simplifying source geometry, joining attributes, dissolving features, clipping to an area of interest, and dropping fields you do not need in the tiles.

Most vector tile pipelines expect input GeoJSON in WGS84 longitude/latitude. Do not pre-project to Web Mercator unless the tiling tool explicitly asks for it; the tile generator handles the tile-space projection.

```bash
mapshaper raw-boundaries.shp \
  -filter-fields name,id,population \
  -clean \
  -proj wgs84 \
  -o precision=0.00001 fix-geometry boundaries.geojson

tippecanoe -o boundaries.mbtiles -zg --drop-densest-as-needed boundaries.geojson
```

For large datasets, newline-delimited GeoJSON (`ndjson`) is often easier for downstream tools to stream:

```bash
mapshaper raw-points.csv \
  -points x=lon y=lat \
  -filter-fields name,type \
  -proj wgs84 \
  -o ndjson points.ndjson

tippecanoe -o points.mbtiles -zg points.ndjson
```

If your Mapshaper project has several logical tile layers, export separate files and pass them to the tile generator as separate layers. This usually gives clearer tile schemas than combining unrelated feature types into one GeoJSON FeatureCollection.

```bash
mapshaper roads.shp -filter-fields class,name -proj wgs84 -o roads.geojson
mapshaper water.shp -filter-fields kind,name -proj wgs84 -o water.geojson
mapshaper places.shp -filter-fields name,population -proj wgs84 -o places.geojson
```

For Tippecanoe-specific metadata, Mapshaper's `hoist=` output option can promote a property out of the GeoJSON `properties` object onto the top-level Feature. This is useful for fields that Tippecanoe reads outside `properties`, such as feature-level metadata you prepared upstream. Keep this use narrow; most ordinary styling attributes should remain inside `properties`.

```bash
mapshaper input.geojson -o hoist=tippecanoe output.geojson
```

Avoid over-processing before tiling. Tile generators simplify, clip, and drop detail differently at each zoom level. Use Mapshaper to remove obvious waste and fix source-data problems, but test tiles at several zoom levels before applying aggressive simplification or coordinate rounding.

## Checklist

Before filing a bug or debugging renderer code, check:

- Does the target library expect WGS84 longitude/latitude GeoJSON?
- If the input GeoJSON is projected, did you set its CRS with `-proj init=...` before `-proj wgs84`?
- Are you using `d3.geoPath(d3.geoMercator())` for lon/lat data, and `d3.geoPath(d3.geoIdentity())` for projected data?
- For D3 polygon rendering, does `-o reverse-winding` fix missing or inverted fills?
- Would TopoJSON be smaller or easier for your D3 map than GeoJSON?
- If you are preparing vector tiles, are you giving the tile generator WGS84 input rather than pre-projected Web Mercator?
- Does the dataset cross the antimeridian or contain ocean/global mask polygons?
- Did coordinate rounding (`precision=`) introduce intersections that need `fix-geometry`?

## Related docs

- [GeoJSON format notes](/docs/formats/geojson.html.md)
- [TopoJSON format notes](/docs/formats/topojson.html.md)
- [Projections guide](/docs/guides/projections.html.md)
- [Topology and cleaning](/docs/guides/topology.html.md)
- [`-proj` reference](/docs/reference.html.md#-proj)
- [`-o` reference](/docs/reference.html.md#-o)
