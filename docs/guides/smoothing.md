---
title: Smoothing
description: How Mapshaper's -smooth command generalizes lines -- adaptive vertex density, prefiltering of intricate detail, and corner preservation.
---

# Smoothing

`-smooth` generalizes the geometry of polygon and polyline features by replacing their original vertices with smooth curves. Unlike [`-simplify`](/docs/guides/simplification.html), which thins out existing vertices but leaves them in their original positions, `-smooth` recomputes the line's shape, giving much smoother results on jagged, over-detailed data. Besides smoothing, `-smooth` filters out small intricate details that would otherwise confuse the smoothing algorithm, and it detects and preserves sharp corners -- such as surveyed borders -- instead of rounding them off.

```bash
mapshaper coastline.shp -smooth 5km -o smoothed.shp
```

The `<distance>` parameter sets the smoothing resolution: detail finer than this scale is removed. It's roughly how far the smoothed line can shift from the original, at the sharp bends where displacement is greatest.

Magenta: original coastline. Black: the same coastline after `-smooth 3km`.

![image](/docs/images/smooth-overview.png)

## Adaptive vertex density

The smoothed output isn't evenly resampled. Vertices are denser where the line bends sharply and sparser where it runs straight or curves gently, so vertex density adapts to the local curvature. This keeps sharp bends looking smooth without wasting vertices on straighter stretches.

The dots below mark output vertices along a smoothed line: they cluster tightly around the tight loop and thin out on the straighter runs.

![image](/docs/images/smooth-vertex-density.png)

The `max-bend-angle=` option (default `8` degrees) controls how aggressively vertices are thinned, by setting the maximum bend allowed between consecutive output segments. A larger value keeps fewer vertices, at the cost of slightly more angular joins; a smaller value keeps more vertices for smoother joins.

## Prefiltering intricate detail

Small, intricate features -- jetties, narrow inlets, docks, spikes -- are hard to smooth cleanly, and often end up as kinks or self-intersections in the output. By default, `-smooth` runs a prefilter pass before smoothing that removes detail below the smoothing scale, instead of trying (and failing) to smooth it.

In the example below, the small basin, dock outline, and other fine detail along this stretch of coast are dropped entirely, leaving a clean line to smooth.

![image](/docs/images/smooth-prefilter.png)

Use `no-prefilter` to skip this step and smooth the input as-is.

## Corner preservation

Not everything in a dataset should be smoothed. Artificial, surveyed borders often meet natural features -- or each other -- at sharp corners that should stay sharp. By default, `-smooth` detects these corners and pins them in place, smoothing only the runs of geometry between them.

Here, the straight surveyed border (bottom) is left completely unchanged, corners intact, while the coastline it meets (top) is smoothed normally:

![image](/docs/images/smooth-corners.png)

Corner detection is scale-aware: it looks for a change of direction that's abrupt relative to the smoothing distance, not just any sharp angle in the original data. It's also adaptive to the input data: coarsely-sampled datasets (e.g. low-resolution contours, or coastlines that have already been simplified) tend to have larger bend angles between vertices, so detection automatically becomes less sensitive on this kind of data, to avoid mistaking ordinary bends for corners.

Use `corner-bias=` to tune corner sensitivity relative to this automatic baseline -- positive values preserve more corners, negative values fewer -- or `no-corners` to turn off corner detection and smooth the whole line uniformly.

```bash
# Smooth more aggressively, but round off corners instead of preserving them.
mapshaper borders.shp -smooth 5km no-corners -o smoothed.shp
```

See the [`-smooth` reference](/docs/reference.html#-smooth) for the full set of options.
