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
defaults on the layer's `<g>` element.

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
| `label-corners` | string | Indices of knots to treat as corners, comma-separated |
| `label-start-offset` | measure | Position of text along the path |
| `label-side` | `left`\|`right` | Which side of the path the text sits on |
| `label-text-width` | number | Measured text width in px at native font-size |
| `label-text-hash` | string | Fingerprint of the values that width was measured from |

The knots themselves are geometry and so have no field. `label-corners` is the
only part of the curve's definition that cannot be inferred from the knots: a
corner knot gets a split tangent, so the curve arrives and leaves with
independent directions instead of passing through smoothly. It is a list of
indices into the feature's own points, which stay valid under every coordinate
transform because transforms never reorder or drop points.

The one exception worth noting is that `-proj` *can* drop points that fail to
project (`projectPointLayer()` removes them), which would shift the indices. A
label whose point count changes under reprojection should have `label-corners`
cleared rather than reinterpreted, since a silently misapplied corner is worse
than a uniformly smooth curve.

All new fields go in `stylePropertyTypes` so `isSupportedSvgStyleProperty()`
accepts them, *and* in the `-style` option declarations, since the parser
rejects any option a command has not declared. Note that `dominant-baseline` was
in the label render filter (`propertiesBySymbolType.label`) but in neither of
those places, so it could not be set from the CLI; fixed in the same pass.

Two of the new fields are the first style properties whose names contain two
hyphens, which exposed a bug in `-style`: it restored the property name from the
parser's underscore form with `replace('_', '-')`, a non-global replacement that
converted only the first underscore. The resulting name matched no known
property, so `label-text-width=` was silently ignored rather than applied or
reported. Both occurrences now use `replace(/_/g, '-')`, matching what
`getSymbolDataAccessor()` already did.

### Multi-line labels

Already implemented for anchored labels and unchanged by this work.
`renderLabel()` splits `label-text` on a newline, a literal `\n`, or `<br>`, and
emits one `<tspan>` per subsequent line with `dy` from `line-height`
(`src/svg/svg-labels.mjs`). The GUI keeps tspan `x` in sync during drags via
`setMultilineAttribute()`.

The editing surface needs one addition: the hidden input becomes a `<textarea>`
so Enter inserts a newline for anchored labels. For path-aligned labels Enter
commits the edit instead, because multi-line text on a path is not supported
(see [Known limitations](#known-limitations)).

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
           [corners=<i,j,...>]          knot indices to treat as corners
           [text-width=<px>]            measured text width, for the fit check
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
              [corners=<i,j,...>]        knot indexes to treat as corners
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

Three details are worth recording:

- **`label-text-width` is deliberately left alone.** It measures the text, and
  a move changes the length of the *path*; the fit check compares the two at
  render time against the curve as it then stands. So a move can turn a fitting
  label into an overflowing one without the stored measurement going stale, and
  re-fingerprinting it would be wrong.
- **Corners are knot indexes, so they depend on the list being replaced.**
  Given explicitly they are replaced outright. Left out they are kept, but
  pruned of any index the new knot list no longer has — an index past the end
  would otherwise sit in the data marking a knot that does not exist. Dropping
  below three knots removes them, matching `-add-label`.
- **The edit is declared to the undo system.** `noteLayerWillChange()` before
  and `markLayerChanged()` after, because `lyr.shapes` keeps its identity across
  an in-place write and a transaction has no way to notice it otherwise. An
  undeclared edit is an edit that cannot be undone. `captureLayerBefore()`
  clones the shapes but holds the data table by reference, so a corners change
  is captured separately through the table's own `captureFieldsBefore()`.

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

A knot listed in `corners=` ends one fitted run and begins the next, so the
curve arrives and leaves with independent directions and the knot renders as a
corner. Hobby's system couples every knot in a run, which makes this the
natural way to express a corner rather than a special case bolted on. In the
GUI it is a double-click on a knot, matching Illustrator.

Two knots produce a straight segment, so "straight path" is not a special case
in the data model or the renderer — it is a two-knot curve.

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
// knots: [[x,y],...]; corners: Set<number>; tolerance: number
// returns [[x,y],...] in the same coordinate space as the knots
export function fitCurveThroughKnots(knots, corners, tolerance)
```

This is the kind of small pure helper the GUI guardrails ask for, and it is
where the unit tests go: knot counts of 0/1/2, collinear knots, duplicate
knots, tight hairpins, all-corner knots (which must reproduce the input
polyline exactly), and a check that the curve never cusps. The strongest of
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

One knot per shape rather than one multipoint per curve, because a canvas styler
runs per shape: that is what lets a corner handle be drawn differently from a
smooth one.

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
from inside the editor — Escape, blur, Enter on a path label — and the tool
cannot do it at its own call sites. The hook declines to reclaim a selection
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

A **selected** curve also gets a handle on each knot — round, or square where
`label-corners` marks a corner, the same distinction the drawing handles make.
They are placed by the mapping the renderer used to build the curve
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
| Cross-axis offset | `dy` | `dy` (baseline shift from the path) |
| Which side | n/a | `label-side` |

So the alignment half of the toolbar is mostly existing properties.
`label-side` maps to the SVG 2 `side` attribute, which is not universally
supported; where it is missing the fallback is to reverse the path direction,
which is equivalent and works everywhere.

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

**Text width is not.** Mapshaper has no font metrics outside the browser: the
only text measurement anywhere in the codebase is canvas `measureText()` in
`src/gui/gui-label-fonts.mjs`, used for font detection. The CLI cannot know how
wide a string will render.

### Bake the measurement, not the verdict

The way out is for the GUI to measure once and store the result, with the
exporter supplying the half it can compute. What gets stored must be the
**measured width**, not a fits/doesn't-fit verdict:

- A verdict depends on output size. Text is emitted at native scale, so a
  smaller output shrinks the path while the text stays put — a label that fits
  at 800 px may not fit at 400 px. A stored boolean would be wrong at every
  size but the one it was computed at.
- A width does not. Because `font-size` is exported natively, the text's
  rendered width in output pixels is **constant, independent of output size**.
  A width measured once stays valid forever, while path length is recomputed
  per export.

So `label-text-width` holds the width in pixels at the label's native
font-size, measured off-path on a hidden plain `<text>` — never on the
`textPath` element, which saturates at the path length in Firefox and WebKit
and so cannot report how much room would be needed. Export then drops the
label when `label-text-width` exceeds the path length in output pixels.

This invariant is a direct dividend of exporting at native scale. Had export
scaled `font-size` with the frame, the stored width would need scaling too.

### Staleness, and failing open

A stored measurement can go stale: `-style label-text='...'` or
`-style font-size=18` from the CLI changes the inputs without updating the
width, and the exporter has no way to notice. So `label-text-hash` stores a
fingerprint of the values the measurement depended on — the text plus
`font-family`, `font-size`, `font-weight`, `font-style`, `font-stretch` and
`letter-spacing`. (`font-stretch` is in the list because it changes glyph
widths. `css` and `class` are not, and cannot be: either can change the rendered
font through a stylesheet mapshaper never sees.)

`getLabelFitState()` in `src/svg/svg-label-fit.mjs` returns one of four states,
and export draws the label in three of them:

| State | Condition | Behavior |
|---|---|---|
| `fits` | width ≤ path length | Draw |
| `overflow` | width > path length | **Drop**, and report |
| `unmeasured` | no width stored | Draw, silently |
| `stale` | width stored, fingerprint does not match | Draw, and warn |

Two refinements to this emerged while implementing it.

**A missing fingerprint means no guard was requested, not a failed guard.** A
width with no hash is trusted rather than treated as stale, because that is what
an explicit `-add-label ... text-width=` is: a script opting into the drop rule
with metrics it computed itself. Treating it as stale would make the opt-in
impossible.

**`unmeasured` does not warn.** The doc originally grouped "hash absent" with
"stale" under draw-and-warn, but a path label with no measurement is the normal
result of authoring in the CLI, which the fit rule explicitly does not apply to.
Warning there would fire on every export of every CLI-authored label — noise
that would train people to ignore the message that matters. `stale` is the
actionable case, because something changed a measurement that once existed.

To keep the trusted-width case self-guarding anyway, `-add-label` writes a
fingerprint whenever it is given a `text-width=`. So a pipeline that adds a
label with its own metrics and then restyles the text still fails open, and only
a width written by hand into a CSV is trusted unconditionally.

**Failing open is the important half.** Silently deleting a label from a map is
a worse outcome than drawing one that overflows: the overflow is visible and
fixable, the deletion is neither. A stale fingerprint is also more likely to
mean "edited outside the GUI" than "genuinely too long".

Two consequences worth stating plainly:

- **A path label authored entirely in the CLI is never dropped**, because it
  has no measurement. `-add-label` therefore accepts an explicit
  `text-width=` for scripted use, so a pipeline that knows its own metrics can
  opt into the rule.
- **Dropping must be reported.** Export emits a `message()` with the count and
  the feature ids of dropped labels. A silent drop would be indistinguishable
  from a bug. `reportPathLabels()` emits one message per layer per condition,
  naming up to ten feature ids and summarizing the rest:

  ```
  $ mapshaper -add-label coordinates=0,0,50,40,100,0 text=Sierra text-width=5000 -o out.svg
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

The constraint that makes per-glyph output awkward is the same one behind
[What export can and cannot compute](#what-export-can-and-cannot-compute):
glyph advances need font metrics, so only the GUI can place glyphs. A
`-o format=svg` option for it would work in the GUI and fall back to
`<textPath>` in the CLI, mirroring the `unmeasured` fit state.

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

An empty `<tspan>` lays out nothing. Pressing Enter therefore produced no
position for the caret to move to, and both the caret and the box stayed on the
line above: Enter looked like it had done nothing until a non-space character
was typed. The placeholder that `getRenderedLines()` puts at the start of every
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
Escape, on Enter for a path label, and on leaving label mode.

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
`dx`/`dy`) and `label_style` mode are **kept for now**, and retired once the new
tool is working well. So three label-related modes coexist during development.
This is deliberate: it keeps a working fallback while the new tool is
incomplete, and it means the new mode must not change the behavior of the old
ones. The cost is a temporarily crowded mode menu, and the retirement should
remove `label_style`'s entry point from `gui-point-style-tool.mjs` at the same
time.

Two places now branch on the mode to hold that line: `selectStyleFeature()`
gives label mode its own plain-click rule, and the yellow halo is applied only
outside label mode. Both branches go away with the old modes.

`HitControl`'s mode gates (`selectable()`, `draggable()`, `clickable()`,
`eventIsEnabled()`) need explicit entries for the new mode; it needs both drag
(moving anchors and knots) and click (selecting and entering edit).

### Curvature tool state machine

```
idle
  click on empty map      -> creating: first knot placed
  click on a label        -> label selected for styling
  click on the selected label -> editing text (see above)
creating
  pointer moves           -> refit through the knots and the pointer
  click                   -> append knot, refit, redraw preview
  double-click on knot    -> mark knot as corner, refit
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

- A click on a knot that is already placed is aimed at *that knot*, so it must
  not add another one. Guarding only against the knot just placed is not enough;
  the pointer going back to an earlier knot would otherwise leave a duplicate,
  drawing a stray branch from the end of the curve back to the double-clicked
  point.
- A double-click makes a corner only if the knot under the pointer is **not**
  the one this gesture just placed. Otherwise the ordinary way to finish a curve
  — double-clicking past its end — would silently mark its last knot as a corner
  and never finish at all.

So the curve state carries `justPlaced`, the knot the current gesture placed, and
the two decisions live in `handleClick()` and `getDblclickAction()` in
`gui-label-curve-state.mjs` as pure functions over that state, where they are
unit-tested directly.

Marking a knot as a corner replaces its smooth tangent with the secants toward
its neighbors, so it changes the curve only where the knots genuinely turn. On a
gentle arc the shape barely moves and the handle — filled and slightly larger —
is the only visible confirmation that the double-click worked.

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
buttons are new, and map onto `text-anchor`, `label-start-offset` and
`label-side`.

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
- **A click on a `<select>` is the exception, and must leave focus alone.** A
  native menu is drawn by the OS and closes the instant its element is blurred,
  so handing the caret back on the click that *opened* the menu made the font
  menu flash open and shut. Only that click is skipped: every other way out of
  a menu still returns the caret, because any other control either sets a style
  (which restores focus through `applyStyleValues()`) or reaches the catch-all
  with itself as the click target. A menu dismissed with Escape and nothing else
  keeps the focus until the next panel click or click on the label, which is how
  a focused menu behaves anywhere.

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
**shorthand rather than a property anything renders**: `text-anchor` and a
`dx`/`dy` are what the renderer reads, and `setLabelPositionStyle()` is what
turns one into the other. `-style` has always expanded it; `-add-label` did not,
so a label created with a position was stored in it and drawn centred. It now
expands it at the same point in its option loop, which also means an explicit
`dx=` or `dy=` given after it still wins, as with `-style`.
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
- **A corner handle only styles its dot, not the curve's tangent handles.**
  There is no way to adjust a tangent directly, by design — that is what
  distinguishes a curvature tool from a pen tool — but it also means a curve
  that the knots cannot express is not reachable.
- **No multi-line text on a path.** `<tspan>` inside a `<textPath>` advances
  *along* the path rather than stacking below it, so multi-line curved text
  requires one offset path per line. Mapshaper has offset-curve machinery in
  `-buffer`, but parallel offsets self-intersect on tight bends, so this is
  deferred. The editor commits on Enter for path labels instead of inserting a
  newline. A path label that contains line breaks anyway — which only the CLI
  can produce — exports with its lines **joined by spaces** and a warning.
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
  shape and invalidates `label-corners` index positions.
- **Without a frame, path and text do not scale together**, so a label can fit
  at one zoom level and not at another, changing whether it renders.
- **Selection bands on a curve are faceted.** Per-character extents are
  axis-aligned boxes, so a selection across a steep bend reads as a slight
  staircase. Acceptable, and mitigated by merging adjacent boxes.
- **Exporting at a smaller size can drop labels**, because the path shrinks
  with output size while the text does not. Reducing `-o width=` may therefore
  silently remove labels that were fine at nominal size; the export warning is
  the only signal.
- **Stored measurements depend on the authoring browser's fonts.** The same
  string measured 888.8 px in Chromium and 567.6 px in Firefox, because of font
  fallback. So `label-text-width` reflects the metrics of whichever engine
  authored it, and a project moved between machines can disagree about whether
  a label fits. Widths should be rounded when stored so that reopening a
  project does not produce gratuitous diffs.
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

1. **Should the CLI get an approximate text-width estimator?** Without one, the
   drop rule only applies to labels measured in the GUI or given an explicit
   `text-width=`, so a purely scripted map never drops anything. A crude
   estimate — an average advance width per font-size — would make the rule
   universal, at the risk of dropping labels that would actually have fitted,
   which is the failure mode the fail-open design exists to avoid. The
   recommendation is not to add one, and to treat `text-width=` as the
   scripted escape hatch.
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
  counts, collinear and duplicate knots, hairpins, all-corner input reproducing
  the input polyline, and assertions that the curve never cusps; a known-answer
  check that evenly sampled circle points reproduce the circle; densification
  honoring the sagitta tolerance with a stable vertex count; and
  `getCurveLength()` cross-checked against a finely flattened version of the
  same curve.
- `test/add-label-test.mjs` — one coordinate pair creates a single-point label
  and several create a multipoint one; `corners=`, `text-width=` and its
  fingerprint, field creation, style option pass-through, layer creation via
  `name=`, the target-layer rules, the unprojected-input warning, and transform
  survival through `-proj`, `-affine`, `-simplify` and a TopoJSON round trip —
  the property that motivated geometry storage, asserted directly.
- `test/update-label-test.mjs` — moving a knot and moving an anchor; an anchored
  label becoming a curve and back; other features left alone; properties and the
  stored text measurement left alone; corners kept, replaced, pruned to the new
  knot list, and dropped when the label stops being a curve; recomputed bounds,
  which is what an in-place shape rewrite could get wrong; and the error cases —
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
  corner handle styling including the reset between knots, and the wrapper
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
- Both gesture regressions: double-clicking a knot makes it a corner without
  duplicating it, and double-clicking past the end finishes the curve.
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
  toolbar, leaving the mode, Enter on a path label. That the text reaches the
  session history **once**, not once per keystroke, and that one undo reverses
  the whole session.
- Escape finishing a label and keeping its text, with the tool still on
  afterwards, and still taking back a label that was never typed into.
- That a click away finishes the label without placing another, and the click
  after it does place one.
- Clicking an existing label to edit it, and clicking within the text to move
  the caret rather than ending the session.
- Multi-line: Enter adds a line to an anchored label, the rendered text gains a
  `<tspan>` and the placeholder that opens the line, the stored value carries
  the escape, and the caret reaches the second line.
- The two "what you type must render" regressions, each asserted on the thing
  the user would notice rather than on the mechanism: typing a space advances
  the caret and raises the rendered character count by one, a run of spaces is
  not collapsed, and Enter drops the caret and grows the box **before** anything
  is typed into the new line.
- A selection band that is a single merged rect, painting beneath the glyphs
  with the caret above them.
- The overlay wearing the label's transform across a zoom, with the text still
  rendered and the caret still drawn.
- A path label typed along its curve with a leaning caret, Enter committing
  instead of adding a line, and a click just off the glyphs reaching the label
  through the thickened baseline instead of starting a new curve.

Still to write:

- Zoom a framed label layer and assert the path `d` is not recomputed, and that
  text and path scale together.
- Overflow: a label whose `label-text-width` exceeds its path length is absent
  from exported SVG and reported in the export message; one whose
  `label-text-hash` is stale is **present** in the output, with a warning.
- Zoom an unframed label layer and assert an overflowing label is marked rather
  than hidden, and stays selectable.
- Run the editing assertions against WebKit as well as Chromium, since WebKit
  is the engine whose char-count behavior differs.
