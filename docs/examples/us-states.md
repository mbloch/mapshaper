---
title: U.S. States
description: Simple U.S. state map with random, non-adjacent colors
recipe: us-states.txt
image: us-states.svg
snapshot: us-states.msx
download: us-states.zip
---

# U.S. state map

Difficulty: easy

<!-- mapshaper:image -->

### Steps

1. Load state/province polygons (source: Natural Earth)
2. Keep only U.S. states
3. Project to the "Albers USA" projection
4. Assign random, non-adjacent colors
5. Export as SVG

### Code

<!-- mapshaper:code -->

### Notes

* To see the list of built-in color schemes to use with `-classify`, run `mapshaper -colors`. You can also use `colors=random`.
* The Albers USA projection (`-proj albersusa`) is a custom projection used by The New York Times for U.S. maps.

### Assets

<!-- mapshaper:assets -->
