// Removes small self-overlap "fold-back" loops from a constructed two-sided
// buffer outline ring before it is handed to the dissolve.
//
// When a line is buffered by a radius larger than the local radius of curvature
// of the path, the offset on the concave side of a shallow undulation crosses
// itself, leaving a small loop. These loops are pure self-overlap: the region
// they enclose is already inside the buffer, so the dissolve fills them and the
// final boundary runs straight through the crossing point. Collapsing each loop
// to its crossing point up front removes segments and self-intersections the
// dissolve would otherwise have to process, with no change to the dissolved
// area beyond the buffer's own error tolerance.
//
// The hard part is telling an artifact loop apart from a real buffer hole: both
// appear as a self-crossing whose enclosed pocket winds opposite to the outer
// boundary, so orientation cannot distinguish them, and neither can the segment
// gap (a coarse self-crossing line can form a hole spanning few segments). The
// reliable signal is on the *source path*: a hole requires the path to wind far
// enough to enclose an uncovered region (large cumulative turn), whereas a
// shallow concavity that merely overshoots its own offset spans a small turn.
// So a crossing is collapsed only when the source span between the two crossing
// offsets turns by less than `maxTurn` degrees.

// Look-ahead window: how many ring segments ahead to test for a crossing. The
// turn gate (not the window) is the safety criterion, so this only bounds cost
// (O(n * window)); it must still be wide enough to reach the far side of an
// overshoot loop, which can include many round-join vertices at large radii.
export var BUFFER_LOOP_WINDOW = 30;

// Max source-path turn (degrees) a collapsible loop may span. Below this the
// path is too straight to have enclosed an uncovered region, so the crossing is
// a covered overshoot; above it the loop may be a real buffer hole and is left
// for the dissolve. Empirically, shallow-concavity artifacts span well under
// 150 degrees while the tightest observed real hole spans ~210, so this sits in
// the gap with margin on both sides. A fully enclosing loop turns ~360.
export var BUFFER_LOOP_MAX_TURN = 150;

// ring: closed ring (first point repeated as last) of [x, y] points.
// srcPos (optional): source-vertex position parallel to ring; NaN for points
//   (caps) with no single source segment.
// turnPrefix (optional): cumulative absolute source turn indexed by vertex.
// When srcPos+turnPrefix are supplied the source-turn gate is applied; without
// them every inward pocket within the window is collapsed (used in unit tests).
export function removeBufferRingLoops(ring, maxGap, srcPos, turnPrefix, maxTurn) {
  if (!ring || ring.length < 6) return ring;
  if (!(maxGap >= 2)) maxGap = BUFFER_LOOP_WINDOW;
  if (maxTurn === undefined) maxTurn = BUFFER_LOOP_MAX_TURN;
  var gated = !!(srcPos && turnPrefix);
  var outerSign = ringOuterSign(ring);
  var pts = ring.slice(0, ring.length - 1); // drop closing duplicate
  var pos = gated ? srcPos.slice(0, ring.length - 1) : null;
  var i = 0;
  while (i < pts.length - 1) {
    var ax = pts[i][0], ay = pts[i][1];
    var bx = pts[i + 1][0], by = pts[i + 1][1];
    var maxJ = Math.min(i + maxGap, pts.length - 2);
    var removed = false;
    for (var j = i + 2; j <= maxJ; j++) {
      var hit = segHit(ax, ay, bx, by,
        pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1]);
      if (!hit) continue;
      // only collapse a re-entrant pocket (winds opposite the outer boundary)
      if (loopSign(hit, pts, i + 1, j) !== -outerSign) continue;
      if (gated && !spanIsCovered(pos, i, j, turnPrefix, maxTurn)) continue;
      pts.splice(i + 1, j - i, hit); // replace span i+1..j with the crossing
      if (gated) pos.splice(i + 1, j - i, pos[i]);
      removed = true;
      break;
    }
    if (!removed) i++; // else re-scan from i: the new seg i may cross again
  }
  if (pts.length < 4) return ring; // collapsed away; keep original
  pts.push(pts[0].concat());
  return pts;
}

// True when the source-path span feeding ring points i..j+1 turns by less than
// maxTurn (a covered overshoot, safe to collapse). A pocket touching a cap
// (NaN position) is never treated as a covered overshoot.
function spanIsCovered(pos, i, j, turnPrefix, maxTurn) {
  var lo = Infinity, hi = -Infinity;
  for (var k = i; k <= j + 1; k++) {
    var p = pos[k];
    if (p !== p) return false; // NaN
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  return (turnPrefix[hi] - turnPrefix[lo]) < maxTurn;
}

// Outer-boundary orientation, robust to self-overlap elsewhere: the lowest
// (then leftmost) original vertex is always on the outer hull, so the turn
// there reflects the true winding. +1 = CCW, -1 = CW.
function ringOuterSign(ring) {
  var n = ring.length - 1;
  var k = 0;
  for (var i = 1; i < n; i++) {
    if (ring[i][1] < ring[k][1] ||
        (ring[i][1] === ring[k][1] && ring[i][0] < ring[k][0])) {
      k = i;
    }
  }
  var prev = ring[(k - 1 + n) % n], cur = ring[k], next = ring[(k + 1) % n];
  var cross = (cur[0] - prev[0]) * (next[1] - cur[1]) -
    (cur[1] - prev[1]) * (next[0] - cur[0]);
  return cross < 0 ? -1 : 1;
}

// Signed area sign of the pocket polygon [hit, pts[lo..hi]] (closed back to
// hit). +1 = CCW, -1 = CW.
function loopSign(hit, pts, lo, hi) {
  var a = hit[0] * pts[lo][1] - pts[lo][0] * hit[1];
  for (var i = lo; i < hi; i++) {
    a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  }
  a += pts[hi][0] * hit[1] - hit[0] * pts[hi][1];
  return a >= 0 ? 1 : -1;
}

// Fast strict-interior segment crossing; returns [x, y] or null. Buffer join
// vertices are approximation geometry, so the float test is adequate here (a
// robust BigInt confirmation was measured to change nothing, since any residual
// imprecision is resolved by the dissolve downstream).
function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
  if (ax < cx && ax < dx && bx < cx && bx < dx ||
      ax > cx && ax > dx && bx > cx && bx > dx ||
      ay < cy && ay < dy && by < cy && by < dy ||
      ay > cy && ay > dy && by > cy && by > dy) return null;
  var abx = bx - ax, aby = by - ay, cdx = dx - cx, cdy = dy - cy;
  var den = abx * cdy - aby * cdx;
  if (den === 0) return null;
  var acx = cx - ax, acy = cy - ay;
  var t = (acx * cdy - acy * cdx) / den;
  var u = (acx * aby - acy * abx) / den;
  if (t <= 1e-9 || t >= 1 - 1e-9 || u <= 1e-9 || u >= 1 - 1e-9) return null;
  return [ax + t * abx, ay + t * aby];
}
