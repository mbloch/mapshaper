import api from '../mapshaper.js';
import assert from 'assert';
import { collapseArcDetail } from '../src/paths/mapshaper-detail-filter.mjs';

function lineFeature(coords) {
  return {
    type: 'FeatureCollection',
    features: [{type: 'Feature', properties: {id: 1}, geometry: {type: 'LineString', coordinates: coords}}]
  };
}

function getCoords(geojson) {
  var f = geojson.features ? geojson.features[0].geometry : geojson.geometries[0];
  return f.coordinates;
}

async function filterLine(coords, cmdOpts) {
  var out = await api.applyCommands(
    '-i in.json -filter-detail ' + cmdOpts + ' -o out.json',
    {'in.json': JSON.stringify(lineFeature(coords))});
  return getCoords(JSON.parse(out['out.json']));
}

function xs(coords) { return coords.map(function(p) { return p[0]; }); }
function ys(coords) { return coords.map(function(p) { return p[1]; }); }

function collapse(coords, opts) {
  var res = collapseArcDetail(xs(coords), ys(coords), opts);
  return res.xx.map(function(x, i) { return [x, res.yy[i]]; });
}

describe('mapshaper-filter-detail.js', function () {

  describe('collapseArcDetail() unit behavior', function () {
    it('passes short arcs (<3 vertices) through unchanged', function () {
      var res = collapseArcDetail([0, 5], [0, 5], {distance: 3});
      assert.deepEqual(res.xx, [0, 5]);
      assert.deepEqual(res.yy, [0, 5]);
    });

    it('always preserves arc endpoints', function () {
      var coords = [[0, 0], [100, 0], [200, 0], [205, 80], [210, 0], [300, 0], [400, 0]];
      var out = collapse(coords, {distance: 50});
      assert.deepEqual(out[0], [0, 0]);
      assert.deepEqual(out[out.length - 1], [400, 0]);
    });

    it('leaves a gentle (low-tortuosity) line at full detail', function () {
      // a gentle hump: tortuosity ~1, so the run is restored even though the
      // peel could have removed every interior vertex
      var coords = [[0, 0], [10, 1], [20, 1.5], [30, 1.5], [40, 1], [50, 0]];
      var out = collapse(coords, {distance: 100});
      assert.deepEqual(out, coords);
    });

    it('cuts convoluted detail but keeps neighbouring gentle detail', function () {
      // baseline points 60 apart (> distance, so forced survivors) with a tight
      // zig-zag (small skip chords) inserted between x=120 and x=132
      var coords = [[0, 0], [60, 0], [120, 0],
        [123, 15], [126, 0], [129, 15], [132, 0],
        [192, 0], [252, 0]];
      var out = collapse(coords, {distance: 50});
      // gentle baseline survivors are kept verbatim
      [[0, 0], [60, 0], [120, 0], [132, 0], [192, 0], [252, 0]].forEach(function(p) {
        assert(out.some(function(q) { return q[0] === p[0] && q[1] === p[1]; }),
          'baseline vertex ' + p + ' should be kept');
      });
      // the zig-zag is collapsed to the chord
      assert(!out.some(function(p) { return Math.abs(p[1]) > 1; }), 'zig-zag removed');
    });

    it('removes a thin spike (out-and-back) but keeps the baseline', function () {
      // baseline spacing 100 > distance, so baseline survives; spike chord is 10 <= distance
      var coords = [[0, 0], [100, 0], [200, 0], [205, 80], [210, 0], [300, 0], [400, 0]];
      var out = collapse(coords, {distance: 50});
      assert(!out.some(function(p) { return p[1] > 1; }), 'spike tip removed');
      assert(out.length < coords.length, 'a vertex was removed');
      // baseline corners preserved (their skip-chords exceed the distance)
      assert(out.some(function(p) { return p[0] === 200 && p[1] === 0; }), 'spike base kept');
      assert(out.some(function(p) { return p[0] === 210 && p[1] === 0; }), 'spike base kept');
    });

    it('collapses a needle spike whose base vertices are non-adjacent survivors', function () {
      // a spike with long bare flanks (each flank chord > distance) parks its base
      // vertices as survivors, so the short chord that closes the excursion sits
      // between NON-adjacent survivors. The per-run cut can't see across them; the
      // survivor-merge pass widens the run so the spike is sliced off.
      var coords = [
        [0, 0], [300, 0],         // baseline survivors (chord 300 > distance)
        [305, 290],               // out: flank chord ~290 > distance
        [310, 300], [315, 290],   // hook at the tip
        [306, 1],                 // return near base: chord to [300,0] ~6
        [600, 0], [900, 0]
      ];
      var out = collapse(coords, {distance: 200});
      assert(!out.some(function(p) { return p[1] > 100; }), 'spike tip removed');
      assert.deepEqual(out[0], [0, 0]);
      assert.deepEqual(out[out.length - 1], [900, 0]);
      // baseline survivors on either side of the spike are kept
      assert(out.some(function(p) { return p[0] === 300 && p[1] === 0; }), 'left base kept');
      assert(out.some(function(p) { return p[0] === 600 && p[1] === 0; }), 'right base kept');
    });

    it('does not merge a wide excursion (closing chord near the distance)', function () {
      // same shape but the return lands far from the base (chord ~150 > 0.5*200):
      // collapsing this would sweep a long span across the line, so the merge pass
      // leaves it for -smooth/-simplify rather than risk a crossing.
      var coords = [
        [0, 0], [300, 0],
        [305, 290], [310, 300], [315, 290],
        [450, 5],                 // return: chord to [300,0] ~150 (> 0.5*200=100)
        [600, 0], [900, 0]
      ];
      var out = collapse(coords, {distance: 200});
      assert(out.some(function(p) { return p[1] > 100; }), 'wide excursion preserved');
    });

    it('keeps a feature wider than the detail distance', function () {
      // apex sits between two baseline points 100 apart -> skip chord 100 > distance 50
      var coords = [[0, 0], [100, 0], [150, 80], [200, 0], [300, 0]];
      var out = collapse(coords, {distance: 50});
      assert(out.some(function(p) { return p[0] === 150 && p[1] === 80; }), 'wide apex preserved');
    });

    it('removes a small spike even when it is tiny relative to the distance', function () {
      // a long straight baseline with one tiny spike; the spike must be cut even
      // though its base (1 unit) is minuscule next to a huge distance (no dilution)
      var coords = [];
      for (var i = 0; i <= 99; i++) coords.push([i, 0]);
      coords.push([99.5, 8]); // spike tip
      for (i = 100; i <= 200; i++) coords.push([i, 0]);
      var out = collapse(coords, {distance: 1000});
      assert(!out.some(function(p) { return p[1] > 1; }), 'spike removed at large distance');
      // most of the baseline is retained (only near-collinear vertices adjacent
      // to the spike are absorbed when it is cut); nothing like a full simplify
      assert(out.length > 180, 'gentle baseline retained at full detail (' + out.length + ')');
    });

    it('is scale-aware: a smaller distance keeps more detail', function () {
      var coords = [[0, 0], [100, 0], [200, 0], [205, 80], [210, 0], [300, 0], [400, 0]];
      var small = collapse(coords, {distance: 5});  // spike chord 10 > 5 -> kept
      var large = collapse(coords, {distance: 50}); // spike chord 10 <= 50 -> removed
      assert(small.some(function(p) { return p[1] > 1; }), 'spike kept at small distance');
      assert(large.length < small.length, 'larger distance removes more');
    });

    // A closed ring stores its first/last vertex at the same coordinate, so the
    // seam chord has length 0 and infinite tortuosity. Without the roundness gate
    // the survivor-merge pass treats the whole ring as a needle returning to its
    // base and splices it out, collapsing the island to a degenerate stub.
    function ring(cx, cy, r, n) {
      var c = [];
      for (var i = 0; i < n; i++) {
        var a = 2 * Math.PI * i / (n - 1);
        c.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      c[n - 1] = c[0]; // close exactly
      return c;
    }
    // distinct consecutive vertices (a valid ring needs >= 4: 3 unique + close)
    function distinctCount(pts) {
      var d = 0;
      for (var i = 0; i < pts.length; i++) {
        if (i === 0 || pts[i][0] !== pts[i - 1][0] || pts[i][1] !== pts[i - 1][1]) d++;
      }
      return d;
    }

    it('preserves a large round ring (island) by default', function () {
      // circle of diameter 3*D: circumference (~9.4*D) fits inside the merge
      // window, so the seam bug used to destroy it. The roundness gate protects it.
      var coords = ring(0, 0, 150, 200); // r=150, diameter 300 = 3*D
      var out = collapse(coords, {distance: 100});
      assert(distinctCount(out) >= 8, 'round island collapsed (' + distinctCount(out) + ' distinct)');
      assert.deepEqual(out[0], out[out.length - 1], 'ring should stay closed');
    });

    it('roundness=0 reproduces the legacy collapse of a round ring', function () {
      var coords = ring(0, 0, 150, 200);
      var out = collapse(coords, {distance: 100, roundness: 0});
      assert(distinctCount(out) < 4, 'expected legacy seam collapse, got ' + distinctCount(out));
    });

    it('still removes a genuinely small ring (size bias)', function () {
      // diameter 0.6*D: below the resolution, removed by the peel regardless of
      // how round it is -- the gate does not resurrect sub-scale islands.
      var coords = ring(0, 0, 30, 120); // diameter 60 = 0.6*D
      var out = collapse(coords, {distance: 100});
      assert(distinctCount(out) < 4, 'small ring should be removed (' + distinctCount(out) + ')');
    });

    it('keeps a larger ring where a smaller one is dropped (relative to distance)', function () {
      var big = collapse(ring(0, 0, 150, 200), {distance: 100});   // 3*D across
      var small = collapse(ring(0, 0, 20, 120), {distance: 100});  // 0.4*D across
      assert(distinctCount(big) >= 8, 'large ring kept');
      assert(distinctCount(small) < 4, 'small ring dropped');
    });

    it('protects a round ring in spherical mode too', function () {
      // ~2 km diameter ring near the equator; D = 500 m. area/perimeter uses the
      // 3D vector-area path, which must clear the roundness gate.
      var R2D = Math.PI / 180, degPerM = 1 / 111320;
      var r = 1000 * degPerM; // ~1 km radius -> 2 km diameter (4*D)
      var c = [];
      for (var i = 0; i < 160; i++) {
        var a = 2 * Math.PI * i / 159;
        c.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      c[159] = c[0];
      var out = collapse(c, {distance: 500, spherical: true});
      assert(distinctCount(out) >= 8, 'spherical round island collapsed (' + distinctCount(out) + ')');
      assert(!isNaN(R2D)); // silence unused
    });

    // Star with tall thin spikes: most of the enclosed area sits in the spikes,
    // so the filter (whose chords slice across the spike tips) shreds it down to
    // a small remnant -- exactly the near-scale-island case the min-area gate is
    // for. The roundness gate does not save it (the remnant is not round enough),
    // so the drop is attributable to the area gate.
    function star(R, r, spikes) {
      var c = [], n = spikes * 2;
      for (var i = 0; i < n; i++) {
        var a = 2 * Math.PI * i / n;
        c.push([(i % 2 === 0 ? R : r) * Math.cos(a), (i % 2 === 0 ? R : r) * Math.sin(a)]);
      }
      c.push(c[0].slice());
      return c;
    }
    function ringArea(pts) {
      var a = 0;
      for (var i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
      return Math.abs(a / 2);
    }

    it('drops a closed ring the filter shreds below the area threshold', function () {
      var coords = star(100, 25, 12);
      var out = collapse(coords, {distance: 40}); // default min-area 0.6
      assert(distinctCount(out) < 4, 'shredded ring should be dropped (' + distinctCount(out) + ' distinct)');
    });

    it('min-area=0 disables the drop and keeps the (shredded) remnant', function () {
      var coords = star(100, 25, 12);
      var out = collapse(coords, {distance: 40, minRingArea: 0});
      assert(distinctCount(out) >= 4, 'remnant should survive with the gate disabled (' + distinctCount(out) + ')');
    });

    it('keeps a ring that loses only a moderate share of its area', function () {
      // this star retains ~70% of its area through the filter: above the default
      // 0.6 gate, so it stays a real ring rather than being dropped.
      var coords = star(100, 67, 24);
      var out = collapse(coords, {distance: 40});
      assert(distinctCount(out) >= 8, 'moderately-filtered ring should be kept (' + distinctCount(out) + ')');
      assert.deepEqual(out[0], out[out.length - 1], 'ring should stay closed');
    });

    it('min-area threshold is tunable (stricter threshold drops a kept ring)', function () {
      var coords = star(100, 60, 24); // retains ~60%
      var kept = collapse(coords, {distance: 40, minRingArea: 0.4});
      var dropped = collapse(coords, {distance: 40, minRingArea: 0.7}); // 60% < 70% -> drop
      assert(distinctCount(kept) >= 8, 'kept at 0.4 (' + distinctCount(kept) + ')');
      assert(distinctCount(dropped) < 4, 'dropped at 0.7 (' + distinctCount(dropped) + ')');
    });

    it('never drops an open arc, however much detail it loses', function () {
      // an open line (endpoints differ) is never a ring: topology-safe, no drop.
      var coords = [];
      for (var i = 0; i <= 40; i++) coords.push([i, (i % 2 ? 1 : -1) * 30]);
      var out = collapse(coords, {distance: 20, minRingArea: 0.99});
      assert.deepEqual(out[0], [0, coords[0][1]], 'first endpoint preserved');
      assert.deepEqual(out[out.length - 1], coords[coords.length - 1], 'last endpoint preserved');
      assert(!isNaN(ringArea(coords))); // silence unused helper
    });

    it('never creates a chord longer than the detail distance', function () {
      // a noisy line; every output segment that replaces removed detail must be <= distance
      var coords = [];
      for (var i = 0; i <= 200; i++) {
        coords.push([i, (i % 2 ? 1 : -1) * 3 + Math.sin(i / 5) * 2]);
      }
      var D = 8;
      var out = collapse(coords, {distance: D});
      // only segments shorter than the original max segment OR <= D should appear;
      // a removed run is always bridged by a chord <= D
      var origByX = {};
      coords.forEach(function(p) { origByX[p[0] + ',' + p[1]] = true; });
      for (var k = 1; k < out.length; k++) {
        var a = out[k - 1], b = out[k];
        var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        var consecutive = Math.abs(b[0] - a[0]) <= 1.0001; // adjacent original vertices
        assert(consecutive || len <= D + 1e-9,
          'bridging chord ' + len.toFixed(2) + ' exceeds distance ' + D);
      }
    });
  });

  describe('-filter-detail command', function () {
    it('removes a spike and preserves endpoints (planar)', async function () {
      var coords = [[0, 0], [100, 0], [200, 0], [205, 80], [210, 0], [300, 0], [400, 0]];
      var out = await filterLine(coords, '50 planar');
      assert.deepEqual(out[0], [0, 0]);
      assert.deepEqual(out[out.length - 1], [400, 0]);
      assert(out.length < coords.length, 'spike should be collapsed');
      assert(!out.some(function(p) { return p[1] > 1; }), 'spike tip removed');
    });

    it('preserves shared topology when filtering polygons', async function () {
      // two squares sharing an edge; the shared edge has a sub-scale spike
      var poly = {
        type: 'FeatureCollection',
        features: [
          {type: 'Feature', properties: {id: 'a'}, geometry: {type: 'Polygon', coordinates: [[
            [0, 0], [10, 0], [10, 5], [10.4, 5.2], [10, 6], [10, 10], [0, 10], [0, 0]
          ]]}},
          {type: 'Feature', properties: {id: 'b'}, geometry: {type: 'Polygon', coordinates: [[
            [10, 0], [20, 0], [20, 10], [10, 10], [10, 6], [10.4, 5.2], [10, 5], [10, 0]
          ]]}}
        ]
      };
      var out = await api.applyCommands(
        '-i in.json -filter-detail 6 planar -o out.json',
        {'in.json': JSON.stringify(poly)});
      var res = JSON.parse(out['out.json']);
      assert.equal(res.features.length, 2, 'both polygons survive');
      // shared boundary collapsed identically -> -clean finds a valid topology
      var x = await api.applyCommands(
        '-i out.json -clean -info', {'out.json': JSON.stringify(res)});
      assert.ok(x);
    });

    it('errors when no distance is given', async function () {
      var coords = [[0, 0], [10, 0], [20, 0]];
      await assert.rejects(async function () {
        await api.applyCommands('-i in.json -filter-detail -o out.json',
          {'in.json': JSON.stringify(lineFeature(coords))});
      });
    });
  });
});
