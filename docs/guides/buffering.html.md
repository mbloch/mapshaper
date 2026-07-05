---
title: Buffering
description: How Mapshaper's -buffer command creates geodesic and planar buffers, fills gaps, and builds topological polygon buffers.
---

# Buffering

`-buffer` creates buffer polygons around point, polyline or polygon features. When the input data is in longitude-latitude coordinates, Mapshaper creates geodesic buffers, so distances such as `500m` or `2km` are measured on the ground. Projected data is buffered in its planar coordinate system by default; add `geodesic` to use ground distances instead.

```bash
mapshaper rivers.shp -buffer 2km -o river_buffers.shp
```

Pink: source line. Black: buffer polygon.

![image](/docs/images/buffer-plain.png)

## Filling gaps

The `fill-gaps` option fills enclosed holes and narrow-mouthed inlets without growing the outer boundary. This is useful for filling rivers, bays, channels and other gaps inside a polygon layer while leaving the open coastline in place.

```bash
mapshaper states.shp -buffer 5km fill-gaps -o output.shp
```

The example below fills a long river inlet and some small gaps along the coastline while preserving the main outer boundary.

![image](/docs/images/buffer-fill-gaps.png)

Use `max-widening=` with `fill-gaps` to limit how wide a gap may be before it is left open.

## Topological buffers

For polygon layers, the `topological` option buffers only unshared polygon boundaries, such as coastlines and holes. Shared boundaries between adjacent polygons are not buffered, and overlapping buffer areas are split between features by proximity.

```bash
mapshaper countries.shp -buffer 25km topological -o coast_buffers.shp
```

In the example below, buffers are created along coastlines, while internal borders are left unchanged.

![image](/docs/images/buffer-topological.png)

## Notes and limitations

- Geodesic buffers that cross the antimeridian are split and wrapped automatically. This support is still experimental.
- Geodesic buffer size is calculated using a spherical, not ellipsoidal, earth model, so it may not be accurate enough for GIS analysis.
- Geodesic buffers of lines and polygons cannot extend to the poles. There is an experimental `polar` option with partial support for growing polygon buffers that reach the poles.

See the [`-buffer` reference](/docs/reference.html.md#-buffer) for the full set of options.
