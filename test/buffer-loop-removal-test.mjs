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

    async function mLoopsDebugPointCount(extra) {
      var out = await api.applyCommands(
        '-i test/data/features/buffer/m_loops.json ' +
        '-buffer 1.5km tolerance=0 debug-offset ' + extra +
        ' -o format=geojson out.json', {});
      return JSON.parse(out['out.json']).geometries[0].coordinates[0].length;
    }

    it('preserves dissolved area within tolerance (on by default)', async function () {
      var on = await bufferArea('');
      var off = await bufferArea('no-loop-removal');
      var drift = Math.abs(on - off) / off;
      assert.ok(drift < 0.001,
        'area drift ' + (drift * 100).toFixed(4) + '% should be well under tolerance');
    });

    it('removes conservative-turn loops before the m_loops dissolve', async function () {
      var raw = await mLoopsDebugPointCount('no-loop-removal');
      var optimized = await mLoopsDebugPointCount('');
      assert.ok(raw - optimized > 350,
        'loop removal should cut many raw offset vertices, got ' +
        raw + ' -> ' + optimized);
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
        var on = await holeCount('');
        var off = await holeCount('no-loop-removal');
        assert.equal(on, off, 'loop removal must not change hole count');
        assert.ok(on > 0, 'this fixture should produce holes');
      });
  });

  // Regression: at large radius the two-sided outline can self-cross with an
  // overshoot loop wider than BUFFER_LOOP_WINDOW. The removed crossing-direction
  // remover collapsed a nearer same-wound crossing that was actually exterior
  // boundary (~1.7% area loss vs QGIS); the default dip+coverage remover keeps
  // the lobe.
  describe('Greenland Mercator line (exterior lobe regression)', function () {
    var file = 'test/data/features/buffer/greenland_merc_line_error.fgb';
    var refFile =
      'test/data/features/buffer/greenland_merc_line_error_correct_buffer.fgb';

    it('30km dissolved buffer matches reference area', async function () {
      var out = await api.applyCommands(
        '-i ' + file + ' -buffer 30000 -o format=geojson out.json');
      var refOut = await api.applyCommands(
        '-i ' + refFile + ' -o format=geojson ref.json');
      var area = polygonArea(JSON.parse(String(out['out.json'])));
      var refArea = polygonArea(JSON.parse(String(refOut['ref.json'])));
      var drift = Math.abs(area - refArea) / refArea;
      assert.ok(drift < 1e-9,
        'buffer area should match reference (drift ' + drift + ')');
    });
  });

  // Regression for the default multi-pass dip+coverage remover (now the default
  // for two-sided line/ring buffers and clean-outline polygon grows). Two
  // properties it must uphold together:
  //  1. Strip every self-overlap loop from a real border line. Removing the
  //     source-turn cap on the coverage path lets it collapse tight interior
  //     hairpins whose source turn exceeded the cap (~11 were left as
  //     self-intersections on this NE/SD segment before the fix).
  //  2. Keep real buffer holes. The coverage check only guards against
  //     UNCOVERING area, so it is blind to a collapse that FILLS a winding-0 hole;
  //     the opposite-wound hole protection and the disk-relative hole-fill guard
  //     keep holes a naive coverage collapse would swallow.
  describe('default remover: strips self-overlaps, keeps holes', function () {
    function countCrossings(gj) {
      var geoms = gj.geometries ||
        (gj.features ? gj.features.map(function (f) { return f.geometry; }) : [gj]);
      var count = 0;
      geoms.forEach(function (g) {
        if (!g) return;
        var polys = g.type === 'MultiPolygon' ? g.coordinates :
          g.type === 'Polygon' ? [g.coordinates] : [];
        polys.forEach(function (poly) {
          poly.forEach(function (ring) {
            var n = ring.length - 1;
            for (var i = 0; i < n; i++) {
              for (var j = i + 2; j < n; j++) {
                if (i === 0 && j === n - 1) continue;
                if (segCross(ring[i], ring[i + 1], ring[j], ring[j + 1])) count++;
              }
            }
          });
        });
      });
      return count;
    }
    async function debugOffset(file, flag) {
      var out = await api.applyCommands('-i ' + file + ' -buffer 10km debug-offset ' +
        (flag || '') + ' -o format=geojson out.json');
      return JSON.parse(String(out['out.json']));
    }

    it('leaves no self-intersections in the border debug-offset', async function () {
      var file = 'test/data/features/buffer/x_ne_sd_border.json';
      var raw = countCrossings(await debugOffset(file, 'no-loop-removal'));
      var def = countCrossings(await debugOffset(file));
      assert.ok(raw > 100,
        'raw construction should have many self-overlaps (got ' + raw + ')');
      assert.equal(def, 0,
        'default remover should strip every self-overlap loop (' + def + ' left)');
    });

    it('keeps a real hole a small collapse would fill (m_loops 650m)', async function () {
      function holes(gj) { return gj.geometries[0].coordinates.length - 1; }
      var f = 'test/data/features/buffer/m_loops.json';
      var def = JSON.parse(String((await api.applyCommands(
        '-i ' + f + ' -buffer 650m -o format=geojson out.json'))['out.json']));
      var nlr = JSON.parse(String((await api.applyCommands(
        '-i ' + f + ' -buffer 650m no-loop-removal -o format=geojson out.json'))['out.json']));
      assert.ok(holes(nlr) >= 3, 'fixture should have real holes');
      assert.equal(holes(def), holes(nlr),
        'default must keep every real hole (' + holes(def) + ' vs ' + holes(nlr) + ')');
    });
  });
});
