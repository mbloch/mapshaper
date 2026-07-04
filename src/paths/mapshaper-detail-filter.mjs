import { Heap } from '../simplify/mapshaper-heap';
import geom from '../geom/mapshaper-geom';

// Remove intricate sub-scale detail from a single arc so that -smooth has a
// clean line to work with, WITHOUT thinning the rest of the line: smooth makes a
// better approximation of the original when it has more detail to work with, so
// we only cut where there is genuine intricate detail and leave everything else
// at full resolution.
//
// Two phases:
//
//  1. IDENTIFY candidate chords with a chord-length-gated weighted Visvalingam
//     peel. Weighted Visvalingam removes the least-significant vertex first
//     (smallest angle-weighted triangle area), so a thin feature is peeled from
//     its tip inward and each removal sweeps the smallest possible triangle --
//     this finds the minimal chord that slices a feature off. The gate (a vertex
//     is only removable when the chord that would replace it is <= the detail
//     distance D) segments the line into runs that each fit within the detail
//     scale and bounds every candidate chord to <= D, so cuts stay local.
//
//  2. MERGE survivors that hide a slicing chord. A spike with long bare flanks
//     parks its base vertices as survivors (each flank chord alone exceeds D), so
//     the short chord that closes the excursion sits between non-adjacent
//     survivors. Where a near-degenerate closing chord (a needle returning close
//     to its base: chord <= MERGE_CHORD_FRACTION * D, tortuosity >= threshold)
//     exists within an arc-length window, widen the run so the next phase can
//     slice it. Restricting to short closing chords keeps the merge from sweeping
//     a wide excursion across neighbouring geometry and introducing a crossing.
//
//  3. COMMIT selectively. For each run of removed vertices between two survivors,
//     compare the original sub-path length to the chord across it (tortuosity).
//     Collapse the run to its chord only when it is convoluted (tortuosity >=
//     threshold) -- a jetty, fjord or crinkle. Otherwise restore the run's
//     original vertices, so gentle stretches keep full detail for -smooth.
//
// A ROUNDNESS gate protects substantial, rounded loops from both the merge pass
// and the commit. Tortuosity (path length / chord) alone cannot tell a thin
// needle from a round bulge -- both can be highly tortuous, and a closing chord
// of length ~0 makes tortuosity infinite for either. Worst case: a closed ring
// stores its start and end vertex at the same coordinate, so the seam chord
// (vertex 0 -> vertex n-1) has length 0 and infinite tortuosity, which used to
// make the merge pass splice out the entire ring -- destroying every island
// whose perimeter fit inside the merge window, regardless of size or roundness.
// The gate distinguishes them by the enclosed area: for a candidate section
// closed by its chord, protect it when area / loop-perimeter >= roundness * D
// (the isoperimetric area-to-perimeter ratio, biased by the detail distance). A
// thin needle encloses ~0 area (never protected -> still cut); a round island
// encloses a large area (protected). Because area/perimeter equals radius/2 for
// a circle, the default gate protects circular features at or above the detail
// resolution and preferentially removes smaller or less-round ones.
//
// @xx, @yy  coordinate arrays for one arc (may be typed-array subarrays).
// @opts: {distance, tortuosity, spherical, weighting, roundness}
//   distance   detail size threshold in ground units (meters when spherical): the
//              longest chord the filter is allowed to create.
//   tortuosity min original-length / chord ratio for a run to be cut (default 2).
//   spherical  measure area/length on the sphere (lng/lat -> geocentric x,y,z).
//   weighting  Visvalingam angle-weight coefficient (default 0.7), matching
//              -simplify's weighted_visvalingam.
//   roundness  min enclosed-area / loop-perimeter (as a fraction of the detail
//              distance) for a loop to be protected from removal (default 0.2);
//              higher removes more, 0 disables the protection.
// Returns {xx: [], yy: []}. Arc endpoints are always preserved, so shared
// topology nodes stay put and the operation is topology-safe like -simplify.
var DEFAULT_WEIGHTING = 0.7;
var DEFAULT_TORTUOSITY = 4;
// Protect a candidate loop from collapse when its enclosed-area / loop-perimeter
// exceeds this fraction of the detail distance D. For a circle area/perimeter =
// radius/2, so 0.2 protects circular features of diameter >= ~D and drops finer
// or less-round detail; a thin needle (area ~ 0) is never protected.
var DEFAULT_ROUNDNESS = 0.2;
// A closed ring (island, lake or hole) is dropped entirely when the filter would
// leave less than this fraction of its original enclosed area. The roundness gate
// stops a substantial ring from being merged away wholesale, but it is evaluated
// per candidate span, so cutRun can still slice off convoluted sub-spans of the
// perimeter and shrink a near-scale island to a small, distorted remnant. Once
// most of the area is gone the remnant no longer faithfully represents the island
// and a clean drop is better than a mangled sliver -- so if the survivors enclose
// less than this share of the original area, collapse the ring to its degenerate
// seam (like a fully sub-scale ring) and let the pipeline discard it. Only closed
// rings are affected; open arcs and shared boundaries are never dropped, so the
// operation stays topology-safe. Set to 0 to disable. The default 0.6 keeps a
// ring only while the filter removes at most ~40% of its area.
var DEFAULT_MIN_RING_AREA = 0.6;
// How far (in detail-distances of arc length) the survivor-merge pass looks ahead
// for a chord that closes a convoluted excursion. Bounds the pass to O(n) and
// caps how long a thin spike it can slice in one merge.
var MERGE_WINDOW_FACTOR = 12;
// The survivor-merge pass only fires when the closing chord is this fraction of D
// or shorter: a near-degenerate needle that returns close to its base can be
// sliced safely, but collapsing a wider excursion (chord approaching D) sweeps a
// long span across neighbouring geometry and can introduce a crossing. cutRun,
// which spans only adjacent survivors, is not constrained this way.
var MERGE_CHORD_FRACTION = 0.5;

export function collapseArcDetail(xx, yy, opts) {
  var n = xx.length;
  var outX = [], outY = [], outIdx = [];
  var D = opts.distance;
  if (n < 3 || !(D > 0)) {
    for (var p = 0; p < n; p++) { outX.push(xx[p]); outY.push(yy[p]); }
    return {xx: outX, yy: outY};
  }
  var spherical = !!opts.spherical;
  var k = opts.weighting >= 0 ? opts.weighting : DEFAULT_WEIGHTING;
  var T = opts.tortuosity > 0 ? opts.tortuosity : DEFAULT_TORTUOSITY;
  // roundness >= 0; 0 disables the roundness protection (legacy behavior).
  var R = opts.roundness >= 0 ? opts.roundness : DEFAULT_ROUNDNESS;
  // minRingArea >= 0; 0 disables the drop-shredded-ring gate.
  var minRingArea = opts.minRingArea >= 0 ? opts.minRingArea : DEFAULT_MIN_RING_AREA;
  // A closed ring stores its start and end vertex at the same coordinate.
  var isRing = n >= 4 && xx[0] === xx[n - 1] && yy[0] === yy[n - 1];
  var Dsq = D * D;

  // Metric coordinates: geocentric x,y,z on a sphere for lng/lat input, plain
  // x,y otherwise. Area and chord length are both measured in this space.
  var mx, my, mz;
  if (spherical) {
    mx = new Float64Array(n);
    my = new Float64Array(n);
    mz = new Float64Array(n);
    geom.convLngLatToSph(xx, yy, mx, my, mz);
  } else {
    mx = xx;
    my = yy;
  }

  function chordSq(a, e) {
    var dx = mx[a] - mx[e], dy = my[a] - my[e];
    if (spherical) {
      var dz = mz[a] - mz[e];
      return dx * dx + dy * dy + dz * dz;
    }
    return dx * dx + dy * dy;
  }

  function dist(a, e) { return Math.sqrt(chordSq(a, e)); }

  // Weighted effective area of vertex m between a and e, or Infinity ("parked")
  // when removing m would create a chord longer than the detail distance.
  function vertexValue(a, m, e) {
    if (chordSq(a, e) > Dsq) return Infinity;
    var area, cos;
    if (spherical) {
      area = geom.triangleArea3D(mx[a], my[a], mz[a], mx[m], my[m], mz[m], mx[e], my[e], mz[e]);
      cos = geom.cosine3D(mx[a], my[a], mz[a], mx[m], my[m], mz[m], mx[e], my[e], mz[e]);
    } else {
      area = geom.triangleArea(mx[a], my[a], mx[m], my[m], mx[e], my[e]);
      cos = geom.cosine(mx[a], my[a], mx[m], my[m], mx[e], my[e]);
    }
    return (1 - k * cos) * area;
  }

  var prev = new Int32Array(n);
  var next = new Int32Array(n);
  var removed = new Uint8Array(n);
  var vals = new Float64Array(n);
  for (var i = 0; i < n; i++) {
    prev[i] = i - 1;
    next[i] = i + 1;
    vals[i] = (i === 0 || i === n - 1) ? Infinity : vertexValue(i - 1, i, i + 1);
  }

  var heap = new Heap();
  heap.init(vals);
  while (heap.size() > 0) {
    if (heap.peekValue() === Infinity) break; // no eligible vertices remain
    var c = heap.pop();
    var b = prev[c], d = next[c];
    removed[c] = 1;
    next[b] = d;
    prev[d] = b;
    // Only b and d change neighbours, so only their values (and eligibility)
    // can change; a previously parked neighbour may become removable here.
    if (b !== 0) heap.updateValue(b, vertexValue(prev[b], b, d));
    if (d !== n - 1) heap.updateValue(d, vertexValue(b, d, next[d]));
  }

  // Phase 2: within each run between survivors, cut convoluted spans locally
  // rather than judging the whole run at once. The peel bounds each run to a
  // chord <= D (which keeps this search cheap); the cut decision itself is
  // tortuosity-driven and independent of the run's size, so a small spike is
  // removed whether it sits alone or embedded in a long gentle stretch.
  //
  // Cumulative arc length (metric space) lets us read off the original path
  // length between any two vertices in O(1).
  var cumLen = new Float64Array(n);
  for (var q = 1; q < n; q++) cumLen[q] = cumLen[q - 1] + dist(q - 1, q);

  // Cumulative cross products of successive position vectors (in a frame
  // translated to vertex 0, to keep magnitudes small and the subtraction
  // precise) give the enclosed area of any section i..j closed by its chord in
  // O(1). The vector-area form (0.5 * |sum of edge cross products + closing
  // term|) is origin-independent for a closed loop, so it works unchanged for
  // the geocentric 3D coords used in spherical mode and the plain 2D coords
  // otherwise. Only used by the roundness gate below.
  var ox = mx[0], oy = my[0], oz = spherical ? mz[0] : 0;
  var cumCz = new Float64Array(n), cumCx, cumCy;
  if (spherical) { cumCx = new Float64Array(n); cumCy = new Float64Array(n); }
  for (var t = 1; t < n; t++) {
    var ax = mx[t - 1] - ox, ay = my[t - 1] - oy, bx = mx[t] - ox, by = my[t] - oy;
    if (spherical) {
      var az = mz[t - 1] - oz, bz = mz[t] - oz;
      cumCx[t] = cumCx[t - 1] + (ay * bz - az * by);
      cumCy[t] = cumCy[t - 1] + (az * bx - ax * bz);
      cumCz[t] = cumCz[t - 1] + (ax * by - ay * bx);
    } else {
      cumCz[t] = cumCz[t - 1] + (ax * by - ay * bx);
    }
  }

  // Area enclosed by the section vertices i..j closed by the chord j->i.
  function sectionArea(i, j) {
    var aix = mx[i] - ox, aiy = my[i] - oy, ajx = mx[j] - ox, ajy = my[j] - oy;
    if (spherical) {
      var aiz = mz[i] - oz, ajz = mz[j] - oz;
      var vx = (cumCx[j] - cumCx[i]) + (ajy * aiz - ajz * aiy);
      var vy = (cumCy[j] - cumCy[i]) + (ajz * aix - ajx * aiz);
      var vz = (cumCz[j] - cumCz[i]) + (ajx * aiy - ajy * aix);
      return 0.5 * Math.sqrt(vx * vx + vy * vy + vz * vz);
    }
    return 0.5 * Math.abs((cumCz[j] - cumCz[i]) + (ajx * aiy - ajy * aix));
  }

  // A candidate section (i..j) is protected from collapse when the loop it forms
  // with its closing chord is a substantial, rounded feature: enclosed area per
  // unit loop-perimeter reaches the roundness fraction of the detail distance.
  // A thin needle encloses ~0 area (area/perimeter ~ 0) and is never protected;
  // a round bulge or island encloses enough area to clear the gate.
  function isProtected(i, j) {
    if (!(R > 0)) return false;
    var perim = (cumLen[j] - cumLen[i]) + dist(i, j);
    return perim > 0 && sectionArea(i, j) / perim >= R * D;
  }

  function cutRun(a, e) {
    // Emit the kept vertices in (a, e]; a has already been emitted. Walk from a
    // and, at each step, find the span [i, j] (chord <= D) with the highest
    // tortuosity and, if it exceeds the threshold, cut it to its chord; otherwise
    // keep one vertex and advance. Picking the maximum-tortuosity j gives the
    // tightest return point -- the shortest chord that slices the spike off --
    // and the test is per span, so a small spike is cut whether it stands alone
    // or is embedded in a long gentle stretch (no run-size dilution).
    var i = a;
    while (i < e) {
      var bestJ = -1;
      var bestTort = T;
      for (var j = i + 2; j <= e; j++) {
        var c = dist(i, j);
        if (c > D) continue; // never create a chord longer than the detail scale
        var tort = c > 0 ? (cumLen[j] - cumLen[i]) / c : Infinity;
        // roundness gate: keep substantial, rounded bulges at full detail
        if (tort > bestTort && !isProtected(i, j)) {
          bestTort = tort;
          bestJ = j;
        }
      }
      if (bestJ >= 0) {
        outX.push(xx[bestJ]);
        outY.push(yy[bestJ]);
        outIdx.push(bestJ);
        i = bestJ;
      } else {
        outX.push(xx[i + 1]);
        outY.push(yy[i + 1]);
        outIdx.push(i + 1);
        i++;
      }
    }
  }

  // Survivor-merge pass. A thin spike with long bare flanks (e.g. a fjord wall or
  // a dredged channel) forces its base vertices to be parked as survivors -- each
  // flank chord on its own exceeds D -- so the short chord that actually closes
  // the excursion is hidden between *non-adjacent* survivors and the per-run
  // cutRun above never sees it. Walk the survivor chain and, where a later
  // survivor closes a convoluted excursion with a short chord (<=
  // MERGE_CHORD_FRACTION * D, tortuosity >= T) within an arc-length window,
  // splice out the spanned survivors so the run boundary widens and cutRun slices
  // the spike off. Restricting to short closing chords keeps the merge from
  // sweeping a wide excursion across neighbouring geometry. This reuses cumLen and the
  // peel's linked list; it does not re-run the Visvalingam peel. Only non-adjacent
  // convoluted survivors are merged, so gentle runs (and all existing behaviour)
  // are untouched.
  var window = MERGE_WINDOW_FACTOR * D;
  var mergeChordSq = Dsq * MERGE_CHORD_FRACTION * MERGE_CHORD_FRACTION;
  var s = 0;
  while (s !== n - 1) {
    var mergeJ = -1;
    var mergeTort = T;
    var u = next[s];
    while (cumLen[u] - cumLen[s] <= window) {
      if (chordSq(s, u) <= mergeChordSq) {
        var ud = dist(s, u);
        var utort = ud > 0 ? (cumLen[u] - cumLen[s]) / ud : Infinity;
        // roundness gate: a rounded loop (e.g. a closed ring closing on its own
        // zero-length seam) is a real feature, not a needle -- never merge it.
        if (utort > mergeTort && !isProtected(s, u)) {
          mergeTort = utort;
          mergeJ = u;
        }
      }
      if (u === n - 1) break;
      u = next[u];
    }
    if (mergeJ > next[s]) {
      next[s] = mergeJ;
      prev[mergeJ] = s;
      s = mergeJ;
    } else {
      s = next[s];
    }
  }

  outX.push(xx[0]);
  outY.push(yy[0]);
  outIdx.push(0);
  var a = 0;
  while (a !== n - 1) {
    var e = next[a];
    cutRun(a, e);
    a = e;
  }

  // Drop a closed ring that the filter has shredded to a small remnant: if the
  // survivors enclose less than minRingArea of the original ring's area, collapse
  // it to its degenerate seam so the pipeline discards it (a clean drop rather
  // than a distorted sliver). Uses the survivors' metric coordinates for the
  // filtered area and the whole-ring section area for the original.
  if (isRing && minRingArea > 0) {
    var origArea = sectionArea(0, n - 1);
    if (origArea > 0 && ringAreaByIdx(outIdx) < minRingArea * origArea) {
      return {xx: [xx[0], xx[n - 1]], yy: [yy[0], yy[n - 1]]};
    }
  }
  return {xx: outX, yy: outY};

  // Enclosed area of the closed ring formed by the survivor vertices (given as
  // indices into the original arc), measured in the same metric space as
  // sectionArea via the origin-independent vector-area form.
  function ringAreaByIdx(idx) {
    var m = idx.length;
    if (m < 4) return 0;
    var o0x = mx[idx[0]], o0y = my[idx[0]], o0z = spherical ? mz[idx[0]] : 0;
    var vx = 0, vy = 0, vz = 0;
    for (var t = 1; t < m; t++) {
      var p = idx[t - 1], q = idx[t];
      var ax = mx[p] - o0x, ay = my[p] - o0y, bx = mx[q] - o0x, by = my[q] - o0y;
      if (spherical) {
        var az = mz[p] - o0z, bz = mz[q] - o0z;
        vx += ay * bz - az * by;
        vy += az * bx - ax * bz;
        vz += ax * by - ay * bx;
      } else {
        vz += ax * by - ay * bx;
      }
    }
    return spherical ? 0.5 * Math.sqrt(vx * vx + vy * vy + vz * vz) : 0.5 * Math.abs(vz);
  }
}
