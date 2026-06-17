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
  var n = ring.length - 1; // distinct points (the last repeats the first)
  // Compact retained points into `out` instead of splicing collapsed spans out
  // of one array: every splice shifts the whole tail (O(tail) per collapse,
  // O(n^2) over the ring), whereas the scan only ever commits a growing prefix
  // and looks a bounded window forward, so it can append kept points and drop a
  // collapsed span by advancing the read cursor -- O(1) per collapse.
  //
  // `a` is the current anchor (the last committed point, out[last]); `b` is the
  // point after it (a ring vertex, or a synthetic crossing after a collapse);
  // `r` indexes the ring vertex following `b`. This mirrors the in-place scan's
  // anchor i with a = ring[i], b = ring[i+1], r = i+2.
  var out = [ring[0]];
  var outPos = gated ? [srcPos[0]] : null;
  var b = ring[1];
  var bpos = gated ? srcPos[1] : 0;
  var r = 2;
  while (true) {
    var a = out[out.length - 1];
    var ax = a[0], ay = a[1], bx = b[0], by = b[1];
    var apos = gated ? outPos[outPos.length - 1] : 0;
    // forward segment t maps to the in-place scan's j = (anchor index) + 2 + t
    var maxT = Math.min(maxGap - 2, n - 2 - r);
    var collapsed = false;
    for (var t = 0; t <= maxT; t++) {
      var c = ring[r + t], d = ring[r + t + 1];
      var hit = segHit(ax, ay, bx, by, c[0], c[1], d[0], d[1]);
      if (!hit) continue;
      // Collapse only covered overshoots (small source turn). A larger source
      // turn means the span may enclose a real buffer hole, which must be left
      // for the dissolve -- whatever the pocket's winding orientation.
      if (gated &&
        !spanIsCovered(apos, bpos, srcPos, r, r + t + 1, turnPrefix, maxTurn)) {
        continue;
      }
      // Replace the span a..ring[r+t] with the crossing: the anchor stays and is
      // re-scanned (its new segment may cross again), so keep `a`, set b = hit,
      // and advance the cursor past the collapsed vertices.
      b = hit;
      if (gated) bpos = apos; // collapsed point inherits the anchor's source pos
      r = r + t + 1;
      collapsed = true;
      break;
    }
    if (collapsed) continue;
    out.push(b); // the anchor's successor can no longer collapse; commit it
    if (gated) outPos.push(bpos);
    if (r > n - 1) break; // no ring vertex left to become the next b
    b = ring[r];
    if (gated) bpos = srcPos[r];
    r++;
  }
  if (out.length < 4) return ring; // collapsed away; keep original
  out.push(out[0].concat());
  return out;
}

// True when the source-path span feeding a collapsed pocket turns by less than
// maxTurn (a covered overshoot, safe to collapse). The span covers the anchor
// position `apos`, its successor `bpos`, and ring positions srcPos[lo..hi]. A
// pocket touching a cap (NaN position) is never treated as a covered overshoot.
function spanIsCovered(apos, bpos, srcPos, lo, hi, turnPrefix, maxTurn) {
  if (apos !== apos || bpos !== bpos) return false; // NaN cap
  var posLo = apos < bpos ? apos : bpos;
  var posHi = apos > bpos ? apos : bpos;
  for (var k = lo; k <= hi; k++) {
    var p = srcPos[k];
    if (p !== p) return false; // NaN
    if (p < posLo) posLo = p;
    if (p > posHi) posHi = p;
  }
  return (turnPrefix[posHi] - turnPrefix[posLo]) < maxTurn;
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
