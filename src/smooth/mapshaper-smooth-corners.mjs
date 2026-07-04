// Structural-corner detection for -smooth's corner preservation (on by default;
// disabled with no-corners or corner-bias=0).
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
// culled.
var STRAIGHT_DEV_FACTOR = 0.03;

// @cornerBias (optional, default 1) divides the min structural-run length, so a
// value < 1 lengthens the run a corner must border to be preserved (fewer, only
// well-supported corners), and a value > 1 shortens it (more corners kept).
export function getCornerParams(tol, cornerBias) {
  var bias = cornerBias > 0 ? cornerBias : 1;
  return {
    tol: tol,
    cornerAngle: CORNER_ANGLE,
    tangentWindow: TANGENT_WINDOW_FACTOR * tol,
    innerWindow: INNER_WINDOW_FACTOR * TANGENT_WINDOW_FACTOR * tol,
    concentration: CORNER_CONCENTRATION,
    minRunLen: MIN_RUN_LEN_FACTOR * tol / bias,
    maxTurnRate: 1 / (MIN_RUN_RADIUS_FACTOR * tol) // radians of turning per ground unit
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
  var segLen = cyclic ? ringSegLengths(t, m) : null;
  var W = params.tangentWindow;
  var Wi = params.innerWindow;
  var turns = new Float64Array(m);
  var inner = new Float64Array(m);
  var lo = cyclic ? 0 : 1;
  var hi = cyclic ? m : n - 1; // exclusive
  for (var i = lo; i < hi; i++) {
    turns[i] = windowedTurn(t, channels, K, n, L, m, segLen, i, W, cyclic);
    inner[i] = windowedTurn(t, channels, K, n, L, m, segLen, i, Wi, cyclic);
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
  return corners;
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
// smoothing scale": long enough AND confined to a thin corridor around its
// endpoint chord (see STRAIGHT_DEV_FACTOR)? Used to decide whether a detected
// corner borders a straight run worth pinning. Unlike isStructuralRun -- which
// sums raw per-segment turning and is therefore defeated by sub-tolerance
// digitizing noise -- this measures perpendicular deviation from the chord, so a
// finely ragged but geometrically straight border still qualifies.
export function isStraightRun(t, channels, a, b, params) {
  var len = t[b] - t[a];
  if (!(len >= params.minRunLen)) return false;
  var K = channels.length;
  var A = getPt(channels, K, a);
  var AB = subv(getPt(channels, K, b), A, K);
  var abDot = dot(AB, AB, K);
  if (!(abDot > 0)) return false;
  var limit2 = STRAIGHT_DEV_FACTOR * STRAIGHT_DEV_FACTOR * abDot;
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
export function isStraightRingSpan(t, channels, n, a, b, params) {
  var m = n - 1;
  if (m < 2) return false;
  if (a === b) return isStructuralRingSpan(t, channels, n, a, b, params);
  var L = t[n - 1];
  var len = b > a ? t[b] - t[a] : (L - t[a]) + t[b];
  if (!(len >= params.minRunLen)) return false;
  var K = channels.length;
  var A = getPt(channels, K, a);
  var AB = subv(getPt(channels, K, b), A, K);
  var abDot = dot(AB, AB, K);
  if (!(abDot > 0)) return false;
  var limit2 = STRAIGHT_DEV_FACTOR * STRAIGHT_DEV_FACTOR * abDot;
  var i = a;
  while (true) {
    i = (i + 1) % m;
    if (i === b) break;
    if (perpDistSq(channels, K, i, A, AB, abDot) > limit2) return false;
  }
  return true;
}

// --- internals ---

function ringSegLengths(t, m) {
  var segLen = new Float64Array(m);
  for (var i = 0; i < m; i++) segLen[i] = t[i + 1] - t[i];
  return segLen;
}

// Turn angle at vertex i between the incoming and outgoing directions, each
// estimated over an arc-length window W (so the measure is scale-aware and not
// dominated by a single short segment).
function windowedTurn(t, channels, K, n, L, m, segLen, i, W, cyclic) {
  var back = reach(t, segLen, n, m, L, i, -1, W, cyclic);
  var fwd = reach(t, segLen, n, m, L, i, 1, W, cyclic);
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
function reach(t, segLen, n, m, L, i, dir, W, cyclic) {
  var j = i, acc = 0;
  while (acc < W) {
    if (cyclic) {
      var k = dir > 0 ? (j + 1) % m : (j - 1 + m) % m;
      acc += dir > 0 ? segLen[j] : segLen[k];
      j = k;
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

function isLocalMaxTurn(t, turns, j, W, L, m, lo, hi, cyclic) {
  for (var k = lo; k < hi; k++) {
    if (k === j) continue;
    var d = Math.abs(t[k] - t[j]);
    if (cyclic && d > L - d) d = L - d;
    if (d < W && (turns[k] > turns[j] || (turns[k] === turns[j] && k < j))) {
      return false;
    }
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
