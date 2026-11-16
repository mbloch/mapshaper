---
title: Canyon
description: Shaded relief example
image: canyon6.jpg
---

# Canyon relief

Difficulty: easy

![Finished image](/docs/examples/data/canyon6.jpg)

### Steps

1. Create a map frame with the desired extent, projection and output size, e.g. by drawing a rectangle over Mapshaper's built-in basemap and running `-proj merc` for the Mercator projection (generally appropriate for smaller areas), then clicking "+ New frame" in the web UI.
2. Load a DEM (`-fetch 3dep-1m`).

![Step 2](/docs/images/canyon1.jpg)

3. Load imagery (`-fetch naip`).

![Step 3](/docs/images/canyon2.jpg)

4. Remove shadows from the aerial image (requires a DEM) (`-deshadow dem=3dep-1m`).

![Step 4](/docs/images/canyon3.jpg)

5. Adjust the color of the imagery (the sliders in the web UI make this easy) (`-tone lightness=1.49 saturation=1.18 contrast=1.23 hue-shift=0.25`)

![Step 5](/docs/images/canyon4.jpg)

6. Create the hillshade (`-target 3dep-1m -hillshade ambient=0.7 texture=0.1`)

![Step 6](/docs/images/canyon5.jpg)

7. Blend the hillshade and the imagery, sharpen a bit (`-blend 3dep-1m strength=1.15,1 chroma=0.9,1 -sharpen 0.25`)

![Step 7](/docs/examples/data/canyon6.jpg)
