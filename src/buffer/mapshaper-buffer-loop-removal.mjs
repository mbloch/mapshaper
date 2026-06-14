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
// The hard part is telling a pure self-overlap (safe to collapse) from a
// genuine buffer hole (a winding-0 pocket the dissolve must keep open). Pocket
// orientation looks tempting but is NOT a reliable signal: a real hole can wind
// either with or against the outer boundary depending on how the outline
// threads through the crossing, and overlaps occur in both orientations too.
// The segment gap is no help either -- a coarse self-crossing line can form a
// real hole spanning only a handful of segments.
//
// The reliable signal is on the *source path*. A hole exists only where the
// path winds far enough to enclose a region the offset cannot cover (a large
// cumulative turn between the two crossing offsets); a mere overshoot of a
// shallow concavity spans a small turn. So a crossing is collapsed only when
// the source span feeding it turns by less than `maxTurn` degrees, regardless
// of pocket orientation; otherwise it is left for the dissolve.

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
// When srcPos+turnPrefix are supplied the source-turn gate is applied to every
// pocket; without them every self-crossing pocket within the window is
// collapsed (used in unit tests).
export function removeBufferRingLoops(ring, maxGap, srcPos, turnPrefix, maxTurn) {
  if (!ring || ring.length < 6) return ring;
  if (!(maxGap >= 2)) maxGap = BUFFER_LOOP_WINDOW;
  if (maxTurn === undefined) maxTurn = BUFFER_LOOP_MAX_TURN;
  var gated = !!(srcPos && turnPrefix);
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
      // Collapse only covered overshoots (small source turn). A larger source
      // turn means the span may enclose a real buffer hole, which must be left
      // for the dissolve -- whatever the pocket's winding orientation.
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
