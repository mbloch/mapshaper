---
title: Label tool design
description: Design notes for the GUI label tool, path-aligned labels, the curvature tool and frame-relative label scaling.
---

# Label Tool Design

This document describes a new GUI interaction mode for creating and editing map
labels, with two additions to Mapshaper's label capabilities:

1. **In-place text editing** — labels are edited on the map, in the rendered
   text itself, rather than through a popup or a side panel.
2. **Path-aligned labels** — a label can follow a straight or curved path, with
   the path created by clicking on the map and interpolated in the manner of
   Adobe Illustrator's Curvature tool.

It also specifies the CLI syntax that backs both features, since the GUI tool
drives the command pipeline rather than mutating data directly.

Two things are settled requirements rather than open choices, and much of the
design follows from them:

- **Label paths are geographic.** A curved label must stay aligned to the
  feature it describes — a ridge, a river, a coastline — under reprojection and
  at every zoom. Path coordinates therefore live in the map's coordinate space.
- **Labels are usually sized relative to a frame.** A frame is a rectangle with
  dimensions in both CRS space and display space, and label text and other
  pixel-sized symbols should normally scale with it, so that path and text
  scale together. This is not universal: there are cases where the path scales
  and the text does not, and those cases have to be handled explicitly. See
  [Frames And Scale](#frames-and-scale).

The editing approach was verified by a browser spike across all three rendering
engines; its results are in [Browser support](#browser-support) and they drove
several decisions below.

## Scope

In scope for the first release:

- A `label` interaction mode with in-place editing of label text
- Anchor-point labels (existing model) and path-aligned labels (new)
- Click-to-create straight and curved label paths, in map coordinates
- A floating toolbar with creation controls, and typography and alignment
  controls in the existing label style panel
- Multi-line text for anchor-point labels
- An `-add-label` command for both label kinds, plus new label style properties
- Frame-relative label scaling in the GUI, so text and path scale together
  on screen, with SVG export at native symbol scale
- Undo/redo and replayable session history for every edit

Deferred, but the data model must not preclude them:

- Straight-line callout lines from a label to its subject
- Multi-segment (elbowed) callout lines
- Curved callout lines with arrowheads
- Multi-line text on a path (see [Known limitations](#known-limitations))
- Automatic label placement and collision avoidance

Out of scope:

- Rich text within a single label (mixed fonts, per-run styling)
- Text wrapping to a measure, or flowing text into a shape

## Terminology

- **anchored label**: the existing label model — a point feature whose record
  has a `label-text` field, drawn as `<text>` offset from the point by `dx`/`dy`.
- **path-aligned label**: a label whose glyphs are laid along a path.
- **label path**: the baseline a path-aligned label follows, in CRS coordinates.
- **knot**: one point clicked by the user when drawing a label path. Knots are
  interpolated to produce the path; they are not Bézier control points.
- **control point**: a Bézier handle derived from the knots by curve fitting.
  The user never manipulates these directly.
- **fitted path**: the densified vertex sequence derived from the knots. It is
  computed when a label is rendered or exported, and is never stored.
- **frame**: a rectangle with a bbox in CRS coordinates and a size in display
  units, which fixes the mapping between the two. Created by `-frame`.
- **symbol scale**: the ratio between a frame's current on-screen size and its
  nominal display size. 1 when the frame is displayed at nominal size, and 1
  when no frame is defined.
- **editing session**: the period between the user activating a label for text
  editing and committing the result.

## Data Model

### What exists today

A label is not a geometry type or an object. A layer is treated as a label layer
when it is a point layer whose `DataTable` has a `label-text` field —
`layerHasLabels()` in `src/svg/mapshaper-svg.mjs`:

```js
export function layerHasLabels(lyr) {
  var hasLabels = lyr.geometry_type == 'point' && lyr.data &&
    lyr.data.fieldExists('label-text');
  return hasLabels;
}
```

All styling lives in per-feature table columns (`font-family`, `font-size`,
`fill`, `dx`, `dy`, `text-anchor`, `label-pos`, ...), declared in
`stylePropertyTypes` in `src/svg/svg-properties.mjs` and written by `-style`.
Nothing about a label is stored on the layer, apart from export-time inherited
defaults on the layer's `<g>` element. `label-pos` is the one property that is
not written through to the renderer as it stands: it is a compass point that
supplies the other three, resolved when the label is drawn (see "A position is
stored as a position").

This is a good foundation and the new work extends it rather than replacing it.

### Path-aligned labels: the knots are the geometry

**Every label is a point feature carrying `label-text`. A label with one point
is anchored; a label with several points is path-aligned, and those points are
its knots.** The knots are the feature's own multipoint geometry, in the
layer's CRS. Nothing else is stored: the curve is fitted from the knots
wherever it is needed.

So there is one kind of label layer, one geometry type, and no separate path
object anywhere in the data model.

This satisfies three requirements that pull against each other. Anchored and
path-aligned labels live in **one layer**, so the tool can create either from
the same gesture surface. Coordinates are in the **map's CRS**, so a curve
stays glued to the ridge or river it labels. And there is **no polyline layer**,
user-visible or hidden, so path creation never leaks into the layer menu or the
catalog.

#### Why multipoint geometry and not an attribute

The reason to prefer real geometry over a coordinate array in a table field is
that there is **no single chokepoint** for coordinate transforms that an
attribute could hook into. `transformPoints()` in
`src/dataset/mapshaper-dataset-utils.mjs` looks like one, and is used by
`fitDatasetToFrame()`, coordinate rounding and spherical clipping, but three
significant paths bypass it:

| Operation | How it transforms coordinates |
|---|---|
| `-proj` | `projectArcs2()` / `projectAndDensifyArcs()` / `projectPointLayer()` |
| `-affine`, `-rotate` | `arcs.transformPoints()` plus `forEachPoint()` directly |
| GUI dynamic CRS | `projectArcsForDisplay()` / `projectPointsForDisplay()` |

An attribute-stored array would need a hook in each of them, plus every future
one, and each omission would be a silent misalignment rather than a visible
error.

Multipoint geometry needs **none** of those hooks, because every one of these
paths already walks every point of every shape. `forEachPoint()` in
`src/points/mapshaper-point-utils.mjs` iterates `shp[j]` over the whole shape:

```js
export function forEachPoint(shapes, cb) {
  var i, n, j, m, shp;
  for (i=0, n=shapes.length; i<n; i++) {
    shp = shapes[i];
    for (j=0, m=shp ? shp.length : 0; j<m; j++) {
      cb(shp[j], i);
    }
  }
}
```

and `projectPointLayer()` in `src/commands/mapshaper-proj.mjs` does the same
through `editShapes()`. A five-knot label is transformed correctly by `-proj`,
`-affine`, frame fitting, rounding and quantization with no new code at all.

#### What this buys

- **`layerHasLabels()` needs no change.** A label layer is still a point layer
  with a `label-text` field, so the 14 call sites that assume that stay
  correct, and no new layer-level predicate is needed. Whether a *label* is
  path-aligned is a per-feature question — `shp.length > 1` — which is
  cheaper and more local than a layer-level one.
- **Knots cannot go stale.** With no baked path stored alongside them there is
  nothing to fall out of sync, so the fallback-to-polyline-editing path, the
  "re-fit knots from geometry" problem and the `-simplify` staleness limitation
  all disappear. `-simplify` does not touch point layers at all.
- **Curves survive reprojection intact.** Because the fit is derived from the
  knots and the knots reproject correctly, a curve re-fits in the new CRS
  automatically and stays editable afterward.

The cost is that the curve is fitted at render and export time rather than
stored. It is a pure function over three to six points, run once per label, so
this is cheap — and in the GUI it only needs recomputing when the zoom changes
([Rendering strategy](#rendering-strategy-draw-the-path-in-frame-space)).

### Where new labels go

Because both kinds of label are point features, the target rules collapse to
one question — is the target a point layer that labels can join?

| Target layer | Result |
|---|---|
| Point layer with labels (has `label-text`) | New labels added to it |
| Empty point layer | New labels added to it |
| Point layer of non-label points only | **New point layer created** |
| Polygon or polyline layer | **New point layer created** |
| No layer at all | **Empty point layer created on entering the mode** |

The gesture never enters into it. Clicking once to place an anchored label and
clicking several times to draw a curved one both add a feature to the same
layer, which is what makes path drawing a seamless part of label creation
rather than a separate mode with its own destination.

The "has labels" test is `layerHasLabels()`, i.e. the presence of a
`label-text` field. A point layer whose `label-text` values are all empty still
counts as a label layer, which is the desired behavior: it is an in-progress
label layer, not a basemap.

A newly created layer joins the **target's dataset**, so it inherits the CRS and
requires no reprojection to stay aligned with what it labels. It is created by
the same command that adds the first label, using the `name=` / `no-replace`
options that `-add-shape` already declares, so layer creation and the first
label are one command and one undo entry. Layer creation is an established
undoable catalog-level change (`noteCatalogWillChange` / `markCatalogChanged`;
see the "Add empty layer" case in `undo-redo-implementation.md`).

#### A session with nothing in it

The last row is the exception to all of that: **with no layer at all, the tool
makes one on entering the mode**, before the first click rather than with it.

Every gesture this tool has needs a target layer. A click has no coordinate
space to land in without one, and the pending label is drawn into the target
layer's own SVG container, so `beginLabel()` gives up when there is no target —
which is what the tool did when the "Import files" dialog was dismissed and
label mode chosen from the arrow menu. The toolbar appeared, the anchor tool
armed, the cursor became a crosshair, and clicking the map did nothing at all.

Creating it on entry rather than on the first click is what the point and line
tools already do (`addEmptyLayer()` in `gui-edit-points.mjs` and
`gui-draw-lines2.mjs`), and `menus.empty` in `gui-interaction-mode-control.mjs`
lists `label` alongside them, so the mode was always meant to be reachable
here. It does mean that opening the tool and changing your mind leaves an empty
layer and an undo entry, which is a cost the other two tools already pay.

The layer is **named** `labels`, unlike the unnamed ones those tools create. It
is the layer `getLabelTarget()` would have created for a label anyway, and
naming it is what lets the `-add-label` commands carry `target=labels` and so
replay from the session history.

Naming it exposed a bug in `-add-label`. `-merge-layers` drops empty layers
before merging, so adding the first label to an empty layer hands back the
one-label layer on its own — and the name was on the layer that was dropped, so
a layer called `labels` lost its name on its first label. `addLabel()` now
restores the target's name after merging, as `-inlay` does for the same reason.
It was reachable before this, since an empty point layer is a target the tool
adopts, but only a fresh session takes that path for every label it creates.

#### Committing the first label must not move the view

Placing that first label also used to reset the map view: the label was
centered and the map zoomed to its own extent, a box a few metres across, too
far in for a basemap to draw.

In a project with nothing else in it, the label layer's bounds are the whole
map's bounds, and a single point has none — `calcFullBounds()` in
`gui-map.mjs` pads a degenerate box by 1e-4 units, so the map's full extent
became about 20 m wide. Whether to reset the view is `mapNeedsReset()`'s
decision, and it was being asked to compare that against the full bounds the
view was already working from, which for a project with no content are the
placeholder box `getContentLayerBounds()` assigns — a continent. The area
between them differs by more than the 1e8 the area-change rule allows, so the
answer was always "reset", no matter where the user had navigated to.

`onUpdate()` now tracks whether the bounds it is comparing against are that
placeholder (`_boundsArePlaceholder`), and when they are, keeps the view unless
the new content is outside it. The other rules `mapNeedsReset()` applies
already come to the same answer in this situation; only the area rule did not.
A hand-placed feature is at a spot the user picked on screen, so the view they
picked it in is the one to keep.

The drawing tools never hit this because they mutate their layer and dispatch
`map-needs-refresh` rather than going through `model.updated()`, so nothing
asks the question. The label tool runs a command for every edit, which is what
gives it undo and session history, so it gets the full update path. The box
tool's `-rectangle` does too, but the rectangle it creates is as big as the box
the user dragged, so resetting to it looks like staying put.

One thing this does not fix: the map's full extent for a lone label layer is
still that 20 m box, so the home button zooms to almost nothing. That is the
1e-4 padding in `calcFullBounds()`, which any project whose only content is a
single point has always had.

### Rejected alternatives

- **The path as a polyline feature in its own layer.** The path would be real
  geometry in the shared arc collection, which transforms correctly and needs
  no fitting at render time. Rejected because it forces anchored and
  path-aligned labels into separate layers — they have different geometry
  types — which makes label creation depend on which layer is targeted, and
  puts a polyline layer in the catalog that the user did not ask for and should
  not edit directly. Hiding such a layer from the layer menu would not hide it
  from `-info`, `-target *` or export.
- **The path in an attribute, in CRS coordinates.** Keeps one layer, but needs
  the transform hooks enumerated above, with silent misalignment as the failure
  mode.
- **The path in an attribute, in anchor-relative screen units** (the
  `svg-symbol` precedent, where composite symbol geometry is stored in screen
  space in a table field): needs no transform hooks at all and makes the
  text-to-path fit invariant under zoom, which is genuinely attractive.
  Rejected because a screen-space path cannot stay aligned to a geographic
  feature — it is an annotation curve that happens to sit near a ridge, not a
  label that follows it.
- **Storing both knots and a baked path.** Removes the render-time fit at the
  cost of two representations of the same curve that commands can desynchronize
  (`-simplify`, `-smooth`, `-proj`). The fit is cheap enough that the
  redundancy is not worth its failure modes.

### Field additions

| Field | Type | Meaning |
|---|---|---|
| `label-start-offset` | measure | Position of text along the path |
| `label-side` | `left`\|`right` | Which side of the path the text sits on |
| `icon-opacity` | number | Opacity of the anchor symbol, 0–1, independent of the text's |
| `label-align` | `left`\|`center`\|`right` | How the lines of a multi-line label line up with each other |

`label-align` is there because `text-anchor` justifies the lines of a label
*and* places the block of them, and the panel's alignment control is asking
only the first question; see "Justification is not `text-anchor`". It is also
the second thing that needs a text measurement, which until now only the
path-fit check did.

**Two fields that were in this table are not any more.** `label-text-width` and
`label-text-hash` held a text measurement and a fingerprint of the values it
described. Both are gone: a measurement is the app's own working-out, not
something the user set, and it now lives in a cache keyed by that fingerprint
instead of in two columns of everybody's data. See "A measurement is not data".

`icon-opacity` is there because every existing opacity property applies to a
label's symbol *and* its text; see "The icon's opacity is its own property".

`label-pos` predates this work but changed meaning during it: it is now the only
position property stored, with the offsets it stands for resolved at render
time. See "A position is stored as a position".

**The knots themselves are geometry and so have no field, and nothing else about
the curve is stored either.** A label's curve is entirely a function of its
points: the same knots always fit the same curve, so there is no state to keep
in step with the geometry and nothing for a coordinate transform to invalidate.
See "No corners" for what this cost.

All new fields go in `stylePropertyTypes` so `isSupportedSvgStyleProperty()`
accepts them, *and* in the `-style` option declarations, since the parser
rejects any option a command has not declared. Note that `dominant-baseline` was
in the label render filter (`propertiesBySymbolType.label`) but in neither of
those places, so it could not be set from the CLI; fixed in the same pass.

Some of the new fields are the first style properties whose names contain two
hyphens, which exposed a bug in `-style`: it restored the property name from the
parser's underscore form with `replace('_', '-')`, a non-global replacement that
converted only the first underscore. The resulting name matched no known
property, so `label-start-offset=` was silently ignored rather than applied or
reported. Both occurrences now use `replace(/_/g, '-')`, matching what
`getSymbolDataAccessor()` already did.

### Multi-line labels

Already implemented for anchored labels and unchanged by this work.
`renderLabel()` splits `label-text` on a newline, a literal `\n`, or `<br>`, and
emits one `<tspan>` per subsequent line with `dy` from `line-height`
(`src/svg/svg-labels.mjs`). The GUI keeps tspan `x` in sync during drags via
`setMultilineAttribute()`.

The editing surface needs one addition: the hidden input becomes a `<textarea>`,
so that a line can be broken while typing. **Shift-Enter** breaks it; Enter
finishes the label (see "Enter finishes, shift-Enter breaks a line").

## Frames And Scale

### What exists today

The frame concept the tool depends on is already implemented, including display
units. `-frame` (`src/commands/mapshaper-frame.mjs`) creates a rectangle
feature with a CRS bbox as its geometry and a nominal display size in its
record:

```js
properties: {type: 'frame', width: widthPx, height: heightPx}
```

`parseSizeParam()` in `src/geom/mapshaper-units.mjs` accepts `px`, `pt`, `in`
and `cm` (72 pt per inch, 1 pt per pixel, 28.3465 px per cm), so
`-frame width=6in` is valid today. A frame therefore already is what it needs
to be: a rectangle with dimensions in both coordinate spaces.

In the GUI, `MapExtent.getSymbolScale()` (`src/gui/gui-map-extent.mjs`) reports
the live ratio between the frame's on-screen size and its nominal size, and
returns 1 when no frame is defined:

```js
this.getSymbolScale = function() {
  if (!_frame) return 1;
  var bounds = new Bounds(_frame.bbox);
  var bounds2 = bounds.clone().transform(this.getTransform());
  return bounds2.width() / _frame.width;
};
```

That scale is applied to every label and symbol as part of its group transform
(`getSvgSymbolTransform()`), so **in the GUI, label text already scales with
the frame**.

### The export asymmetry

Export does not do the same thing. `fitDatasetToFrame()` transforms the
dataset's *coordinates* into display space via `transformPoints()`, and leaves
attributes — including `font-size`, `dx` and `dy` — untouched. Measured, with a
frame of nominal width 800 exported at two sizes:

| `-o width=` | label anchor transform | `font-size` |
|---|---|---|
| 400 | `translate(1 398.4)` | 12 |
| 800 | `translate(1 797.8)` | 12 |

Geometry scales exactly 2×; text does not move at all. So on export the path
scales with output size while the text stays fixed, which is the case described
in the requirements — and it disagrees with the GUI, where both scale together.

For anchored labels this asymmetry is cosmetic: text is relatively too large or
too small. For path-aligned labels it is corrupting: once the text no longer
matches the path length the label breaks, and the three browser engines break
it in three different ways ([Fitting text to a path](#fitting-text-to-a-path)).

### Rendering strategy: draw the path in frame space

The resolution is to render a label path in **frame display space** — CRS
coordinates mapped once through the frame's bbox-to-size transform — and let
the existing group transform carry the zoom:

```xml
<g class="mapshaper-svg-symbol" data-id="N"
   transform="translate(px py) scale(symbolScale)">
  <text><textPath href="#lp-...">Sierra Nevada</textPath></text>
</g>
```

With a frame defined, this has three properties that fall out for free:

- **Text and path scale together**, because both are inside the same scaled
  group. This is the required default behavior, achieved with no new scaling
  code.
- **The text-to-path fit is invariant.** Whatever fit the user saw while
  authoring holds at every zoom and every output size, so fitting is settled
  once at authoring time rather than recomputed forever.
- **Pan and zoom stay O(1) per label.** Only the group's `transform` is
  rewritten, which is exactly what `repositionSymbols()` already does. The path
  `d` attribute is computed once and never recomputed.

With no frame defined, `symbolScale` is 1 and none of that holds: the map's
view transform changes with zoom but the group transform cannot absorb it, so
the path `d` must be rebuilt. Two mitigations, in order:

- Rebuild `d` only on **zoom change**, not on pan. A pan changes only the
  translation component of the view transform, which the group's `translate()`
  absorbs; the path's shape in pixels is unchanged. Since pan is the
  continuous gesture and zoom is discrete, this keeps the expensive case rare.
- Rebuild only for labels within the view bounds, reusing the existing
  in-view test in `repositionSymbols()`.

This is why the rendering guardrail about per-frame work is satisfied without a
frame as well as with one, but only the framed case gives a stable fit.

### Decided: native scale on export

**Symbols are drawn at their native scale in SVG exports.** `font-size=12`
emits `font-size="12"` regardless of the frame's nominal size or the requested
output size. This is the current behavior, so no export option is added and no
existing project's output changes.

Two consequences follow, and they shape the rest of the design:

- **The GUI at nominal zoom is the export.** When the frame is displayed at its
  nominal size the symbol scale is 1, so what the GUI shows is byte-for-byte
  what export produces. The frame's nominal display size is therefore the
  canonical authoring scale, and the size a label is designed at.
- **Exporting at another size rescales the path but not the text.** Path
  geometry is transformed into display space by `fitDatasetToFrame()` while
  `font-size` passes through, so a path label that fits exactly at nominal size
  overflows by 2× when exported at half size. For anchored labels this is
  cosmetic; for path labels it is the fitting problem below.

## CLI Syntax

Every mutation the tool performs is expressible as a command, and the GUI runs
those commands rather than duplicating their logic. This follows the guardrail
in `gui-improvement-roadmap.md` and gives one implementation for data mutation,
schema tracking, undo capture and session history.

### `-add-label`

One command creates both kinds of label, because both are point features and
they differ only in how many points they have:

```
-add-label coordinates=<x,y[,x,y,...]>  anchor, or knots, in the target's CRS
           text=<string>                label text
           [<style options>]            any -style label property
           [name=<layer>]
           [target=<layer>]
           [no-replace]
```

```
-add-label coordinates=-119.5,37.8 text='Reno' font-size=14
-add-label coordinates=-119.5,37.8,-118.9,38.1,-118.2,38.0 text='Sierra Nevada'
```

The first creates an anchored label, the second a curved one. There is no mode
flag and no second command: the number of coordinate pairs decides, exactly as
one map click versus several decides in the GUI. This is what makes path
drawing a seamless part of label creation rather than a parallel feature.

Coordinates are in map coordinates, which is what makes the command scriptable
independently of any display size, and what lets the GUI record exactly what
the user drew.

Most of this is sugar over existing behavior — `-add-shape` already accepts
`coordinates=` and `properties=` and merges into the target layer, and `-style`
already sets every label property — so it exists mainly so that one user action
is one history entry rather than two.

Projected input is expected but not required. On an unprojected (lon/lat)
layer the fit runs in degree space, which distorts the curve at high latitudes;
the command warns rather than failing, since a modest curve in a small area is
unaffected and refusing would be more annoying than useful.

#### No `-curve` command

An earlier draft had a separate `-curve` for creating the path. It is
unnecessary once knots are geometry: there is no path object to create, and a
densification interval is not a creation parameter because the fit happens at
render time. Fitting a smooth polyline through points is still a plausible
general-purpose command, but it is not part of this work.

Editing the knots of an existing label needs a second command, since
`-add-shape` and `-add-label` only create. That is `-update-label`, below.

### `-update-label`

**Implemented.** Moves a label that already exists — the command the GUI emits
when a knot or an anchor is released after a drag.

```
-update-label ids=<i>                    feature id of the label to move
              coordinates=<x,y[,x,y,...]>  the anchor, or the curve's knots
              [target=<layer>]
```

A label's knots are its geometry rather than an attribute, so neither existing
command can do this: `-add-label` appends a feature and `-style` writes
properties. Coordinates are accepted in the same forms `-add-label` takes, both
commands sharing `mapshaper-label-geom.mjs`.

One id, not the `ids=` list `-style` accepts, because one coordinate list
describes one label. A feature with no `label-text` is refused: moving an
arbitrary point through a command named `-update-label` would be a surprising
way to succeed, and from the GUI it would mean the hit test handed over the
wrong feature.

Two details are worth recording:

- **Nothing about the label's text is touched, and nothing needs to be.** A
  text measurement describes the text, and a move changes the length of the
  *path*; the fit check compares the two at render time against the curve as it
  then stands. So a move can turn a fitting label into an overflowing one with
  no measurement going out of date.
- **The edit is declared to the undo system.** `noteLayerWillChange()` before
  and `markLayerChanged()` after, because `lyr.shapes` keeps its identity across
  an in-place write and a transaction has no way to notice it otherwise. An
  undeclared edit is an edit that cannot be undone.

Nothing but the shapes is written, which is what keeps this command as small as
it is. It was not always: knots had corner flags, stored as indexes into the
point list, so replacing the list meant renumbering and pruning them and
declaring a second, separate edit to the data table. See "No corners".

Since the number of knots is free to change, this is also the command that will
carry adding and removing a knot when those gestures arrive.

### Text edits

Text edits reuse `-style`, with no new command:

```
-style label-text='Sierra Nevada' ids=4
```

### Commit granularity

The tool must not emit a command per click or per keystroke, since each command
is a session-history entry and an undo unit. The rule:

- **Drawing a path**: interactive feedback is drawn on an ephemeral overlay
  that never touches the data model. Finishing the path emits nothing: it hands
  the knots to the editor, which holds them until there is text to set along
  them. This follows `gui-box-tool.mjs` (preview, then command), not
  `gui-draw-lines2.mjs` (direct mutation of `lyr.shapes` and the arc
  collections, with hand-rolled undo events).
- **Editing text**: the SVG text node is updated live on every keystroke for
  WYSIWYG feedback, but the data model is untouched until the session ends. One
  command is emitted on commit — `-add-label` for a label that did not exist
  yet, carrying its geometry, style and text together; `-style label-text=` for
  one that did.
- **Toolbar changes**: one `-style` per control interaction, as the existing
  label style panel already does (`gui-label-tool.mjs`).
- **Dragging a knot**: the moved knot is previewed by editing a private copy of
  the label's display shape, and one `-update-label` is emitted on release. The
  preview is rolled back first, so the command is what changes the data — undo
  and session history are both keyed to commands, and a drag that had already
  written its own result would leave undo with a step that undoes nothing.

Repeated `-style` commands on the same feature group already collapse at print
time via `cullCommandHistory()` in `gui-session-history-cull.mjs`, so a session
of small typography tweaks prints as a compact script with no new work.

## Curve Fitting

### Algorithm

Illustrator's Curvature tool fits an interpolating spline through every clicked
point; the user never sees or manipulates handles. The fit here is **Hobby's
algorithm**, emitting cubic Bézier segments — John Hobby, "Smooth, Easy to
Compute Interpolating Splines", Stanford CS-TR-85-1047 (1985) / *Discrete &
Computational Geometry* 1 (1986), the spline Metafont, MetaPost and TikZ draw.

For knots `P₀..Pₙ`, Hobby solves for a departure angle `θᵢ` at each knot,
measured from the chord leaving it, such that **mock curvature** — a
first-order approximation of curvature, chosen because it keeps the system
linear — is equal on both sides of every interior knot. That is one tridiagonal
system, solved once. The angles then fix each segment's control points by way
of Hobby's velocity functions, which say how far along each tangent the control
point sits as a multiple of a third of the chord.

Three properties earn it its place over the centripetal Catmull-Rom fit this
originally used:

- **It looks curvature-continuous.** Catmull-Rom is only tangent-continuous, and
  its curvature jumped by 55%–220% of the curve's mean curvature at every knot,
  which reads as a slight kink at each clicked point. Mock-curvature continuity
  removes that.
- **It is a direct solve, not an iteration.** The fit is deterministic, so the
  GUI preview and the CLI export cannot drift apart — which matters because the
  two run in different engines and the export has to match what was on screen.
- **It is invariant under translation, rotation and scaling** (Hobby 1986),
  which is what lets the tool fit in display coordinates while storing knots in
  map coordinates. See the group-space note below.

Note that a curvature-continuous fit **bows further outside the knots** than
Catmull-Rom did when knots are placed awkwardly: on a hairpin whose knots span
one unit, the curve reaches about 2.9 units past them. This is the cost of the
smoothness rather than a defect — κ-curves, which is what Illustrator actually
uses, reaches about 1 unit past on the same knots. Hobby's tension parameter
would pull this in, at the price of flattening the roundness everywhere (a
circle sampled at 8 points is reproduced exactly at unit tension and flattens
by 4% at tension 1.5), so tension is fixed at 1.

#### Curl

Hobby's **curl** parameter sets how the curve behaves at the two ends of a run:
0 leaves it straight there, 1 (Metafont's default) makes it approach a circular
arc. Label paths are short, so the end segments are most of the curve, and
Metafont's default throws a wide loop past the last knot on a path that turns
hard near its end. The default here is **0.15**.

This is still being judged by eye. `mapshaper.setLabelCurveCurl(v)` in the
browser console sets it and redraws; it is expected to go away once a default
is settled on.

#### Why not κ-curves

Illustrator's Curvature tool is built on κ-curves (Yan, Schiller, Wilensky,
Carr & Schaefer, SIGGRAPH 2017), which places each knot at a local maximum of
curvature. Hobby tracks it within about 1% of the knots' bounding-box diagonal
on gently curved paths, and stays on the κ-curves side of Catmull-Rom on harder
ones.

κ-curves was not adopted because US 10388038 (Adobe, granted 2019, expires
2033) claims, in all three of its independent claims, an interactive editor in
which a point inserted between two others is set as and remains the segment's
maximum-curvature point. That is κ-curves' defining property, so there is no
variant of it that avoids the claims. Hobby's construction never refers to
curvature extrema and predates the patent's 2013 priority date by 28 years.
This is an engineering risk judgement, not legal advice.

Two knots produce a straight segment, so "straight path" is not a special case
in the data model or the renderer — it is a two-knot curve.

#### No corners

**Every knot is passed through smoothly, and there is no way to ask for a sharp
one.** A label path is a baseline for text, and the reason to bend one is to
follow a coastline, a river or a ridge; a kink in a baseline is not something
map lettering wants. The label tool offers a curvature tool and no pen tool for
the same reason.

Corners were supported for a while, and it is worth recording what supporting
them cost, because the mechanism was small at each site and awkward across all
of them. A corner ended one fitted run and began the next, which is the natural
way to express one in Hobby's system — it couples every knot in a run — so the
fitter itself was the least of it:

- A `corners` parameter on `fitCurveThroughKnots()`, `getCurveSegments()`,
  `getCurveLength()` and `getLabelPathData()`, and a `null` at every call site
  that did not use one.
- A `label-corners` property holding *indexes into the feature's own points*.
  That made it the one part of a label's appearance not derivable from its
  geometry, and the only one a geometry edit could invalidate: `-update-label`
  had to renumber and prune it whenever the knot list changed, and declare that
  change to the undo system separately from the shapes. `-proj` can drop points
  that fail to project, which would have shifted the indexes silently.
- A `parseKnotIndexList()` and an `indexlist` style-property type, used by
  nothing else.
- A second kind of knot handle, in two places — the drawing guide and the
  selection cue — because a corner on a gentle arc barely changes the curve, so
  the handle was the only confirmation that the double-click had worked.
- A double-click gesture that meant two different things depending on which
  knot was under the pointer.

None of that is load-bearing for a smooth curve, which is entirely a function
of its points. A file that still carries a `label-corners` property draws as
the smooth curve its knots describe: the property is no longer read, and no
longer recognized by `-style`, so it sits in the data as an ordinary attribute.

### Densification

The fitted Béziers are flattened into path geometry by subdividing until the
chord's deviation from the curve (the sagitta) falls below a tolerance, the
same strategy `projectAndDensifyArcs()` uses when reprojecting
(`src/crs/mapshaper-densify.mjs`). A fixed vertex count would over-sample
gentle curves and facet tight ones.

Because the path is stored in CRS units, the tolerance is a distance in CRS
units, not pixels, and must be chosen relative to the frame: a tolerance of a
quarter of a display pixel at the frame's nominal scale is imperceptible and
survives moderate zoom. Zooming far past the authoring scale will eventually
reveal faceting, mitigated by the true-curve export below, and by re-densifying
on demand, which costs nothing because the knots are the stored form and the
fit is always derived.

### Implementation shape

The fit is a pure function over arrays with no dependency on the GUI, the arc
collection, the DOM or any CRS:

```js
// knots: [[x,y],...]; tolerance: number
// returns [[x,y],...] in the same coordinate space as the knots
export function fitCurveThroughKnots(knots, tolerance)
```

This is the kind of small pure helper the GUI guardrails ask for, and it is
where the unit tests go: knot counts of 0/1/2, collinear knots, duplicate
knots, tight hairpins, and a check that the curve never cusps. The strongest of
them is a known-answer test — points sampled evenly on a circle must give the
circle back, which any error in the tridiagonal coefficients or the velocity
functions breaks.

### Higher-fidelity export

`svg-path-utils.mjs` already contains a path writer that emits cubic `C`
segments when a coordinate carries a third element `'C'`, and
`mapshaper-symbol-utils.mjs` contains an unused arc-to-Bézier control point
generator using the same convention. Neither is reachable from production code,
because the export pipeline uses a *second, duplicate*
`stringifyLineStringCoords` in `svg-geom-primitives.mjs` that emits `M`/`L`
only.

Consolidating the two — having `svg-geom-primitives.mjs` delegate to
`svg-path-utils.mjs` — would let exported SVG carry true curves instead of
densified polylines, which matters for print output and for editability after
import into Illustrator. Not required for the first release, and it should be a
separate change, since it affects every polyline and polygon Mapshaper exports.

## Rendering

### A new SVG layer type

Labels are already rendered as real SVG DOM in an overlay, not rasterized to
canvas: `SvgDisplayLayer.drawLayer()` emits one
`<g class="mapshaper-svg-symbol" data-id="N" transform="translate(px,py)">` per
feature (`src/gui/gui-svg-display.mjs`, `gui-svg-symbols.mjs`). This is what
makes in-place editing and glyph-level hit testing possible at all.

A path-aligned label cannot use that structure as-is, because a single
`translate()` cannot position glyphs along a path. **Implemented** as:

```xml
<g class="L1 mapshaper-svg-layer mapshaper-symbol-layer" data-label-path-scale="1">
<g id="labels" font-family="sans-serif" font-size="12" text-anchor="middle">
<defs>
<path id="L1-lp-0" d="M 0 0 C 16.67 -13.33 33.33 -40 50 -40 C 66.67 -40 83.33 -13.33 100 0" data-label-path="0"/>
</defs>
<text class="mapshaper-svg-symbol" transform="translate(0 200) scale(2)" data-id="0"><textPath startOffset="50%" xlink:href="#L1-lp-0">Sierra</textPath></text>
</g>
</g>
```

The element carrying the class and `data-id` is the `<text>` itself rather than
a wrapping `<g>`, which is what `renderPoint()` already produces for an
anchored label, so `repositionSymbols()` and the existing hit test need no
change. Path ids are namespaced with the layer's generated `svg_id` (`L1`
above), which avoids collisions between layers and between two GUI instances on
one page.

The `d` attribute is the path's geometry in the group's own coordinate space,
per [Rendering strategy](#rendering-strategy-draw-the-path-in-frame-space).
`internal.svg.getLabelPathCoords()` does that mapping and is a pure function of
the view transform, the symbol scale and the knots, so the invariants below are
unit-tested rather than asserted.

Three implementation notes:

- **One definition per feature, not per distinct path.** Export deduplicates
  identical paths to save bytes; the GUI cannot, because a definition has to be
  findable when one label's geometry changes.
- **The definition is identified by `data-label-path`, never `data-id`.**
  `gui-label-tool.mjs` looks a symbol up with `querySelector('[data-id="N"]')`
  and no tag filter, and `<defs>` comes first inside the layer, so a `<defs>`
  path carrying `data-id` would shadow the `<text>` it belongs to. There is a
  regression test for this.
- **A state class is added to the symbol class, not substituted for it.**
  `repositionSymbols()` finds elements by `.mapshaper-svg-symbol`, so a label
  marked as overflowing has to keep both.

The `<defs>` machinery already exists for hatch fills, fill effects and embedded
SVG images (`src/svg/svg-definitions.mjs`), but the GUI builds its own `<defs>`
rather than reusing `convertPropertiesToDefinitions()`: the id policies differ
(content hashes for byte-stable files, per-layer namespacing for the GUI), and
that function can reach for `fs` when it encounters an SVG image href. Both
sides share the `LABEL_PATH_PROPERTY` contract so the handoff is named in one
place.

#### Keeping the baseline correct as the map moves

Navigating the map repositions SVG layers instead of redrawing them
(`needSvgRedraw` is false for `nav` and `hover` in `drawMainLayers()`), so
baselines are maintained in the reposition path by `updateLabelPaths()`. It
compares the CRS-to-group scale against the value recorded on the layer
container when it was drawn, and returns immediately when they agree. That one
test covers every case without special-casing frames:

| | Framed | Unframed |
|---|---|---|
| Pan | no rebuild | no rebuild |
| Zoom | no rebuild | rebuild |

Pan never rebuilds because the coordinates are relative to the label's first
knot, so the translation cancels. A framed zoom never rebuilds because it
multiplies the view scale and the symbol scale by the same factor.

Fitting the curve in group space rather than in CRS space is safe because the
view transform is a similarity — a uniform scale plus a y flip — and Hobby's
curves are invariant under translation, rotation and scaling, which the 1986
paper states as a property of the construction. A test asserts it instead of
taking it on trust.

#### In-view testing uses the whole curve

`repositionSymbols()` hides symbols outside the view, testing the shape's first
point. For a path label that is the anchor knot, and testing it alone would hide
a label whose curve is still mostly on screen — or all of one that spans the
viewport with its knots outside on both sides. Path labels are therefore tested
by bounding-box overlap, computed without allocating a `Bounds`. Ordinary
multipoint symbols keep the single-point test, since the GUI draws them at the
first point only.

### Path Visibility And Editing Affordances

A label path is a baseline, not a stroked line: normally only the text should be
visible, with the path shown as an affordance while a label is being edited.
Both halves of this are existing behavior rather than new rendering code.

**Paths are invisible by default, for free.** The main render pass dispatches
either/or on whether a layer has labels (`drawMainLayers()` in
`gui-layer-renderer.mjs`):

```js
var isSvgLayer = internal.layerHasSvgSymbols(lyr) || internal.layerHasLabels(lyr);
if (isSvgLayer && !needSvgRedraw) {
  _svg.reposition(lyr, 'symbol');
} else if (isSvgLayer) {
  _svg.drawLayer(lyr, 'symbol');
} else {
  drawCanvasLayer(lyr, _mainCanv, action);
}
```

A label layer goes to the SVG renderer and `drawCanvasLayer()` is never called
for it, so once a polyline layer carries `label-text` its geometry stops being
drawn on canvas. No `stroke=none` attribute and no styling special case are
needed to hide the path.

**The affordance goes through the existing overlay mechanism, but the guide has
to be synthesized.** `getOverlayLayers()` in `gui-overlay-styler.mjs` already
switches on `interactionMode`, and its layers are display-only: rebuilt on every
refresh, never added to the catalog, never in the layer menu. That is precisely
the "temporary polyline layer" the tool needs, without a layer.

What does *not* carry over is the way `vertices`, `edit_lines` and `snip_lines`
draw their guides. Those modes style a filtered copy of the active layer with
`vertices: true`, which makes the canvas renderer trace each shape's path and
dot its vertices:

```js
function getOverlayLayer(activeLyr, ids) {
  var displayLayer = filterLayerByIds(activeLyr.gui.displayLayer, ids);
  var gui = Object.assign({}, activeLyr.gui, {style: null, displayLayer});
  return Object.assign({}, activeLyr, {gui});
}
```

The filtered copy keeps the layer's geometry type, and a label layer is a
**point** layer — its knots are a multipoint, not a path. There is no path in
the data to trace, so `vertices: true` would draw nothing. A path label's guide
is therefore built from scratch in `gui-label-path-guide.mjs`, as two
display-only layers wrapped in the active layer's `gui` context:

| Layer | Geometry | Drawn as |
|---|---|---|
| `label-path-guide` | polyline over a synthesized `ArcCollection` | the fitted curve, flattened |
| `label-path-knots` | point, one single-point shape per knot | a handle on each knot |

One knot per shape rather than one multipoint per curve, so that a handle can be
addressed on its own. Every handle is drawn the same now that there are no
corners, so nothing needs a canvas styler — which runs per shape, and was how a
corner handle was drawn differently from a smooth one.

The handles' style must say `type: 'styled'`, which is the renderer's switch
between its two ways of drawing a point layer: `drawStyledLayerToCanvas()` reads
`radius`, `fillColor` and `strokeColor` on that path only, and sends anything
else — including a style carrying a `dotSize` — to `drawSquareDots()`, which
draws a square of `dotSize` pixels and defaults to one. The handles shipped
without the flag at first, and so were a single white pixel each: invisible
against the guide line running underneath them.

Three properties of the wrapper matter. The coordinates come from the *display*
layer, so they are in the display CRS already and `gui.geographic` must be
`false` or `getArcsForRendering()` would project them a second time. `arcCounts`
and `bounds` are cached descriptions of the label layer and must be cleared.
And the flattening tolerance is a fraction of the curve's own size rather than a
pixel count, which keeps the guide equally smooth in degrees or metres and, by
not depending on the view, lets these layers be cached across pan and zoom like
every other overlay.

The guide covers the curve being **placed** and nothing else. Once a curve is a
label, its path and knots come from the selection cue instead — see "What a held
label looks like" — so the guide layers are the only ones the tool draws while
the pointer is still deciding where the knots go, and the overlay is empty as
soon as the curve is finished.

**Z-order works out without intervention.** `LayerRenderer` appends its
surfaces in a fixed order — main canvas, overlay canvas, symbol SVG, furniture
SVG — as absolutely positioned siblings with no `z-index`, so they stack in DOM
order. A guide drawn on the overlay canvas therefore sits *beneath* the SVG
glyphs, which is the right relationship for a guide. The caret and the
selection band stay in the SVG layer, where they can align to glyph geometry.

### Selection: many for style, one for text

Text editing binds to a **single** label; style changes apply to **many**. This
is not a restriction added by the tool but a distinction the hit control
already maintains, and which `getOverlayLayers()` already renders differently:

| Hit state | Meaning | Label tool use |
|---|---|---|
| `hitData.ids` | the selection set | style edits, one `-style ... ids=1,2,3` |
| `hitData.id` | the single hover/pinned feature | the label being text-edited |

It also falls out of the editor design rather than constraining it: the
offscreen textarea holds one string, so one label at a time is the natural unit.

The two states are kept **disjoint**, not layered: a label being typed into is
not in the styling selection, and is put back into it when the session ends.
A label in both at once makes the panel's target ambiguous — which of the
selected labels is the caret in, and does a font change go to one or to all?

Disjoint is not the same as unrelated. A label open for text editing is the
panel's target on its own, ahead of the selection, because styling a label
while typing into it is the common case rather than a corner (see "What the
controls act on"). The selection stays empty throughout, so there is still only
one answer to what a control acts on.

#### Two stages of click

The tool started out going straight from a click to a caret, which is right for
placing labels and wrong for everything else a label tool has to do. Styling
one label out of many, and dragging a path's knots, both need a label to be
*held* without its text being open.

So a click selects, and a click on what is already selected reaches into it:

| Gesture | Selection was | Result |
|---|---|---|
| click a label | anything | selection becomes that label |
| click the label that is the whole selection | `[id]` | its text opens, selection empties |
| shift-click a label | anything | label goes in or out of the selection |
| double-click a label | anything | its text opens |
| click empty map | anything | selection empties; armed tool acts |
| click away from an open session | — | session ends, nothing else; the label goes if it has no glyphs |

Two rules keep this unambiguous:

- **A plain click always narrows to what it hit.** It cannot also mean
  "deselect", because a click on the one selected label has to be free to mean
  "edit this text". Removing one label from a selection is shift-click's job.
  This is why `selectStyleFeature()` in `gui-hit-control.mjs` has a branch for
  label mode; the older style modes keep the rule where a plain click on a
  selected feature deselects it.
- **An additive click never opens text.** A shift-click on the sole selected
  label is removing it, and would otherwise open a session on its way out.

Placing a new label still goes straight to a caret, skipping the selected
state: the point of placing one is to type into it.

Whether a click landed on what was already the whole selection is a fact about
the gesture, and only the hit control knows it — it replaces the selection
before the tool's click handler runs. It is reported as
`clicked_only_selection` on the click event by `describeClickedSelection()`,
rather than stored, because it describes one gesture and would be wrong by the
next one.

#### Leaving a session goes back where it came from

Escape and a click away both **finish** a label — neither has ever discarded
text — and then return it to the state the session was entered from:

- A label reached by clicking goes back to being selected for styling. Escape
  is then a step back through the stages rather than a jump out of them, and
  the label stays in hand to restyle what was just typed.
- A label the tool just created came from nothing and returns to nothing, which
  leaves the panel describing the next label rather than the one just written.

`editor.open()` takes an `onClose` hook for this, because a session can end
from inside the editor — Escape, Enter, blur — and the tool cannot do it at its
own call sites. The hook declines to reclaim a selection
that has since been claimed by something else: clicking label B while editing
label A ends A's session, and B is what should be left selected.

Escape runs one rung per press, innermost first: the curve being drawn, then
the selection, then the armed tool. The hit control's own Escape handler stands
down while a GUI mode is on, so this ladder is the whole of it.

On the first rung Escape **finishes** the path at the last knot placed, rather
than discarding it — the same thing Enter does, and consistent with what
Escape means on the rungs above it, where it has never thrown text away. This
is what gives the curvature tool a keyboard way to finish; double-clicking was
otherwise the only one. A path of a single knot is not a path, so that one is
discarded. Backspace is the way back out of anything longer, one knot per
press, and removing the last knot abandons the curve.

#### What a held label looks like

The older `label_style` mode marks selected labels with a halo on the glyphs
(`text.label-style-selected`, yellow; `text.active-label`, pink, for the old
`labels` mode's hover). A halo reads as "this text is highlighted", which is
enough for a mode whose only job is styling. The label tool needs it to read as
"this is an object you have hold of", now that holding a label is a state of its
own — so it draws an outline around the object instead, and the halo is
suppressed while the tool is on.

**Hover draws the same shape as selection, only lighter** (`.label-cue-hovered`,
40% opacity). Hovering previously highlighted the *anchor point* — that is what
the canvas overlay does for any point layer — while selecting outlined the
*label*, so the two states looked like they were about different objects. The
one thing hover has to say is "this is what a click will take hold of", which
means showing the same outline the click will produce.

That means the canvas overlay draws nothing at all in label mode, and
`getOverlayLayers()` returns early with only the path guides. The other thing
this fixes is a layer with no labels on it: the tool is often pointed at a
polyline or polygon layer it will only use as a backdrop, and those shapes were
offering a hover effect for something no click could ever select.

`gui-label-selection.mjs` draws one of two shapes, because a label is one of two
things:

- An **anchored** label is a block of text: a box around it, plus a ring on the
  anchor point when no icon is drawn there. The anchor is worth marking on its
  own because it is what the text is positioned against, and `label-pos` can
  put it well outside the box. It is a ring rather than a dot, drawn beneath the
  glyphs, because a centered label sits right on top of its anchor and a filled
  marker would blot out a letter. Same treatment as the path guide's knots,
  since both are handles.
- A **path** label is a line of text on a curve: its own curve, stroked. A box
  around a curve is mostly empty air and says very little about what is
  selected. The curve already exists as a path in the layer's `<defs>` — it is
  what the text is laid along — so the cue is a `<use>` of it, exact by
  construction rather than by recomputation. This is the same trick the editor's
  invisible hit region uses.

**Colour carries the state, not weight.** Every reference shape the tool draws
— the selection box and curve, their hovered versions, and the editor's box and
ghosted path — is a hairline. What distinguishes them is colour and opacity:
blue for held, blue at 0.4 opacity for pointed at, violet for being typed into.
Heavier outlines were tried and read as objects in their own right rather than
as marks on one, which is the opposite of what a reference shape is for.

The editor's box is solid rather than dashed for the same reason. At the size of
an empty label — the state it mostly appears in, between placing a label and
typing into it — the dashes were most of the outline, and the box looked
tentative rather than like a place to type.

A **selected** curve also gets a round handle on each knot, matching the drawing
handles. They are placed by the mapping the renderer used to build the curve
(`getLabelPathCoords()`), not by reading positions back out of the path, so they
sit exactly on the curve beside them. A hovered curve gets none: it is being
pointed at rather than held, and offering handles that cannot be grabbed would
misdescribe what a drag would do.

**The cue owns the knots of a label; the guide owns the knots of a curve being
placed.** Both used to be drawn for a selected curve, and the two sets were
almost but not quite the same size, so every handle wore a violet fringe from
the guide's ring showing around the cue's. The cue is the one to keep: its knots
are the ones a drag can grab, and it is in the selection's colour rather than
the tool's. `getOverlayLayers()` therefore passes the pending path to
`getLabelPathGuideLayers()` and nothing else, and a curve that is already a
label is drawn entirely by the cue.

#### Dragging a handle

**Implemented for moving.** A knot handle reshapes a curve and an anchor ring
moves an anchored label, both through `-update-label`. Four things make this fit
alongside panning and the click gestures:

- **Only a selected label's knots are grabbable.** `findNearestKnot()`
  (`gui-label-knots.mjs`) searches the selection and nothing else. This is the
  second lookup every mode needing sub-feature precision does for itself, since
  the hit test reports a feature id and never a part index — there is a standing
  `// TODO: add info on what part of a shape gets hit?` in `pointTest`.
  `findDraggableVertices()` is the line tools' version.
- **A drag cannot wait for a hit.** A curve's knots are deliberately not hit
  targets — hovering a path label triggers on its glyphs — so the pointer on a
  knot out along the curve is over nothing at all, and a drag gated on a hit
  could never start there. `eventIsEnabled()` therefore lets label drags through
  without one.
- **The handle is found on hover, not at `dragstart`.** `dragstart` arrives with
  the pointer already moved off the handle, by the mousemove that made the
  gesture a drag. Testing the pointer there missed handles that had been grabbed
  squarely — an anchor marker was unreachable outright, since its 8px radius is
  smaller than one step of a quick drag. `gui-draw-lines2.mjs` tracks its
  vertices on hover for the same reason. The grab offset is measured from the
  hover position too, so the knot tracks the pointer instead of trailing the
  first move's distance behind it for the rest of the drag.
- **The tool stops the event, not the hit control.** A drag anywhere other than
  a handle has to stay available for panning, and only the tool knows where the
  handles are, so `possiblyStopPropagation()` leaves label drags alone and the
  handlers consume the event once they have taken one. The line tools are
  arranged the same way.
- **The drag works on a copy of the shape.** The display layer and the data
  layer can share their knot arrays, so moving a point in place would edit the
  data behind the command's back. The original array is kept by reference and
  put back before the command runs.

A knot dropped onto its neighbour would collapse a curve segment to nothing,
leaving the fitter no direction to work from, so `knotMoveIsValid()` refuses the
move rather than letting it make the label vanish.

A handle under the pointer also takes the cursor (`.map-layers.label-handle`,
`cursor: move`) ahead of the placement crosshair, since a drag there moves the
handle rather than placing anything.

The cues are drawn in each label's own coordinate space and wear its transform,
so they move and hide with it. That also means the cost is one `getBBox()` per
selected label per **SVG redraw**, not per frame — navigation repositions the
symbol layer instead of rebuilding it. A select-all on a large layer would still
pay it, for outlines too small to tell apart, so past `MAX_OUTLINES` the cue is
dropped rather than drawn. Hover fires on every pointer move and mostly changes
nothing here, so `refresh()` compares what it is about to draw against what is
already drawn and returns; a map render passes `force` to get past that, since
the markup the cues were in has been replaced.

### What a label is pointed at by

A label is reached two ways, and for path labels both of them were wrong in the
same direction: the knots were hit targets and the text was not.

`getPointerHitTest()` (`gui-hit-test.mjs`) runs two tests and lets the second
win. `getShapeHitTest()` is geometric — for a point layer, proximity to a point
within 25 px. `getSvgHitTest()` is the browser's own hit testing: it takes the
element under the pointer and walks up looking for the `data-id` that identifies
a feature. Anchored labels have always been hoverable both by their anchor and by
their glyphs, the second because the pointer lands on the `<text>` node itself.

Two changes make path labels behave the way anchored ones already did:

- **`<textPath>` is now a tag the walk passes through.** The pointer over a
  curved label's glyphs lands on the `<textPath>`, and `nodeHasSymbolTagType()`
  did not list it, so the walk stopped one step short of the `<text>` carrying
  the id and reported no hit at all. Adding the tag is the whole fix.
- **A path label's knots are no longer hit targets.** They are construction
  points that sit off the glyphs — often nowhere near them — so proximity to a
  knot registers a hit on what looks like empty map, while the text itself did
  nothing. `getPathLabelKnotTest()` in `gui-shape-hit.mjs` excludes them.

The exception is a path label with **no text**: it draws nothing to hover, so
its knots stay live, otherwise there would be no way to reach it at all. The
label tool cannot leave one behind — a label with no glyphs is removed when its
session ends — but the CLI can.

The knot test returns `null` for any layer without a `label-text` field, so an
ordinary point layer pays one null check per point in the hit loop and nothing
else.

The `<textPath>` tag also gives back the way into a finished path label: a click
on its glyphs reopens an editing session with the caret at the character
clicked. Before, the only click that reached the label was one near a knot,
which says nothing about where the caret belongs.

### Alignment properties

The existing property vocabulary maps onto `<textPath>` better than expected:

| Intent | Anchored | Path-aligned |
|---|---|---|
| Along-path alignment | `text-anchor` | `text-anchor` + `label-start-offset` |
| Justification of lines | `label-align` | `text-anchor` |
| Cross-axis offset | `dy` | `dy` (baseline shift from the path) |
| Which side | n/a | `label-side` |

So the alignment half of the toolbar is mostly existing properties. The one
addition is `label-align`, which exists because `text-anchor` answers the
justification question and the block-placement question with the same value —
see "Justification is not `text-anchor`".

`label-side` maps to the SVG 2 `side` attribute, and that mapping is why the
GUI does not use it. Support is Firefox-only — Firefox 61 and up, not Chrome,
not Safari, 3.24% of global usage — so a label flipped in the panel would look
unchanged in the browser most of this runs in, and the flip would appear only in
an export opened in Firefox. The attribute is defined as "effectively reverses
the path direction", so **reversing the knot order is the same operation** and
works in every renderer. That is what the tool does; see "Sliding and flipping
are drags, not controls". The property stays supported for the CLI and for
imported data, and the renderer still honours it.

### A position is stored as a position

**`label-pos` is the only one of the four position properties stored. The
`dx`, `dy` and `text-anchor` it stands for are resolved when the label is
drawn.**

The nine positions are a lookup table (`labelPositionStyles` in
`svg-properties.mjs`) mapping a compass point to an offset and a justification.
That table was originally applied at write time: `-style label-pos=sw` and
`-add-label label-pos=sw` both expanded the shorthand and stored all four
properties. Nothing ever read the table again, which made it a code generator
rather than a lookup, and it cost three things.

It put four columns in the user's table where one was meant, and `-o out.csv`
showed all four. It made the CLI's simplest positioning idiom the most verbose
thing in the output. And it turned the table's own values into the *types* of
the user's columns: a layer holding a label positioned `n` (`dx` 0) and one
positioned `e` (`dx` `'0.45em'`) had a `dx` column with a number and a string in
it, which the merge behind `-add-label` refuses — so the second label could not
be added at all. Writing every position's `dx` as a string papered over that,
but the leak was the design, not the values.

`resolveLabelPosition()` now fills the three in for rendering, returning a copy
so that no renderer writes to the record it was handed. It is called from
`renderLabel()` and `renderStyledLabel()`, which every anchored label goes
through, so a label being typed into and a label in a file are positioned by the
same lookup.

#### A value on the record wins, per property

The precedence goes the other way round from what the shorthand suggests, for
three reasons.

`dx`, `dy` and `text-anchor` are the documented `-style` options and have been
for years; `label-pos` is the new convenience. The new thing defers to the
established one.

It makes the change invisible to existing files. Every file written while the
expansion happened carries `label-pos` *and* exactly the three values the lookup
would supply, so honouring what is on the record renders them unchanged. No
migration, and no version of the table to keep around.

And it is the more useful reading of a command that gives both:
`label-pos=n dx=3` means "north, nudged 3px right" rather than "3px right of
centre, and the north is discarded". That is why the fallback is per property
rather than all-or-nothing.

The test for whether a property is set has to be presence, not truthiness. The
renderers read offsets as `rec.dx || 0`, and reusing that idiom for the fallback
would read an explicit `dy=0` — the way a label cancels the vertical offset its
position carries — as absent, and hand back the offset it was written to remove.

#### Setting a position takes back the offsets

Because a value on the record wins, the shorthand is only usable if setting it
clears the three. Otherwise choosing a position for a label that had been
dragged would appear to do nothing.

So `-style label-pos=` and the panel's nine-position widget blank `dx`, `dy` and
`text-anchor` — except any the same command also sets, which is what leaves
`label-pos=n dx=3` with its nudge. The panel gets this from the command rather
than from its own code, since it applies a position by running `-style`.

Blanking means `undefined`, not `0`: the exporters drop an undefined value, so
the record is left with one position property and no residue.

#### Path labels have no position around an anchor

A path label's text runs along its curve from a start offset, so `label-pos`
means nothing for one. It is ignored, and not stored: `-add-label` drops it with
a warning, `-style` skips those records and warns with their ids, and the
panel's position buttons are disabled for a selection of nothing but path
labels — which says so where a console warning would not.

`text-anchor` is deliberately left alone in that case. Unlike the other two it
*does* place text along a path, through `getDefaultStartOffset()`, so a position
that had no effect must not clear it.

This also closes a quiet inconsistency. The expansion gave `label-pos` a real
effect on path labels through the `text-anchor` it wrote, so setting a position
moved the text along the curve — while the GUI filtered the property out for
path labels and never let that happen. The CLI and the GUI now agree.

#### Dragging a label materializes its position

The legacy `labels` interaction mode drags a label by adding pixel deltas to
`dx`/`dy`. With the offsets resolved at draw time there is nothing on the record
to add to, so a drag would move the label to its anchor and drag from there.

`prepareRecordForDrag()` therefore writes the resolved offsets onto the record
and drops `label-pos` before the first delta arrives. Dropping it keeps the
style panel honest, since the panel reads the position back: a label dragged
away from `n` is not north of anything.

The three fields used to be added to the whole table on drag start, defaulting
`dx` and `dy` to 0. An explicit 0 is no longer nothing, so priming the table
that way would have moved every label in the layer to its anchor.

That mode still cannot carry an em offset into a pixel drag, so a label
positioned through the panel loses that offset on its first drag. It behaved
that way before this change too, when the em values were stored, and the new
label tool does not share the problem: it moves a label by rewriting its anchor
point.

The tool is proposed to take over offsetting text as well, at which point it
inherits the same materialization — in pixels, for the same reason. See
"Proposed: the tool takes over positioning".

#### What this gives up

The offsets are no longer frozen into the file at creation time, so retuning the
lookup table moves every existing label that uses a position. The table is
effectively API now in a way it was not before, and a cartographic adjustment to
it is a change to already-made maps rather than to new ones. A map that needs
the guarantee can have it by setting `dx`/`dy` explicitly, which is what the
precedence rule is for.

### Justification is not `text-anchor`

**A new property, `label-align`, says how the lines of a label line up with
each other. The renderer turns it into a `text-anchor` and an offset that holds
the block of text where its position put it.**

`text-anchor` answers two questions with one value: how the lines of a
multi-line label are justified, and where the block of them sits relative to
`x`. For a single-line label the two are the same question. For a label with
two lines they are not, and the panel's alignment control is asking only the
first.

That was the bug. A label positioned `n` is centred on its anchor because that
is what "north" means, and `text-anchor=middle` is how it gets there. Clicking
"align left" wrote `text-anchor=start`, which left-aligned the lines *and*
moved the whole block half its own width to the right — off the point it
labels. The control was unusable for the case it exists for: left-aligned text
in a label sitting north or south of its anchor.

Holding the block still means moving `x` the other way by the same amount:

```
x = dx + (offset(alignment) - offset(position)) × W
```

where `offset` is how far left of `x` the text sits for each anchor (`start` 0,
`middle` 0.5, `end` 1) and `W` is the width of the block — the widest of its
lines. `getAlignmentShift()` in `svg-label-align.mjs` is that expression;
`renderLabel()` adds it to `dx`.

`W` is a font metric, which is the whole difficulty. See "Where the width comes
from" below.

#### Why a new property rather than changing what `text-anchor` does

Correcting the offset whenever `text-anchor` disagrees with `label-pos` would
have needed no new property, and it would have silently changed the meaning of
every existing script and file that sets the two together. Someone writing
`label-pos=n text-anchor=start` today gets a block that hangs to the right of
the anchor, and may well be relying on it — `text-anchor` is SVG's, and this
project does not get to redefine it.

So `text-anchor` keeps its SVG meaning and `label-align` is the property that
means justification alone. The panel writes `label-align` and blanks
`text-anchor` when it does, because a record carrying both would be saying two
things about the same question and the winner would be a rule rather than the
last thing the user asked for. `resolveLabelPosition()` resolves `label-align`
into the `text-anchor` it renders as, so it wins over both the position's
justification and an explicit `text-anchor`.

The comparison in the correction is against the anchor the *position* implies
(`getLabelPositionAnchor()`), not against a `text-anchor` on the record: that
value is the one `label-align` replaces, so treating it as where the block
belongs would hold a label in a place it was never drawn.

Path labels are not corrected. A path label's text follows its curve from a
start offset, so its alignment picks which part of the text sits at that point;
there is no block beside an anchor to hold still, and its `dx` is an offset
from the path rather than from a point. `label-align` still sets its
`text-anchor`, which is what alignment means there.

#### Where the width comes from

`W` cannot be computed from the data. It takes something with the font in hand
— a renderer in the GUI, the font file itself in Node — the same asymmetry the
path-fit check runs into, and so the same source: `svg-label-metrics.mjs`,
which the next section is about. Below is how the GUI answers it; "Font metrics
outside the browser" is how Node does.

`gui-label-measure.mjs` does the measuring, and it measures a *record* rather
than a label on the map. The width is usually wanted for a label as it is about
to be — text being typed, a font just chosen — and a label that is off screen,
or on a layer that is not displayed, still has to export correctly. So the
record is rendered by the same code the map uses — `renderStyledLabel()` inside
the text defaults a label inherits from its layer's group — into an offscreen
`<svg>`, and `getBBox()` measures it there. `getBBox()` is in user units and so
is `font-size`, which is what makes the number independent of the map's zoom.

Alignment is dropped from the record before the sample is rendered. It cannot
change how wide the text is — it moves the lines, it does not set them — and
rendering it would have the renderer ask for the very measurement being taken.
A re-entrancy flag in `svg-label-metrics.mjs` is the backstop.

### A measurement is not data

The first implementation of this stored the width, because the path-fit check
already had a field for it and the width is the same number. `label-text-width`
and `label-text-hash` went into the record, carried by the command that made
them necessary: `-add-label text-width=` at creation, the session's
`-style label-text=` after a text edit, and a second `-style` chained onto the
panel's own for a font change — one per group of labels sharing a measurement,
since `-style` writes one value to every id it is given.

It worked, and it was wrong. Two columns of font metrics appeared in the table
of every label the panel had touched, and went out in everybody's GeoJSON and
CSV. Every edit to the text or the font became a two-part edit that had to stay
consistent, including under undo. And the plumbing was in four places at once,
one of which — the pending label, which has no record yet — had to measure on
every render to keep the preview from jumping.

**The width is derived from the data, so it belongs in a cache and not in the
table.** It is a pure function of the text and six font properties, which is
exactly what `label-text-hash` already fingerprinted. Key a memo by that
fingerprint and every one of those problems goes away at once:

- Nothing is written to the user's table, so nothing is exported and nothing
  has to be stripped on the way out.
- Nothing can go stale. Change the text or the font and the fingerprint changes
  with it, so the old entry is not found rather than found and wrong. There is
  no invalidation step to forget.
- Nothing has to ride along with an edit, so an edit is one command again, and
  undo has one thing to take back.
- A feature can be copied, merged, filtered or renumbered without its
  measurement following it around, because the measurement was never attached
  to the feature.

`getMeasuredTextWidth(rec)` in `svg-label-metrics.mjs` is the one reader, for
both `label-align` and the fit check. On a miss it *asks for* a measurement: a
measure function is installed at startup (`setTextMeasureFunction()`) — by the
GUI in a browser, by `mapshaper-api.mjs` outside one — and a reader that can
ask needs no hooks anywhere else. The alternative was measuring ahead of every
reader — before each render, before each export, after each edit — which is
three things to keep in step and a fourth for the console, where `-o out.svg`
never goes near the export dialog. Where a width cannot be had at all — a font
this machine has not got — every reader falls back exactly as it did before any
of this existed.

The memo is capped at 20,000 entries — a dozen bytes of key and a number each,
one per distinct text and font, which typing a label adds one of per keystroke.
Failures to measure are remembered too, so an unmeasurable label is not
measured over and over; *not having a measure function* is not, because
remembering that would let whatever rendered before one was installed decide
the width of that text for the rest of the session.

#### Nor is it a parameter

The first cut of this kept `label-text-width=` and `label-text-hash=` as style
properties, and `-add-label text-width=` alongside them, on the grounds that a
script with real font metrics could state its own width and opt into the drop
rule. They are gone too, and the reasoning is the same one applied to storage:
these are not values a user sets, so they should not be in the interface either.

What that opt-in asked of the person using it was font metrics mapshaper cannot
compute — measured in another tool, kept in step with every subsequent restyle
by hand, and written back per feature. What it cost to offer was a second source
of widths in the reader, a `stale` state for the case where the hand-written
number stopped describing the text, a warning path in the export report to
explain it, a fingerprint written by `-add-label` so the opt-in could guard
itself, and four rows of documentation for the whole arrangement.

So `getLabelFitState()` has three states rather than four, `getMeasuredTextWidth()`
has one source rather than two, and nothing anywhere checks a measurement for
staleness — the fingerprint is a cache key now, which is the same guard turned
inside out and made free.

A file that already contains those columns is not a problem: they are ordinary
data fields to mapshaper now, ignored by the renderer and exported as they were
imported, like the `label-corners` property that the curve model left behind.

#### The fit check now works in the GUI

A consequence worth stating on its own. Nothing had ever measured a path label,
so `getLabelFitState()` could only ever answer `unmeasured`: the editor's orange
overflow halo and export's drop rule were both fully built and both inert, and
the only way to see either was to hand-write a width into the data. They switch
on together with the measure function — a path label whose text is longer than
its curve is marked in the editor, and dropped from an SVG exported out of the
GUI, which is what "The editor keeps a non-fitting label visible" was for.

#### Failing open

A label with no usable width is still justified the way it was asked to be, and
its block still moves. That is the old behaviour, and what is left of it is the
label whose font cannot be found: `-style label-align=left` rendered on a
machine that has not got the family. A label that reads the way it was asked to
read in the wrong place is closer to the request than one that ignores it.

A `dx` in units the shift cannot be added to falls back the same way — `pt`,
`%`, anything but `px` and `em` — because correcting it would mean choosing a
pixel size for a unit whose whole point is that something else decides.

Ems are not one of those cases, and getting that wrong was the first bug in
this code. Six of the nine positions hold text clear of its anchor with an
offset in ems (`e` is `0.45em`), and adding a pixel shift to one means knowing
what an em is worth — while a label usually carries no `font-size` of its own,
because it inherits one from its layer's group. Treating a missing size as
unknowable left exactly those six positions uncorrected, so `n`, `s` and `c`
held their blocks and the rest still slid. A missing size resolves against
`DEFAULT_LABEL_FONT_SIZE`, which is the constant `getLabelTextDefaults()`
supplies to the group — one number, not two, since a correction computed
against a different size than the label is drawn at is a correction to nowhere.

CLI-authored labels were the remaining gap: `-style label-align=left` in a
script got the fallback, because nothing in Node could measure text. That is
closed — see "Font metrics outside the browser" — and it is what makes the
path-fit rule apply to a scripted map as well.

#### The old drag mode

`prepareRecordForDrag()` gives up the alignment along with the position, and
bakes the corrected offset in rather than the position's raw one.

That mode moves a label by changing its `text-anchor` and compensating with
`dx` (`autoUpdateTextAnchor()`) — which is the job `label-align` exists to take
over, so leaving both on the record would have the two of them answering for
the same pixel. Materializing the alignment into the `text-anchor` it renders
as justifies the lines exactly as before, and folding the correction into `dx`
means grabbing the label does not move it.

### Fitting text to a path

**A path label whose text does not fit its path is not drawn, and is dropped
from the output.** The font is never shrunk and the letter-spacing is never
squeezed to make text fit; a label either fits as authored or it does not
render. In the editor a non-fitting label stays visible, marked to show that it
will not render.

This is a simpler rule than a per-feature fitting policy, and it removes a
field from the data model. It also moves the decision to the one place that
cannot easily make it — the exporter — so most of this section is about how
export decides.

Three situations change the fit after authoring: zooming a layer that has no
frame, exporting at a size other than the frame's nominal size, and editing the
text itself.

The three engines disagree about what happens when text exceeds its path,
measured with a 93-character string on a 622 px path:

| | `getNumberOfChars()` | `getComputedTextLength()` | Index past the fit |
|---|---|---|---|
| Chromium | 93 (full string) | 888.8 (unconstrained) | returns `(0,0)` silently |
| Firefox | 93 (full string) | 567.6 (saturated) | returns a clamped point |
| WebKit | **61** (rendered only) | 567.5 (saturated) | throws `IndexSizeError` |

Three behaviors, one silently wrong. So overflow is never left to the renderer.
It is detected by measuring the text width **off-path** — on a hidden plain
`<text>` with the same font properties — against `path.getTotalLength()`.
Measuring on the `textPath` element itself is unreliable, because Firefox and
WebKit saturate at roughly the path length and cannot report how much room
would be needed.

### What export can and cannot compute

Deciding whether to drop a label means comparing two numbers. Export has one
of them and cannot get the other.

**Path length is available.** `calcPathLen(ids, arcs, spherical)` already exists
in `src/geom/mapshaper-path-geom.mjs`, and by the time labels are rendered
`fitDatasetToFrame()` has transformed the geometry into output pixels, so the
path's length in output pixels is a direct call on existing code.

**Text width is not.** Mapshaper had no font metrics outside the browser when
this was written: the only text measurement anywhere in the codebase was canvas
`measureText()` in `src/gui/gui-label-fonts.mjs`, used for font detection. The
CLI could not know how wide a string would render. The design below follows
from that, and still holds — export asks for a width rather than computing one
— but the answer is no longer only the GUI's; see "Font metrics outside the
browser".

### Keep the measurement, not the verdict

The way out is for the GUI to measure once and keep the result, with the
exporter supplying the half it can compute. What gets kept must be the
**measured width**, not a fits/doesn't-fit verdict:

- A verdict depends on output size. Text is emitted at native scale, so a
  smaller output shrinks the path while the text stays put — a label that fits
  at 800 px may not fit at 400 px. A stored boolean would be wrong at every
  size but the one it was computed at.
- A width does not. Because `font-size` is exported natively, the text's
  rendered width in output pixels is **constant, independent of output size**.
  A width measured once stays valid forever, while path length is recomputed
  per export.

So the width is in pixels at the label's native font-size, measured off-path on
a hidden plain `<text>` — never on the `textPath` element, which saturates at
the path length in Firefox and WebKit and so cannot report how much room would
be needed. Export then drops the label when that width exceeds the path length
in output pixels.

This invariant is a direct dividend of exporting at native scale. Had export
scaled `font-size` with the frame, the kept width would need scaling too.

Where it is kept is a memo keyed by a fingerprint of the text and the font, not
a column in the user's table; see "A measurement is not data".

### Staleness, and failing open

A measurement can stop describing the label it was taken for: `-style
label-text='...'` or `-style font-size=18` changes the inputs from under it. So
the key it is filed under, `getTextWidthKey()`, is a fingerprint of the values
it described — the text plus `font-family`, `font-size`, `font-weight`,
`font-style`, `font-stretch` and `letter-spacing`. (`font-stretch` is in the
list because it changes glyph widths. `css` and `class` are not, and cannot be:
either can change the rendered font through a stylesheet mapshaper never sees.)

The same fingerprint is the memo's key, which is why a measured width has no
staleness state: an edit makes the old entry unfindable instead of wrong.

`getLabelFitState()` in `src/svg/svg-label-fit.mjs` returns one of three states,
and export draws the label in two of them:

| State | Condition | Behavior |
|---|---|---|
| `fits` | width ≤ path length | Draw |
| `overflow` | width > path length | **Drop**, and report |
| `unmeasured` | nothing could measure the text | Draw, silently |

An earlier version had a fourth, `stale`, for a width in the data whose
fingerprint no longer matched it, drawn with a warning. Nothing writes a width
into the data any more, so the state has nothing to describe; see "Nor is it a
parameter".

**`unmeasured` does not warn.** It was the normal result of authoring in the
CLI, so a warning would have fired on every export of every CLI-authored label
— noise that would train people to ignore the message that matters. It is now
the unusual case, and the one thing that produces it, a font this machine has
not got, warns once by name where it happens.

**Failing open is the important half.** Silently deleting a label from a map is
a worse outcome than drawing one that overflows: the overflow is visible and
fixable, the deletion is neither.

Two consequences worth stating plainly:

- **A path label exported by the CLI is never dropped** — as written. It is now,
  because Node can measure text; the rule bites wherever the measurement can be
  taken, which is everywhere the label's font is installed. See "Font metrics
  outside the browser".
- **Dropping must be reported.** Export emits a `message()` with the count and
  the feature ids of dropped labels. A silent drop would be indistinguishable
  from a bug. `reportPathLabels()` emits one message per layer per condition,
  naming up to ten feature ids and summarizing the rest:

  ```
  [o] Dropped 1 path label from layer "labels" because the text is longer than the path: feature 0.
  ```

### The editor keeps a non-fitting label visible

In the GUI a non-fitting label is still drawn, still selectable, and marked.
Hiding it would make it unfindable and therefore unfixable — the user needs to
select the label to lengthen its path, shorten its text or reduce its size.

**Implemented.** The marking follows the halo convention already used for label
state: a `text.label-overflow` class in `page.css` alongside the existing
`text.active-label` and `text.label-style-selected`, using `paint-order` so the
halo sits behind the glyphs. Unlike those two, which are toggled on the DOM node
by `classList` as the selection changes, this one is emitted by the renderer —
it depends only on the data, and having `renderPathLabel()` set it means the fit
state is computed once per label per draw rather than twice.

The `keepOverflow` option is what separates the two consumers: export omits it
and drops the label, the GUI sets it and gets the label back with the class
attached. The path guide for an overflowing label is drawn in the warning color
already defined in `gui-overlay-styler.mjs` (the `orange` used for
`pending_snip`), which both signals the problem and shows the path that is too
short.

### Editing must not truncate the text

One engine behavior makes this more than a styling question. WebKit renders
only the glyphs that fit the path, and Chromium returns a degenerate `(0,0)`
for positions past the fit. So if an in-progress label were drawn on its true
path, typing past the fit would make the tail of the string **disappear as the
user types it** in Safari, and would break caret math in Chromium.

During an edit session the label is therefore rendered on a **temporarily
extended path** — the baked path continued along its end tangent — so glyphs
stay visible and every caret position stays valid in all three engines. The
extension is render-only: it lives in the `<defs>` path used for display and
never touches the feature's geometry, so nothing is committed and no command is
emitted. Drawing the extension dashed, in the warning color, shows the user
exactly how much of the text does not fit and how much longer the path needs to
be.

This is the one useful piece of the fitting policies this rule replaced,
demoted from a data-model policy to an editing affordance.

### Export

**Implemented.** `<textPath>` is imported by Illustrator as real editable
text-on-path, which is the newsroom handoff that matters. Figma drops it, which
is [left alone deliberately](#figma-cannot-import-the-output-and-that-is-left-alone).

A path label is recognized in `importGeoJSONFeatures()`
(`src/svg/geojson-to-svg.mjs`) rather than in the geometry importers, because
the distinction is not geometric: a `MultiPoint` carrying `label-text` is one
label along a curve, while the same geometry without it is several symbols.
`renderPathLabel()` in `svg-label-paths.mjs` builds the element and
`convertLabelPath()` in `svg-definitions.mjs` hoists the baseline into `<defs>`,
using the same property-to-definition idiom as hatch fills and SVG images:

```xml
<defs>
<path id="label-path-7c71c930f56c" d="M 1 80.2 C 34 53.8 67 1 100 1 C 133 1 166 53.8 199 80.2"/>
</defs>
<g id="labels" font-family="sans-serif" font-size="12" text-anchor="middle">
<text><textPath startOffset="50%" xlink:href="#label-path-7c71c930f56c">Sierra</textPath></text>
</g>
```

The baseline **must** live in `<defs>` and nowhere else. `<defs>` content is
never painted, but a path emitted in the document body with no `stroke` or
`fill` picks up SVG's defaults — no stroke and **black fill** — and renders as a
filled blob rather than a line. That failure showed up in the editing spike, so
there is a test asserting no `<path>` survives outside `<defs>`.

Definition ids are derived from the path data rather than from feature ids, so
identical paths share one definition and repeated exports of the same map are
byte-identical.

Three details are worth recording because they are not obvious from the spec:

- **`dx` and `dy` go on the `<textPath>`, not the `<text>`.** `renderLabel()`
  puts offsets in `x`/`y` on the `<text>` to work around an Illustrator bug, but
  both are ignored once a `<text>` has a `<textPath>` child. On the `<textPath>`
  they shift the text along and across the path, which is the useful meaning.
- **The default `startOffset` follows `text-anchor`**, since `startOffset` is
  where the anchor lands: `0%` for `start`, `50%` for `middle` (the layer
  default) and `100%` for `end`. A fixed `50%` would make `text-anchor=start`
  begin at the midpoint.
- **Whitespace inside `<textPath>` is significant.** `stringify()` indented
  element content for legibility, which put newlines around the label text;
  `textPath` joined `text` and `tspan` in the set of tags that are not indented.

Non-SVG formats need no work: the knots are ordinary point geometry and the
label properties are ordinary attributes, so GeoJSON, TopoJSON and Shapefile
round-trip losslessly and `-simplify`, `-clip` and `-proj` all apply.
Mapshaper's *own* SVG importer will not round-trip a path label, since
`parsePathData()` handles only `M/L/H/V/Z` and skips curve commands, and
`collectTextFeature()` collapses tspans into a single string
(`src/svg/mapshaper-svg-import.mjs`).

#### A behavior change for multipoint labels

Because a multipoint feature with `label-text` is now one label on a curve, it
no longer exports as the same label repeated at every point. Nothing depended on
the old output: it was a known wart, flagged by a commented-out warning inside
`layerHasLabels()` reading `Multi-point labels are not fully supported`. A
multipoint feature *without* `label-text` still renders one symbol per point.

#### Curves, not a densified polyline

Export emits true cubic segments from `getCurveSegments()` rather than the
flattened output of `fitCurveThroughKnots()`. This is worth the small extra code
in two ways: the exported baseline stays editable after import into Illustrator,
and the text is positioned against a smooth curve rather than a chain of chords.

It also puts the cubic-capable path writer in `svg-path-utils.mjs` to use. That
writer emits `C` segments for coordinates tagged with a third element `'C'` and
was previously unreachable from production code, since the export pipeline uses
the `M`/`L`-only `stringifyLineStringCoords` in `svg-geom-primitives.mjs`.
Consolidating those two remains a separate change, as
[Higher-fidelity export](#higher-fidelity-export) describes.

#### Path length is measured on the curve

The fit rule compares text width against path length, so length has to be
measured on the true curve. `getCurveLength()` brackets each cubic between its
chord and its control polygon and subdivides until the bracket is narrow
(Gravesen's method), rather than flattening and summing chords. The reason is
unit independence: a flattening tolerance tight enough to be accurate in output
pixels is meaningless if the knots are in degrees, whereas a relative bracket is
scale-free. A test cross-checks it against a finely flattened version of the
same curve, since the two paths share only `getCurveSegments()`.

#### Figma cannot import the output, and that is left alone

Figma's SVG importer silently drops `<textPath>`: the baseline arrives, the
words do not. Two workarounds were measured against a real export and both
work in a browser, so the choice is not about fidelity.

- **One `<text>` per glyph**, positioned and rotated by `transform`. Figma
  imports this as curved text, since each `<text>` becomes a text node and a
  transform on it is honoured.
- **One `<text>` carrying per-character `x`/`y`/`rotate` lists**, which would
  keep one text node per label. Figma imports the words but drops the lists, so
  the text lands straight.

Neither is adopted. The per-glyph form is the only one that survives, and it
costs a text node per character — a dozen for `Sierra Nevada`, several hundred
for a map's worth of curved labels — with no editable text at either end of the
trip. It is also the option that cannot improve. Figma has had a path-text
layout engine and an editable `TEXT_PATH` node since Figma Draw shipped in May
2025, and plugin API update 123 (January 2026) exposes
`figma.createTextPath(vectorNode, startSegment, startPosition)` — whose
arguments have a counterpart in `href`, `startOffset` and `side` — so what is
missing is importer plumbing rather than a capability. Emitting correct
`<textPath>` means those exports would start working with no change here,
whereas baked-out glyphs would stay baked.

Against that, the importer looks chronically deprioritised — it also drops
`letter-spacing`, `baseline-shift` and inline style runs — and no public
commitment to `<textPath>` exists, so this should not be planned around either.
Until then the handoff is Illustrator, which imports the existing output as
real editable text-on-path.

The constraint that made per-glyph output awkward is the one behind
[What export can and cannot compute](#what-export-can-and-cannot-compute):
glyph advances need font metrics, which used to mean only the GUI could place
glyphs. Node reads them now (below), and fontkit's `layout()` returns the
per-glyph positions such an exporter would need, so the option is no longer
split between the GUI and the CLI — it is unbuilt, not impossible.

### Font metrics outside the browser

Node measures label text from the font files installed on the machine.
`src/fonts/mapshaper-text-measure.mjs` installs itself through the same
`setTextMeasureFunction()` hook the GUI uses, from `mapshaper-api.mjs`, so the
CLI, the Node API and a script that only exports all get it without a hook of
their own.

What changes for a scripted map: `-style label-align=left` now holds the block
where its position put it instead of letting it slide, and the path-fit rule
applies — a path label longer than its curve is dropped from CLI output, the
way it already was from the GUI's. Measured against Chrome on the same fonts,
the two agree to a hundredth of a pixel, which is what makes a map styled in
the GUI and exported from a Makefile come out the same.

**fontkit, rather than the sfnt reader this document once planned.** Reading
`hmtx` advances is a day's work, and it is wrong by up to 5% on text like
"AVATAR Toledo": the `GPOS` pair positioning that closes that gap is most of a
layout engine, and so are `.ttc` collections, variable fonts and the shaping
that makes Arabic or Devanagari widths mean anything. fontkit does all four,
costs 10 MB installed and nothing in the bundle — it is loaded through the
`require` shim, and only when a label is actually measured — and it is the same
library that would subset fonts for PDF output later.

**Finding the file a family names** is `mapshaper-font-lookup.mjs`, and it is
the part with no standard to follow:

- **The typographic family is what a stylesheet means.** Every weight of
  NYTFranklin is its own name-table family — "NYTFranklin Light", "NYTFranklin
  Medium" — and they are one family only under name ID 16. Both are indexed, in
  a comparison that ignores case, spaces and punctuation, because a family
  called "NYT Franklin" in one file is "NYTFranklin" in the next.
- **Two passes.** Parsing every font on the machine takes the best part of a
  second, and a family's file is usually named after it, so files whose name
  begins with the family's are parsed first — 50 ms in the common case. The
  full index is built only if none of them answers, which is the price of
  asking for a font that is not there.
- **Face matching follows CSS**: width, then slant, then the nearest weight,
  with a tie going to the heavier face — the same last rule the style menu uses
  to carry a face across a change of font. A face that does not exist is
  answered with the nearest one rather than refused, because that is the face
  the browser would synthesize the missing one from.
- **A variable font is set to the weight asked for**, clamped to its axis. One
  file covers the range, and measuring its default instance would report
  Regular widths for Bold.
- **A generic family is resolved by candidate list** — `sans-serif` is
  Helvetica, then Arial, then Liberation Sans, and so on — which is a guess, but
  the same guess the browser on that platform makes. It only arises for a label
  carrying no font at all; the tool names the font on every label it creates,
  which is what "The default font is not a font" is about.
- **`MAPSHAPER_FONT_PATH` replaces the platform's font directories**, for a
  container with its fonts somewhere of its own, a build that has to produce
  the same SVG wherever it runs, or a test that needs to know there is nothing
  to find.

**Nothing is paid for until a label is measured**: no directory is listed, no
font is opened, and fontkit is not loaded. After that, widths come from the
memo in `svg-label-metrics.mjs` and opened faces are held for the process.

**A font that cannot be found gives no width, not a wrong one.** The label
renders unmeasured, exactly as it did before any of this, with one warning per
missing family — the alignment is the thing that will be off, and it is worth
knowing why.

What it does not do: synthesize a bold or an oblique the family has not got (it
measures the nearest real face, as the bullet above says); see a font that a
`css` or `class` property pulls in through a stylesheet, which is why neither
is in the measurement fingerprint; or measure in a browser, where the GUI's own
measurer is what is installed.

One test-harness note, since it looks unrelated to fonts: fontkit pulls in a
UMD build of tslib, which writes three dozen helpers to the global object as it
loads, and mocha's `--check-leaks` counts those as leaked globals. The mocha
hooks load fontkit up front so that they are in the count it starts from, which
keeps leak checking strict everywhere else.

## In-Place Editing

### The model

One editing engine serves both label kinds:

1. An offscreen `<textarea>` holds focus and is the **model of record** during a
   session. Native keyboard handling, selection, clipboard, IME and OS-level
   undo all come free, and none of them have to be reimplemented against SVG.
2. On every `input` event the textarea's value is written into the real SVG
   text node — `textContent` of the `<textPath>` for a path label, of the
   `<text>` for an anchored one. The thing being edited is the thing that
   renders and exports, so the feedback is genuinely WYSIWYG.
3. The caret and selection are **drawn manually** from the SVG text char
   position APIs: `getStartPositionOfChar`, `getEndPositionOfChar`,
   `getRotationOfChar`, `getExtentOfChar`, and `getCharNumAtPosition` for
   click-to-position.

Because those APIs behave identically on `<text>` and on `<text><textPath>`,
the caret code is shared; the only difference is that the curved case also
applies `getRotationOfChar()` to tilt the caret. This makes a consistent look
and feel a property of the design rather than a veneer over two editors.

Alternatives rejected: `contenteditable` on SVG `<text>` is not reliably
supported; `<foreignObject>` with an editable div renders through a different
text engine than the `<text>` that gets exported, and cannot follow a path.

### Browser support

Verified by spike across all three engines. Every API works on a curved
`<textPath>`; positions agree to within 0.1 px and per-glyph rotations to
within 0.06°.

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| Char position / rotation / extent on `textPath` | yes | yes | yes |
| `getCharNumAtPosition` on `textPath` | yes | yes | yes |
| Caret recompute per keystroke | 0.0045 ms | 0.0030 ms | 0.0015 ms |
| Redraw of a full selection band | 0.9 ms | 1.0 ms | 1.0 ms |

Caret cost is roughly 0.03% of a 16 ms frame, so live re-render on every
keystroke needs no debouncing.

### Rules the engine divergences impose

- **The caret index comes from the model, never from the view.** WebKit's
  `getNumberOfChars()` returns only the glyphs that fit on the path, so
  clamping a caret with it would pin the cursor mid-string and make the tail
  uneditable. Indices come from the textarea's `value.length` and
  `selectionStart`.
- **Every position lookup needs a guard against two failure modes.** WebKit
  throws `IndexSizeError`; Chromium returns a degenerate `(0,0)` point with no
  error at all. Catching the exception is not sufficient. The test that catches
  both, and the one the code uses, is that **a character the engine did not lay
  out reports no advance**: its start and end positions are identical. When a
  lookup fails the caret walks back to the last character that does measure and
  sits at its end, which puts it at the end of the visible text on an
  overflowing label rather than nowhere.
- **An empty label needs a zero-width-space placeholder.** With no rendered
  glyphs every position API fails, the caret vanishes and the label becomes
  unhittable, leaving the user no way back into it.

The guards live in `gui-label-caret.mjs`, written against a small provider
interface rather than a DOM node, so each engine's misbehavior can be faked and
tested directly.

### An empty label renders nothing at all

The placeholder turned out to matter more than the spike suggested, and for a
different reason. `featureHasLabel()` is falsy for empty `label-text`, so
`renderPoint()` returns `null` and the symbol is filtered out of the layer: a
label that has just been created has **no DOM node whatsoever**. Not an empty
`<text>` — nothing. So there is nothing to see, nothing to click, nowhere to put
a caret, and no way to find the label again; clicking the map appeared to do
nothing at all.

Two changes fix it, and the split between them is the point:

- `featureIsLabel()` (`svg-feature-utils.mjs`) asks whether a feature *is* a
  label, including one whose text is still empty, and `shapeIsPathLabel()` —
  which only the GUI calls — uses it. A path label being typed into is a path
  label before it has any text, and has to keep its curve while that is true.
- The GUI's `renderSymbol()` substitutes the zero-width space for empty text, so
  the node exists and has something measurable in it.

Export keeps using `featureHasLabel()` and keeps dropping empty labels. The
asymmetry is deliberate: the placeholder is a rendering detail of the editor,
and writing it into the data would save it to the file.

### A label that does not exist yet

A label is not created until it has a glyph in it, so for the first part of its
life there is nothing in any layer to render. The editor is nonetheless bound to
a *rendered* label: `findNodes()` looks a symbol up by feature id, and the caret
position, the font size, the box, the ghosted curve and the hit region are all
read back off that node through the SVG character-position APIs.

Rather than compute all of that a second way for a label with no feature,
`renderPendingSymbol()` (`gui-svg-symbols.mjs`) draws it with **the same
renderer the layer's own symbols go through**, from a record the tool has not
saved. The editor cannot tell the difference: `findNodes()` returns nodes from
the pending markup instead of from a query, and every path downstream of it is
unchanged.

Reusing the renderer is what makes the preview faithful rather than approximate.
The clearest case is label position: `label-pos: 'sw'` expands to
`dy: '0.7em'`, and resolving that em against whatever font the label happens to
wear is the text engine's job. Choosing a position before typing moves the caret
correctly because the browser is doing the same arithmetic it will do after the
label is committed. The same goes for a curve, where `<textPath startOffset="50%">`
puts the caret at the middle of the path with the path's own tangent.

Three details are not shared with a committed label, each for a reason:

- **It is hosted by the map's `<svg>`, not a layer's group.** A pending label
  belongs to no layer, and the layer it will go into may not exist yet — or may
  be a polyline layer with no SVG group at all. A symbol positions itself with
  its own transform, so the two hosts are equivalent for drawing.

  What they are *not* equivalent for is inheritance. A layer's group carries the
  text defaults — `font-family: sans-serif`, `font-size: 12`,
  `text-anchor: middle` — and its labels carry an attribute only where they
  differ from them, so a label given no position has no `text-anchor` of its own
  at all. Rendered outside that group it fell back to the browser's defaults and
  came out left-aligned at the wrong size, then jumped to centred at 12px at the
  moment it was created. The pending group is given the same defaults, from
  `getLabelTextDefaults()` — one function both it and `getEmptyLayerForSVG()`
  read, since a second copy of the values is a second thing to drift.

  The `<svg>` has to be *sized* first, which layers normally do as a side effect
  of being drawn into it. An `<svg>` nobody has sized falls back to 300×150,
  which clips everything outside that box and takes no pointer events there —
  so the first label placed on a map with no symbol layer was invisible until
  `getSvgRoot()` started sizing the root on the way out.
- **It carries neither `data-id` nor the `mapshaper-svg-symbol` class.** The hit
  test, the reposition pass and the selection cue all find labels by those, and
  a node with no feature behind it must not be found by any of them. A click on
  it is recognized by `LabelEditor.ownsNode()` instead, which asks the DOM
  rather than a feature id.
- **Its markup is rebuilt only when it would differ.** `refresh()` runs on every
  map render and a hover is a render, so rebuilding unconditionally would replace
  the group between a click's `mousedown` and the click itself — leaving the node
  the click came from detached, and the session failing to recognize a click on
  its own label. `ownsNode()` uses `closest()` rather than `contains()` for the
  same reason.

### Text has three forms, not one

A real newline **cannot travel through a mapshaper command** — the parser
rejects the line break outright — so multi-line text is stored with a
two-character `\n` escape, which is one of the three forms `labelNewlineRxp`
already accepts. `gui-label-text.mjs` holds the conversions: `decodeLabelText()`
for reading (all three forms in, real newlines out) and `encodeLabelText()` for
writing (one form out).

The rendered form is a third thing again, and getting it wrong is what produced
the two bugs described next. The rule it now follows is worth stating as a rule,
because both bugs were the same mistake:

> **Every character the user types must become a character the text engine laid
> out.** A caret can only be positioned relative to a character the engine
> measured, so a typed character with no rendered counterpart is a typed
> character the caret cannot get past.

`getRenderedText()` enforces it by substituting exactly one character for every
line break: a real space where the lines are joined along a path, the zero-width
placeholder where they are stacked. The rendered string is then the same length
as the edited one, at the same indexes, and the mapping in both directions is the
identity — `getRenderedCaret()` and `getEditIndex()` have no arithmetic left to
get wrong.

One thing still has to be decided rather than computed: **which side** of a
character the caret sits on. The end of one line and the start of the next are
one character apart but a whole line apart on the map, so `getRenderedCaret()`
reports `atEnd` as well as an index, and a caret on a line break is placed at
the end of the line the break closes. Joined lines have no such jump — the break
is a space on the same baseline — so there the caret sits before it like any
other character.

#### A line the user just opened

An empty `<tspan>` lays out nothing. Breaking a line therefore produced no
position for the caret to move to, and both the caret and the box stayed on the
line above: shift-Enter looked like it had done nothing until a non-space
character was typed. The placeholder that `getRenderedLines()` puts at the start of every
continuation line gives the line something to lay out, which is what the caret
then attaches to.

Two consequences follow from the placeholder having **no advance**:

- `charIsRendered()` reads a missing advance as the way Chromium reports a
  character it quietly failed to lay out, which is how an overflowing path label
  is detected. It would walk the caret straight back off the placeholder. So
  `getRenderedCaret()` marks the position `zeroWidth` and `getCaretGeometry()`
  skips the walk-back for it. The two mechanisms never need to coexist on one
  label — only joined lines overflow, and only stacked lines use placeholders —
  but the flag says *why* rather than relying on that.
- An empty line contributes nothing to `getBBox()`, so the box would stop short
  of the caret. `growBoxToCaret()` extends it, which is the only visible sign
  that a line was started, the line itself having nothing in it to see.

#### Where an empty path label's caret waits

Text on a path sits where `startOffset` and `text-anchor` put it, which by
default is centred on the curve. An empty `<textPath>` lays out nothing, so
there is no character to ask where that is, and the caret fell back on the
element's own `x`/`y` — `(0, 0)`, the **start** of the path. The caret appeared
at one end of the curve and jumped to the middle as soon as a character was
typed.

`getRenderedContent()` gives a joined label the placeholder when its text is
empty, as `getRenderedLines()` already did for a stacked one. The engine lays
the placeholder out at the anchor point like any other character, so
`getStartPositionOfChar(0)` answers, and the caret waits where the first
character will land. It also has a rotation there, so the caret leans with the
curve before there is any text to lean against.

The `getRenderedLength()` asymmetry is unchanged and deliberate: an empty label
still reports **zero** rendered characters, which is what routes the caret
through `getEmptyCaretGeometry()` and the anchor rather than through character
measurement. The placeholder is a thing to measure *against*, not a character
in the text.

#### Spaces

SVG's default whitespace handling collapses runs of whitespace and strips
leading and trailing ones. Typing a space therefore moved no glyphs and the
caret stayed put until a non-space character followed — the same symptom as the
line-break bug and the same cause. `writeText()` sets `xml:space="preserve"` on
the `<text>` node, after which `getNumberOfChars()` counts the spaces and
`getEndPositionOfChar()` advances past them.

This is set on the **editing session's node only**, not by the exporter, so a
label with a run of interior spaces reflows slightly when the session ends. A
trailing space is the common case and is unaffected either way, since it renders
as nothing once the caret is gone. Setting it in `svg-labels.mjs` instead would
be more consistent, but it would also change the rendering of every existing
label whose data carries stray whitespace, and a centred label would move.

### What a session commits

Text goes into the SVG on every keystroke but into the data only once, when the
session ends — which is what makes one undo step reverse one label's text rather
than one keystroke. A session ends on blur, on a click away from the label, on
Escape, on Enter, and on leaving label mode.

#### Enter finishes, shift-Enter breaks a line

**Enter ends the session; shift-Enter is how a line gets broken.** Most map
labels are one line, and Enter is the key that ends entry of a field everywhere
else in this app — the console submits on it, and so does the style-preset name
field.

Enter used to add a line to an anchored label while committing a path label, so
the key did two different things depending on which kind of label was open, with
nothing on screen to say which. Removing that took the editor's `isPathLabel()`
with it: the predicate existed for this branch alone, and the editor no longer
needs to know what kind of label it is handling a keystroke for.

Shift-Enter needs no handling. The keydown listener lets everything it does not
act on through to the textarea, which inserts the break itself. On a path label
the break renders as a space, which is what export does with one.

The cost is muscle memory from Illustrator and Figma, where Enter breaks a line
in a text object and Escape commits. Recovering is cheap — reopen the label and
use shift-Enter — and nothing announces shift-Enter yet, which is an open UI
question rather than a decision.

**An IME keystroke is the exception.** Japanese, Chinese and Korean input use
Enter to accept the candidate the IME is offering. Committing the label on that
keystroke would end the session mid-word, and `preventDefault()` would stop the
candidate being accepted at all. `isCommitKey()` therefore ignores Enter while
`isComposing` is set (or `keyCode` is 229, which is how some browsers report a
composing keystroke). Taking IME input as it comes is one of the reasons the
editor drives a real textarea instead of reading keys itself, so the exception
belongs with the key handling rather than somewhere upstream.

A session is in one of two modes, and what it commits follows from which:

| Session | Ends with glyphs | Ends with none |
| --- | --- | --- |
| **pending** — a label that does not exist yet | `-add-label coordinates=… text='…' <style>`, which creates it | nothing at all: no feature, no layer, no command, no history entry |
| **existing** — a label being re-edited | `-style label-text='…' ids=N`, if the text changed | `-filter 'this.id !== N'`, which removes it |

Creating a typed label therefore runs **one** command, carrying the geometry, the
style and the text together. A new label is one entry in the session history and
one step to undo. (It used to be two, `-add-label` followed by
`-style label-text=`, which described placing a label and then typing into it as
two edits when they are one gesture.)

Both modes also sit inside the existing edit-session transaction, because
`modeSupportsUndo('label')` puts the mode inside `createEditSessionUndo()` in
`gui-undo.mjs`: fine-grained undo works while the tool is open and one entry
survives leaving it.

**Every way of ending a session saves.** Escape included: on a label being typed
into it means "I am done here", not "throw away what I typed", so it finishes the
label and leaves it exactly as clicking away does. It stops propagating so that
it ends the session without also turning the tool off. There is no gesture that
discards text — undo is what takes back an edit, and one session is one undo
step.

**Leaving a label and placing the next one are two clicks, not one.** A click
away from an open session finishes that label and does nothing else, even with a
tool armed; the click after it places the next label. Doing both at once meant
that reading back what you had just typed dropped a label wherever you happened
to look.

### A label with no glyphs is never created

A label that draws nothing is not a label. It puts no mark on the map, so it
cannot be seen, hovered, clicked or selected, and the only way to find out it is
there is to export the layer and read the geometry. Saving one is a way to
accumulate invisible features, and the tool makes them easily: clicking to place
a label opens an empty session, and thinking better of it is a press of Escape.

`textHasNoGlyphs()` is the test for "draws nothing", and it is deliberately not
"is the string empty": whitespace, line breaks and the zero-width placeholder all
draw nothing, and a label of three spaces is exactly as unfindable as a label of
none. (The placeholder has to be stripped rather than trimmed — `U+200B` is a
format character, so `String.trim()` leaves it alone.)

**A label the tool is placing is not created until it has a glyph.** Placing one
is a single click and taking it back is a single press of Escape, so the click
cannot be the thing that commits a feature. Deferring is what makes an abandoned
label leave *nothing*: no feature, no layer, no command, no history entry, and
nothing that a later cleanup step has to get right.

A label that already existed is a different case, because there is no session to
abandon — its creation may have been in an earlier session, or in the script the
file was built by. Emptying one removes it with
`-filter 'this.id !== N'`. `-filter` rather than a label-specific command,
because dropping a feature is not a label operation: a label with no text is an
ordinary point feature as far as the data model is concerned, and `-filter` is
what a CLI user would reach for.

**Neither case involves undo.** An earlier version removed a just-created empty
label by unwinding the session's history, which was wrong for a reason worth
recording: app undo is a *setting*. `createUndoTransaction()` returns `null` when
it is off (History menu → the undo checkbox, persisted in `localStorage`), so
nothing was recorded, there was nothing to unwind, and the empty label survived —
silently, and only for users who had turned undo off. A rule about what may exist
in the data cannot depend on a setting. Deferring creation removes the
dependency rather than working around it: the common case runs no command at all,
and the one case that still needs removing uses a command, which runs whether or
not history is being kept.

Deleting a feature shifts the ids of every later one, which is inherent to
deleting it and is why the session's `removed` flag exists —
`reselectOnClose()` would otherwise put the selection on whichever label moved
up into the gap. The feature count cannot be used to notice this, because the
command has not run yet when the session closes.

Export already drops labels with empty text (`featureHasLabel()`), so this
changes what is stored rather than what comes out. The point is that the editor
no longer keeps features the user cannot get back to.

### Keeping the GUI's key handlers out of the way

Two collisions, both of which make the editor unusable rather than merely odd:

- `GUI.getInputElement()` decides whether the user is typing, and the console,
  the layer control and the hit control all consult it before acting on a key.
  It recognized `INPUT` and `contenteditable` but **not `TEXTAREA`**, so arrow
  keys would have changed layers instead of moving the caret. Widened to include
  it; there is no other textarea in the GUI, so nothing else is affected.
  `gui-undo.mjs` already knew about textareas, which is why Cmd-Z inside a
  session is text undo rather than model undo.
- Finishing a curve with Enter opens a session and focuses the textarea *within
  the same keystroke*, and the key's default action then typed a newline into
  the label that had just been created. `stopPropagation()` does not prevent
  that: the tool's handler now also calls `preventDefault()` on the keys it
  consumes.

### Hit region

A curved label's bounding box is mostly empty air, so bbox-based hit testing
does not work: during the spike, clicking the visual centre of a bowed label
landed on blank canvas and dismissed the session. Playwright refused to click
the element at all for the same reason, reporting that the parent `<svg>`
intercepted the event.

So while a session is open the label gets an **invisible thickened baseline** —
a transparent `<use>` of the label path stroked at about one em — so clicks near
the text position the caret instead of exiting. Mapshaper's existing hit test
resolves DOM event targets (`isSymbolNode()` in `gui-svg-hit.mjs`), which is
glyph-precise and therefore has the same gap for selection, not just editing.

A padded box over the label's bounds is added alongside it, which matters for
straight labels too: the natural gesture for putting the caret at the end of the
text lands just past the last glyph, and without the box a miss of one pixel
dismisses the session.

For the hit test to resolve a click on the region to the label, `isSymbolNode()`
requires a `data-id` on a `<g>` or `<text>`, so the region is a `<g>` carrying
the feature's id. That id is then ambiguous within the layer, and two things
follow: the region is inserted **after** the symbol node so document order still
finds the real symbol first, and the editor looks its nodes up with
`.mapshaper-svg-symbol[data-id="N"]` rather than by id alone.

The shapes must be painted `transparent` rather than `none`, since an unpainted
shape is not hit-testable; the baseline uses `pointer-events: stroke` so that it
follows the curve instead of claiming the area the curve encloses.

Because the region is wider than the glyphs, a click arriving from it can land
on no character at all: past the end of the text, or in the empty air a bowed
label's box encloses. **The caret goes to the nearer end of the text** rather
than staying where it was, which is the answer a click that is plainly pointing
at one end of a label wants. The end of the text is the end of the last
character the engine laid out, not the last character there is, so an
overflowing path label sends the caret to the end of what is visible.

The walk up from the event target has to pass through the region's tags, and
`getSymbolNode()` stops at the first tag not in its list. `<use>` was not in it,
so the thickened baseline — the half of the region that lies along the curve —
swallowed clicks and resolved them to no feature: the caret stayed where it was
anywhere near the curve, while a click higher up the glyphs landed on the
region's rectangle and worked. Being one of two shapes covering the same label
is what made it look like a geometry bug rather than a missing tag.

### Ghosting the curve

A path label open for editing also shows **a faint copy of the curve its text
is set along**, in the same violet as the guide drawn while the path was being
placed. Without it the only evidence of the path is the shape of the text
itself, which says nothing about where the text can still go — and on a label
that has just been placed, before a character is typed, there is nothing on
screen at all.

It costs one element, because the same `<defs>` path the `<textPath>`
references can simply be stroked: a `<use href="#...">` in the overlay, exactly
like the invisible thickened baseline the hit region already uses. Taking the
path from the same place as the text means the ghost cannot drift from it.

The ghost **replaces the edit box** on a path label rather than joining it.
The box exists to show where a label is while it is still empty, which is the
same job; and a rectangle around curved text encloses mostly empty air, so the
two together are noisier than either alone. An anchored label still gets the
box, having no curve to show. The invisible hit region is unaffected — it keeps
both its rectangle and its thickened baseline, because forgiving clicks near
the text is a separate concern from showing the user where the label is.

### Z-order, and following the map

Selection highlight must paint **beneath** the glyphs and the caret **above**
them, so the overlay needs two groups: one inserted before the text and one
after. A single overlay group draws the highlight over the text and obscures it.

Both groups are siblings of the label's symbol node and **wear a copy of its
`transform`**, so the overlay is drawn in the label's own coordinate space — the
space the character position APIs report in — and pans and zooms with the label
for free, including being hidden with it when it leaves the view.

The catch is that a map redraw replaces the layer's markup wholesale, taking the
overlay and the text node with it. So the editor rebuilds on `map_rendered`:
it finds its nodes again and writes the in-progress text back into the fresh
ones. This is the textarea being the model of record doing real work rather than
being a slogan — the data still holds the old text, and a redraw mid-session
would otherwise revert what the user has typed.

## Interaction Model

### Mode registration

The GUI has two parallel mode systems and a new tool must register with both:

- **Interaction mode** `label` in `gui-interaction-mode-control.mjs`: add to the
  `labels` label lookup and the constraint helpers `modeUsesHitDetection`,
  `modeUsesPopup`, `modeSupportsUndo` and `modeWorksWithConsole`. Because the
  tool can act on any target — creating a point layer when the target is a
  polygon, polyline or non-label point layer — the mode must appear in **every**
  per-geometry menu array, not just `labels`.
- **GUI mode** `label_tool` via `gui.addMode()`, entered from an
  `interaction_mode_change` listener, following `drawing_tool` in
  `gui-draw-lines2.mjs`.

The existing `labels` interaction mode ("position labels", drag to set
`dx`/`dy`) and `label_style` mode were **kept** while the new tool was
incomplete, so that there was a working fallback and so that the new mode could
be checked against the old ones' unchanged behavior.

**`label_style` is now retired for label layers.** It was never in a mode menu
under its own name: it was reached by asking for point styling on a layer whose
points are labels, which `PointStyleTool.turnOn()` redirected to the shared
style panel. That is a subset of what the label tool offers — the same panel,
without the toolbar, the creation gestures, the selection or the text editor —
so the `labels` menu no longer offers `point_style`, and the three redirects
into it are gone:

- the `labels` menu in `gui-interaction-mode-control.mjs` drops `point_style`
  and `edit_points`, along with the `getModeLabel()` special case that renamed
  `point_style` to "style labels" for these layers;
- the layer's own menu in `gui-layer-control.mjs` says **"edit labels"** and
  enters `label` mode, rather than "style layer" into the point style panel.
  The name comes from the caller (`styleLayerName`), because the context menu
  item is otherwise named for styling;
- the **Create** button in the point style panel, which turns a field into
  labels, now enters `label` mode on the layer it just labelled instead of
  opening the style panel alone.

`edit_points` went with it because the label tool moves an anchored label by
dragging its marker. The one thing it had that the label tool did not was
**deleting a feature** from its context menu, so the label tool now offers
**"delete label"** on a right-click:

- the tool opens the menu itself, as the drawing modes do (and `label` joins
  them in the list `gui-inspection-control.mjs` skips), because deleting has to
  go through `getLabelDeleteCommand()` like every other edit the tool makes.
  The inspection control's generic item mutates the layer in place, which would
  leave the deletion out of the session history;
- the label being right-clicked is normally `e.id`, but a label open for typing
  is not a hit target — its own overlay is in front of it — so the session
  answers for it through `clickIsOnEditedLabel()`, the same test a click inside
  the text uses;
- `LabelEditor.cancel()` ends a session without committing, for a label that is
  about to stop existing. Committing would save text to a doomed feature, or —
  if the text had been emptied — delete the feature itself and leave the
  caller's delete pointed at whichever label moved up into the gap;
- the context menu refuses the focus change on mousedown while the editor's
  textarea has focus. The blur would otherwise end the session *before* the
  menu item's handler ran, which put a `-style` command in the history ahead of
  the `-filter` that deleted the label.

A right-click also says "delete label" rather than "delete point" on any label
layer, wherever the menu is opened from.

Emptying a label's text still removes it too, which is what `commit()` does
when a session ends with no glyphs left.

`labels` ("position labels") has nothing left that the label tool cannot do —
its drag against a fixed anchor is the Draggable mode below — so it can go
whenever its removal is worth the churn. See "The tool takes over positioning".

Two places still branch on the mode to hold that line: `selectStyleFeature()`
gives label mode its own plain-click rule, and the yellow halo is applied only
outside label mode. Both branches go away with `labels`.

`HitControl`'s mode gates (`selectable()`, `draggable()`, `clickable()`,
`eventIsEnabled()`) need explicit entries for the new mode; it needs both drag
(moving anchors and knots) and click (selecting and entering edit).

### The tool takes over positioning

*Built.* The one thing `labels` did that the label tool could not was offset a
label's text from a **fixed** anchor. The tool's drags moved the anchor itself
and the nine-position grid reached nine places around it, so there was no way to
nudge a name clear of the river it collided with.

This lands alongside a reorganization of the panel into **Text**, **Icon**,
**Label position** and **Saved styles** sections; only the position part is
specified here. One control the reorganization must not lose: the **deselect**
link, which is how a selection is given up in favour of styling the next label.

The preset **Delete** button is not on that list: it goes on purpose, and
deletion moves into the apply menu. See "Saved styles is an apply menu, not a
selection".

#### Fixed and Draggable

**The Position row has a two-segment toggle, `Fixed | Draggable`, and the
nine-position grid stays live in both.** The names say what a drag on a label
does:

- **Fixed** — the text is fixed to its anchor, so dragging the label moves
  anchor and text together. That is the `-update-label` gesture the tool
  already has.
- **Draggable** — the text comes off its anchor. Dragging the glyphs sets the
  offset; dragging the symbol at the anchor still moves the anchor.

The toggle is therefore not a safety catch. It is which of two meanings a drag
on the glyphs carries, a question that has to be answered somewhere, and
answering it with a mode rather than by hit-priority is what keeps a centred
label — whose text sits on top of its own anchor — grabbable at all.

The grid staying live is what makes the toggle cheap: **clicking a position is
the way back**, since `-style label-pos=…` clears `dx`, `dy` and `text-anchor`
on its own. Switching modes changes no data in either direction.

An earlier version was `Preset | Freeform`, where freeform replaced the grid
with `x`/`y` steppers. It had to decide what switching back did to a label that
had been dragged — snap to the nearest of the nine — which meant a helper to
compute the nearest and a mode switch that moved labels. None of that is needed
now.

#### The mode belongs to the tool, not to the label

Which segment is lit cannot be derived from the record. A label with
`label-pos=ne` can sit in either mode, and one that has been dragged stays
dragged when the toggle goes back to Fixed. That is deliberate: a per-label
"locked" flag would be a field nothing else reads and one more column in
`-o out.csv`.

Three consequences:

- it is excluded from `NEW_LABEL_STYLE_FIELDS` and from what
  `StylePresetControl` saves, or a saved style would carry a pointer mode around
  with it;
- it defaults to **Fixed** when the tool opens, so a stray drag cannot displace
  text in a session that never asked for it, and is remembered while the tool
  stays on;
- it governs the text's offset from its anchor and nothing else. Anchor drags
  and a path label's knot drags are unaffected — "Draggable" is not a general
  lock.

It will also *look* per-label, sitting in a panel whose every other control
writes a property to the selection. Styling it as a tool control rather than as
a value is the mitigation.

#### The grid needs a symbol at the anchor

**The nine positions place text around something, so with nothing drawn at the
anchor the grid is locked to the centre cell.** There is no answer to
"north-east of what?", and `c` is already what `-add-label` gives a new label.

The test is whether the feature draws a symbol, not whether it has an `icon`:

```js
// svg-symbols.mjs
if (featureHasSvgSymbol(rec)) children.push(renderSymbol(rec));
if (featureHasLabel(rec)) children.push(renderStyledLabel(rec));
```

`renderSymbol()` draws an `svg-symbol`, an `icon`, or a plain circle for
`r > 0`, and `featureHasSvgSymbol()` covers all three. Keying the gate on `icon`
alone would lock the commonest labels in the app to the centre of their own
dots: the point panel's **Create labels** button runs
`-style label-text=<expr>` on the layer in front of you, so a styled dots layer
keeps its `r` and `fill` and gains label text.

With a symbol present the centre cell stops being the default but **stays
clickable**. Text over its own symbol is a real thing to ask for — a number
inside a hollow `ring`, a letter on a `square` — and `dominant-baseline` is in
the vocabulary to make it sit right. Disabling the cell would foreclose that to
save a user from a mistake they may not be making, so gaining a symbol changes
which position a label is *given* and never takes one away.

**Dragging is not gated on a symbol.** A labels layer whose dots live in a
*different* layer — the usual way to give symbol and text unrelated styling —
has nothing at its anchors and still needs its text placed. Those labels get
the centre cell and Draggable.

A label that arrives in a state this would not have produced — `label-pos=ne`
with no symbol, or `dx`/`dy` from the legacy mode — is shown as it is, with the
grid live. The rule is a default and a guard, not an invariant: a panel that
refuses to display what is in the record is what "a position is stored as a
position" was getting away from.

#### The anchor ring goes, with one exception

The selection cue draws a ring on the anchor of any label with no `icon`. Under
these rules that is redundant almost everywhere — a label with no symbol is
centred, so its anchor is under the glyphs and the selection box already says
where it is, and a label with a symbol has the symbol.

It stays for one combination: **selected, offset, and nothing drawn at the
anchor.** There the ring is the only thing that says what the text hangs off,
and the only handle for moving the anchor.

So the `!rec.icon` test in `gui-label-selection.mjs` narrows rather than
disappears, and `ANCHOR_RADIUS` and `.label-cue-anchor` stay. What does go is
the ring's role as the general anchor handle: `hoverAnchor()` in the browser
tests, and the test that moves a label by dragging its anchor marker, move to
dragging the glyphs in Fixed mode.

#### Alignment and the grid both write `text-anchor`

The reorganized panel's Text section has an alignment control, and `label-pos`
resolves to `dx`, `dy` *and* `text-anchor`. Setting a position clears all three:

```
$ mapshaper -i labels.json -style dx=12 dy=-4 -style label-pos=s -o format=csv
label-text,label-pos,dx,dy,text-anchor
Reno,s,,,
```

So the two controls fight. Picking a position visibly resets the alignment, and
setting alignment by hand overrides the position's justification — leaving
`label-pos=e` with `text-anchor=end`, text running back across the icon it was
placed beside.

**Alignment stays live whatever is selected, including nothing.** It was
gated at first — enabled only where it is independent of position, meaning
multi-line labels, where it is how the lines line up with each other, and path
labels, where it pairs with `label-start-offset` — on the grounds that for a
single-line anchored label "which side of the dot" is the position's question
and the grid answers it.

That reserved the control for labels that already have a second line, and a
style is normally chosen *before* the text is typed: with the gate on, nothing
selected meant nothing to align, so left-aligned could not be chosen and then
written into. Choosing an alignment and then typing two lines has to work, and
the same goes for setting it ahead of a path label.

What the gate protected against remains true and is now the user's to make:
setting alignment by hand overrides the position's justification, and
`label-pos=e` with `text-anchor=end` runs the text back across the icon it was
placed beside. It is visible on the map as soon as it happens, and picking a
position clears it again.

The buttons show the alignment the labels are **drawn** with, not the one they
carry: with no `text-anchor` of their own they take the one their position
implies, and with no position either they take the SVG default, `start`. A
control with nothing selected would be saying "no alignment" about text that is
plainly aligned one way or another — and it made the first click on the button
already in effect look like a change that did nothing.

#### What a drag writes

- **All three properties, not a delta.** `resolveLabelPosition()` falls back per
  property rather than summing, so `label-pos=e dx=3` means "east's `dy` and
  justification, with `dx` overridden to 3px" and not "3px east of east". A drag
  materializes the resolved `dx`, `dy` and `text-anchor`, adds its delta to
  those, and clears `label-pos` — what `prepareRecordForDrag()` does today.
  Storing a bare delta instead would teleport the text to its anchor on the
  first pixel of movement.
- **In pixels**, matching the legacy mode. The cost, accepted: a materialized
  offset stops tracking font size, so resizing the text afterwards moves it
  relative to its anchor. Ems would keep that relationship, at the price of a
  conversion in everything that touches an offset.
- `text-anchor` follows the text across its anchor, as `autoUpdateTextAnchor()`
  does now, so the justification still matches which side the text is on when
  the export font is not the browser's.
- **One `-style` per gesture**, run on release: a drag is one undo step and one
  line of session history, the granularity `commitKnotDrag()` already uses for
  a knot.
- **Only the label under the pointer moves**, even with several selected.
  `-style` writes one value to every id it is given, so a group drag would set
  them all to the same absolute offset instead of nudging each by its own delta;
  a relative group nudge needs `-each` and is out of scope.
- A hairline from the anchor to the text box while dragging, in the selection
  colour — `LabelSelection.setTether()`, clamped to the edge of the box so that
  it stops at the text rather than crossing it. The offset is what is being
  edited, and the legacy mode drew nothing to show it.

The panel shows **no `x`/`y` values** for a dragged label: the map is the
readout. What that costs is precise and keyboard-reachable adjustment, which an
arrow-key nudge on a selected label recovers — outside a typing session, where
the arrows move the caret. And the grid, which has no cell lit once a label has
been dragged, draws the **nearest position faintly**: it says roughly where the
label belongs, and marks the cell that puts it back. Nearest is measured
between text centres rather than between offsets, because `dx=-5` is on
opposite sides of the anchor depending on the justification it is paired with —
`getTextCentreOffset()` is what makes two offsets comparable.

Three pieces carry it, and the arithmetic is in the two that have unit tests:

- `getDrawnLabelOffset()` in `svg-labels.mjs` materializes the offsets, in px,
  through the renderer's own `resolveLabelPosition()`. Reimplementing the
  fallbacks in the GUI is what would make the text jump on the first pixel of a
  drag the moment the two drifted apart.
- `gui-label-offset.mjs` holds the drag math: `getOffsetDragValues()`,
  `getAnchorForCentre()`, `getTextCentreOffset()` and `getNearestPosition()`,
  with no DOM or model in sight.
- `getLabelOffsetCommand()` in `gui-label-commands.mjs` writes the one `-style`
  on release. In between, `previewOffset()` moves the `x`, `y` and
  `text-anchor` attributes of the drawn label directly, the same way a path
  label's slide previews itself.

**A label that carries a `label-align` keeps it, and the drag writes
`text-anchor=start`.** The alignment has already answered the justification
question — the renderer honours it over any `text-anchor` and corrects `x` by
the block's width to hold the text still while its lines re-justify — so
`start` is both the anchor whose `dx` is the left edge itself and the value that
would leave the label where it is if the alignment were later removed.

A drag works in the label's own coordinate space, inside its symbol group,
which is what `dx` and `dy` are measured in: pointer movement is divided by the
symbol scale on the way in, or a drag would overshoot at any scale but 1.

#### `-style` learns to unset a property

A drag has to clear `label-pos` and cannot: an empty value is rejected rather
than read as "remove this".

```
$ mapshaper -i labels.json -style label-pos= -o out.csv
Error: [style] Unexpected value for label-pos:
$ mapshaper -i labels.json -style dx= -o out.csv
Error: [style] Unexpected value for dx:
```

(The legacy mode never met this, because `prepareRecordForDrag()` mutates the
record instead of running a command — which is what the GUI guardrails say an
edit should not do.)

**Decided: an empty value unsets the property.** It is consistent with what
clearing already writes, since `-style label-pos=s` leaves `dx`, `dy` and
`text-anchor` undefined rather than zero, and it gives the CLI a per-property
unset next to `-style clear`, which can only clear all of them at once.

**Implemented** as `emptyValueUnsetsProperty()` in `svg-properties.mjs`, which
is true for a property whose type rule has no empty value to store — a number,
a colour, a measure, a label position. It is deliberately not "every typed
property": `css` is typed `inlinecss` and that type accepts any string, so
`css=` goes on storing an empty value rather than quietly changing meaning. A
property with no type rule at all takes any string as a literal, so it keeps
storing one too.

Removing a position is not setting one, so `label-pos=` neither validates the
value it was not given nor clears the offsets a position would have stood for.
That is what lets one command say "stop taking a position, carry these offsets
instead": `-style label-pos= dx=12 dy=-4 text-anchor=start`.

The panel's readout does not depend on it. The lit cell is decided by the
offsets first — any `dx`/`dy` means no cell is lit, whatever `label-pos` says —
so a record written anywhere else cannot make the grid lie.

#### Turning the icon off and on

Both transitions change which positions are legal, so both are commands and
both are one undo step.

- **Icon on**: the centre cell stops being the default, and a label sitting
  there moves to `ne` — upper right, the conventional first choice for a point
  label, and the position a cartographer would have to undo least often.
- **Icon off**: the grid locks back to centre and the offsets go with it, so a
  hand-placed label loses its placement. That makes the icon toggle
  destructive; being one undoable command is what makes it acceptable.

This is what `labels` was still needed for, so retiring that mode is now only a
removal: the two branches above go with it — `selectStyleFeature()`'s
label-mode click rule and the halo condition — along with
`prepareRecordForDrag()`, which mutates a record instead of running a command.

### Sliding and flipping are drags, not controls

A path label needs two things placed that an anchored one does not: where its
text starts along the curve, and which side of the curve it sits on. Both are
**drags on the text** rather than panel controls — the Illustrator model, where
the brackets on type-on-a-path are dragged along and across it.

The gesture was free to take. Only a selected label draws handles and only a
handle took a drag, with everything else over a label falling through so that
the map still pans. The glyphs of a *selected* path label are now a handle as
well — `findDraggableText()` in `gui-label-tool2.mjs`, which answers with a
feature id only when the label under the pointer is in the selection and has
more than one knot. Keeping it to selected labels is what leaves the map
pannable with the pointer over a curved label the user has not picked up, and
keeping it to path labels leaves the anchored ones to the Fixed/Draggable
gesture, the same split `getStyleFields()` and `shapeIsPathLabel()` already
make. A knot handle under the pointer outranks the glyphs: both are grabbable,
and the knot is the smaller target.

Like the knot handles, what the drag takes hold of is found **on hover** rather
than at `dragstart`. For a knot that is because the pointer has already moved
off the handle by the time the drag begins; here it decides the *side* as well,
and the first mouse move of a drag away from the glyphs has usually crossed the
curve already. Measured from there, the pointer would begin the drag on the far
side and a flip could never happen — which is exactly what it did until
`beginTextDrag()` started projecting the last hovered position instead.

**Along the curve → `label-start-offset`.** The pointer is projected onto the
curve, flattened once at the start of the drag (`projectOntoPolyline()` in
`gui-label-path-drag.mjs`), and the arc-length fraction is written as a
percentage. A percentage rather than a length so that editing the curve or the
font afterwards cannot push the text off the end, and clamped to 0–100% — an
offset in range is still no guarantee that the text *fits*, which is what the
fit states report.

The offset moves **with** the pointer rather than to it: the drag records where
the label's offset was and how far along the curve the pointer was, and adds
the difference. Grabbing a label by its last word would otherwise jerk its
anchor under the pointer on the first move. That needs a starting offset, and
the label usually has none to give — a label this tool placed is where its
`text-anchor` puts it and carries no offset at all — so `getStartOffsetPct()`
falls back to the same default the renderer uses. A value that is *there* but
not a percentage is the third case: a length cannot be turned into a fraction
without knowing the curve's length in the units it is written in, so the
pointer's own position stands in and the first move picks the text up.

This is also why an alignment control is not made redundant by the drag.
`getDefaultStartOffset()` derives `0%`, `50%` or `100%` from `text-anchor`, so
the offset is where the text's **anchor** sits on the curve and alignment
chooses which part of the text lands there — Illustrator's centre bracket and
its paragraph alignment, the same division.

**Across the curve → reverse the knots**, rather than writing `label-side`; see
"Alignment properties" for why that attribute is unusable in a browser. The
reversal goes through `-update-label`, which `commitKnotDrag()` already uses to
rewrite a label's whole knot list, so a flip is one command and one undo step.

It has to carry the along-path placement with it, or the text jumps to the far
end of the curve as it flips:

- `label-start-offset` becomes `100%` minus itself. A length would have to be
  measured against the curve length to be flipped, which is a second reason the
  drag writes percentages.
- `text-anchor` swaps `start` and `end`, and `middle` is left alone.

The two are one gesture, not two: the pointer's projection onto the curve gives
the offset, and the sign of the cross product of the curve tangent with the
pointer's offset from it gives the side. Which sign means which side does not
matter, because the only question asked of it is whether the pointer is still
on the side it started from. Crossing the curve mid-drag flips the preview, and
the release commits whatever is showing.

Both commands go in **one command string**, which the console runs as a single
transaction: `-style label-start-offset=… [text-anchor=…] ids=N` for the
placement, followed by `-update-label ids=N coordinates=…` when the knots have
turned around. That makes a flip one undo step and one line of session history,
and leaves no state in which the knots have reversed but the text has not. A
slide is the `-style` alone. `text-anchor` is written only when the flip
actually changes it, so a centred label — whose anchor is its own opposite —
does not gain a column for a property it never had.

**The preview is three attributes, not a redraw.** A knot drag rebuilds the
symbol layer on every mouse move because it changes the baseline; this one
leaves the curve exactly where it is and changes only where the text sits on it
and which way it runs. So `previewTextPlacement()` writes `startOffset` on the
`<textPath>`, `text-anchor` on the `<text>`, and — for a flip — the reversed
`d` on the `<defs>` path the label shares with its selection cue, and the
browser re-lays the glyphs out from those alone. The data is not touched at
all, which is a second difference from the knot drag: that one previews by
swapping a copy of the knots into the display shapes, which the data layer can
share, so it has to roll that back before the command runs or undo gets a step
that undoes nothing.

**This preview is not rolled back on release**, and that is a correction: it
was, at first, by symmetry with the knot drag. But the knot drag's rollback is
invisible — swapping the knots back does not ask for a redraw, so nothing
changes on screen until the command's own redraw arrives — whereas here the
preview *is* the rendered markup, and putting the old attributes back drew the
label at its old offset for the frame or two before the command landed. That
read as the text flashing somewhere else along the curve on every release.
Sampling `startOffset` per animation frame across a release showed it exactly:
two frames at the pre-drag value between the drag and the redraw. Since the
preview never touched the data there is nothing to take back, so the rollback
is now reached only from the command's error path — the one case where no
redraw comes to replace what the drag drew.

The reversed path is built by reversing the **coordinates** rather than the
knots, so that it keeps the origin its symbol group is translated to — the
first knot. The committed version stores the knots the other way round and
translates to the other end, and renders identically. That it renders
identically at all is a property of the fit: Hobby's curl conditions are the
same at both ends of a run, so reversing the knots draws the same curve
backwards (`test/curve-fit-test.mjs`, 'reversal').

**Discoverability is what this costs.** Nobody guesses that text is dragged
across its own curve, and there are no brackets drawn to suggest it. So **flip
to other side of path** is in the right-click menu too, where "delete label"
already lives; `getFlipAction()` builds the same command the drag does, from
the label's stored placement rather than from a pointer. It is offered on a
path label that is not being typed into — during a text session the text is in
the editor rather than in the feature, and the command would rebuild the layer
underneath it.

The other mitigation this section proposed, ghosting the flipped baseline as
the pointer crosses, turned out to be unnecessary: a selected label already has
its curve stroked by the selection cue, and the text itself previews the flip,
so the gesture explains itself from the first move without a second curve being
drawn.

**A note on why the offset had to stop being reported as an error.** A style
value with no type rule is guessed at: if it looks like it might be an
expression it is compiled, and a compile or runtime failure means it was a
literal after all. The guess was being *reported* — `stop()` prints in the CLI
and opens an alert in the GUI — so a dragged offset of `59.77%` put an error
popup on screen over a placement that had in fact been applied. (Any style
value containing a `.` or a `-` did: a label typed as "Saint-Denis" too.)
`parseStyleExpression()` now compiles with `quiet`, which makes the expression
compiler throw instead of reporting, since the answer to a question is not an
error.

### Curvature tool state machine

```
idle
  click on empty map      -> creating: first knot placed
  click on a label        -> label selected for styling
  click on the selected label -> editing text (see above)
creating
  pointer moves           -> refit through the knots and the pointer
  click                   -> append knot, refit, redraw preview
  click / double-click on a placed knot -> nothing
  drag a placed knot      -> move knot, refit
  Enter / Escape / dblclick in space -> finish
  Backspace               -> remove last knot
finish
  >= 2 knots -> emit -curve
  <  2 knots -> discard
```

Preview during `creating` is drawn on an ephemeral overlay, so an abandoned
curve leaves no trace in the data model, no undo entry and no history entry.

The far end of that preview follows the pointer: the curve is fitted through
the knots placed so far **plus the pointer's current position**, so the user
sees the curve a click is about to commit to rather than inferring it. The
pointer is not a knot and gets no handle — a handle is something to grab, and
that one would move away — and it is held apart from the knots, so finishing
the curve commits only what was clicked. Leaving the map drops the preview back
to the placed knots rather than finishing the curve, since a pointer that has
gone to the toolbar has not said anything about where the path ends. This is
why label mode enables `hover` events (`eventIsEnabled()`), and why it is the
one label-mode event that does not stop propagation — the tool is watching the
pointer, not consuming it. Each pointer move redraws at the `'hover'` level,
which leaves the SVG markup and its transforms alone, so the selection cues
anchored to them survive and are not rebuilt.

Knots are held in the map's **display coordinates** rather than in pixels, so
that a half-drawn curve stays where the user put it across a pan or a zoom, and
so that the preview and the guide share one space. They are converted to the
layer's own coordinates once, when the command is emitted, with
`translateDisplayPoint()`. The consequence for the state machine is that its
distance thresholds are the caller's to supply: the tool scales its pixel
thresholds by `ext.getPixelSize()` so that clicking feels the same at every
zoom.

**Reading the gestures is subtler than the table suggests**, because a
double-click is delivered as two `click` events and then a `dblclick`, and both
handlers see the same position. Two rules follow, and both were bugs before they
were rules:

- A click on a knot that is already placed must not add another one on top of
  it, which would give the fitter a zero-length chord to find a direction along
  and drew a stray branch from the end of the curve back to that point.
  Guarding only against the knot just placed is not enough; the pointer going
  back to an earlier knot would otherwise leave the duplicate.
- A double-click **finishes** the curve only if the knot under the pointer is
  the one this gesture just placed, or there is no knot under it at all.
  Otherwise the ordinary finishing gesture — double-clicking past the end of
  the curve — would be read as a double-click on a knot, since its own opening
  click puts one there.

So the curve state carries `justPlaced`, the knot the current gesture placed, and
the two decisions live in `handleClick()` and `getDblclickAction()` in
`gui-label-curve-state.mjs` as pure functions over that state, where they are
unit-tested directly.

A double-click on a knot that was already there does **nothing**. It used to
toggle the knot into a corner, which is the gesture Illustrator uses and the
reason `justPlaced` exists; with corners gone (see "No corners") the gesture is
unassigned. It is inert rather than finishing because it cannot place a knot —
one is in the way — so finishing on it would end the curve somewhere other than
where the pointer was when the gesture began.

### Toolbar And Panel

The tool's controls are split across two surfaces, because creation and
typography differ both in kind and in when they are used.

**Creation lives in the floating toolbar.** The two creation controls go in
`FloatingToolbar` (`gui-floating-toolbar.mjs`) at bottom-centre, alongside
undo/redo in `EditToolbar` — it already supports a stack of per-mode toolbars
and its header comment anticipates this use.

They are a **sub-tool toggle, not an action**: pressing "new path label" arms
the curvature tool, and the label is created by the map clicks that follow.
Because they are icon buttons, `addButton(iconRef)` hosts them as-is and no
content-slot API is needed; the one addition required was a `selected` state on
`ToolbarButton`, which had only `setEnabled()`.

They cannot go in the style panel, for two reasons that are easy to miss:

- The panel is **gated on the active layer already having labels**, and clears
  the mode when that stops being true (`updateVisibility()` and
  `activeLayerHasLabels()` in `gui-label-tool.mjs`). By the target rules above
  the tool must work when the target is a polygon layer and no label layer
  exists yet — exactly when the panel is hidden. Creation buttons there would
  be unavailable precisely when they are needed.
- The panel is **dismissible**, via the `×` in its header. Mode-level controls
  should not be reachable only through something the user can close.

#### What the tool is armed with on entry

Entering the mode on a layer with **no labels on it** arms the anchored tool. On
such a layer the only thing the tool can do is place a label — there is nothing
to select, restyle or type into — so leaving it disarmed makes the first click
do nothing and says nothing about what to do instead. An empty label layer
counts as having none: the field is there, but there is still nothing to click.

Entering on a layer that **already has labels** leaves it idle, because arming
would make the first click place a label beside the one the user meant to click.

The cursor is a crosshair while a click would place something, and not while it
would land on a label instead — the same rule, and the same class-on-`.map-layers`
mechanism (`.map-layers.label-tool`), as the point tool's add cursor. The hit
control's own `.symbol-hit` rule then supplies the pointer over a label, which
is the honest cue: a click there takes hold of it rather than placing anything.

**Typography and alignment live in the existing panel.** Despite its name the
label style menu is not a sidebar: it is a floating panel pinned over the map
(`.label-style-panel.text-style-panel`, `position: absolute; top: 6px; right:
36px` inside `.mshp-main-map`), which is already the right relationship to the
map for in-place editing.

Its controls are reused rather than rebuilt: the font family and style selects,
the size stepper, the `ColorPicker` wiring and the position grid in
`gui-label-tool.mjs`, plus `StylePresetControl` for saved styles. Alignment
buttons are new, and write `text-anchor`: on an anchored label that is which
way multi-line text lines up, and on a path label it chooses which part of the
text sits at the point the label was slid to. The two properties that place a
label on its curve are not in the panel at all — see "Sliding and flipping are
drags, not controls".

**Implemented** as three headed sections in place of the flat stack, in this
order:

| Section | Rows |
|---|---|
| Text | Font; Font style + Size; Color + Opacity; *(empty)* + Letter spacing; Alignment + Line height; Inline CSS |
| Icon | Shape + Size; Color + Opacity |
| Label position | the 3×3 grid |

Text and Icon are deliberately the same shape — a size on one line, a colour
and its opacity on the next — so that the second reads as a variation on the
first rather than as a different kind of control. Letter spacing and line
height stack in the right column, which groups the two spacing values and
leaves the left of the second row to the alignment buttons; the cell beside
letter spacing is empty.

**Every split row has the same two columns**: a wide one and a narrow one, the
widths fixed for the panel (`1fr var(--label-split-b-width)`) rather than each
row sizing its right column to whatever it happens to hold. The panel is a
stack of these pairs, and sizing them a row at a time leaves every field edge
in a slightly different place. Each control then fills its column instead of
keeping a width of its own, and the cells are bottom-aligned, so a caption over
one control cannot push it out of line with the control beside it — the icon
size has "Size" above it and the shape buttons next to it have nothing, and the
two still have to be level. Everything in a row is the same height, which means
`box-sizing: border-box` on the bordered boxes as well as the fields.

The panel went from 185px to 216px because of those pairs: at 185px the narrow
column is narrower than its own caption, and "Letter spacing" was clipped. The
other style panels are stacks of pairs too, and took the same width when they
were redrawn. It covers more of the map, which is what broke
three browser tests — they clicked "empty map" at a point the panel had grown
over, and the click landed on *Save*, whose prompt then swallowed
everything the test did next. `clickMap()` now refuses a point inside the
panel's box and says so, rather than failing thirty seconds later somewhere
else.

**Most of the Text section carries no label.** A font name, a hex colour, a
percentage and a size beside a font style each say what they are, and a column
of captions above controls that do not need them is the panel's noisiest
feature. The fields that would otherwise be bare numbers — letter spacing, line
height, the icon's size — keep theirs, and every unlabelled control has a
`title` for the case where the contents are not enough.

The font select says what it is through its contents rather than a caption: a
font name is self-describing, and the menu always shows one — see "The default
font is not a font" below.

##### The style menu is the font's own faces

The style select had a "Default style" entry of its own beside the faces, and
showed it for a label carrying no `font-style` or `font-weight` — which is most
labels. It named a face the user could not see and mapshaper could not measure,
and it sat in the list as if it were a fifth face of a four-face font.

The faces are what the menu holds now, and nothing else:

- **No font, no menu.** A face belongs to a font, so with no `font-family` to
  list the faces of, the select is empty and disabled.
- **A font is always set in something**, so a font that is chosen always shows
  a face. Regular is that face: `normal 400` is what a font renders as when
  nothing says otherwise, and every font the detector finds more than one
  weight in has it. A font with no Regular shows the nearest face it does have.
- **Regular is stored as no face at all**, the same way full opacity is stored
  as no opacity: writing `font-style=normal font-weight=400` onto every label
  the panel has touched would be a column of defaults in the user's table.
- **A change of font carries the face across.** A label in Bold Italic is in
  Bold Italic after the font changes, or in the nearest face the new font is
  installed with. Both properties go in one command, so the change is one undo
  step and the label is never briefly in a face the font does not have.
- **A selection that disagrees shows nothing selected**, rather than the first
  face, which is how the rest of the panel reads an empty common value. The
  list stays live, so picking a face is how the selection is brought into line.

`getNearestVariant()` in `gui-label-fonts.mjs` does the matching, over the
variant list the detector builds: upright before oblique, then the nearest
weight, and a tie to the heavier. Slant is the more visible of the two and the
one a user chose on purpose, so a Light Italic asked for in a font with no
italic is better answered by Light than by Bold Italic.

Storing Regular as nothing needed `emptyValueUnsetsProperty()` widened. It was
true only for a property whose *type rule* has no empty value — a number, a
colour — and `font-weight` has no type rule at all, so `-style font-weight=`
stored an empty string. The rule is now the other way round: an empty value
unsets unless the empty string is a value, which it is for `css`, `class` and
`label-text` (empty for as long as it takes to type the first character) and
for nothing else. `-style icon=` stops leaving an empty name behind too.

##### The default font is not a font

"Default font" was what the font select showed for a label with no
`font-family`, and it named nothing. The map draws that label in whatever the
browser resolves `sans-serif` to — Helvetica on a Mac, Arial on Windows, DejaVu
Sans on most Linux — because `getLabelTextDefaults()` puts `font-family:
sans-serif` on the layer's `<g>` and the record overrides nothing.

Inside the GUI that is self-consistent: `measureLabelWidth()` renders into an
offscreen SVG under the same defaults, so the width behind `label-align` and
the path-fit check is a measurement of the face actually on screen. It stops
being self-consistent the moment the data leaves. A metrics reader needs a
family to find a file for, and `sans-serif` is not one: Node can only fall back
to guessing which installed family the platform would have resolved it to. And
an exported SVG that says `sans-serif` is opened somewhere that resolves it
differently, with every alignment shift and fit decision in it computed for a
face the viewer is not using.

**Decided: the tool names the font.** `getDefaultFontName()` works out which
installed family this browser's `sans-serif` actually is, the menu shows it by
name, and `-add-label` writes it onto every label the tool creates. The data
then says what it means, and any reader with the font can measure it.

**A new label gets the preferred font where the machine has it.**
`getNewLabelFontName()` answers `NYTFranklin` if it is installed and falls back
to `getDefaultFontName()` otherwise. The two are deliberately different
questions, and conflating them would be a bug:

- *What is this label drawn in?* — `getDefaultFontName()`. It has to be the
  truth about what is on screen, because it is also the name an unfonted label
  is given when it is styled. A preference here would rename a label to
  something it is not drawn in, which is a restyle by another route.
- *What should the next label be in?* — `getNewLabelFontName()`. A tool default
  like `label-pos=c`, applying only to a label that does not exist yet, so it
  is free to prefer a font that changes how the label looks.

The panel shows the first for a selection and the second for "new labels",
which is `getFontNameForTarget()` in `gui-label-tool.mjs`; choosing a face for
an existing unfonted label writes the first, since asking for Bold is not
asking for a different typeface.

- **Found by measuring, not by guessing from the platform.** The name is
  written onto the user's labels, so a wrong one would restyle them. Nothing
  is returned unless an installed family measures identically to the generic —
  same signature `detectFontStyleVariants()` uses, at normal 400 — in which
  case naming it cannot change how anything is drawn. If nothing matches, the
  function returns `''` and the panel behaves as it did before.
- **Metric-compatible families are tried in a fixed order**, Helvetica before
  Arial before Segoe UI, because the two were designed to measure the same and
  a signature match alone cannot tell a Mac's Helvetica from the Arial beside
  it. (Chromium on macOS does distinguish them through the bounding boxes, but
  the order is what makes that not matter.)
- **The pending label is drawn from the same style**, so committing it changes
  nothing on screen. `getStyleForNewLabel()` in `gui-label-tool2.mjs` is what
  both the preview and the `-add-label` command read.
- **The font is written at creation, not held in the tool's default style**,
  so that clearing the styles the user chose cannot also clear it.
- **A label that arrived without a font** — from the CLI, or from a file — is
  shown under the name of the font it is being drawn in, and is given that
  name when a face is chosen for it. A face belongs to a font, so that is the
  point at which the font stops being a guess about the machine it is opened
  on. Nothing is written just for selecting a label, and the name written is
  the font it is drawn in rather than the preferred font.
- **A font the menu does not list is added to it** rather than being replaced
  by an installed one: a project moves between machines, and the name is the
  user's data.

Labels made by the CLI still carry no font, and `getLabelTextDefaults()` still
says `sans-serif`: this is what the tool writes, not a new meaning for absence.

Behaviours in it that are not visible in the markup:

- **Full opacity is stored as no opacity at all.** The control writes
  `opacity=` — the unset — at 100%, rather than `opacity=1`. The property is
  what makes a label translucent, and a column of 1s on every label the panel
  has touched is noise in the user's table. The icon's opacity is the exception
  and is always written, for the reason in "The icon's opacity is its own
  property".
- **Blanking a spacing field removes the property**, which is the only way back
  to the renderer's own spacing once a value has been chosen. Line height shows
  `auto` as a placeholder rather than a value, so a label carries no
  `line-height` until one is asked for.

##### Whether a label has a symbol is a switch

The Icon heading carries a two-state switch, and the four shapes below it are
just the four shapes. The heading line also carries the caption over the size
field in the row beneath it, in that field's column: the shapes beside the
field have no caption of their own, and a caption over one control of a pair
pushes it out of line with the other. "None" was a fifth button in the row at first, which put
two questions in one control: whether the label has a symbol, and which symbol
it is. The switch answers the first, and its state is read from the data — a
symbol is on when the target has one — so it follows an undo without being told
to.

Everything under the switch is inert while it is off: an `icon-size` or
`icon-color` on a label with no `icon` draws nothing, so there is nothing for
those controls to do until a symbol exists. They keep *showing* their values
greyed rather than blanking, because what they show is what the symbol comes
back as. Two rules make switching off and on again non-destructive: the shape
that was chosen is the shape that returns (`lastIconShape`), and an
`icon-opacity` still stored on the label is taken back rather than reset to
full.

A selection where only *some* labels have a symbol counts as on. Off would be
the one state from which nothing in the section can be reached, and with the
switch on, turning it off removes every symbol in the selection and a shape
applies to all of them — both well-defined. This replaces an earlier rule where
styling a symbol that did not exist quietly created one: with the controls
gated, the switch is the only way to ask for a symbol, and it asks plainly.

##### How the controls are drawn

The panel's fields share one height, corner radius and border colour, set as
custom properties on `.label-style-panel` so that a select, a colour field, a
size field and a button group on the same row line up. Every style panel
carries that class, so the line, polygon and circle panels are drawn from the
same parts — see "The other style panels" below.

Three shapes carry most of it:

- **A colour field**: the swatch and its hex value inside one border
  (`.label-color-field`), because they are one answer to one question. The
  swatch keeps a light outline of its own so that white does not disappear into
  the field.
- **A button group**: buttons that answer one question share a border and sit
  flush (`.label-btn-group`), dividing the width of their cell — the four
  shapes, the three alignments. The selected one takes a grey fill rather than
  the inverse the panel's other buttons use: the glyph is what identifies the
  choice, and reversing it out makes the selected shape the hardest to read.
- **A stepper** inset inside the size field's right edge, a pair of triangles
  rather than `+` and `−`. What the buttons do is step to the next size, and
  arithmetic signs on a value that is often already at the end of its range
  read as a promise the control does not keep.

The position grid's nine cells are filled squares with the chosen one dark,
where they were bordered white boxes: a border on each would double the number
of lines in a control that is nothing but lines. Sections are separated by
whitespace and their headings alone — the rules that used to divide them were a
third answer to a question already settled twice.

Type follows the app's dialogs rather than being chosen for the panel: the
title is 17px like an `.info-box h3`, and the Text and Icon headings 15.5px
like an `h4` under one. A panel pinned over the map is read alongside the
menus, so it should be headed like them.

**One disabled look, applied to whole controls.** Left to themselves these
fade four different ways — a `<select>` takes the browser's grey, an input with
`-webkit-appearance: none` takes no styling at all, a widget built from divs
takes whatever it was given, and a group of buttons faded button by button
keeps the border they share at full strength around dead buttons. Every
control instead keeps its live colours and is faded as a whole, which fades its
border with it.

Nothing inside an already-faded control fades again. The parts still take their
own disabled state, because a disabled input cannot be typed into and a
disabled button cannot be pressed, but two 0.45s over each other is 0.2: the
size and colour fields are a wrapper around an input and were coming out half
the weight of the plain opacity input beside them. Every disabled control in
the panel now measures the same — `#333` text, `#bbb` border, faded once.

**Captions are two sizes down from the values they name.** They are read once,
when the panel is first met, and the narrow column of a split row is only as
wide as the longest of them. "Letter spacing" is what set that width: at 12px
it measures 71px, so the column is 74px and the panel 216px wide.

Two traps, both found by looking at the panel rather than reading it:

- **A grid track is at least as wide as its contents**, and a text input's
  contents are twenty characters whatever width it is given. Without
  `min-width: 0` on `.label-split-cell` the colour field pushed the opacity
  field beside it off the panel.
- **`-webkit-appearance: none` takes the browser's disabled styling with it**,
  so a disabled field looked exactly like a live one. The panel fades them by
  the same amount as its other inert widgets.

##### The other style panels

The line, polygon and circle panels are drawn from the same parts. They were
drawing the same controls three different ways, which is how three panels over
the same map came to look like three programs: a colour was a swatch inside a
field here and a button beside a text box there, a size was a field with a
stepper here and a value between a `−` and a `+` there, and a field was 22px
and round-cornered here and 19px and square there.

What they share is in `gui-panel-controls.mjs` — a section, a colour-and-its-
opacity row, an action button, a panel button — and in the CSS that is now
keyed on `.label-style-panel`, which every style panel carries. The label
panel keeps its own assembly of the colour field, because its two colours are
gated by the icon switch and drawn without captions, but the metrics, the
disabled look, the caption sizes and the split-row grid are one set of rules
for all four.

The layout follows from the pairs the other panels turn out to be made of:
Fill and its opacity, Stroke and its opacity, and for a circle, Stroke width
beside Radius. Every panel is 216px wide now, since every panel is a stack of
those pairs.

Two things worth knowing:

- **Stroke width is a `SizeField` stepping a ladder**, not the widget's own
  fixed increment: the useful widths are quarters of a pixel at the hairline
  end and whole pixels above 2. The ladder was already there behind the old
  `−`/`+`; what it needed was a field that could also be typed into. It also
  needs `decimals: 2`, because the field re-reads its own contents and the
  default rounding to a tenth turned an 0.25 hairline into 0.3 the next time
  anything on the circle was set.
- **`.hidden` is one class and the panel's rules are two.** A heading told to
  hide went on being laid out, because `.label-style-panel
  .label-style-section-title` sets `display: flex` and outranks it. The circle
  panel hides its Circles heading once the points are circles — the title says
  so, and the section is all that is left in the panel.

#### Visibility is derived, not toggled

The panel now has two callers: the old `label_style` entry point, which opens it
through its own `label_style_tool` GUI mode, and the label tool, which owns the
GUI mode itself and so cannot use `gui.enterMode()` for the panel. Either can end
while the other is still on, so `panelShouldBeVisible()` is recomputed from both
on every `mode` and `interaction_mode_change` event rather than each caller
toggling the panel directly. Registering the listener **after** `gui.addMode()`
is what makes `turnOff()` run first, so the recomputation sees final state.

Two behaviours change while label mode is on: the visibility gate widens from
`activeLayerHasLabels()` to "label mode is on", so the panel is up before any
label layer exists, and the `×` in its header is hidden, because closing it
would leave the tool half on.

#### What the controls act on, when nothing is selected

Outside label mode an empty selection means *every label on the layer*, which is
right for a styling mode entered deliberately. It is wrong while labels are
being placed: a click on a font control would restyle the whole layer. In label
mode `getTargetIds()` resolves in three steps instead, and the panel's status
line says which one it landed on so that the answer is never a guess:

1. **The label open for text editing**, if there is one — "this label".
2. **The selection**, if there is one — "*n* selected".
3. **Nothing**, which means the label about to be made — "new labels".

Case 1 outranks the others because of how labels are actually made. A label is
placed empty, and its font, colour and position are usually chosen *before*, or
instead of, any of its text — so the label with the caret in it is the one the
panel has to reach. Without this the panel is pointed at "the next label", the
one on screen stays unstyled, and the visible result of setting a style is that
the empty label disappears, because taking focus for the control ends the
session and an empty new label is not kept.

#### Keeping the caret while the panel is used

Styling a label is part of working on it, not leaving it, so the panel must not
end the session — and must leave the user able to carry on typing. Four rules
together:

- **The panel refuses focus it does not need.** Its position grid, size steps,
  icon buttons, colour swatches and presets are divs and spans, which take focus
  from the textarea on `mousedown` without wanting it. The panel calls
  `preventDefault()` for any `mousedown` that is not on a real form element,
  while a session is open, so for most of the panel the caret never moves and
  there is no blur to handle.
- **The editor ignores a blur into the panel.** The font menus and text inputs
  do need focus. The editor closes on blur as before unless the new focus
  target is inside `.text-style-panel`.
- **The panel hands focus back.** After a control sets a style, and after any
  click on the panel that is not in something the user is typing into, focus
  returns to the textarea, so "pick a font, keep typing" works.
- **With no session, it hands focus to nothing at all** — `releaseFocus()`
  blurs the control instead. A field that keeps focus keeps the keyboard, so
  the next Escape means "revert this field" when the user meant "deselect", and
  a gold focus ring sits over a value that was applied some time ago, which
  reads as a value still being edited.
- **A click on a `<select>` is the exception, and must leave focus alone.** A
  native menu is drawn by the OS and closes the instant its element is blurred,
  so handing the caret back on the click that *opened* the menu made the font
  menu flash open and shut. Only that click is skipped: every other way out of
  a menu still returns the caret, because any other control either sets a style
  (which restores focus through `applyStyleValues()`) or reaches the catch-all
  with itself as the click target. A menu dismissed with Escape and nothing else
  keeps the focus until the next panel click or click on the label, which is how
  a focused menu behaves anywhere.

While the caret is in one of the panel's fields **the keyboard belongs to that
field**, which the size fields did for themselves and the rest of the panel now
does in one handler. Without it a Backspace typed into a measure field takes
back the last knot of a curve being drawn, and an Escape disarms the tool
rather than leaving the field — silently, since the tool consumes the key
before the panel sees it. The cost is that a browser shortcut in a field, such
as undo, is the field's rather than the application's, which is what those
shortcuts mean in a text field anywhere else.

Enter and Escape are what finish with a field: Enter keeps what was typed, and
the field's own `change` handler applies it as focus leaves; Escape puts back
what the panel was showing, which is also what stops that handler from firing
on the way out. Both then release focus.

The rules that are not about the label being typed into live in
`gui-panel-focus.mjs` — `claimFieldKeys()` and `releasePanelFocus()` — because
the layer style panel has the same shape of controls and the same two
problems. It has nothing to hand the keyboard back to, so a field finished
with there gives it up altogether.

The session is published through `gui.state.label_text_session`
(`gui-label-style-state.mjs`): `{id, refocus, refresh}`, set when a session opens
and cleared when it closes, with a `label_text_session_change` event so the panel
can refresh. An `id` of `-1` means the label has no feature yet: the panel then
writes only the style for the next label — which *is* the label being typed into
— and calls `refresh` so the preview redraws with it. It is deliberately *only* the live session. An earlier arrangement
kept "the last label edited" (`edited_label`) alive past the end of its session,
precisely so that a panel click arriving after the blur would still find a
target, and the editor inferred panel clicks from `relatedTarget`. That left the
panel acting on a label the user had finished with. Keeping focus in the
textarea in the first place is what makes the shorter-lived state enough.

The style held there starts at a default rather than empty
(`DEFAULT_NEW_LABEL_STYLE`), and the only thing in it is `label-pos: 'c'`. A
label with no position sits with its baseline on its anchor point, which puts
the point at the foot of the text rather than in it: click a spot, type, and the
words appear above the place they are meant to be read as marking. Centred is
what clicking somewhere and typing looks like it should do, and it is the
position an icon is drawn to sit behind.

The tool defaults this, not the command: `-add-label` with no position still
creates a label without one, so a centred label is a choice this tool makes and
passes on explicitly. The panel reads the same state to decide which position
button is lit, so what it says the next label will get is what the next label
gets — which is the point of holding the pending style in one place.

**Styling a label that does not exist yet runs no command at all**, which is
what keeps an abandoned label free. Both the style and the text are held by the
session and written by the single `-add-label` that creates the label, so there
is nothing on the history to take back if the label is never created. An earlier
arrangement styled the empty feature immediately and unwound the history when
the session ended empty — which needed undo to be switched on, and quietly did
nothing when it was not.

**Whatever the panel is set to is also what the next label gets**, in both
cases. A value set through a control is recorded as the tool's default even when
it went to a selected label as well: the panel reads as the settings labels are
being made with, so a font chosen while one label is selected has to apply to
the next label placed. Without this, the default stopped following the panel the
moment the first label existed, and only the very first label of a session came
out styled.

Case 2 is what makes the panel useful before there is a label at all: pick a
font, then place labels in it. The values go into GUI state rather than into a
layer — there is no layer to write them to — and `-add-label` writes them when a
label finally exists, so creating a styled label is still one command and one
history entry. Being a tool default, it needs no undo step of its own.

`label-pos` needs two things the other properties do not. It places text
relative to an anchor point, which a path label has none of, so
`getStyleFields()` in `gui-label-commands.mjs` drops it for a curve. And it is
**shorthand for three properties the renderer reads**, which both commands store
rather than expand: `resolveLabelPosition()` fills in `dx`, `dy` and
`text-anchor` at drawing time, and a value on the record wins per property, so a
`dx=` given alongside a position still nudges the label off it. See "A position
is stored as a position" for why the expansion moved to render time. One stored
field is also what lets the panel read a position back and light the button the
label is on.
#### The two commands have to agree on types, not just values

`-style` converts a literal to the type its property is stored in —
`stylePropertyTypes` says `icon-size` is a number — while `-add-label` copied
the option string straight through. So `icon-size=20` was `20` from one command
and `"20"` from the other, and a layer holding a label from each had a column
with two types in it.

`-add-label` merges the label it builds into the target layer, and
`-merge-layers` refuses a column like that. The result was an error on the click
that placed the *next* label, naming a field the user had never typed:
`Inconsistent data types in "icon-size" field: number, string`. Nothing about
the message pointed at the mixed styling that caused it, and nothing the user
could do in the GUI would clear it.

Two changes, because either alone leaves a way in:

- **`parseStyleLiteral()`** (`svg-properties.mjs`) is the conversion `-style`
  applies to a literal, exported so that `-add-label` gets the same answer for
  the same input. A value that is not usable for the property is now rejected
  rather than stored, which is also what `-style` does.
- **`matchTargetFieldTypes()`** makes the new label adopt whatever types the
  target layer already holds. The first change stops mapshaper from creating
  the mismatch, but data read from a file can arrive with one already — a size
  stored as `"20"` — and such a layer would otherwise refuse every label
  offered to it. Only string and number are reconciled; anything else in a
  style field is odd enough that quietly rewriting it would hide a real
  problem.

`NEW_LABEL_STYLE_FIELDS` is checked rather than assumed, so a panel control
whose property `-add-label` cannot set fails visibly here instead of silently
doing nothing. (`icon` and `icon-size` were added to `-add-label` for this: a
label can carry a symbol at its anchor, even though those are not text
properties.)

#### Size fields take a value three ways

Font size and icon size are display-only spans today (`fontSizeText` and
`iconSizeText` in `gui-label-tool.mjs`), nudged by a `−`/`+` pair: there is no
way to type a size, so the only route from 12 to 24 is twelve clicks. The new
panel makes them inputs and keeps both buttons, attached to the input's right
edge and sharing its border so that the three read as one control rather than
three. Arrow keys step by 1 while the field has focus, shift-arrows by 10. Each
of the three covers a different way a size is really chosen: typed when it is
known, stepped when it is being judged against the map, keyboard when the hand
is already in the field.

**Implemented** as `SizeField` in `gui-size-field.mjs`, with the two decisions
it turns on kept as pure functions and tested directly: `parseSizeValue()`, and
`getSizeFieldKeyAction()` for what a keystroke means.

`ClickText` was the obvious thing to wrap — it has the parse, validate, bounds
and commit-on-Enter behaviour — but it holds a number at all times, and a size
control here has to be able to show nothing: a mixed selection has no size, and
committing a blank field must leave the labels alone rather than reverting them
to the last number the control happened to hold.

Two states the field keeps apart:

- **Focused** and **holding uncommitted typing** are not the same. A refresh
  must not overwrite a half-typed number, but it must land when the field
  itself asked for the change, or a size stepped with the arrow keys would not
  appear in the field it was stepped in.
- **A step is a delta, not a value.** The field reports `onStep(delta)` and the
  panel resolves what to step from, because the field may be blank while the
  labels are not — stepping a mixed selection starts from the common value or
  the default, as the old `−`/`+` buttons did.

While the caret is in the field, the keyboard belongs to it: the field stops
propagation for every key it sees. Without that the tool's own handlers get
them, and Escape disarms the tool, Enter finishes a curve being drawn, and
Backspace takes back a knot.

Two alternatives were considered.

**Buttons revealed on hover** cannot win the space argument. Either the field
reserves room for them permanently, in which case hiding them removes the
affordance but not its cost, or it does not, and the value reflows or is
overlapped as the pointer arrives — in a panel where the number being covered
is the one the user is adjusting. Hover also puts the control out of sight until
the pointer happens to cross it, which is the wrong trade for the panel's two
most-used numbers.

**A menu of preset sizes** fits neither property. A chevron says "one of these",
which contradicts a field that takes any number, and the common adjustment here
is relative — one point bigger — which a list does badly: the user has to find
the current value in it and pick the neighbour, and a label at 13px has no entry
to find in a list of 8/10/12/14. Icon size has no conventional set of values to
list at all.

The buttons stay `makePanelButton()` divs, so the rule that the panel refuses
focus it does not need still keeps the caret in the textarea while they are
clicked. The input is a real form element and takes focus, which the editor's
blur-into-`.text-style-panel` exemption already allows, and `applyStyleValues()`
hands the caret back when the value is applied. A native `<input type="number">`
is not used for the stepping: the panel's CSS strips `-webkit-appearance` from
its inputs, so the spinners would have to be reinstated and would then differ by
platform, and a focused number input changes value on the scroll wheel, which
over a zoomable map is an accident waiting to happen.

#### The icon's opacity is its own property

The panel's Icon section shows a colour and an opacity as two controls, and they
are stored as two properties: `icon-color`, which exists, and **a new
`icon-opacity`**, typed `number` in `stylePropertyTypes` and read as 0–1 like
the other opacities. They share a row, with the icon's size moved up beside the
shape buttons, so that the section reads the same way as Text above it: a
colour and its opacity on one line.

The opacity control shows a percentage and stores a fraction, which
`parseOpacityValue()` in `gui-point-style-tool.mjs` already does for the point
panel (`"50%"` → `0.5`, clamped); it moves somewhere shared rather than being
written a third time — `gui-style-values.mjs`, with `formatOpacityPct()` for
the other direction.

It is a plain field, not a swatch or a slider: a swatch beside a colour reads
as a second colour, and a slider gives up the exact value for a drag gesture
over a zoomable map.

**The panel writes `icon-opacity` whenever the icon is on**, the way it writes
`icon-size`, rather than only when the control is touched. Text opacity is
`opacity`, which is applied to the symbol as well, so a label whose text was set
to 50% would otherwise show a half-faded icon that the Icon section's own
opacity control said was at 100%.

**A new property rather than `fill-opacity`,** because an icon and its text are
two SVG elements built from one record, and every property in
`commonProperties` — `opacity`, `fill-opacity`, `stroke-opacity` — is applied to
both of them: `applyStyleAttributes()` is called once with
`propertiesBySymbolType.point` for the symbol and once with `.label` for the
text. So `fill-opacity=0.5` fades the words along with the icon, and nothing
dims one without the other. This is the same asymmetry the icon's colour
already has: the text's colour is `fill`, and `getIconStyleData()` gives the
symbol `icon-color || fill || 'black'`. `icon-opacity` is that pattern applied
to the second half of a colour.

**Not an alpha inside `icon-color`.** `icon-color=rgba(204,51,51,0.5)` needs no
new API, but the panel has to read the stored value back into two controls, and
to *write* one it would first have to resolve whatever the field holds to
numeric channels. Nothing in mapshaper resolves colour names, so opacity would
work on `#cc3333` and not on `steelblue` — an unexplainable difference to a
user, and one that appears only for data the panel did not write itself. It also
makes the value compound where the rest of the styling is not: `-each
'icon-opacity = 0.2'` is a thing a user can write, and editing the fourth
argument of a string is not.

**Implementation.** `getIconStyleData()` sets `o.opacity` from `icon-opacity`
when it is present, so it overrides on the symbol the way `icon-color` overrides
`fill`, and `opacity=0.4 icon-opacity=1` is faded text behind a solid icon. It
maps to `opacity` rather than `fill-opacity` because `ring()` draws its icon as
a stroked circle with `fill: none`, so a fill opacity would do nothing to one of
the four shapes. `opacity` is already an accepted point property, so
`propertiesBySymbolType` does not change: the new name is a `stylePropertyTypes`
entry that is read and translated, never applied to an element as itself. The
GUI gets it for nothing, because `renderSymbol()` there calls the same
`renderPoint()`.

**`-add-label` needs `icon-color` as well as the new property.** It takes
`labelStyleOpts` plus `icon` and `icon-size`, and `icon-color` was never added —
so as things stand the panel cannot create a coloured icon in one command, and
placing a styled label would take an `-add-label` and a following `-style`: two
history entries for one gesture, and the second one styling a label the user may
have abandoned. Both properties go in the `-add-label` declaration and in
`NEW_LABEL_STYLE_FIELDS`.

#### Saved styles is an apply menu, not a selection

The Presets row is now **Saved styles**, a section of the panel headed like
Text and Icon, holding two controls: a menu that applies a style and a button
that saves the current one. The menu shows what it is for rather than what was
last chosen — "Apply style", before and after it closes.

The wording is split between the three of them rather than repeated in each.
The heading says what these are, so the menu does not have to: "Apply saved
style" said "saved" twice in two inches, and the shorter label leaves the menu
narrower, which is where the style names go. The button is "Save current"
rather than "Save", which left the reader to work out what was being saved —
in a panel over a map, above a *Save current* that might plausibly have meant
the file.

The two sit side by side where they fit and stack where they do not, which is
what separated the panels while the layer panel was still 185px and the label
panel 216px. The menu's `flex-basis` is `max-content`, so it asks for the width
its own label needs and the row wraps exactly when the pair will not fit —
rather than a width written once per panel, which would have to be revisited
every time either label changed, or a panel was rewidened.

That simplified behaviour and not just appearance. The old control applied a
style on `change` and then went on displaying it, so the display had to be
walked back whenever a style was edited by hand: `clearSelection()` was called
from five places across the label and layer panels, each behind a
`preservePreset` flag that told a style command whether it came from the menu or
from a font being picked. With nothing displayed there is no claim to keep
honest, and the five calls, the flag and `clearSelection()` itself are gone.

**Deleting moved into the menu, one small button per row**, since a Delete
button outside it would refer to nothing on screen. That is what cost the
native `<select>`: an `<option>` holds text and nothing else, so a per-row
button means a menu of divs (`gui-style-preset-control.mjs`).

The gain is that it **drops the panel's focus exception for this control**: a
native menu is drawn by the OS and closes the instant its element is blurred,
which is why the caret must not be handed back on the click that opens one (see
"Keeping the caret while the panel is used"). The div menu never takes the caret
in the first place, so the ordinary rule covers it. The font menus stay native,
so the exception stays for them.

What it costs is that the states a `<select>` expressed in markup have to be
drawn and closed by hand:

- **"No saved styles" is an inert row** rather than a disabled `<option>`, so
  that an empty menu still says why it is empty, and the menu does not open at
  all while the panel's controls are off.
- **Escape and a click outside close it**, from two document listeners in the
  module rather than one per control. Escape is captured at the document, ahead
  of the GUI's own keydown listener, and stops there — in label mode the same
  key ends the editing session, and closing a menu should not also do that.

Keyboard navigation is not among the costs, because there is none to write: the
interface is pointer-only, and no custom control carries a tabindex (see the
focus note in `page.css`).

The delete button appears on hover of its row, right-aligned, with the row
highlight stopping short of it so that applying and deleting read as two
targets. It is hidden by `visibility` rather than left out of the layout, so a
name is the same width whether or not the pointer is on it. Hiding it at all is
the opposite of what the size fields do with their steppers, and the trade
differs in both directions: those buttons are the primary affordance of a
frequently used control and compete for space with the number being read, while
this is a rare destructive action at the empty end of a row, in a menu that
exists only while it is open — and a destructive action is better for waiting
until intent is shown.

**The confirmation stays.** Saved styles live in `localStorage` through
`GUI.getSavedValue()`, outside the command pipeline, so deleting one cannot be
undone and `showPrompt()` is all there is between a misclick and a lost style.
The menu closes before the prompt opens, rather than sitting behind a dialog
that is about one of its rows.

The menu list is at least as wide as the button and wider if the names need it,
up to a limit. The button is only as wide as the space left beside *Save
current*, and a style's name is the thing being read; nothing clips a menu
hanging over the map.

`StylePresetControl` is shared with the layer style panel, which gets the same
two-control row. The field measurements it styles itself from
(`--label-field-height` and friends) moved from `.text-style-panel` up to
`.label-style-panel` for that reason, and the menu's arrow is the one the
native `<select>`s use — `--label-menu-chevron`, a drawn stroke rather than a
filled triangle, which is lighter than the text beside it.

### Why the panel can take focus

The panel is built partly from `<select>` and `<input type="text">` elements,
which take focus — and the editor commits its edit when the offscreen textarea
loses focus. This looked at first like a reason that styling could not act on a
live caret at all, and that the typography controls would have to be rebuilt as
custom widgets in the toolbar (the `addControl(el)` design). It is not: the two
can share focus, using the rules in "Keeping the caret while the panel is used".

What made the native `<select>` workable is that it never has to be denied
focus. It takes focus, the editor ignores the blur because the new focus target
is inside the panel, and the caret comes back when the menu reports a choice.
The one thing that must not happen is taking focus back while its menu is open.

**Per-run styling is still out of scope.** With no mixed fonts inside a single
label, typography never needs to apply to part of the text, so the panel always
acts on whole labels and the selection rules above are enough.

## Undo/Redo And Session History

Because every mutation is command-backed, undo and session history come from
the existing console path (`createCommandUndoTransaction()` in
`gui-console.mjs`) with no new capture code. The new commands need the standard
schema and field capture that `-style` performs (`noteThingWillChange` /
`markThingChanged`, see `undo-redo-implementation.md`). Because labels are
point features, no command in this work mutates the arc collection, so none of
them needs the `arc_count` update flag that the path-drawing tools require.

Within a session the tool starts an edit-session transaction on mode entry, so
fine-grained undo works while the tool is open and collapses to one durable
entry on exit, per `gui-improvement-roadmap.md`. Text edits commit on blur, so
one undo step reverses one label's text rather than one keystroke.

## Where The Code Will Live

| Concern | Location |
|---|---|
| Curve fitting and length (pure) | `src/curves/mapshaper-curve-fit.mjs` (new) |
| `-add-label` command | `src/commands/mapshaper-add-label.mjs` (new) |
| `-update-label` command | `src/commands/mapshaper-update-label.mjs` (new) |
| Coordinate parsing shared by both (pure) | `src/commands/mapshaper-label-geom.mjs` (new) |
| Option declarations | `src/cli/mapshaper-options.mjs` (`-add-label`, `-update-label` and `-style`) |
| Dispatch | `src/cli/mapshaper-run-command.mjs` |
| New label properties | `src/svg/svg-properties.mjs` |
| Path label rendering + reporting | `src/svg/svg-label-paths.mjs` (new) |
| Fit rule and fingerprint | `src/svg/svg-label-fit.mjs` (new) |
| Path label dispatch (export) | `src/svg/geojson-to-svg.mjs` |
| Baseline into `<defs>` (export) | `src/svg/svg-definitions.mjs` |
| `internal.*` registration | `src/mapshaper-internal.mjs` |
| Frame/symbol scale on export | `src/furniture/mapshaper-frame-utils.mjs` |
| Path label display + baseline upkeep | `src/gui/gui-svg-symbols.mjs` |
| Rendering a label with no feature | `renderPendingSymbol()` in `src/gui/gui-svg-symbols.mjs` |
| Host `<svg>` for content owned by no layer | `getSvgRoot()` in `src/gui/gui-layer-renderer.mjs`, `gui-map.mjs` |
| Layer draw/reposition wiring | `src/gui/gui-svg-display.mjs` |
| Overflow marking | `www/page.css` (`text.label-overflow`) |
| GUI mode + gesture wiring | `src/gui/gui-label-tool2.mjs` (new) |
| Curve state + gesture rules (pure) | `src/gui/gui-label-curve-state.mjs` (new) |
| Target rules + command generation (pure) | `src/gui/gui-label-commands.mjs` (new) |
| Command value quoting | `src/gui/gui-command-utils.mjs` (new) |
| In-place editor (session, DOM, events) | `src/gui/gui-label-editor.mjs` (new) |
| Caret and selection geometry (pure) | `src/gui/gui-label-caret.mjs` (new) |
| Knot handle hit-testing (pure) | `src/gui/gui-label-knots.mjs` (new) |
| Sliding and flipping a path label (pure) | `src/gui/gui-label-path-drag.mjs` (new) |
| Finding a label's baseline in the markup | `getLabelPathNode()` in `src/gui/gui-svg-symbols.mjs` |
| "flip to other side of path" menu item | `src/gui/gui-context-menu.mjs` (`e.flipLabel`) |
| Label text forms and caret indexes (pure) | `src/gui/gui-label-text.mjs` (new) |
| "Is a label" vs "has label text" | `src/svg/svg-feature-utils.mjs` |
| Typing focus detection | `src/gui/gui-lib.mjs` (`GUI.getInputElement`) |
| Caret, box, ghosted path, selection and hit region styles | `www/page.css` (`.label-edit-*`) |
| Hover and selection cues | `src/gui/gui-label-selection.mjs` (new), `www/page.css` (`.label-cue-*`) |
| Suppressing the canvas hover/selection overlay | `src/gui/gui-overlay-styler.mjs` (the `label` branch) |
| Which selection a click narrows to, and what it was | `src/gui/gui-hit-control.mjs` (`selectStyleFeature`, `describeClickedSelection`) |
| Overlay/preview rendering | `src/gui/gui-svg-display.mjs`, `gui-svg-symbols.mjs` |
| Path guide + knot handles | `src/gui/gui-label-path-guide.mjs` (new), reached from the `label` branch of `gui-overlay-styler.mjs` |
| Mode registration | `src/gui/gui-interaction-mode-control.mjs`, plus the mode gates in `gui-hit-control.mjs` |
| Hovering a label's text | `src/gui/gui-svg-hit.mjs` (`textPath` in the walk) |
| Excluding a path label's knots from hit testing | `src/gui/gui-shape-hit.mjs` |
| Tool registration | `src/gui/gui-edit-modes.mjs` |
| Creation toggles + button `selected` state | `src/gui/gui-floating-toolbar.mjs`, icon in `www/index.html` |
| Typography/alignment panel | `src/gui/gui-label-tool.mjs` |
| Style for labels not yet created | `src/gui/gui-label-style-state.mjs` (new) |

Per the GUI guardrails, the new `src/gui` modules reach core functions through
`internal.*` rather than importing from `src/` directly, and the size of
`www/mapshaper-gui.js` should be checked after the work lands.

Worth being precise about what the bundle-size guardrail is measuring, because
it is easy to misread. `www/mapshaper-gui.js` contains **no** core code at all:
`gui-core.mjs` reads `window.mapshaper`, so the GUI gets `internal` from the
separately loaded `mapshaper.js` at runtime. The export work therefore left the
GUI bundle byte-for-byte unchanged, and that was no evidence of anything. What
the guardrail actually catches is a module under `src/gui` importing a core
module *directly*, which makes rollup inline that module and everything it
pulls in. The GUI display work grew the bundle by 6.7 KB, which is exactly the
size of the new `gui-svg-symbols.mjs` source, and a check for distinctive
strings from the core modules confirms none of them were inlined.

Reaching core through `internal.*` is not free, though: a function is only
reachable if its module is registered in `mapshaper-internal.mjs`. The label
work adds `svg-label-paths.mjs`, `svg-label-fit.mjs` and
`svg-feature-utils.mjs` to the `internal.svg` namespace and
`mapshaper-curve-fit.mjs` to `internal`.

The editor added 2.6 KB, again matching its own source and inlining nothing.

## Known Limitations

- **Three drags will land on one object.** Replacing the old `labels` mode means
  taking on the drag it provides — dragging the text to change `dx`/`dy`
  (`gui-edit-labels.mjs`) — alongside moving the anchor point and reshaping the
  curve. That needs an explicit hit precedence. The rule the cues already imply
  is "what you can see is what you can grab": the anchor ring moves the point,
  the box or the glyphs move the text, a knot handle reshapes the path.
- **A curve the knots cannot express is not reachable.** There is no way to
  adjust a tangent directly, by design — that is what distinguishes a curvature
  tool from a pen tool — and no way to ask for a sharp vertex either (see "No
  corners"). Adding a knot is the only way to change the shape.
- **No multi-line text on a path.** `<tspan>` inside a `<textPath>` advances
  *along* the path rather than stacking below it, so multi-line curved text
  requires one offset path per line. Mapshaper has offset-curve machinery in
  `-buffer`, but parallel offsets self-intersect on tight bends, so this is
  deferred. Shift-Enter does insert a break in a path label, and it renders as
  a space. A path label that contains line breaks — from that, from a paste, or
  from the CLI — exports with its lines **joined by spaces** and a warning.
  Rendering just the first line would be a silent loss of text, and emitting
  tspans would run the lines end to end along the curve.
- **Figma imports the baseline but not the text.** Its SVG importer drops
  `<textPath>`, and the only form that survives costs a text node per
  character, so nothing is emitted for it; the handoff is Illustrator. See
  [Figma cannot import the output](#figma-cannot-import-the-output-and-that-is-left-alone).
- **Hovering a curved label is glyph-precise.** The pointer has to be over a
  glyph, not merely near the baseline, which on a small font at low zoom is a
  thin target. This is the same precision anchored labels have always had, and
  it is the pointer behaviour SVG gives for free; a more generous target would
  mean an invisible thickened baseline in the layer's own markup, like the one
  the editor draws for an open session.
- **An empty path label is reached only by its knots**, which is the opposite of
  the rule for every other path label. Nothing else can be done while it has no
  glyphs to point at, and now only the CLI can produce one: the tool no longer
  creates a label without text.
- **A curved label's knots are indistinguishable from a multipoint feature**
  to anything that does not read `label-text`, so a label layer exported to
  GeoJSON contains `MultiPoint` geometries whose meaning is only clear in
  context.
- **`-proj` can drop knots** that fail to project, which changes a curve's
  shape.
- **Without a frame, path and text do not scale together**, so a label can fit
  at one zoom level and not at another, changing whether it renders.
- **Selection bands on a curve are faceted.** Per-character extents are
  axis-aligned boxes, so a selection across a steep bend reads as a slight
  staircase. Acceptable, and mitigated by merging adjacent boxes.
- **Exporting at a smaller size can drop labels**, because the path shrinks
  with output size while the text does not. Reducing `-o width=` may therefore
  silently remove labels that were fine at nominal size; the export warning is
  the only signal.
- **Measurements depend on the measuring browser's fonts.** The same string
  measured 888.8 px in Chromium and 567.6 px in Firefox, because of font
  fallback. So whether a label fits, and how far an aligned block is held over,
  are answers from whichever engine is running the GUI. Since the measurement
  is now cached rather than stored (see "A measurement is not data"), it is
  taken fresh in each session and cannot arrive from another machine — which
  also means it cannot produce diffs when a project is reopened.
- **CLI-authored path labels are never dropped**, since they carry no
  measurement and export fails open.
- **Unprojected label paths are distorted.** A curve fitted in degree space
  bows incorrectly at high latitudes; the command warns rather than refusing.
- **No SVG round-trip for path labels**, since the importer drops curve
  commands and collapses tspans.
- **Mobile and IME input are unverified.** The offscreen-textarea approach is
  the standard way to support both, but neither was tested in the spike.
- **A caret before a leading line break lands on the line below.** A label whose
  text begins with a newline has an empty first line with nothing before it to
  measure from, so the caret is drawn at the start of the second line instead.
  Every other blank-line position works, because the placeholder that opens a
  line is a character the caret can attach to; this one has no preceding
  character at all.
- **The editor preserves whitespace that export collapses.** `xml:space` is set
  on the session's node only, so a label containing a run of interior spaces
  reflows slightly when the session ends. Setting it in `svg-labels.mjs` would
  make the two agree, at the cost of changing how every existing label with
  stray whitespace in its data renders.
- **Typography cannot be changed with the caret live.** The panel's controls take
  focus and the session commits on blur, so the caret is gone by the time a
  control fires and per-run styling within one label remains out of reach. A
  label reached by clicking is back in the selection by then and does get
  restyled; see [Why the panel can take
  focus](#why-the-panel-can-take-focus) for why this is a dependency rather than
  a coincidence.
- **A session survives a redraw by rebuilding, not by being preserved.** The
  rebuild is keyed on the feature id, so a command that reorders or renumbers
  features while a session is open would move the session onto the wrong label.
  Nothing the tool itself does can cause that.
- **A near miss on a pending curve is less forgiving than on a committed one.**
  A click within about one em of the baseline stays in the session, but a
  committed label also has the 25px proximity test its knots get as a point
  feature, which a label with no feature cannot have. On a curve with text the
  consequence is only that the click finishes the label; on one with none it
  discards the path that was just drawn.

## Open Questions

Resolved: a label's knots are its own multipoint geometry, so one layer holds
both label kinds and path drawing is part of label creation; symbols export at
native scale; non-fitting path labels are dropped rather than shrunk; the
existing `labels` and `label_style` modes are kept for now; and the target
layer determines where new labels go.

Still open, in descending order of how much they block implementation:

1. **Should the CLI get an approximate text-width estimator?** Without one the
   drop rule only applies to labels measured in the GUI, so a purely scripted
   map never drops anything. A crude estimate — an average advance width per
   font-size — would make the rule universal, at the risk of dropping labels
   that would actually have fitted, which is the failure mode the fail-open
   design exists to avoid. The recommendation is not to add one. Real metrics in
   Node would settle it properly; an escape hatch for a script to state its own
   width was tried and removed, for the reasons in "Nor is it a parameter".
2. **What command edits the knots of an existing label?** Dragging, adding or
   deleting a knot changes a feature's geometry, and neither `-add-shape` nor
   `-add-label` can express that. Options are a general geometry-editing
   command, an `-add-label`-shaped command that replaces a feature by id, or
   direct mutation with hand-rolled undo as the drawing tools do. Only needed
   at stage 4, but it decides whether knot editing is command-backed like the
   rest of the tool.
3. **Is the path guide shown per-layer or per-label?** Showing a faint guide for
   every path label in the active layer makes the paths discoverable and
   clickable, with knot handles and emphasis only on the label being edited;
   showing a guide only for the edited label is less cluttered but gives no
   indication of what else is there. The recommendation is per-layer guides
   plus per-label knots, matching how vertex mode emphasizes the hit shape, but
   it is a small enough decision to settle by trying it.

## Test Plan

Unit tests, which is where most of the value is. Done so far:

- `test/curve-fit-test.mjs` — `fitCurveThroughKnots()` over degenerate knot
  counts, collinear and duplicate knots and hairpins; that every interior knot
  is passed through smoothly, and that the curve never cusps; a known-answer
  check that evenly sampled circle points reproduce the circle; densification
  honoring the sagitta tolerance with a stable vertex count; and
  `getCurveLength()` cross-checked against a finely flattened version of the
  same curve.
- `test/add-label-test.mjs` — one coordinate pair creates a single-point label
  and several create a multipoint one; field creation, style option
  pass-through, layer creation via
  `name=`, the target-layer rules, the unprojected-input warning, and transform
  survival through `-proj`, `-affine`, `-simplify` and a TopoJSON round trip —
  the property that motivated geometry storage, asserted directly. Also that
  corners are gone from every surface: `corners=` is not an option,
  `label-corners` is not a style property, and one left in imported data is
  inert.
- `test/update-label-test.mjs` — moving a knot and moving an anchor; an anchored
  label becoming a curve and back; other features left alone; properties and the
  stored text measurement left alone; `corners=` gone as an option; recomputed
  bounds, which is what an in-place shape rewrite could get wrong; and the error cases —
  a missing or plural id, an out-of-range id, a feature that is not a label, a
  non-point layer, and unparseable coordinates.
- `test/label-path-export-test.mjs` — what counts as a path label; the `d`
  attribute; the fingerprint and all four fit states; `<defs>` hoisting,
  deduplication and byte-stable output; no `<path>` outside `<defs>`; no stray
  whitespace inside the text; `startOffset` defaults, `side`, `dx`/`dy`;
  each fit state's effect on the output including record alignment after a drop
  and the same label dropping at a smaller output size; multi-line joining; and
  regressions for multipoint features without label text and polyline layers
  with it.

- `test/gui-label-path-render-test.mjs` — GUI display: `<defs>` emission and id
  namespacing, `data-label-path` rather than `data-id`, anchored labels left
  alone, mixed layers, the overflow class added alongside the symbol class, the
  framed/unframed zoom behavior of both the renderer and `updateLabelPaths()`,
  and in-view testing of a curve whose anchor is off screen. These import GUI
  modules directly; `test/mocha-hooks.mjs` already installs the `window` and
  `document` stand-ins that `gui-core.mjs` needs, in every worker.

- `test/gui-label-tool-state-test.mjs` — the tool's pure core: every curve
  transition, the two gesture rules and their regressions, the target-layer
  rules over each row of the table plus the empty-point-layer and
  all-blank-label-text edges, the generated command strings, and — because a
  string that reads correctly can still fail to parse — those same strings
  actually run through `applyCommands()`. Also the quoting round trip, which is
  what proves a label named "Martha's Vineyard" survives. Also the style held
  for labels not yet created — accumulating across panel edits, removing a field
  on a blank value rather than setting it blank, and refusing a property
  `-add-label` cannot set — and the "which label is the panel pointed at" state,
  which must stay quiet when the same label is reopened, since a session
  reopens on every map render.
- `test/gui-label-path-guide-test.mjs` — the guide: the pending-path state, the
  synthesized line and handle layers, one arc per curve, the line following the
  fitted curve rather than the knot polyline, scale-independent flattening,
  every handle drawn the same with no per-shape styling, handles asked for in
  the form the canvas renderer draws as circles, and the wrapper
  properties that keep the synthesized coordinates from being projected twice or
  inheriting the label layer's cached bounds.
- `test/gui-label-caret-test.mjs` — the editor's pure core, against a fake
  rendered text node that reproduces each engine's misbehavior by name: the
  caret before, inside and past the end of the text; its size and its lean on a
  curve; the anchor fallback for an empty label; and an overflowing path label
  under WebKit's exception, Chromium's silent `(0,0)` and Firefox's clamping,
  including the assertion that the caret index is **not** clamped to what is
  rendered, since that is what would make the tail of the text uneditable.
  Selection bands merged along a line and broken across one. The box padded
  around measured bounds, and the caret-sized fallback that is the only thing on
  screen for a label that was just created. The three text forms and their round
  trip; the caret index mapping across a line break in both layouts, with a
  round trip over every glyph; and the commit command, including — because a
  string that reads correctly can still fail to parse — running the strings it
  writes through `applyCommands()`, with an apostrophe, a newline and empty text.
  The no-glyphs test, over whitespace, line breaks and the placeholder, and the
  delete command, run through `applyCommands()` to confirm it takes the record
  and the point together and closes the ids up.
- The empty-label rendering regression, in
  `test/gui-label-path-render-test.mjs`: both kinds of label render a node with
  the placeholder in it, the placeholder puts no mark on the map, it is not
  written into the data, and a point that is not a label at all still renders
  nothing.

Still to write:

- Frame scaling: a framed export at two output widths, asserting that geometry
  scales with the output size while `font-size` is emitted unchanged — the
  native-scale guarantee, which should be locked down by a test so it is not
  broken accidentally.

Browser tests (`browser-tests/`), following `snip-tool.spec.mjs` for the
interaction-plus-undo pattern and using the `?undo-test=on` API. Done so far, in
`browser-tests/label-tool.spec.mjs`:

- Creating both kinds of label by clicking the real toolbar and the real map:
  an anchored label from one click, a multipoint label from several plus Enter.
- That the command reaches the session history and that undo removes the label.
- That a curve abandoned by backspacing its knots away leaves the model
  checksum unchanged and nothing to undo, and that a one-knot curve is
  discarded rather than quietly becoming an anchored label.
- That Escape finishes a path at the last knot and opens its text — asserted
  with the pointer left well past that knot, since the preview runs out to the
  pointer and the committed path must not — and that Escape discards a path
  that has only one knot.
- Both gesture regressions: double-clicking a knot that is already there leaves
  the curve alone and open — the two clicks it arrives as must not drop a knot
  on the one under the pointer — and double-clicking empty map finishes the
  curve at that point.
- That the guide appears while drawing, is gone once the curve is finished, and
  keeps its knots in place across a zoom — the assertion that would fail if the
  knots were held in pixels.
- That clicking the font menu mid-session leaves the focus on it, which is what
  an open native menu looks like from the page — the menu is drawn by the OS and
  is not in the DOM — and that the caret is still drawn, so the blur that
  focusing the menu caused did not end the session. Then that choosing a font
  applies it, hands the caret back and lets typing carry on.
- That a label left with no glyphs is never created, over all three ways of
  leaving one: Escape on a label just placed, a label typed full of spaces, and
  a path label finished without text. The model checksum is asserted back at its
  starting value, and the session history asserted free of `-add-label` — the
  second is what distinguishes "never created" from "created and cleaned up".
- That emptying the text of a label that already existed removes it by command,
  leaving the other label on the layer with its own geometry rather than
  inheriting the deleted one's.
- **That both of those hold with app undo switched off**, which is the
  regression that motivated deferring creation: the removal of a just-placed
  empty label used to unwind the session's history, so it did nothing at all for
  a user who had turned undo off. The test asserts `appUndoIsEnabled()` is false
  first, so it cannot quietly stop testing what it is named for.
- That a click places a caret but no feature, that typing creates the label in a
  single `-add-label` carrying its text, and that a style chosen before any
  typing shows up in the label being drawn and then in the record.
- That a label's computed text style is the same before and after it becomes a
  feature. Read as computed style rather than as attributes, because what broke
  was inheritance: the attributes were identical and correct, and a label given
  no position has no `text-anchor` attribute either way.

Appearance on its own is left untested. Toolbar and tooltip visibility, and
stacking order, are cheap to check by eye and cost more in suite weight and
brittleness than they return — the tests worth keeping are the ones about what
is edited and what ends up in the data.
- That a selected curve draws a handle on each knot, that dragging one moves
  that knot and leaves its neighbours alone, that the drag reaches the session
  history as `-update-label`, and that one undo puts the knot back — the
  assertion that failed while the command had not declared its edit to the undo
  transaction.
- That an anchored label moves when its anchor marker is dragged. One knot
  rather than several, so it runs the same machinery, but it is the case that
  caught the handle being tested at `dragstart`: an 8px marker is smaller than
  one step of a quick drag, so the anchor was unreachable while the curve's
  larger spread of knots still happened to work.

  This one was passing vacuously. `zoomByPct(pct)` forwards its two optional
  focus arguments whether or not it received them, and `zoomToExtent()` defaulted
  them by `arguments.length`, which does not notice an explicit `undefined`. The
  arithmetic then put `NaN` into the view centre, from which the map cannot
  recover: symbols stopped repositioning and labels vanished as soon as the map
  was zoomed. No GUI caller hits it — they all pass a focus point — but the test
  API did, so the zoom under test was not really happening. `zoomToExtent()` now
  tests the arguments for `undefined`.
- Toolbar behavior: the toggles are mutually exclusive, re-clicking disarms, and
  the toolbar is only visible while the mode is on. That the tool arms itself on
  a layer with no labels and stays idle on one that has them.

  The arming default broke every test that reached the toolbar, because the
  helper clicked the button and so *disarmed* what was already armed. The helper
  now sets the state it names rather than toggling, with a separate
  `disarmTool()`; the call sites that had been relying on the toggle to disarm
  say so.
- Hit testing, asserted on the feature the hit control resolved, since hover
  highlighting is drawn to canvas and leaves no DOM state: a path label is hit by
  its glyphs at two places along the curve and by **none** of its four knots, an
  anchored label is still hit by both its glyphs and its anchor, and an empty
  path label is still hit by its knots.

  Both halves of this were checked by reverting each one and watching the test
  fail for the right reason — the glyph assertion without the `textPath` tag, the
  knot assertion without the knot rule. Worth doing, since the zoom test below
  was passing vacuously for a while.
- Reopening a committed path label by clicking its glyphs — two clicks now, the
  first to select it — asserting that the caret landed on the character clicked
  rather than at either end, by typing into it.
- The two-stage click, counting selection cues and carets: shift-click adds a
  label to the selection and takes it back out without opening any text, and a
  plain click on one of several narrows the selection to it rather than reaching
  into it. Escape gives up the selection before the armed tool.
- The style panel: open in label mode before there is a label layer at all, with
  its controls live and its close button hidden, and hidden again when the mode
  ends. A style set with nothing selected stays out of the session history and
  arrives as options on `-add-label` when a label is finally placed. And the
  distinction the target rule exists for — styling the one selected label, not
  the whole layer.

And in `browser-tests/label-editing.spec.mjs`:

- That clicking the map leaves a **caret and a box** in the new label, and that
  the label renders a node at all — the two things whose absence made the
  creation interface untestable.
- Typing renders into the node that will be exported, while the data stays
  untouched until the session ends; the caret advances as characters are typed
  and moves back with the arrow keys.
- Every way a session can end, and what each saves: clicking away, clicking the
  toolbar, leaving the mode, Enter on either kind of label. That the text
  reaches the session history **once**, not once per keystroke, and that one
  undo reverses the whole session.
- Escape finishing a label and keeping its text, with the tool still on
  afterwards, and still taking back a label that was never typed into.
- That a click away finishes the label without placing another, and the click
  after it does place one.
- Clicking an existing label to edit it, and clicking within the text to move
  the caret rather than ending the session.
- Multi-line: shift-Enter adds a line to an anchored label, the rendered text
  gains a `<tspan>` and the placeholder that opens the line, the stored value
  carries the escape, and the caret reaches the second line. Enter on its own
  finishes the label instead, on both kinds.
- The two "what you type must render" regressions, each asserted on the thing
  the user would notice rather than on the mechanism: typing a space advances
  the caret and raises the rendered character count by one, a run of spaces is
  not collapsed, and shift-Enter drops the caret and grows the box **before**
  anything is typed into the new line.
- A selection band that is a single merged rect, painting beneath the glyphs
  with the caret above them.
- The overlay wearing the label's transform across a zoom, with the text still
  rendered and the caret still drawn.
- A path label typed along its curve with a leaning caret, Enter committing
  instead of adding a line, and a click just off the glyphs reaching the label
  through the thickened baseline instead of starting a new curve.
- Dragging a selected path label's glyphs along its curve: `label-start-offset`
  stored as a percentage, the curve and the view both left where they were, and
  one history entry and one undo for the gesture. That the same drag on a label
  that is **not** selected pans the map instead, writing nothing.
- Dragging across the curve: the knots reversed, no `label-side` written, and
  one undo step covering the whole flip. The placement it carries across is
  asserted through the menu item rather than the drag, where the values are
  exact: `20%` and `start` become `80%` and `end`.
- The arithmetic under both, in `test/gui-label-path-drag-test.mjs`: projection
  onto a polyline, the offset following the pointer, what a flip does to an
  offset and an anchor, and the fallbacks for a label with no offset or one
  written in units this tool cannot read.

Still to write:

- Zoom a framed label layer and assert the path `d` is not recomputed, and that
  text and path scale together.
- Overflow: a label whose text is wider than its path is absent from an SVG
  exported out of the GUI, and reported in the export message. (The marking half
  of this is covered — "a path label too long for its path is marked as
  overflowing" in `browser-tests/label-tool.spec.mjs` — and the drop rule is
  covered against a stand-in measure function in
  `test/label-path-export-test.mjs`, so what is left is a real browser export.)
- Zoom an unframed label layer and assert an overflowing label is marked rather
  than hidden, and stays selectable.
- Run the editing assertions against WebKit as well as Chromium, since WebKit
  is the engine whose char-count behavior differs.
- That a flip is visible in the browser — the reason for reversing the knots
  rather than writing `label-side`. The current tests assert the data and the
  markup; the rendering was checked by eye.
- Icon opacity: turning the icon on writes `icon-opacity`, so setting the text
  to 50% leaves the icon at the opacity the panel shows for it. That a `ring`
  fades too, which a `fill-opacity` would not have done.
- Saved styles: the menu applies a style and still reads "Apply style"
  afterwards; a row's delete button removes that style and only that style, and
  the confirmation can be declined; editing a style by hand leaves the menu
  alone, since there is no longer anything to walk back; and the menu leaves the
  caret in the textarea, which the native `<select>` needed an exception for.
