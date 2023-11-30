import assert from 'assert';
import api from '../mapshaper.js';

var v = api.internal.Visvalingam;

describe("mapshaper-visvalingam.js", function() {

  describe("getPathSimplifier()", function() {

    it ("two-vertex path", function() {
      var calc = v.getArcCalculator(v.standardMetric);
      var kk = [0, 0];
      calc(kk, [0, 1], [0, 0]);
      assert.deepEqual(kk, [Infinity, Infinity]);
    });

    it("three-vertex path", function() {
      var calc = v.getArcCalculator(v.standardMetric);
      var xx = [0, 1, 2],
          yy = [0, 1, 0],
          kk = [0, 0, 0];
      calc(kk, xx, yy);
      assert.deepEqual(kk, [Infinity, 1, Infinity]);
    })

    it("four-vertex path w/ threshold update", function() {

      //   b
      //   | \
      //   |  \
      //   a    b ----- c

      var calc = v.getArcCalculator(v.standardMetric);
      var xx = [0, 0, 1, 3],
          yy = [0, 1, 0, 0],
          kk = [0, 0, 0, 0];
      calc(kk, xx, yy);
      assert.deepEqual(kk, [Infinity, 0.5, 0.5, Infinity]);
    })

    it("five-vertex path w/ spike", function() {

      //         c
      //         |
      //         |
      //   a --- b --- d

      var calc = v.getArcCalculator(v.standardMetric);
      var xx = [0, 1, 1, 1, 2],
          yy = [0, 0, 1, 0, 0],
          kk = new Array(5);
      calc(kk, xx, yy);
      assert.deepEqual(kk, [Infinity, 0, 0, 0, Infinity]);
    })

  });

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

  describe("weightedMetric()", function() {
    it ("is equal to or greater than standard metric for oblique-angle triangles", function() {
      function expectGE(coords) {
        var metric = v.getWeightedMetric()
        assert(metric.apply(null, coords) >=
          v.standardMetric.apply(null, coords));
      }
      expectGE([1, 0, 2, 5, 1, 8]);
    })

    it ("is equal to standard metric for right-angle triangles", function() {
      function expectEqual(coords) {
        assert(v.getWeightedMetric().apply(null, coords) ==
          v.standardMetric.apply(null, coords));
      }
      expectEqual([0, 0, 1, 1, 2, 0]);
      expectEqual([1, 0, 1, 5, 5, 5]);
    })

    it ("is less than standard metric for acute-angle triangles", function() {
      function expectLesser(coords) {
        var weighted = v.getWeightedMetric().apply(null, coords);
        var standard = v.standardMetric.apply(null, coords);
        var angle = api.geom.innerAngle.apply(null, coords);
        // console.log("weighted:", weighted, "standard:", standard, 'angle:', angle)

        assert.ok( weighted < standard);
      }
      expectLesser([0, 0, 0, 3, 1, 0]);
      expectLesser([0, 0, 1, Math.sqrt(2), 2, 0]);
    })

    it ("handles collapsed triangles without freaking out", function() {
      var metric = v.getWeightedMetric();
      assert.equal(metric.apply(null, [1, 1, 1, 1, 2, 3]), 0)
      assert.equal(metric.apply(null, [1, 1, 2, 3, 1, 1]), 0)
      assert.equal(metric.apply(null, [2, 3, 1, 1, 1, 1]), 0)
      assert.equal(metric.apply(null, [1, 1, 1, 1, 1, 1]), 0)
    })
  })

  describe("weightedMetric3D()", function() {
    it ("is same as weightedMetric when one dimension is axis-aligned", function() {
      assert.equal(v.getWeightedMetric3D()(0, 0, 9, 1, 8, 9, 2, 1, 9),
          v.getWeightedMetric()(0, 0, 1, 8, 2, 1));
      assert.equal(v.getWeightedMetric3D()(9, 0, 0, 9, 1, 8, 9, 2, 0),
          v.getWeightedMetric()(0, 0, 1, 8, 2, 0));
      assert.equal(v.getWeightedMetric3D()(0, 9, 0, 1, 9, 8, 2, 9, 0),
          v.getWeightedMetric()(0, 0, 1, 8, 2, 0));
    })
  })

  describe('getWeightFunction()', function () {
    it('weight is 1 when weighting == 0', function () {
      var f = v.getWeightFunction({weighting: 0});
      assert.equal(f(0), 1);
      assert.equal(f(1), 1);
      assert.equal(f(-1), 1);
    })

    it('weight is <1 when angle < 90deg', function () {
      // weight function receives cosine of angle
      var f = v.getWeightFunction({weighting: 0.5});
      assert(f(0.1) < 1);
      assert(f(1) < 1);
    })

    it('weight is >1 when angle > 90deg', function () {
      var f = v.getWeightFunction({weighting: 0.5});
      assert(f(-0.1) > 1);
      assert(f(-1) > 1);
    })

    it('weight is 0 when angle = 90deg', function () {
      var f = v.getWeightFunction({weighting: 0.5});
      assert.equal(f(0), 1);
    })

    it('greater angles have greater weights', function () {
      var f = v.getWeightFunction({weighting: 0.5});
      assert(f(0) > f(0.1))
      assert(f(0.1) > f(0.2))
      assert(f(0.9) > f(1))
      assert(f(-0.1) > f(0))
      assert(f(-0.2) > f(-0.1))
      assert(f(-1) > f(-0.9))
    })

  })

})
