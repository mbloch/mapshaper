---
title: Styles and symbols
description: How to use -style and -classify to style base layers, data layers and labels for SVG export and web UI previews.
---

# Styles and symbols

Mapshaper can attach SVG styling properties to features with [`-style`](/docs/reference.html#-style), and it can assign colors or other values from data with [`-classify`](/docs/reference.html#-classify). The [`-symbols`](/docs/reference.html#-symbols) command creates arrows and other symbols. These commands are useful when you want to create a styled map that can be exported as an SVG file.

The examples below are written for the web app's Console. Load your data first, then run the commands. The same command sequences also work on the CLI when you add `mapshaper input-file` before them and `-o output.svg` after them.

> **Illustration placeholder:** Add a composite image showing a map with muted base layers, proportional point symbols, a classified choropleth layer and labels.

## The `-style` command

`-style` writes common SVG presentation attributes to each feature. Line layers can be styled with `stroke=`, `stroke-width=`, `stroke-opacity=`, `stroke-dasharray=` and `opacity=`. Polygon layers add `fill=` and `fill-opacity=` options.

Style values can be literal values, like `stroke="#777"`, or JavaScript expressions, like `r='sqrt(POP) / 100'`. Use `where=` to override the styles of a selected group of features.

```text
-style fill="#eee" stroke="#999" \
-style where='TYPE == "primary"' stroke="#555" stroke-width=1.5
```

### Making circles

To make circles from a point layer, add a `r=` (for radius) property along with fill and stroke styles. For scaled circles, use a JavaScript expression for `r=`. Use `Math.sqrt()` in your expression so the area of the circle is proportional to your data values.

```text
-style r='Math.sqrt(POP) / 250' \
  fill='rgba(227, 74, 51, 0.65)' \
  stroke='rgba(0, 0, 0, 0.15)'
```

## Styling data layers with the `-classify` command

### Classed and unclassed color gradients

`-classify` can assign colors or other values based on a data field. For numeric data, mapshaper can automatically classify a data field using `method=quantile|equal-interval|nice|hybrid`.

This example applies a six-class orange color ramp to a `RATE` field. By default, the colors are assigned to the `fill` field (the `save-as=` option changes this).

```text
-classify RATE method=quantile classes=6 color-scheme=Oranges
```

Quantiles put roughly the same number of features in each class. Equal intervals use evenly spaced numeric ranges.

```text
-classify RATE method=equal-interval classes=5 color-scheme=Blues
```

Mapshaper's `nice` method is similar to `equal-interval` but finds rounded class breaks that look better in a map legend.

The `hybrid` method uses equal-interval breaks in the interior of the class range paired with variable-size outer breaks to handle data outliers.

Use the `breaks=` option when you want to define the class breaks yourself.

```text
-classify RATE breaks=10,25,50,100 \
  colors="#f7fbff,#c6dbef,#6baed6,#2171b5,#08306b"
```

For continuous, unclassed color ramps, add `continuous`.

```text
-classify RATE continuous color-scheme=Viridis
```

### Styling categorical data

Categorical data uses named groups rather than numeric ranges: party, land use, road class, region, status and similar fields. Use `categories=` and `colors=` to map known values to colors.

Run `-colors` in the web console, or `mapshaper -colors` on the CLI, to see the names of Mapshaper's built-in categorical color schemes.

```text
-classify PARTY save-as=fill \
  categories=Democratic,Republican,Independent \
  colors="#2b8cbe,#de2d26,#756bb1" \
  other="#ddd"
```

The `other=` value is used for records whose category is missing from the list. This is useful when a field has miscellaneous or unexpected values to which you want to apply a fallback color instead of the missing-data color.

## Making arrows with the `-symbols` command

Use [`-symbols`](/docs/reference.html#-symbols) to turn a point layer into arrows or other symbol shapes. Arrow options accept expressions, so you can drive the length and direction of each arrow from data fields.

For a point layer with `SPEED` and `BEARING` fields, this example scales arrow length from `SPEED` and points each arrow using `BEARING`.

```text
-symbols type=arrow \
  length='max(8, min(60, SPEED * 2))' \
  direction=BEARING \
  fill="rgba(49, 130, 189, 0.65)" \
  stem-width=3 head-width=12 anchor=middle
```

`direction=` is measured in degrees off vertical: `0` points up and `-90` points left. If your data stores compass bearings clockwise from north, those values can usually be used directly as `direction=` values.

For a lighter vector-field style, use stick arrows. This draws arrow strokes instead of filled polygons.

```text
-symbols type=arrow arrow-style=stick \
  length='max(6, min(45, WIND_SPEED * 1.5))' \
  direction=WIND_DIR \
  stroke="#2b8cbe" stroke-width=1.2 \
  head-length=6 anchor=middle
```

## Making labels with `-style`

Labels are created from point layers by setting `label-text=`. The label text can be a field name or an expression. Label styling uses familiar CSS-like properties such as `font-size=`, `font-family=` and `font-weight=`. The SVG properties `text-anchor=`, `dx=` and `dy=` place the label relative to its anchor point.

Labels are centered horizontally by default (equivalent to setting `text-anchor=middle`). To center labels vertically, nudge them down a bit by setting a small `dy=` value. This is required because SVG aligns text vertically to the font baseline.

```text
-style label-text=NAME font-size=13 dy=4
```

Use `dx=` together with `text-anchor=start` or `text-anchor=end` to place labels to the left or right of their anchor points. Typically you would combine this with a dot over the anchor point. You can add the dots to the label layer by adding an `r=` property.

```text
-style label-text=NAME dx=6 dy=3 font-size=12 text-anchor=start r=2
```

You can combine `where=` with multiple `-style` commands to emphasize important labels.

```text
-style label-text=NAME font-size=12 fill="#555" dy=3 \
  -style where='POP > 1000000' font-size=15 dy=4 font-weight=bold
```

## Exporting styled maps

Style fields are most useful when exporting SVG:

```bash
mapshaper input.geojson \
  -classify RATE save-as=fill quantile classes=6 color-scheme=Oranges \
  -style stroke="#fff" stroke-width=0.4 \
  -o map.svg
```

In the web app, run the styling commands in the Console, then open **Export** and choose SVG.

## Tips

- Use transparency (`fill=rgba(...)` or `fill-opacity=...`) when dense symbols overlap.
- Prefer `Math.sqrt()` scaling for proportional circles.
- Use `-sort r descending` to place larger circles behind smaller circles.
- Use `where=` for exceptions and emphasis instead of splitting off highlighted shapes onto a separate layer.
- Run `-style clear` if earlier styling is confusing the current result.
- See [`-style`](/docs/reference.html#-style), [`-classify`](/docs/reference.html#-classify), [`-colors`](/docs/reference.html#-colors) and [JavaScript expressions](/docs/guides/expressions.html) for the full syntax.
