import Visvalingam from '../simplify/mapshaper-visvalingam';
import { fitCurveThroughKnots, getCurveSegments, flattenCurveSegments } from './mapshaper-curve-fit';
import { BendDecimator } from './mapshaper-pencil-gaussian';

// Turns the pointer samples of a freehand ("pencil") stroke into a smooth
// polyline. Weighted Visvalingam simplification thins the samples to a few
// knots, and the interpolating spline used for curved label paths is fitted
// through them.
//
// Knot selection is what removes the jitter of a hand-held mouse. A jittered
// sample spans a small triangle with its neighbours, so Visvalingam discards it
// early, and the knots that survive sit at the stroke's real bends. The spline
// then supplies the curvature between knots that sparse samples lack.
//
// Distances are in pixels, which smooths a stroke the same at every zoom
// level. For samples in other units, the pixelSize option gives the size of a
// pixel in those units.

// Visvalingam threshold for keeping a sample as a knot (the linear equivalent
// of its weighted effective area, as in -simplify). Below about 6px, jitter
// survives into the knots and puts kinks in the curve; above about 10px, bends
// only a few pixels across start to be rounded off.
var KNOT_THRESHOLD = 8;

// Greatest distance of the output polyline from the fitted curve.
var FLATTEN_TOLERANCE = 0.3;

// How many knots have to follow a knot before PencilStrokeFitter places the
// curve up to it.
var FREEZE_LAG = 1;

// Longest the unplaced part of a PencilStrokeFitter stroke may get, measured
// along the samples. Knots are far apart where a stroke runs straight, and a
// straight stroke has no interior knots at all.
var MAX_GAP = 60;

// PencilStrokeFitter flattens its curve to this tolerance before picking
// vertices by bend angle, so that a bend of radius 5px turns by about 10
// degrees per flattened segment.
var DENSE_FLATTEN_TOLERANCE = 0.02;

// Greatest turn between consecutive segments of PencilStrokeFitter's output,
// in degrees, and greatest distance of the output from the curve along gentle
// bends.
var BEND_ANGLE = 12;
var MAX_DEVIATION = 0.75;

// Least spacing of the pointer samples returned by getPreview().
var PREVIEW_SPACING = 2;

// points: array of [x, y] pointer samples, in drawing order
// opts: (optional) {knotThreshold, flattenTolerance, pixelSize}
// Returns an array of [x, y] that starts at the first sample and ends at the
//   last one.
export function fitPencilStroke(points, opts) {
  var pts = dedupeSamples(points || []);
  if (pts.length < 3) return pts;
  return fitCurveThroughKnots(selectStrokeKnots(pts, getKnotThreshold(opts)),
    getFlattenTolerance(opts));
}

// Fits a stroke while it is being drawn, placing vertices that never move once
// they are placed.
//
// The stretch from the last placed vertex (the anchor) to the newest sample is
// refitted as each sample arrives. Once a knot in it has @lag knots after it,
// the curve up to that knot is placed, and fitting resumes from there, with
// the curve leaving the knot in the direction that the placed curve arrived
// in, so that the joins are smooth. Only the knots nearest the pointer are
// still moving: in Hobby's system the influence of one knot on the tangent at
// another falls off by roughly a factor of four per knot in between, and
// Visvalingam's choice of knots only changes near the end of the samples.
//
// Where the knots are too far apart to keep up with the pointer, the fitted
// curve is cut partway along instead, and the part up to the cut is placed.
//
// The curve is flattened finely, and vertices are picked from it by bend
// angle, as GaussianStrokeFitter does.
//
// start: [x, y] first sample
// opts: (optional) {knotThreshold, lag, maxGap, bendAngle (degrees),
//   maxDeviation, pixelSize}
export function PencilStrokeFitter(start, opts) {
  var px = opts && opts.pixelSize > 0 ? opts.pixelSize : 1;
  var threshold = getKnotThreshold(opts);
  var tolerance = DENSE_FLATTEN_TOLERANCE * px;
  var lag = opts && opts.lag >= 1 ? opts.lag : FREEZE_LAG;
  var maxGap = getOpt(opts, 'maxGap', MAX_GAP);
  var decimator = new BendDecimator(start,
    (opts && opts.bendAngle > 0 ? opts.bendAngle : BEND_ANGLE) * Math.PI / 180,
    getOpt(opts, 'maxDeviation', MAX_DEVIATION));
  var samples = [[start[0], start[1]]]; // from the anchor on
  var direction = null; // direction of the placed curve at the anchor
  var gap = 0; // length of the samples

  // Returns the vertices placed by the new sample, which may be none.
  this.addSample = function(p) {
    var prev = samples[samples.length - 1],
        ids, knots, count, segments;
    if (!isSample(p) || samePoint(p, prev)) return [];
    samples.push([p[0], p[1]]);
    gap += distance(prev, p);
    ids = selectStrokeKnotIds(samples, threshold);
    count = ids.length - 1 - lag; // segments that can be placed
    if (count < 1 && gap <= maxGap) return [];
    knots = ids.map(function(i) { return samples[i]; });
    segments = getCurveSegments(knots, {startDirection: direction});
    return pickVertices(count < 1 ?
      cutCurve(segments, ids, gap - maxGap / 2) :
      placeSegments(segments, count, ids[count]));
  };

  // Returns the vertices that complete the stroke, ending at the last sample.
  this.finish = function() {
    var knots = selectStrokeKnots(samples, threshold), points, out;
    if (knots.length < 2) return [];
    points = flattenCurveSegments(getCurveSegments(knots, {startDirection: direction}),
      tolerance);
    out = pickVertices(points);
    out.push(points[points.length - 1]);
    return out;
  };

  // The last placed vertex, followed by the samples that haven't been placed.
  this.getPendingSamples = function() {
    return samples;
  };

  // Returns points to show between the last placed vertex and the pointer
  // (not including either): the end of the placed curve, followed by the
  // pointer samples beyond it.
  this.getPreview = function() {
    var out = [], last = decimator.getCandidate(), i;
    if (last) out.push(last);
    for (i = 1; i < samples.length - 1; i++) {
      if (last && distance(last, samples[i]) < PREVIEW_SPACING * px) continue;
      out.push(samples[i]);
      last = samples[i];
    }
    return out;
  };

  function pickVertices(points) {
    var out = [], p, i;
    for (i = 0; i < points.length; i++) {
      p = decimator.push(points[i]);
      if (p) out.push(p);
    }
    return out;
  }

  // Places the first @count segments, ending at the sample with index @id.
  function placeSegments(segments, count, id) {
    var placed = flattenCurveSegments(segments.slice(0, count), tolerance);
    direction = getDepartureDirection(segments[count]);
    resetSamples(samples[id], id + 1);
    return placed;
  }

  // Places the curve up to where it passes the samples at distance @target
  // along them. Where that falls between two knots is taken in proportion to
  // the distance along the samples between them.
  function cutCurve(segments, ids, target) {
    var dist = [0], i, k, t, halves, placed;
    for (i = 1; i < samples.length; i++) {
      dist.push(dist[i - 1] + distance(samples[i - 1], samples[i]));
    }
    for (k = 0; k < segments.length - 1 && dist[ids[k + 1]] <= target; k++);
    t = (target - dist[ids[k]]) / (dist[ids[k + 1]] - dist[ids[k]]);
    halves = splitCubic(segments[k], Math.min(Math.max(t, 0), 1));
    placed = flattenCurveSegments(segments.slice(0, k).concat(halves[0]), tolerance);
    direction = getDepartureDirection(halves[1]);
    for (i = ids[k] + 1; i < samples.length - 1 && dist[i] <= target; i++);
    resetSamples(halves[1].p0, i);
    return placed;
  }

  // Restarts the samples at the anchor @p, keeping the ones from index @i on.
  function resetSamples(p, i) {
    if (i < samples.length - 1 && samePoint(p, samples[i])) i++;
    samples = [[p[0], p[1]]].concat(samples.slice(i));
    gap = 0;
    for (i = 1; i < samples.length; i++) gap += distance(samples[i - 1], samples[i]);
  }
}

// Splits a cubic Bezier segment in two at parameter @t (de Casteljau).
function splitCubic(seg, t) {
  var a = lerp(seg.p0, seg.c1, t),
      b = lerp(seg.c1, seg.c2, t),
      c = lerp(seg.c2, seg.p3, t),
      ab = lerp(a, b, t),
      bc = lerp(b, c, t),
      m = lerp(ab, bc, t);
  return [{p0: seg.p0, c1: a, c2: ab, p3: m}, {p0: m, c1: bc, c2: c, p3: seg.p3}];
}

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function distance(a, b) {
  var dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// Returns the subset of @pts to fit the curve through, always including the
// first and last point.
export function selectStrokeKnots(pts, threshold) {
  return selectStrokeKnotIds(pts, threshold).map(function(i) {
    return pts[i];
  });
}

function selectStrokeKnotIds(pts, threshold) {
  var n = pts.length,
      xx = new Float64Array(n),
      yy = new Float64Array(n),
      kk = new Float64Array(n),
      ids = [],
      i;
  for (i = 0; i < n; i++) {
    xx[i] = pts[i][0];
    yy[i] = pts[i][1];
  }
  if (n > 2) {
    Visvalingam.getWeightedSimplifier({}, false)(kk, xx, yy);
  }
  for (i = 0; i < n; i++) {
    // endpoints have infinite thresholds
    if (n <= 2 || kk[i] >= threshold) ids.push(i);
  }
  return ids;
}

function getDepartureDirection(seg) {
  var dx = seg.c1[0] - seg.p0[0], dy = seg.c1[1] - seg.p0[1];
  if (dx === 0 && dy === 0) {
    dx = seg.p3[0] - seg.p0[0];
    dy = seg.p3[1] - seg.p0[1];
  }
  return Math.atan2(dy, dx);
}

function getKnotThreshold(opts) {
  return getOpt(opts, 'knotThreshold', KNOT_THRESHOLD);
}

function getFlattenTolerance(opts) {
  return getOpt(opts, 'flattenTolerance', FLATTEN_TOLERANCE);
}

// Returns a distance option in the units of the samples.
function getOpt(opts, name, defaultPixels) {
  var pixels = opts && opts[name] > 0 ? opts[name] : defaultPixels;
  return opts && opts.pixelSize > 0 ? pixels * opts.pixelSize : pixels;
}

function isSample(p) {
  return !!p && isFinite(p[0]) && isFinite(p[1]);
}

function samePoint(a, b) {
  return a[0] == b[0] && a[1] == b[1];
}

// Removes non-finite and consecutively repeated samples. Mouse coordinates are
// whole pixels, so a slow stroke repeats positions often.
function dedupeSamples(points) {
  var out = [], prev, p, i;
  for (i = 0; i < points.length; i++) {
    p = points[i];
    if (!isSample(p)) continue;
    if (prev && samePoint(p, prev)) continue;
    out.push([p[0], p[1]]);
    prev = p;
  }
  return out;
}
