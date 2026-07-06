---
title: Smoothing
description: How Mapshaper's -smooth command generalizes lines while filtering fine detail and preserving corners.
---

# Smoothing

`-smooth` generalizes polygon and polyline geometry by replacing the original vertices with smooth curves. Unlike [`-simplify`](/docs/guides/simplification.html), which thins existing vertices, `-smooth` recomputes the line's shape. It also filters out small intricate details and preserves sharp corners, such as surveyed borders.

```bash
mapshaper coastline.shp -smooth 5km -o smoothed.shp
```

The `<distance>` parameter sets the smoothing resolution: detail finer than this scale is removed.

## Usage tip

For best geographical fidelity, apply `-smooth` to unsimplified linework. Smoothing can also be applied to simplified paths, but low-resolution inputs give the smoother less information to work with.

Smoothed low-resolution contour lines:

![image](/docs/images/smooth-lowres-contours.png)


## Prefiltering intricate detail

When line smoothing is applied to small, intricate features — jetties, narrow inlets, docks, spikes — the output can include kinks or self-intersections. To prevent this, `-smooth` first removes detail below the smoothing scale.

With the prefilter, the small basin, dock outline, and other fine detail are dropped before smoothing.

![image](/docs/images/smooth-prefilter-on.png)

Without the prefilter, the same details pull the smoothed line into unwanted bends and loops.

![image](/docs/images/smooth-prefilter-off.png)

Use `no-prefilter` to skip this step and smooth the input as-is.

## Corner preservation

By default, `-smooth` protects long straight sections from being reshaped by smoothing.

Here, the straight lines are preserved and the riverine section is smoothed:

![image](/docs/images/smooth-corners.png)

Use `corner-bias=` to adjust the sensitivity of corner detection, or `no-corners` to smooth the entire line uniformly.

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

See the [`-smooth` reference](/docs/reference.html#-smooth) for the full set of options.
