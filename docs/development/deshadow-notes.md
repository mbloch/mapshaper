# -deshadow notes

## Follow-ups

### Place mosaic seams more precisely

The regions of a mosaic (see `fitRegionSuns()`) are labeled per fit tile, and
`getCellLighting()` blends the suns of neighboring tiles bilinearly between
tile centers. Pixels within about a tile of a seam (roughly 1/15 of the
scene's width) are lit by a mix of suns. In the detail3 frame of
`__terrain/canyonlands2.msx`, a USGS mosaic whose west side was imaged in the
afternoon (sun near 236°/37°) and the rest in the morning (near 130°/40°), the
parts of the image next to the seam keep sun errors of 10–20°.

Ideas:
- Refine the labels near a seam at the cell level, by which neighboring
  sun's cast shadows agree better with the image's shadows. The shadows
  found by their colors (as in `addSignatureShadows()`) mark the shadows on
  both sides of a seam well, and leave out dark ground such as water.
- Seams between source images are usually sharp, nearly straight lines, so a
  hard boundary between regions may work better than blending across a tile.

### Bright rims along the edges of large relit shadows

Once large shadows are relit (e.g. the west side of detail3 with its own sun),
thin bright orange lines are left along the edges of some of them, about where
the shadow met the sunlit cliff. They may come from the edges of the shadow
mask in relighting (`relightShadows()`, `writeRelitSamples()`,
`EDGE_BLUR_RADIUS`), or from the sunlit pixels at a shadow's edge being
brightened as if they were in shadow.
