import assert from 'assert';
import api from '../mapshaper.js';
var utils = api.utils;

describe("mapshaper-simplify.js", function() {

  describe('Change: -simplify ignores targets with no paths instead of erroring', function () {
    it('-simplify 10%', function (done) {
      var input = {
        type: 'Feature',
        geometry: null,
        properties: {id: 'foo'}
      };
      api.applyCommands('-i in.json -simplify 10% -o out.json', {'in.json': input}, function(err, output) {
        var json = JSON.parse(output['out.json']);
        assert(!err)
        assert.deepEqual(json.features, [input]);
        done();
      })
    })
  });


  describe('convertSimplifyInterval', function () {
    it('wgs84 / km', function () {
      var input = {
        type: 'LineString',
        coordinates: [[-100, 40], [-101, 42], [-105, 47]]
      }
      var dataset = api.internal.importGeoJSON(input, {});
      var interval = api.internal.convertSimplifyInterval('0.5km', dataset, {});
      assert.equal(interval, 500)
    })

    it('Error: wgs84 / km / planar', function() {
      assert.throws(function() {
        var input = {
          type: 'LineString',
          coordinates: [[-100, 40], [-101, 42], [-105, 47]]
        }
        var dataset = api.internal.importGeoJSON(input, {});
        var interval = api.internal.convertSimplifyInterval('0.5km', dataset, {planar: true});
      });
    })

    it('wgs84 / [no units] / planer', function() {
      var input = {
        type: 'LineString',
        coordinates: [[-100, 40], [-101, 42], [-105, 47]]
      }
      var dataset = api.internal.importGeoJSON(input, {});
      var interval = api.internal.convertSimplifyInterval(3, dataset, {planar: true});
      assert.equal(interval, 3)
    })
  })

  describe('-simplify target= option', function () {
    // TODO: change this behavior
    it('targeting one layer in a dataset simplifies all layers in the dataset', function (done) {
      var a = {
        type: 'LineString',
        coordinates: [[0, 0], [0, 1], [1, 1]]
      };
      var b = {
        type: 'LineString',
        coordinates: [[2, 0], [2, 1], [3, 1]]
      }
      var cmd = '-i a.json b.json combine-files -simplify target=a 5% -o target=*';
      api.applyCommands(cmd, {'a.json': a, 'b.json': b}, function(err, out) {
        var a = JSON.parse(out['a.json']);
        var b = JSON.parse(out['b.json']);
        assert.deepEqual(a.geometries[0].coordinates, [[0, 0], [1, 1]]);
        assert.deepEqual(b.geometries[0].coordinates, [[2, 0], [3, 1]]);
        done();
      });
    })
  })


  describe('-simplify resolution= option', function () {

    it('resolution=100x100', function (done) {
      var input = {
        type: 'LineString',
        coordinates: [[0, 0], [0, 1], [1, 1], [1, 2]]
      }
      api.applyCommands('-i line.json -simplify resolution=100x100 -o', {'line.json': input}, function(err, out) {
        var output = JSON.parse(out['line.json']);
        assert.deepEqual(output.geometries[0], input);
        done();
      })
    })
  })

  describe('Fix: -simplify 0% removes all removable vertices', function () {
    it('-simplify planar 0%', function (done) {
      var input = {
        type: 'LineString',
        coordinates: [[0,0], [0,1], [0.1, 1.1], [0, 1.2], [0, 2]]
      };
      api.applyCommands('-i in.json -simplify planar 0% -o out.json', {'in.json': input}, function(err, output) {
        var json = JSON.parse(output['out.json']);
        assert.deepEqual(json.geometries[0].coordinates, [[0,0], [0, 2]]);
        done();
      })
    })
  })

  describe('simplify() can be re-applied', function () {

    it('test 1', function(done) {
      api.internal.testCommands('-i test/data/ne/ne_110m_admin_1_states_provinces_shp.shp', function(err, dataset) {
        var a = dataset.arcs.toArray();
        api.cmd.simplify(dataset, {percentage: 0.1, method: 'dp'});
        var b = dataset.arcs.toArray();
        api.cmd.simplify(dataset, {percentage: 0.3, method: 'visvalingam'});
        api.cmd.simplify(dataset, {percentage: 1});
        var c = dataset.arcs.toArray();
        assert.notDeepEqual(b, a);
        assert.deepEqual(c, a);
        done();
      });
    });
  });

  describe('-simplify lock-box option', function() {
    it('protects a square shape', function(done) {
      var square = {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 1], [2, 1], [2, 0], [0, 0]]]
      };
      api.applyCommands('-simplify 0% lock-box -o gj2008', square, function(err, data) {
        assert.deepEqual(JSON.parse(data).geometries[0], square);
        done();
      })
    })

  })

  describe('simplify() creates dataset.info.simplify object', function () {
    it('default method, auto-detect spherical', function () {
      var arcs = new api.internal.ArcCollection([[[180, 90], [-180, -90]]]);
      var dataset = {arcs: arcs};
      api.cmd.simplify(dataset, {percentage: 1});
      assert.deepEqual(dataset.info.simplify, {method: 'weighted_visvalingam', spherical: true, percentage: 1});
    })

    it('Douglas-Peucker, auto-detect planar', function () {
      var arcs = new api.internal.ArcCollection([[[0, 100], [100, 100]]]);
      var dataset = {arcs: arcs};
      api.cmd.simplify(dataset, {method: 'dp', percentage: 0.5});
      assert.deepEqual(dataset.info.simplify, {method: 'dp', spherical: false, percentage: 0.5});
    })

    it('unweighted Visvalingam, explicit planar', function () {
      var arcs = new api.internal.ArcCollection([[[0, 0], [1, -1]]]);
      var dataset = {arcs: arcs};
      api.cmd.simplify(dataset, {method: 'visvalingam', planar: true, percentage: 0});
      assert.deepEqual(dataset.info.simplify, {method: 'visvalingam', spherical: false, planar: true, percentage: 0});
    })
  })

  describe("getSimplifyMethod()", function() {
    it ('"weighted" aliases to "weighted_visvalingam"', function() {
      assert.equal(api.internal.getSimplifyMethod({method: 'weighted'}), 'weighted_visvalingam');
    })
    it ('"visvalingam" aliases to "weighted_visvalingam" whem weighting param is present', function() {
      assert.equal(api.internal.getSimplifyMethod({method: 'visvalingam', weighting: 0.5}), 'weighted_visvalingam');
    })
    it ('"weighted_visvalingam" is default', function() {
      assert.equal(api.internal.getSimplifyMethod({}), 'weighted_visvalingam');
    })
  })

  describe('calcPlanarInterval()', function () {
    it('constrained by content width if content is relatively wide', function () {
      var interval = api.internal.calcPlanarInterval(100, 300, 2000, 1000);
      assert.equal(interval, 20);
    })
    it('constrained by content height if content is relatively tall', function () {
      var interval = api.internal.calcPlanarInterval(300, 100, 1000, 2000);
      assert.equal(interval, 20);
    })
    it('constrained by content width if height resolution is 0', function () {
      var interval = api.internal.calcPlanarInterval(100, 0, 2000, 1000);
      assert.equal(interval, 20);
    })
    it('constrained by content height if width resolution is 0', function () {
      var interval = api.internal.calcPlanarInterval(0, 100, 2000, 1000);
      assert.equal(interval, 10);
    })
  })

  describe('calcSphericalInterval()', function () {
    it('world layer uses length of equator in meters when width constrained', function () {
      var bounds = new api.internal.Bounds([-180,-90,180,90]);
      var interval = api.internal.calcSphericalInterval(1000, 1000, bounds);
      var target = api.geom.R * 2 * Math.PI / 1000;
      assert.equal(interval, target);
    })
    it('world layer uses length of meridian in meters when height constrained', function () {
      var bounds = new api.internal.Bounds([-180,-90,180,90]);
      var interval = api.internal.calcSphericalInterval(3000, 1000, bounds);
      var target = api.geom.R * Math.PI / 1000;
      assert.equal(interval, target);
    })
  })

  describe('parseSimplifyResolution()', function () {
    it('parse grid', function () {
      assert.deepEqual(api.internal.parseSimplifyResolution('100x200'), [100, 200]);
    })
    it('parse grid (comma delim)', function () {
      assert.deepEqual(api.internal.parseSimplifyResolution('100,200'), [100, 200]);
    })
    it('parse grid (space delim)', function () {
      assert.deepEqual(api.internal.parseSimplifyResolution('100 200'), [100, 200]);
    })
    it('parse partial grid', function () {
      assert.deepEqual(api.internal.parseSimplifyResolution('x200'), [0, 200]);
      assert.deepEqual(api.internal.parseSimplifyResolution('100x'), [100, 0]);
    })
    it('accept number', function() {
      assert.deepEqual(api.internal.parseSimplifyResolution(1000), [1000, 1000]);
    })
    it('accept numeric string', function() {
      assert.deepEqual(api.internal.parseSimplifyResolution('1e4'), [10000, 10000]);
    })
    it('reject negative numbers', function() {
      assert.throws(function() {
        api.internal.parseSimplifyResolution('-200');
      });
      assert.throws(function() {
        api.internal.parseSimplifyResolution('-200x200');
      });
      assert.throws(function() {
        api.internal.parseSimplifyResolution('-200x');
      });
      assert.throws(function() {
        api.internal.parseSimplifyResolution('x-200');
      });
    })
  })

  describe('#protectWorldEdges()', function () {
    it('should set world edges equal to highest threshold in each arc', function () {
      var arcs = [[[178, 30], [179, 31], [180, 32], [180, 33]],
          [[-170, 1], [-180, 2], [-160, 2], [-160, 1]],
          [[2, 90], [3, 90], [3, 89], [2, 88]],
          [[3, -79], [4, -84], [3, -90], [4, -80]]];
      var thresholds = [[Infinity, 6, 4, Infinity], [Infinity, 5, 8, Infinity],
        [Infinity, 1, 4, Infinity], [Infinity, 5, 8, Infinity]];
      var data = new api.internal.ArcCollection(arcs).setThresholds(thresholds);
      api.internal.protectWorldEdges(data);

      var expected = [Infinity, 6, 6, Infinity, Infinity, 8, 8, Infinity, Infinity, 4, 4, Infinity, Infinity, 5, 8, Infinity];
      assert.deepEqual(utils.toArray(data.getVertexData().zz), expected);
    })

    it('should not modify arcs if internal vertices do not reach edge', function() {
      var arcs = [[[178, 30], [179, 31], [179.9, 32], [180, 33]],
          [[-180, 1], [-179.0, 2], [-160, 2], [-160, 1]],
          [[2, 90], [3, 89.9], [3, 89], [2, 88]],
          [[3, -79], [4, -84], [3, -89.2], [4, -90]]];
      var thresholds = [[Infinity, 6, 4, Infinity], [Infinity, 5, 8, Infinity],
        [Infinity, 1, 4, Infinity], [Infinity, 5, 8, Infinity]];
      var data = new api.internal.ArcCollection(arcs).setThresholds(thresholds);
      api.internal.protectWorldEdges(data);
      var expected = [Infinity, 6, 4, Infinity, Infinity, 5, 8, Infinity, Infinity, 1, 4, Infinity, Infinity, 5, 8, Infinity];
      assert.deepEqual(utils.toArray(data.getVertexData().zz), expected);
    })
  })
})
