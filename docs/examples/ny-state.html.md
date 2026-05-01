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

![N.Y. State](/docs/examples/data/ny-state.svg)

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

```bash
mapshaper \
  -i usa_can_admin1_lakes.geojson name=states \
  -filter 'name == "New York"' + name=NY \
  -proj lcc densify \
  -frame height=400 width=600 offset=4% name=rectangle \
  -target states \
  -clip rectangle \
  -each 'labelled = this.area > 1e10' \
  -points inner + name=labels \
  -filter labelled \
  -target states \
  -lines + name=borders \
  -i usa_can_roads.geojson name=roads \
  -proj match=NY \
  -clip rectangle \
  -divide NY \
  -style target=labels label-text=name dy=4 fill='#aaa' font-size=13px \
  -style target=labels fill='#666' font-size=20px where='name=="New York"' \
  -style target=roads stroke='name=="New York" ? "#aaa" : "#e2e2e2"' stroke-width=0.6 \
  -style target=states fill='name=="New York" ? "#ececec" : "#fafafa"' \
  -style target=borders stroke='#c5c5c5' stroke-width='TYPE=="inner" ? 1 : 0.7' \
  -style target=NY stroke='#555' stroke-width=1.2 \
  -style target=rectangle fill='#f1f1f1' \
  -target rectangle,states,roads,borders,NY,labels \
  -o ny-state.svg
```

### Notes

* `-proj lcc densify`: Lambert Conformal Conic requires additional parameters. When just `lcc` is given, Mapshaper calculates reasonable parameters using the bounding box of the targeted layer(s). The `densify` option adds additional vertices when the projection needs to create curved lines from long straight-line segments.
* `-each 'labelled = this.area > 1e10'`: This command creates a variable named `labelled` which is false if the area of a polygon in the states layer is less than 1e10 square meters (10,000 square kilometers).
* `-divide NY`: this command uses the NY polygon (the N.Y. State border) to divide roads at the polygon boundary and adds the NY layer's attribute data to the roads that fall inside the polygon.

### Assets

- <a href="https://mapshaper.org/?files=https%3A%2F%2Fmapshaper.org%2Fdocs%2Fexamples%2Fdata%2Fny-state.msx&q" data-open-snapshot="/docs/examples/data/ny-state.msx">Open in the web app</a> &mdash; loads a snapshot file containing the finished map
- [Download snapshot (`ny-state.msx`)](/docs/examples/data/ny-state.msx)
- [Download source data (`ny-state.zip`)](/docs/examples/data/ny-state.zip)
