---
title: Smoothing
description: How Mapshaper's -smooth command generalizes lines while filtering fine detail and preserving corners.
---

# Smoothing

`-smooth` generalizes polygon and polyline geometry by replacing the original vertices with smooth curves. Unlike [`-simplify`](/docs/guides/simplification.html.md), which thins existing vertices, `-smooth` recomputes the line's shape. It also filters out small intricate details and preserves sharp corners, such as surveyed borders.

```bash
mapshaper coastline.shp -smooth 5km -o smoothed.shp
```

The `<distance>` parameter sets the smoothing resolution: detail finer than this scale is removed.


## Prefiltering intricate detail

Small, intricate features — jetties, narrow inlets, docks, spikes — often produce kinks or self-intersections after smoothing. By default, `-smooth` first removes detail below the smoothing scale.

In the example below, the small basin, dock outline, and other fine detail are dropped before smoothing.

![image](/docs/images/smooth-prefilter.png)

Use `no-prefilter` to skip this step and smooth the input as-is.

## Corner preservation

By default, `-smooth` preserves corners where straight runs meet, such as surveyed borders.

Here, the straight surveyed border is preserved while the riverine border it meets is smoothed:

![image](/docs/images/smooth-corners.png)

Corner detection is scale-aware: it looks for changes of direction that are abrupt relative to the smoothing distance. It also becomes less sensitive on coarsely-sampled data, where ordinary bends often have larger angles between vertices.

Use `corner-bias=` to tune corner sensitivity relative to this automatic baseline, or `no-corners` to smooth the whole line uniformly.

```bash
# Round off corners instead of preserving them.
mapshaper borders.shp -smooth 5km no-corners -o smoothed.shp
```

## Adaptive vertex density

Output vertices are placed adaptively: more on tight bends, fewer on straight or gently curving runs.

The dots below mark output vertices along a smoothed line.

![image](/docs/images/smooth-vertex-density.png)

The `max-bend-angle=` option (default `8` degrees) controls output density. A larger value uses fewer vertices; a smaller value uses more.

## Technical notes

- The `-smooth` command uses a Gaussian smoothing kernel.
- Curve compensation reduces the shrinkage that smoothing causes around bends. The `gain=` option controls this correction.
- Lat-long data is smoothed on a sphere: coordinates are converted to 3D geocentric coordinates, distances are measured along great circles, and the result is converted back to longitude and latitude.

See the [`-smooth` reference](/docs/reference.html.md#-smooth) for the full set of options.
