---
title: Frame tool design
description: Design notes for map frames as first-class objects, the GUI frame tool, and WYSIWYG preview mode.
---

# Frame Tool Design

A **frame** fixes the mapping between a region of the map's coordinate space
and a page of a given size. It is what turns a collection of layers into a
map: it decides what is inside the picture, how big the picture is, and
therefore the scale at which every pixel-sized symbol — a label, a point
marker, a stroke width — is drawn.

Mapshaper already has frames, and the pieces they drive are in place: symbol
scaling in the GUI, SVG and TopoJSON output sizing, scalebar rendering,
`-repel` layout. What is missing is an explicit frame API and interface.
Consumers independently rediscover the same rectangle and record fields, while
the GUI exposes the backing layer like ordinary content. This document keeps
the existing representation for compatibility, encapsulates it behind one
strict contract, and builds the interface on that contract.

Two things are settled requirements:

- **One frame per session.** Insets, locator maps and small multiples are
  deferred, but the model must not preclude them: every consumer resolves the
  frame through one function, so multi-frame support later means changing the
  resolver and adding an association, not revisiting thirty call sites.
- **The frame stays a layer.** Its canonical configuration remains in record 0
  for command-line and format compatibility, while the GUI stops treating it
  as ordinary content. Its rectangular geometry remains in the map's CRS,
  keeping it reprojectable, clippable, inspectable and expressible on the
  command line.

## Scope

In scope:

- A strict, centralized frame-recognition and configuration API
- Frame-aware reprojection, so `-proj` no longer destroys a frame
- An `-update-frame` command, so every frame edit is a replayable command
- A `frame` GUI interaction mode with on-map handles, a compact resize toolbar
  and a separate properties dialog
- A preview mode that shows the page boundary, masks the area outside it, and
  reports the current magnification as a percentage
- Creation from the current view, the visible-layer bounds, or a drawn box
- Export fixes: no silently ignored `width=`, no accidentally unframed output,
  no frame rectangle drawn into the output

Deferred, but the model must not preclude them:

- Multiple frames in one session (insets, small multiples, locator maps)
- Persistent association between a frame and a subset of layers. The first
  version continues to compose the current visible/pinned layer stack; it does
  not write that transient GUI state into frame metadata.
- Scaling symbol sizes along with geometry on export
- Frames with non-rectangular clip geometry (circular insets)
- Print units and bleed/trim marks

Out of scope:

- Page layout across multiple frames (arranging insets relative to each other)
- Multi-page output
- Non-SVG raster output sizing (`-o format=png` does not exist)

## Terminology

- **frame**: the object. A layer marked as a frame, carrying a nominal size.
- **extent**: the frame's region of the map, in CRS coordinates. Derived from
  the bounds of the frame layer's geometry.
- **nominal size**: the frame's size in display units — `width` and `height` in
  px, pt, in or cm. `parseSizeParam()` in `src/geom/mapshaper-units.mjs`
  handles the conversion; 72pt per inch, 1pt per px, 28.3465px per cm.
- **scale**: nominal width divided by extent width. The constant that converts
  CRS distance to page distance. Not directly stored; always derived.
- **symbol scale**: the ratio between the frame's *current on-screen* size and
  its nominal size, reported by `MapExtent.getSymbolScale()`. 1 when the frame
  is displayed at nominal size, and 1 when no frame is defined. This is the
  number the preview mode reports as a percentage.
- **100% magnification**: one nominal frame unit is one CSS pixel. This is the
  canonical authoring scale, not a claim about physical size on the monitor:
  Mapshaper uses 72 display units per inch, while CSS defines 96 CSS pixels per
  inch.
- **preview mode**: a GUI display state in which the map is presented as a
  page: boundary drawn, outside masked, magnification reported.
- **crop**: change the extent, keeping scale constant (nominal size follows).
- **resize**: change the nominal size, keeping the extent constant (scale
  follows).
- **move**: change the extent's position, keeping its size and the nominal
  size constant.

One terminology collision to be aware of: `src/crs/mapshaper-projection-frame-cuts.mjs`
and `dest.__projection_topology.frame_bounds` in `mapshaper-proj.mjs` use
"frame" to mean the boundary of the projected world — the outline of a
Robinson or Mollweide projection. That is a different concept and this
document never means it. New code should prefer `map frame` or `page` in
identifiers that could be confused.

## What Exists Today

### Recognition is distributed and too permissive

`isFrameLayer()` in `src/furniture/mapshaper-frame-utils.mjs`:

```js
export function isFrameLayer(lyr, arcs) {
  return getFurnitureLayerType(lyr) == 'frame' &&
    layerIsRectangle(lyr, arcs);
}
```

A layer is recognized as a frame when its first data record has a field named
`type` whose value is `"frame"` and its geometry is a single axis-aligned
rectangle. Record 0 is a reasonable persistence format for this one-feature
configuration layer, but recognition is underspecified and consumers do not
share one resolver. The record reader lives in
`src/furniture/mapshaper-furniture-utils.mjs`:

```js
export function getFurnitureLayerType(lyr) {
  var rec = lyr.data && lyr.data.getReadOnlyRecordAt(0);
  return rec && rec.type || null;
}
```

### Settings are exposed like ordinary feature attributes

`-frame` writes them as feature properties
(`src/commands/mapshaper-frame.mjs`):

```js
  var feature = {
    type: 'Feature',
    properties: {type: 'frame', width: widthPx, height: heightPx},
    geometry: bboxToPolygon(bbox)
  };
```

So `type`, `width` and `height` are ordinary attribute columns. Persisting them
there is useful: GeoJSON, Shapefile, `.msx` and CLI workflows carry them with no
special serializer. The problem is encapsulation. They appear in the generic
attribute inspector, and generic field commands can change or remove them
without frame-specific feedback.

The stored `height` is never read. `getFrameLayerData()` in
`src/furniture/mapshaper-frame-utils.mjs` recomputes it from the extent's
aspect ratio to avoid rounding artifacts:

```js
export function getFrameLayerData(lyr, arcs) {
  var bounds = getLayerBounds(lyr, arcs);
  var d = lyr.data.getReadOnlyRecordAt(0);
  var w = d.width || 800;
  // prevent rounding errors (like 1000.0000000002)
  var h = Math.round(w * bounds.height() / bounds.width());
```

Note that the extent already comes from `getLayerBounds()`. The rectangle is
part of the recognition contract and supplies the editable geographic extent.
The revised record contract must not keep writing an always-present but
sometimes-ignored height; derived height and a user-fixed page aspect need
distinct representations.

### Two creation paths, no update path

`-frame` (`src/commands/mapshaper-frame.mjs`) creates a frame from a bbox or
from the bounds of its targets. The GUI does not use it. The box tool's frame
button (`openAddFramePopup()` in `src/gui/gui-box-tool.mjs`) runs `-rectangle`
instead:

```js
      var cmd = `-rectangle + name=frame bbox='${bbox.join(',')}' width='${widthStr}'`;
      runCommand(cmd);
```

That works because `-rectangle` quietly doubles as a frame writer
(`src/commands/mapshaper-rectangle.mjs`):

```js
function applyFrameProperties(lyr, opts) {
  if (!opts.width) return;
  if (!lyr.data) initDataTable(lyr);
  var d = lyr.data.getRecords()[0] || {};
  d.width = parseSizeParam(opts.width);
  d.type = 'frame';
}
```

`cmd.rectangle2` also applies it to an existing rectangle, which makes
`-rectangle target=frame width=600` the de-facto "change the page size"
command. It is undocumented, and it cannot change the extent.

There is no command that says "set this frame's extent to X".

### Consumers

| Consumer | How it finds the frame |
| --- | --- |
| SVG export | `getFrameData(dataset, opts)` — first frame layer in the exported dataset |
| TopoJSON export with `width=`/`height=`/`fit_bbox=` | same |
| `-scalebar` rendering | `findFrameDataset(catalog)` — first frame in the catalog |
| `-repel` | dataset first, then catalog (`src/commands/mapshaper-repel.mjs`) |
| GUI symbol scaling | `findFrameLayer()` — first *visible* frame layer |
| GUI full bounds | same, via `isPreviewView()` |

Three different resolution rules for the same object.

### The GUI already has half a preview mode

In `src/gui/gui-map.mjs`:

```js
  // Preview view: symbols are scaled based on display size of frame layer
  function isPreviewView() {
    return !isTableView() && !!getFrameLayerData();
  }

  function getFrameLayerData() {
    var lyr = findFrameLayer();
    return lyr && internal.getFrameLayerData(lyr, lyr.gui.displayArcs) || null;
  }
```

When a frame layer is visible, the map's full bounds become the frame's extent
(plus a 3.5–4.5% margin added by `calcFullBounds()`), and
`MapExtent.getSymbolScale()` starts reporting a live ratio that every symbol
renderer multiplies into its transform — `gui-canvas.mjs`,
`gui-svg-symbols.mjs`, `gui-svg-furniture.mjs`, `gui-label-tool2.mjs`.

As `label-tool-design.md` puts it, "the GUI at nominal zoom is the export."
The behaviour you want already exists. Nothing in the interface says so, shows
the ratio, or offers a way to get to 1.0.

### Editing

The `rectangles` interaction mode (`src/gui/gui-rectangle-control.mjs`) puts
draggable handles on any pinned rectangle, including a frame. Dragging moves
arc coordinates via `setRectangleCoords()`. Nothing else changes.

## Problems

Each of these was reproduced against the current build.

### 1. Reprojection destroys a frame

`-proj` transforms the frame rectangle's corners like ordinary geometry. Under
Mercator the rectangle stays axis-aligned and the frame survives. Under
Robinson it does not:

```
$ mapshaper in.json -frame width=800 -target '*' -proj robin -o out.svg
<svg ... width="800" height="905" viewBox="0 0 800 905">
<g id="frame">
<path d="M 1 904.37 1 1 795.33 1 799 904.37 1 904.37 Z"/>
</g>
```

The frame is now a trapezoid, `layerIsRectangle()` fails, and three things go
wrong at once: the output is sized by `calcFrameData()`'s default 800px rather
than by the frame; the ex-frame is drawn into the output as a **filled black
quadrilateral**, because `adjustRectangleStyle()` only supplies `fill="none"`
to layers that still test as rectangles; and every consumer above silently
falls back to its no-frame behaviour.

The failure is projection-dependent, so it will not show up in a test suite
that only exercises Mercator.

`GuiMap#setDisplayCRS()` in `src/gui/gui-map.mjs` carries the same unfixed
problem as a comment:

```js
  this.setDisplayCRS = function(crs) {
    // TODO: update bounds of frame layer, if there is a frame layer
    var oldCRS = this.getDisplayCRS();
```

### 2. `-o width=` is silently ignored

`getFrameData()` in `src/furniture/mapshaper-frame-utils.mjs`:

```js
export function getFrameData(dataset, exportOpts) {
  var frameLyr = findFrameLayerInDataset(dataset);
  var data;
  if (frameLyr) {
    data = getFrameLayerData(frameLyr, dataset.arcs);
  } else {
    data = calcFrameData(dataset, exportOpts);
  }
```

The frame branch never looks at `exportOpts`. Reproduced:

```
$ mapshaper in.json -frame width=800 -target '*' -o out.svg width=400
[o] Wrote out.svg
<svg ... width="800" height="800" ...>
```

No message. A user who wants a 2× version of their map has no way to ask for
one and no indication that the request was dropped.

### 3. The frame only applies if it is in the export selection

`exportTargetLayers()` builds datasets from the targeted layers, and
`findFrameLayerInDataset()` searches only those. With the same frame in the
catalog:

| Command | Output |
| --- | --- |
| `-frame width=600 bbox=-5,-5,15,5 -target '*' -o a.svg` | 600 × 300 |
| `-frame width=600 bbox=-5,-5,15,5 -target in -o b.svg` | 800 × 800 |

At the CLI that is arguably correct targeting. In the GUI it is a trap: the
export dialog lists the frame as an ordinary layer with a checkbox, and
unchecking it — a reasonable thing to do, since you do not want a rectangle in
your output — silently changes the page size and crop of the map.

### 4. Frame settings are not encapsulated

`type`, `width` and `height` appear in the generic inspector and layer info
table, and generic attribute commands can invalidate a frame without explaining
the consequence. That is a real interface problem.

An accidental collision is not a major practical risk. It is unlikely that an
ordinary layer will simultaneously contain exactly one rectangular polygon,
one record, `type: "frame"` and a positive numeric `width`. Strengthening
recognition to require all of those conditions makes false positives
negligible. The design therefore does not introduce a second layer-metadata
representation solely to eliminate that unlikely collision.

### 5. Resizing a frame silently changes the scale

The `rectangles` mode moves the rectangle's coordinates and leaves `width`
alone, and `getFrameLayerData()` derives height from the new aspect ratio. So
dragging a frame handle is really a "change meters-per-pixel and change the
page proportions" gesture, presented as a resize. There is no feedback about
either consequence, and no way to express the other two things a user might
have meant (crop at constant scale, or resize the page at constant extent).

### 6. Preview mode is invisible

Described above. The user's only clue that symbol scaling is active is that
symbols change size when they zoom — which looks like a bug until you know
about frames.

### 7. Everything resolves the frame differently

Three resolution rules (dataset-first, catalog-first, visible-first) means the
frame that sizes your export can differ from the frame that scales your
symbols on screen. With one frame per session this is mostly theoretical, but
it is exactly the coupling that makes multi-frame support hard to add later.

### 8. The frame is drawn into the output

Even in the healthy case, a frame layer emits an empty path element:

```
<g id="frame">
<path d="M 0 800 0 0 800 0 800 800 0 800 Z" fill="none"/>
</g>
```

Harmless, but it means the frame is simultaneously configuration and content,
which is the confusion this whole document is about.

## Data Model

### Decided: record 0 is canonical, extent is geometry

The existing representation remains the only persisted representation. A
frame is a one-feature rectangular polygon layer whose one record contains:

```js
{
  type: 'frame',
  width: 800,                 // required, always px internally
  height: 533,                // derived compatibility value, never authoritative
  frame_aspect_ratio: 1.5,    // optional fixed page shape
  frame_units: 'px'           // optional presentation unit
}
```

`isFrameLayer()` becomes stricter rather than moving identity elsewhere:

```js
export function isFrameLayer(lyr, arcs) {
  var rec = getSingleFrameRecord(lyr);
  return lyr.geometry_type == 'polygon' &&
    getFeatureCount(lyr) == 1 &&
    layerIsRectangle(lyr, arcs) &&
    rec?.type == 'frame' &&
    rec.width > 0;
}
```

`getSingleFrameRecord()` also requires exactly one corresponding data record.
An ordinary rectangle with `type: "frame"` but no valid width is not a frame.
A multi-feature layer is not a frame regardless of record 0. These conditions
make accidental recognition very unlikely without introducing hidden state.

No consumer reads these fields directly. `getFrameLayerData()` validates and
returns a normalized value object containing bbox, effective width and height,
aspect mode, authored units and CRS. The GUI and exporters work with that
value, not with mutable table records.

### The geometry is still maintained as a rectangle

The rectangle is both part of strict recognition and the extent the user
drags. Frame-aware geometry operations identify the frame before mutation,
then rebuild its geometry from the valid result bounds before other consumers
resolve it again. See [Reprojection](#reprojection).

### Height is derived unless page shape is fixed

`getFrameLayerData()` already recomputes height from width and the extent's
aspect ratio, and the stored `height` from `-frame height=` is dead.

**Decided: store an optional authoritative `frame_aspect_ratio`, not a second
dimension whose authority is ambiguous.** When it is absent, height is derived
from width and the extent exactly as today. When the user sets both width and
height, or explicitly sets an aspect ratio, store
`frame_aspect_ratio = width / height`; runtime height is then width divided by
that ratio, and the extent is padded — not cropped — to that shape using the
existing `fillOutBbox()` logic.

This lets a composer say "600 × 400" without allowing `height`, geometry and
width to drift apart. The properties dialog may expose width and height as paired controls,
but committing height changes the optional aspect ratio; height itself remains
a derived compatibility field refreshed by frame commands, not an independent
source of truth. Clearing the fixed-aspect control removes
`frame_aspect_ratio` and returns to extent-derived height. Unmarked height in
an older frame record remains non-authoritative, preserving current output.

### Units

Width is always stored in px, as `parseSizeParam()` already produces. The
authored unit is remembered in `frame_units` so a frame created as `6in` reads
back as `6in` in the properties dialog rather than `432px`:

```js
{type: 'frame', width: 432, frame_aspect_ratio: 1.5, frame_units: 'in'}
```

`frame_units` is presentation only. Nothing computes with it.

Add a frame-specific parser that returns `{valuePx, units}` instead of losing
the authored unit as `parseSizeParam()` does. Bare numbers mean px during
creation and the frame's current authored unit during property editing. Width and
height entered with different units are normalized to px before computing an
aspect ratio.

### Persistence and generic attribute commands

There is no import promotion, duplicate runtime representation or special
`.msx` serialization. Existing GeoJSON, Shapefile and `.msx` paths already
carry geometry and record 0 together. Delimited text can carry the settings
but cannot round-trip a frame because it has no rectangle geometry.

For a recognized frame, the GUI hides reserved configuration fields from the
ordinary attribute inspector and directs edits to Frame properties. The CLI
does not make the fields immutable: explicitly targeting the frame with
`-each`, `-filter-fields` or `-rename-fields` may change or remove its role,
just as editing its geometry may. `-update-frame remove` is the documented way
to demote it. This remaining CLI sharp edge is preferable to a second
representation and a repository-wide metadata-preservation policy.

Frame-aware geometry commands such as `-proj` snapshot recognition and
settings before mutation, normalize a surviving result back to a rectangle,
and preserve the record. A result with no valid bounds errors and rolls back.
Commands that derive new layers do not receive hidden frame identity; their
outputs qualify only if they independently satisfy the strict frame contract.

### One resolver

Every consumer goes through one function in
`src/furniture/mapshaper-frame-utils.mjs`:

```js
// Returns {layer, dataset} for the session's frame, or null.
export function getActiveFrame(catalog) { ... }
```

Because the first version rejects a second frame, this resolver has no
caller-specific preference or visibility rule: every session consumer gets
the same object. `findFrame`, `findFrameLayer`, `findFrameDataset` and
`findFrameLayerInDataset` become thin wrappers or go away. Exporters that
intentionally preserve CLI target semantics receive explicit frame data from
their caller rather than silently applying a different resolver rule.

Catalog/model update boundaries enforce the zero-or-one invariant
transactionally. Import, `.msx` unpack, duplication or a derived-layer command
that would leave a second recognized frame fails before commit and names both
frame layers. `-frame replace` demotes the previous frame by removing its
reserved record fields before creating its replacement. Temporary copies made
wholly inside an export operation are exempt.

With one frame per session, this resolver is the active-frame state. It is
independent of the active command target and of preview visibility: selecting
a data layer must not change which frame export and symbol scaling use.

This is the seam multi-frame support will need. When frames gain stable IDs
and layer associations, selection policy is added here and passed explicitly
by callers rather than spread across consumer-specific searches.

### Rejected alternatives

**Move identity and settings to `lyr.frame`.** This makes the semantic role
explicit, but every copy, merge, import, export, undo and `.msx` path must then
preserve new layer metadata correctly. Ordinary formats still need the record
form, creating two representations plus synchronization and migration rules.
The practical collision risk does not justify that complexity.

**Store the extent as a bbox in metadata and drop the geometry.** Tempting,
because it makes the reprojection question moot. But then `-proj` has to
special-case frames to reproject a bbox that is not geometry, the frame has no
presence in the layer list to click on, and the user cannot clip to their
frame. The geometry is doing real work.

**Move the frame out of the catalog entirely, into `dataset.info` or a
`catalog.frame` slot.** A frame in a dataset participates in projection,
shares the dataset's CRS, is targetable by name, and round-trips through
ordinary formats. Moving it out means reimplementing those properties and
does not simplify future multi-frame lifecycle management.

## Reprojection

### A frame is a crop box, not a quadrilateral

The current behaviour treats the frame rectangle as a geographic feature whose
corners follow the projection. That is wrong in both directions: the corners
of the old page are not interesting points on the earth, and the result is not
a page.

**Rule: before projection, a frame boundary is sampled densely enough to
represent curved projected edges; after projection, its extent is the
axis-aligned bounding box of that sampled boundary, and its geometry is rebuilt
as a rectangle on that extent.** The nominal width is preserved. Height is
derived from the new extent unless a fixed aspect ratio is present, in which
case the projected extent is padded to match.

Bounding only the four projected corners is not conservative. In projections
such as Robinson, the largest projected x value can occur along an edge
between its corners, so corner-only bounds can crop content that was inside
the source frame. The implementation should reuse the adaptive projection
densification path where possible, or add a focused boundary sampler with a
documented display-error tolerance.

Before projecting shared arcs, snapshot and densify the frame boundary. Project
those samples through the same transform, clipping and interruption rules as
content; compute the union bounds of the finite projected pieces; apply any
fixed-aspect padding; then rebuild the frame rectangle.

The rebuild must use a topology-aware geometry replacement helper. Assigning
GeoJSON coordinates from `bboxToPolygon()` directly to `lyr.shapes` would
violate the arc-id representation, and a legacy frame may share its
`ArcCollection` with content layers. The helper must replace only the frame's
paths and then run the normal unused-arc cleanup without changing other
layers.

### Which datasets a `-proj` command reaches

Rebuilding the rectangle correctly is only half the problem. `-frame` calls
`catalog.addDataset()`, so a frame is always alone in a dataset of its own, and
`-proj` projects the datasets its target resolves to. The two never meet: in the
GUI the default target is the active layer's dataset, and milestone 2
deliberately excludes frames from default targets, so nothing reaches the frame
unless the user names it. Left alone, the frame keeps coordinates in a CRS the
map no longer uses, which surfaces later as a blank page rather than an error.

**Rule: `-proj` always projects the session frame, whatever its target
resolves to, and reports that it did.** The frame is the one object in the
catalog whose CRS is not independent information — its rectangle describes a
region of the map's coordinate space, so it is derived from the map's CRS rather
than describing data of its own. It holds no user content, and there is exactly
one, so there is no ambiguity about what to project or risk in projecting it.

Two conditions on the rule:

- If the frame is already in the destination CRS, it is skipped silently. It
  must not emit `Source and destination CRS are the same`, because projecting
  content *into* the frame's existing CRS is the ordinary case.
- The frame receives the destination CRS **resolved from the content**, not one
  re-derived from its own extent. `expandProjDefn()` fits `lcc`, `aea`, `tmerc`,
  `etmerc` and `utm` parameters to the bounds of the dataset being projected, so
  a frame that resolved its own would land in a different projection of the same
  family. This requires resolving the destination CRS once per command rather
  than once per target dataset — which also fixes the pre-existing case where
  `-proj lcc target=*` across several datasets produced a different projection
  for each one.

The rule deliberately stops at the frame. Content layers in other datasets still
need `target=*` or an explicit list, because which content to reproject is a real
user decision. What changes is that the divergence is no longer silent: when a
`-proj` command leaves layers behind in another CRS, it names them and points at
`target=*`.

This belongs in the command rather than in the GUI. The console records the
literal command string in session history, so a frame that were picked up only
in the browser would be skipped when the recorded script is replayed on the
command line, and the replay would produce a different map.

### Display CRS

`GuiMap#setDisplayCRS()` reprojects for display without touching the data, so
it needs the same treatment against the display geometry — the frame's display
extent becomes the bbox of the frame layer's reprojected display arcs. This
resolves the existing TODO and keeps preview mode honest when the user
switches display projection.

## CLI Syntax

Every frame mutation the GUI performs is a command, per the guardrail in
`gui-improvement-roadmap.md`, giving one implementation for data mutation,
undo capture and session history.

### `-frame` (existing, mostly unchanged)

Creates a frame. Options as today: `width=`, `height=`, `aspect-ratio=`,
`bbox=`, `offset=`, `offsets=`, `name=`, `target=`. Changes:

- Writes the strict canonical record: `type`, positive `width`, derived
  `height`, optional `frame_aspect_ratio` and optional `frame_units`.
- Supplying both dimensions writes `frame_aspect_ratio`; supplying only one
  dimension leaves page shape extent-derived.
- Errors if a frame already exists in the catalog, rather than creating a
  second one that will be silently ignored by every consumer. A new `replace`
  flag overrides the check, and `-update-frame` is the ordinary way to change
  an existing frame. (This restriction is the thing multi-frame support would
  lift.)

### `-update-frame` (new)

Modelled directly on `-update-label`, which exists for the same reason: the
GUI drags something, and the drag needs to be an ordinary command rather than
a direct mutation with hand-rolled undo.

| Option | Meaning |
| --- | --- |
| `bbox=` | set the extent (xmin,ymin,xmax,ymax in the frame's CRS) |
| `width=` | set nominal width, in px/pt/in/cm |
| `height=` | set nominal height |
| `aspect-ratio=` | set the page shape; pads the extent to match |
| `auto-aspect` | clear the fixed page shape and derive height from the extent |
| `offset=` / `offsets=` | grow or shrink the extent, as `-frame` |
| `remove` | demote the frame to an ordinary rectangle layer |
| `target=` | which frame (for forward compatibility) |

Option application is deterministic:

1. Apply `bbox=` and offsets to obtain the proposed extent.
2. Apply the aspect mode. `aspect-ratio=` and `auto-aspect` are mutually
   exclusive. A fixed aspect pads the proposed bbox and replaces the frame
   geometry with that effective extent; getters never return virtual bounds
   that differ from the geometry.
3. Apply nominal size. `width=` changes width without changing aspect mode.
   `height=` sets width to `height * effectiveAspect`; supplying both dimensions
   fixes `aspect_ratio = width / height`. Reject non-positive dimensions and
   contradictory option combinations.

Frame edits map onto combinations of these:

| Gesture | Command |
| --- | --- |
| Crop (scale locked) | `-update-frame bbox=... width=...` |
| Resize page (extent locked) | `-update-frame width=...` |
| Change scale (page size locked) | `-update-frame bbox=...` |
| Move (extent shifts, size and scale locked) | `-update-frame bbox=...` |

Implementation notes, following `mapshaper-update-label.mjs`:

- One target layer; `stop()` on more than one, since one bbox describes one
  frame.
- `stop()` if the target is not a frame, rather than quietly promoting it —
  in the GUI that would mean the hit test handed over the wrong layer.
- Call `noteLayerWillChange()` before and `markLayerChanged()` after, for both
  shapes and the data-table record, so undo has something to capture.
  This is the trap `-update-label` documents: reusing the same `shapes` array
  identity leaves nothing for the transaction to notice.

Registration touches the usual three places: `src/cli/mapshaper-options.mjs`,
`src/commands/mapshaper-update-frame.mjs`, and the dispatch switch plus import
in `src/cli/mapshaper-run-command.mjs`.

### `-rectangle width=` is deprecated as a frame writer

`applyFrameProperties()` stays for one release so existing scripts keep
working, but emits a deprecation `message()` pointing at `-frame` and
`-update-frame`. The GUI box tool stops using it immediately and calls
`-frame` instead, which also removes the oddity that the GUI's "add a map
frame" button does not run the map frame command.

## Export

### Decided: `-o width=` overrides the frame's nominal size, with a warning

Silently ignoring an explicit option is the worst of the available behaviours.
Erroring would break scripts that pass a harmless `width=`. So `width=` and
`height=` win, and export emits:

```
[o] Output width overrides the map frame's nominal width (800px);
    symbol and label sizes are not rescaled.
```

The second clause matters and is not a temporary limitation.
`fitDatasetToFrame()` transforms coordinates; it does not touch `font-size`,
`dx`, `dy` or stroke widths. `label-tool-design.md` settles this under
"Decided: native scale on export": symbols are drawn at native scale, so a
label that fits its path exactly at nominal size overflows by 2× at half size.
Until symbol rescaling exists, the warning is the honest answer.

A future `-o scale=2` that multiplies geometry *and* pixel-sized style
properties together is the clean way to export at another size. Deferred.

Export size precedence is explicit:

- With neither dimension, use the frame's nominal width and effective aspect.
- With width only, derive height from the effective frame aspect; with height
  only, derive width.
- With both dimensions, use both and pad the geographic frame extent to the
  requested aspect rather than distorting coordinates.
- `fit_bbox=` supplies its own output rectangle and is rejected when combined
  with `width=` or `height=`.

Emit the native-symbol warning whenever the resulting dimensions differ from
the nominal frame size, whether the override came from width, height or both.

### Decided: frame appearance uses composition passes, not a content layer

An unstyled frame emits no geometry. A styled frame has composition semantics:
its fill is the map background below all content, and its stroke is a neatline
above all content. The two passes are derived from the normalized frame, so
they continue to match after the frame is edited or reprojected. The GUI does
not expose or create ordinary rectangle layers for either purpose.

CLI SVG export applies the same ordering when a styled frame is among the
targets. GUI preview renders the background as a dedicated underlay and the
neatline as a dedicated overlay. Milestone 6 passes these properties with the
explicit GUI layout context, without adding backing frame geometry to the
layer checklist.

### Decided: the GUI export dialog treats the frame as output settings

The frame stops appearing in the export dialog's layer checklist. In its place,
when the selected format is one the frame affects (SVG, or TopoJSON with
`width=`), the dialog shows a line reporting the output size and extent —
"Map frame: 600 × 300 px" — and the frame is always applied.

The GUI passes the normalized frame data to the export pipeline as layout
context; it does not add the frame geometry to the user's checked content
layers. This is an explicit GUI-only export path, not another frame lookup
rule. Export resolution is centralized as
`resolveExportFrame({explicitFrame, targetDataset, catalog, mode})`: explicit
GUI context wins; CLI mode considers only a frame in the target dataset;
catalog lookup is used only to warn that a frame was excluded. SVG and
TopoJSON exporters perform no independent catalog lookup. The visible content
stack remains the initial composition model, while the export checklist still
lets the user narrow the actual content exported.

CLI targeting semantics do not change: `-target` still decides which layers go
into a file, and a frame outside the target set still does not apply. But when
the catalog holds a frame, the output format is affected by frames, and the
frame is *not* in the target set, export emits a message saying so. That turns
a silent surprise into a one-line note without changing what any existing
script produces.

## GUI: Preview Mode

The goal is that at 100% magnification, what the user sees is what the export
will be, and they can tell that is what they are looking at.

### It is a display state, not an interaction mode

Preview does not capture the pointer, so it composes with every other tool:
you can be labelling, styling or drawing while in preview. That makes it a
display option rather than an entry in the interaction-mode menu. It is a
toggle button in the nav button strip (`gui.buttons.addButton()`, alongside
home and zoom in `gui-map-nav.mjs`). It always remains clickable: with a frame
it toggles preview, and without one it opens the same creation dialog as
**add map frame**. If the session has no geographic layers, it explains that
one or more layers must be added first.

Today the state is entered implicitly by making the frame layer visible
(`isPreviewView()` keys off `findFrameLayer()` over the pinned layers). That
coupling goes away: the frame layer stops being pinnable content, and preview
becomes an explicit flag that `isPreviewView()` reads.

Frame identity remains resolvable while preview is off, but frame-constrained
full bounds and GUI symbol scaling are active only while preview is on in map
view. Export never depends on preview state. Normal map pan and zoom change
only the editor viewport; frame extent changes only through the frame tool,
numeric controls or the resize toolbar's explicit Fit action.

### What turns on

1. **The page boundary** is drawn as UI chrome — an overlay rectangle in the
   frame's extent — rather than as a layer. It does not scroll out of the
   layer list, cannot be accidentally styled, and cannot be exported.
2. **Everything outside the page is masked**, at partial opacity. This is one
   SVG path using the even-odd rule over the whole viewport, drawn once per
   render in a pointer-transparent overlay. The inner ring uses opposite
   winding as a fallback if a browser drops the even-odd style. No per-shape
   work and no per-shape allocation, per the renderer guardrail.
3. **The full-extent bounds become the frame's extent**, which
   `calcFullBounds()` already does. The 3.5–4.5% margin it adds stays: some
   space around the page is what makes it read as a page.
4. **Symbol scaling is active**, which `getSymbolScale()` already provides.
   When preview is off, `MapExtent` receives no frame data and symbol scale is
   1 even though the session frame still exists.

### The magnification readout

A small persistent readout is centered at the top of the map window, directly
under the application bar, so it does not change the dimensions of the
right-side navigation controls:

```
600 × 300 px  ·  74%
```

The percentage is `Math.round(ext.getSymbolScale() * 100)`, updated on
`MapExtent`'s existing `change` event. The nominal size is shown in the frame's
authored units. Clicking the readout opens a compact fly-out menu, following
the arrow-menu interaction without sharing its layout container: **100%**
(snap to nominal — the "this is exactly your export" view), **50%**, **200%**,
**Fit page**.

100% deserves emphasis in the UI. It is the authoring scale: the size a label
is designed at, and the one magnification at which the GUI and the SVG agree.
It should not be labelled "Actual size": CSS-pixel size is not reliable
physical print size, and Mapshaper's 72-unit inch does not match CSS's 96px
inch.

### Interaction with table view and no-frame sessions

`isPreviewView()` already excludes table view. With no frame, clicking the
frame button starts frame creation, while the readout remains hidden;
`getSymbolScale()` returns 1 and nothing else changes.

## GUI: The Frame Tool

### Mode registration

A `frame` interaction mode, registered in `gui-interaction-mode-control.mjs`
with the label "edit map frame". Unlike the other modes, its availability does
not depend on the active layer's geometry type — a frame is a property of the
map, not of the layer you happen to have selected. It is entered from
**Resize frame** in the frame row's context menu, not from a second nav button.
The one frame-related nav button is the preview toggle and stays at the bottom
of the nav stack. The mode must not close when the user selects a different
layer, which is the same problem the label tool solved with
`labelModeIsAvailable()`.

Entering the mode turns on preview if it is not already on.

### Creating a frame

Two entry points, both running `-frame`:

- **Fit visible layers.** Uses the merged bounds of the current
  visible/pinned content stack and applies an optional margin, defaulting to
  2% — near what `calcFullBounds()` already adds on screen, so the page
  resembles the view it was made from. This makes the existing composition
  state useful without pretending it is a persistent frame-to-layer
  association.
- **By drawing.** A frame-specific use of `HighlightBox` takes two corner
  clicks, supports draggable handles, and shows only **Done** and **Cancel**.
  It does not open the general rectangle-tool menu. The rectangle tool's
  existing Frame action remains an additional creation path. A transient
  non-blocking popup explains the two-click gesture and disappears after the
  second corner is placed. This drawing state does not highlight the pointer
  tool's arrow button.

When no frame exists, the Map frame section remains visible and shows an
**add map frame** entry. It opens a compact creation dialog offering both
paths; the existing rectangle-tool path remains available.

There is deliberately no "frame this view" button. It was the most natural
gesture for a viewport object, but once the dialog also sets an aspect ratio
and a margin it became the one option whose result would not match its name:
both settings silently alter the extent you just chose by eye. For the same
reason the margin applies only to Fit visible layers — a drawn box is already
the extent the user meant — while the aspect ratio applies to both, since it
describes the page rather than the area.

The dialog's settings are Output width, Aspect ratio and Margin, each with the
app's hoverable `?` beside it saying what the field will accept. Aspect ratio
is a free text field taking either a number or a `w:h` ratio, and blank — the
default — means the frame area gives the shape. It parses through
`gui-frame-aspect.mjs`, which is also what the Frame properties panel formats
its read-only ratio with, so a ratio entered as `3:2` reads back as `3:2`.

A ratio set here holds the box drawn by **Draw on the map** while it is
dragged, and the drawing instructions name the ratio being held. This is not
cosmetic. `-frame aspect-ratio=` reaches the shape by way of `fillOutBbox()`,
which only ever pads, so an unconstrained box is silently grown to the ratio on
Done — draw a tall box with `16:9` set and the frame that appears is several
times wider than the one drawn. Constraining the drag makes that padding
approximately zero, so what is drawn is what is created.

The constraint lives on `HighlightBox` as `setAspectRatio()` and covers both
the rubber band and the handles, since the draw box offers handles in the same
gesture. Its two pure helpers sit in `gui-frame-aspect.mjs` with the parsing,
under direct unit test: `getCornerForRatio()` places the pointer-side corner
while the band is dragged, and `applyAspectRatio()` reshapes a box a handle
drag has pulled off ratio. Both grow the short side rather than trimming the
long one, so the box never shrinks away from the pointer. Shift-to-square
became the `ratio = 1` case of the same helper rather than a second code path,
and an explicit ratio takes precedence over shift.

The resize overlay takes the same treatment from the other end: `syncFrameOverlay()`
passes the frame's `aspect_ratio` to the box, so the handles of a frame with a
fixed shape are constrained and those of an extent-shaped frame stay free. The
flaw was identical — `-update-frame` pads to the fixed ratio the same way — and
this is the wiring a ratio control in the resize toolbar would drive.

Because the band is constrained in screen pixels, the guarantee is exact only
where the display CRS is a uniform scaling of the layer CRS — the usual case.
Under dynamic reprojection `getDisplayBoundsInLayerCRS()` can return a bbox
whose ratio differs slightly, and `fillOutBbox()` still trues it up; the frame
is always exactly the requested shape, and only the preview can be marginally
off.

The two extent buttons sit under a **Frame area** heading: two equally weighted
buttons with no caption read as a list of actions rather than as a choice
between two ways of doing one thing.

The dialog's content carries `label-style-panel`, which is where the flat field
look lives — no bezel, and a focus ring that is a border rather than a glow —
with `frame-create-form` turning off the panel chrome that the class also
carries, exactly as `frame-properties-form` does. Its alert box opts out of
`overflow: auto`, because the tips are drawn above the `?` that opens them and
would otherwise be clipped.

### The three gestures, one at a time

The frame gets its own handle overlay, built on `HighlightBox` with
`handles: true` (`src/gui/gui-highlight-box.mjs`), which already implements
corner/edge/center handles, shift-symmetric resize and shift-square resize.
What it does not have is any notion of what a resize *means* for a frame.

**Decided: handle drags crop by default, and the alternative is a visible
toggle rather than a hidden modifier.**

| Gesture | Default meaning | Effect |
| --- | --- | --- |
| Drag edge or corner handle | **Crop** | Extent changes; nominal size changes with it; scale constant. You reveal or hide map area at the same zoom. |
| Drag edge or corner handle, with **Lock size** on | **Change scale** | Extent changes; nominal size fixed; scale changes. You fit more or less map onto the same page. |
| Drag the frame interior (center handle) | **Move** | Extent shifts; size and scale constant. |

The lock is a two-state control in the mode's floating toolbar, so the current
meaning of a drag is always on screen. A Done button exits resize mode.
`HighlightBox`'s
shift modifiers (symmetric, square) keep their existing meanings and compose
with either mode.

Crop-as-default is the right default because it is the gesture that does not
change anything the user has already decided. Their symbols are sized for a
scale; cropping preserves it. It is also the one that behaves like every other
cropping interface.

With fixed aspect, edge and corner drags constrain the proposed bbox about the
opposite handle, or about the center during a symmetric drag. Crop computes
the new nominal width from the old CRS-units-per-display-unit ratio and the
normalized extent width. Numeric bbox edits instead pad symmetrically to the
fixed ratio unless a future anchor option says otherwise.

During a drag, the readout updates live so the consequence is visible: with the
scale fixed the output size changes, with the output fixed the percentage
changes.

### Properties and resize controls

The frame row opens a compact **Frame properties** dialog with:

- **Width** and **Height** numeric fields, side by side, with a unit selector
  (px/pt/in/cm). Either one rescales the frame and the other follows. They are
  sent one at a time on purpose: `-update-frame` reads a lone `width=` or
  `height=` as a rescale and derives the other from the extent, but reads the
  two together as a new page shape and stretches the extent to fit it.
The panel is 264px wide, the same as the creation dialog. Getting there was
mostly a matter of not letting single controls own a row: the neatline's width
sits on the neatline's own row with the colour and opacity it applies to, so
the appearance rows are a three-column grid and the background row simply
leaves the last column empty. That also stops the colour field stretching, and
the details grid's label column is sized for "Aspect ratio" rather than padded
out. The column is fixed rather than `auto` so the ratio at the top of the
panel lines up with the details at the bottom, which are a separate grid.

- The **aspect ratio**, read-only, saying whether it is fixed or taken from the
  extent — the thing that decides how the pair above behaves. Setting a ratio
  reshapes the extent, so it belongs to the resize tool rather than here.
- Read-only extent and CRS details
- **Background** fill and **Neatline** stroke controls, each colour with its
  opacity inside its field, and the neatline's **Width** beside it. These style the frame
  directly but render in separate bottom and top composition passes.

The panel has no Name field: the frame's name is edited in place in the Map
frame row, like any other layer's.

Ground resolution was shown here and has been removed. A single figure is
wrong in two ways: resolution varies across a map in proportion to scale
distortion, and `getMapFrameMetersPerPixel()` returns a badly wrong number for
unprojected data — it probes a point `1/to_meter` coordinate units away, which
for a geographic CRS is one degree rather than one metre, and then inverts it
as though it were radians. A world frame 800px wide reported 432 km/px against
a true figure near 51. Showing it as a range would be worth having, but needs
that function fixed first. Editable print scale remains deferred; it would be
misleading without an explicit physical-output contract.

The layer panel gets a separate, non-pinnable **Map frame** section whose row
opens this dialog. Its second line is **Size** followed by the output size,
not generic layer contents. Its context menu contains **Frame properties**,
**Resize frame**, and **Delete frame**. The frame remains discoverable and
targetable by name, but it is no longer mixed into the content visibility
stack. No frame-membership checkboxes are added in this version; ordinary
layer visibility remains the composition control.

The GUI model also excludes recognized frames from active/default targets
whenever content layers exist. Creating or editing a frame therefore preserves
the active data layer, does not change its unpinned visibility, and does not
redirect the next implicit console command to the frame. Explicit commands
such as `-update-frame target=frame` still resolve and mutate the frame without
selecting it. This is a GUI rule only: CLI command-pipeline targeting remains
unchanged, preserving scripts that style or export a newly created frame
without an intervening `-target`.

**Resize frame** turns on preview, displays the handle overlay and opens only
a compact floating toolbar. The size mode, the fixed ratio, Fit with its margin
and Done live there; numeric and appearance controls do not compete with the
map in a large persistent panel.

The mode was a single button that rewrote its own label between Crop and Change
scale. The distinction it draws is real — when the extent changes, either the
map scale is held and the output grows, or the output is held and the scale
changes — but a self-relabeling toggle gives the user no way to tell the mode
they are in from the mode a click would put them in. It is now a two-segment
control, **Fix scale** and **Fix output**, with both labels visible and the
active one lit.

The labels name the invariant rather than the action, because the action is the
same either way: you change the extent, and all that differs is which quantity
absorbs it. Naming the action is what made the old pair confusing, and it is
why "Resize"/"Rescale" was rejected too — near-synonyms that do not say what is
being resized. "Output" is the word already on screen for the page in the
creation dialog and Frame properties ("Output width"), which "size" would have
left ambiguous against the frame's other size, its geographic extent.

There is no caption over the pair. An earlier "Drag changes" was wrong as well
as redundant: the mode governs **Fit** too, not just the handles.

Because the mode reaches Fit, `-update-frame` grew a `fix-scale` flag: hold
ground units per output pixel and derive the size from the new extent. The
alternative was for the GUI to compute the width, as the drag path still does,
but a fitted extent can also be padded by a margin, and the width has to follow
the padded extent — which the GUI would only know by redoing the command's
offset arithmetic. Putting it in the command keeps one implementation and gets
the ordering right by construction. The drag path could move onto the flag
later.

Fixing that ordering exposed a related bug. `-update-frame` applied offsets by
calling `applyPixelOffsets()` with the frame's stored width *and* height, and
that function pads the bbox out to the page shape before measuring pixel
margins. With a derived height the stored page shape is just the old extent's
shape, so `bbox= offset=` together held a re-fitted frame to its old shape
instead of letting it take its new bounds. The aspect mode is now resolved
before offsets are applied, and a page height is passed only when the shape is
actually fixed.

Beside the mode is a **Ratio** field, the same free text the creation dialog
takes, blank meaning the extent gives the shape. It is here rather than in
Frame properties because this is where the shape is worked out by dragging, and
it drives `frameBox.setAspectRatio()` so the handles obey the moment it is set.
It writes through `-update-frame aspect-ratio=`, or `auto-aspect` when cleared,
and reads back the ratio the frame actually has: a ratio with a name keeps its
`w:h` form, one without shows as a number. Frame properties keeps displaying
the ratio read-only.

**Margin** sits after Fit rather than with the frame settings, because it is
not frame state: it pads the fitted bounds and is then spent, exactly as it
does on the creation dialog's Fit visible layers row. It reaches the command as
`offset=`, so its unit handling lives in one place.

The mode control and the two fields needed new `FloatingToolbar` primitives,
`addSegmentedControl()` and `addTextField()`, since the toolbar previously had
only buttons and separators. Text buttons also needed `white-space: nowrap` and
`flex: none`: the toolbar is a flex row, which was squeezing a two-word label
onto two lines. The fields stop keydown propagation, because `gui.keyboard`
listens on the document and would otherwise run map shortcuts while a field has
focus; Enter commits and Escape abandons the edit and leaves the field rather
than closing the tool around it.

The tool also has to close when its subject goes away, which needs two
listeners rather than one. Resizing is a preview-mode gesture — the handles sit
on the page boundary preview draws — so `preview_mode_change` with
`enabled: false` turns the mode off; without it the toolbar and handles were
left stranded over an ordinary map view. Deleting the frame is caught on
`model.update` instead. Preview mode drops itself on that same event when the
frame disappears, which would cascade into the first listener, but the order of
model listeners is not a contract worth depending on, so the tool checks for a
frame itself.

The map keeps a display copy of the frame layer (`layer.gui`), and it has to be
discarded whenever the frame's coordinates can have moved, or the map draws the
frame it used to be. `-update-frame` was handled; `-proj` was not, because it
rewrites the frame through the sweep that projects the data rather than through
a frame command, so the display copy survived holding the pre-projection
rectangle — the frame appeared unprojected and empty even though the model and
the exported file were correct. The invalidation now covers any update where
arcs may have changed. `findFrameLayer()` rebuilds the copy on demand and the
frame is one rectangle, so discarding it freely costs nothing.

Projecting the frame itself has two wrinkles, both handled in
`rebuildProjectedFrameLayer()`. A frame is a viewport rather than data, so it
can legitimately extend past the edges of the globe — fitting a near-global
extent to a fixed aspect ratio pads it with whitespace that can reach beyond a
pole. Those coordinates have no projected equivalent, and
`projectAndDensifyArcs()` drops a whole arc when any vertex fails, which took
out three sides of the rectangle and made `-proj` fail outright with "Unable to
project map frame". The sampled boundary is now clamped to valid lat/long
first, so the frame projects and only the off-globe padding is lost. Second,
projecting a rectangle's boundary and taking its bounds does not preserve the
rectangle's shape, so a frame that declares `frame_aspect_ratio` is padded back
out to that ratio afterwards; a frame without one gets its derived `height`
recomputed, since `getFrameLayerData()` recalculates height anyway but the
record is what ends up in an output file.

Neither frame mode lights up the pointer button. They are reached from the
layer panel and the frame menu, never from that button's menu, so a highlight
there points at a tool the menu does not list. `frame_draw` was already
excluded; `frame` is now excluded through the same predicate that keeps
`updateCurrentMode()` from closing a frame mode for being absent from the
active layer's tool list.

### Command-backed edits, and drag granularity

Every commit runs through `runGuiEditCommand()` (`src/gui/gui-edit-command.mjs`).
A drag previews by moving the overlay only — no data mutation — and emits one
`-update-frame` on mouseup. A numeric field emits one command on commit, not
per keystroke.

This is the granularity the label tool settled on and the reason is the same:
one command per gesture keeps session history readable and undo steps
meaningful. A frame drag has no intermediate states worth undoing.

Because every edit is a command, undo, redo and session history come from the
existing machinery with no frame-specific code. The one thing to verify is
that an undone `-update-frame` refreshes the preview overlay and the readout,
which means the frame tool must listen for model updates rather than assuming
it is the only thing that changes the frame.

Each completed command refreshes the normalized frame, map bounds, property
controls, magnification readout, frame handles, hit/selection state and overlay
rendering from model state. The resize mode follows the style-tool lifecycle:
`interaction_mode_change`, `model.update`, `undo_redo_post` and
`map-needs-refresh`. No direct GUI mutation is allowed to become a second
source of frame state.

## Where The Code Will Live

| Path | Change |
| --- | --- |
| `src/furniture/mapshaper-frame-utils.mjs` | strict recognition; normalized frame data; `getActiveFrame()` and export resolver |
| `src/furniture/mapshaper-frame-projection.mjs` | sampled projected bounds and topology-safe frame rectangle rebuild |
| `src/commands/mapshaper-frame.mjs` | write the canonical record; honour `height=`; error on a second frame |
| `src/commands/mapshaper-update-frame.mjs` | **new** |
| `src/commands/mapshaper-rectangle.mjs` | deprecate `applyFrameProperties()` |
| `src/commands/mapshaper-proj.mjs` | sample the frame boundary and rebuild topology-safe rectangular geometry from projected bounds |
| `src/cli/mapshaper-options.mjs` | `-update-frame` options; `-frame` changes |
| `src/cli/mapshaper-run-command.mjs` | dispatch + import for `-update-frame` |
| `src/svg/mapshaper-svg.mjs` | frame emits no geometry unless styled; `width=` override + warning |
| `src/io/mapshaper-export.mjs` | accept explicit GUI frame context; message when a CLI frame exists outside the target set |
| `src/mapshaper-internal.mjs` | export the frame resolver and `isFrameLayer` for the GUI |
| `src/gui/gui-preview-mode.mjs` | **new** — toggle, mask, page boundary, readout |
| `src/gui/gui-frame-resize-tool.mjs` | **new** — interaction mode, creation dialog, handles and resize toolbar |
| `src/gui/gui-frame-properties.mjs` | **new** — editable frame properties dialog |
| `src/gui/gui-map.mjs` | `isPreviewView()` reads the explicit flag; display-CRS frame fix |
| `src/gui/gui-display-layer.mjs`, `gui-dynamic-crs.mjs` | isolated rectangular display frame using the dynamic display transform |
| `src/gui/gui-map-extent.mjs` | unchanged, but `getSymbolScale()` becomes user-visible |
| `src/gui/gui-box-tool.mjs` | frame button runs `-frame` |
| `src/gui/gui-layer-control.mjs` | frame is not ordinary pinnable content |
| `src/gui/gui-layer-control.mjs` | recognized frame rows open Frame properties instead of generic attribute editing |
| `src/gui/gui-export-control.mjs` | frame out of the checklist, output size line in |
| `src/gui/gui-interaction-mode-control.mjs` | register the `frame` mode |

Per the GUI guardrail, the new `src/gui` files reach core functions through
`internal.*` rather than importing from `src/furniture` or `src/commands`
directly, and `www/mapshaper-gui.js` gets a size check after the tool lands.

## Milestones

Staged so that each one is independently shippable and testable, with the
invisible correctness work first — it is the part that is failing today, it is
all CLI-testable, and the interface work is easier to trust on top of it.

**1. Correctness, no new interface — implemented.** Frame survives `-proj`,
using a sampled boundary rather than four corners. `-o width=` and `height=`
are honoured with a warning. Dynamic display projection uses an isolated
rectangular display frame. Unstyled frame geometry is not drawn into SVG
output. This does not depend on milestone 2: rebuilding the frame's geometry
as a rectangle on its projected bounds preserves the existing
record-and-rectangle contract.

**2. Encapsulated frame contract — implemented.** Recognition now requires one
rectangular polygon, one record, `type: "frame"` and a finite positive numeric
width. Frame data is normalized through `getFrameLayerData()`;
`getActiveFrame()` is the single session resolver and exports use an explicit
target-dataset resolver. Catalog additions and layer-producing command updates
reject a second frame before integration, including multi-dataset import and
layer duplication. `-frame replace` demotes the previous frame, and frame
writers preserve authored units and fixed aspect ratios. Frame properties now
owns these controls; generic attribute and layer-info surfaces do not expose
the backing record.

**3. `-update-frame` — implemented.** The command updates extent, offsets,
aspect mode and nominal size in the documented order, or demotes the frame
with `remove`. It validates a single recognized frame target, rejects
contradictory dimensions and aspect options, preserves custom record fields,
and rebuilds rectangle geometry through the topology-safe replacement path.
CLI tests cover each option, invalid combinations and a frame sharing topology
with another polygon layer.

**4. Preview mode — implemented.** Preview is now an explicit display state,
independent of layer visibility. Its nav toggle enables frame-constrained
bounds and symbol scaling; an SVG overlay draws the page boundary and a
single even-odd outside mask without adding work to per-shape render loops.
The readout reports nominal size and live magnification and offers 50%, 100%,
200% and Fit page actions. Table view suspends preview rendering without
clearing the toggle. The backing frame is excluded from map content and moved
to a separate non-pinnable Map frame section in the layer panel. Focused
browser tests cover no-frame, toggle, overlay, readout, 100% snapping and
table-view behavior.

**5. The frame tool — implemented.** The nav contains one frame-related
button: the preview toggle, using the frame icon at the bottom of the stack.
The separate Map frame section stays visible when empty and opens a compact
two-path creation dialog. A frame row opens Frame properties, which rescales
through authored size and units, reports the aspect ratio and extent, and
edits background and neatline. Its context menu also starts a dedicated resize mode with
handles and a compact crop/change-scale and Done toolbar. Handle drags move
the frame, crop at constant scale by default, or change scale with page size
locked; one command is committed per gesture and undo restores both geometry
and frame data. Preview and SVG output render background and neatline in
separate bottom and top composition passes. Focused browser tests cover
creation, properties, layer-row entry, gesture semantics, undo and style
ordering.

**6. Export dialog — implemented.** The frame is omitted from the layer
checklist and reported as output settings for SVG and pixel-sized TopoJSON.
The GUI passes normalized frame data and appearance explicitly to the export
pipeline, so selected content is fitted without adding backing frame geometry.
SVG export emits the background before content and the neatline after it.
Project-package export includes the frame automatically even though it is not
a selectable content layer.

Multi-frame support is explicitly not a milestone here. Milestone 2's resolver
is the seam it would be built on.

## Known Limitations

- **Reprojection bounds a sampled projected boundary.** It is an approximation
  controlled by the projection densification tolerance. Pathological custom
  projections may require re-fitting or a tighter sampler; four-corner
  projection is not an acceptable fallback.
- **Export at a non-nominal size does not rescale symbols.** Settled in
  `label-tool-design.md`; a future `-o scale=` is the fix.
- **One frame per session.** A second `-frame` is an error rather than an
  inset.
- **A frame does not clip.** It sets the extent and the page; content outside
  it is cropped by the SVG viewBox on export and masked in preview, but the
  data is untouched. `-clip bbox=` remains the way to actually cut.
- **No print furniture.** Bleed, trim marks and page margins distinct from
  frame offsets are not modelled.
- **CLI field commands remain powerful.** Explicitly removing or renaming
  reserved frame fields can demote a frame — and can also promote an ordinary
  one-record rectangle into a second one. Because the GUI resolves the frame on
  every render, `getActiveFrame()` degrades to a deterministic choice plus one
  warning rather than an error; refusing the change is the catalog guard's job,
  where it can still be rejected before it is committed. The GUI prevents
  accidental edits, but the canonical record is not made immutable.
- **`-proj` reaches the frame, not the rest of the session.** Content layers in
  other datasets still need explicit targeting; the command names the ones it
  left behind.

## Resolved Product Choices

1. **The frame remains discoverable in the layer panel**, in a separate
   non-pinnable Map frame section. Its row opens Frame properties; it is not a
   content visibility control.
2. **A frame is never created implicitly.** Mapshaper remains useful for
   one-layer data editing without introducing page state. An add-map-frame
   entry in the empty Map frame section makes creation easy when composition
   is intended.
3. **Editable print scale is deferred.** The first panel may show reliable
   ground resolution as read-only context, but the primary live number is
   magnification relative to nominal authoring size.
4. **Table view suspends preview rendering without clearing the preview
   toggle.** Returning to map view restores the page mask, boundary and
   readout.
5. **Layer membership remains transient.** The visible/pinned stack supplies
   the initial composition and Fit visible layers bounds. Persistent
   frame-to-layer association waits for stable layer IDs and project-level
   composition metadata; names and catalog indices are not durable references.
   "Visible content stack" means the ordered layers the map currently renders:
   the visible active layer plus pinned visible geographic content, excluding
   the map frame and editor-only overlays/furniture. Fit visible layers and
   the GUI export dialog's initial selection use one shared helper for this
   set.
6. **Hard renderer clipping is deferred.** The first preview uses the outside
   mask to make the page boundary clear without modifying hot canvas loops.
   True canvas/SVG clipping may be added after GUI/export parity is covered,
   but it is not a milestone in this plan.
7. **Record 0 remains canonical.** The stricter recognition predicate and
   normalized frame API provide the semantic boundary. Moving the same
   settings into `lyr.frame` would create a second representation and a broad
   metadata-preservation obligation without solving a likely user problem.

## Test Plan

Unit tests, which should cover most of milestones 1–3:

- `isFrameLayer()` accepts exactly one rectangular polygon, one record,
  `type: "frame"` and positive numeric `width`; reject missing width,
  multi-feature layers, multiple records and nonrectangular geometry.
- Normalized frame data covers extent-derived and fixed-aspect height,
  `frame_units`, and the rule that unmarked legacy height is
  non-authoritative.
- GeoJSON, Shapefile and `.msx` round trips preserve the canonical frame
  record without a metadata conversion step.
- Import, `.msx` unpack and layer duplication reject a second frame
  transactionally; `-frame replace` demotes the old frame and leaves exactly
  one.
- `-proj` across several projections (merc, robin, moll, an interrupted one):
  frame identity survives, geometry is a rectangle afterwards, extent is the
  bbox of the sampled projected boundary, nominal width unchanged, and a
  feature near a curved-edge extremum is not cropped.
- Projection is safe when the frame and content initially share an
  `ArcCollection`; dynamic display-CRS preview uses the same effective bounds.
- Projection tests must cover the configuration `-frame` actually produces —
  the frame alone in its own dataset — and not only the shared-`ArcCollection`
  case. Targeting a data layer projects the frame to the same CRS; a frame
  already in the destination CRS produces no message; `-proj lcc` expands its
  parameters once and applies them to both; a round trip back to lat-long
  leaves the frame in degrees.
- Generic attribute removal can deliberately demote a frame; frame-aware
  geometry commands preserve its canonical record and rectangular result.
- `-update-frame` for each option, and each of the three gesture combinations;
  error cases (multiple targets, non-frame target, collapsed bbox).
- `-o width=` with a frame produces the requested size; the warning is emitted.
- Export option precedence covers height-only, width-only, both dimensions,
  conflicting `fit_bbox=`, and native-size output with no warning.
- A frame layer with no style emits no geometry; with a style, it does.
- GUI export uses explicit frame context without adding frame geometry to the
  selected content layers; CLI target semantics remain unchanged.
- Output byte-compared against a baseline for an unframed project, to confirm
  milestone 1 changes nothing for sessions without frames.

Browser tests (`browser-tests/`) for milestones 4–5:

- Preview toggle: mask appears, boundary drawn, readout matches
  `getSymbolScale()`.
- With preview off, an existing frame does not constrain GUI full bounds or
  symbol scale, and export still uses it.
- Snap to 100%: the rendered symbol scale is exactly 1, and page-interior
  symbol transforms and dimensions match SVG output, excluding preview chrome,
  outside mask, viewport margin and antialiasing.
- Fix scale drag or fit: percentage constant, output size changes.
- Fix output drag or fit: output size constant, percentage changes;
  fixed-aspect drag anchoring is preserved.
- Undo after a frame drag restores the extent, the overlay and the readout.
- Create, delete, rename and numeric edits produce correct undo and replayable
  session history.
- Opening a recognized frame does not expose reserved fields in the generic
  attribute editor.
- Selecting a different layer while resize mode is open does not close it.
- Fit visible layers uses the current pinned/visible stack but creates no
  persistent membership metadata.
- Entering table view suspends preview and returning restores it.
