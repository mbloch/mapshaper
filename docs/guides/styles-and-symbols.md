---
title: Styles and Symbols
description: How to use -style and -classify to style base layers, data layers and labels for SVG export and web UI previews.
---

# Styles and Symbols

Mapshaper can attach SVG styling properties to features with [`-style`](/docs/reference.html#-style), and it can assign colors or other values from data with [`-classify`](/docs/reference.html#-classify). These commands are useful when you want to preview a styled map in the web app or export a finished SVG.

The examples below are written for the web app's Console. Load your data first, then run the commands. The same command sequences also work on the CLI when you add `mapshaper input-file` before them and `-o output.svg` after them.

> **Illustration placeholder:** Add a composite image showing a map with muted base layers, proportional point symbols, a classified choropleth layer and labels.

## What `-style` does

`-style` writes common SVG presentation attributes to each feature. For polygons and lines, the most common properties are `fill=`, `stroke=`, `stroke-width=`, `stroke-dasharray=` and `opacity=`. For point layers, `r=` draws circular symbols. For labels, `label-text=` turns points into text labels.

```text
-style fill="#f5f1e8" stroke="#999" stroke-width=0.5
```

Style values can be literal values, like `stroke="#777"`, or JavaScript expressions, like `r='sqrt(POP) / 100'`. Use `where=` to apply a style to only some features.

```text
-style fill="#eee" stroke="#999" \
  -style where='TYPE == "primary"' stroke="#555" stroke-width=1.5
```

Use `-style clear` if you want to remove style properties and start over.

```text
-style clear
```

## Styling base layers

Base layers are geographic context: coastlines, national borders, state boundaries, roads, rivers or land polygons. Good base-layer styling usually stays quiet so the data layer remains the focus.

For a land or country polygon layer:

```text
-style fill="#f7f4ea" stroke="#c9c2b6" stroke-width=0.5
```

For national or state borders:

```text
-style fill=none stroke="#888" stroke-width=0.6
```

For roads, rivers or other linework, use stroke color and width. You can use `where=` to emphasize major features.

```text
-style stroke="#c8c8c8" stroke-width=0.4 \
  -style where='CLASS == "motorway"' stroke="#a88" stroke-width=1.2
```

Dashed strokes are useful for disputed boundaries, ferry routes or other secondary linework:

```text
-style stroke="#777" stroke-width=0.7 stroke-dasharray="4 2"
```

> **Illustration placeholder:** Add side-by-side examples of quiet land/border styling, styled roads and dashed boundary lines.

## Styling data layers

Data layers should carry the main visual message. `-style` can set simple, fixed styling, or it can use expressions that read from the attribute table.

For a polygon data layer with a fixed fill:

```text
-style fill="rgba(49, 130, 189, 0.45)" stroke="#fff" stroke-width=0.4
```

For a point layer with fixed circle symbols:

```text
-style r=4 fill="#2b8cbe" stroke="#fff" stroke-width=0.5
```

For scaled circles, use a JavaScript expression for `r=`. Square-root scaling is usually better than direct scaling because circle area, not radius, is what the eye reads.

```text
-style r='sqrt(POP) / 250' fill="rgba(227, 74, 51, 0.65)" stroke="#fff" stroke-width=0.5
```

If the radius expression can produce very small or very large values, clamp it with `min()` and `max()`.

```text
-style r='max(2, min(18, sqrt(POP) / 250))' fill="#e34a33" opacity=0.75
```

> **Illustration placeholder:** Add an example of proportional circles over a muted boundary layer, with one version showing unclamped symbols and another showing clamped symbols.

## Styling labels

Labels are created from point layers by setting `label-text=`. The label text can be a field name or an expression. Label styling uses familiar CSS-like properties such as `font-size=`, `font-family=`, `font-weight=`, `text-anchor=`, `dx=` and `dy=`.

For a city label layer:

```text
-style label-text=NAME font-size=11 font-family=Arial fill="#333"
```

Use `text-anchor=middle` to center labels horizontally on their point locations:

```text
-style label-text=NAME text-anchor=middle font-size=10 fill="#222"
```

Use `dx=` and `dy=` to offset labels away from point symbols.

```text
-style label-text=NAME dx=5 dy=3 font-size=10 fill="#333"
```

You can combine `where=` with multiple `-style` commands to emphasize important labels.

```text
-style label-text=NAME font-size=10 fill="#555" \
  -style where='POP > 1000000' font-size=14 font-weight=bold fill="#111"
```

> **Illustration placeholder:** Add a label placement example showing centered labels, offset labels and emphasized major-city labels.

## Classifying numeric data

`-classify` assigns colors or other values based on a data field. For numeric data, common methods include `quantile`, `equal-interval`, `nice` and `hybrid`.

This example assigns a six-class orange color ramp to a `RATE` field and saves the colors in the `fill` field, which SVG export and the web UI can use.

```text
-classify RATE save-as=fill quantile classes=6 color-scheme=Oranges \
  -style stroke="#fff" stroke-width=0.4
```

Quantiles put roughly the same number of features in each class. Equal intervals use evenly spaced numeric ranges.

```text
-classify RATE save-as=fill equal-interval classes=5 color-scheme=Blues
```

Use `breaks=` when you need fixed thresholds instead of automatic classes.

```text
-classify RATE save-as=fill breaks=10,25,50,100 colors="#f7fbff,#c6dbef,#6baed6,#2171b5,#08306b"
```

For continuous, unclassed color ramps, add `continuous`.

```text
-classify RATE save-as=fill continuous color-scheme=Viridis
```

> **Illustration placeholder:** Add a choropleth example comparing quantile, equal-interval and custom-break classification.

## Classifying categorical data

Categorical data uses named groups rather than numeric ranges: party, land use, road class, region, status and similar fields. Use `categories=` and `colors=` to map known values to colors.

```text
-classify PARTY save-as=fill \
  categories=Democratic,Republican,Independent \
  colors="#2b8cbe,#de2d26,#756bb1" \
  other="#ddd"
```

The `other=` value is used for records whose category is missing from the list. This is useful when a field has miscellaneous or unexpected values that should not silently receive one of the main colors.

For polygon layers where you want adjacent features to avoid sharing the same color, use `non-adjacent`.

```text
-classify save-as=fill non-adjacent colors="#8dd3c7,#ffffb3,#bebada,#fb8072,#80b1d3"
```

> **Illustration placeholder:** Add a categorical map example, plus a non-adjacent coloring example for neighboring polygons.

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

- Keep base layers muted; let the data layer carry the strongest color and contrast.
- Use transparency (`rgba(...)` or `opacity=`) when dense symbols overlap.
- Prefer square-root scaling for proportional circles.
- Use `where=` for exceptions and emphasis instead of making many duplicate layers.
- Run `-style clear` if earlier styling is confusing the current result.
- See [`-style`](/docs/reference.html#-style), [`-classify`](/docs/reference.html#-classify), [`-colors`](/docs/reference.html#-colors) and [JavaScript expressions](/docs/guides/expressions.html) for the full syntax.
