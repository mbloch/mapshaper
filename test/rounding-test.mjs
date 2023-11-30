import api from '../mapshaper.js';
import assert from 'assert';
var getBinaryRoundingFunction = api.internal.getBinaryRoundingFunction;

var utils = api.utils,
  internal = api.internal;



function testPoints(src, precision, target) {
  var lyr = {
    geometry_type: 'point',
    shapes: src
  };
  var dataset = {layers:[lyr]};
  api.internal.setCoordinatePrecision(dataset, precision);
  assert.deepEqual(dataset.layers[0].shapes, target);
}

describe('mapshaper-rounding.js', function () {

  describe('getBinaryRoundingFunction()', function() {
    var round1 = getBinaryRoundingFunction(1);
    var round2 = getBinaryRoundingFunction(2);
    var round16 = getBinaryRoundingFunction(16);

    // TODO: finish
    return;

    it('timing', function() {
      var loops = 1e8, i, val = 1/3;
      console.time('1');
      for (i=0; i<loops; i++) {
        var x = round16(val);
      }
      console.timeEnd('1');

      console.time('2');
      for (i=0; i<loops; i++) {
        var x = Math.fround(val);
      }
      console.timeEnd('2');

    })

    it('test1', function() {
      console.log(1/3);
      console.log(round1(1/3));
      console.log(round2(1/3));
      console.log(round16(1/3));
    });
  })

  describe('getRoundingFunction', function () {

    function testAtPrecision(precision) {
      var round = internal.getRoundingFunction(precision),
          // avoid 0.0000001 -> 1e-7
          maxDigits = countDigits(precision.toFixed(15).replace(/0*$/, '')),
          tests = 1000,
          num, rounded, str;

      while (tests--) {
        num = Math.random() * 2 - 1;
        num *= Math.pow(10, Math.floor(Math.random() * 10));// better distribution
        rounded = round(num);
        str = JSON.stringify(rounded);
        assert.ok(countDigits(str) <= maxDigits, num + " -> " + str);
      }

    }

    function countDigits(str) {
      var idx = str.indexOf('.');
      var digits = idx > 0 ? str.length - idx - 1 : 0;
      return digits;
    }

    it('Rounds to 1s', function () {
      var round = internal.getRoundingFunction(1);
      assert.equal(round(10.2), 10);
      assert.equal(round(-1000000.2), -1000000);
    })

    it('Rounds to 10s', function () {
      var round = internal.getRoundingFunction(10);
      assert.equal(round(11), 10);
      assert.equal(round(-15.55), -20);
    })

    it('Rounds to 0.01', function () {
      testAtPrecision(0.01)
    })

    it('Rounds to 0.0001', function () {
      testAtPrecision(0.0001)
    })

    it('Rounds to 0.001', function () {
      testAtPrecision(0.001)
    })

    it('Rounds to 0.1', function () {
      testAtPrecision(0.1)
    })

    it('Rounds to 0.00001', function () {
      testAtPrecision(0.00001)
    })

    it('Rounds to 0.000001', function () {
      testAtPrecision(0.000001)
    })

    it('Rounds to 0.0000001', function () {
      testAtPrecision(0.0000001);
    })

    it('Rounds to 0.00000001', function () {
      testAtPrecision(0.00000001);
    })

    it('JSON.stringify() doesn\'t show rounding artefacts', function () {
      var round = internal.getRoundingFunction(0.1);
      assert.equal(JSON.stringify(round(0.1)), "0.1");
      assert.equal(JSON.stringify(round(-77.2)), "-77.2");
      assert.equal(JSON.stringify(round(33.3)), "33.3");
      assert.equal(JSON.stringify(round(-33330.4)), "-33330.4");
      assert.equal(JSON.stringify(round(77.5)), "77.5");
      assert.equal(JSON.stringify(round(899222.6)), "899222.6");
      assert.equal(JSON.stringify(round(1000000.7)), "1000000.7");
      assert.equal(JSON.stringify(round(-1000000.8)), "-1000000.8");
      assert.equal(JSON.stringify(round(1000000.9)), "1000000.9");
   })
  })

  describe('setCoordinatePrecision()', function () {
    it("round points to integer coords", function() {
      var shapes = [[[-0.1, 0.1], [0.5, -1.5]]]
      var target = [[[0, 0], [1, -1]]]; // TODO: does it matter if -1.5 rounds to -1?
      testPoints(shapes, 1, target);
    });
  })

  describe('exporting rounded GeoJSON', function () {
    // removing cleanup after rounding -- unreliable
    /*
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
      api.internal.setCoordinatePrecision(dataset, 1);
      var output = api.internal.exportGeoJSON(dataset, {});
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
      api.internal.setCoordinatePrecision(dataset, 1);
      var output = api.internal.exportGeoJSON(dataset, {});
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
      api.internal.setCoordinatePrecision(dataset, 1);
      var output = api.internal.exportGeoJSON(dataset, {});

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
      api.internal.setCoordinatePrecision(dataset, 1);
      assert.deepEqual(dataset.layers[0].shapes, [null]);
    });
    */

    it('bounding box is updated', function() {
      var json = {
        type: "GeometryCollection",
        geometries: [{
          type: "Polygon",
          coordinates: [[[0.8, 1], [1.9, 0.9], [1.1, 2.1], [0.8, 1]]]
        }]
      };

      var dataset = api.internal.importGeoJSON(json, {});
      api.internal.setCoordinatePrecision(dataset, 1);
      assert.deepEqual(dataset.arcs.getBounds().toArray(), [1, 1, 2, 2]);

    })

  })
})
