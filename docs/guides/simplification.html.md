---
title: Simplification
description: How to choose between Visvalingam and Douglas-Peucker, and tips for getting good-looking results from polygon and polyline simplification.
---

# Simplification

Simplification reduces the number of vertices in polylines and polygon boundaries while preserving as much of their shape as possible. It is Mapshaper's original feature, and the workhorse for reducing large, detailed datasets to a size practical for web maps.

## Choosing a method

Mapshaper offers three simplification methods, selectable as method options in the web UI's Simplification menu or flags to `-simplify` on the command line. 

- **`Douglas-Peucker`** (also known as Ramer–Douglas–Peucker). Guarantees that simplified lines stay within a fixed distance of the original. Good for stripping excess vertices to reduce file size, but tends to introduce visible spikes at high simplification.
- **`Visvalingam / effective area`**. Iteratively removes the point that forms the triangle of smallest area with its two neighbors.
- **`Visvalingam / weighted area`**. A variation on Visvalingam's algorithm that underweights points at sharp angles, so they are removed earlier than in standard Visvalingam. The result is visibly smoother lines and fewer jagged spikes at high simplification. You can fine tune this effect by setting the `weighting=` option (default is 0.7). The larger the parameter, the greater the smoothing effect.

Weighted Visvalingam is Mapshaper's default method because it can produce good-looking generalizations of highly detailed source layers. But be aware that none of these methods can approach the quality that a cartographer achieves when generalizing linework by hand.

If you are primarily interested in removing as many vertices as possible without visible changes to the shape of the lines, you may find that Douglas-Peucker combined with an appropriate `interval=` or `resolution=` parameter gives the best results.

**Figures**

Natural Earth 10m coastlines, simplified with modified Visvalingam at 5% point retention.
![image](/docs/images/simplification-mod2.png)

Same file using Douglas-Peucker, also 5% simplification.
![image](/docs/images/simplification-dp.png)

Zoomed-in view of Norwegian coastline at 5% simplification; left: weighted Visvalingam, right: Douglas-Peucker. These figures illustrate the different ways each method removes detail. In a finished map, you would apply far less simplification than this — simplification artifacts generally should not be discernible to the naked eye.

![image](/docs/images/simplification-detail.png)

## Simplification amount

On the command line, there are three ways to specify the amount of simplification to apply: `percentage`, `interval`, and `resolution`.

Percentage is the default (you don't need to type `percentage=`). It gives the percentage of removable vertices to retain, so lower numbers = more simplification.

```bash
mapshaper provinces.geojson -simplify 20% \
  -o provinces_simplified.geojson
```

The `interval` option takes a distance threshold. With Douglas-Peucker simplification (see below), this is the maximum deviation of the simplified line from the original. With Visvalingam-based methods, `interval=` describes the approximate size of the smallest details in the simplified output.

```bash
mapshaper provinces.geojson -simplify interval=500m \
  -o provinces_simplified.geojson
```

The `resolution=` option lets you specify the intended display size of your map in SVG units (equivalent to CSS pixels). A larger value retains more detail, since Mapshaper estimates the display size using the full extent of your data. Be careful with this option if your final map will show a smaller geographic area, as the paths may be over-simplified.

```bash
mapshaper provinces.geojson -simplify resolution=800 \
  -o provinces_simplified.geojson
```

See the [`-simplify` reference](/docs/reference.html.md#-simplify) for the full set of options.


## Avoiding shape removal

At high simplification, small polygons can disappear entirely. Pass `keep-shapes` to `-simplify` (or tick **prevent shape removal** in the web UI's Simplify panel) to retain at least one ring per multipart feature, regardless of how aggressive the simplification is.

```bash
mapshaper islands.geojson -simplify 5% keep-shapes -o islands-simplified.geojson
```

## Spherical vs planar geometry

By default, Mapshaper simplifies lat/long coordinates on the surface of a sphere, using 3D geometry. This applies a consistent amount of simplification across the whole globe, including near the poles. If your data is in a projected coordinate system, simplification uses 2D planar geometry.

## Avoiding self-intersections

Heavy simplification can pull adjacent polygon edges across each other, producing self-intersections. The `-simplify` command detects and tries to remove intersections automatically by rolling back simplification where the intersections occur. In the web UI, you can enable "detect line intersections" on the Display panel to show intersections as red dots. In this mode, you will see a button for repairing intersections caused by simplification.

The [`-clean`](/docs/reference.html.md#-clean) command will also remove intersections:

```bash
mapshaper provinces.shp -simplify 5% -clean -o provinces.geojson
```

## Simplifying multiple layers consistently

When you import multiple layers using `-i combine-files`, Mapshaper builds a shared topology. This means that boundaries shared between layers — for example, aligned state and county polygon borders — are simplified identically across all layers.
Without this, the layers would diverge during simplification, creating visible gaps and overlaps where they should align.

```bash
mapshaper -i states.shp counties.shp combine-files \
  -simplify 10% \
  -o out/
```

The web app does **not** combine files automatically when you import multiple layers. To get the shared-topology behavior in the web app, tick **with advanced options** in the import dialog and add `combine-files` to the options field.
