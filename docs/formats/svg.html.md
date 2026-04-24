---
title: SVG
description: How Mapshaper exports vector data as SVG, including width, scale, bounding-box and per-feature data attributes.
---

# SVG

SVG is the W3C standard for vector graphics on the web. Mapshaper writes SVG and can also import its own SVG output files. Use SVG when you want to drop a non-interactive map straight into a web page or edit your map in Illustrator &mdash; it's a display format, not a data interchange format.

**File extension:** `.svg` &middot; **Read:** &check; &middot; **Write:** &check; &middot; **Multi-layer:** &check;

### CLI examples

```bash
mapshaper provinces.shp -o provinces.svg
mapshaper provinces.shp -o width=1200 svg-data=name,pop provinces.svg
mapshaper a.shp b.shp -o combined.svg
```

### Format-specific output options

- `width=` &mdash; output width in pixels (default 800). Geometry is fitted to this width.
- `height=` &mdash; output height in pixels. If both `width` and `height` are set, content is centred inside a `[0, 0, width, height]` viewport.
- `max-height=` &mdash; cap the output height in pixels.
- `pixels=` &mdash; total output area in pixels (alternative to `width=`).
- `margin=` &mdash; padding between content and viewport edge (default 1 px). Pass `<left,bottom,right,top>` for asymmetric margins.
- `svg-scale=` &mdash; scale in source units per pixel. Alternative to `width=` when you want a fixed scale rather than a fixed canvas size.
- `svg-bbox=` &mdash; explicit `xmin,ymin,xmax,ymax` for the SVG viewport. Useful for aligning multiple SVG layers exported separately.
- `fit-extent=` &mdash; use a layer (typically a single rectangle) to define the viewport.
- `svg-data=` &mdash; comma-separated list of attribute fields to emit as `data-*` attributes on each `<path>`. Field names must match `[a-z_][a-z0-9_-]*`.
- `id-field=` &mdash; promote one or more attribute fields to the SVG `id` attribute.
- `id-prefix=` &mdash; prefix all generated layer/feature ids.
- `point-symbol=square` &mdash; render points as squares instead of circles.

### Practical notes

- Each layer becomes a `<g>` group, with the layer name as the group id. Features become `<path>` (polygons/lines) or `<circle>` (points).
- No data attributes are emitted unless you pass `svg-data=`.
- The output is unstyled by default. Use [`-style`](/docs/reference.html.md#-style) to assign inline style attributes.
- Very large or detailed layers can produce SVGs that are slow to render in browsers. Consider using [`-simplify`](/docs/reference.html.md#-simplify) before exporting.

## External resources

- [W3C SVG 2 specification](https://www.w3.org/TR/SVG2/) &mdash; the formal spec.
- [MDN SVG tutorial](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial) &mdash; the friendliest practical introduction, with browser support notes.

## See also

- [Add SVG styling for export](/docs/examples/basics.html.md#add-svg-styling-for-export)
- [Quantile-classify into a color ramp](/docs/examples/basics.html.md#quantile-classify-into-a-color-ramp)
- [Simplify a polygon layer for the web](/docs/examples/basics.html.md#simplify-a-polygon-layer-for-the-web)
