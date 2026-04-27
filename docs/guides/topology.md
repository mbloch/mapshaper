---
title: Topology and cleaning
description: How Mapshaper detects shared boundaries between features, and how to fix the common topology errors that creep into Shapefile and GeoJSON datasets.
---

# Topology and cleaning

Shapefile and GeoJSON are non-topological formats &mdash; they don't record the spatial relationships between adjacent polygons or intersecting polylines. Each polygon is just a list of coordinates; whether two polygons share an edge has to be detected.

Mapshaper detects topology on import by identifying coordinates that are exactly shared between features. This is what makes operations like simplification, dissolving and clipping work correctly: when two polygons share an edge, the shared path (or "arc") is stored once and edited once.

But coordinates that "should be" identical often aren't. Source datasets routinely contain misalignments (tiny gaps or overlaps between adjacent polygons) that defeat exact-match topology detection. The result is that what looks like a clean boundary turns into duplicated, slightly-offset arcs &mdash; and simplification, dissolving and clipping all start to misbehave.

## Cleaning

The [`-clean`](/docs/reference.html#-clean) command is the general-purpose repair tool for topology errors. It snaps near-duplicate vertices, removes small gaps and overlaps between adjacent polygons, and fixes self-intersecting lines:

```bash
mapshaper countries.shp -clean -o cleaned.shp
```

`-clean` accepts a `gap-fill-area=` option to control how aggressively gaps are filled, and a `sliver-control=` setting for handling sliver polygons. [`-dissolve`](/docs/reference.html#-dissolve) runs an equivalent repair by default, so explicitly running `-clean` is mainly useful when you want clean output without dissolving anything.

In the web app, `-clean` runs from the **Console** the same way as on the CLI  (the leading `-` is optional, e.g. just `clean gap-fill-area=100`).

## Snapping

For datasets where adjacent polygons have vertices that should be identical but are slightly offset — typically due to floating-point rounding in the source tool — you can ask Mapshaper to snap those vertices together at import time:

In the **command line**, pass the `snap` flag to `-i`:

```bash
mapshaper countries.shp snap -dissolve CONTINENT -o continents.shp
```

In the **web app**, tick "snap vertices" in the import dialog (open the import options with the **with advanced options** checkbox).

By default, snapping uses an automatic threshold of about 0.0025× the average segment length. To set an explicit snapping distance, use `snap-interval=`:

```bash
mapshaper countries.shp snap-interval=0.0001 -o cleaned.shp
```

Snapping is only effective when the misalignment is limited to nearly-identical coordinate pairs. Most real-world datasets with topology errors have more complex problems — gaps, overlaps, or self-intersections that snapping alone cannot fix. There is no easy way to know in advance whether snapping is sufficient without inspecting the result, so `-clean` is usually the better starting point.

## Dissolving with topology repair

[`-dissolve`](/docs/reference.html#-dissolve) repairs topology automatically. To skip the repair pass (faster, but only safe when you trust the input topology), pass `no-repair` &mdash; Mapshaper will then warn if it detects segment intersections in the input.

```bash
mapshaper counties.shp -dissolve STATE_FIPS -o states.shp
```

## Detecting line intersections

The web app can highlight self-intersections in your data: open the **Display** panel and tick "detect line intersections". Intersections often indicate either a topology error in the source data or self-intersections introduced by simplification &mdash; the **Repair** button at the top-left of the map attempts to fix the latter.

On the command line, [`-clean`](/docs/reference.html#-clean) and [`-dissolve`](/docs/reference.html#-dissolve) both detect and fix intersections.

## Notes on common sources of topology errors

A few patterns to watch out for:

- **`.shp` files exported from older GIS tools.** Some pipelines round coordinates inconsistently between adjacent features, producing systematic misalignments. Running `-clean` (or importing with `snap` if the misalignments are small and consistent) usually resolves these.
- **Older versions of ArcGIS's dissolve tool** have been observed to produce topology errors when dissolving a Shapefile that hasn't first been added to a Geodatabase. If you're starting from such output, run it through `mapshaper input.shp -clean -o cleaned.shp` to repair before further processing.
