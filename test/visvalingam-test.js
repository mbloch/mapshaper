var assert = require('assert'),
    api = require("../"),
    v = api.internal.Visvalingam;

describe("mapshaper-visvalingam.js", function() {

  describe("standardMetric()", function() {
    it ("uses 2D triangle area", function() {
      var coords = [0, 0, 1, 2, 4, 1];
      assert.equal(v.standardMetric.apply(null, coords),
        api.geom.triangleArea.apply(null, coords));
    })
  })

  describe("standardMetric3D()", function() {
    it ("uses 3D triangle area", function() {
      var coords = [0, 0, 2, 1, 2, 8, 4, 1, -5];
      assert.equal(v.standardMetric3D.apply(null, coords),
        api.geom.triangleArea3D.apply(null, coords));
    })
  })

  describe("specialMetric()", function() {
    it ("is equal to standard metric for oblique and right triangles", function() {
      function expectEqual(coords) {
        assert.equal(v.specialMetric.apply(null, coords),
          v.standardMetric.apply(null, coords));
      }
      expectEqual([0, 0, 1, 1, 2, 0]);
      expectEqual([1, 0, 2, 5, 1, 8]);
      expectEqual([1, 0, 1, 5, 5, 5]);
    })

    it ("is less than standard metric for acute triangles", function() {
      function expectLesser(coords) {
        assert.ok(v.specialMetric.apply(null, coords) <
          v.standardMetric.apply(null, coords));
      }
      expectLesser([0, 0, 0, 3, 1, 0]);
      expectLesser([0, 0, 1, Math.sqrt(2), 2, 0]);
    })

    it ("handles collapsed triangles without freaking out", function() {
      assert.equal(v.specialMetric.apply(null, [1, 1, 1, 1, 2, 3]), 0)
      assert.equal(v.specialMetric.apply(null, [1, 1, 2, 3, 1, 1]), 0)
      assert.equal(v.specialMetric.apply(null, [2, 3, 1, 1, 1, 1]), 0)
      assert.equal(v.specialMetric.apply(null, [1, 1, 1, 1, 1, 1]), 0)
    })
  })

  describe("specialMetric3D()", function() {
    it ("is same as specialMetric when one dimension is axis-aligned", function() {
      assert.equal(v.specialMetric3D(0, 0, 9, 1, 8, 9, 2, 1, 9),
          v.specialMetric(0, 0, 1, 8, 2, 1));
      assert.equal(v.specialMetric3D(9, 0, 0, 9, 1, 8, 9, 2, 0),
          v.specialMetric(0, 0, 1, 8, 2, 0));
      assert.equal(v.specialMetric3D(0, 9, 0, 1, 9, 8, 2, 9, 0),
          v.specialMetric(0, 0, 1, 8, 2, 0));
    })
  })
})