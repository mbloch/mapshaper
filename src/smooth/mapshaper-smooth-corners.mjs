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
var MIN_RUN_RADIUS_FACTOR = 1.0;       // and bend no tighter than radius tol * this

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
