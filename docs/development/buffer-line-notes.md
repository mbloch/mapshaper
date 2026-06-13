# Line buffering (buffer-v4): architecture, failure modes, validation

Working notes from the 2026-06 correctness/performance work on `-buffer`
for polyline inputs. Audience: developers (or agents) continuing this
work. Tools referenced here live in `test/tools/buffer/` (see its README).

## Architecture

A polyline buffer is built in two stages (`src/buffer/`):

1. **Construction** (`mapshaper-path-buffer-v4.mjs`): paths are
   pre-simplified (Douglas-Peucker at an interval equal to the error
   budget; `tolerance=`, default 1% of the radius; one-sided buffers also
   cap the turning that simplification concentrates into single bends),
   then swept into offset rings.
   - **Two-sided buffers of open paths** use the outline fast path
     (`makeTwoSidedOutlineRing`): ONE closed, possibly self-intersecting
     ring per path (left side + cap + reversed right side + cap), with
     concave joins emitted inline as reversed arcs. This is 4-6x faster
     than per-section rings because the dissolve's cost is driven by the
     number of overlapping rings it must mosaic (`no-outline` restores the
     old construction).
   - **One-sided buffers** default to the **winding fill** with dip-to-vertex
     concave joins and no lobe-removal/audit pass (see "One-sided buffers"
     below); this supersedes the per-section + audit path for `left`/`right`.
   - **Closed paths** (and the legacy non-winding one-sided path) use
     per-section rings (`makeLeftBufferRings`): ring = reversed path side +
     offset side; ring splits at concave bends whose offset segments do not
     intersect, with a sector ring covering the wedge at the split.
2. **Dissolve** (`dissolveBufferDataset2` in `mapshaper-buffer-common.mjs`):
   `addIntersectionCuts` + `MosaicIndex` + per-shape pathfinding. For
   polyline buffers it runs with `per_part_holes` (see below).

Two post-passes guard correctness:

- **Artifact-hole filter** (`removeOutlineArtifactHoles` in
  `mapshaper-polyline-buffer.mjs`): dissolved holes are classified against
  the true buffer region and deleted if they are artifacts of the
  self-intersecting outline (winding loops). Two-sided classification is
  distance-based (real hole boundaries lie at the buffer distance);
  one-sided classification is side-aware (bands/join sectors/caps),
  because one-sided holes can legitimately sit at any distance, including
  against the path line. Rings below (0.01r)^2 area are slivers and are
  always dropped.
- **Band-coverage audit** (`addUncoveredCutBandRings` in
  `mapshaper-path-buffer-v4.mjs`, one-sided open paths only; disable with
  `no-audit`): after construction, every original (unsimplified) segment's
  offset band is probed against the emitted rings (exact 1-D interval
  coverage along band perpendiculars). The dissolve's union semantics are
  "covered where SOME ring's winding is nonzero"; the stabber approximates
  this with the TOTAL signed winding of all rings combined (one accumulator
  rather than a per-ring table). The two differ only where rings of
  opposite winding overlap and cancel (total 0 but individually nonzero):
  there the stabber reports a gap and patches it, which is harmless because
  a band ring is a subset of the buffer. A nonzero total always implies
  some ring is nonzero, so this can never hide a real gap -- it errs only
  toward an occasional redundant patch (on `__state_innerlines.geojson` it
  produces exactly the same patches as the per-ring test, i.e. the
  one-sided rings there never cancel). Bands with an uncovered
  gap larger than the error budget get an explicit inset band-quad ring (a
  band is a subset of the true buffer, so patching is always sound).
  Auditing original vertices also catches presimplification overshoot. A
  risk gate (`findAtRiskSegments`) skips provably-safe stretches; risk
  classes, each empirically necessary: path endpoints; concave bends whose
  corner cut escapes the neighbor band (r*sin(bend) > neighbor length);
  folds (vertex pairs Euclid < 2.2r apart with Euclid < 0.8*pathDist --
  note a circle's chord/arc ratio is 2/pi ~ 0.64, so don't lower 0.8);
  sustained buffered-side turning >= 48 degrees within a 3r window
  (catches wide gentle loops; the dangerous regime is curvature radius
  below ~3.5r).

## The core failure mode (why the audit exists)

A swept outline approximates the union of per-segment offset bands. At
concave joins the construction replaces band corners with the offset
segments' intersection (or splits the ring, leaving radial edges). The cut
regions are usually covered by the neighboring band, but escape it when
segments are short relative to the corner-cut extent; cuts can also
cascade (an intersection landing near the far end of a short offset
segment can eliminate nearly whole bands). Minimal repro: 3 vertices, one
22.6-degree bend (`test/data/features/buffer/r_concave_join_dent.json`,
planar, `-buffer 1000 left tolerance=0 no-audit`, probe (-140, 863) sits
at t=0.49 / 90% depth of segment 2's band and is missing from the output;
`r_concave_join_dent_ll.json` is the lat-long twin from real data).
The harmfulness of any single cut depends on nonlocal coverage (on
`__state_innerlines.geojson` at 1km, ~38k corner-cut escapes exist but
only ~70 dent the output), which is why the audit tests emitted geometry
instead of enumerating cut mechanisms.

A related pipeline fix: `per_part_holes` (in `PolygonTiler`, used only by
the polyline-buffer dissolve). A buffer shape's rings are independent
overlapping pieces of one union; the reverse-wound pockets that the hole
divider extracts from one self-intersecting ring must not block the tile
flood of every OTHER ring (they used to, stranding covered tiles). The
polygon-buffer pipeline keeps shape-wide hole semantics: its shapes mix
buffer rings with REAL polygon holes.

## One-sided buffers: winding-fill construction, no lobe-removal pass (current default)

One-sided line buffers (`left`/`right`, and the `offset-*` lines that build on
them) are built by the **winding fill**, run per feature
(`makePolylineBufferPerFeature` in `mapshaper-polyline-buffer.mjs`):

- The offset ring is a single continuous loop -- offset curve + end caps + the
  source path as the inner edge. Concave bends use the **dip-to-vertex** join
  (`mapshaper-path-buffer-v4.mjs`, the `opts.winding_fill && joinAngle < 0`
  branch): walk the incoming offset to its end, dip back to the original path
  vertex, then walk out the outgoing offset. No section splits, join-sector
  rings, or band-coverage audit.
- The dissolve keeps the nonzero-winding tiles of that construction
  (`getWindingTilesByShapeId`). The source path is spliced in as a coincident
  polyline so it cuts the rings and pins the buffer's inner edge to the path;
  the path layer is dropped after `addIntersectionCuts`.

**No wrong-side "lobe removal" pass runs.** Two removers were built and both
measured strictly *worse* than doing nothing (innerlines 1km left / NC/SC 2km
left):

| pipeline | innerlines dents | NC/SC buf×path crossings |
| --- | --- | --- |
| legacy section-split + band-coverage audit | 0 | ~1066 |
| **winding construction only (shipped)** | **21** | **447** |
| winding + topological flood remover | 4114 | 1103 |
| winding + per-tile geometric (complement-principle) vote | 4200 | 1172 |

The topological flood (`removeWrongSideLobes`, since deleted) walls itself at
the path and floods the buffered side; it both *under-keeps* (legitimate band
tiles at concave bends are topologically separated from the seeds -> ~4093
coverage dents) and *over-keeps* (the band and a wrong-side lobe stay connected
across a fold, so the flood leaks and the jagged kept/dropped boundary crosses
the path *more* than the raw construction). The per-tile geometric vote
(still used by the `offset-*` split pipeline, `getFrontTilesByShapeId`)
misclassifies band tiles right at concave bends, where the nearest-foot cross
product is ~0. Both failure modes are at the same hard cases (folds, concave
bends), so neither remover is viable. The residual wrong-side lobes that
survive on self-approaching paths (e.g. `s_NC_SC_border.json`) originate in the
offset construction and cannot be cleaned at the tile level without
reintroducing dents.

**Clipper2 review (no transferable fix).** Clipper2's offsetter
(`CPP/Clipper2Lib/src/clipper.offset.cpp`) removes spurious offset regions by
constructing concave joins as deliberately **negative**-winding regions
(`OffsetPoint`, the "is concave" branch inserts `[perp_k, vertex, perp_j]`)
and finishing with a **Positive**-fill union (`ExecuteInternal`). mapshaper
already replicates that exact 3-point dip, but:

- Clipper2 never offsets *one* side of an open path. `OffsetOpenPath` always
  offsets both flanks and caps the ends -- a two-sided closed polygon. The
  negative-region trick cleans concave spikes and over-shrink reversals in that
  two-sided result; it does not address one-sided wrong-side area.
- mapshaper's one-sided ring is already cleanly **positive** (verified: a
  positive-fill rule gives an identical result to the shipped nonzero rule, and
  a negative-fill rule empties the buffer). The wrong-side lobes are
  positive-winding excursions from *self-approaching path geometry*, not
  negative concave folds, so positive fill has nothing to discard.

The constructive takeaway: Clipper2's clean *two-sided* construction is the
solid building block. A robust one-sided buffer is best pursued as
clean-two-sided + a robust **path split** (the `offset-*` pipeline's basis);
the open problem there is tile classification at the medial axis where two path
strands are equidistant, not the construction.

### Why a topological path-split is *not* more robust than the winding fill

The natural alternative to the per-tile complement vote is a **per-component
flood**: treat the source path + end-cap "walls" as barriers, flood the
two-sided footprint across the remaining (non-path) arcs, and label each
connected component front or back. This is only correct if the path + caps form
a *watertight* divider -- every footprint region must be reachable from exactly
one side. A probe (since removed) measured this directly, and the idea fails for
a concrete, intrinsic reason. Three findings, on `__state_innerlines.geojson`
(1km) and `s_NC_SC_border.json` (2km):

1. **The two-sided construction has no coverage gaps on the centerline.** A
   centerline point is at distance 0 from the path, so a correct two-sided
   buffer must contain it. Dense sampling of every source segment found **0
   uncovered of 558,890** (innerlines) and **0 of 22,515** (NC/SC). The split's
   basis is sound along the path body -- dents come from the *one-sided*
   construction, not the two-sided one.

2. **A winding footprint is identical to the boundary-flood footprint.** The
   suspicion was that `PolygonTiler` (boundary flood, `getTileIdsByShapeIds`)
   drops self-overlap tiles that a winding fill would keep. It does not: for
   both NC/SC features the two footprints matched tile-for-tile (`wind-only 0`).
   `PolygonTiler` already assigns self-overlap tiles, so there is no footprint
   trick to recover.

3. **The divider is watertight along the path body but leaks at the ends.** With
   path + caps as barriers, the flood splits the body cleanly (NC/SC: 178/185
   and 689/692 path arcs are interior dividers with footprint tiles on both
   flanks) but every "detached" arc -- a divider gap -- sits at a path
   **endpoint**: open caps, and points where one feature's endpoint meets
   another's (a border junction). One flooded component then spans ~50% of the
   footprint (front + back joined through the gap).

The leak is **geometrically intrinsic** at those ends. Where a path is
near-closed or self-approaching (NC/SC shape 0's two open ends are ~1.5 km
apart at a 2 km radius, so the end caps overlap), the front and back bands
physically merge into one region of the plane; no path-based divider can
separate what is genuinely connected. This is the *same* geometry that produces
wrong-side lobes, and robust cap-sealing (marching the wall out until it clears
the band, `extendToExitBuffer`) does not change it. So the per-component flood
is no more robust than the shipped winding construction on exactly the hard
cases, and it is slower (whole two-sided buffer + split vs. one-sided
construction). The `offset-*` pipeline therefore keeps the **local per-tile
complement vote** (`getFrontTilesByShapeId`), which tolerates the merge by
classifying each tile by its own nearest-foot side rather than by connectivity.

## Approaches tried and rejected (do not re-tread without new ideas)

- Architectures that put fold/wedge coverage back into a single ring's
  winding (inline concave arcs, dip-to-vertex slits, wedge-arc
  double-cover splits, deferred "safe" splits): all fail at scale. A
  closed ring fundamentally cannot represent the union of swept bands
  once the path folds over itself: a fold-lens and a courtyard hole are
  boundary-identical but need opposite answers (the sweep pairing is not
  in the ring). Several of these passed every small fixture and the full
  test suite, then produced thousands of dents on
  `__state_innerlines.geojson` -- small-fixture green proves nothing
  here; always run `test/tools/buffer/audit.mjs` on innerlines.
- A topological per-component flood split for one-sided buffers (path +
  caps as barriers, flood the two-sided footprint, label components
  front/back): leaks where the path is near-closed/self-approaching or
  meets a junction, because front and back bands genuinely merge there --
  no divider can separate connected regions. Same hard cases as wrong-side
  lobes, and slower. See "Why a topological path-split is not more robust"
  above.
- Blanket protective band-quads at concave joins: correct but ~5x
  dissolve cost (tens of thousands of quads).
- Cheap local gates for which cuts matter (escape-angle thresholds,
  band-vs-radial crossing tests, fold-magnitude bounds): each pruned too
  little or reintroduced dents; coverage is nonlocal.
- Tile-level repair in the dissolve (re-adding unclaimed mosaic tiles
  that pass a coverage test): cannot fix the real cases -- the lost
  regions are never enclosed by construction geometry, so the mosaic has
  no faces there to restore. (The mosaic itself was exonerated: at every
  dissected dent, the constructed rings genuinely fail to enclose the
  region; `test/tools/buffer/diagnose.mjs` shows this per-stage.)
- An incrementally-maintained winding cursor in the audit's stabber
  (walking coverage state along the path instead of recomputing per
  stab): ~2x faster but caused a small, wobbling audit regression from
  floating-point drift at near-tangent crossings. Backed out; the shipped
  stabber recomputes base windings per stab in one pass over
  vertical-slab-indexed edges.
- Speeding up the stabber's winding seed. Profiling shows the stabber is
  ~90% of the audit's cost, and within it the per-stab cost is dominated
  by the winding seed: an upward ray that scans a full-height, width-r
  slab of edges (a north-south path piles its whole edge set into one
  slab; ~310 edge tests per stab at 1km on innerlines). At 1km ~78% of
  segments are at risk, so pruning the risk gate further is not available.
  Tried and rejected: (a) capping the seed ray at a few r instead of
  carrying it out to the ring bounding box -- ~2.4x faster but reintroduces
  9-16 dents on innerlines, because a far fold can cover the band and the
  seed must reach truly outside every ring (the nonlocal-coverage problem
  again); (b) a single outward ray along the band perpendicular indexed in
  a 2D grid, optionally with a coarse "skip empty blocks" layer -- exact
  and conceptually cleaner, but meandering paths make the ray cross a large
  mostly-empty bounding box, so it was at best ~10% faster (519 vs 583 ms)
  while adding a DDA and a coarse grid. The seed is an irreducible nonlocal
  query; no cheap, safe shortcut was found.
- A post-dissolve audit (construct without the audit, dissolve, then probe
  the clean dissolved polygon with ordinary point-in-polygon and patch
  dents) would delete the stabber's per-ring/winding machinery, but the
  patch step has to merge the band quads back into the shared-arc topology
  (a second, localized dissolve), trading the stabber's complexity for
  topology-merge complexity rather than removing it. Not pursued.

## Validation procedure

1. `npm run build && npm test` (the m_loops hole-count tests are very
   sensitive to winding mistakes).
2. `test/tools/buffer/audit.mjs` on `__state_innerlines.geojson` at 1km:
   left/right x default/tolerance=0 must all report 0 failures.
3. The fixtures: `r_concave_join_dent*.json` (covered with the audit,
   dented with `no-audit` -- both locked in `test/buffer-test.mjs`);
   `b_open_loop.json` at radius 136654 left (planar) exercises the
   sustained-curvature risk class (area must be ~206289, not ~187820).
4. Differential matrices: one-sided outputs across the
   `test/data/features/buffer/` fixtures should differ from an
   unaudited/unfiltered run only by area increases (dent fills) and
   sliver-hole cleanup; left-of-path must equal right-of-reversed-path
   exactly.
5. `test/tools/buffer/phases.mjs` for cost: two-sided must be unaffected by
   one-sided changes; on innerlines at 1km the audit adds roughly +45%
   (the data is genuinely at-risk almost everywhere at that radius),
   ~+25% at 100m, ~0 on smooth data.

## Offset lines (`offset-left` / `offset-right`)

`-buffer ... offset-left|offset-right` on a polyline layer outputs a **line**
layer: the outside edge of the one-sided buffer polygon (the offset curve),
with the round caps removed and the ends squared off perpendicular to the
path endpoints. Implemented by `makeOffsetLines` in
`mapshaper-polyline-buffer.mjs`; wired in `mapshaper-buffer.mjs`
(`offset_left`/`offset_right` map to a one-sided `left`/`right` build).

Construction reuses the **split** one-sided pipeline (the better basis for
offsets, see below):

1. `buildSplitBufferDataset` builds, per feature, the two-sided buffer rings
   plus a coincident path "wall" (the source path extended past each open end
   so it cuts the round caps boundary-to-boundary), both tagged `__bufsrc`.
2. One `addIntersectionCuts`; `getPathArcsByShape` recovers each shape's
   directed path arcs by `__bufsrc`.
3. Per shape, `getFrontTilesByShapeId` keeps the requested side and the rings
   are dissolved (`pathfind('dissolve')`) to boundary rings.
4. The boundary of a one-sided buffer polygon is `offset curve + caps +
   path edge`. The path edge is dropped by a **topological arc-id filter**
   (`extractNonPathRuns`: keep maximal runs of arcs not in the shape's path
   set). The remaining caps are trimmed **geometrically** (`trimCapVertices`:
   drop run-end vertices that fall outside a path endpoint's perpendicular
   line, computed in local meters). A ring with no path arc is the offset
   loop of a closed source ring and is kept whole.
5. Runs are emitted as `LineString`s (basic cleanup only: zero-length runs,
   including caps that trim away entirely, are dropped).

**Why the split pipeline, not the winding fill.** Both one-sided methods
splice the path in as coincident arcs, so either could support the path-edge
filter. The split method is the better basis because the offset curve *is*
its well-tested two-sided outline restricted to the front side, so it carries
fewer wrong-side lobes, and it builds one whole-dataset topology rather than
the per-feature winding pipeline. Crucially, **offsets are far cleaner than
the one-sided buffer audits suggest**: most residual wrong-side artifacts fold
back along the path edge, which the path-edge filter discards for free. On
`__state_innerlines.geojson` at 1km the one-sided buffer audit flags ~73-134
wrong-side lobes, but the extracted offset line crosses the source path only
**once per side**.

**Validation** (locked in `test/buffer-test.mjs`, "offset-left /
offset-right options"): output is a line, not a polygon; on a planar L-path
the left (concave) offset is exactly `[[0,10],[90,10],[90,100]]` (square ends,
no caps) and the right (convex) offset rounds the corner on the radius-r arc;
a straight path gives a clean parallel offset; offset-left+offset-right
together and offsets on non-line layers are rejected. For manual inspection,
overlay the offset against the source paths (`kind:"offset"` vs `kind:"path"`)
as in `buffer-inspect/offset_{left,right}.geojson`.

Known gaps: antimeridian splitting is not applied to offset output yet (local
data is unaffected).
