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

![U.S. States](/docs/examples/data/us-states.svg)

### Steps

1. Load state/province polygons (source: Natural Earth)
2. Keep only U.S. states
3. Project to the "Albers USA" projection
4. Assign random, non-adjacent colors
5. Export as SVG

### Code

```bash
mapshaper \
-i ne_50m_admin_1_states_provinces_lakes.geojson name=states \
-filter 'admin == "United States of America"' \
-proj albersusa \
-classify non-adjacent colors=Tableau10 \
-innerlines + name=innerlines \
-style stroke=white stroke-width=0.5 \
-target states,innerlines \
-o us-states.svg height=400 width=600
```

### Notes

* To see the list of built-in color schemes to use with `-classify`, run `mapshaper -colors`. You can also use `colors=random`.
* The Albers USA projection (`-proj albersusa`) is a custom projection used by The New York Times for U.S. maps.
* Applying a stroke to interior lines using `-innerlines` (and not to exterior lines) creates a more accurate and crisper-looking coastline.

### Assets

- <a href="https://mapshaper.org/?files=https%3A%2F%2Fmapshaper.org%2Fdocs%2Fexamples%2Fdata%2Fus-states.msx&q" data-open-snapshot="/docs/examples/data/us-states.msx">Open in the web app</a> &mdash; loads a snapshot file containing the finished map
- [Download snapshot (`us-states.msx`)](/docs/examples/data/us-states.msx)
- [Download source data (`us-states.zip`)](/docs/examples/data/us-states.zip)
