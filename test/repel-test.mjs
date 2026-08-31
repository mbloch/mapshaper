import assert from 'assert';
import api from '../mapshaper.js';
import {
  resolveSymbolCollisions,
  countSymbolCollisions,
  symbolCollisionDefaults,
  VISIBLE_COLLISION
} from '../src/points/mapshaper-symbol-collisions';

// Build solver nodes from [x, y, r] triples. Every node gets a shift limit of
// @maxShift, unless it supplies its own as a fourth element. A fifth element is
// the node's margin; nodes that omit it have no margin property at all, which
// the solver should read as a margin of 0.
function makeNodes(arr, maxShift) {
  if (maxShift === undefined) maxShift = symbolCollisionDefaults.max_shift;
  return arr.map(function(d, i) {
    var node = {i: i, x: d[0], y: d[1], x0: d[0], y0: d[1], r: d[2],
      maxShift: d.length > 3 ? d[3] : maxShift};
    if (d.length > 4) node.margin = d[4];
    return node;
  });
}

// Deterministic stand-in for Math.random(), so that a failing layout can be
// reproduced from its trial number
function pseudoRandom(i, seed) {
  return ((Math.imul(i + 1, 2654435761) ^ Math.imul(seed + 1, 1597334677)) >>> 0) / 4294967296;
}

// What countSymbolCollisions() should return, found exhaustively
function countCollisionsBruteForce(nodes) {
  var count = 0, a, b, sum, dist, i, j;
  for (i=0; i<nodes.length; i++) {
    for (j=i+1; j<nodes.length; j++) {
      a = nodes[i];
      b = nodes[j];
      sum = a.r + b.r + Math.max(a.margin || 0, b.margin || 0);
      if (sum <= 0) continue; // margins cancel the pair's radii: no constraint
      dist = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
      if (sum - dist > VISIBLE_COLLISION) count++;
    }
  }
  return count;
}

function solverOpts(opts) {
  return Object.assign({}, symbolCollisionDefaults, opts || {});
}

function shift(node) {
  return Math.sqrt(Math.pow(node.x - node.x0, 2) + Math.pow(node.y - node.y0, 2));
}

// Coordinates outside the lat-long range import with an unknown CRS, which
// -repel accepts (only a known geographic CRS is rejected). Test layers below
// span 1000 units, so a width=1000 option makes the display scale exactly
// 1px per unit and pixel assertions can be exact.
function pointsGeoJSON(coords, props) {
  return {
    type: 'FeatureCollection',
    features: coords.map(function(p, i) {
      return {
        type: 'Feature',
        properties: Object.assign({id: i}, props ? props[i] : null),
        geometry: {type: 'Point', coordinates: p}
      };
    })
  };
}

// Rectangles as a polygon layer, given as [xmin, ymin, xmax, ymax]
function rectsGeoJSON(rects) {
  return {
    type: 'FeatureCollection',
    features: rects.map(function(r, i) {
      return {
        type: 'Feature',
        properties: {id: i},
        geometry: {type: 'Polygon', coordinates: [[
          [r[0], r[1]], [r[0], r[3]], [r[2], r[3]], [r[2], r[1]], [r[0], r[1]]
        ]]}
      };
    })
  };
}

function getCoords(buf) {
  return JSON.parse(buf).features.map(function(f) {
    return f.geometry.coordinates;
  });
}

// Overlapping pairs among equal-radius symbols, measured in pixels
function countOverlaps(coords, r, scale) {
  var count = 0;
  for (var i=0; i<coords.length; i++) {
    for (var j=i+1; j<coords.length; j++) {
      var dx = (coords[j][0] - coords[i][0]) * scale;
      var dy = (coords[j][1] - coords[i][1]) * scale;
      if (Math.sqrt(dx * dx + dy * dy) < r * 2 - 0.01) count++;
    }
  }
  return count;
}

describe('mapshaper-repel.js', function () {

  describe('collision solver', function () {

    it('separates two overlapping circles', function () {
      var nodes = makeNodes([[0, 0, 10], [8, 0, 10]], 100);
      assert.equal(countSymbolCollisions(nodes), 1);
      resolveSymbolCollisions(nodes, solverOpts());
      assert.equal(countSymbolCollisions(nodes), 0);
    });

    it('leaves non-overlapping circles untouched', function () {
      var nodes = makeNodes([[0, 0, 5], [100, 0, 5], [0, 100, 5]]);
      var moved = resolveSymbolCollisions(nodes, solverOpts());
      assert.equal(moved, 0);
      nodes.forEach(function(node) {
        assert.strictEqual(node.x, node.x0);
        assert.strictEqual(node.y, node.y0);
      });
    });

    it('never displaces a node farther than max-shift', function () {
      // A tight cluster that cannot possibly separate within the limit
      var arr = [];
      for (var i=0; i<40; i++) {
        arr.push([i % 5, Math.floor(i / 5), 12]);
      }
      var nodes = makeNodes(arr, 6);
      resolveSymbolCollisions(nodes, solverOpts());
      nodes.forEach(function(node) {
        // Allow for floating point error at the boundary
        assert.ok(shift(node) <= 6 + 1e-9, 'shift was ' + shift(node));
      });
    });

    it('moves larger circles less than smaller ones', function () {
      var nodes = makeNodes([[0, 0, 30], [10, 0, 5]], 100);
      resolveSymbolCollisions(nodes, solverOpts());
      var big = nodes.filter(function(n) {return n.r == 30;})[0];
      var small = nodes.filter(function(n) {return n.r == 5;})[0];
      assert.ok(shift(small) > shift(big) * 5,
        'expected the small circle to move much farther');
    });

    it('separates coincident circles deterministically', function () {
      function run() {
        var nodes = makeNodes([[0, 0, 10], [0, 0, 10], [0, 0, 10]], 100);
        resolveSymbolCollisions(nodes, solverOpts());
        return nodes.map(function(n) {return [n.i, n.x, n.y];});
      }
      var a = run();
      assert.deepEqual(a, run());
      assert.deepEqual(a, run()); // no state accumulates between runs
      a.forEach(function(d) {
        assert.ok(d[1] !== 0 || d[2] !== 0, 'coincident circles should separate');
      });
    });

    it('is a no-op when max-shift is 0', function () {
      var nodes = makeNodes([[0, 0, 10], [1, 0, 10]], 0);
      assert.equal(resolveSymbolCollisions(nodes, solverOpts()), 0);
    });

    it('is a no-op for a single node', function () {
      var nodes = makeNodes([[0, 0, 10]]);
      assert.equal(resolveSymbolCollisions(nodes, solverOpts()), 0);
    });

    it('countSymbolCollisions() ignores overlaps too shallow to see', function () {
      // Symbols left touching, or a fraction of a pixel short of it, are as
      // separated as they are going to get and are not counted as unresolved
      assert.equal(countSymbolCollisions(makeNodes([[0, 0, 10], [20, 0, 10]])), 0);
      assert.equal(countSymbolCollisions(makeNodes([[0, 0, 10], [19.2, 0, 10]])), 0);
      assert.equal(countSymbolCollisions(makeNodes([[0, 0, 10], [18.5, 0, 10]])), 1);
    });

    it('a node with a max-shift of 0 is a fixed obstacle', function () {
      // The pinned node holds its place while the other is pushed clear of it
      var nodes = makeNodes([[0, 0, 10, 0], [8, 0, 10, 100]]);
      assert.equal(resolveSymbolCollisions(nodes, solverOpts()), 1);
      assert.strictEqual(nodes[0].x, 0);
      assert.strictEqual(nodes[0].y, 0);
      assert.ok(Math.abs(nodes[1].x - 20) < 0.1, 'node 1 is at ' + nodes[1].x);
      assert.equal(countSymbolCollisions(nodes), 0);
    });

    it('varying radii and shift limits stay per-node', function () {
      var nodes = makeNodes([[0, 0, 10, 2], [8, 0, 10, 30]]);
      resolveSymbolCollisions(nodes, solverOpts());
      assert.ok(shift(nodes[0]) <= 2 + 1e-9, 'node 0 moved ' + shift(nodes[0]));
      assert.ok(shift(nodes[1]) > 2, 'node 1 moved ' + shift(nodes[1]));
    });

    it('a pair is separated by the greater of the two margins, not the sum', function () {
      var nodes = makeNodes([[0, 0, 10, 100, 5], [8, 0, 10, 100, 1]]);
      resolveSymbolCollisions(nodes, solverOpts({ticks: 200}));
      // 20px of radii plus the larger margin of 5, not 5 + 1
      var dist = nodes[1].x - nodes[0].x;
      assert.ok(Math.abs(dist - 25) < 0.1, 'symbols are ' + dist + 'px apart');
    });

    it('a node with no margin property is laid out as if its margin were 0', function () {
      var nodes = makeNodes([[0, 0, 10, 100], [8, 0, 10, 100]]);
      resolveSymbolCollisions(nodes, solverOpts({ticks: 200}));
      var dist = nodes[1].x - nodes[0].x;
      assert.ok(Math.abs(dist - 20) < 0.1, 'symbols are ' + dist + 'px apart');
    });

    it('a negative margin lets symbols overlap', function () {
      var nodes = makeNodes([[0, 0, 10, 100, -6], [8, 0, 10, 100, -6]]);
      resolveSymbolCollisions(nodes, solverOpts({ticks: 200}));
      var dist = nodes[1].x - nodes[0].x;
      assert.ok(Math.abs(dist - 14) < 0.1, 'symbols are ' + dist + 'px apart');
    });

    it('a negative margin only applies where both symbols allow it', function () {
      // max() means the neighbor's 0 outranks this symbol's -6
      var nodes = makeNodes([[0, 0, 10, 100, -6], [8, 0, 10, 100, 0]]);
      resolveSymbolCollisions(nodes, solverOpts({ticks: 200}));
      var dist = nodes[1].x - nodes[0].x;
      assert.ok(Math.abs(dist - 20) < 0.1, 'symbols are ' + dist + 'px apart');
    });

    it('margins that cancel a pair of radii leave the pair alone', function () {
      var nodes = makeNodes([[0, 0, 10, 100, -25], [8, 0, 10, 100, -25]]);
      assert.equal(resolveSymbolCollisions(nodes, solverOpts()), 0);
      assert.equal(countSymbolCollisions(nodes), 0);
      assert.strictEqual(nodes[0].x, 0);
      assert.strictEqual(nodes[1].x, 8);
    });

    // The x-axis sweep breaks out of its inner loop early, on a bound that has
    // to allow for margins; a negative margin invalidates the obvious version of
    // it and pairs stop being compared. Radii and margins here are of similar
    // size, so pairs whose margins cancel their radii are covered too.
    it('the sweep finds every colliding pair, whatever the margins', function () {
      var trial, i, nodes, expected, found;
      for (trial=0; trial<20; trial++) {
        nodes = [];
        for (i=0; i<60; i++) {
          nodes.push({i: i,
            x: pseudoRandom(i, trial) * 90,
            y: pseudoRandom(i, trial + 99) * 90,
            x0: 0, y0: 0,
            r: 3 + pseudoRandom(i, trial + 199) * 5,
            margin: -12 + 24 * pseudoRandom(i, trial + 299),
            maxShift: 20});
        }
        expected = countCollisionsBruteForce(nodes);
        found = countSymbolCollisions(nodes);
        assert.equal(found, expected,
          'trial ' + trial + ': swept ' + found + ' pairs, expected ' + expected);
      }
    });
  });

  describe('-repel command', function () {

    it('moves overlapping symbols apart', async function () {
      var input = pointsGeoJSON([[0, 0], [8, 0], [1000, 0]]);
      var out = await api.applyCommands(
        '-i in.json -style r=10 -repel width=1000 max-shift=50 padding=0.5 -o out.json',
        {'in.json': input});
      var coords = getCoords(out['out.json']);
      // r=10 circles plus 0.5px of padding each: 21px between centers
      var dist = Math.abs(coords[1][0] - coords[0][0]);
      assert.ok(dist > 20.9 && dist < 21.1, 'symbols are ' + dist + 'px apart');
      // A symbol with no neighbors should not move at all
      assert.deepEqual(coords[2], [1000, 0]);
    });

    it('separates symbols until they touch when padding is 0', async function () {
      var input = pointsGeoJSON([[0, 0], [8, 0], [1000, 0]]);
      var out = await api.applyCommands(
        '-i in.json -style r=10 -repel width=1000 max-shift=50 -o out.json',
        {'in.json': input});
      var coords = getCoords(out['out.json']);
      var dist = Math.abs(coords[1][0] - coords[0][0]);
      assert.ok(dist > 19.9 && dist < 20.1, 'symbols are ' + dist + 'px apart');
    });

    it('respects max-shift', async function () {
      var input = pointsGeoJSON([[0, 0], [1, 0], [1000, 0]]);
      var out = await api.applyCommands(
        '-i in.json -style r=20 -repel width=1000 max-shift=3 -o out.json',
        {'in.json': input});
      var coords = getCoords(out['out.json']);
      [[0, 0], [1, 0]].forEach(function(anchor, i) {
        var dist = Math.sqrt(Math.pow(coords[i][0] - anchor[0], 2) +
          Math.pow(coords[i][1] - anchor[1], 2));
        assert.ok(dist <= 3 + 1e-6, 'symbol moved ' + dist + 'px');
      });
      // Symbols this crowded can't separate within the limit; the command
      // should displace them as far as allowed and leave them overlapping.
      assert.ok(Math.abs(coords[1][0] - coords[0][0]) > 6);
    });

    it('produces identical output on repeated runs', async function () {
      var input = pointsGeoJSON([[0, 0], [5, 0], [5, 5], [0, 5], [2, 2], [1000, 0]]);
      var cmd = '-i in.json -style r=8 -repel width=1000 -o out.json';
      var out1 = await api.applyCommands(cmd, {'in.json': input});
      var out2 = await api.applyCommands(cmd, {'in.json': input});
      assert.ok(out1['out.json'].equals(out2['out.json']));
    });

    it('reads radii from svg-symbol fields written by -symbols', async function () {
      var input = pointsGeoJSON([[0, 0], [8, 0], [1000, 0]]);
      var out = await api.applyCommands(
        '-i in.json -symbols type=circle radius=10 -repel width=1000 max-shift=50 padding=0.5 -o out.json',
        {'in.json': input});
      var coords = getCoords(out['out.json']);
      var dist = Math.abs(coords[1][0] - coords[0][0]);
      assert.ok(dist > 20.9 && dist < 21.1, 'symbols are ' + dist + 'px apart');
    });

    it('accepts a radius= field name', async function () {
      var input = pointsGeoJSON([[0, 0], [8, 0], [1000, 0]],
        [{size: 10}, {size: 10}, {size: 10}]);
      var out = await api.applyCommands(
        '-i in.json -repel width=1000 max-shift=50 padding=0.5 radius=size -o out.json',
        {'in.json': input});
      var coords = getCoords(out['out.json']);
      var dist = Math.abs(coords[1][0] - coords[0][0]);
      assert.ok(dist > 20.9 && dist < 21.1, 'symbols are ' + dist + 'px apart');
    });

    it('padding= adds clearance between symbols', async function () {
      var input = pointsGeoJSON([[0, 0], [8, 0], [1000, 0]]);
      var out = await api.applyCommands(
        '-i in.json -style r=10 -repel width=1000 max-shift=50 padding=5 -o out.json',
        {'in.json': input});
      var coords = getCoords(out['out.json']);
      var dist = Math.abs(coords[1][0] - coords[0][0]);
      assert.ok(dist > 29.9 && dist < 30.1, 'symbols are ' + dist + 'px apart');
    });

    it('padding= accepts a field name', async function () {
      var input = pointsGeoJSON([[0, 0], [8, 0], [1000, 0]],
        [{pad: 5}, {pad: 0}, {pad: 0}]);
      var out = await api.applyCommands(
        '-i in.json -style r=10 -repel width=1000 max-shift=50 padding=pad -o out.json',
        {'in.json': input});
      var coords = getCoords(out['out.json']);
      // Clearance between a pair of symbols is the sum of their padding
      var dist = Math.abs(coords[1][0] - coords[0][0]);
      assert.ok(dist > 24.9 && dist < 25.1, 'symbols are ' + dist + 'px apart');
    });

    it('padding= accepts an expression', async function () {
      var input = pointsGeoJSON([[0, 0], [8, 0], [1000, 0]],
        [{pad: 2}, {pad: 0}, {pad: 0}]);
      var out = await api.applyCommands(
        "-i in.json -style r=10 -repel width=1000 max-shift=50 padding='pad * 2.5' -o out.json",
        {'in.json': input});
      var coords = getCoords(out['out.json']);
      var dist = Math.abs(coords[1][0] - coords[0][0]);
      assert.ok(dist > 24.9 && dist < 25.1, 'symbols are ' + dist + 'px apart');
    });

    it('margin= adds clearance between symbols', async function () {
      var input = pointsGeoJSON([[0, 0], [8, 0], [1000, 0]]);
      var out = await api.applyCommands(
        '-i in.json -style r=10 -repel width=1000 max-shift=50 margin=5 -o out.json',
        {'in.json': input});
      var coords = getCoords(out['out.json']);
      // 20px of radii plus a 5px gap; the same value as padding= would give 30
      var dist = Math.abs(coords[1][0] - coords[0][0]);
      assert.ok(dist > 24.9 && dist < 25.1, 'symbols are ' + dist + 'px apart');
    });

    it('margin= takes the greater of two symbols where padding= takes the sum', async function () {
      var input = pointsGeoJSON([[0, 0], [8, 0], [1000, 0]],
        [{gap: 5}, {gap: 1}, {gap: 0}]);
      var marginOut = await api.applyCommands(
        '-i in.json -style r=10 -repel width=1000 max-shift=50 margin=gap -o out.json',
        {'in.json': input});
      var paddingOut = await api.applyCommands(
        '-i in.json -style r=10 -repel width=1000 max-shift=50 padding=gap -o out.json',
        {'in.json': input});
      var marginDist = Math.abs(getCoords(marginOut['out.json'])[1][0] -
        getCoords(marginOut['out.json'])[0][0]);
      var paddingDist = Math.abs(getCoords(paddingOut['out.json'])[1][0] -
        getCoords(paddingOut['out.json'])[0][0]);
      assert.ok(marginDist > 24.9 && marginDist < 25.1, 'margin= gave ' + marginDist + 'px');
      assert.ok(paddingDist > 25.9 && paddingDist < 26.1, 'padding= gave ' + paddingDist + 'px');
    });

    it('margin= accepts an expression', async function () {
      var input = pointsGeoJSON([[0, 0], [8, 0], [1000, 0]],
        [{big: 1}, {big: 0}, {big: 0}]);
      var out = await api.applyCommands(
        "-i in.json -style r=10 -repel width=1000 max-shift=50 margin='big ? 6 : 2' -o out.json",
        {'in.json': input});
      var coords = getCoords(out['out.json']);
      // One symbol asks for 6px and its neighbor for 2px, so the gap is 6px
      var dist = Math.abs(coords[1][0] - coords[0][0]);
      assert.ok(dist > 25.9 && dist < 26.1, 'symbols are ' + dist + 'px apart');
    });

    it('margin= and padding= combine', async function () {
      var input = pointsGeoJSON([[0, 0], [8, 0], [1000, 0]]);
      var out = await api.applyCommands(
        '-i in.json -style r=10 -repel width=1000 max-shift=50 padding=1 margin=4 -o out.json',
        {'in.json': input});
      var coords = getCoords(out['out.json']);
      // 20px of radii, 1px of padding each, plus the 4px margin
      var dist = Math.abs(coords[1][0] - coords[0][0]);
      assert.ok(dist > 25.9 && dist < 26.1, 'symbols are ' + dist + 'px apart');
    });

    it('a negative margin= lets symbols overlap', async function () {
      var input = pointsGeoJSON([[0, 0], [2, 0], [1000, 0]]);
      var out = await api.applyCommands(
        '-i in.json -style r=10 -repel width=1000 max-shift=50 margin=-6 -o out.json',
        {'in.json': input});
      var coords = getCoords(out['out.json']);
      var dist = Math.abs(coords[1][0] - coords[0][0]);
      assert.ok(dist > 13.9 && dist < 14.1, 'symbols are ' + dist + 'px apart');
    });

    it('a negative margin= applies only where both symbols allow it', async function () {
      var input = pointsGeoJSON([[0, 0], [2, 0], [1000, 0]],
        [{gap: -6}, {gap: 0}, {gap: 0}]);
      var out = await api.applyCommands(
        '-i in.json -style r=10 -repel width=1000 max-shift=50 margin=gap -o out.json',
        {'in.json': input});
      var coords = getCoords(out['out.json']);
      var dist = Math.abs(coords[1][0] - coords[0][0]);
      assert.ok(dist > 19.9 && dist < 20.1, 'symbols are ' + dist + 'px apart');
    });

    it('errors on an unusable margin= value', async function () {
      await assert.rejects(function() {
        return api.applyCommands(
          '-i in.json -style r=10 -repel width=1000 margin=nonsense -o out.json',
          {'in.json': pointsGeoJSON([[0, 0], [8, 0], [1000, 0]])});
      }, /margin/);
    });

    it('max-shift= accepts an expression', async function () {
      var input = pointsGeoJSON([[0, 0], [8, 0], [1000, 0]],
        [{pin: 1}, {pin: 0}, {pin: 0}]);
      var out = await api.applyCommands(
        "-i in.json -style r=10 -repel width=1000 max-shift='pin ? 0 : 50' -o out.json",
        {'in.json': input});
      var coords = getCoords(out['out.json']);
      // A max-shift of 0 pins a symbol in place; its neighbor moves instead
      assert.deepEqual(coords[0], [0, 0]);
      var dist = Math.abs(coords[1][0] - coords[0][0]);
      assert.ok(dist > 19.9 && dist < 20.1, 'symbols are ' + dist + 'px apart');
    });

    it('errors on a negative padding= value', async function () {
      await assert.rejects(function() {
        return api.applyCommands(
          "-i in.json -style r=10 -repel width=1000 padding='pad - 10' -o out.json",
          {'in.json': pointsGeoJSON([[0, 0], [8, 0], [1000, 0]],
            [{pad: 5}, {pad: 5}, {pad: 5}])});
      }, /Invalid padding= value/);
    });

    it('errors on an unusable max-shift= value', async function () {
      await assert.rejects(function() {
        return api.applyCommands(
          '-i in.json -style r=10 -repel width=1000 max-shift=nonsense -o out.json',
          {'in.json': pointsGeoJSON([[0, 0], [8, 0], [1000, 0]])});
      }, /max-shift/);
    });

    it('takes the display scale from a frame layer', async function () {
      // -frame adds the frame it creates to the catalog as a separate dataset,
      // so this also covers the catalog-wide frame lookup. The layer needs a
      // vertical extent here, or -frame rejects it as a collapsed bbox.
      var input = pointsGeoJSON([[0, 0], [8, 0], [1000, 500]]);
      var out = await api.applyCommands(
        '-i in.json -style r=10 -frame width=1000 -target in -repel max-shift=50 padding=0.5 -o out.json target=in',
        {'in.json': input});
      var coords = getCoords(out['out.json']);
      var dist = Math.abs(coords[1][0] - coords[0][0]);
      // Frame height is rounded to whole pixels, so the scale is very slightly
      // different from width=1000 over the same bounds
      assert.ok(dist > 20.5 && dist < 21.5, 'symbols are ' + dist + 'px apart');
    });

    it('lays out several target layers in one simulation', async function () {
      var a = pointsGeoJSON([[0, 0], [1000, 0]]);
      var b = pointsGeoJSON([[8, 0]]);
      var out = await api.applyCommands(
        '-i a.json b.json combine-files -style r=10 -repel width=1000 max-shift=50 padding=0.5 -o',
        {'a.json': a, 'b.json': b});
      var xa = getCoords(out['a.json'])[0][0];
      var xb = getCoords(out['b.json'])[0][0];
      assert.ok(Math.abs(xb - xa) > 20.9,
        'symbols in different layers should repel each other');
    });

    it('reduces overlaps in real data without exceeding max-shift', async function () {
      // 435 congressional district centroids, already projected: crowded to the
      // point of illegibility around New York, Los Angeles and Miami.
      var file = 'test/data/features/repel/ex1_cds.geojson';
      var width = 900, maxShift = 25, r = 6;
      var before = await api.applyCommands(
        `-i ${file} -style r=${r} -o out.json`);
      var after = await api.applyCommands(
        `-i ${file} -style r=${r} -repel width=${width} max-shift=${maxShift} -o out.json`);
      var pts1 = getCoords(before['out.json']);
      var pts2 = getCoords(after['out.json']);
      assert.equal(pts1.length, pts2.length);

      // Scale of the layout: width= pixels across the layer's bounds
      var xs = pts1.map(function(p) {return p[0];});
      var scale = width / (Math.max.apply(null, xs) - Math.min.apply(null, xs));

      pts2.forEach(function(p, i) {
        var dist = Math.sqrt(Math.pow(p[0] - pts1[i][0], 2) +
          Math.pow(p[1] - pts1[i][1], 2)) * scale;
        assert.ok(dist <= maxShift + 1e-6, 'symbol ' + i + ' moved ' + dist + 'px');
      });
      assert.ok(countOverlaps(pts2, r, scale) < countOverlaps(pts1, r, scale) / 4,
        'expected at least a fourfold reduction in overlapping pairs');
    });

    it('errors if there is no frame and no width=', async function () {
      await assert.rejects(function() {
        return api.applyCommands('-i in.json -style r=10 -repel -o out.json',
          {'in.json': pointsGeoJSON([[0, 0], [8, 0], [1000, 0]])});
      }, /requires a width=/);
    });

    it('errors on unprojected data', async function () {
      await assert.rejects(function() {
        return api.applyCommands('-i in.json -style r=10 -repel width=1000 -o out.json',
          {'in.json': pointsGeoJSON([[-75, 40], [-74.99, 40]])});
      }, /projected coordinates/);
    });

    it('errors if the layer has no circle symbols', async function () {
      await assert.rejects(function() {
        return api.applyCommands('-i in.json -repel width=1000 -o out.json',
          {'in.json': pointsGeoJSON([[0, 0], [8, 0], [1000, 0]])});
      }, /circle symbols/);
    });

    it('errors on non-circle symbols', async function () {
      await assert.rejects(function() {
        return api.applyCommands(
          '-i in.json -symbols type=star radius=10 -repel width=1000 -o out.json',
          {'in.json': pointsGeoJSON([[0, 0], [8, 0], [1000, 0]])});
      }, /circle symbols only/);
    });

    it('errors on a polygon layer', async function () {
      await assert.rejects(function() {
        return api.applyCommands('-i in.json -repel width=1000 -o out.json',
          {'in.json': {type: 'Polygon',
            coordinates: [[[0, 0], [0, 1000], [1000, 1000], [0, 0]]]}});
      }, /point layer/);
    });

    // Two r=10 symbols 8px apart need 20px between their centers. Left to
    // themselves they split the difference and end up at x=-6 and x=14; a
    // polygon whose left edge is at x=-2 stops the first one there, so the
    // second has to travel to x=18 instead.
    describe('polygons= option', function () {
      var points = pointsGeoJSON([[0, 0], [8, 0], [1000, 0]]);
      var cmd = '-i points.json -i polys.json name=polys -target points ' +
        '-style r=10 -repel width=1000 max-shift=50 polygons=polys -o out.json target=points';

      it('keeps a symbol inside its polygon', async function () {
        var out = await api.applyCommands(cmd,
          {'points.json': points, 'polys.json': rectsGeoJSON([[-2, -50, 1010, 50]])});
        var coords = getCoords(out['out.json']);
        assert.ok(coords[0][0] >= -2.001 && coords[0][0] < -1.9,
          'symbol 0 stopped at the polygon edge, x = ' + coords[0][0]);
        assert.ok(Math.abs(coords[1][0] - 18) < 0.1,
          'symbol 1 took up the slack, x = ' + coords[1][0]);
        assert.deepEqual(coords[2], [1000, 0]);
      });

      it('symbols move freely without the option', async function () {
        var out = await api.applyCommands(
          '-i points.json -style r=10 -repel width=1000 max-shift=50 -o out.json',
          {'points.json': points});
        var coords = getCoords(out['out.json']);
        assert.ok(Math.abs(coords[0][0] + 6) < 0.1, 'x = ' + coords[0][0]);
      });

      it('symbols outside every polygon are left free to move', async function () {
        var out = await api.applyCommands(cmd,
          {'points.json': points, 'polys.json': rectsGeoJSON([[2000, -50, 2100, 50]])});
        var coords = getCoords(out['out.json']);
        assert.ok(Math.abs(coords[0][0] + 6) < 0.1,
          'unconstrained symbol should move as usual, x = ' + coords[0][0]);
      });

      it('a polygon too narrow to separate its symbols leaves them overlapping', async function () {
        // Both symbols start inside a 10px-wide box but need 20px of room
        var out = await api.applyCommands(cmd,
          {'points.json': points, 'polys.json': rectsGeoJSON([[-1, -50, 9, 50], [990, -50, 1010, 50]])});
        var coords = getCoords(out['out.json']);
        coords.slice(0, 2).forEach(function(p, i) {
          assert.ok(p[0] >= -1.001 && p[0] <= 9.001, 'symbol ' + i + ' at x = ' + p[0]);
        });
        assert.ok(Math.abs(coords[1][0] - coords[0][0]) < 20,
          'the overlap should survive, not be resolved by leaving the polygon');
      });

      it('max-shift is still respected', async function () {
        var out = await api.applyCommands(
          '-i points.json -i polys.json name=polys -target points -style r=10 ' +
          '-repel width=1000 max-shift=2 polygons=polys -o out.json target=points',
          {'points.json': points, 'polys.json': rectsGeoJSON([[-500, -50, 1500, 50]])});
        var coords = getCoords(out['out.json']);
        [[0, 0], [8, 0]].forEach(function(anchor, i) {
          var dist = Math.sqrt(Math.pow(coords[i][0] - anchor[0], 2) +
            Math.pow(coords[i][1] - anchor[1], 2));
          assert.ok(dist <= 2 + 1e-6, 'symbol ' + i + ' moved ' + dist + 'px');
        });
      });

      it('produces identical output on repeated runs', async function () {
        var input = {'points.json': pointsGeoJSON([[0, 0], [5, 0], [5, 5], [0, 5], [2, 2], [1000, 0]]),
          'polys.json': rectsGeoJSON([[-3, -3, 8, 8], [995, -5, 1005, 5]])};
        var run = '-i points.json -i polys.json name=polys -target points -style r=8 ' +
          '-repel width=1000 polygons=polys -o out.json target=points';
        var out1 = await api.applyCommands(run, input);
        var out2 = await api.applyCommands(run, input);
        assert.ok(out1['out.json'].equals(out2['out.json']));
      });

      it('errors if polygons= is not a polygon layer', async function () {
        await assert.rejects(function() {
          return api.applyCommands(
            '-i points.json -i other.json name=other -target points -style r=10 ' +
            '-repel width=1000 polygons=other -o out.json target=points',
            {'points.json': points, 'other.json': pointsGeoJSON([[0, 0]])});
        }, /polygon layer/);
      });
    });

    it('errors on multi-point features', async function () {
      await assert.rejects(function() {
        return api.applyCommands('-i in.json -repel width=1000 -o out.json',
          {'in.json': {type: 'Feature', properties: {r: 10},
            geometry: {type: 'MultiPoint', coordinates: [[0, 0], [8, 0], [1000, 0]]}}});
      }, /multi-point/);
    });
  });
});
