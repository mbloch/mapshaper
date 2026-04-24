---
title: Globe
description: A simple locator map in the shape of a globe.
recipe: globe.txt
image: globe.svg
snapshot: globe.msx
download: globe.zip
---

# Globe locator map

Difficulty: moderate

<!-- mapshaper:image -->

### Steps

1. Load country polygons (source: Natural Earth)
2. Project countries using the Earth from space projection
3. Simplify country borders
4. Derive a line layer from the country polygons
5. Add a circle so we can show a background color
6. Add graticule lines
7. Add a dot and a label
8. Style all the layers
9. Export as SVG

### Code

<!-- mapshaper:code -->

### Notes

* The PROJ string `+proj=nsper +h=1e7 +lat_0=35 +lon_0=2.35` uses the near-side perspective projection (sometimes called "Earth from space") from a height of 10,000 km above the Earth. This gives a more zoomed-in appearance than the orthographic projection (`+proj=ortho`), which is also commonly used for globe maps.
* `-graticule polygon` creates a polygon that matches the boundary of the graticule, to give the map a background shape.
* `-filter true +` is the Mapshaper idiom for copying a layer (the filter expression is `true`, which means every feature is retained).

### Assets

<!-- mapshaper:assets -->
