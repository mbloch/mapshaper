---
title: "Tutorial: combining two layers"
description: A step-by-step walkthrough of combining and pruning two boundary layers to produce a custom GeoJSON basemap.
---

# Tutorial: combining two layers in the web UI

> Originally contributed by Amanda Hickman to the project wiki.

This walkthrough shows how to combine and prune two boundary layers to produce a single GeoJSON file you can use as a custom basemap (for example, in [Datawrapper](https://www.datawrapper.de/)).

The example builds a basemap of the San Francisco Bay Area, with both county boundaries and the cities ("places") inside them.

The walkthrough uses the web app at [mapshaper.org](/), driving the workflow from the **Console**. The same commands work on the CLI &mdash; chain them together with leading `-` prefixes (so `clip bayarea_county` becomes `-clip bayarea_county`) and connect them with backslash line continuations.

## The starting data

We'll use two source files:

- A county boundary file from the California Open Data Portal &mdash; or, in this case, a [version clipped to the shoreline](https://geodata.lib.berkeley.edu/catalog/ark28722-s7hs4j) from UC Berkeley's Geo Data Commons. The shoreline-clipped version reads more naturally on a map than the legal-boundary version, which extends into the bay.
- A statewide [places boundary file](https://geodata.lib.berkeley.edu/catalog/ark28722-s7bp4z) for city boundaries.

The legal county boundaries from the Census TIGER files extend straight across the water &mdash; San Francisco even reaches out to include the Farallon Islands:

![Bay Area counties from the Census TIGER file, with boundaries cutting across the bay and extending offshore](/docs/images/tiger-counties.png)

The Berkeley library's version is clipped to the shoreline, so the bay shows as empty space between the counties:

![The same Bay Area counties, with each polygon clipped to the coastline so the bay is visible between them](/docs/images/cal-counties.png)

Download both as `.zip` files.

## Open them in Mapshaper

Drag the two `.zip` files onto [mapshaper.org](/), or run the web app locally with `mapshaper-gui`. You'll end up with two layers loaded into the session.

## Set the projection

Datawrapper expects WGS84 coordinates. Open the **Console** (top-right of the header) and run, with each layer selected:

```
proj wgs84
```

You'll need to run this once per layer &mdash; switch which layer is selected in the layer panel between runs.

→ See the [`-proj` reference](/docs/reference.html#-proj).

## Clip the places layer to the Bay Area

The places layer covers the whole state. We only want places inside the Bay Area counties. With the places layer selected:

```
clip bayarea_county
```

→ See the [`-clip` reference](/docs/reference.html#-clip).

Alternatively, if the places layer has a `COUNTY` attribute, a filter expression works too:

```
filter '["Marin", "Contra Costa", "Alameda",
         "San Francisco", "Santa Clara", "San Mateo"].includes(COUNTY)'
```

→ See the [`-filter` reference](/docs/reference.html#-filter).

## Merge the layers

The two layers can now be combined into a single layer with [`-merge-layers`](/docs/reference.html#-merge-layers):

```
merge-layers target=bayarea_county,california_place_clipped force
```

The `force` flag is needed because the two layers have different attribute schemas; without it, Mapshaper refuses to merge layers whose fields don't match.

## Export

Open the **Export** panel (top-right of the header), pick **GeoJSON** as the format, and save the merged layer. You can now upload that file to Datawrapper (or any other tool that accepts GeoJSON) as a custom basemap.

## What you've learned

- How to load multiple data files into one Mapshaper session.
- How to apply a projection inside the web UI's console.
- How to clip one layer by another.
- How to merge two layers into a single layer for export.

For more on layers and how Mapshaper organizes multi-layer datasets, see [The command-line tool](/docs/essentials/command-line.html#working-with-layers).
