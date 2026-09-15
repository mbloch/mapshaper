
import { fitCurveThroughKnots, getCurveSegments, getCurveLength, setCurveCurl } from '../src/curves/mapshaper-curve-fit';
import assert from 'assert';

// max distance from p to the polyline pts
function maxDeviation(pts, p) {
  var best = Infinity;
  for (var i = 1; i < pts.length; i++) {
    best = Math.min(best, Math.sqrt(pointSegDistSq(p, pts[i - 1], pts[i])));
  }
  return best;
}

function pointSegDistSq(p, a, b) {
  var ab2 = Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2);
  if (ab2 === 0) return Math.pow(p[0] - a[0], 2) + Math.pow(p[1] - a[1], 2);
  var t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / ab2;
  t = Math.max(0, Math.min(1, t));
  var x = a[0] + t * (b[0] - a[0]);
  var y = a[1] + t * (b[1] - a[1]);
  return Math.pow(p[0] - x, 2) + Math.pow(p[1] - y, 2);
}

function containsPoint(pts, p, eps) {
  return pts.some(function(q) {
    return Math.abs(q[0] - p[0]) < (eps || 1e-9) &&
      Math.abs(q[1] - p[1]) < (eps || 1e-9);
  });
}

function allIndices(n) {
  var arr = [];
  for (var i = 0; i < n; i++) arr.push(i);
  return arr;
}

// point on a cubic Bezier at parameter t
function bezierPoint(seg, t) {
  var u = 1 - t;
  return [
    u * u * u * seg.p0[0] + 3 * u * u * t * seg.c1[0] +
      3 * u * t * t * seg.c2[0] + t * t * t * seg.p3[0],
    u * u * u * seg.p0[1] + 3 * u * u * t * seg.c1[1] +
      3 * u * t * t * seg.c2[1] + t * t * t * seg.p3[1]
  ];
}

// greatest distance from the true curve to the flattened polyline
function maxFlatteningError(knots, corners, tolerance, samples) {
  var poly = fitCurveThroughKnots(knots, corners, tolerance);
  var segs = getCurveSegments(knots, corners);
  var n = samples || 400;
  var worst = 0;
  segs.forEach(function(seg) {
    for (var i = 0; i <= n; i++) {
      worst = Math.max(worst, maxDeviation(poly, bezierPoint(seg, i / n)));
    }
  });
  return worst;
}

// angle in degrees between the output segments meeting at vertex i
function turnAngleAt(pts, i) {
  var a = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]];
  var b = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]];
  var dot = a[0] * b[0] + a[1] * b[1];
  var mag = Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]);
  if (!mag) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI;
}

function indexOfPoint(pts, p) {
  return pts.findIndex(function(q) {
    return Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6;
  });
}

describe('mapshaper-curve-fit', function () {

  describe('degenerate input', function () {
    it('no knots', function () {
      assert.deepEqual(fitCurveThroughKnots([], null, 1), []);
    });

    it('one knot returns that knot', function () {
      assert.deepEqual(fitCurveThroughKnots([[3, 4]], null, 1), [[3, 4]]);
    });

    it('null and undefined knot arrays', function () {
      assert.deepEqual(fitCurveThroughKnots(null, null, 1), []);
      assert.deepEqual(fitCurveThroughKnots(undefined, null, 1), []);
    });

    it('non-finite coordinates are dropped', function () {
      var out = fitCurveThroughKnots([[0, 0], [NaN, 5], [10, 0]], null, 0.01);
      assert.equal(out[0][0], 0);
      assert.equal(out[out.length - 1][0], 10);
      out.forEach(function(p) {
        assert.ok(isFinite(p[0]) && isFinite(p[1]), 'output is finite');
      });
    });

    it('duplicate knots do not produce NaN', function () {
      var out = fitCurveThroughKnots(
        [[0, 0], [5, 5], [5, 5], [10, 0]], null, 0.01);
      assert.ok(out.length > 4);
      out.forEach(function(p) {
        assert.ok(isFinite(p[0]) && isFinite(p[1]), 'output is finite');
      });
    });

    it('all knots identical collapses to one point', function () {
      assert.deepEqual(
        fitCurveThroughKnots([[2, 2], [2, 2], [2, 2]], null, 1), [[2, 2]]);
    });

    it('zero tolerance returns the knots rather than diverging', function () {
      var knots = [[0, 0], [5, 5], [10, 0]];
      assert.deepEqual(fitCurveThroughKnots(knots, null, 0), knots);
    });
  });

  describe('interpolation', function () {
    it('two knots make a straight segment', function () {
      assert.deepEqual(
        fitCurveThroughKnots([[0, 0], [10, 20]], null, 0.001),
        [[0, 0], [10, 20]]);
    });

    it('curve passes through every knot', function () {
      var knots = [[0, 0], [10, 8], [22, 3], [30, 14], [41, 9]];
      var out = fitCurveThroughKnots(knots, null, 0.01);
      knots.forEach(function(k, i) {
        assert.ok(containsPoint(out, k, 1e-6), 'knot ' + i + ' is on the curve');
      });
    });

    it('endpoints are exactly the first and last knots', function () {
      var knots = [[1, 2], [10, 8], [22, 3]];
      var out = fitCurveThroughKnots(knots, null, 0.01);
      assert.deepEqual(out[0], [1, 2]);
      assert.deepEqual(out[out.length - 1], [22, 3]);
    });

    it('reproduces a circle from points sampled on it', function () {
      // Known-answer check on the whole solve: Hobby's system is built so that
      // evenly sampled circle points give back the circle, so any error in the
      // tridiagonal coefficients or the velocity functions shows up here.
      var R = 100, knots = [], i, out;
      for (i = 0; i <= 8; i++) {
        knots.push([R * Math.cos(2 * Math.PI * i / 8),
                    R * Math.sin(2 * Math.PI * i / 8)]);
      }
      setCurveCurl(1); // a circle is the curl = 1 end condition by definition
      out = fitCurveThroughKnots(knots, null, 0.001);
      setCurveCurl(undefined);
      out.forEach(function(p) {
        var r = Math.hypot(p[0], p[1]);
        assert.ok(Math.abs(r - R) < 0.02, 'radius stays ' + R + ', got ' + r);
      });
    });

    it('knot order is preserved along the output', function () {
      var knots = [[0, 0], [10, 8], [22, 3], [30, 14]];
      var out = fitCurveThroughKnots(knots, null, 0.01);
      var positions = knots.map(function(k) {
        return out.findIndex(function(p) {
          return Math.abs(p[0] - k[0]) < 1e-6 && Math.abs(p[1] - k[1]) < 1e-6;
        });
      });
      for (var i = 1; i < positions.length; i++) {
        assert.ok(positions[i] > positions[i - 1],
          'knot ' + i + ' comes after knot ' + (i - 1));
      }
    });
  });

  describe('collinear knots', function () {
    it('stay on the line', function () {
      var knots = [[0, 0], [5, 0], [10, 0], [20, 0]];
      var out = fitCurveThroughKnots(knots, null, 0.001);
      out.forEach(function(p) {
        assert.ok(Math.abs(p[1]) < 1e-9, 'y stays 0, got ' + p[1]);
      });
    });

    it('unevenly spaced collinear knots stay on the line', function () {
      var knots = [[0, 0], [1, 0], [50, 0], [51, 0]];
      var out = fitCurveThroughKnots(knots, null, 0.001);
      out.forEach(function(p) {
        assert.ok(Math.abs(p[1]) < 1e-9, 'y stays 0, got ' + p[1]);
      });
    });

    it('x advances monotonically for collinear knots', function () {
      var knots = [[0, 0], [1, 0], [50, 0], [51, 0]];
      var out = fitCurveThroughKnots(knots, null, 0.001);
      for (var i = 1; i < out.length; i++) {
        assert.ok(out[i][0] >= out[i - 1][0] - 1e-9,
          'x does not go backward at ' + i);
      }
    });
  });

  describe('corners', function () {
    it('all knots as corners reproduces the input polyline', function () {
      var knots = [[0, 0], [10, 8], [22, 3], [30, 14]];
      var out = fitCurveThroughKnots(knots, allIndices(knots.length), 0.001);
      assert.deepEqual(out, knots);
    });

    it('a single corner makes that vertex sharp', function () {
      var knots = [[0, 0], [10, 10], [20, 0]];
      var smooth = fitCurveThroughKnots(knots, null, 0.001);
      var sharp = fitCurveThroughKnots(knots, [1], 0.001);
      // a sharp apex is reached by two straight runs, so it needs far fewer
      // vertices than a rounded one
      assert.ok(sharp.length < smooth.length,
        'corner is simpler: ' + sharp.length + ' vs ' + smooth.length);
      assert.deepEqual(sharp, knots);
    });

    it('one corner among smooth knots kinks only there', function () {
      // 5 knots in a zigzag; only the middle one is a corner, so it ends one
      // fitted run and starts the next while its neighbours stay smooth
      var knots = [[0, 0], [10, 8], [20, 0], [30, 8], [40, 0]];
      var smooth = fitCurveThroughKnots(knots, null, 0.001);
      var withCorner = fitCurveThroughKnots(knots, [2], 0.001);
      var iSmooth = indexOfPoint(smooth, knots[2]);
      var iCorner = indexOfPoint(withCorner, knots[2]);
      assert.ok(iSmooth > 0 && iCorner > 0, 'the middle knot is on both curves');
      // the corner turns sharply where the smooth version barely deviates
      assert.ok(turnAngleAt(withCorner, iCorner) > 40,
        'corner turns sharply: ' + turnAngleAt(withCorner, iCorner).toFixed(1));
      assert.ok(turnAngleAt(smooth, iSmooth) < 10,
        'smooth knot barely turns: ' + turnAngleAt(smooth, iSmooth).toFixed(1));
      // the neighbouring knots are still rounded, so the curve is not a polyline
      assert.ok(withCorner.length > knots.length + 8,
        'neighbours remain curved: ' + withCorner.length + ' vertices');
    });

    it('corner indices are mapped past dropped duplicates', function () {
      // knot 2 in the caller's array is the corner; index 1 is a duplicate
      // that gets dropped, so the corner must end up at deduped index 1
      var knots = [[0, 0], [0, 0], [10, 10], [20, 0]];
      var out = fitCurveThroughKnots(knots, [2], 0.001);
      assert.deepEqual(out, [[0, 0], [10, 10], [20, 0]]);
    });

    it('out-of-range corner indices are ignored', function () {
      var knots = [[0, 0], [10, 10], [20, 0]];
      var a = fitCurveThroughKnots(knots, [99, -1], 0.001);
      var b = fitCurveThroughKnots(knots, null, 0.001);
      assert.deepEqual(a, b);
    });
  });

  describe('densification', function () {
    it('the flattened path stays within the tolerance of the true curve', function () {
      var knots = [[0, 0], [50, 40], [100, 0]];
      [1, 0.1, 0.01].forEach(function(tol) {
        var err = maxFlatteningError(knots, null, tol);
        assert.ok(err <= tol,
          'tol ' + tol + ': true error ' + err.toFixed(6) + ' exceeds it');
        // the control-point flatness test is conservative: actual deviation is
        // bounded by 3/4 of the tolerance
        assert.ok(err <= tol * 0.75,
          'tol ' + tol + ': error ' + err.toFixed(6) + ' exceeds 0.75 * tol');
      });
    });

    it('tighter tolerance adds vertices', function () {
      var knots = [[0, 0], [50, 40], [100, 0]];
      assert.ok(fitCurveThroughKnots(knots, null, 0.05).length >
        fitCurveThroughKnots(knots, null, 5).length);
    });

    it('is deterministic', function () {
      var knots = [[0, 0], [10, 8], [22, 3], [30, 14]];
      assert.deepEqual(
        fitCurveThroughKnots(knots, null, 0.01),
        fitCurveThroughKnots(knots, null, 0.01));
    });

    it('a gentle curve costs fewer vertices than a tight one', function () {
      var gentle = fitCurveThroughKnots([[0, 0], [50, 2], [100, 0]], null, 0.01);
      var tight = fitCurveThroughKnots([[0, 0], [50, 60], [100, 0]], null, 0.01);
      assert.ok(gentle.length < tight.length,
        'gentle: ' + gentle.length + ', tight: ' + tight.length);
    });

    it('bounds output on a pathological tolerance', function () {
      var out = fitCurveThroughKnots([[0, 0], [1e6, 1e6], [2e6, 0]], null, 1e-12);
      assert.ok(out.length < 600, 'output is bounded, got ' + out.length);
    });
  });

  describe('hairpins and tight turns', function () {
    // A curvature-continuous fit bows well outside the knots when they are
    // placed awkwardly -- that is the cost of the smoothness, and kappa-curves
    // does the same thing (it reaches -0.97..1.97 on the hairpin below, where
    // the knots span 0..1). What must not happen is a cusp, so these two check
    // that the curve turns smoothly rather than that it stays tight.

    it('rounds a hairpin without cusping', function () {
      var knots = [[0, 0], [10, 0], [10, 1], [0, 1]];
      var segs = getCurveSegments(knots, null);
      var out = fitCurveThroughKnots(knots, null, 0.001);
      assert.equal(segs.length, 3);
      // a cusp shows up as a near-reversal between consecutive output
      // segments; a smooth curve flattened this finely turns by a degree or two
      for (var i = 1; i < out.length - 1; i++) {
        assert.ok(turnAngleAt(out, i) < 15,
          'no cusp at ' + i + ': turns ' + turnAngleAt(out, i).toFixed(1));
      }
      out.forEach(function(p) {
        assert.ok(p[0] >= -0.5 && p[0] <= 10.5, 'x stays near the knots: ' + p[0]);
        assert.ok(p[1] >= -4 && p[1] <= 5, 'y bow is bounded: ' + p[1]);
      });
    });

    it('does not cusp when knots are bunched at one end', function () {
      // chords of 1, 1.1 and 38: the spacing that makes uniform Catmull-Rom
      // produce a cusp. The curve bows in y but must stay inside the knots'
      // x range and keep turning smoothly.
      var knots = [[0, 0], [1, 0], [2, 0.5], [40, 1]];
      var out = fitCurveThroughKnots(knots, null, 0.001);
      for (var i = 1; i < out.length - 1; i++) {
        assert.ok(turnAngleAt(out, i) < 15,
          'no cusp at ' + i + ': turns ' + turnAngleAt(out, i).toFixed(1));
      }
      out.forEach(function(p) {
        assert.ok(p[0] >= 0 && p[0] <= 40, 'no x overshoot: ' + p[0]);
      });
    });
  });

  describe('getCurveSegments()', function () {
    it('returns one cubic per knot interval', function () {
      assert.equal(getCurveSegments([[0, 0], [1, 1]], null).length, 1);
      assert.equal(getCurveSegments([[0, 0], [1, 1], [2, 0]], null).length, 2);
      assert.equal(getCurveSegments([[0, 0]], null).length, 0);
      assert.equal(getCurveSegments([], null).length, 0);
    });

    it('segments join end to end', function () {
      var segs = getCurveSegments([[0, 0], [10, 8], [22, 3]], null);
      assert.deepEqual(segs[0].p3, segs[1].p0);
    });

    it('a two-knot curve is a straight cubic', function () {
      var seg = getCurveSegments([[0, 0], [30, 0]], null)[0];
      assert.deepEqual(seg.p0, [0, 0]);
      assert.deepEqual(seg.p3, [30, 0]);
      // control points sit on the chord at the thirds
      assert.ok(Math.abs(seg.c1[0] - 10) < 1e-9, 'c1 x: ' + seg.c1[0]);
      assert.ok(Math.abs(seg.c2[0] - 20) < 1e-9, 'c2 x: ' + seg.c2[0]);
      assert.ok(Math.abs(seg.c1[1]) < 1e-9 && Math.abs(seg.c2[1]) < 1e-9,
        'control points stay on the chord');
    });
  });

  describe('getCurveLength()', function () {
    // length of a polyline, used to cross-check the analytic estimate against
    // the independent flattening code path
    function polylineLength(pts) {
      var len = 0;
      for (var i = 1; i < pts.length; i++) {
        len += Math.sqrt(Math.pow(pts[i][0] - pts[i - 1][0], 2) +
          Math.pow(pts[i][1] - pts[i - 1][1], 2));
      }
      return len;
    }

    it('is zero for fewer than two distinct knots', function () {
      assert.equal(getCurveLength([], null), 0);
      assert.equal(getCurveLength([[5, 5]], null), 0);
      assert.equal(getCurveLength([[5, 5], [5, 5]], null), 0);
    });

    it('a two-knot curve is exactly its chord', function () {
      assert.ok(Math.abs(getCurveLength([[0, 0], [30, 40]], null) - 50) < 1e-6);
    });

    it('collinear knots measure their total span', function () {
      var len = getCurveLength([[0, 0], [10, 0], [25, 0], [40, 0]], null);
      assert.ok(Math.abs(len - 40) < 1e-6, 'length: ' + len);
    });

    it('an all-corners curve measures the input polyline', function () {
      var knots = [[0, 0], [10, 10], [30, 0], [30, 20]];
      var len = getCurveLength(knots, allIndices(knots.length));
      assert.ok(Math.abs(len - polylineLength(knots)) < 1e-6, 'length: ' + len);
    });

    it('a curve is longer than the straight line between its ends', function () {
      var knots = [[0, 0], [50, 40], [100, 0]];
      var len = getCurveLength(knots, null);
      assert.ok(len > 100, 'longer than the chord: ' + len);
      // Note that a smooth fit is *not* bounded by the knot polyline. Rounding
      // the apex shortens the curve, but each arm has to bow off its own chord
      // to leave along one fitted tangent and arrive along the next, and here
      // the bow wins by about 5%. The curve still stays within the knots'
      // bounding box -- this is bowing, not overshoot.
      assert.ok(len < polylineLength(knots) * 1.07, 'close to the knots: ' + len);
    });

    it('agrees with a finely flattened version of the same curve', function () {
      // the two code paths share only getCurveSegments(), so this checks the
      // length estimate against subdivision
      [
        [[0, 0], [50, 40], [100, 0]],
        [[0, 0], [10, 30], [40, 35], [60, 5], [95, 20]],
        [[0, 0], [1, 1], [2, 0], [40, 0]] // very uneven spacing
      ].forEach(function (knots) {
        var exact = getCurveLength(knots, null);
        var approx = polylineLength(fitCurveThroughKnots(knots, null, 0.0005));
        assert.ok(Math.abs(exact - approx) / exact < 1e-3,
          'exact ' + exact + ' vs flattened ' + approx);
        // flattening cuts corners, so it can only come out short
        assert.ok(approx <= exact + 1e-9, 'flattened path is not longer');
      });
    });

    it('scales with the coordinates', function () {
      var knots = [[0, 0], [50, 40], [100, 0]];
      var big = knots.map(function (p) { return [p[0] * 1000, p[1] * 1000]; });
      var ratio = getCurveLength(big, null) / getCurveLength(knots, null);
      assert.ok(Math.abs(ratio - 1000) < 1e-6, 'ratio: ' + ratio);
    });
  });
});
