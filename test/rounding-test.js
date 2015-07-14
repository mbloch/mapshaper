var api = require('../'),
  assert = require('assert');

function testPoints(src, precision, target) {
  var lyr = {
    geometry_type: 'point',
    shapes: src
  },
  dataset = api.internal.setCoordinatePrecision({layers:[lyr]}, precision);
  assert.deepEqual(dataset.layers[0].shapes, target);
}

describe('mapshaper-rounding.js', function () {
  describe('setCoordinatePrecision()', function () {
    it("round points to integer coords", function() {
      var shapes = [[[-0.1, 0.1], [0.5, -1.5]]]
      var target = [[[0, 0], [1, -1]]]; // TODO: does it matter if -1.5 rounds to -1?
      testPoints(shapes, 1, target);
    });
  })

  describe('exporting rounded GeoJSON', function () {
    it('removes a spike', function () {
      var json = {
        type: "GeometryCollection",
        geometries: [{
          type: "Polygon",
          coordinates: [[[1, 1], [1, 3], [1.1, 2], [2, 2], [2, 1], [1, 1]]]
        }]
      };
      var target = [[[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]];

      var dataset = api.internal.importGeoJSON(json, {});
      var rounded = api.internal.setCoordinatePrecision(dataset, 1);
      var output = api.internal.exportGeoJSON(rounded, {});
      assert.deepEqual(JSON.parse(output[0].content).geometries[0].coordinates, target);
    })

    // polygon endpoint is in the spike
    it('removes a spike 3', function () {
      var json = {
        type: "GeometryCollection",
        geometries: [{
          type: "Polygon",
          coordinates: [[[1, 3], [1.1, 2], [2, 2], [2, 1], [1, 1], [1, 3]]]
        }]
      };
      var target = [[[1, 2], [2, 2], [2, 1], [1, 1], [1, 2]]];

      var dataset = api.internal.importGeoJSON(json, {});
      var rounded = api.internal.setCoordinatePrecision(dataset, 1);
      var output = api.internal.exportGeoJSON(rounded, {});
      assert.deepEqual(JSON.parse(output[0].content).geometries[0].coordinates, target);
    })

    // spike is connected to an adjacent polygon
    it('removes a spike 3', function () {
      var json = {
        type: "GeometryCollection",
        geometries: [{
          type: "Polygon",
          coordinates: [[[1, 3], [1.1, 2], [2, 2], [2, 1], [1, 1], [1, 3]]]
        }, {
          type: "Polygon",
          coordinates: [[[2, 3], [2, 2], [1.1, 2], [1, 3], [2, 3]]]
        }]
      };
      var target1 = [[[1, 2], [2, 2], [2, 1], [1, 1], [1, 2]]];
      var target2 = [[[2, 3], [2, 2], [1, 2], [1, 3], [2, 3]]];

      var dataset = api.internal.importGeoJSON(json, {});
      var rounded = api.internal.setCoordinatePrecision(dataset, 1);
      var output = api.internal.exportGeoJSON(rounded, {});

      assert.deepEqual(JSON.parse(output[0].content).geometries[0].coordinates, target1);
      assert.deepEqual(JSON.parse(output[0].content).geometries[1].coordinates, target2);
    })

    it('collapsed polygon is removed', function() {
      var json = {
        type: "GeometryCollection",
        geometries: [{
          type: "Polygon",
          coordinates: [[[1, 1], [1, 2], [1.1, 2], [1, 1]]]
        }]
      };

      var dataset = api.internal.importGeoJSON(json, {});
      var rounded = api.internal.setCoordinatePrecision(dataset, 1);
      assert.deepEqual(rounded.layers[0].shapes, [null]);
      // original coords are unaffected
      assert.deepEqual(dataset.arcs.toArray(), [[[1, 1], [1, 2], [1.1, 2], [1, 1]]]);
    })

    it('bounding box is updated', function() {
      var json = {
        type: "GeometryCollection",
        geometries: [{
          type: "Polygon",
          coordinates: [[[0.8, 1], [1.9, 0.9], [1.1, 2.1], [0.8, 1]]]
        }]
      };

      var dataset = api.internal.importGeoJSON(json, {});
      var rounded = api.internal.setCoordinatePrecision(dataset, 1);
      assert.deepEqual(rounded.arcs.getBounds().toArray(), [1, 1, 2, 2]);
      // original arcs are unaffected
      assert.deepEqual(dataset.arcs.getBounds().toArray(), [0.8, 0.9, 1.9, 2.1]);
    })

  })
})
