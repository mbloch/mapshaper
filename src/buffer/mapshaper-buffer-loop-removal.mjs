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
// turn gate (not the window) is the safety criterion in removeBufferRingLoops;
// in the dip+coverage iterative path it only bounds cost (O(n * window)).
export var BUFFER_LOOP_WINDOW = 30;

// Max source-path turn (degrees) a collapsible loop may span. Below this the
// path is too straight to have enclosed an uncovered region, so the crossing is
// a covered overshoot; above it the loop may be a real buffer hole and is left
// for the dissolve.
export var BUFFER_LOOP_MAX_TURN = 150;

// Dip-tag iterative remover: a candidate collapse is allowed only if the region
// it drops stays covered by the rest of the outline (collapseKeepsAreaCovered).
// That per-collapse winding sweep is O(spanLen * ringLen), so it is skipped when
// the dropped loop's own area is below this threshold -- such a loop cannot
// create a clip larger than the threshold, so nothing "big" is missed. In ring
// units (m^2 for planar; web-Mercator m^2 for lat/lng, whose scale factor >= 1
// keeps this an upper bound on the real area, so latitude never hides a big clip).
export var BUFFER_LOOP_CHECK_MIN_AREA = 3e4;

// Hole-fill guard (dip+coverage path). A collapse is also refused if it would
// swallow a winding-0 region (a real buffer hole or an open outer-wall notch)
// larger than this fraction of the buffer disk (pi*dist^2, passed as fillFloor =
// dist^2 * this). A genuine hole is a fixed fraction of the disk (the line wound
// far enough to leave a region the radius can't reach), while a self-overlap fold
// only pinches off a sliver orders of magnitude smaller relative to the radius --
// so a disk-relative floor separates them with a wide margin where an absolute
// area threshold does not (a 10km fold sliver and a 650m real hole have similar
// absolute areas). Leans low (toward preserving holes): a false veto only leaves
// a self-overlap for the dissolve, while a false pass deletes a real hole.
export var BUFFER_LOOP_FILL_AREA_FRAC = 5e-4;

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

// Multi-pass collapse. Iterating lets the collapse of tight inner overshoot
// loops shorten the spans of the loops that wrap them, so a wrapper whose span
// was too long (or too-large-turn, on the gated paths) on one pass can become
// collapsible on the next -- the multi-pass "peel simple interior loops first"
// idea. With dipTags supplied (clean-outline rings; the tags act as a flag,
// see below) each candidate is decided by the exact coverage check plus the
// opposite-wound hole guard; otherwise the source-turn or geometric turn gate
// applies (maxTurn; caps' 180-degree arcs exceed it and are never collapsed).
// @fillFloor (coverage path): max winding-0 area a collapse may swallow; a
// collapse filling a larger hole/notch is refused (see BUFFER_LOOP_FILL_AREA_FRAC).
// Callers pass dist^2 * BUFFER_LOOP_FILL_AREA_FRAC; defaults to the uncovered
// floor when omitted (unit tests without a buffer distance).
export function removeBufferRingLoopsIterative(ring, maxGap, srcPos, turnPrefix, maxTurn, dipTags, maxPasses, fillFloor) {
  if (!ring || ring.length < 6) return ring;
  if (!(maxGap >= 2)) maxGap = BUFFER_LOOP_WINDOW;
  if (maxTurn === undefined) maxTurn = BUFFER_LOOP_MAX_TURN;
  if (!(maxPasses >= 1)) maxPasses = 12;
  if (!(fillFloor >= 0)) fillFloor = BUFFER_LOOP_CHECK_MIN_AREA;
  var gated = !!(srcPos && turnPrefix);
  // dipTags acts purely as a flag here: a ring built by the clean-outline
  // construction opts into the coverage-checked path. The per-vertex tag
  // values are not consulted (the tag-excluded turn gate was removed in favor
  // of the exact coverage check), so the tags are not threaded through passes.
  var coverage = !gated && !!dipTags;
  // Neighborhood clip budget, shared by all passes over this ring: each
  // accepted collapse's uncovered (clipped) area accumulates in a coarse
  // grid, and an accept that would push any touched cell past the per-collapse
  // floor is refused instead. Individually sub-floor clips are the design's
  // tolerance, but several of them can land in the SAME neighborhood (dense
  // fold clusters -- routine with coarse bridge geometry, theoretically
  // possible with overlapping same-pass collapses) and compound into a
  // floor-scale dent; the budget bounds the damage per neighborhood to the
  // same floor that bounds it per collapse.
  // Cell size scales with the buffer radius (recovered from the disk-relative
  // fillFloor) so a neighborhood is radius-scale at any latitude/units; clip
  // attribution is O(1) per accept (center cell), so a dent straddling a cell
  // edge is bounded by 2x the floor rather than 1x.
  var budgetCell = Math.max(1000, Math.sqrt(fillFloor / BUFFER_LOOP_FILL_AREA_FRAC));
  var clipBudget = coverage ? {map: new Map(), cell: budgetCell} : null;
  var work = ring, workPos = gated ? srcPos : null;
  for (var pass = 0; pass < maxPasses; pass++) {
    var res = collapseRingLoopsPass(work, maxGap, workPos, turnPrefix, maxTurn,
      coverage, fillFloor, clipBudget);
    if (res.ring.length === work.length) return res.ring; // stable
    work = res.ring; workPos = res.srcPos;
  }
  return work;
}

// One greedy forward-collapse pass (mirrors removeBufferRingLoops' compaction).
// The span gate is, in order of preference:
//   - the reliable source-path turn (getSpanTurn) when srcPos+turnPrefix given;
//   - else the exact coverage check when `coverage` is set (clean-outline rings);
//   - else the ring's cumulative turn with a geometric cusp threshold.
// Returns {ring, srcPos} so the caller can iterate.
function collapseRingLoopsPass(ring, maxGap, srcPos, turnPrefix, maxTurn, coverage, fillFloor, clipBudget) {
  var gated = !!(srcPos && turnPrefix);
  var n = ring.length - 1;
  // The coverage path defers entirely to the exact coverage check, so it needs
  // neither a turn gate nor a cumulative-turn prefix; the other two paths
  // (source-turn, geometric) have no coverage check and keep the turn gate.
  var ringTurn = (!gated && !coverage) ? ringAbsTurnPrefix(ring) : null;
  // The y-band edge index and the parent orientation are built lazily, on the
  // first candidate that survives to the coverage check: most rings (and most
  // passes) never get that far, and both are O(ring length) to compute.
  var covIndex = null;
  var parentCCW = false, parentKnown = false;
  var out = [ring[0]];
  var outPos = gated ? [srcPos[0]] : null;
  var segmentEnd = ring[1];
  var segmentEndPos = gated ? srcPos[1] : 0;
  var nextRingIndex = 2;
  while (true) {
    var anchor = out[out.length - 1];
    var anchorPos = gated ? outPos[outPos.length - 1] : 0;
    var ax = anchor[0], ay = anchor[1], bx = segmentEnd[0], by = segmentEnd[1];
    var lastScanIndex = Math.min(nextRingIndex + maxGap - 2, n - 2);
    var crossing = null, crossingEndIndex = 0;
    for (var s = nextRingIndex; s <= lastScanIndex; s++) {
      var c = ring[s], d = ring[s + 1];
      var hit = segHit(ax, ay, bx, by, c[0], c[1], d[0], d[1]);
      if (!hit) continue;
      if (coverage) {
        // Opposite-wound hole protection. The coverage check only guards against
        // UNCOVERING area, so it cannot catch a collapse that FILLS a real
        // winding-0 hole (filling adds coverage), and its area pre-filter treats
        // any sub-floor loop as safe to drop. A dropped sub-loop wound OPPOSITE
        // to the parent ring bounds such a hole, so refuse the collapse outright
        // -- this keeps real holes (annulus interiors, self-crossing-line
        // pockets) the coverage check alone misses, at the cost of only an
        // O(span) signed-area test on the crossings the collapse actually
        // evaluates. A same-wound overshoot fold that happens to WRAP a hole is
        // caught instead by the fill guard in the coverage check.
        if (!parentKnown) {
          parentCCW = ringSignedArea(ring) >= 0;
          parentKnown = true;
        }
        if ((loopAreaSign(hit[0], hit[1], bx, by, ring, nextRingIndex, s) >= 0) !== parentCCW) {
          continue;
        }
        // No turn gate on the coverage path: the exact coverage check is the
        // arbiter. It measures how much of the dropped region would become
        // uncovered and refuses collapses that would clip a significant lobe
        // (see docs/development/buffer-line-notes.md), catching real lobes and
        // end caps that a cheap turn/area/winding signal cannot separate from
        // safe folds. The turn gate was both leaving valid interior loops
        // uncollapsed (tight hairpins whose source turn exceeds the cap) and
        // slowing the pipeline by deferring their removal to the dissolve.
        if (!covIndex) covIndex = buildEdgeYIndex(ring, n);
        if (!collapseKeepsAreaCovered(ring, n, hit, segmentEnd, nextRingIndex, s, covIndex, fillFloor, clipBudget)) {
          continue; // dropping this loop would uncover or fill real area -- leave it
        }
      } else {
        // Source-turn / geometric paths: no coverage check, so gate on cumulative
        // turn (caps and large real bends exceed maxTurn and are never collapsed).
        var spanTurn = gated ?
          getSpanTurn(anchorPos, segmentEndPos, srcPos, nextRingIndex, s + 1, turnPrefix) :
          (ringTurn[s] - ringTurn[nextRingIndex - 1]);
        if (spanTurn >= maxTurn) continue;
      }
      crossing = hit;
      crossingEndIndex = s + 1;
      break;
    }
    if (crossing) {
      segmentEnd = crossing;
      if (gated) segmentEndPos = anchorPos;
      nextRingIndex = crossingEndIndex;
      continue;
    }
    out.push(segmentEnd);
    if (gated) outPos.push(segmentEndPos);
    if (nextRingIndex > n - 1) break;
    segmentEnd = ring[nextRingIndex];
    if (gated) segmentEndPos = srcPos[nextRingIndex];
    nextRingIndex++;
  }
  if (out.length < 4) return {ring: ring, srcPos: srcPos}; // collapsed away; keep original
  out.push(out[0].concat());
  if (gated) outPos.push(outPos[0]);
  return {ring: out, srcPos: gated ? outPos : null};
}

// Cumulative absolute turn (degrees) indexed by ring vertex, EXCLUDING fold
// cusps. prefix[k] = sum of |turn| at ring vertices 1..k-1, skipping the
// near-180-degree cusps where the offset doubles back on itself (an artifact of
// the self-crossing offset, with no corresponding source bend). A normal offset
// join's turn equals its source bend angle, so the remaining sum reconstructs
// the source stretch's cumulative turn -- the loop-removal signal -- without
// source provenance. Only the provenance-free geometric path uses this (the
// clean-outline rings use the exact coverage check instead); the purely
// geometric cusp threshold can over-collapse real sharp bends (e.g. a fjord
// mouth), which is one reason the coverage check replaced it as the default.
var CUSP_TURN = 135;
function ringAbsTurnPrefix(ring) {
  var n = ring.length - 1;
  var prefix = new Float64Array(n + 1);
  var RAD = 180 / Math.PI;
  for (var k = 1; k < n; k++) {
    var a = ring[k - 1], b = ring[k], c = ring[k + 1];
    var e1x = b[0] - a[0], e1y = b[1] - a[1];
    var e2x = c[0] - b[0], e2y = c[1] - b[1];
    var cross = e1x * e2y - e1y * e2x;
    var dot = e1x * e2x + e1y * e2y;
    var ang = Math.abs(Math.atan2(cross, dot)) * RAD;
    prefix[k] = prefix[k - 1] + (ang > CUSP_TURN ? 0 : ang);
  }
  prefix[n] = prefix[n - 1];
  return prefix;
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

// Exact per-collapse coverage test. A collapse drops the loop
// L = [X, b, ring[nextRingIndex..s], X] and replaces anchor->b..c->d with
// anchor->X->d; it is area-neutral iff the dropped region stays covered by the
// rest of the outline. The dropped span is mostly reversed-arc "dip" folds
// (double-covered self-overlap, safe to drop), but it may also swallow a genuine
// offset lobe (single-covered real boundary). We measure exactly how much of the
// dropped region would become UNCOVERED and refuse the collapse when that exceeds
// a "big clip" threshold; small residual clips are left for the dissolve.
//
// Coverage is decided by winding against the stable pass-input ring (not the
// mid-pass output), so it is independent of collapse order: a point in the loop
// is still covered afterward iff windingFullRing(point) - windingLoop(point) != 0.
// For a two-sided line outline the main body always covers the buffer interior,
// so a fold has |winding| >= 2 (body + fold) and survives losing one layer, while
// real boundary has |winding| == 1 and drops to 0. The uncovered area is
// integrated with a horizontal scanline (below) rather than point-sampled, so an
// interior uncovered pocket cannot be missed.
//
// An area pre-filter keeps this off the hot path: a loop whose own area is below
// the threshold cannot produce a clip above it, so only large loops are swept.
// The threshold is in ring units; under web Mercator the scale factor is >= 1
// everywhere, so it is an upper bound on the real m^2 area and no genuinely large
// clip is skipped regardless of latitude.
function collapseKeepsAreaCovered(ring, n, X, b, nextRingIndex, s, index, fillFloor, clipBudget) {
  // Area pre-filter keeps the scanline off the hot path: a loop can neither clip
  // nor fill more than its own (absolute winding) area, so it is safe to skip
  // whenever the loop is below BOTH thresholds; collapseUncoveredArea guards the
  // self-crossing case where the net shoelace under-reports that area. (Filling
  // a winding-0 region never reaches the uncovered floor, so the fill floor must
  // join the skip test -- otherwise small folds that could fill a small hole
  // would be skipped, or every collapse would be scanned.)
  var floor = fillFloor < BUFFER_LOOP_CHECK_MIN_AREA ? fillFloor : BUFFER_LOOP_CHECK_MIN_AREA;
  var u = collapseUncoveredArea(ring, n, X, b, nextRingIndex, s, index, floor);
  if (u < 0) return true; // loop below both floors -- too small to clip or fill
  // Reject if the collapse would clip a real lobe (uncovered) OR swallow a real
  // hole/notch (filled). The uncovered floor is an absolute "big clip" bound; the
  // fill floor scales with the buffer disk (dist^2) because a real hole's area is
  // a fixed fraction of the disk while a fold sliver is orders of magnitude
  // smaller relative to the radius (see BUFFER_LOOP_FILL_AREA_FRAC).
  if (!(u < BUFFER_LOOP_CHECK_MIN_AREA && _lastFillArea < fillFloor)) return false;
  // Neighborhood budget (see removeBufferRingLoopsIterative): a sub-floor clip
  // is only accepted while its neighborhood's accumulated clips stay under the
  // floor. Zero-clip collapses (the common case) skip this entirely.
  if (u > 0 && clipBudget) {
    // Key on the clipped region's own centroid (accumulated by the sweep):
    // overlapping clips from different collapses then share a cell even when
    // their loops' bboxes differ by kilometers. Two dents straddling a cell
    // edge can still each spend a budget, so the worst-case neighborhood dent
    // is 2x the per-collapse floor.
    var cell = clipBudget.cell;
    var key = Math.floor(_lastClipX / cell) + ':' + Math.floor(_lastClipY / cell);
    var spent = clipBudget.map.get(key) || 0;
    if (spent + u >= BUFFER_LOOP_CHECK_MIN_AREA) return false;
    clipBudget.map.set(key, spent + u);
  }
  return true;
}

// Returns the area of the dropped region a collapse would leave uncovered, or -1
// when the loop is provably too small to matter (scanline skipped). See
// collapseKeepsAreaCovered for the winding rationale.
//
// The skip must not trust the net shoelace area alone: a SELF-CROSSING span
// (figure-eight) has lobes of opposite winding whose signed areas cancel, so a
// near-zero net can hide winding regions far above the floor. |net| bounds the
// regions only for a simple loop; the bbox bounds them always. So the scanline
// is skipped when the bbox is under the floor, or when the net is under the
// floor AND the loop has no self-crossing (O(span^2) pairwise test, span <=
// maxGap+2 edges -- run only in the suspicious small-net/large-bbox band).
function collapseUncoveredArea(ring, n, X, b, nextRingIndex, s, index, floor) {
  var i, loopLen = s - nextRingIndex + 3; // X, b, ring[next..s]
  // Loop area (shoelace over X, b, ring[next..s]) and bounding box.
  var area2 = 0, px = X[0], py = X[1];
  var minx = X[0], maxx = X[0], miny = X[1], maxy = X[1];
  var qx = b[0], qy = b[1];
  if (qx < minx) minx = qx; else if (qx > maxx) maxx = qx;
  if (qy < miny) miny = qy; else if (qy > maxy) maxy = qy;
  area2 += px * qy - qx * py; px = qx; py = qy;
  for (i = nextRingIndex; i <= s; i++) {
    qx = ring[i][0]; qy = ring[i][1];
    area2 += px * qy - qx * py; px = qx; py = qy;
    if (qx < minx) minx = qx; else if (qx > maxx) maxx = qx;
    if (qy < miny) miny = qy; else if (qy > maxy) maxy = qy;
  }
  area2 += px * X[1] - X[0] * py;
  var smallNet = Math.abs(area2) / 2 < floor;
  if (smallNet && (maxx - minx) * (maxy - miny) < floor) return -1;
  var scr = coverageScratch(n + loopLen);
  var lx0 = scr.lx0, ly0 = scr.ly0, lx1 = scr.lx1, ly1 = scr.ly1;
  // Loop edges (X->b, b->ring[next..s], ring[s]->X), built before the band
  // collection so the self-cross test can run first.
  var lc = 0;
  lx0[lc] = X[0]; ly0[lc] = X[1]; lx1[lc] = b[0]; ly1[lc] = b[1]; lc++;
  lx0[lc] = b[0]; ly0[lc] = b[1]; lx1[lc] = ring[nextRingIndex][0]; ly1[lc] = ring[nextRingIndex][1]; lc++;
  for (i = nextRingIndex; i < s; i++) {
    lx0[lc] = ring[i][0]; ly0[lc] = ring[i][1]; lx1[lc] = ring[i + 1][0]; ly1[lc] = ring[i + 1][1]; lc++;
  }
  lx0[lc] = ring[s][0]; ly0[lc] = ring[s][1]; lx1[lc] = X[0]; ly1[lc] = X[1]; lc++;
  if (smallNet && !loopEdgesCross(lx0, ly0, lx1, ly1, lc)) return -1; // simple: |net| == area
  // Collect the ring edges whose y-range meets the loop's band (the only ones
  // that can cross any scanline); reuse module scratch to avoid per-call garbage.
  var band = scr.band, le = 0;
  var gen = ++index.gen, stamp = index.stamp, start = index.start, edges = index.edges;
  var kb, klo = index.binOf(miny), khi = index.binOf(maxy);
  for (kb = klo; kb <= khi; kb++) {
    for (var p = start[kb]; p < start[kb + 1]; p++) {
      var ei = edges[p];
      if (stamp[ei] === gen) continue;
      stamp[ei] = gen;
      var ay = ring[ei][1], by = ring[ei + 1][1];
      if (ay < miny && by < miny || ay > maxy && by > maxy) continue;
      if (ring[ei][0] > maxx && ring[ei + 1][0] > maxx) continue; // entirely right of loop
      band[le++] = ei;
    }
  }
  return loopUncoveredArea(ring, band, le, lx0, ly0, lx1, ly1, lc, minx, maxx, miny, maxy, scr);
}

// True if any two non-adjacent loop edges cross (strict interior). Adjacent
// edges share an endpoint and cannot strictly cross, so they are skipped.
function loopEdgesCross(lx0, ly0, lx1, ly1, lc) {
  for (var i = 0; i < lc - 1; i++) {
    for (var j = i + 2; j < lc; j++) {
      if (i === 0 && j === lc - 1) continue; // adjacent via closure at X
      if (segHit(lx0[i], ly0[i], lx1[i], ly1[i], lx0[j], ly0[j], lx1[j], ly1[j])) {
        return true;
      }
    }
  }
  return false;
}

// y-band index of ring edges: bins the ring's y-range so a scanline query at
// [miny, maxy] returns only edges reaching that band instead of scanning all n.
// start[k]..start[k+1] are indices into `edges` for bin k; `stamp`/`gen` dedup an
// edge that spans several bins during a single query.
function buildEdgeYIndex(ring, n) {
  var yMin = Infinity, yMax = -Infinity, i;
  for (i = 0; i < n; i++) { var y = ring[i][1]; if (y < yMin) yMin = y; if (y > yMax) yMax = y; }
  var B = n < 32 ? 1 : Math.min(4096, Math.max(16, n >> 2));
  var binH = (yMax - yMin) / B || 1;
  var binOf = function (y) { var k = ((y - yMin) / binH) | 0; return k < 0 ? 0 : (k >= B ? B - 1 : k); };
  var start = new Int32Array(B + 1);
  for (i = 0; i < n; i++) {
    var ya = ring[i][1], yb = ring[i + 1][1];
    var lo = binOf(ya < yb ? ya : yb), hi = binOf(ya < yb ? yb : ya);
    for (var k = lo; k <= hi; k++) start[k + 1]++;
  }
  for (i = 0; i < B; i++) start[i + 1] += start[i];
  var edges = new Int32Array(start[B]);
  var cur = start.slice(0, B);
  for (i = 0; i < n; i++) {
    var a2 = ring[i][1], b2 = ring[i + 1][1];
    var lo2 = binOf(a2 < b2 ? a2 : b2), hi2 = binOf(a2 < b2 ? b2 : a2);
    for (var k2 = lo2; k2 <= hi2; k2++) edges[cur[k2]++] = i;
  }
  return { binOf: binOf, start: start, edges: edges, stamp: new Int32Array(n), gen: 0 };
}

var _covScratch = null;
function coverageScratch(cap) {
  if (!_covScratch || _covScratch.cap < cap) {
    _covScratch = {
      cap: cap,
      lx0: new Float64Array(cap), ly0: new Float64Array(cap),
      lx1: new Float64Array(cap), ly1: new Float64Array(cap),
      band: new Int32Array(cap),
      xs: new Float64Array(cap), df: new Int8Array(cap),
      dl: new Int8Array(cap), order: new Int32Array(cap)
    };
  }
  return _covScratch;
}

// Sweep the removed loop L and measure two area quantities the collapse would
// change, both integrated with horizontal scanlines across L's bounding box (at
// each scanline the winding of the full ring and of the loop are step functions
// of x, reconstructed from the sorted edge crossings). For a point inside L
// (windingLoop != 0), the winding after the collapse is windingFull - windingLoop:
//   - UNCOVERED: was covered (windingFull == windingLoop, so it drops to 0). This
//     is the "big clip" a collapse of a real single-covered lobe would make.
//   - FILLED: was a winding-0 hole/exterior (windingFull == 0, so it flips to
//     covered). This is a real buffer hole (or an open outer-wall notch) the
//     collapse would swallow -- undetectable by the uncovered measure alone,
//     since filling adds coverage rather than removing it.
// Returns the uncovered area and writes the filled area to _lastFillArea.
// `band` lists the indices of ring edges that can reach the loop's y-band.
var _lastFillArea = 0;
var _lastClipX = 0, _lastClipY = 0;
function loopUncoveredArea(ring, band, be, lx0, ly0, lx1, ly1, le, minx, maxx, miny, maxy, scr) {
  var h = maxy - miny;
  _lastFillArea = 0;
  if (h <= 0 || maxx <= minx) return 0;
  // Known limitation: rows are uniform with a hard cap, so dy scales with the
  // loop's bbox height and a region thinner than dy in y can fall between row
  // midpoints unmeasured (only reachable via a loop whose bbox is much taller
  // than the region -- not observed outside synthetic data). A designed fix
  // (vertex-guided rows) was implemented, measured at 4-8% of buffer build
  // time, and reverted; see "Scanline row starvation" in
  // docs/development/buffer-line-notes.md to re-add it if it is ever needed.
  var target = Math.sqrt(BUFFER_LOOP_CHECK_MIN_AREA) / 4;
  var rows = Math.round(h / (target > 0 ? target : h));
  if (rows < 8) rows = 8; else if (rows > 40) rows = 40;
  var dy = h / rows;
  var xs = scr.xs, df = scr.df, dl = scr.dl, order = scr.order;
  var total = 0, fill = 0, momX = 0, momY = 0, r, k, i;
  for (r = 0; r < rows; r++) {
    var y = miny + (r + 0.5) * dy;
    // Winding just left of the loop's x-range (base), plus the crossings that
    // fall inside [minx, maxx] (only these need sorting). Crossings right of the
    // loop are irrelevant to intervals within the range and are dropped.
    var baseWf = 0, baseWl = 0, m = 0;
    for (k = 0; k < be; k++) {
      i = band[k];
      var y1 = ring[i][1], y2 = ring[i + 1][1];
      if ((y1 <= y) === (y2 <= y)) continue;
      var x = ring[i][0] + (y - y1) / (y2 - y1) * (ring[i + 1][0] - ring[i][0]);
      var sgnF = y2 > y1 ? 1 : -1;
      if (x <= minx) baseWf += sgnF;
      else if (x < maxx) { xs[m] = x; df[m] = sgnF; dl[m] = 0; order[m] = m; m++; }
    }
    for (i = 0; i < le; i++) {
      var ya = ly0[i], yb = ly1[i];
      if ((ya <= y) === (yb <= y)) continue;
      var xl = lx0[i] + (y - ya) / (yb - ya) * (lx1[i] - lx0[i]);
      var sl = yb > ya ? 1 : -1;
      if (xl <= minx) { baseWl += sl; }
      else if (xl < maxx) { xs[m] = xl; df[m] = 0; dl[m] = sl; order[m] = m; m++; }
    }
    sortByX(order, xs, m);
    var wf = baseWf, wl = baseWl, prevx = minx;
    for (i = 0; i < m; i++) {
      var o = order[i], xk = xs[o];
      if (wl !== 0 && xk > prevx) {
        if (wf - wl === 0) {
          total += xk - prevx;
          momX += (xk + prevx) / 2 * (xk - prevx); momY += y * (xk - prevx);
        }
        else if (wf === 0) fill += xk - prevx;
      }
      wf += df[o]; wl += dl[o]; prevx = xk;
    }
    if (wl !== 0 && maxx > prevx) {
      if (wf - wl === 0) {
        total += maxx - prevx;
        momX += (maxx + prevx) / 2 * (maxx - prevx); momY += y * (maxx - prevx);
      }
      else if (wf === 0) fill += maxx - prevx;
    }
  }
  _lastFillArea = fill * dy;
  if (total > 0) { _lastClipX = momX / total; _lastClipY = momY / total; }
  return total * dy;
}

// Insertion sort of index array `order[0..m)` by xs[order[k]] ascending. m is
// small per scanline (edges straddling the row), so this beats a comparator sort.
function sortByX(order, xs, m) {
  for (var i = 1; i < m; i++) {
    var oi = order[i], xi = xs[oi], j = i - 1;
    while (j >= 0 && xs[order[j]] > xi) { order[j + 1] = order[j]; j--; }
    order[j + 1] = oi;
  }
}
