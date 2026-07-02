# Line buffering (buffer-v4): architecture, failure modes, validation

Working notes from the 2026-06/07 correctness/performance work on `-buffer`
for polyline inputs. Audience: developers (or agents) continuing this
work. Tools referenced here live in `test/tools/buffer/` (see its README).

## Architecture

A polyline buffer is built in two stages (`src/buffer/`):

1. **Construction** (`mapshaper-path-buffer-v4.mjs`): paths are
   pre-simplified (Douglas-Peucker at an interval equal to the error
   budget; `tolerance=`, default 1% of the radius; end-segment bearings
   are pinned so cap geometry stays exact; `tolerance=0` disables it),
   then swept into offset rings.
   - **Two-sided buffers** use the outline fast path
     (`makeTwoSidedOutlineRing`): ONE closed, possibly self-intersecting
     ring per path (left side + cap + reversed right side + cap), with
     concave joins emitted inline as reversed arcs. This is 4-6x faster
     than per-section rings because the dissolve's cost is driven by the
     number of overlapping rings it must mosaic. **Closed** source rings are
     opened with a sub-tolerance micro-gap (`openClosedRingWithMicroGap`) so
     the same open-path builder applies (round caps close the seam) -- the
     "Unify buffer construction" change; two-sided closed rings no longer use
     per-section rings. Self-overlap loops in the outline are collapsed before
     the dissolve -- see "Two-sided outline: self-overlap loop removal" below.
   - **One-sided buffers** default to the **winding fill** with dip-to-vertex
     concave joins and no lobe-removal/audit pass (see "One-sided buffers"
     below); this supersedes the per-section + audit path for `left`/`right`.
   - **Per-section rings** (`makeLeftBufferRings`: reversed path side + offset
     side, split at concave bends whose offset segments do not intersect, with
     a sector ring covering the wedge at the split) underlie the one-sided
     builds and the `band-method` two-sided escape hatch. The
     clean-outline-winding grow (polygon buffers) and the open two-sided line
     outline share ONE constant-radius tracer (`traceCleanOffsetSide`), so a
     construction fix lands in both.
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

## Two-sided outline: self-overlap loop removal (pre-dissolve)

Where the radius exceeds the local radius of curvature, the concave-side offset
folds back and crosses itself, leaving small "overshoot" loops in the outline
ring. These are pure self-overlap -- the region they enclose is already inside
the buffer, so the dissolve fills them anyway. Collapsing each loop to its
crossing point *before* the dissolve is a **speed optimization**: dissolve cost
scales with the number of overlapping rings / self-crossings it must mosaic
(measured on innerlines 1km: aggressive removal ~420 ms vs ~500 ms baseline vs
~1300 ms with removal effectively off). It must be **area-neutral** -- a collapse
may only drop double-covered area, never real boundary.

Code: `src/buffer/mapshaper-buffer-loop-removal.mjs`.
- **Default** (open two-sided line, closed ring line via micro-gap, AND the
  clean-outline polygon grow -- expanding + topological): the multi-pass
  **dip+coverage** remover, `removeBufferRingLoopsIterative` with construction dip
  tags and the exact scanline coverage check (full design below, "Dip-tag
  iterative remover"). Collapses far more self-overlap than the older methods
  (0 self-intersections on the NE/SD border fixture vs 4 for the removed
  crossing-direction method, 98 for the source-turn gate) while staying
  area-exact on dense meshes and keeping real holes.
- **Band-method winding-fill** (negative / one-sided polygon grow only): still
  uses `removeBufferRingLoops` with the source-turn gate (`srcPos`/`turnPrefix`).
  That path is separate from clean-outline loop removal.
- **Opt out:** `-no-loop-removal` skips pre-dissolve collapse entirely.

**Correctness oracle.** The dissolve of the *un-removed* offset
(`no-loop-removal`) is the exact buffer, so loop removal is correct iff its
dissolved area equals the `no-loop-removal` area. To *localize* errors,
symmetric-difference the two dissolved polygons (`-erase snap-interval=0`, tag
each sliver with its area): the clips cluster into a few dozen discrete lobes,
not diffuse noise. Note `snap-interval=0` -- the default import snap hides the
sub-tolerance slivers.

**Dense-mesh over-collapse (removed crossing-direction method; SOLVED by dip+coverage).**
The old crossing-direction remover (`removeBufferRingLoopsByDirection`, removed
2026-07) clipped real area wherever overshoot loops overlapped densely
(`__state_innerlines.geojson`: ~36-43 discrete lobe-clips at 10-50km, ~500x more
clip area than spurious-bulge area -- a real bias, not noise). Root cause: the
winding *sign* of a self-crossing loop classifies covered-overlap-vs-real-boundary
correctly only for a **minimal** loop; the greedy forward scan collapses
non-minimal spans whose *net* winding sign is unreliable -- a **local-information
ceiling**. The dip+coverage default breaks the ceiling with a *nonlocal*
per-collapse decision (an exact winding-number coverage integral against the whole
ring, below): on innerlines 10km its symmetric difference vs `no-loop-removal` has
**no clip above the 3e4 m^2 floor** (largest residual 26k, left for the dissolve),
zero spurious additions, and it preserves every hole.

### Rejected loop-removal experiments (2026-07 -- do not re-tread without new ideas)

Oracle for all: area-neutrality vs `no-loop-removal` on `__greenland_merc.fgb`
and `__state_innerlines.geojson` at 10/50km.

- **Crossing-direction collapse** (`removeBufferRingLoopsByDirection`): classified
  each minimal self-crossing sub-loop by winding *sign* (same as parent = collapse,
  opposite = hole). Area-neutral on simple cases but clipped real lobes in dense
  meshes and on Greenland at 30km (~1.7% area). Removed with the A/B CLI flags.
- **Widen the scan window.** Counterproductive: bigger window = *worse* drift
  (innerlines 10km: win30 2.4e-4 -> win120 1.3e-3 -> win300 2.1e-3). A wider
  look-ahead lets the greedy scan reach farther same-wound crossings and chord
  across *more* real area. Window=30 limits the damage; it is not the cause.
- **Innermost-first stack walk** (collapse the tightest minimal loop first,
  classifying as it forms, instead of forward-from-anchor greedy). More
  aggressive -> fewer vertices -> faster, and exact on Greenland + the error
  fixture. But drift on innerlines was NOT better (often worse): collapsing
  *more* minimal loops just clips more, because the winding *sign* itself is
  unreliable in dense overlaps. Restructuring the walk cannot fix a signal
  problem.
- **Minimality / simplicity gate** (refuse to collapse a span containing another
  self-crossing). Cut drift ~4x, but raised vertex count to source-turn-gate
  levels (innerlines 10km 69k -> 108k -- as slow as the gate downstream) and adds
  an O(span^2) check. No net win.
- **Area cap on the dropped loop** (refuse collapses whose removed area exceeds
  ~0.05-0.1*dist^2, latitude-corrected via `cosh(y/R)` under web Mercator; O(1),
  no provenance). Cut *aggregate* drift 3-4x for far fewer extra vertices than
  the gate, and cleanly **subsumes the `turn==1` guard** (fixes
  `greenland_merc_line_error` on its own, monotonically safe -- only ever refuses
  a collapse). But it only *shrinks* the errors: a genuine fold-back overshoot
  and a small real lobe can have the same area, so it still leaves hundreds of
  local clips. Rejected -- reduced error is not error-free.

The through-line: loop removal is a **speed-vs-correctness trade**. Aggressive
local collapse is fast but clips real area in dense overlaps; dip+coverage is
(near-)area-neutral on the clean-outline paths, while `no-loop-removal` is exact
but slowest.

### Dip-tag iterative remover + exact scanline coverage check (2026-07)

`removeBufferRingLoopsIterative` is the sole clean-outline loop remover for
two-sided line/ring buffers and the clean-outline polygon grow. It is a
multi-pass forward-collapse whose span gate is the offset
ring's cumulative turn with **construction-tagged reversed concave-join ("dip")
cusps excluded** (`dipTags` from `makeTwoSidedOutlineRing`; see
`ringAbsTurnPrefix`). Excluding the fold cusps reconstructs the source stretch's
real turn without needing source provenance, so the turn gate can classify
overshoot-vs-hole from ring geometry alone. On `__state_innerlines` 10km the raw
dip-tag remover (accept every gated collapse) cut loop-removal error area ~6x vs
the removed crossing-direction default but still left ~34 discrete clips > 1e5 m^2.

**Why cheap local signals can't finish the job.** Labelling every collapse
good/bad against the known error lobes showed `segmentTurn2` (crossing
handedness), the loop's winding **sign**, dropped-loop **area**, real-vertex
count, chord "detour", and source-index gap all *correlate* with badness but
**overlap** the good tail -- a big safe fold and a small real lobe coincide in
every one. These errors are single-covered **real lobes**, not opposite-wound
holes, so they share the local orientation of a genuine overlap. A tuned veto
(refuse any suspect: `real turn >= 60` AND `>= 2` real verts) got the big clips
to ~8 but was expensive -- it refuses ~15% of collapses, most of them *valid*
folds, so far more loops fall through to the dissolve.

**The fix: an exact per-collapse coverage decision, cheap enough to run.**
`collapseKeepsAreaCovered` measures how much of the region a collapse would drop
becomes **uncovered** and refuses only when that exceeds `BUFFER_LOOP_CHECK_MIN_AREA`
(3e4). Coverage is a winding-*number* test against the **stable pass-input ring**
(not the mid-pass output), so it is independent of collapse order: a point in the
dropped loop `L` stays covered iff `windingFullRing(p) - windingLoop(p) != 0`. For
a two-sided outline the main body always covers the interior, so a fold has
`|winding| >= 2` (body + fold) and survives, while real boundary has `|winding|
== 1` and drops to 0. The uncovered area is **integrated with a horizontal
scanline** rather than point-sampled -- point sampling was tried first and missed
interior uncovered pockets that sit away from the sampled boundary (an audit
found ~11 such accepted loops), so it is not reliable for zero clips.

Made affordable by: (1) an **area pre-filter** -- a loop whose own area is below
the threshold cannot clip more than the threshold, so only large loops are swept;
the threshold is in ring units and, since the web-Mercator scale factor is `>= 1`
everywhere, is an upper bound on real m^2 so no big clip is skipped at any
latitude. (2) A per-pass **y-band edge index** (`buildEdgeYIndex`) so each
scanline touches only local edges, not the whole ring. (3) A **base-winding**
split so only crossings inside the loop's narrow x-range are sorted. Result on
innerlines 10km: **0 clips > 1e5 m^2** (total missing 3e4 m^2, a single sliver),
build ~0.5s default -> ~0.85s, i.e. faster than the veto it replaces; exact on
`greenland_merc_line_error` (30km buffer matches the reference to 6e-13) with no
Greenland regression.

**No turn gate on the dip path -- coverage is the sole arbiter.** Once the
scanline coverage check exists, the tag-excluded turn gate is not just redundant
but harmful. A tight hairpin (source path turning more than a semicircle over a
short span) produces an *interior, fully-covered* self-overlap whose tag-excluded
turn still exceeds `BUFFER_LOOP_MAX_TURN` (150 deg), so the turn gate refuses it
*before* coverage runs and the loop survives into the output. On the NE/SD state
border at 10km (`test/data/features/buffer/x_ne_sd_border.json`) this left 11
such interior loops uncollapsed, all with source turn 160-225 deg and coverage
uncovered-area 0 (`x_ne_sd_unremoved_loop*.json`). `collapseRingLoopsPass` now
skips the turn gate entirely on the coverage path (`coveragePath = !gated &&
dipTags`); the source-turn and geometric paths, which have no coverage check,
keep it. Effect: the border's 19 self-intersections drop to 0, **no new clips**
on innerlines or any Greenland line dataset (missing *and* extra big-clip counts
stay 0), and the build is **~20-30% faster** (10km innerlines ~0.85s -> ~0.65s,
30km Greenland ~2.2s -> ~1.5s) because collapsed loops no longer fall through to
the more expensive dissolve. End caps are preserved: collapsing a cap uncovers
real boundary, which coverage refuses (verified on `__greenland_merc_open`). This
is why the turn gate's old rationale ("caps exceed maxTurn so are never
collapsed") is now handled correctly by coverage instead of a blunt threshold.

### Making dip+coverage the default: hole-safety hardening (2026-07)

Promoting the dip+coverage remover from opt-in to the default (for two-sided
line/ring buffers *and* the clean-outline polygon grow -- expanding + topological)
surfaced two correctness gaps the "0 big clips" metric never exercised, because
that metric only measured **uncovering**. Both are about the remover **filling a
real winding-0 region** (a buffer hole, or an open outer-wall notch), which *adds*
coverage and so is invisible to the uncovered-area check. The suite caught them
(annulus of a closed ring, `m_loops` real holes, self-crossing-line holes):

1. **Opposite-wound hole protection** (per-candidate signed-area test in
   `collapseRingLoopsPass`). A dropped sub-loop wound opposite to the parent ring
   bounds a real hole; the collapse is refused outright, regardless of area. This
   is the cheap catch for holes that are cleanly opposite-wound within the window
   (e.g. an annulus interior). The area pre-filter alone would have filled any
   hole below `3e4` m^2. The test is an `O(span)` `loopAreaSign` run only on the
   crossings the collapse actually evaluates -- an earlier version pre-scanned the
   whole ring each pass (`markOppositeWoundHoleVertices`, `O(n*maxGap)` + a
   per-pass `Uint8Array`), which added ~15% to a dense line buffer for no extra
   safety; the per-candidate form is as fast as doing no hole work at all. A
   same-wound overshoot fold that happens to *wrap* a hole is not caught here but
   by the fill guard below (the wrapping loop's area is >= the wrapped hole's, so
   any hole big enough to matter clears the pre-filter and is measured as filled).

2. **Disk-relative hole-fill guard.** Some collapses reconnect/fill a hole whose
   boundary is *not* an opposite-wound sub-loop in the window (a topological
   change with no area delta -- `m_loops 650m` dropped a hole 3->2 that every
   source-provenance method keeps). The same scanline that integrates uncovered
   area now also integrates **filled** area (`_lastFillArea`: `wl != 0 && wf ==
   0`), and a collapse is refused if it would fill more than `dist^2 *
   BUFFER_LOOP_FILL_AREA_FRAC` (5e-4). The floor is **disk-relative** because an
   absolute area cannot separate the two populations: a 10km fold sliver
   (~8.6e-5 of the disk) and a 650m real hole (~1e-2 of the disk) have similar
   *absolute* areas, but differ ~100x relative to the radius. The guard leans low
   (toward preserving holes -- a false veto only leaves a self-overlap for the
   dissolve). The area pre-filter skip is `min(uncoveredFloor, fillFloor)` so a
   loop too small to *either* clip or fill still skips the scanline (perf: large
   buffers keep the same `3e4` budget as before; small buffers scan more but are
   cheap).

Result: the border fixture still cleans to 0 self-intersections, `m_loops` and
the annulus keep every hole, innerlines 10km has no clip above the floor, and the
polygon-grow default routes dip tags through `BufferBuilder` +
`buildCleanOutlineRings` (previously discarded). The fan-apart outer-wall notches
that gap-patch fills are *also* filled by the remover when their inward dip
self-crosses (a valid subset-of-buffer fill, same fold class as the border
loops); `no-gap-patch` therefore fills some gaps the loop remover reaches
(`test/buffer-test.mjs` "gap-patch" tests updated to assert gap-patch is still
*required*, not that it is the sole filler). Regression: `test/buffer-loop-
removal-test.mjs` "default remover: strips self-overlaps, keeps holes".

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
6. **Two-sided loop removal** (area-neutrality): compare `-buffer <r>`
   dissolved area against `-buffer <r> no-loop-removal` on
   `__greenland_merc.fgb` and `__state_innerlines.geojson` at 10/50km. Any
   drift is a loop-removal error; the current default is near-exact on
   Greenland but leaves ~1e-4 net drift (discrete lobe-clips) on innerlines
   -- see "Two-sided outline: self-overlap loop removal". Small fixtures pass
   trivially; the innerlines mesh is the discriminating case.

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
