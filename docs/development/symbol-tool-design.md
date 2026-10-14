# Symbol Tool Design

A GUI tool for hand-placed symbols: icons (circle, square, triangle, star)
and curves (open curves with optional arrowheads, closed curves with an
optional fill). Data-driven symbol layers are a separate, later panel.

## Decisions

- **A tool of its own**, beside the label tool rather than inside it. It
  reuses the label tool's pure helpers (curve drawing state, knot hit tests,
  the path guide) and its look (the `label-cue-*` selection styles), but has
  its own mode, toolbar and panel.
- **Mode.** Interaction mode `symbols` ("edit symbols" in the mode menu),
  which enters the GUI mode `symbol_tool`. Offered on point layers, empty
  point layers, label layers and an empty session. The layer panel gets a
  "Draw: symbols" link.
- **Where a symbol goes** (`getSymbolTarget()`): into the active layer if it
  is a point layer with labels or SVG symbols in it, or an empty point
  layer; otherwise into a new layer named `symbols`, with `no-replace`. A
  hand-placed symbol never joins an ordinary data layer (a layer of cities,
  say), where it would be a feature with no attributes.
- **Everything is a command**, so undo, redo and session history come with
  it:
  - placing: `-symbols coordinates=x,y type=star radius=8 fill=...`
  - a curve: `-symbols coordinates=... type=curve stroke=... line-end=arrow`
  - moving an icon, a knot or a whole curve: `-update-symbol ids=N coordinates=...`
  - restyling selected icons: `-symbols ids=... type=star radius=... fill=...`,
    which makes them again, so the options describe the whole symbol
    (`getRestyleIconOptions()`); one command per distinct set of options
  - restyling selected curves: `-style ids=... stroke=... line-end=...`
  - deleting: `-filter '[...].indexOf(this.id) == -1'`
- **Toolbar**: Icon, Curve, then Done. Armed Icon places on a click; armed
  Curve places knots, finished by a double-click, Enter or Esc, closed by a
  click on the first knot. With nothing armed, clicks select.
- **Selection.** A click on a symbol selects it (shift-click adds), a click
  on empty map deselects. A selected icon shows a box; a selected curve
  shows its knots. Any symbol can be dragged to move it; a selected curve's
  knots can be dragged to reshape it. Delete removes the selection.
- **Panel.** Two sections, Icon (shape, fill and size, stroke color and
  width, rotation) and Curve (color and width; for open curves the line
  panel's arrowhead controls, i.e. head shape and size, ends and fade, with
  glyphs shared through `gui-arrowhead-shapes.mjs`; fill for closed curves). With a selection, the sections for the kinds selected are
  shown and edits restyle it. With nothing selected, the panel sets the
  style of the next symbol placed, and shows the section of the armed tool.
- **Shapes** are shared with label icons (`gui-icon-shapes.mjs`): circle,
  square, triangle, star and ring in both panels, and the NYT star in both
  for NYT users only (`isNytUser()`; `-symbols type=nyt-star` is accepted
  but not advertised). Each entry says
  how the shape is recognized in a record and what fields write it (a
  triangle is `icon=polygon icon-sides=3`). Arrows, pies, concentric rings
  and curves are in neither shape list: they need a direction, values or
  several points.
- **Fill and stroke.** Every shape has both, in both panels, stored as
  `icon-fill=`, `icon-stroke=` and `icon-stroke-width=` (a canvas circle as
  `fill=`, `stroke=` and `stroke-width=`). Each shape's `paint` in the
  catalog says which carries its color to start with: a ring is a stroke with
  no fill, the NYT star a red stroke of the logo's own weight around a white
  fill, and the rest are filled. Changing shape moves the color to where the
  new shape carries it (a circle's fill becomes a ring's stroke), and the NYT
  star brings its red and takes it away again unless the color was chosen by
  hand (`getIconPaintChange()`). The renderer's `getIconPaint()` falls back
  to `icon-color=`, the field these replace, which is a ring's stroke and
  other shapes' fill; the panels read the same way (`getShownIconPaint()`,
  kept in step with the renderer by a unit test) and write the new fields.
  A label icon with no color of its own takes its text color. When a symbol
  is placed, "none" is said only where a shape would otherwise have the
  paint: `fill=none` on a circle, `stroke=none` on a ring. When one is
  restyled, no stroke is always said: `-symbols` leaves a circle's
  `stroke=` on a point that becomes another shape, and the icon's stroke
  would fall back to it.
- **Size** is the stored `icon-size`, as in the label panel
  (a square's side, a star's or triangle's circumscribed diameter, a ring's
  outer diameter). A circle is drawn by `r`, so that it takes the fast canvas
  path in a layer of circles only, and its size is `2r`. `-symbols radius=`
  reaches a square's corners, so a square is placed with
  `radius = size / sqrt(2)` to four places, which `-symbols`' rounding of the
  side brings back to the size asked for. A ring is placed with
  `-symbols type=ring` and no `radii=`, which draws one ring of `radius=`;
  its stroke is inside its size, whatever its width.
- **Changing a selected icon's shape** makes it again as the new shape with
  `-symbols ids=`, which clears the old shape's symbol fields, keeping its
  size, and its color as described under Fill and stroke. What the panel has
  no control for is carried over: an icon's opacity and a star's number of
  points.
- **Hit testing.** Icons are hit on their painted area (the SVG hit test).
  A curve is hard to hit on a 1px stroke, so the GUI draws each curve with a
  transparent 10px stroke under it, which is never exported. In a layer of
  canvas circles only, there is no SVG to hit, and the point hit test is used.
- **Cues.** Hover and selection cues are drawn in the layer's SVG beside each
  symbol (`gui-symbol-selection.mjs`), in the label tool's `label-cue-*`
  styles: a box around an icon, a hairline along a curve, and rings on a
  selected curve's knots. A layer of canvas circles has no SVG, so its cues
  are drawn by the canvas overlay (`getOverlayLayers()`, `symbols` branch).
- **Numbered markers** -- a number or letter in a circle or square -- are
  made in the symbol tool, not the label tool: they are used as symbols, and
  the symbol panel is short enough to take a Text section, where the label
  panel is not. In the data a marker is one label record: `label-text`,
  `label-pos=c`, the text's font fields and `fill=` (the text color), with
  the symbol in `icon=circle|square`, `icon-size=`, `icon-fill=` and the
  rest. `featureIsMarker()` (`svg-feature-utils.mjs`) is the test, and
  `featureIsTextLabel()` is a label that is not one. The label tool leaves
  markers alone: they are not hit, selected or counted in its "all", and
  the symbol tool's Cmd-A selects them, which the hit test's per-mode owner
  filter (`gui-hit-test.mjs`) keeps apart.
  - **Commands** (`gui-marker-style.mjs`). A marker is placed with one
    `-labels coordinates= text= ... icon= icon-size= icon-fill=`. Its symbol
    is restyled with `-symbols ids=`, which keeps the text, and its text
    with `-labels ids=`; a mixed selection runs both, as one undo step.
    Text typed for a selected circle or square runs `-labels ids= text=`
    first, so that the `-symbols ids=` after it reads the record as a label
    and writes a circle as `icon=circle` + `icon-fill=` rather than as `r=`
    + `fill=` (`fill` being the text color on a label); a circle's `stroke=`
    comes off with `-style`, since it would outline the text. The × takes
    the text off with `-each 'd["label-text"] = undefined'` -- `-style` keeps
    an empty `label-text`, and a record with one is a label -- then clears
    the text fields with `-style` and makes the symbol again with
    `-symbols ids=`. A marker is moved with `-update-label`, since
    `-update-symbol` refuses labels.
  - **Panel.** Typing text turns it on, for the next symbol or the selected
    ones; with Count up on, each click places the next number or letter.
    While text is on, or a marker is selected, the shape buttons other than
    circle and square are disabled. Text given to a symbol at the default
    size grows it to 20px. The font controls are the label panel's
    (`gui-font-controls.mjs`). Selected circles and squares with no text are
    given it in the next marker's style.
  - **Centering.** A `c` label with an icon and no `dy` of its own is
    centered on its font's cap height (`getCapCentredOffset()` in
    `svg-properties.mjs`): measured with fontkit in Node and on a canvas in
    the GUI, or 0.35em without a measurement. Baseline sets `dy` to move it,
    stored in em so that it scales with the font size; it is shown in px,
    with the automatic value shown as a value until one is set.

## Known limitations

- In a layer of canvas circles only, the point hit test reaches within 8px of
  a circle's center, so a large circle is hard to grab near its edge. Adding
  any icon or curve to the layer makes it an SVG layer, where the whole
  circle is a hit target.
- A curve placed in unprojected data gets `-symbols`' warning about fitting
  curves to unprojected coordinates, as a path label does.
- A label made in the label tool with `label-pos=c` and a circle or square
  icon becomes a marker, and the symbol tool's to edit. The label tool moves
  centered text to `ne` when it is given an icon, so this takes a command.

## Later

- Data-driven symbol layers (radius by field, arrows by direction and
  length), in the point style panel.
- More icons (shields), dashes for curves.
- Moving several selected symbols together.
