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
// for the dissolve.
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
  // of one array. A collapse drops a span by advancing `nextRingIndex`, so the
  // ring tail is never shifted.
  var out = [ring[0]];
  var outPos = gated ? [srcPos[0]] : null;
  var segmentEnd = ring[1];
  var segmentEndPos = gated ? srcPos[1] : 0;
  var nextRingIndex = 2; // first ring vertex after segmentEnd

  while (true) {
    var anchor = out[out.length - 1];
    var anchorPos = gated ? outPos[outPos.length - 1] : 0;
    var ax = anchor[0], ay = anchor[1];
    var bx = segmentEnd[0], by = segmentEnd[1];
    var lastScanIndex = Math.min(nextRingIndex + maxGap - 2, n - 2);
    var crossing = null;
    var crossingEndIndex = 0;

    for (var scanIndex = nextRingIndex; scanIndex <= lastScanIndex; scanIndex++) {
      var c = ring[scanIndex], d = ring[scanIndex + 1];
      var hit = segHit(ax, ay, bx, by, c[0], c[1], d[0], d[1]);
      if (!hit) continue;
      // Collapse only covered overshoots (small source turn). A larger source
      // turn means the span may enclose a real buffer hole, which must be left
      // for the dissolve -- whatever the pocket's winding orientation.
      var spanTurn = gated ? getSpanTurn(anchorPos, segmentEndPos, srcPos,
        nextRingIndex, scanIndex + 1, turnPrefix) : null;
      if (gated && spanTurn >= maxTurn) {
        continue;
      }
      crossing = hit;
      crossingEndIndex = scanIndex + 1;
      break;
    }

    if (crossing) {
      // Replace the collapsed span with the crossing. Keep the same anchor and
      // rescan because the new segment may cross another nearby segment.
      segmentEnd = crossing;
      if (gated) segmentEndPos = anchorPos;
      nextRingIndex = crossingEndIndex;
      continue;
    }

    out.push(segmentEnd); // safe: anchor -> segmentEnd found no collapsible loop
    if (gated) outPos.push(segmentEndPos);
    if (nextRingIndex > n - 1) break; // no vertex left to become segmentEnd
    segmentEnd = ring[nextRingIndex];
    if (gated) segmentEndPos = srcPos[nextRingIndex];
    nextRingIndex++;
  }
  if (out.length < 4) return ring; // collapsed away; keep original
  out.push(out[0].concat());
  return out;
}

// Signed area (x2) of the sub-loop X -> segmentEnd -> ring[lo..hi] -> X.
function loopAreaSign(xx, xy, segEndX, segEndY, ring, lo, hi) {
  var s = (xx * segEndY - segEndX * xy);
  var px = segEndX, py = segEndY;
  for (var k = lo; k <= hi; k++) {
    var q = ring[k];
    s += px * q[1] - q[0] * py;
    px = q[0]; py = q[1];
  }
  s += px * xy - xx * py;
  return s; // >0 CCW, <0 CW
}
function ringSignedArea(ring) {
  var s = 0;
  for (var i = 0; i < ring.length - 1; i++) {
    s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return s;
}

// Collapse self-overlap loops using the crossing-direction signal instead of the
// source-turn gate (removeBufferRingLoops). Where a constructed offset ring has a
// consistent +/-1 base winding -- the two-sided outline of an OPEN path -- the
// winding sense of each minimal self-crossing loop classifies it exactly: a
// sub-loop wound the SAME way as its parent ring is a covered fold-back overlap
// (collapse it; the dissolve would only fill it), while a sub-loop wound the
// OPPOSITE way bounds a winding-0 pocket the dissolve must keep as a hole.
//
// This is more precise than the turn-gate's source-turn heuristic and needs no
// source-path provenance (srcPos/turnPrefix), only the ring geometry. It does
// NOT apply to the winding-fill construction used for closed rings / polygons,
// where the base winding is not a constant +/-1, so a local loop's winding sense
// does not determine the absolute (hole vs covered) winding of its interior.
//
// Pass 1 marks every vertex inside an opposite-wound (hole) loop so the collapse
// pass never eats a hole, including an overlap loop that happens to wrap one.
export function removeBufferRingLoopsByDirection(ring, maxGap) {
  if (!ring || ring.length < 6) return ring;
  if (!(maxGap >= 2)) maxGap = BUFFER_LOOP_WINDOW;
  var n = ring.length - 1;
  var parentCCW = (ringSignedArea(ring) >= 0);
  // Pass 1: a sub-loop wound OPPOSITE to its parent ring encloses a winding-0
  // hole the dissolve must keep; mark its vertices so the collapse pass never
  // eats it (covers an overlap loop that happens to wrap a hole).
  var holeVertex = new Uint8Array(n);
  for (var i = 0; i < n - 1; i++) {
    var a = ring[i], b = ring[i + 1];
    var jMax = Math.min(i + maxGap, n - 1);
    for (var j = i + 2; j <= jMax; j++) {
      if (i === 0 && j === n - 1) continue;
      var c = ring[j], d = ring[j + 1];
      var hit = segHit(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
      if (!hit) continue;
      var loopCCW = loopAreaSign(hit[0], hit[1], b[0], b[1], ring, i + 2, j) >= 0;
      if (loopCCW !== parentCCW) {
        for (var k = i + 1; k <= j; k++) holeVertex[k] = 1;
      }
    }
  }
  // Pass 2: collapse sub-loops wound the SAME way as the parent (covered
  // fold-back overlaps) unless they would eat a hole vertex.
  var out = [ring[0]];
  var segmentEnd = ring[1];
  var nextRingIndex = 2;
  while (true) {
    var anchor = out[out.length - 1];
    var ax = anchor[0], ay = anchor[1], bx = segmentEnd[0], by = segmentEnd[1];
    var lastScanIndex = Math.min(nextRingIndex + maxGap - 2, n - 2);
    var crossing = null, crossingEndIndex = 0;
    for (var s = nextRingIndex; s <= lastScanIndex; s++) {
      var cc = ring[s], dd = ring[s + 1];
      var hit2 = segHit(ax, ay, bx, by, cc[0], cc[1], dd[0], dd[1]);
      if (!hit2) continue;
      var ovCCW = loopAreaSign(hit2[0], hit2[1], bx, by, ring, nextRingIndex, s) >= 0;
      if (ovCCW !== parentCCW) continue; // opposite-wound loop is a hole: keep
      var wrapsHole = false;
      for (var k2 = nextRingIndex; k2 <= s; k2++) {
        if (holeVertex[k2]) { wrapsHole = true; break; }
      }
      if (wrapsHole) continue;
      crossing = hit2;
      crossingEndIndex = s + 1;
      break;
    }
    if (crossing) {
      segmentEnd = crossing;
      nextRingIndex = crossingEndIndex;
      continue;
    }
    out.push(segmentEnd);
    if (nextRingIndex > n - 1) break;
    segmentEnd = ring[nextRingIndex];
    nextRingIndex++;
  }
  if (out.length < 4) return ring;
  out.push(out[0].concat());
  return out;
}

// Absolute source turn spanned by a crossing candidate. The span covers the
// anchor position `apos`, its successor `bpos`, and ring positions srcPos[lo..hi].
// A pocket touching a cap (NaN position) is never treated as a covered overshoot.
function getSpanTurn(apos, bpos, srcPos, lo, hi, turnPrefix) {
  if (apos !== apos || bpos !== bpos) return Infinity; // NaN cap
  var posLo = apos < bpos ? apos : bpos;
  var posHi = apos > bpos ? apos : bpos;
  for (var k = lo; k <= hi; k++) {
    var p = srcPos[k];
    if (p !== p) return Infinity; // NaN
    if (p < posLo) posLo = p;
    if (p > posHi) posHi = p;
  }
  return turnPrefix[posHi] - turnPrefix[posLo];
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
