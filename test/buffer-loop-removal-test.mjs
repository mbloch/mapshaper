import assert from 'assert';
import api from '../mapshaper.js';
import { removeBufferRingLoops } from '../src/buffer/mapshaper-buffer-loop-removal';

// signed-area-free crossing check used to assert results are loop-free
function ringHasCrossing(ring) {
  var n = ring.length - 1;
  for (var i = 0; i < n; i++) {
    for (var j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent via closure
      if (segCross(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

function segCross(a, b, c, d) {
  var den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (den === 0) return false;
  var t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
  var u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}

function polygonArea(gj) {
  var a = 0;
  var feats = gj.features ||
    (gj.geometries ? gj.geometries.map(function(g) {return {geometry: g};}) :
      [{geometry: gj}]);
  feats.forEach(function(f) {
    var g = f.geometry || f;
    if (!g) return;
    var polys = g.type === 'MultiPolygon' ? g.coordinates :
      g.type === 'Polygon' ? [g.coordinates] : [];
    polys.forEach(function(poly) {
      poly.forEach(function(ring) {
        var s = 0;
        for (var i = 0; i < ring.length - 1; i++) {
          s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
        }
        a += Math.abs(s / 2);
      });
    });
  });
  return a;
}

describe('mapshaper-buffer-loop-removal.js', function () {

  describe('removeBufferRingLoops()', function () {
    it('leaves a clean convex ring unchanged', function () {
      var ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
      var out = removeBufferRingLoops(ring, 20);
      assert.deepEqual(out, ring);
    });

    it('returns short rings unchanged', function () {
      var ring = [[0, 0], [1, 0], [0, 0]];
      assert.strictEqual(removeBufferRingLoops(ring, 20), ring);
    });

    it('collapses an inward self-overlap pocket to its crossing point', function () {
      // CCW outer boundary with a bowtie pocket dipping into the interior off
      // the bottom edge; segments (6,0)->(3,3) and (7,3)->(4,0) cross at (5,1).
      var ring = [
        [0, 0], [6, 0], [3, 3], [7, 3], [4, 0],
        [10, 0], [10, 10], [0, 10], [0, 0]
      ];
      var out = removeBufferRingLoops(ring, 20);
      assert.ok(!ringHasCrossing(out), 'result should be free of self-crossings');
      // the two excursion vertices are replaced by the single crossing point
      assert.ok(out.length < ring.length);
      var hasCrossing = out.some(function(p) {
        return Math.abs(p[0] - 5) < 1e-9 && Math.abs(p[1] - 1) < 1e-9;
      });
      assert.ok(hasCrossing, 'crossing point (5,1) should be inserted');
      assert.ok(!out.some(function(p) { return p[0] === 3 && p[1] === 3; }),
        'excursion vertex (3,3) should be removed');
    });

    it('is robust to ring orientation (handles CW outer boundary)', function () {
      // same pocket on a CW ring (reversed); the outward-orientation test must
      // still classify the pocket as removable
      var ring = [
        [0, 0], [6, 0], [3, 3], [7, 3], [4, 0],
        [10, 0], [10, 10], [0, 10], [0, 0]
      ].slice().reverse();
      var out = removeBufferRingLoops(ring, 20);
      assert.ok(!ringHasCrossing(out));
      assert.ok(out.length < ring.length);
    });

    it('applies the source-turn gate when provenance is supplied', function () {
      // ring whose crossing (collapsed when ungated) spans source vertices 1..4
      var ring = [
        [0, 0], [6, 0], [3, 3], [7, 3], [4, 0],
        [10, 0], [10, 10], [0, 10], [0, 0]
      ];
      var srcPos = [0, 1, 2, 3, 4, 5, 6, 7, 0];
      // cumulative source turn: span 1..4 turns 40deg here, 400deg below
      var lowTurn = new Float64Array([0, 0, 10, 25, 40, 40, 40, 40]);
      var highTurn = new Float64Array([0, 0, 100, 250, 400, 400, 400, 400]);

      var collapsed = removeBufferRingLoops(ring, 20, srcPos, lowTurn, 150);
      assert.ok(collapsed.length < ring.length, 'low-turn span should collapse');
      assert.ok(!ringHasCrossing(collapsed));

      var kept = removeBufferRingLoops(ring, 20, srcPos, highTurn, 150);
      assert.deepEqual(kept, ring, 'high-turn span should be kept as a real loop');
    });

    it('never collapses a pocket that spans a cap (NaN position)', function () {
      var ring = [
        [0, 0], [6, 0], [3, 3], [7, 3], [4, 0],
        [10, 0], [10, 10], [0, 10], [0, 0]
      ];
      var srcPos = [0, 1, NaN, 3, 4, 5, 6, 7, 0];
      var turn = new Float64Array(8); // all zero -> would collapse if not for NaN
      var out = removeBufferRingLoops(ring, 20, srcPos, turn, 150);
      assert.deepEqual(out, ring);
    });

    it('keeps loops whose span exceeds the window', function () {
      // wider pocket: (6,0)->(3,3) crosses (7,3)->(4,0) three segments ahead
      var ring = [
        [0, 0], [6, 0], [3, 3], [5, 4], [7, 3], [4, 0],
        [10, 0], [10, 10], [0, 10], [0, 0]
      ];
      var kept = removeBufferRingLoops(ring, 2); // window too small to reach it
      assert.deepEqual(kept, ring);
      var removed = removeBufferRingLoops(ring, 20); // wide enough to reach it
      assert.ok(!ringHasCrossing(removed));
      assert.ok(removed.length < ring.length);
    });
  });

  describe('-buffer loop removal integration', function () {
    // a tight sawtooth buffered well past its tooth spacing folds heavily
    function sawtooth() {
      var coords = [];
      for (var i = 0; i <= 60; i++) {
        coords.push([i, i % 2 === 0 ? 0 : 1]);
      }
      return {type: 'LineString', coordinates: coords};
    }

    async function bufferArea(extra) {
      var out = await api.applyCommands(
        '-i line.json -buffer 5 tolerance=0 ' + extra + ' -o format=geojson out.json',
        {'line.json': sawtooth()});
      return polygonArea(JSON.parse(out['out.json']));
    }

    it('preserves dissolved area within tolerance (opt-in flag)', async function () {
      var on = await bufferArea('loop-removal');
      var off = await bufferArea('');
      var drift = Math.abs(on - off) / off;
      assert.ok(drift < 0.001,
        'area drift ' + (drift * 100).toFixed(4) + '% should be well under tolerance');
    });

    // The turn gate must not let loop removal fill real buffer holes: a
    // self-crossing line's hole count must match the un-optimized result.
    async function holeCount(extra) {
      var out = await api.applyCommands(
        '-i test/data/features/buffer/m_loops.json -buffer 1.7km tolerance=17m ' +
        extra + ' -o format=geojson out.json', {});
      var g = JSON.parse(out['out.json']).geometries[0];
      return g.coordinates.length - 1; // rings beyond the outer ring
    }

    it('keeps holes of a self-crossing line that loop removal could fill',
      async function () {
        var on = await holeCount('loop-removal');
        var off = await holeCount('');
        assert.equal(on, off, 'loop removal must not change hole count');
        assert.ok(on > 0, 'this fixture should produce holes');
      });
  });
});
