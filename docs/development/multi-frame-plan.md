---
title: Multiple map frames — feasibility and development plan
description: Assessment of FRAME_NOTES.txt against the current single-frame implementation, a recommended data model, and staged milestones.
---

# Multiple Map Frames: Feasibility and Plan

Starting point: `FRAME_NOTES.txt` (product ideas) and
`frame-tool-design.md` (the shipped single-frame design, which named
`getActiveFrame()` as the seam for this work).

## Summary

The feature is feasible, and the single-frame work left the code in a good
position for it: frame recognition, normalized frame data, `-update-frame`,
preview mode and the resize tool all operate on one `{layer, dataset}` pair
and do not care how that pair was chosen. About a dozen files resolve "the"
frame through `getActiveFrame()`, and one guard (`assertSingleFrameUpdate()`)
enforces the one-frame limit. Those are what change.

The hard part is not rendering or export. It is **membership**: deciding,
durably and replayably, which layers belong to which frame. Everything in the
notes — the layers menu structure, import destination, drawing tools,
reprojection of a frame, per-frame export — depends on that answer.

**Recommendation: a frame is a group of datasets.** The frame layer and its
furniture stay in their own dataset, as today. Each content dataset belongs
to at most one frame, recorded by a reference on the dataset. A frame can
contain any number of datasets, so detailed sources imported separately keep
their own `ArcCollection`s, and `-simplify`, `-smooth` and `-clean` keep
acting on one source at a time, while the user edits them in the frame's
preview. Unframed layers are layers in datasets with no frame reference.

Rough size: comparable to the single-frame project as a whole — several
milestones, each independently shippable, CLI/core first.

## Current State (relevant facts)

- One frame per session. `-frame` creates the frame alone in a new dataset;
  furniture (`-scalebar`) is added to that dataset. Content layers are not
  associated with the frame; composition is the GUI's visible/pinned stack,
  or the CLI export target set.
- **No stable layer IDs.** Identity is object reference. Undo IDs are
  ephemeral `WeakMap` entries. `-dissolve`, `-merge-layers`, `-split`,
  `-clip` and others return new layer objects through `replaceLayers()`.
  A frame → layer list keyed by layer object or name would go stale
  constantly (`layer-metadata.md` reaches the same conclusion for other
  metadata).
- **Datasets are durable.** Commands replace layers *within* a dataset;
  `no-replace` outputs land in the same dataset; `.msx` serializes datasets
  in order, including `info` (`exportInfo()` copies every key except the
  proj object); undo already captures a dataset's `layers`, `arcs` and
  `info`, with a dedicated dataset-info unit.
- **Split and merge exist.** `splitApartLayers()` moves layers into new
  datasets with pruned arcs and keeps simplification thresholds
  (`getFilteredCopy()`), copying `info`. `mergeDatasets()` concatenates arc
  collections, but `mergeArcs()` bakes in simplification when a source has a
  retained interval > 0 and drops thresholds otherwise.
- **The frame rectangle is not protected from simplification.** Verified:
  a frame sharing an `ArcCollection` with content survives `-simplify 0.5%`
  but is reduced to 0 vertices at `0.01%`. This matters only if a frame
  shares a dataset with content, which the recommended model avoids.
- `-proj` projects whole datasets and has a special rule that always also
  projects "the session frame".
- `-simplify` works per `ArcCollection`. Percentages are relative to each
  dataset's own vertex count; `interval=` is absolute in map units;
  `resolution=` is derived from arc bounds, not from a frame.
- Export: rendered formats (SVG/PNG/JPG/HTML/TopoJSON-with-width) merge all
  target datasets into one copy and render one frame.
- GUI: layer menu already has drag reordering (GUI-only `menu_order`, not
  undoable, not a command) and a separate Map frame section. Pinning is GUI
  state, not undone, not saved by the snapshot `gui` slot (which returns
  `null`). Imports always create new datasets. Draw links run `-add-layer`,
  which creates a new dataset.

## Data Model

### Options considered

**A. A frame is one dataset.** The frame layer, its furniture and all its
content share one dataset and one `ArcCollection`. Membership is purely
structural: it survives every command, needs no new metadata, and gives one
CRS and one simplification level per frame by construction.

Rejected as the primary model because it couples the vector editing of
every source in the frame. Making a map usually means importing several
detailed files and refining each with `-simplify`, `-smooth` and `-clean`,
which operate on the whole `ArcCollection`: simplifying the coastline would
simplify the roads, a single GUI slider would govern every source, and
moving a layer into a frame would merge arcs (baking in simplification,
copying coordinates, and exposing the frame rectangle to simplification).
Users would have to finish editing before framing, which is backwards —
simplification is best judged in the framed preview at output scale.

Its strengths survive as an *optional* step: once shapes are final, a user
can consolidate a frame's datasets (`-merge-layers` or a dedicated option)
if they want shared topology. Nothing requires it.

**B. A frame is a group of datasets (recommended).** The frame layer and
furniture stay alone in a frame dataset, exactly as now. Each content
dataset carries a reference to at most one frame.

- Sources stay separate and keep independent simplification and topology.
- The existing frame code is barely disturbed: the frame still lives alone
  in its own dataset, so its projection rebuild, recognition and furniture
  logic are unchanged, and `-frame` keeps its structure.
- "A dataset cannot span frames" holds by construction.
- Membership lives on the durable object (the dataset), and dataset `info`
  is already undo-tracked and serialized in `.msx`.

Costs, each addressed below: the frame's single CRS must be enforced rather
than being structural; commands that create datasets need an inheritance
rule; the reference must survive frame renames; dividing a dataset between a
frame and the unframed group requires a split.

**C. Membership on layers** (`lyr.frame`). Rejected for the reasons in
`layer-metadata.md`: layer objects are replaced too often. Kept in reserve
as a narrow extension (see [Divided datasets](#divided-datasets)).

### Dataset IDs and the membership reference

**Every dataset gets a random ID** (`dataset.id`) when it is created. The
ID is immutable, unique when assigned, and serialized in `.msx`. It has two
jobs: frames are identified by the ID of their frame dataset, and splits
record lineage (see [Divided datasets](#divided-datasets)).

**Membership is `dataset.info.frame = <frame dataset ID>`.** References
survive frame renames with no rewriting; names stay unique for the user's
sake and the CLI resolves names to IDs.

Where each value lives matters, because `info` is copied freely:

- `info.frame` *should* travel with derived data. `copyDatasetInfo()`
  (used by `-buffer`, polygon grids) and `splitApartLayers()` copy it, which
  correctly keeps derived output in its source's frame. Changes go through
  `noteDatasetInfoWillChange()` / `markDatasetInfoChanged()`, so undo needs
  no new unit.
- `dataset.id` *must not* travel by accident: a copied ID would let unrelated
  derived data rejoin its source. Keeping it outside `info` means the
  existing `info` copies cannot leak it; only the split performed when
  layers move between frames copies it deliberately. `exportDataset()` and the unpacker
  must add the field. Because it never changes after creation, undo does not
  need to capture it.
- Datasets from older `.msx` files, and any created before this change, are
  assigned an ID on load. If an imported ID collides with an existing one
  (unlikely with ~48 random bits), the incoming dataset is re-keyed along
  with any references to it.
- A frame dataset is never split, so exactly one frame dataset holds a given
  ID. Copying a frame assigns fresh IDs to the frame dataset and every copied
  member and points the copies at the new frame.
- Exported data formats (GeoJSON, Shapefile) do not carry IDs or
  membership. That is acceptable: a multi-frame composition is a project
  (`.msx`) concept.

### Invariants (replacing `assertSingleFrameUpdate()`)

Enforced at the same catalog/command-integration points as today:

1. Frame names are unique across the catalog.
2. A frame dataset holds exactly one frame layer plus furniture; content
   datasets hold no frame layer.
3. A dataset's `info.frame`, if present, is the ID of an existing frame
   dataset. Deleting a frame clears its members' references (they become
   unframed), in the same command.
4. Member datasets are in the frame's CRS, as far as metadata can tell (see
   [CRS and reprojection](#crs-and-reprojection)).
5. Overlay references name an existing frame, a frame does not overlay itself,
   and overlay chains have no cycles. A first version can limit nesting to one
   level.

### Keeping the reference correct

This is the price of model B, so it should be audited deliberately rather
than discovered.

**Datasets created by commands** — about a dozen `catalog.addDataset()` call
sites in `mapshaper-run-command.mjs`, plus `mergeCommandTargets()`,
`-target` combine, `-external` and `mapshaper-command-utils.mjs`. Apply one
central rule: an output dataset derived from target datasets inherits their
frame if they all share one, and is unframed otherwise. Datasets made from
nothing (`-i`, `-graticule`, `-shape`, `-add-layer`) are unframed unless the
command is given a destination (GUI imports and draw links pass the active
frame; see below).

**`info` propagation.** `mergeDatasetInfo()` (both versions) uses
`utils.defaults()`, so a merged-in source can leak its reference into an
unframed destination. This happens in practice: `-clip`, `-erase`,
`-divide`, `-inlay` and polygon joins with a source in another dataset build
a temporary dataset with `mergeLayersForOverlay2()`, which merges `info`
with the target first. Treat `frame` like `input_geojson_metadata`: never
inherited from a merged-in source.

### Commands that combine layers across datasets

**Overlay sources may come from anywhere.** `-clip`, `-erase`, `-divide`,
`-inlay` and `-join` may name a source layer that is unframed or in another
frame. The source is an input; the output stays in the target's dataset and
frame, and the source is unchanged. Today's CRS check only rejects mixing
projected and lat-long data, which lets two different projected CRSs combine
silently; with frames that mismatch becomes more likely. Use the same rule as
joining a frame: the same transform when both CRSs are known, the existing
check otherwise.

**`-merge-layers` and `-union`:**

- Unframed targets only: unchanged from today.
- Targets in one frame, possibly with unframed targets: the output goes into
  the frame, with a message naming the layers that moved.
- Targets in two or more frames: an error.

One complication: across datasets, these commands go through
`mergeCommandTargets()`, which merges the *whole* target datasets, so
untargeted layers that share a dataset with a target come along. Today that
is a quirk; with frames it would silently move untargeted layers into the
frame. Split the targeted layers out first, using the same split as
`-frame add-layers=`, so only targeted layers are merged. The merged dataset keeps
the frame member's ID, so later moves can still rejoin it.

### CRS and reprojection

**Joining a frame.** Projected data often arrives without CRS metadata (a
Shapefile with no `.prj`, GeoJSON in projected coordinates), and it must be
able to join a frame. The rule:

- Both CRSs known: they must describe the same transform
  (`crsHaveSameTransform()`, which normalizes the definitions, so a WKT and
  an equivalent proj4 string match).
- Either CRS unknown: projected and lat-long data do not mix. Each side is
  classed as projected or lat-long (`getCoordinateSpace()`), from its CRS
  when known and otherwise guessed from degree-like bounds. They conflict
  only when the classes differ and at least one side is known from
  metadata, so two guesses never block each other. Creating a frame applies
  the same rule to its targets (`requireSameCoordinateSpace()`), so a
  projected TopoJSON without a CRS and a WGS84 raster can't share a frame.
- A clear mismatch either fails with a message or reprojects into the frame's
  CRS, as an explicit option (`-frame ... add-layers= reproject`) or a GUI
  prompt.

Joining does not write CRS metadata onto a dataset that lacks it. That would
put an assumption into `.prj` files on export.

**The frame's effective CRS** is the first known CRS among the frame dataset
and its members. Invariant 4 guarantees the known ones agree.

**`-proj`** targeting any member of a frame projects the **whole frame** —
the frame dataset and every member dataset — with the destination CRS
resolved once, and names the layers it projected implicitly. This
generalizes today's "always project the session frame" rule. Targeting the
frame by name does the same. Members without metadata are projected from the
frame's effective CRS, with a message saying so; that is the only reading
under which they were drawn correctly in the frame. If no member's CRS is
known, `-proj` needs `init=`, as it does today for data without metadata.
Unframed datasets behave exactly as today.

### Simplification across a frame

Each dataset keeps its own simplification, which is the point of model B.
The notes' remark that "simplification should be relative to display size"
is a reason a dataset can't span frames (one threshold can't suit two
scales), and that is enforced by membership being per dataset.

*Possible future feature, not planned:* intervals in output pixels,
converted to map units with the frame's scale (e.g. `-simplify
interval=0.5px`), so that every dataset in a frame gets the same visible
detail, which percentages can't give (each is relative to the dataset's own
vertex count) and `resolution=` doesn't (it measures each dataset's own
bounding box). The threshold would be fixed when the command runs, not
follow later changes to the frame. A frame-wide GUI slider could build on
it.

### Divided datasets: split, then rejoin by lineage

The notes want layers of one dataset divided between a frame and the
unframed group. Moving part of a dataset splits it with
`splitApartLayers()`, and **both parts keep the original dataset ID**. When a
layer later moves to a destination (a frame, or the unframed group) that
already holds a dataset with the same ID, it rejoins that dataset instead of
arriving as a new one. Dragging the layers of a dataset into a frame one at a
time therefore ends with one dataset in the frame, with shared boundaries
shared again. Dragging a layer out and back restores the original. Splitting
becomes reversible, which also removes the notes' worry that the unframed
layers of a divided dataset could only ever go to one frame.

What an experiment showed (a polygon layer plus a dissolved copy, 20 arcs, 14
shared):

- `splitApartLayers()` gives each part its own copy of the shared arcs and
  dissolves the moved part's arcs. It preserves simplification thresholds.
- Concatenating the parts back with `mergeDatasets()` leaves **0** shared arcs.
- `buildTopology()` after the merge restores the original **20 arcs, 14
  shared**. Split copies coordinates bit for bit, so unedited boundaries
  match exactly.
- But `mergeArcs()` bakes in the current simplification, and
  `buildTopology()` discards thresholds, so the rejoined layers could no
  longer be re-simplified.

Rejoining therefore needs a threshold-preserving arc merge (easy) and a
threshold-preserving topology rebuild (moderate: the topology builder must
track which source vertex each output vertex came from). In an unedited
rejoin, identical vertices have identical thresholds, so the result is
well defined.

**When to rejoin.** Edited geometry takes care of itself: the rebuild
reconnects boundaries that are still identical and leaves smoothed, cleaned
or differently simplified ones separate, which is no worse than before. The
gate is simplification state: rejoin only if both datasets have thresholds at
the same retained interval, or both have none. Otherwise the layer arrives as
a separate dataset with a message saying why. Rejoining re-couples
simplification, which is the state the user started from; the message should
say so. If several same-ID datasets are present, prefer the one whose
simplification state matches.

**Warnings.** A split that separates layers sharing arcs — states and
counties from one TopoJSON file — should warn that editing them separately
can open gaps, unless the move completes a rejoin.

**Cost.** Each rejoin rebuilds topology for the whole destination dataset.
For very detailed sources this could take a noticeable fraction of a second
or more per drag; measure it in the spike.

Per-layer membership flags were considered as an alternative way to divide a
dataset without splitting. They are layer metadata, which `replaceLayers()`,
undo and `.msx` would all have to carry, and they handle fewer cases (not a
dataset divided between two frames). Lineage rejoining keeps all state on
datasets.

### Qualified layer targets

Copying a frame duplicates its layer names, so targets accept a qualified
form: `target=frame1:roads`.

- The part before the first `:` is a frame name; the part after is the usual
  layer pattern, matched only among that frame's member layers. Its purpose
  is to name individual layers when names repeat across frames.
- Whole frames are referred to by the frame's name alone, and each command
  that operates on frames expands it (see
  [What a frame target means](#what-a-frame-target-means)). No wildcard
  syntax is needed for the common cases, which matters because an unquoted
  `*` is expanded by shells and in makefiles.
- A bare name keeps today's meaning, matched across the whole catalog.
  `target=frame1` still means the frame layer itself.
- `:` currently has no special meaning in target patterns, but layer names
  can contain it (e.g. GeoPackage tables). A pattern is read as qualified
  only when its prefix names an existing frame; otherwise it is a literal
  name, as today.
- `getLayerTargetId()`, which writes `target=` values into GUI session
  history, falls back to a catalog index when a name is ambiguous. Indexes
  shift as layers move between frames, which makes replay fragile. Emit the
  qualified form when it is unambiguous, and the index only as a last resort.

### Stacking order

**Today.** GUI stacking order is a property of the layer object,
`lyr.menu_order` (higher draws on top), alongside `lyr.pinned` for
visibility.

- `.msx` saves both for every layer (`exportLayer()`), and the unpacker
  restores them.
- The GUI renumbers the stack to 1…n on each update and gives layers without
  a value a number above the rest (`updateLayerStackOrder()`).
- Dragging in the layers menu sets `menu_order` directly: not undoable, not
  in session history.
- GUI exports sort layers by `menu_order`. CLI exports ignore it and sort by
  the order in which `target=` matched the layers (`target_id`); this is how
  scripts control SVG paint order today.
- The CLI's `-o foo.msx` overwrites `menu_order` from the target order
  (`prepareCatalogForCliPackExport()`).
- `menu_order` and `pinned` are lost whenever a command replaces the layer
  object. Tested: they survive `-each`, `-filter`, `-explode`, `-clean`,
  `-proj` and `-filter-fields`, and are lost by `-dissolve`, `-dissolve2`,
  `-innerlines` and `-lines`. In the GUI, a layer without a value is numbered
  above the rest, so such a command presumably moves the layer to the top of
  the stack and re-shows it if it was hidden. That is an existing defect,
  independent of frames.

**Plan.** Make `menu_order` the one persistent stacking order, meaningful
in both the CLI and the GUI, rather than adding a second property. It is
already in every `.msx` file.

- **Handover.** `replaceLayers()` copies `menu_order` and `pinned` from each
  replaced layer to its replacement. Unlike the metadata in
  `layer-metadata.md`, order and visibility do not depend on layer content,
  so a one-to-one handover is always correct; new extra layers go directly
  above their source. This fixes the existing defect on its own and can ship
  first.
- **Undo.** Add `menu_order` (and `pinned`, if visibility becomes
  persistent) to the layer-metadata undo unit.
- **Scope.** The numbers stay global, which is simplest; only the relative
  order within a frame, or within the unframed group, matters.
- **CLI order.** When a frame target is expanded to its members (rendered
  export, below), the members are listed in stacking order, so the existing
  `target_id` sort produces the stored order with no special case. An
  explicit list
  (`target=roads,water`) keeps today's meaning — the list order wins — so
  existing scripts keep their output. The CLI `.msx` export keeps existing
  `menu_order` values and numbers only the layers that lack one.
- **Command.** `-frame target=<frame> order-layers=... above=|below=|top|bottom`
  sets order within a frame, and `add-layers=` places layers that join it
  (see [CLI](#cli-everything-through--frame)).
- **GUI.** Dragging within or into a frame becomes command-backed, so it is
  undoable and appears in session history, closing a gap that exists today.
  Dragging within the unframed group stays a direct, GUI-only change.

### Resolver API

`getActiveFrame(catalog)` stops being meaningful in core code. Replace it
with explicit resolution:

- `getFrames(catalog)` — all frames, catalog order.
- `getFrameById(catalog, id)` — the frame whose frame dataset has this ID.
- `getFrameForDataset(catalog, dataset)` — via `info.frame`, or null.
- `getFrameMembers(catalog, frame)` — the frame's member datasets.
- `getFrameByName(catalog, name)` — for CLI options and GUI menus.
- GUI-only: the active frame is GUI state, never inferred in core code.

Callers move as follows:

| Caller | New rule |
| --- | --- |
| `-proj` | the frames of the target datasets, with all their members |
| `-scalebar` | frame of the target dataset; `frame=` option |
| `-repel` | frame of the target dataset |
| `-frame` | uniqueness check by name, not "a frame exists" |
| SVG/TopoJSON export | one frame per group of exported datasets |
| GUI map, preview, resize, properties, export, scalebar panel | GUI active frame |

### Overlay frames

Store an overlay as a **furniture layer in the host frame's dataset**, e.g.
record `{type: 'overlay', frame: '<overlay frame ID>', position:
'bottom-right', margin_x: 10, margin_y: 10}`, laid out with the same page-anchor model
scalebars use. The CLI accepts the overlay frame's name and stores its ID. The
overlay frame itself remains an ordinary frame with its own extent, CRS,
members and nominal size; it is placed at 1:1 on the host page.

This follows the notes ("layout similar to scalebars"), keeps overlay frames
visible as separate frames in the menu, and lets the same locator be placed
on several hosts at different positions — which the responsive-HTML idea
needs. Because it refers to the frame by ID, renaming the overlay frame does
not break it; copying a host frame must decide whether its copied overlay
records still point at the same overlay frame (usually yes).

**Several hosts.** Decided: one overlay frame can be placed on several
hosts. Each host has its own overlay record, so each placement is
independent; the overlay's content, extent and page size are shared.
Editing the overlay frame changes it on every host, which is the point.
Deleting an overlay frame removes its overlay records from all hosts in the
same command.

**Placement and editing.** Corner plus margin is the default: a new overlay
goes in a free corner with a default margin. Two ways to edit it, both
committing one command per gesture (`-frame target=<host> overlay=<frame>
overlay-position=... overlay-margin=...`, which updates an existing
placement):

- **Dragging** the overlay's box on the host. On release, the placement is
  re-expressed as the nearest corner plus margins from that corner, so it
  keeps its relation to the nearest edges if the host is later resized or
  cropped.
- **Numeric fields** in a toolbar below the map, opened by clicking the
  overlay's box: corner and margins, in the host's page pixels.

A placement that would push the overlay partly off the host page is
allowed, as with scalebars.

The GUI only offers hosts whose page is at least as wide and tall as the
overlay page. Equal-sized frames are treated as full-page overlays: they use
zero margins, cannot be dragged, and the placement toolbar replaces its corner
and margin controls with a "Full page" label.

**Export.** Overlay frames are listed in the export dialog with the other
frames but start unchecked; checking one exports it as its own file as
well. Host and other primary frames start checked.

## CLI: Everything Through `-frame`

Decided: no new public commands. `-frame` takes on the new behavior, and
the hidden, GUI-only `-update-frame` folds into it (kept as an alias for a
release; it was never in the help output, only in the changelog).

**Two modes, chosen by the target.**

- **Create** — `target=` names content layers (or there is none and
  `bbox=` is given). As today, the frame is fitted to the targets; in
  addition the targets become its members. `name=` must be unique; with no
  name the frame gets the next free `frame`, `frame2`, ... name.
- **Modify** — `target=` names exactly one existing frame.

A target that mixes frames and content layers is an error. A frame layer can
never be content, so the mode is never ambiguous.

**Options in modify mode:**

| Option | Effect |
| --- | --- |
| `bbox=` `fit=` `width=` `height=` `aspect-ratio=` `auto-aspect` `fix-scale` `margin=` `ignore-symbols` | Page and extent, exactly as `-update-frame` today |
| `name=` | Rename (unique) |
| `add-layers=<layers>` | Move layers into the frame, from the unframed group or another frame, stacked in list order (first at the bottom). Names are matched only outside the frame; naming a member is an error |
| `order-layers=<layers>` | Restack members of the frame in list order (first at the bottom). Names are matched only among the members. Without a position, the layers are restacked in place, starting where the lowest of them was |
| `above=<layer>` `below=<layer>` `top` `bottom` | Where `add-layers=` (default `top`) or `order-layers=` puts the layers. The anchor must be a member that isn't being moved |
| `reproject` | With `add-layers=`, reproject layers whose CRS clearly differs into the frame's CRS instead of failing |
| `remove-layers=<layers>` | Move layers out of the frame, into the unframed group |
| `hide-layers=<layers>` `show-layers=<layers>` | Hide or show members of the frame (see [Visibility in frames](#visibility-in-frames)) |
| `overlay=<frame>` `overlay-position=` `overlay-margin=` | Place another frame on this one, or update its placement here |
| `remove-overlay=<frame>` | Remove that placement |
| `+` with `name=` | Copy the frame and its member datasets under a new name (the `+` no-replace convention; the GUI already duplicates layers with `-filter true +`) |
| `remove` | Demote the frame; its members become unframed |

These options take the same patterns as `target=`, including qualified names
(`frame1:roads`), with one difference: `order-layers=`, `remove-layers=`,
`hide-layers=`, `show-layers=`, `above=` and `below=` match only the frame's
members (numbers count the members from 1), and `add-layers=` skips them, so
a layer outside the frame with a member's name is never ambiguous. In a list,
the layers matched by one wildcard keep their stacking order. `add-layers=`
and `order-layers=` can't be used together.

Overlay placement takes the `overlay-` prefix because `margin=` already means
the frame's own fitting margin.

Examples:

```
-frame target=roads,water name=main width=800      # create, fitted to its members
-frame target=main add-layers=rivers below=roads   # join, stacked under roads
-frame target=main order-layers=labels top         # restack within the frame
-frame target=main order-layers=land,water,roads   # set the order of three members
-frame target=main remove-layers=scratch           # back to the unframed group
-frame target=main hide-layers=graticule           # keep it, but leave it off the map
-frame target=main overlay=locator overlay-position=bottom-right overlay-margin=10
-frame target=main + name=main-small width=400     # copy, then resize the copy
```

### Visibility in frames

Decided: hiding a frame member is persistent and has CLI syntax. CLI users
will rarely write it, but it lets a GUI session replay as a script, lets
`-o` typed in the GUI console export a map as it appears, and gives scripts
a way to keep helper layers in a frame without drawing them.

**Today.** Visibility is GUI-only and intricate: a layer is drawn if it is
active or `pinned`; `hidden` hides the active layer itself; `unpinned`
remembers the pin state to restore on unhiding. `.msx` saves only `pinned`.
Several tools (style, label, point) clear `hidden` directly when they open.

**Plan.**

- Frame members get one persistent property meaning "hidden in its frame"
  (working name `frame_hidden`), absent meaning visible. It is a separate
  property, so the unframed pinning model and the tools that clear `hidden`
  keep working untouched.
- In frame view, every member is drawn unless hidden, the active layer
  included; pinning does not apply. Unframed visibility stays GUI-only, like
  unframed stacking order.
- The property travels like `menu_order`: saved in `.msx`, handed to
  replacement layers by `replaceLayers()`, captured by the layer-metadata
  undo unit, copied when a frame is copied, and cleared when a layer leaves
  its frame (its unframed visibility follows its previous state).
- In frame view the eye icon runs `-frame target=<frame> hide-layers=` or
  `show-layers=`, so hiding is undoable and replayable. Tools that unhide the
  layer they open must do it through the same command for frame members.
- Frequent toggling would clutter session history. Print-time history
  compaction (the culling approach in `gui-improvement-roadmap.md`) can drop
  hide/show commands that a later one supersedes; a pure function with direct
  tests.

**What visibility affects.** Display, and exporting a frame *as a whole*.
It does not affect targeting: hidden layers can still be edited, and a layer
pattern selects hidden layers like any other, as for every other command.

**Exporting a frame from the CLI or console.** `-o target=frame2 map.svg`
exports frame2 as a map; see the next section. (A positional `-o frame2
map.svg` would collide with the filename argument.) In the GUI export dialog,
hidden members start unchecked, matching the CLI.

### What a frame target means

A frame's name in `target=` refers to the frame layer, and each command that
operates on frames expands it to what it needs. Users write the frame's name
and get what they would expect, without wildcard syntax.

| Command | `target=frame2` means |
| --- | --- |
| `-o` to a rendered format (SVG, PNG, JPG, HTML, pixel-sized TopoJSON; PDF later) | The whole map: visible members in stacking order, furniture, overlays |
| `-o` to a data format (GeoJSON, Shapefile, CSV, GeoPackage, ...) | The frame dataset: the frame rectangle (furniture is already left out of data formats) |
| `-o` to `.msx` | Unchanged: `.msx` always writes the whole project |
| `-proj` | The whole frame: frame dataset and every member dataset |
| `-frame` | Modify this frame |
| Everything else (`-each`, `-style`, `-filter-fields`, ...) | The frame layer itself, as today |

This is feasible because `-o` resolves the output format (from the filename
or `format=`) before exporting, and rendered formats already go down a
separate path that merges the target datasets for one composition.
Expansion happens there: replace each frame in the target list with its
frame dataset plus its visible members, then group by frame.

Related rules:

- **Several frames.** `-o target=frame1,frame2 maps/` writes one file per
  frame, named after the frames. With a single filename (`map.svg`),
  `assignUniqueFileNames()` versions the names; deriving them from frame
  names (`map-frame1.svg`) is friendlier.
- **Members without their frame.** `-o target=roads map.svg`, where roads
  is in frame2, exports roads alone on frame2's page: the frame now follows
  from membership rather than from being in the target list.
- **Frames plus unframed layers.** The compatibility rule applies: with
  exactly one frame involved, unframed targets are composed into it.
- **Members as data.** Exporting all of a frame's members to a data format
  has no shorthand on the CLI: list the layers, or use the GUI export
  dialog, which groups them by frame. An option on `-o` can be added if the
  need shows up.
- **A side benefit for scripts.** After `-frame`, the default target is the
  frame, so `-i a.shp -frame width=800 -o out.svg` now exports the map with
  no `-target '*'` step. Today that command writes an SVG of the frame
  rectangle alone, which draws nothing.

**Rules that keep one command manageable:**

- Options are applied in a fixed order: membership and stacking, then page
  and extent, then overlays, then rename. The GUI still emits one purpose per
  command, so session history stays readable and each undo step is one
  gesture.
- Options that only make sense in one mode (`add-layers=` when creating,
  `replace` when modifying) are errors, not silently ignored.
- `-frame width=900` with no target still creates a frame from the current
  target. Today that errors when a frame exists; with several frames allowed
  it succeeds, so the message names the new frame and points at
  `target=<frame>` for changing an existing one.
- The help output for `-frame` gets long. The parser supports titled
  sections in the command list but not within a command's options; adding
  option groups (page, members, overlays) to the help formatter is a small
  change worth making.

**No command needed for:**

- **Stacking order outside frames.** Unframed layers are an editing area,
  not a rendered map, so their order stays GUI-only, as today (not
  undoable). If that proves annoying it can become an option on an existing
  command later.
- **Imports and drawn layers.** The GUI runs `-i` or `-add-layer` followed
  by `-frame target=<frame> add-layers=<new layer>`, grouped as one undo step.
  If the two history lines prove annoying, a `frame=` option on those
  commands is an option, not a new command.

## Assessment of Each Note

| Idea | Verdict |
| --- | --- |
| Unframed layers (imports, hidden at frame creation, data-only, editing helpers) | Feasible; falls out of the model |
| Unframed layers viewable together or separately, never with framed layers | Feasible; a GUI view state (unframed view vs. frame view) |
| Unframed layers at top of layers menu | Easy |
| One active, visible frame in normal editing | Feasible; preview/extent/resize code already takes one frame |
| Import into active frame or unframed group | Feasible; import with a destination (CRS check, optional reproject) |
| Overlay frames (locator maps) | Feasible; medium in GUI and SVG |
| Overlay layout like furniture | Feasible; reuse position + margin |
| Context-menu item to overlay a frame, draggable box | Feasible; drag commits one command per gesture, like the resize tool |
| Overlays as translucent boxes in preview and resize | Easy (one more overlay rect per frame, no hot-loop work) |
| Proofing mode with overlays in final position | Hard in GUI (second transform + clip in the canvas renderer); defer, as the notes suggest |
| Frames identified by name; unique names | Easy; needs the enforcement points listed above |
| Draw links create layers in the active frame | Feasible; `-add-layer` needs a destination option |
| Frame shown above its layers; open/closed | Feasible; GUI state |
| Drag layers into/out of frames | Feasible; medium (drag must issue a command, unlike reorder) |
| Context-menu move into/out of frames | Easy once the command exists |
| Target a frame for reprojection | Feasible; `-proj` projects whole frames |
| Create a frame from visible unframed layers with compatible CRSs | Feasible; existing fit logic plus setting membership |
| Copy a frame including datasets | Feasible; copy each member dataset and point the copies at the new frame. Duplicate layer names are handled by qualified targets |
| Frame datasets must have compatible CRS | Feasible; enforced on joining (same transform when both are known, projected-vs-lat-long check otherwise) and preserved by the `-proj` rule |
| Dataset cannot span frames | Automatic (membership is per dataset) |
| Dataset divided between frame and unframed | Feasible by splitting; reversible because split parts keep the dataset ID and rejoin by lineage. Needs a threshold-preserving merge and topology rebuild |
| Simplification relative to display size | Satisfied by "a dataset cannot span frames"; pixel-unit intervals are a possible future feature (see [Simplification across a frame](#simplification-across-a-frame)) |
| Container frames (side-by-side) | Defer; overlays with explicit placement cover much of it |
| HTML responsive variants (different sizes) | Feasible; medium-hard (N images + breakpoints; current HTML has single-map `responsiveness=dynamic` only) |
| HTML stacks/grids (same size) | Feasible; medium |
| SVG/PNG/JPG/PDF: one file per primary frame plus overlays | Feasible; medium. PNG/JPG rasterize the SVG, so they come free; PDF design mirrors SVG |

## Compatibility

- **`-frame`** keeps creating the frame alone in its own dataset, and also
  sets membership on its target datasets (splitting them if only some of
  their layers are targeted). Existing scripts like `-i a.shp -frame
  width=800 -target '*' -o out.svg` produce the same output, and the
  `-target '*'` step is no longer needed (see
  [What a frame target means](#what-a-frame-target-means)).
- **Export rule for existing scripts:** if an export's targets involve
  exactly one frame, unframed targets are composed into it as today, with a
  message. With two or more frames, export writes one file per primary frame
  and warns about unframed targets.
- **Empty frames** (legacy `.msx` files, `-frame bbox=` with no targets):
  in the GUI, offer "Move visible layers into frame"; until then the frame
  composes the unframed visible stack, as it does today. Keep this path narrow
  so it does not become a permanent second semantics.
- `.msx`: membership travels in dataset `info`, which is already serialized;
  `dataset.id` is a new field, assigned on load when absent, so older files
  keep loading. Bump the version when IDs or GUI state (active frame,
  open/closed groups) are written.
- Output for sessions without frames must be byte-identical before and after
  each milestone (add baseline comparisons).

## GUI Model

- **View state**: either a frame is active (frame view) or none is (unframed
  view). Selecting a layer activates its frame or switches to unframed view.
  This is GUI state, not undoable, saved in the snapshot `gui` slot.
- **Frame view** draws the visible layers of the frame's member datasets in
  the frame's CRS, with preview mode, symbol scale and mask bound to the
  active frame, and overlay frames as translucent boxes. Dynamic display CRS
  is disabled or bound to the frame CRS in frame view.
- **Unframed view** keeps today's pinning model and mixed-CRS behavior.
- **Layers menu**: unframed section at top; then one collapsible group per
  frame, the frame row as the group header, members beneath, overlays listed
  as their own frames. A drop into a frame runs `-frame add-layers=`, a drop
  within one runs `order-layers=`, and a drop out of one runs
  `remove-layers=`; dragging within the unframed group stays a direct GUI
  change.
- **Default targets** stay content layers; the existing rule that frames are
  never the implicit target is kept.
- Editing commands run on the selected layer's dataset as today, so
  simplifying one source in frame view leaves the frame's other sources
  alone.

Every membership change is a command, so undo and session history come from
existing machinery, and a replayed history reproduces the frames on the CLI.

## GUI: Export Dialog

The checklist is organized the way the layers menu is: an unframed group,
then one group per frame. Hidden layers inside a frame are unchecked by
default.

What a checkbox means depends on the format:

- **Rendered formats (SVG, PNG, JPG, HTML, pixel-sized TopoJSON).** The unit
  of output is a frame: each checked frame produces one file, named after the
  frame, with its overlays composed in. The frame row is a three-state
  checkbox; its group is closed by default and can be opened to leave out
  individual layers. Overlay frames appear too, unchecked by default.
  Checked unframed layers produce one frameless file, as an unframed export
  does today.
- **Data formats (GeoJSON, Shapefile, CSV, TopoJSON, GeoPackage, ...).** The
  unit is the layer, as today, grouped by frame for orientation. Groups are
  closed by default too, but a closed group must still show what it will
  export: a three-state group checkbox and a count such as "2 of 5 layers".
- **`.msx`.** The whole project, with no checklist. A partial project could
  leave membership and overlay references pointing at missing frames.

**Default format.** When the session has frames, the dialog assumes the user
is exporting a map and opens with a whole-map format selected: SVG for now,
PDF once it exists. With no frames, the default is unchanged. A format the
user picked explicitly earlier in the session should probably win over the
default.

Default selection:

- **Rendered formats:** every primary frame is checked, each with its
  visible layers; overlay frames are not. Because groups are closed, the frame rows form a short list
  at the top level, so deselecting a frame is one click. Unframed layers start
  unchecked when frames exist, so the frames are not joined by an extra
  frameless file nobody asked for; with no frames, the visible unframed layers
  are checked, as today.
- **Data formats:** the visible layers of the current view — the active
  frame's members, or the visible unframed layers — as today.

Several files from one export reuse whatever path the dialog already uses
for multi-file formats such as Shapefile.

## Milestones

Each is shippable and testable on its own; CLI and core first.

**0. Spike and decisions.** Settle the open questions below. Prototype the
membership reference and the inheritance rule on the `addDataset()` call
sites; measure a lineage rejoin (split, threshold-preserving merge, topology
rebuild) on a large real dataset; confirm byte-identical output for existing
single-frame scripts. Update this document.

**1. Core groundwork (no behavior change, apart from fixing defects).**
- `replaceLayers()` hands `menu_order` and `pinned` to replacement layers
  (fixes layers jumping to the top of the stack after `-dissolve` and
  similar commands); `menu_order` in the layer-metadata undo unit.
- Dataset IDs: assignment on creation and load, `.msx` round trip, collision
  re-keying.
- Introduce the resolver API and move each `getActiveFrame()` caller onto an
  explicit rule, still with the one-frame guard in place.
- Membership reference helpers, the central inheritance rule for
  command-created datasets, and the `mergeDatasetInfo()` fix, with tests per
  call site.
- Threshold-preserving `mergeArcs()` and topology rebuild, tested directly:
  split then rejoin gives the original shared arcs and the original
  simplification.

*Status: done.* Differences from the list above:
- The `menu_order` undo unit is deferred to Milestone 2. The handover happens
  inside `replaceLayers()`, after `noteDatasetWillChange()`, so undo already
  restores the replaced layers with their old values.
- No `.msx` version bump yet: `dataset.id` is written and read, and files
  without it still load (IDs are assigned on load). Bump it when GUI frame
  state is written.
- `getActiveFrame()` is gone from core. `getDefaultFrame(catalog)` keeps the
  old warn-and-pick behavior for the one-frame callers (`-frame`,
  `resolveFrameForDataset()` fallback); the GUI calls `model.getActiveFrame()`,
  which wraps it for now and becomes real GUI state in Milestone 3.
  `-proj` already projects each frame resolved from its targets, and
  `cmd.scalebar()` takes the target dataset.
- Inheritance runs where command output datasets are added (`outputDataset`
  branch of `runCommand()`, `-rectangle`, `-external`); `mergeDatasets()`
  sets `frame` only when every source shares it, and `mergeDatasetInfo()`
  never copies it. The leak described under "`info` propagation" mainly goes
  through `mergeDatasets()` (an unframed first dataset takes a later
  source's reference); `-target combine` is disabled, so that path is moot.
- Copying the dataset ID when a dataset is split is left to Milestone 2,
  with `add-layers=`. Copies made by `copyDataset()` get a new ID.
- `rejoinDatasets()` = `mergeDatasets({preserve_simplification})` (errors if
  the retained intervals differ) + `buildTopology({preserve_simplification})`.
  It keeps every threshold and leaves only necessary arcs, so it matches the
  original after `dissolveArcs()`, not the imported arc count. Cost:
  0.1 s for 1.2M vertices, 0.4 s for 4.3M (precinct files).
- Two defects fixed along the way, both of which dropped data from
  simplified datasets: `condenseArcs()` (used by `deleteArcs()` /
  `deleteUnusedArcs()`) discarded thresholds, and `dissolveArcs()` deleted
  rings that collapse only at the current simplification level (degeneracy
  is now tested on unfiltered vertices).

**2. Multi-frame core and CLI.**
- Replace the guard with the invariants above.
- `-frame` create mode sets membership on its targets; `name=` must be
  unique.
- `-frame` modify mode: fold in `-update-frame` (kept as an alias);
  `add-layers=` / `remove-layers=` and `order-layers=` with
  `above=`/`below=`/`top`/`bottom`, splitting datasets when needed and
  rejoining by lineage;
  `hide-layers=`/`show-layers=`; rename; copy with `+`. Option groups in the
  help output.
- `-o target=<frame>` is format-aware: the whole map (visible members in
  stacking order, furniture, overlays) for rendered formats, the frame
  dataset for data formats.
- `-proj` projects whole frames; `-scalebar` and `-repel` resolve the frame
  per target dataset.
- `-merge-layers` / `-union` frame rules (split targeted layers first; error
  across frames); the joining CRS rule for overlay sources.
- Qualified targets (`frame1:roads`), and qualified IDs from
  `getLayerTargetId()` in session history.
- Export: one file per primary frame when targets span several frames;
  filenames from frame names; the one-frame compatibility rule.

*Status: done.* Differences from the list above:
- `-update-frame` stays a separate command rather than an alias. It and
  `-frame` in modify mode share `updateFrame()`.
- Mode: `-frame` whose targets are frames changes the frame, unless
  `replace` is given (one frame at a time). Any other targets create a frame.
  Mixing frames and other layers is an error. Each mode rejects the other
  mode's options.
- On creation, the targets become members only when `target=` is given or
  there is no `bbox=`, so `-frame bbox=... width=...` still makes a page
  with no content. If frames already exist and the target was implicit, a
  message says how to change an existing frame instead.
- With several frames, `getDefaultFrame()` returns null, so unframed layers
  are composed in a frame only while there is exactly one. The GUI's
  `model.getActiveFrame()` picks the first frame and warns once until
  Milestone 3. A reference to a missing frame is cleared after each command
  (`repairFrameReferences()`), which also checks the invariants.
- CRS rule for joining a frame: two known projected CRSs must have the same
  transform. Otherwise only projected and lat-long data are kept apart, so
  lat-long data in another datum can still join. `reproject` works only when
  the frame's CRS is known from metadata.
- Every stacking change renumbers `menu_order` for all layers in the catalog,
  frame layers included. `menu_order`, `pinned` and `frame_hidden` are in the
  layer-metadata undo unit (the Milestone 1 deferral). `frame_hidden` is
  written to `.msx` and handed over by `replaceLayers()`.
- Export, rendered formats: an explicitly targeted frame layer keeps its
  place in the target list; otherwise the frame comes first. A member target
  brings its frame's furniture. Unframed targets are drawn in the frame when
  only one frame is involved (with a message) and left out with a warning
  when there are several. With no frame involved, export takes the old path,
  so frameless output is unchanged. The web UI's export dialog (which passes
  `gui_frame`) is unchanged until it is grouped by frame in Milestone 3.
- `-proj`: a frame or member target brings in the frame dataset and every
  member, with messages naming the frame and the layers projected
  implicitly. Members without CRS metadata are given the frame's CRS only
  when the guess from their coordinates differs. An unframed target still
  projects a member-less (legacy) frame, but never a frame that has members.
- `-merge-layers` / `-union`: unframed-only targets are unchanged. Otherwise
  the output keeps a member's dataset ID and a message names the layers that
  moved into the frame. Frames and furniture can't be merged.
- The overlay CRS rule (same projection when both are projected) applies to
  `-clip`, `-erase`, `-divide`, `-inlay` (through `mergeLayersForOverlay2()`)
  and spatial `-join`, but not to `-merge-layers`: `issue-166-test` pins
  merging Shapefiles in different projections, keeping the first `.prj`.
- Qualified targets: `frame:3` counts the frame's members from 1, and a
  prefix that is not a frame name is read as part of a literal layer name
  (`x:y`). `-scalebar` and `-repel` already resolved per target dataset in
  Milestone 1.
- A CLI `.msx` export keeps the session's stacking order; its target list
  only decides which layers are pinned (visible). Before, targeted layers
  were restacked above the rest in target order.

**3. GUI frame model.** Active frame and view state; layers menu with
unframed section and frame groups; context-menu move in/out; preview, resize
and properties bound to the active frame; import destination; `-add-layer`
into the active frame; create a frame from visible unframed layers; copy
frame; legacy empty-frame migration; export dialog grouped by frame.

*Status: done.* Differences from the list above:
- The active frame is not stored. It is derived from the selected layer
  (`getDisplayFrameForDataset()`): the layer's own frame, or the session's
  only frame when that frame has no members (a legacy frame, which keeps
  today's behavior for unframed layers). Since the selected layer is
  already saved, nothing new goes into the snapshot `gui` slot, and
  open/closed frame groups are not saved.
- Frame view draws the active frame's members that are not hidden; pinning
  doesn't apply. Unframed view never draws framed layers.
- Layers menu: the Layers section (unframed layers), then one section per
  frame, each headed like "Layers", with a chevron to close it and a rule
  above it; a frame's size and menu are on its heading row. Above the list
  is one row of links that add layers: "Add files · Add labels · Draw ▾",
  where Draw opens a menu of symbols, points, lines and polygons. Frame
  creation is a "+ New frame" link below the last section, since it
  organizes existing layers rather than adding one, and new frames appear
  at the end of the list. Clicking a heading switches to that view;
  frame properties and "rename frame" (`-frame name=`) are in the frame's
  menu. Hiding a layer in a frame works like unpinning: the selected layer
  is drawn even if it is hidden in its frame, and the export dialog checks
  it by default (export what is on screen); the CLI's frame export leaves
  hidden layers out. The selected layer's eye hides it from the map for the
  moment (`lyr.hidden`, as in the Layers section) rather than running a
  command. A frame's heading has an eye that shows all its layers if any is
  hidden (`show-layers=*`) and otherwise hides them all (`hide-layers=*`).
  Only the
  section on the map has working eye icons; the others show
  visible layers in pale grey. Frames made in the GUI are named "Frame 1",
  "Frame 2"... (the CLI's default names are unchanged); a copy of a numbered
  frame takes the next number, and a copy of a renamed one gets " copy".
- Member eye icons run `-frame hide-layers=` /
  `show-layers=`, using the member's name when it is unambiguous and its
  number otherwise (`getFrameMemberRef()`). Clicking a frame row selects its
  top visible member. Dragging is covered under Milestone 4.
- Context menus: "move out of frame", "move into frame: <name>", "copy
  frame" (`-frame + name=<name>-copy`).
- Legacy migration is "move visible layers into frame", offered on frames
  with no members; it adds the visible unframed layers. Drawing a new frame
  always uses unframed layers, even from frame view, and the frame gets an
  automatic name.
- Imported files always go to the Layers section, even in frame view; they
  can be moved into a frame afterwards. `-add-layer` puts the new layer in
  its target's frame (CLI and GUI).
- Export dialog: as described under "GUI: Export Dialog", with no overlay
  frames yet. A format picked explicitly is remembered for the session.
  Several frames give one file per frame, named with
  `getFrameExportFilename()`.
- Changing the view fits it to the map: when selecting a layer moves the
  map to another frame or to the unframed layers, the view is reset rather
  than left to `mapNeedsReset()`, which compares bounds and can't tell that
  frames may use units millions of times apart.
- A new frame is made from the visible unframed layers; a selected layer
  whose eye is off is left out.
- Not done: preview mode doesn't switch back on when returning to a frame,
  and dynamic display CRS isn't bound to the frame CRS in frame view. The
  "Layers" heading shows even when there are no unframed layers (with a
  note that all layers are in map frames).
- Existing defects fixed: the GUI's default target kept a stale dataset
  after a split or rejoin; the export dialog's session-history target IDs
  used menu positions instead of catalog positions; and the export selection
  was read after closing the dialog had cleared it.

**4. Command-backed drag and drop.** Extends the existing drag code; a drop
into a frame runs `-frame target=<frame> add-layers=...`, a drop within one
runs `order-layers=...` (and a drop out of one runs `remove-layers=`), so
those changes become undoable and replayable.

*Status: done.* Notes:
- A drop goes next to the row it lands on: `above=`/`below=` that layer,
  named as the member eye icons name it. A drop on a frame's heading puts
  the layer on top (`top`); this is also how a layer joins a frame that has
  no members.
- Out of a frame, `remove-layers=` runs first, and the layer is then placed
  where it was dropped among the unframed layers (a direct `menu_order`
  change, as in the Layers section).
- Within a frame, the drag shows the insertion line but restacks only when
  the button is released, since each restack is a command. A drop that
  leaves the order unchanged runs nothing.
- Dragging within the Layers section still restacks as the mouse moves, and
  is not recorded.

**5. Overlay frames.** Overlay furniture layer; `overlay=`,
`overlay-position=`, `overlay-margin=` and `remove-overlay=` on `-frame`;
one overlay on several hosts; nested `<svg x y width height
viewBox>` composition in SVG export (which clips for free) with each
overlay's own background and neatline; PNG/JPG inherit it; GUI overlay boxes
with drag placement and a numeric placement toolbar; boxes shown while
resizing the host.

*Status: done.* Notes:
- The record is `{type: 'overlay', frame: <ID>, position, margin_x,
  margin_y}`: two margins, since a dragged box is rarely the same distance
  from both edges. `overlay-margin=` takes one value or two
  (`horizontal,vertical`), in px or size units; negative values put the box
  partly off the page. `overlay-position=` takes the four corners. A new
  overlay takes the first corner (bottom-right, bottom-left, top-right,
  top-left) not used by another overlay or the scalebar, with 10px margins.
- Helpers are in `mapshaper-overlays.mjs`. A frame can't be overlaid on
  itself, and overlays can't contain each other (directly or through other
  overlays). `repairOverlayReferences()` runs after each command beside
  `repairFrameReferences()`: deleting or demoting an overlay frame removes
  its placements, and a placement left in a dataset that is no longer a
  frame is dropped. `-frame replace` of an overlay frame moves its
  placements to the new frame. Copying a host copies its placements, which
  point at the same overlay frame.
- Export: `exportTargetLayers()` renders each overlay frame's map (the same
  layers a frame export would draw) with `renderSVGContent()`, and the
  host's SVG places it in `<svg x y width height viewBox overflow="hidden">`.
  Ids inside are prefixed with the overlay's name (`inset-roads`); rasters
  are embedded. Nested overlays are rendered recursively. Since PNG, JPG
  and HTML images go through `renderSVGDocument()`, they inherit it. An
  overlay is drawn at its nominal size even when `-o width=` resizes the
  host.
- GUI: in preview, the active frame's overlays are boxes labeled with the
  overlay's name (`gui-frame-overlays.mjs`). A `show` / `hide` link in each
  label toggles proofing of that overlay's exported content; the box remains
  the draggable placement chrome. Dragging one runs one `-frame
  overlay=` command on release. Clicking one selects it and opens a toolbar
  below the map, like the resize tool's: the overlay's name, the corner (four
  arrow segments), one Margin field (`10` or `10,20`, as in
  `overlay-margin=`), Remove and Done. It closes on Done, Escape, leaving
  preview, a change of interaction mode, or the overlay going away. The
  resize tool sends the temporary page
  while a handle is dragged (`frame_resize_preview`), so the boxes follow
  their corners. A frame's menu has "overlay on frame: <name>" and "remove
  overlay from: <name>". The export dialog starts overlay frames unchecked
  for map formats, and an unprojected host still exports its overlays (its
  scalebar is still left out).
- Margins are in page pixels, not the host's units.

*Fixes after Milestone 5:*
- `-frame` rejects targets that mix projected and lat-long coordinates (see
  "CRS and reprojection").
- Projecting a frame whose boundary can't be fully projected (`-proj ortho`
  on a world frame, whose ±180° sides fall off the globe) used to leave a
  sliver of bounds and an absurd page size. `getProjectedFrameBounds()` now
  adds a grid of interior points when part of the boundary fails, and
  rejects degenerate bounds.
- A GUI command that fails shows its error once, in the alert titled by the
  caller (`runGuiEditCommand()` replaces the untitled alert from `stop()`),
  and GUI alerts and notifications drop the CLI's `[command]` prefix.
- Escape closes the frame resize tool. Its handler passed its priority as
  `on()`'s context argument, so another tool's handler swallowed the key
  first. The box tool's handler had the same mistake and stopped every
  Escape; it now takes the key only while a box or its options are on the
  map, at the priority it asked for.

**6. Proofing mode.** Render overlay contents in place in the GUI.

*Status: done.* Notes:
- Placeholder boxes are the default. Each box has a transient `show` /
  `hide` link; the choice is per host-overlay placement and is not written
  to commands, history or snapshots.
- Proofing reuses `renderOverlayFrameMap()`, the same nested SVG composition
  as rendered export. It therefore includes the overlay frame's visible
  members, stacking, background, neatline, rasters, furniture and nested
  overlays.
- Rendered content is cached by overlay frame and mounted in a
  pointer-events-free SVG layer under the preview mask. Navigation,
  placement dragging and host resizing only reposition it; model changes
  invalidate the cache, and hidden overlays are not rendered.
- Proofed content is not interactive. The box remains above it for
  selection and placement, and the overlay frame's features are edited in
  that frame's own view.

**7. HTML variants and grids; PDF pages.** Responsive variants from
different-sized primary frames; same-size stacks and grids.

**8. Container frames (future).**

## Open Questions

Decided so far:

- Frames are referenced by the random ID of their frame dataset.
- Hidden layers in a frame are unchecked for export by default.
- Overlay sources may be unframed or in another frame.
- `-merge-layers` and `-union` move output into the frame of their framed
  targets and may not span frames.
- The export dialog is grouped by frame with groups closed by default;
  rendered exports default to every primary frame.
- Qualified targets: `frame1:roads`.
- Joining a frame does not require identical CRS metadata; projected data
  without metadata can join.
- With frames present, the export dialog defaults to SVG (PDF later).
- One overlay frame can be placed on several hosts; corner plus margin is
  the default placement, editable by dragging or numeric margins.
- Overlay frames can be exported as their own files but are unchecked by
  default.
- `menu_order` becomes the persistent stacking order for both CLI and GUI,
  controlled through `-frame`.
- No new public commands: membership, stacking, visibility, overlays and
  copying are `-frame` options, and `-update-frame` folds into `-frame`.
- Hiding a frame member is persistent, with CLI syntax
  (`hide-layers=`/`show-layers=`).
- A frame's name in `target=` is expanded by the command: `-o` to a rendered
  format exports the whole map without hidden members, `-o` to a data format
  exports the frame dataset. No `frame:*` wildcard form.

- A CLI `.msx` export keeps the session's stacking order; `target=` only
  chooses the pinned layers.

Open: none at the planning level. Remaining choices (option names, default margins, history compaction rules)
are implementation details for each milestone.

## Risks

- **Reference drift.** The membership reference is the new source of truth,
  and every path that creates, copies, merges or renames datasets and frames
  must keep it right. Mitigation: one inheritance rule applied centrally, the
  invariant check after each command, and a test per `addDataset()` call
  site.
- **Implicit reprojection.** `-proj` on one layer now moves a whole frame.
  That is the intent, but the message must name everything it touched.
- **Topology loss on split.** Separating layers that share arcs is silent
  today; `add-layers=` and `remove-layers=` must warn.
- **One large command.** `-frame` gains many options and two modes. Strict
  mode validation, a fixed order of application and grouped help keep it
  learnable; the GUI emitting single-purpose commands keeps history
  readable.
- **GUI state sprawl.** Active frame, view state, open/closed groups and
  pinning all interact with selection. Keep the active frame derived from the
  selected layer wherever possible, and add browser tests for undo/redo across
  frame switches.
- **Renderer.** Overlay boxes and the mask are chrome. Proofing mode is the
  only part that touches the canvas renderer; keep it last and isolated.
