import api from '../mapshaper.js';
import assert from 'assert';

function createPolygon(ring) {
  return {
    shape: [[0]],
    arcs: new api.internal.ArcCollection([ring])
  };
}

function findPoint(obj, method, opts) {
  return api.internal.findAnchorPoint(obj.shape, obj.arcs, Object.assign({
    method: method,
    tolerance: 0.05,
    weight: 0.6
  }, opts));
}

function assertPointIsInside(p, obj) {
  assert(p && isFinite(p.x) && isFinite(p.y), 'expected a finite point');
  assert(api.geom.testPointInPolygon(p.x, p.y, obj.shape, obj.arcs),
    'point fell outside the polygon: ' + JSON.stringify(p));
}

function createFlaredRectangle(rightHeight) {
  return createPolygon([
    [0, -5],
    [100, -rightHeight / 2],
    [100, rightHeight / 2],
    [0, 5],
    [0, -5]
  ]);
}

function rotateRing(ring, degrees, ox, oy) {
  var theta = degrees * Math.PI / 180;
  var cos = Math.cos(theta);
  var sin = Math.sin(theta);
  return ring.map(function(p) {
    var dx = p[0] - ox;
    var dy = p[1] - oy;
    return [ox + dx * cos - dy * sin, oy + dx * sin + dy * cos];
  });
}

function testInnerPoints(file, cmd, done) {
  var cmd = file + " " + cmd;
  api.internal.testCommands(cmd, function(err, data) {
    var polys = data.layers[0],
        points = data.layers[1];

    polys.shapes.forEach(function(shp, i) {
      var p = points.shapes[i][0];
      var isInside = api.geom.testPointInPolygon(p[0], p[1], shp, data.arcs);
      assert(isInside);
    });
    done();
  });
}


describe('mapshaper-anchor-points.js', function () {
  describe('inner points test', function () {

    var a = "-each 'cx=$.innerX, cy=$.innerY' -points x=cx y=cy +";
    var b = "-points inner +";
    it('file A', function(done) {
      testInnerPoints('test/data/features/centroids/a.shp', a, done);
    })
    it('file B', function(done) {
      testInnerPoints('test/data/features/centroids/b.shp', a, done);
    })
    it('file C', function(done) {
      testInnerPoints('test/data/shapefile/six_counties.shp', a, done);
    })
    it('file A v2', function(done) {
      testInnerPoints('test/data/features/centroids/a.shp', b, done);
    })
    it('file B v2', function(done) {
      testInnerPoints('test/data/features/centroids/b.shp', b, done);
    })
  })

  it('"-points inner" converts collapsed polygon to null geometry', function () {
    var shp = [[[0]]];
    var arcs = new api.internal.ArcCollection([[[0, 0], [0, 0], [0, 0], [0, 0]]]);
    var p = api.internal.findAnchorPoint(shp, arcs);
    assert.equal(p, null);
  })

  // A ring that runs out to a point and back along itself encloses no real
  // area, but its bounding box does, so it survives the collapsed-shape guard
  // and reaches the probing code. The coarse sweep finds a candidate there and
  // the refinement that follows finds none, which used to throw. This ring is
  // reduced from a tile produced by '-buffer 25m topological' on a county
  // mosaic, where the crash was first seen.
  it('"-points inner" handles a ring that encloses no area', function () {
    var arcs = new api.internal.ArcCollection([[
      [-118.78896251209346, 46.50151264974108],
      [-118.78864240246646, 46.50151092192038],
      [-118.7889625120934, 46.50151264974107],
      [-118.78896251209346, 46.50151264974108]
    ]]);
    var p = api.internal.findAnchorPoint([[0]], arcs);
    assert(p && isFinite(p.x) && isFinite(p.y), 'expected a point, got ' + JSON.stringify(p));
  })

  // The two shapes below used to make findAnchorPoint's vertical scan run
  // forever, or near enough. Both are ordinary rings -- no self-intersections,
  // nothing for -clean to fix -- so a hang here is reachable from "-points
  // inner" on a single feature, not just from the buffer mosaic that found it.
  it('"-points inner" terminates on a ring narrower than its own float precision', function () {
    // 20nm x 120nm at longitude -119: the probe band around the candidate point
    // rounds to zero width, so the scan's step cannot move the point at all.
    // Taken from a buffer mosaic tile that hung the process indefinitely.
    var arcs = new api.internal.ArcCollection([[
      [-119.16180153376683, 46.243339704341665],
      [-119.16180153376703, 46.243339704341665],
      [-119.16180153376699, 46.24333970434274],
      [-119.16180153376692, 46.24333970434273],
      [-119.16180153376683, 46.243339704341665]
    ]]);
    var p = api.internal.findAnchorPoint([[0]], arcs);
    assert(p && isFinite(p.x) && isFinite(p.y), 'expected a point, got ' + JSON.stringify(p));
  })

  it('"-points inner" terminates on an extremely high aspect ratio sliver', function () {
    // ~1cm wide by ~111km long. The scan walks its chord in steps proportional
    // to the width, so the steps needed grow with the aspect ratio: this shape
    // took over 45 seconds before the step ceiling, and about 30ms after.
    var w = 1e-7, h = 1, x = -119.16, y = 46;
    var arcs = new api.internal.ArcCollection([[
      [x, y], [x, y + h], [x + w, y + h], [x + w, y], [x, y]
    ]]);
    var shape = [[0]];
    var start = Date.now();
    var p = api.internal.findAnchorPoint(shape, arcs);
    var elapsed = Date.now() - start;
    assert(p && isFinite(p.x) && isFinite(p.y), 'expected a point, got ' + JSON.stringify(p));
    assert(api.geom.testPointInPolygon(p.x, p.y, shape, arcs),
      'anchor point fell outside the sliver');
    assert(elapsed < 1000, 'took ' + elapsed + 'ms, expected the scan to be bounded');
  })

  it('"-points inner" finds center of a rectangle', function () {
    var shape = [[0]];
    var arcs = new api.internal.ArcCollection([[[0, 0], [0, 1], [2, 1], [2, 0], [0, 0]]]);
    var p = api.internal.findAnchorPoint(shape, arcs);
    assert.equal(p.x, 1);
    assert.equal(p.y, 0.5);
  })

  it('defaults to centroid2 with 10% clearance tolerance', function() {
    var obj = createFlaredRectangle(12);
    var p = api.internal.findAnchorPoint(obj.shape, obj.arcs);
    var expected = findPoint(obj, 'centroid2', {tolerance: 0.1});
    var stricter = findPoint(obj, 'centroid2', {tolerance: 0.05});
    assert.equal(p.x, expected.x);
    assert.equal(p.y, expected.y);
    assert.notEqual(p.x, stricter.x);
    assertPointIsInside(p, obj);
  })

  it('uses the default inner method for feature expression innerX and innerY',
    async function() {
      var input = JSON.stringify({
        type: 'Feature',
        properties: {id: 1},
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [0, -5], [100, -6], [100, 6], [0, 5], [0, -5]
          ]]
        }
      });
      var expr = await api.applyCommands(
        '-i in.json -each "ix=$.innerX, iy=$.innerY" ' +
        '-points x=ix y=iy -o expression.json',
        {'in.json': input}
      );
      var inner = await api.applyCommands(
        '-i in.json -points inner -o inner.json',
        {'in.json': input}
      );
      var exprGeom = JSON.parse(expr['expression.json']).features[0].geometry;
      var innerGeom = JSON.parse(inner['inner.json']).features[0].geometry;
      assert.deepEqual(exprGeom, innerGeom);
    })

  describe('polylabel methods', function() {
    var methods = ['pole', 'centroid', 'centroid2', 'weighted'];

    it('return points inside a polygon', function() {
      var obj = createPolygon([
        [0, 0], [6, 0], [6, 1], [2, 1], [2, 5], [0, 5], [0, 0]
      ]);
      methods.forEach(function(method) {
        assertPointIsInside(findPoint(obj, method), obj);
      });
    })

    it('centroid method recenters a slightly flared rectangle', function() {
      var obj = createFlaredRectangle(10.5);
      var pole = findPoint(obj, 'pole');
      var centered = findPoint(obj, 'centroid');
      assert(pole.x > 80, 'expected the unweighted pole near the flared end');
      assert(Math.abs(centered.x - 50.4065) < 0.01,
        'expected the centroid, got x=' + centered.x);
      assert(centered.distance >= pole.distance * 0.95);
    })

    it('centroid method keeps the pole when clearance loss is too large', function() {
      var obj = createFlaredRectangle(12);
      var pole = findPoint(obj, 'pole');
      var centered = findPoint(obj, 'centroid');
      assert.equal(centered.x, pole.x);
      assert.equal(centered.y, pole.y);
    })

    it('centroid2 moves toward the centroid without exceeding tolerance', function() {
      var obj = createFlaredRectangle(12);
      var pole = findPoint(obj, 'pole');
      var centered = findPoint(obj, 'centroid2');
      var centroid = api.geom.getShapeCentroid(obj.shape, obj.arcs);
      assert(centered.x < pole.x && centered.x > centroid.x);
      assert(centered.distance >= pole.distance * 0.95);
      assertPointIsInside(centered, obj);
    })

    it('centroid methods ignore a centroid outside a concave polygon', function() {
      var obj = createPolygon([
        [0, 0], [5, 0], [5, 1], [1, 1], [1, 4],
        [5, 4], [5, 5], [0, 5], [0, 0]
      ]);
      var centroid = api.geom.getShapeCentroid(obj.shape, obj.arcs);
      assert(!api.geom.testPointInPolygon(
        centroid.x, centroid.y, obj.shape, obj.arcs
      ));
      var pole = findPoint(obj, 'pole');
      ['centroid', 'centroid2'].forEach(function(method) {
        var p = findPoint(obj, method);
        assert.equal(p.x, pole.x);
        assert.equal(p.y, pole.y);
      });
    })

    it('centroid methods do not select a centroid inside a hole', function() {
      var obj = {
        shape: [[0], [1]],
        arcs: new api.internal.ArcCollection([
          [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]],
          [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]
        ])
      };
      var centroid = api.geom.getShapeCentroid(obj.shape, obj.arcs);
      assert(!api.geom.testPointInPolygon(
        centroid.x, centroid.y, obj.shape, obj.arcs
      ));
      var pole = findPoint(obj, 'pole');
      ['centroid', 'centroid2'].forEach(function(method) {
        var p = findPoint(obj, method);
        assert.equal(p.x, pole.x);
        assert.equal(p.y, pole.y);
      });
    })

    it('weighted method remains inside at large coordinate offsets', function() {
      // Regression for weighted branch-and-bound implementations that promote
      // a synthetic early-exit distance after floating-point rounding.
      var obj = createPolygon([
        [-101.4, 39.57], [-100.74, 39.57],
        [-100.74, 40], [-101.4, 40], [-101.4, 39.57]
      ]);
      assertPointIsInside(findPoint(obj, 'weighted'), obj);
    })

    it('terminate on hairline slivers at several rotations', function() {
      var x = -119.16;
      var y = 46;
      var w = 1e-7;
      var h = 1;
      var ring = [
        [x, y], [x, y + h], [x + w, y + h], [x + w, y], [x, y]
      ];
      [0, 30, 45, 90].forEach(function(degrees) {
        var obj = createPolygon(rotateRing(ring, degrees, x, y));
        var start = Date.now();
        var p = findPoint(obj, 'pole');
        assertPointIsInside(p, obj);
        assert(Date.now() - start < 1000,
          'rotated sliver took too long at ' + degrees + ' degrees');
      });
    })

    it('bound work on extremely thin rings regardless of orientation', function() {
      var w = 1e-12;
      var ring = [[0, 0], [0, 1], [w, 1], [w, 0], [0, 0]];
      [0, 45].forEach(function(degrees) {
        var obj = createPolygon(rotateRing(ring, degrees, 0, 0));
        var start = Date.now();
        var p = api.internal.findAnchorPoint(obj.shape, obj.arcs);
        assertPointIsInside(p, obj);
        assert(p.probes <= 100000, 'default probe limit was exceeded');
        assert(Date.now() - start < 1000,
          'extremely thin ring took too long at ' + degrees + ' degrees');
      });
    })

    it('return a valid best-so-far point after reaching the probe limit', function() {
      var obj = createFlaredRectangle(12);
      var p = findPoint(obj, 'pole', {probe_limit: 100});
      assert(p.exhausted, 'expected the probe limit to bind');
      assert(p.probes <= 100);
      assertPointIsInside(p, obj);
    })

    it('accept method and tolerance options from the points command', function(done) {
      var cmd = 'test/data/features/centroids/a.shp ' +
        '-points inner inner-method=centroid inner-tolerance=5% +';
      api.internal.testCommands(cmd, function(err, data) {
        if (err) return done(err);
        var polys = data.layers[0];
        var points = data.layers[1];
        points.shapes.forEach(function(shp, i) {
          var p = shp[0];
          assert(api.geom.testPointInPolygon(
            p[0], p[1], polys.shapes[i], data.arcs
          ));
        });
        done();
      });
    })
  })

})
