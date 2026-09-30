import { GaussianStrokeFitter, BendDecimator } from '../src/curves/mapshaper-pencil-gaussian';
import assert from 'assert';

// Samples a stroke along a sine wave the way a mouse reports it: whole pixels,
// with a deterministic wobble standing in for an unsteady hand.
function wobblyWave(opts) {
  var pts = [];
  var n = opts.samples || 80;
  for (var i = 0; i < n; i++) {
    var x = 20 + i * (opts.spacing || 10);
    var y = 150 - (opts.amplitude || 60) * Math.sin(2 * Math.PI * i / (opts.period || 40));
    var dx = (opts.jitter || 0) * Math.sin(i * 2.3);
    var dy = (opts.jitter || 0) * Math.cos(i * 3.7);
    pts.push([Math.round(x + dx), Math.round(y + dy)]);
  }
  return pts;
}

// largest change of direction between consecutive segments, in degrees
function maxTurn(pts) {
  var max = 0;
  for (var i = 1; i < pts.length - 1; i++) {
    max = Math.max(max, turnAt(pts, i));
  }
  return max;
}

function turnAt(pts, i) {
  var a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
  var b = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
  var d = Math.abs(b - a);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d * 180 / Math.PI;
}

function distToPolyline(p, pts) {
  var best = Infinity;
  for (var i = 1; i < pts.length; i++) {
    var a = pts[i - 1], b = pts[i];
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var len2 = dx * dx + dy * dy;
    var t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return best;
}

// Feeds @samples to a fitter, returning the whole stroke, the number of its
// vertices placed before the last sample, the number placed by each sample,
// and the preview after each sample
function drawStroke(samples, opts) {
  var fitter = new GaussianStrokeFitter(samples[0], opts);
  var out = [samples[0]], counts = [], previews = [];
  samples.slice(1).forEach(function(p) {
    var placed = fitter.addSample(p);
    out = out.concat(placed);
    counts.push(placed.length);
    previews.push({last: out[out.length - 1], pointer: p, points: fitter.getPreview()});
  });
  var placed = out.length;
  out = out.concat(fitter.finish());
  return {out: out, placed: placed, counts: counts, previews: previews};
}

describe('mapshaper-pencil-gaussian.mjs', function () {

  describe('GaussianStrokeFitter', function () {
    it('places most of the stroke while it is drawn, and ends at the last sample', function () {
      var samples = wobblyWave({jitter: 1.5});
      var stroke = drawStroke(samples);
      assert(stroke.placed > stroke.out.length * 0.8);
      assert.deepEqual(stroke.out[stroke.out.length - 1], samples[samples.length - 1]);
    });

    it('places vertices a few at a time, not in bursts', function () {
      var stroke = drawStroke(wobblyWave({jitter: 1.5}));
      assert(Math.max.apply(null, stroke.counts) <= 2, 'counts: ' + stroke.counts);
    });

    it('smooths out the jitter of a hand-held mouse', function () {
      var samples = wobblyWave({jitter: 1.5});
      var out = drawStroke(samples).out;
      assert(maxTurn(samples) > 30);
      // the last vertex is the pointer's, not a smoothed one
      assert(maxTurn(out.slice(0, -1)) < 20, 'max turn: ' + maxTurn(out));
    });

    it('stays close to the drawn path', function () {
      var samples = wobblyWave({jitter: 1.5});
      var out = drawStroke(samples).out;
      samples.forEach(function(p) {
        assert(distToPolyline(p, out) < 5);
      });
    });

    it('rounds the bends of a fast stroke', function () {
      // samples 25px apart around bends a few samples long
      var samples = wobblyWave({samples: 24, spacing: 25, period: 8});
      var out = drawStroke(samples).out;
      assert(out.length > samples.length * 2);
      assert(maxTurn(out.slice(0, -1)) < maxTurn(samples) / 2);
    });

    it('keeps a straight stroke straight, with few vertices', function () {
      var samples = [];
      for (var i = 0; i <= 100; i++) samples.push([10 + i * 7, 100 + (i % 2)]);
      var out = drawStroke(samples).out;
      assert(out.length < 20, 'vertices: ' + out.length); // 700px long
      out.forEach(function(p) {
        assert(p[1] >= 99.5 && p[1] <= 101, 'y: ' + p[1]);
      });
    });

    it('places fewer vertices at a larger bend angle', function () {
      var samples = wobblyWave({jitter: 1.5});
      var a = drawStroke(samples, {bendAngle: 8}).out;
      var b = drawStroke(samples, {bendAngle: 16}).out;
      assert(b.length < a.length * 0.75, a.length + ' ' + b.length);
    });

    it('previews the unplaced part of the stroke with the pointer samples', function () {
      var samples = wobblyWave({jitter: 1.5});
      drawStroke(samples).previews.forEach(function(preview) {
        var pts = [preview.last].concat(preview.points, [preview.pointer]);
        for (var i = 1; i < pts.length; i++) {
          // runs from the last placed vertex to the pointer, without doubling back
          assert(pts[i][0] > pts[i - 1][0], JSON.stringify(pts));
        }
        // the gap is about a smoothing window wide
        assert(preview.pointer[0] - preview.last[0] < 60);
      });
    });

    it('scales its distances by pixelSize', function () {
      var samples = wobblyWave({jitter: 1.5});
      var scaled = samples.map(function(p) { return [p[0] / 100, p[1] / 100]; });
      var a = drawStroke(samples).out;
      var b = drawStroke(scaled, {pixelSize: 0.01}).out;
      assert.equal(a.length, b.length);
      a.forEach(function(p, i) {
        assert(Math.hypot(p[0] / 100 - b[i][0], p[1] / 100 - b[i][1]) < 1e-9);
      });
    });

    it('ignores repeated and non-finite samples', function () {
      var fitter = new GaussianStrokeFitter([0, 0]);
      [[0, 0], [NaN, 3], [10, 0], [10, 0], [20, 1]].forEach(function(p) {
        fitter.addSample(p);
      });
      var out = fitter.finish();
      assert.deepEqual(out[out.length - 1], [20, 1]);
      out.forEach(function(p) {
        assert(isFinite(p[0]) && isFinite(p[1]));
      });
    });

    it('finishes a stroke with no samples with no vertices', function () {
      assert.deepEqual(new GaussianStrokeFitter([3, 4]).finish(), []);
    });
  });

  describe('BendDecimator', function () {
    function decimate(pts, bendAngle, maxDeviation) {
      var d = new BendDecimator(pts[0], bendAngle * Math.PI / 180, maxDeviation);
      return pts.slice(1).map(function(p) { return d.push(p); }).filter(Boolean);
    }

    it('keeps a point each time a tight curve turns by the bend angle', function () {
      var pts = [];
      for (var a = 0; a <= 180; a++) {
        pts.push([10 * Math.cos(a * Math.PI / 180), 10 * Math.sin(a * Math.PI / 180)]);
      }
      var kept = decimate(pts, 12, 100);
      assert(kept.length >= 14 && kept.length <= 15, 'kept: ' + kept.length);
    });

    it('keeps more points along a wide curve, to stay near it', function () {
      var pts = [];
      for (var a = 0; a <= 180; a++) {
        pts.push([1000 * Math.cos(a * Math.PI / 180), 1000 * Math.sin(a * Math.PI / 180)]);
      }
      var kept = [pts[0]].concat(decimate(pts, 12, 1), [pts[180]]);
      assert(kept.length > 30);
      for (var i = 0; i <= 180; i++) {
        assert(distToPolyline(pts[i], kept) < 1.5);
      }
    });

    it('keeps no points along a straight line', function () {
      var pts = [];
      for (var i = 0; i < 100; i++) pts.push([i, 2 * i]);
      assert.deepEqual(decimate(pts, 12, 1), []);
    });
  });
});
