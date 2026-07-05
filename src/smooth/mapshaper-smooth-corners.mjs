// Structural-corner detection for -smooth's corner preservation (on by default;
// disabled with no-corners).
//
// Many boundaries alternate between natural, freely-curving stretches (coast,
// river centerline) and artificial straight-line segments (state/county
// borders). Plain low-pass smoothing rounds the sharp corners where artificial
// segments meet. This module finds those corners so the caller can pin them and
// smooth each span between them independently, leaving straight runs intact.
//
// The approach reduces "preserve straight segments and their corners" to
// detecting the corners that bound long, low-curvature (straight or gently
// curving) runs:
//   1. Flag vertices whose direction changes sharply over a tolerance-scaled
//      window AND where that turn is concentrated near the vertex rather than
//      spread out. The concentration test compares the turn over a small inner
//      window to the turn over the full window: for a uniform curve the ratio is
//      a fixed fraction (the window-length ratio), so a steadily-curving stretch
//      -- whether a tight coastline or a gentle, hundreds-of-km graticule arc --
//      never qualifies; only a localized kink, where the inner turn approaches
//      the full turn, is a corner.
//   1b. (open paths) Also flag the end of a long straight run that turns sharply
//      over a single segment but only gently over the window -- a small jog where
//      a surveyed border meets a curve, which step 1's window would dilute below
//      the corner angle. Keyed off the raw segment turn, but the pinned vertex is
//      snapped to the nearby end of the straight run (stable under tiny vertex
//      moves) and only where that run's line is actually left (so an incidental
//      notch after which the run resumes on the same line is not flagged). See
//      straightRunEndNear.
//   2. Between flagged corners, classify each span as "structural" if it is long
//      relative to the tolerance and its curvature stays low (so a straight or
//      slowly-curving graticule line counts, but sub-tolerance wiggle does not).
//   3. Drop corners that don't border any structural span (e.g. spikes inside a
//      wiggly coastline), merging their spans, until the partition is stable.
//
// All geometry is done in the caller's smoothing channels (planar x,y or
// geocentric x,y,z), so detection is isotropic and matches the smoothing space.
// Angles are computed with plain dot products, which work in any dimension.

var CORNER_ANGLE = 35 * Math.PI / 180; // min concentrated turn to call a corner
var TANGENT_WINDOW_FACTOR = 0.25;      // tangent-estimation half-window = tol * this
var INNER_WINDOW_FACTOR = 0.4;         // concentration probe window = tangentWindow * this
var CORNER_CONCENTRATION = 0.6;        // min ratio of inner-window turn to full-window turn
var MIN_RUN_LEN_FACTOR = 1.0;          // a structural run must be at least tol * this long
// ...and bend no tighter than radius tol * this. This is the curvature gate for
// "structural" (straight or slowly-curving, e.g. a surveyed border or graticule
// arc). It must be well above 1: at factor 1 a minimal run may turn a full
// radian (~57 deg) over its own length, so ordinary coastal arcs qualify and
// their end bends get pinned as spurious corners (radius ~1-1.6*tol). At 3 a
// minimal run turns <= ~19 deg, excluding natural coastal curvature while still
// admitting genuinely straight borders (radius ~infinite) and graticule arcs
// (radius >> tol).
var MIN_RUN_RADIUS_FACTOR = 3.0;

// Straightness gate used to decide corner *retention* (whether a detected corner
// borders a run worth pinning), as distinct from isStructuralRun's per-vertex
// gate that decides whether a span is copied verbatim. A run is "straight at the
// smoothing scale" if every vertex stays within a thin corridor around the
// straight chord joining the run's endpoints: max perpendicular deviation <=
// STRAIGHT_DEV_FACTOR * chord length. Because this measures deviation from the
// chord rather than summing raw per-segment turning, it is robust to
// sub-tolerance digitizing wiggle: a finely ragged but geometrically straight
// border (huge total per-vertex turning, tiny deviation) qualifies, so its
// bounding corners are kept -- while isStructuralRun would (correctly, for its
// own purpose) reject it as too wiggly to copy verbatim. The ratio behaves like
// a minimum-radius-over-length gate: a run bending with radius R over length L
// deviates from its chord by ~L/(8R), so the threshold corresponds to
// R >~ L/(8*STRAIGHT_DEV_FACTOR) -- longer runs must be proportionally straighter
// to count, which matches intuition (a 28 km stretch bending at radius 4 km is
// obviously not straight). Genuinely curving coastline bows far from its chord
// and is still rejected, so spurious corners inside wiggly stretches keep getting
// culled. Tightened from 0.03 to 0.02 (a run may curve ~9 deg over its length, not
// ~14) after a coastline island pinned corners at both ends of a ~10 deg-curving
// stretch that read as "straight" only under the looser corridor: an acute corner
// takes the full corridor regardless of the angle coupling below, so only the base
// factor governs whether such a run can anchor a sharp corner.
var STRAIGHT_DEV_FACTOR = 0.02;

// Angle coupling for corner retention: how much sharper the corner must turn than
// the run it borders already curves. A run that passes the chord test may still
// bend gently within the STRAIGHT_DEV_FACTOR corridor -- for a circular arc the
// chord-deviation ratio is ~ (the run's total turn)/8, so the base 0.02 admits a
// run that curves ~9 deg over its length. Pinning a *gentle* bend at the end of
// such a run is unsafe: the "corner" is barely sharper than the run's own
// curving, so it is really a point on a smooth bend, not a junction. (This is the
// failure mode on coarsely sampled / already-simplified coastlines, where a
// gently curving stretch is sampled as a few long segments that read as a
// borderline-straight run with soft bends at each end.) So the straightness limit
// for retention is tightened for gentle corners: a corner is pinnable only if its
// turn is at least PIN_TURN_RATIO times the run's own bend, i.e.
//   turn >= PIN_TURN_RATIO * (8 * dev)  <=>  dev <= turn / (8 * PIN_TURN_RATIO).
// retentionDevLimit() returns the smaller of STRAIGHT_DEV_FACTOR and
// turn/(8*PIN_TURN_RATIO), so the coupling only bites for gentle corners (below
// ~2*STRAIGHT_DEV_FACTOR*PIN_TURN_RATIO ~ 46 deg); sharp corners (surveyed-border
// right angles, spits, hairpins) keep the full base tolerance, unchanged.
var PIN_TURN_RATIO = 5;

// Minimum length (in tol units) a straight run must have to justify *pinning* a
// bordering corner. This is deliberately larger than MIN_RUN_LEN_FACTOR (the
// floor for calling a span "structural" at all): pinning a corner is a stronger
// commitment than copying a clean span, so it demands stronger evidence that the
// run is a deliberate straight feature rather than incidental collinearity.
//
// The failure mode this guards against appears on sparse / already-simplified
// data, where a gently curving coastline is sampled as a few long segments. A
// short near-collinear stretch only ~1*tol long (often just 1-2 segments) then
// passes the chord-deviation test -- with so few interior points there is almost
// nothing to deviate -- and gets pinned, kinking an otherwise smooth curve. At
// the smoothing scale such a stretch is indistinguishable from a coarsely
// sampled bend, so it should not anchor a corner. Requiring the run to be
// clearly longer than the smoothing distance (factor 2) drops these stubs while
// keeping genuine straight borders (which run many times the distance) and even
// coarsely sampled but truly long straight segments (e.g. a 2-3*tol contour
// edge). Scales with corner-bias (via ctol), so a positive bias restores the
// old 1*tol behaviour for users who want shorter runs pinned.
var MIN_PIN_RUN_LEN_FACTOR = 2.0;

// When a long straight run's end turns sharply into a curve with a small jog, the
// sharpest single-segment turn can land a few vertices past the run's actual end.
// straightRunEndNear searches back this many source vertices (in addition to the
// distance-scaled tangent window) to snap to the stable run end, so detection
// does not depend on the smoothing distance being large enough for the window to
// span the jog. A jog is a handful of vertices; this is deliberately generous
// because the search returns the nearest genuine run end (or nothing).
var MAX_JOG_VERTICES = 6;

// Convert the user-facing corner-bias (0 = neutral) into the positive multiplier
// k applied to corner-detection resolution (ctol = tol / k). The mapping is
// symmetric about zero -- k(+b) * k(-b) = 1 -- and smooth there (both branches
// have slope 1 at b = 0), so opposite biases of equal magnitude are exact
// inverses. A positive bias makes detection finer (k > 1, ctol < tol: more, more
// finely supported corners); a negative bias makes it coarser (k < 1, ctol > tol:
// fewer corners), each as if the smoothing distance were tol/k. Examples: +1
// doubles the resolution (k=2, "as if distance were halved"), -1 halves it
// (k=1/2, "as if doubled"); +2 -> k=3, -2 -> k=1/3.
export function cornerBiasScale(cornerBias) {
  var b = cornerBias || 0;
  return b >= 0 ? b + 1 : 1 / (1 - b);
}

// Ratio of (typical segment length / smoothing distance) at or below which corner
// detection sees several segments per tangent window and behaves normally, so no
// automatic coarsening is applied. Above it the window shrinks toward a single
// segment and ordinary coarse-data bends start reading as corners.
var AUTO_BIAS_RATIO = 0.15;
// Most-negative automatic bias. Caps how far detection is coarsened on very sparse
// geometry (e.g. lo-res contours), where the ratio can be many times AUTO_BIAS_RATIO
// but a handful of doublings already merges the whole neighbourhood.
var AUTO_BIAS_FLOOR = -4;

// Automatic corner-bias from the geometry's coarseness relative to the smoothing
// distance. @medianSeg is a robust (median) segment length; @dist is the raw
// smoothing distance, both in the same ground units. Corner detection keys off a
// tangent window ~0.3*dist wide; when the typical segment is an appreciable
// fraction of the distance (ratio r = medianSeg/dist above AUTO_BIAS_RATIO) that
// window spans too few segments and gentle-but-coarse bends read as corners. We
// return a negative bias that coarsens detection (as if the distance were larger)
// enough to push the effective ratio back down: each halving of the effective
// resolution costs one bias step, so bias = -log2(r / AUTO_BIAS_RATIO), floored.
// Returns 0 (no adjustment) when the geometry is fine relative to the distance,
// which is the normal case for detailed datasets smoothed at a real distance.
// Note it only ever coarsens: a straight run that genuinely anchors a sharp corner
// survives this (the corner is retained by bordering a long straight run, which
// coarsening does not remove until it exceeds the run's length), while weakly
// supported bends on coarse coastlines/contours fall below the corner threshold.
export function autoCornerBias(medianSeg, dist) {
  if (!(medianSeg > 0) || !(dist > 0)) return 0;
  var r = medianSeg / dist;
  if (r <= AUTO_BIAS_RATIO) return 0;
  var b = -Math.log2(r / AUTO_BIAS_RATIO);
  return b < AUTO_BIAS_FLOOR ? AUTO_BIAS_FLOOR : b;
}

// @cornerBias (optional, default 0 = neutral) scales only the distance-
// proportional corner parameters, by dividing the tolerance they key off
// (ctol = tol / k, k = cornerBiasScale(bias)). The dimensionless thresholds are
// left untouched: the corner angle, the concentration ratio, and -- downstream,
// inside isStraightRun / retentionDevLimit -- STRAIGHT_DEV_FACTOR and
// PIN_TURN_RATIO. So corner-bias detects (and retains) corners exactly as if the
// smoothing distance were tol/k, while the smoothing kernel keeps using the real
// distance. In particular `-smooth corner-bias=-1 1km` gives the same corner
// results as `-smooth 2km` (a negative bias finds fewer, only well-supported
// corners; a positive bias finds more), but smooths at 1km. All lengths below are
// derived from ctol; only cornerAngle and concentration (both dimensionless) stay
// fixed.
export function getCornerParams(tol, cornerBias) {
  var ctol = tol / cornerBiasScale(cornerBias);
  return {
    tol: tol,
    cornerAngle: CORNER_ANGLE,
    tangentWindow: TANGENT_WINDOW_FACTOR * ctol,
    innerWindow: INNER_WINDOW_FACTOR * TANGENT_WINDOW_FACTOR * ctol,
    concentration: CORNER_CONCENTRATION,
    minRunLen: MIN_RUN_LEN_FACTOR * ctol,
    minPinRunLen: MIN_PIN_RUN_LEN_FACTOR * ctol,
    maxTurnRate: 1 / (MIN_RUN_RADIUS_FACTOR * ctol) // radians of turning per ground unit
  };
}

// Find the interior corner vertices of an arc.
// @t: cumulative arc length (length n). @channels: K coordinate arrays.
// @cyclic: true for a closed ring (n includes the repeated closing vertex; the
//   m = n-1 unique vertices are treated cyclically). @params: getCornerParams().
// Returns sorted vertex indices: for open arcs in [1, n-2]; for rings in [0, m).
export function findInteriorCorners(t, channels, n, cyclic, params) {
  if (n < 3) return [];
  var K = channels.length;
  var L = t[n - 1];
  var m = cyclic ? n - 1 : n;
  if (cyclic && m < 3) return [];
  var W = params.tangentWindow;
  var Wi = params.innerWindow;
  var turns = new Float64Array(m);
  var inner = new Float64Array(m);
  var lo = cyclic ? 0 : 1;
  var hi = cyclic ? m : n - 1; // exclusive
  for (var i = lo; i < hi; i++) {
    turns[i] = windowedTurn(t, channels, K, n, L, m, i, W, cyclic);
    inner[i] = windowedTurn(t, channels, K, n, L, m, i, Wi, cyclic);
  }
  // candidates above the angle threshold, that are concentrated (a localized
  // turn, not gradual bending -- see isConcentratedTurn), and that are the
  // sharpest turn within a tangent-window neighborhood (non-maximum suppression)
  var corners = [];
  for (var j = lo; j < hi; j++) {
    if (turns[j] < params.cornerAngle) continue;
    if (inner[j] < params.concentration * turns[j]) continue;
    if (isLocalMaxTurn(t, turns, j, W, L, m, lo, hi, cyclic)) corners.push(j);
  }
  // Open paths: also flag the terminal vertex of a long straight run that bends
  // sharply over a single segment but only gently over the tangent window -- e.g.
  // where a surveyed border meets a coastline with a small jog. The windowed test
  // above misses these because the wide window dilutes the sharp segment turn into
  // a sub-threshold bend, so the straight run's end gets rounded into the adjacent
  // curve. Here we key off the raw segment turn instead, but confine this rescue
  // to a genuine straight-run end with two gates (plus straightRunEndNear):
  //   1. the turn is fully concentrated in the inner window: inner-window turn >=
  //      full-window turn. This is a stricter form of the windowed path's
  //      concentration test (>= concentration * full) and is the crux of the
  //      distinction. At a straight-run end the approaches carry ~no turning, so
  //      the whole window's turn sits in the inner window (ratio >= 1); on a
  //      steadily-curving coastline the turning is spread across the window (inner
  //      < full), so a lone sharp segment there is rejected. The wide window
  //      dilutes the end's departure below the corner threshold (which is why the
  //      windowed path misses it), but the concentration ratio stays high.
  //   2. (via straightRunEndNear) a bordering straight run's line is actually left,
  //      so an incidental notch on an otherwise-continuing run is not pinned.
  // Rings keep the windowed-only detection for now.
  if (!cyclic) {
    var raw = new Float64Array(m);
    for (i = lo; i < hi; i++) raw[i] = vertexTurn(channels, K, i);
    for (j = lo; j < hi; j++) {
      if (raw[j] < params.cornerAngle) continue;
      if (inner[j] < turns[j]) continue;
      if (!isLocalMaxTurn(t, raw, j, W, L, m, lo, hi, cyclic)) continue;
      var e = straightRunEndNear(t, channels, n, j, W, params);
      if (e >= 0 && corners.indexOf(e) === -1) corners.push(e);
    }
    corners.sort(function (a, b) { return a - b; });
  }
  return corners;
}

// Given a sharp single-segment turn at open-path vertex @j, find the end of a
// long straight run that the path leaves, within arc length @W of @j, and return
// that run-end vertex to pin (or -1). We search a neighbourhood rather than
// requiring the run's last vertex to be exactly where the segment turn peaks: a
// jog into a curve can place its sharpest vertex a step or two past the run's
// end, and exactly which vertex is sharpest is sensitive to tiny differences in
// vertex placement -- but the straight run's end itself is stable. Snapping to it
// keeps detection from flickering on and off with sub-tolerance vertex moves. The
// straightRunLeaves test only succeeds at a genuine run end whose continuation
// departs, so an incidental jog after which the run resumes is still not pinned.
function straightRunEndNear(t, channels, n, j, W, params) {
  var e, k;
  // The jog between the sharp turn and the run's end is a fixed handful of source
  // vertices, independent of the smoothing distance -- so the search extends by a
  // vertex count as well as the distance-scaled window W. Without the vertex floor
  // the window shrinks with the distance and, at small distances, can no longer
  // reach back across the jog to the run end (fewer, not more, corners pinned as
  // the distance drops -- the opposite of what a long run warrants). We return the
  // first (nearest) run end found, so a generous reach only costs a few extra
  // straightRunLeaves checks when there is nothing to pin.
  for (e = j, k = 0; e >= 1; e--, k++) {
    if (t[j] - t[e] > W && k > MAX_JOG_VERTICES) break;
    if (straightRunLeaves(t, channels, n, e, -1, params) ||
        straightRunLeaves(t, channels, n, e, 1, params)) return e;
  }
  for (e = j + 1, k = 1; e < n - 1; e++, k++) {
    if (t[e] - t[j] > W && k > MAX_JOG_VERTICES) break;
    if (straightRunLeaves(t, channels, n, e, -1, params) ||
        straightRunLeaves(t, channels, n, e, 1, params)) return e;
  }
  return -1;
}

// Is the near side of @e (walking direction @dir: -1 = run precedes e, +1 = run
// follows e) a long straight run, AND does the far side leave that run's line --
// i.e. a point a full run-length along the far side sits outside the run's
// straightness corridor? A jog that rejoins the run returns to ~0 perpendicular
// offset and fails this, so it is not flagged. (This also implies @e is the run's
// end: if the run continued straight past @e, the far point would stay on its
// line.)
function straightRunLeaves(t, channels, n, e, dir, params) {
  var K = channels.length, L = t[n - 1];
  var nearEnd = reach(t, n, n, L, e, dir, params.minPinRunLen, false);
  if (nearEnd === e) return false;
  var a = dir < 0 ? nearEnd : e;
  var b = dir < 0 ? e : nearEnd;
  // Require the near run to be straight to the SAME angle-coupled tolerance
  // retention will demand of a pin at @e (retentionDevLimit of the turn at @e),
  // not the looser default corridor. This makes straightRunEndNear's backward
  // scan stop at the run's true end -- the last vertex actually on the run's line
  // -- rather than a vertex a little past it that squeaks inside the loose 3%
  // corridor but would then be culled by retention (leaving nothing pinned).
  var devLim = retentionDevLimit(cornerTurn(t, channels, n, e, false, params));
  if (!isStraightRun(t, channels, a, b, params, devLim)) return false;
  var farEnd = reach(t, n, n, L, e, -dir, params.minPinRunLen, false);
  if (farEnd === e) return false;
  var pe = getPt(channels, K, e);
  var u = subv(getPt(channels, K, nearEnd), pe, K); // direction along the near run
  var uu = dot(u, u, K);
  if (!(uu > 0)) return false;
  var af = subv(getPt(channels, K, farEnd), pe, K);
  var along = Math.abs(dot(af, u, K)) / Math.sqrt(uu);
  var perp = Math.sqrt(perpDistSq(channels, K, farEnd, pe, u, uu));
  // outside the straight corridor extended from the run -> the path has left it
  return perp > STRAIGHT_DEV_FACTOR * along;
}

// Is span [a, b] (inclusive vertex indices, a < b, open frame) a structural run:
// long relative to the tolerance and low-curvature throughout?
export function isStructuralRun(t, channels, a, b, params) {
  var len = t[b] - t[a];
  if (!(len >= params.minRunLen)) return false;
  var K = channels.length;
  var totalTurn = 0;
  for (var i = a + 1; i < b; i++) {
    totalTurn += vertexTurn(channels, K, i);
    if (totalTurn / len > params.maxTurnRate) return false;
  }
  return totalTurn / len <= params.maxTurnRate;
}

// Cyclic form of isStructuralRun for a closed ring: the span runs forward from
// ring vertex @a to ring vertex @b over the m = n-1 unique vertices, wrapping
// when b <= a (a == b means the whole ring). Length and turning are measured
// cyclically. Used to decide whether a detected ring corner borders a genuine
// straight/low-curvature run before it is pinned (see smoothArcCoords).
export function isStructuralRingSpan(t, channels, n, a, b, params) {
  var m = n - 1;
  if (m < 2) return false;
  var L = t[n - 1];
  var len = b > a ? t[b] - t[a] : (L - t[a]) + t[b];
  if (!(len >= params.minRunLen)) return false;
  var K = channels.length;
  var totalTurn = 0;
  var i = a;
  while (true) {
    i = (i + 1) % m;
    if (i === b) break;
    totalTurn += ringVertexTurn(channels, K, m, i);
    if (totalTurn / len > params.maxTurnRate) return false;
  }
  return totalTurn / len <= params.maxTurnRate;
}

// Is span [a, b] (inclusive vertex indices, a < b, open frame) "straight at the
// smoothing scale": clearly longer than the smoothing distance (>= minPinRunLen,
// see MIN_PIN_RUN_LEN_FACTOR) AND confined to a thin corridor around its endpoint
// chord (see STRAIGHT_DEV_FACTOR)? Used to decide whether a detected corner
// borders a straight run worth pinning. Unlike isStructuralRun -- which sums raw
// per-segment turning and is therefore defeated by sub-tolerance digitizing
// noise -- this measures perpendicular deviation from the chord, so a finely
// ragged but geometrically straight border still qualifies. The length floor is
// the pinning-specific minPinRunLen (not minRunLen): a run only ~1*tol long has
// too few interior points for the chord test to distinguish a true straight
// border from a coarsely sampled bend, so it must not anchor a corner. @devLimit
// overrides the corridor half-width (default STRAIGHT_DEV_FACTOR); retention
// passes a per-corner value tightened for gentle bends (see retentionDevLimit).
export function isStraightRun(t, channels, a, b, params, devLimit) {
  var lim = devLimit === undefined ? STRAIGHT_DEV_FACTOR : devLimit;
  var len = t[b] - t[a];
  if (!(len >= params.minPinRunLen)) return false;
  var K = channels.length;
  var A = getPt(channels, K, a);
  var AB = subv(getPt(channels, K, b), A, K);
  var abDot = dot(AB, AB, K);
  if (!(abDot > 0)) return false;
  var limit2 = lim * lim * abDot;
  for (var i = a + 1; i < b; i++) {
    if (perpDistSq(channels, K, i, A, AB, abDot) > limit2) return false;
  }
  return true;
}

// Cyclic form of isStraightRun for a closed ring: the span runs forward from ring
// vertex @a to ring vertex @b over the m = n-1 unique vertices, wrapping when
// b <= a. A whole-ring span (a == b, the single-corner case) has no meaningful
// chord, so it falls back to the turning-rate test (a large low-curvature ring
// keeps its one corner). Used by the closed-ring corner cull (see
// filterRingCornersByStructure in mapshaper-smooth-algos).
export function isStraightRingSpan(t, channels, n, a, b, params, devLimit) {
  var lim = devLimit === undefined ? STRAIGHT_DEV_FACTOR : devLimit;
  var m = n - 1;
  if (m < 2) return false;
  if (a === b) return isStructuralRingSpan(t, channels, n, a, b, params);
  var L = t[n - 1];
  var len = b > a ? t[b] - t[a] : (L - t[a]) + t[b];
  if (!(len >= params.minPinRunLen)) return false;
  var K = channels.length;
  var A = getPt(channels, K, a);
  var AB = subv(getPt(channels, K, b), A, K);
  var abDot = dot(AB, AB, K);
  if (!(abDot > 0)) return false;
  var limit2 = lim * lim * abDot;
  var i = a;
  while (true) {
    i = (i + 1) % m;
    if (i === b) break;
    if (perpDistSq(channels, K, i, A, AB, abDot) > limit2) return false;
  }
  return true;
}

// Straightness limit for pinning a corner whose windowed turn is @turnRad (see
// PIN_TURN_RATIO): min(STRAIGHT_DEV_FACTOR, turnRad / (8 * PIN_TURN_RATIO)).
function retentionDevLimit(turnRad) {
  var lim = turnRad / (8 * PIN_TURN_RATIO);
  return lim < STRAIGHT_DEV_FACTOR ? lim : STRAIGHT_DEV_FACTOR;
}

// Windowed turn (radians) at vertex @i, over params.tangentWindow each side --
// the same measure findInteriorCorners uses to flag the corner. @cyclic selects
// the open or ring frame.
export function cornerTurn(t, channels, n, i, cyclic, params) {
  var K = channels.length;
  var L = t[n - 1];
  var m = cyclic ? n - 1 : n;
  return windowedTurn(t, channels, K, n, L, m, i, params.tangentWindow, cyclic);
}

// Does the open span [a, b] justify pinning the corner at vertex @corner: is it a
// straight run (isStraightRun) whose straightness is enough for the corner's turn
// angle (retentionDevLimit)? A gentle bend needs a straighter run than a sharp
// one. Used by refineBounds.
export function bordersStraightRun(t, channels, n, corner, a, b, params) {
  var lim = retentionDevLimit(cornerTurn(t, channels, n, corner, false, params));
  return isStraightRun(t, channels, a, b, params, lim);
}

// Ring analogue of bordersStraightRun, for the closed-ring corner cull
// (filterRingCornersByStructure). @corner is a ring vertex; the span runs from
// ring vertex @a to @b (cyclic when b <= a).
export function bordersStraightRingSpan(t, channels, n, corner, a, b, params) {
  var lim = retentionDevLimit(cornerTurn(t, channels, n, corner, true, params));
  return isStraightRingSpan(t, channels, n, a, b, params, lim);
}

// --- internals ---

// Turn angle at vertex i between the incoming and outgoing directions, each
// estimated over an arc-length window W (so the measure is scale-aware and not
// dominated by a single short segment).
function windowedTurn(t, channels, K, n, L, m, i, W, cyclic) {
  var back = reach(t, n, m, L, i, -1, W, cyclic);
  var fwd = reach(t, n, m, L, i, 1, W, cyclic);
  var pi = getPt(channels, K, i);
  var pb = getPt(channels, K, back);
  var pf = getPt(channels, K, fwd);
  return angleBetween(subv(pi, pb, K), subv(pf, pi, K), K);
}

// Local turn at vertex i using just the adjacent segments.
function vertexTurn(channels, K, i) {
  var pi = getPt(channels, K, i);
  var pp = getPt(channels, K, i - 1);
  var pn = getPt(channels, K, i + 1);
  return angleBetween(subv(pi, pp, K), subv(pn, pi, K), K);
}

// Local turn at ring vertex i using cyclic neighbours over m unique vertices.
function ringVertexTurn(channels, K, m, i) {
  var pi = getPt(channels, K, i);
  var pp = getPt(channels, K, (i - 1 + m) % m);
  var pn = getPt(channels, K, (i + 1) % m);
  return angleBetween(subv(pi, pp, K), subv(pn, pi, K), K);
}

// Walk from vertex i in direction dir (+1/-1) until accumulated arc length
// reaches W (or a boundary, for open arcs), returning the reached vertex index.
// Segment lengths are read straight from the cumulative-length array t (t has
// n = m+1 entries with t[m] = L, so t[j+1]-t[j] is valid for every ring vertex
// j in 0..m-1, including the closing segment); this avoids allocating a per-ring
// segment-length array on every call (cornerTurn is hit ~twice per corner).
function reach(t, n, m, L, i, dir, W, cyclic) {
  var j = i, acc = 0;
  while (acc < W) {
    if (cyclic) {
      if (dir > 0) {
        acc += t[j + 1] - t[j];      // vertex j -> j+1 (t[m] == L handles the seam)
        j = j + 1 === m ? 0 : j + 1;
      } else {
        acc += j > 0 ? t[j] - t[j - 1] : L - t[m - 1]; // vertex j -> j-1
        j = (j - 1 + m) % m;
      }
      if (j === i) break; // wrapped the whole ring
    } else {
      var nk = j + dir;
      if (nk < 0 || nk > n - 1) break;
      acc += Math.abs(t[nk] - t[j]);
      j = nk;
    }
  }
  return j;
}

// Non-maximum suppression: is vertex j the sharpest turn within an arc-length
// window W (ties broken toward the lower index)? Only the vertices within W of j
// are examined -- walking outward from j in each direction and stopping once the
// arc-length gap reaches W -- rather than scanning the whole arc for every
// candidate, which was O(vertices^2) when many vertices are candidates (e.g. a
// large ring smoothed below its vertex spacing). Cumulative arc length is
// monotone, so the outward gap only grows and the early break is safe; a vertex
// within the cyclic window is reached going forward or backward (or both on a
// tiny ring, which is harmless for an all-or-nothing test).
function isLocalMaxTurn(t, turns, j, W, L, m, lo, hi, cyclic) {
  var k, d;
  if (cyclic) {
    for (k = (j + 1) % m; k !== j; k = (k + 1) % m) {
      d = t[k] - t[j];
      if (d < 0) d += L; // forward arc distance
      if (d >= W) break;
      if (turns[k] > turns[j] || (turns[k] === turns[j] && k < j)) return false;
    }
    for (k = (j - 1 + m) % m; k !== j; k = (k - 1 + m) % m) {
      d = t[j] - t[k];
      if (d < 0) d += L; // backward arc distance
      if (d >= W) break;
      if (turns[k] > turns[j] || (turns[k] === turns[j] && k < j)) return false;
    }
    return true;
  }
  for (k = j + 1; k < hi; k++) {
    if (t[k] - t[j] >= W) break;
    if (turns[k] > turns[j] || (turns[k] === turns[j] && k < j)) return false;
  }
  for (k = j - 1; k >= lo; k--) {
    if (t[j] - t[k] >= W) break;
    if (turns[k] > turns[j] || (turns[k] === turns[j] && k < j)) return false;
  }
  return true;
}

function getPt(channels, K, i) {
  var p = new Array(K);
  for (var c = 0; c < K; c++) p[c] = channels[c][i];
  return p;
}

function subv(a, b, K) {
  var o = new Array(K);
  for (var c = 0; c < K; c++) o[c] = a[c] - b[c];
  return o;
}

function dot(a, b, K) {
  var d = 0;
  for (var c = 0; c < K; c++) d += a[c] * b[c];
  return d;
}

// Squared perpendicular distance of vertex @i from the line through point @A
// with direction @AB (abDot = AB.AB). = |AP|^2 - (AP.AB)^2 / |AB|^2.
function perpDistSq(channels, K, i, A, AB, abDot) {
  var apAp = 0, apAb = 0, d;
  for (var c = 0; c < K; c++) {
    d = channels[c][i] - A[c];
    apAp += d * d;
    apAb += d * AB[c];
  }
  var perp = apAp - apAb * apAb / abDot;
  return perp > 0 ? perp : 0;
}

function angleBetween(u, v, K) {
  var d = 0, nu = 0, nv = 0;
  for (var c = 0; c < K; c++) {
    d += u[c] * v[c];
    nu += u[c] * u[c];
    nv += v[c] * v[c];
  }
  var den = Math.sqrt(nu * nv);
  if (!(den > 0)) return 0;
  var x = d / den;
  if (x > 1) x = 1;
  else if (x < -1) x = -1;
  return Math.acos(x);
}
