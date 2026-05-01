---
title: N.Y. State
description: Map of New York and surrounding states, with labels
recipe: ny-state.txt
image: ny-state.svg
snapshot: ny-state.msx
download: ny-state.zip
---

# New York State map

Difficulty: moderate

<!-- mapshaper:image -->

### Steps

1. Load states/provinces (source: Natural Earth)
2. Make a layer containing just N.Y. State
3. Project to Lambert Confirmal Conic
4. Create a rectangular frame around N.Y.
5. Clip the states to the frame
6. Derive label points from the states/provinces
7. Extract lines from the states/provinces
8. Load roads (source: Natural Earth)
9. Project and clip
10. Divide the roads at the N.Y. border (for styling)
11. Style all the layers
12. Export as SVG

### Code

<!-- mapshaper:code -->

### Notes

* `-proj lcc densify`: Lambert Conformal Conic requires additional parameters. When just `lcc` is given, Mapshaper calculates reasonable parameters using the bounding box of the targeted layer(s). The `densify` option adds additional vertices when the projection needs to create curved lines from long straight-line segments.
* `-each 'labelled = this.area > 1e10'`: This command creates a variable named `labelled` which is false if the area of a polygon in the states layer is less than 1e10 square meters (10,000 square kilometers).
* `-divide NY`: this command uses the NY polygon (the N.Y. State border) to divide roads at the polygon boundary and adds the NY layer's attribute data to the roads that fall inside the polygon.

### Assets

<!-- mapshaper:assets -->
