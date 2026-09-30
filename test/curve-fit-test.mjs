
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
function maxFlatteningError(knots, tolerance, samples) {
  var poly = fitCurveThroughKnots(knots, tolerance);
  var segs = getCurveSegments(knots);
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

describe('mapshaper-curve-fit', function () {

  describe('degenerate input', function () {
    it('no knots', function () {
      assert.deepEqual(fitCurveThroughKnots([], 1), []);
    });

    it('one knot returns that knot', function () {
      assert.deepEqual(fitCurveThroughKnots([[3, 4]], 1), [[3, 4]]);
    });

    it('null and undefined knot arrays', function () {
      assert.deepEqual(fitCurveThroughKnots(null, 1), []);
      assert.deepEqual(fitCurveThroughKnots(undefined, 1), []);
    });

    it('non-finite coordinates are dropped', function () {
      var out = fitCurveThroughKnots([[0, 0], [NaN, 5], [10, 0]], 0.01);
      assert.equal(out[0][0], 0);
      assert.equal(out[out.length - 1][0], 10);
      out.forEach(function(p) {
        assert.ok(isFinite(p[0]) && isFinite(p[1]), 'output is finite');
      });
    });

    it('duplicate knots do not produce NaN', function () {
      var out = fitCurveThroughKnots(
        [[0, 0], [5, 5], [5, 5], [10, 0]], 0.01);
      assert.ok(out.length > 4);
      out.forEach(function(p) {
        assert.ok(isFinite(p[0]) && isFinite(p[1]), 'output is finite');
      });
    });

    it('all knots identical collapses to one point', function () {
      assert.deepEqual(
        fitCurveThroughKnots([[2, 2], [2, 2], [2, 2]], 1), [[2, 2]]);
    });

    it('zero tolerance returns the knots rather than diverging', function () {
      var knots = [[0, 0], [5, 5], [10, 0]];
      assert.deepEqual(fitCurveThroughKnots(knots, 0), knots);
    });
  });

  describe('interpolation', function () {
    it('two knots make a straight segment', function () {
      assert.deepEqual(
        fitCurveThroughKnots([[0, 0], [10, 20]], 0.001),
        [[0, 0], [10, 20]]);
    });

    it('curve passes through every knot', function () {
      var knots = [[0, 0], [10, 8], [22, 3], [30, 14], [41, 9]];
      var out = fitCurveThroughKnots(knots, 0.01);
      knots.forEach(function(k, i) {
        assert.ok(containsPoint(out, k, 1e-6), 'knot ' + i + ' is on the curve');
      });
    });

    it('endpoints are exactly the first and last knots', function () {
      var knots = [[1, 2], [10, 8], [22, 3]];
      var out = fitCurveThroughKnots(knots, 0.01);
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
      out = fitCurveThroughKnots(knots, 0.001);
      setCurveCurl(undefined);
      out.forEach(function(p) {
        var r = Math.hypot(p[0], p[1]);
        assert.ok(Math.abs(r - R) < 0.02, 'radius stays ' + R + ', got ' + r);
      });
    });

    it('knot order is preserved along the output', function () {
      var knots = [[0, 0], [10, 8], [22, 3], [30, 14]];
      var out = fitCurveThroughKnots(knots, 0.01);
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

    it('every interior knot is passed through smoothly', function () {
      // There is no way to ask for a sharp vertex, so a zigzag of knots comes
      // back rounded at each of them -- the fit is one run from end to end.
      var knots = [[0, 0], [10, 8], [20, 0], [30, 8], [40, 0]];
      var out = fitCurveThroughKnots(knots, 0.001);
      [1, 2, 3].forEach(function(k) {
        var i = out.findIndex(function(p) {
          return Math.abs(p[0] - knots[k][0]) < 1e-6 &&
            Math.abs(p[1] - knots[k][1]) < 1e-6;
        });
        assert.ok(i > 0, 'knot ' + k + ' is on the curve');
        assert.ok(turnAngleAt(out, i) < 10,
          'knot ' + k + ' barely turns: ' + turnAngleAt(out, i).toFixed(1));
      });
    });
  });

  describe('collinear knots', function () {
    it('stay on the line', function () {
      var knots = [[0, 0], [5, 0], [10, 0], [20, 0]];
      var out = fitCurveThroughKnots(knots, 0.001);
      out.forEach(function(p) {
        assert.ok(Math.abs(p[1]) < 1e-9, 'y stays 0, got ' + p[1]);
      });
    });

    it('unevenly spaced collinear knots stay on the line', function () {
      var knots = [[0, 0], [1, 0], [50, 0], [51, 0]];
      var out = fitCurveThroughKnots(knots, 0.001);
      out.forEach(function(p) {
        assert.ok(Math.abs(p[1]) < 1e-9, 'y stays 0, got ' + p[1]);
      });
    });

    it('x advances monotonically for collinear knots', function () {
      var knots = [[0, 0], [1, 0], [50, 0], [51, 0]];
      var out = fitCurveThroughKnots(knots, 0.001);
      for (var i = 1; i < out.length; i++) {
        assert.ok(out[i][0] >= out[i - 1][0] - 1e-9,
          'x does not go backward at ' + i);
      }
    });
  });

  describe('reversal', function () {
    // The label tool flips text to the other side of its path by reversing the
    // knots, which only puts the text on the same curve if the fit is
    // symmetric -- Hobby's curl conditions are the same at both ends, so it is.
    it('reversing the knots draws the same curve backwards', function () {
      [
        [[0, 0], [10, 8], [25, -4], [40, 6], [55, 0]],
        [[0, 0], [30, 30], [60, 0]],
        [[0, 0], [1, 1], [2, 0], [40, 0]]
      ].forEach(function (knots) {
        var out = fitCurveThroughKnots(knots, 0.001);
        var back = fitCurveThroughKnots(knots.concat().reverse(), 0.001).reverse();
        assert.equal(back.length, out.length);
        out.forEach(function (p, i) {
          assert.ok(Math.abs(p[0] - back[i][0]) < 1e-9 &&
            Math.abs(p[1] - back[i][1]) < 1e-9,
            'point ' + i + ': ' + p + ' vs ' + back[i]);
        });
      });
    });
  });

  describe('densification', function () {
    it('the flattened path stays within the tolerance of the true curve', function () {
      var knots = [[0, 0], [50, 40], [100, 0]];
      [1, 0.1, 0.01].forEach(function(tol) {
        var err = maxFlatteningError(knots, tol);
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
      assert.ok(fitCurveThroughKnots(knots, 0.05).length >
        fitCurveThroughKnots(knots, 5).length);
    });

    it('is deterministic', function () {
      var knots = [[0, 0], [10, 8], [22, 3], [30, 14]];
      assert.deepEqual(
        fitCurveThroughKnots(knots, 0.01),
        fitCurveThroughKnots(knots, 0.01));
    });

    it('a gentle curve costs fewer vertices than a tight one', function () {
      var gentle = fitCurveThroughKnots([[0, 0], [50, 2], [100, 0]], 0.01);
      var tight = fitCurveThroughKnots([[0, 0], [50, 60], [100, 0]], 0.01);
      assert.ok(gentle.length < tight.length,
        'gentle: ' + gentle.length + ', tight: ' + tight.length);
    });

    it('bounds output on a pathological tolerance', function () {
      var out = fitCurveThroughKnots([[0, 0], [1e6, 1e6], [2e6, 0]], 1e-12);
      assert.ok(out.length < 600, 'output is bounded, got ' + out.length);
    });
  });

  describe('hairpins and tight turns', function () {
    // An unlimited fit bows a long way outside the knots when they are placed
    // awkwardly -- it reached -2.9..3.9 on the hairpin below, where the knots
    // span 0..1. The handle limit holds it to about one gap past them, close
    // to what kappa-curves does (-0.97..1.97). What must not happen either way
    // is a cusp.

    it('rounds a hairpin without cusping', function () {
      var knots = [[0, 0], [10, 0], [10, 1], [0, 1]];
      var segs = getCurveSegments(knots);
      var out = fitCurveThroughKnots(knots, 0.001);
      assert.equal(segs.length, 3);
      // a cusp shows up as a near-reversal between consecutive output
      // segments; a smooth curve flattened this finely turns by a degree or two
      for (var i = 1; i < out.length - 1; i++) {
        assert.ok(turnAngleAt(out, i) < 15,
          'no cusp at ' + i + ': turns ' + turnAngleAt(out, i).toFixed(1));
      }
      out.forEach(function(p) {
        assert.ok(p[0] >= -0.5 && p[0] <= 10.5, 'x stays near the knots: ' + p[0]);
        assert.ok(p[1] >= -1.2 && p[1] <= 2.2, 'y bow is bounded: ' + p[1]);
      });
    });

    it('does not cusp when knots are bunched at one end', function () {
      // chords of 1, 1.1 and 38: the spacing that makes uniform Catmull-Rom
      // produce a cusp. The curve bows in y but must stay inside the knots'
      // x range and keep turning smoothly.
      var knots = [[0, 0], [1, 0], [2, 0.5], [40, 1]];
      var out = fitCurveThroughKnots(knots, 0.001);
      for (var i = 1; i < out.length - 1; i++) {
        assert.ok(turnAngleAt(out, i) < 15,
          'no cusp at ' + i + ': turns ' + turnAngleAt(out, i).toFixed(1));
      }
      out.forEach(function(p) {
        assert.ok(p[0] >= 0 && p[0] <= 40, 'no x overshoot: ' + p[0]);
      });
    });
  });

  describe('bulging', function () {
    // A hard turn followed by a much shorter segment is what an interactive
    // edit leaves behind half the time, and an unlimited Hobby fit answers it
    // with an arc several times the length of the short segment. These lock in
    // the two limits that hold that down, and -- just as importantly -- that
    // they do nothing to a path whose chords are of comparable length.

    // three knots: a long arm, then a short leg leaving at @deg from straight
    function armAndLeg(deg, len) {
      var rad = deg * Math.PI / 180;
      return [[0, 0], [300, 0],
        [300 + len * Math.cos(rad), len * Math.sin(rad)]];
    }

    // furthest the curve strays from the polyline the user drew
    function excursion(knots) {
      var worst = 0;
      getCurveSegments(knots).forEach(function(seg) {
        for (var i = 0; i <= 60; i++) {
          worst = Math.max(worst, maxDeviation(knots, bezierPoint(seg, i / 60)));
        }
      });
      return worst;
    }

    function diagonal(knots) {
      var x = knots.map(p => p[0]), y = knots.map(p => p[1]);
      return Math.hypot(Math.max.apply(null, x) - Math.min.apply(null, x),
        Math.max.apply(null, y) - Math.min.apply(null, y));
    }

    // longest control handle, as a fraction of the length the limit measures
    // it against -- the geometric mean of the segment's own chord and the
    // shorter of the two meeting at that knot
    function worstHandle(knots) {
      var segs = getCurveSegments(knots), dd = [], worst = 0, i;
      for (i = 1; i < knots.length; i++) {
        dd.push(Math.hypot(knots[i][0] - knots[i - 1][0],
          knots[i][1] - knots[i - 1][1]));
      }
      function scale(own, neighbor) {
        return Math.sqrt(own * Math.min(own, neighbor));
      }
      segs.forEach(function(seg, j) {
        var out = Math.hypot(seg.c1[0] - seg.p0[0], seg.c1[1] - seg.p0[1]);
        var arr = Math.hypot(seg.c2[0] - seg.p3[0], seg.c2[1] - seg.p3[1]);
        worst = Math.max(worst,
          out / scale(dd[j], j > 0 ? dd[j - 1] : Infinity),
          arr / scale(dd[j], j < segs.length - 1 ? dd[j + 1] : Infinity));
      });
      return worst;
    }

    // curvature at the very start or end of a cubic
    function endCurvature(seg, t) {
      var u = 1 - t;
      var dx = 3*(u*u*(seg.c1[0]-seg.p0[0]) + 2*u*t*(seg.c2[0]-seg.c1[0]) +
            t*t*(seg.p3[0]-seg.c2[0])),
          dy = 3*(u*u*(seg.c1[1]-seg.p0[1]) + 2*u*t*(seg.c2[1]-seg.c1[1]) +
            t*t*(seg.p3[1]-seg.c2[1])),
          ddx = 6*(u*(seg.c2[0]-2*seg.c1[0]+seg.p0[0]) +
            t*(seg.p3[0]-2*seg.c2[0]+seg.c1[0])),
          ddy = 6*(u*(seg.c2[1]-2*seg.c1[1]+seg.p0[1]) +
            t*(seg.p3[1]-2*seg.c2[1]+seg.c1[1]));
      var speed = Math.pow(dx*dx + dy*dy, 1.5);
      return speed === 0 ? 0 : (dx*ddy - dy*ddx) / speed;
    }

    it('a hard turn into a short leg does not throw a wide arc', function () {
      // the case that prompted the limits: a 372-unit arm, a 38-unit leg and a
      // 161 degree turn between them, which unlimited reached 6.7 leg-lengths
      // off the polyline
      var knots = [[397, 405], [397, 443], [275, 92]];
      assert.ok(excursion(knots) < 38 * 2,
        'stays within two leg lengths: ' + (excursion(knots) / 38).toFixed(2));
    });

    it('the bulge does not grow as the chords become lopsided', function () {
      // The point of the limits is that how far the curve strays depends on
      // how hard the path turns, not on how uneven the spacing happens to be
      // at the moment. Unlimited, the 150 degree row below ran from 28% to
      // 72% of the diagonal as the leg shortened.
      [30, 60, 90, 120, 150, 170].forEach(function(deg) {
        [300, 150, 60, 30, 15, 8].forEach(function(len) {
          var knots = armAndLeg(deg, len);
          var pct = excursion(knots) / diagonal(knots) * 100;
          assert.ok(pct < 30, deg + ' degrees, leg ' + len + ': strays ' +
            pct.toFixed(0) + '% of the diagonal');
        });
      });
    });

    it('the curve follows a dragged knot instead of lurching', function () {
      // Rotating the short leg a couple of degrees at a time: the curve must
      // not move much further than the knot does. Unlimited, it moved up to
      // 28 times as far, and a few pixels of drag threw a loop.
      [60, 30, 15].forEach(function(len) {
        var prev = null, prevKnot = null;
        for (var deg = 2; deg <= 178; deg += 2) {
          var knots = armAndLeg(deg, len);
          var pts = fitCurveThroughKnots(knots, 0.01);
          if (prev) {
            var moved = Math.hypot(knots[2][0] - prevKnot[0],
              knots[2][1] - prevKnot[1]);
            var jump = 0;
            pts.forEach(function(p) { jump = Math.max(jump, maxDeviation(prev, p)); });
            prev.forEach(function(p) { jump = Math.max(jump, maxDeviation(pts, p)); });
            assert.ok(jump < moved * 3, 'leg ' + len + ' at ' + deg +
              ' degrees: curve moved ' + jump.toFixed(1) + ', knot moved ' +
              moved.toFixed(1));
          }
          prev = pts;
          prevKnot = knots[2];
        }
      });
    });

    it('four points on a circle still give the circle back', function () {
      // The handle limit is set just above what a four-point circle asks for
      // (0.3905 of the chord), so this is what stops it being lowered to the
      // point where it flattens curves that were never misbehaving.
      var R = 100, knots = [], i;
      for (i = 0; i <= 4; i++) {
        knots.push([R * Math.cos(2 * Math.PI * i / 4),
                    R * Math.sin(2 * Math.PI * i / 4)]);
      }
      setCurveCurl(1);
      var out = fitCurveThroughKnots(knots, 0.001);
      var handle = worstHandle(knots);
      setCurveCurl(undefined);
      out.forEach(function(p) {
        var r = Math.hypot(p[0], p[1]);
        assert.ok(Math.abs(r - R) < 0.05, 'radius stays ' + R + ', got ' + r);
      });
      assert.ok(handle < 0.4, 'the limit is not reached: ' + handle.toFixed(4));
    });

    it('joins segments with a common tangent direction', function () {
      // Shortening a handle does not turn it, so the direction the curve
      // leaves a knot is the direction it arrived by, exactly. This is what
      // keeps the limit from putting a visible corner in a baseline.
      [
        [[62, 546], [99, 57], [82, 104]],
        [[397, 405], [397, 443], [275, 92]],
        [[0, 0], [10, 0], [10, 1], [0, 1]],
        [[0, 0], [100, 60], [220, 70], [320, 10], [430, 40]]
      ].forEach(function(knots, c) {
        var segs = getCurveSegments(knots);
        for (var i = 1; i < segs.length; i++) {
          var a = Math.atan2(segs[i-1].p3[1] - segs[i-1].c2[1],
            segs[i-1].p3[0] - segs[i-1].c2[0]);
          var b = Math.atan2(segs[i].c1[1] - segs[i].p0[1],
            segs[i].c1[0] - segs[i].p0[0]);
          assert.ok(Math.abs(wrap(b - a)) < 1e-12, 'path ' + c + ' knot ' + i +
            ': tangent turns by ' + (wrap(b - a) * 180 / Math.PI) + ' degrees');
        }
      });
      function wrap(x) {
        while (x > Math.PI) x -= 2 * Math.PI;
        while (x <= -Math.PI) x += 2 * Math.PI;
        return x;
      }
    });

    it('keeps curvature close across a lopsided knot', function () {
      // The limit is measured against the geometric mean of the two chords
      // rather than the shorter of them, so a long segment meeting a short one
      // keeps a handle in proportion. Against the shorter chord alone, the arm
      // ran nearly straight and hooked at the end, and curvature either side
      // of the knot differed by a factor of 14 on the first case below.
      [
        [[62, 546], [99, 57], [82, 104]],
        [[397, 405], [397, 443], [275, 92]],
        [[0, 0], [300, 0], [300 - 28, 10]],
        [[0, 0], [10, 0], [10, 1], [0, 1]]
      ].forEach(function(knots, c) {
        var segs = getCurveSegments(knots);
        for (var i = 1; i < segs.length; i++) {
          var a = Math.abs(endCurvature(segs[i - 1], 1));
          var b = Math.abs(endCurvature(segs[i], 0));
          if (!(a > 0 && b > 0)) continue;
          var ratio = Math.max(a, b) / Math.min(a, b);
          assert.ok(ratio < 2.5, 'path ' + c + ' knot ' + i +
            ': curvature differs by ' + ratio.toFixed(1) + 'x');
        }
      });
    });

    it('does not spend a long segment\'s shape at one end', function () {
      // A segment whose two handles are equal is a symmetric arc. This keeps
      // the arm of a lopsided pair recognisably arc-like rather than letting
      // it run straight and turn all at once.
      [
        [[62, 546], [99, 57], [82, 104]],
        [[397, 405], [397, 443], [275, 92]]
      ].forEach(function(knots, c) {
        getCurveSegments(knots).forEach(function(seg, i) {
          var out = Math.hypot(seg.c1[0] - seg.p0[0], seg.c1[1] - seg.p0[1]);
          var arr = Math.hypot(seg.c2[0] - seg.p3[0], seg.c2[1] - seg.p3[1]);
          var asym = Math.max(out, arr) / Math.min(out, arr);
          assert.ok(asym < 4, 'path ' + c + ' segment ' + i +
            ': handles are ' + asym.toFixed(1) + ':1');
        });
      });
    });

    it('leaves an evenly spaced path alone', function () {
      // On these the limit is slack, so the fit is Hobby's, unmodified.
      [
        [[0, 0], [100, 60], [220, 70], [320, 10], [430, 40]],
        [[0, 0], [100, 40], [200, 40], [300, 0]],
        [[0, 0], [120, -30], [260, -20], [380, -60]],
        [[0, 0], [10, 20]]
      ].forEach(function(knots, i) {
        assert.ok(worstHandle(knots) < 0.4,
          'path ' + i + ' is unclamped: ' + worstHandle(knots).toFixed(4));
      });
    });
  });

  describe('getCurveSegments()', function () {
    it('returns one cubic per knot interval', function () {
      assert.equal(getCurveSegments([[0, 0], [1, 1]]).length, 1);
      assert.equal(getCurveSegments([[0, 0], [1, 1], [2, 0]]).length, 2);
      assert.equal(getCurveSegments([[0, 0]]).length, 0);
      assert.equal(getCurveSegments([]).length, 0);
    });

    it('segments join end to end', function () {
      var segs = getCurveSegments([[0, 0], [10, 8], [22, 3]]);
      assert.deepEqual(segs[0].p3, segs[1].p0);
    });

    it('a two-knot curve is a straight cubic', function () {
      var seg = getCurveSegments([[0, 0], [30, 0]])[0];
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
      assert.equal(getCurveLength([]), 0);
      assert.equal(getCurveLength([[5, 5]]), 0);
      assert.equal(getCurveLength([[5, 5], [5, 5]]), 0);
    });

    it('a two-knot curve is exactly its chord', function () {
      assert.ok(Math.abs(getCurveLength([[0, 0], [30, 40]]) - 50) < 1e-6);
    });

    it('collinear knots measure their total span', function () {
      var len = getCurveLength([[0, 0], [10, 0], [25, 0], [40, 0]]);
      assert.ok(Math.abs(len - 40) < 1e-6, 'length: ' + len);
    });

    it('a curve is longer than the straight line between its ends', function () {
      var knots = [[0, 0], [50, 40], [100, 0]];
      var len = getCurveLength(knots);
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
        var exact = getCurveLength(knots);
        var approx = polylineLength(fitCurveThroughKnots(knots, 0.0005));
        assert.ok(Math.abs(exact - approx) / exact < 1e-3,
          'exact ' + exact + ' vs flattened ' + approx);
        // flattening cuts corners, so it can only come out short
        assert.ok(approx <= exact + 1e-9, 'flattened path is not longer');
      });
    });

    it('scales with the coordinates', function () {
      var knots = [[0, 0], [50, 40], [100, 0]];
      var big = knots.map(function (p) { return [p[0] * 1000, p[1] * 1000]; });
      var ratio = getCurveLength(big) / getCurveLength(knots);
      assert.ok(Math.abs(ratio - 1000) < 1e-6, 'ratio: ' + ratio);
    });
  });
});
