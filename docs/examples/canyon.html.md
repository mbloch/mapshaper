---
title: Canyon
description: Shaded relief of a canyon in Canyonlands National Park, Utah
image: canyon6.jpg
---

# Canyon relief

Difficulty: easy

![Finished image](/docs/examples/data/canyon6.jpg)

### Steps

1. Draw a rectangle over the basemap, project it (`-proj merc`) and click **+ New frame**.

![A rectangle drawn over the basemap](/docs/images/canyon0.jpg)

2. Load a DEM: `-fetch 3dep-1m`

![Elevation data](/docs/images/canyon1.jpg)

3. Make a hillshade with the **hillshade** panel.

![Hillshade](/docs/images/canyon5.jpg)

4. Load imagery: `-fetch naip`

![Aerial imagery](/docs/images/canyon2.jpg)

5. Remove shadows from the imagery: `-deshadow dem=3dep-1m`

![Imagery with shadows removed](/docs/images/canyon3.jpg)

6. Adjust the colors of the imagery with the **adjust colors** panel.

![Imagery with adjusted colors](/docs/images/canyon4.jpg)

7. Blend the hillshade with the imagery using the **blend hillshade** panel.

![Imagery blended with the hillshade](/docs/examples/data/canyon6.jpg)

For details on each step, see the [Shaded relief](/docs/guides/shaded-relief.html.md) guide.
