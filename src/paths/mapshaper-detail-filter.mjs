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
// @xx, @yy  coordinate arrays for one arc (may be typed-array subarrays).
// @opts: {distance, tortuosity, spherical, weighting}
//   distance   detail size threshold in ground units (meters when spherical): the
//              longest chord the filter is allowed to create.
//   tortuosity min original-length / chord ratio for a run to be cut (default 2).
//   spherical  measure area/length on the sphere (lng/lat -> geocentric x,y,z).
//   weighting  Visvalingam angle-weight coefficient (default 0.7), matching
//              -simplify's weighted_visvalingam.
// Returns {xx: [], yy: []}. Arc endpoints are always preserved, so shared
// topology nodes stay put and the operation is topology-safe like -simplify.
var DEFAULT_WEIGHTING = 0.7;
var DEFAULT_TORTUOSITY = 2;
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
  var outX = [], outY = [];
  var D = opts.distance;
  if (n < 3 || !(D > 0)) {
    for (var p = 0; p < n; p++) { outX.push(xx[p]); outY.push(yy[p]); }
    return {xx: outX, yy: outY};
  }
  var spherical = !!opts.spherical;
  var k = opts.weighting >= 0 ? opts.weighting : DEFAULT_WEIGHTING;
  var T = opts.tortuosity > 0 ? opts.tortuosity : DEFAULT_TORTUOSITY;
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
        if (tort > bestTort) {
          bestTort = tort;
          bestJ = j;
        }
      }
      if (bestJ >= 0) {
        outX.push(xx[bestJ]);
        outY.push(yy[bestJ]);
        i = bestJ;
      } else {
        outX.push(xx[i + 1]);
        outY.push(yy[i + 1]);
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
        if (utort > mergeTort) {
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
  var a = 0;
  while (a !== n - 1) {
    var e = next[a];
    cutRun(a, e);
    a = e;
  }
  return {xx: outX, yy: outY};
}
