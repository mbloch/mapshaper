import { fitPencilStroke, selectStrokeKnots, PencilStrokeFitter } from '../src/curves/mapshaper-pencil-stroke';
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
    var a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    var b = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
    var d = Math.abs(b - a);
    if (d > Math.PI) d = 2 * Math.PI - d;
    max = Math.max(max, d);
  }
  return max * 180 / Math.PI;
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

describe('mapshaper-pencil-stroke.mjs', function () {

  describe('fitPencilStroke()', function () {
    it('starts at the first sample and ends at the last one', function () {
      var samples = wobblyWave({jitter: 1.5});
      var out = fitPencilStroke(samples);
      assert.deepEqual(out[0], samples[0]);
      assert.deepEqual(out[out.length - 1], samples[samples.length - 1]);
    });

    it('smooths out the jitter of a hand-held mouse', function () {
      var samples = wobblyWave({jitter: 1.5});
      var out = fitPencilStroke(samples);
      // the samples zigzag; the fitted curve bends gradually
      assert(maxTurn(samples) > 30);
      assert(maxTurn(out) < 12, 'max turn: ' + maxTurn(out));
    });

    it('stays close to the drawn path', function () {
      var samples = wobblyWave({jitter: 1.5});
      var out = fitPencilStroke(samples);
      samples.forEach(function(p) {
        assert(distToPolyline(p, out) < 5);
      });
    });

    it('adds vertices along bends that sparse samples leave angular', function () {
      // a fast stroke: samples 25px apart around bends a few samples long
      var samples = wobblyWave({samples: 24, spacing: 25, period: 8});
      var out = fitPencilStroke(samples);
      assert(out.length > samples.length * 2);
      assert(maxTurn(out) < maxTurn(samples) / 2);
    });

    it('keeps a straight stroke straight', function () {
      var samples = [];
      for (var i = 0; i <= 50; i++) samples.push([10 + i * 7, 100 + (i % 2)]);
      var out = fitPencilStroke(samples);
      out.forEach(function(p) {
        assert(p[1] > 99 && p[1] < 102, 'y: ' + p[1]);
      });
    });

    it('ignores repeated and non-finite samples', function () {
      var out = fitPencilStroke([[0, 0], [0, 0], [10, 0], [NaN, 5], [10, 0], [20, 0]]);
      assert.deepEqual(out[0], [0, 0]);
      assert.deepEqual(out[out.length - 1], [20, 0]);
      out.forEach(function(p) {
        assert(isFinite(p[0]) && isFinite(p[1]));
      });
    });

    it('returns short strokes unchanged', function () {
      assert.deepEqual(fitPencilStroke([]), []);
      assert.deepEqual(fitPencilStroke([[1, 2]]), [[1, 2]]);
      assert.deepEqual(fitPencilStroke([[1, 2], [1, 2], [5, 6]]), [[1, 2], [5, 6]]);
    });

    it('does not modify its input', function () {
      var samples = wobblyWave({jitter: 1.5});
      var copy = JSON.parse(JSON.stringify(samples));
      fitPencilStroke(samples);
      assert.deepEqual(samples, copy);
    });
  });

  describe('PencilStrokeFitter', function () {
    // Feeds @samples to a fitter, returning the vertices it placed before the
    // last sample, and the whole stroke
    function drawStroke(samples, opts) {
      var fitter = new PencilStrokeFitter(samples[0], opts);
      var out = [samples[0]], gaps = [];
      samples.slice(1).forEach(function(p) {
        out = out.concat(fitter.addSample(p));
        gaps.push(pathLength(fitter.getPendingSamples()));
      });
      var placed = out.length;
      out = out.concat(fitter.finish());
      return {placed: placed, out: out, gaps: gaps};
    }

    function pathLength(pts) {
      var len = 0;
      for (var i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      }
      return len;
    }

    it('places most of the stroke while it is drawn, and ends at the last sample', function () {
      var samples = wobblyWave({jitter: 1.5});
      var stroke = drawStroke(samples);
      assert(stroke.placed > stroke.out.length * 0.8);
      assert.deepEqual(stroke.out[0], samples[0]);
      assert.deepEqual(stroke.out[stroke.out.length - 1], samples[samples.length - 1]);
    });

    it('smooths the stroke about as closely as fitting it all at once', function () {
      var samples = wobblyWave({jitter: 1.5});
      var out = drawStroke(samples).out;
      assert(maxTurn(out) < maxTurn(samples) / 2, 'max turn: ' + maxTurn(out));
      samples.forEach(function(p) {
        assert(distToPolyline(p, out) < 6);
      });
      out.forEach(function(p) {
        assert(distToPolyline(p, fitPencilStroke(samples)) < 5);
      });
    });

    it('stays within maxGap of the pointer', function () {
      var samples = wobblyWave({jitter: 1.5});
      drawStroke(samples, {maxGap: 40}).gaps.forEach(function(gap) {
        assert(gap <= 40 + 25, 'gap: ' + gap); // plus up to one sample step
      });
    });

    it('places a straight stroke while it is drawn, and keeps it straight', function () {
      var samples = [];
      for (var i = 0; i <= 100; i++) samples.push([10 + i * 7, 100 + (i % 2)]);
      var stroke = drawStroke(samples);
      assert(stroke.placed > 5);
      stroke.gaps.forEach(function(gap) {
        assert(gap < 60 + 8, 'gap: ' + gap);
      });
      stroke.out.forEach(function(p) {
        assert(p[1] > 99 && p[1] < 102, 'y: ' + p[1]);
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
      var fitter = new PencilStrokeFitter([0, 0]);
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
      assert.deepEqual(new PencilStrokeFitter([3, 4]).finish(), []);
    });
  });

  describe('selectStrokeKnots()', function () {
    it('keeps far fewer knots than samples, including both ends', function () {
      var samples = wobblyWave({jitter: 1.5});
      var knots = selectStrokeKnots(samples, 8);
      assert(knots.length < samples.length / 2);
      assert.deepEqual(knots[0], samples[0]);
      assert.deepEqual(knots[knots.length - 1], samples[samples.length - 1]);
    });

    it('keeps fewer knots at a higher threshold', function () {
      var samples = wobblyWave({jitter: 1.5});
      assert(selectStrokeKnots(samples, 12).length < selectStrokeKnots(samples, 4).length);
    });
  });
});
