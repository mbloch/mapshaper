import assert from 'assert';
import api from '../mapshaper.js';
var geom = api.geom;

describe('mapshaper-shape-geom.js', function () {

  describe('testRayIntersection()', function () {
    it('p on collapsed seg -> NaN', function () {
      assert.equal(isNaN(geom.testRayIntersection(1, 1, 1, 1, 1, 1)), true);
      assert.equal(isNaN(geom.testRayIntersection(0, 0, 0, 0, 0, 0)), true);
    })

    it('p below collapsed seg -> 0', function () {
      assert.equal(geom.testRayIntersection(1, 0, 1, 1, 1, 1), 0);
      assert.equal(geom.testRayIntersection(0, -1, 0, 0, 0, 0), 0);
    })

    it('p on vertical seg -> NaN', function () {
      assert.equal(isNaN(geom.testRayIntersection(1, 1, 1, 0, 1, 2)), true);
      assert.equal(isNaN(geom.testRayIntersection(1, 1, 1, 1, 1, 0)), true);
      assert.equal(isNaN(geom.testRayIntersection(1, 1, 1, 0, 1, 1)), true);
      assert.equal(isNaN(geom.testRayIntersection(1, 1, 1, 1, 1, 2)), true);
      assert.equal(isNaN(geom.testRayIntersection(1, 1, 1, 2, 1, 1)), true);
    })

    it('p below vertical seg -> 0', function () {
      assert.equal(geom.testRayIntersection(1, 0, 1, 1, 1, 2), 0);
      assert.equal(geom.testRayIntersection(1, 0, 1, 2, 1, 1), 0);
    })

    it('p on horizontal seg -> NaN', function () {
      assert.equal(isNaN(geom.testRayIntersection(1, 1, 0, 1, 2, 1)), true);
      assert.equal(isNaN(geom.testRayIntersection(1, 1, 1, 1, 2, 1)), true);
      assert.equal(isNaN(geom.testRayIntersection(1, 1, 2, 1, 1, 1)), true);
    })

    it('px below leftmost endpoint -> 0', function () {
      assert.equal(geom.testRayIntersection(1, 0, 1, 1, 2, 2), 0);
      assert.equal(geom.testRayIntersection(1, 0, 2, 2, 1, 1), 0);
    })

    it('px below rightmost endpoint -> 1', function () {
      assert.equal(geom.testRayIntersection(1, 0, 0, 1, 1, 2), 1);
      assert.equal(geom.testRayIntersection(1, 0, 1, 2, 0, 1), 1);
    })

    it('p on left or right endpoint -> NaN', function () {
      assert.equal(isNaN(geom.testRayIntersection(0, 1, 0, 1, 1, 2)), true);
      assert.equal(isNaN(geom.testRayIntersection(1, 2, 0, 1, 1, 2)), true);
    })

     it('px below middle of segment -> 1', function () {
      assert.equal(geom.testRayIntersection(0.4, 0, 0, 1, 1, 2), 1);
      assert.equal(geom.testRayIntersection(0.4, 0, 1, 2, 0, 1), 1);
    })

  })


  //       e
  //      / \
  //     /   \
  //    /  a  \
  //   /  / \  \
  //  h  d   b  f
  //   \  \ /  /
  //    \  c  /
  //     \   /
  //      \ /
  //       g
  //
  //   abcda, efghe
  //   0/-1,  1/-2

  var arcs = [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
      [[3, 5], [5, 3], [3, 1], [1, 3], [3, 5]]];

  var arcData = new api.internal.ArcCollection(arcs);
  var lyr1 = {
        geometry_type: 'polygon',
        data: new api.internal.DataTable([{foo: 1}]),
        shapes: [[[1], [-1]]]
      };
  var lyr2 = {
        geometry_type: 'polygon',
        data: new api.internal.DataTable([{foo: 4}]),
        shapes: [[[1], [-1], [0]]]
      };

  describe('getSphericalShapeArea()', function() {

    it ("Calculate hemisphere area", function() {
      var R = 6378137;
      var hemisphereArea = 2 * Math.PI * R * R;
      var arcs = new api.internal.ArcCollection([[[-180, 0], [-180, 90], [180, 90], [180, 0], [-180, 0]]]);
      var area = geom.getSphericalShapeArea([[0]], arcs);
      assert.ok(Math.abs(hemisphereArea - area) < 0.01);
    })
  })

  describe('figure 1', function () {
    it('getPlanarShapeArea()', function () {
      assert.equal(geom.getPlanarShapeArea(lyr1.shapes[0], arcData), 6)
      assert.equal(geom.getPlanarShapeArea(lyr2.shapes[0], arcData), 8)
    })

    it('getShapeCentroid()', function () {
      assert.deepEqual(geom.getShapeCentroid(lyr1.shapes[0], arcData), {x: 3, y: 3})
      assert.equal(geom.getShapeCentroid(null, arcData), null);
    })

    it('getAvgPathXY()', function () {
      assert.deepEqual(geom.getAvgPathXY([1], arcData), {x: 3, y: 3})
    })

    it('getMaxPath()', function () {
      assert.deepEqual(geom.getMaxPath(lyr2.shapes[0], arcData), [1])
      assert.equal(geom.getMaxPath(null, arcData), null);
    })

    describe('testPointInRing()', function () {

      it('test inside', function () {
        // vertical ray at x hits a vertex on the path
        assert.equal(geom.testPointInRing(3, 3, [1], arcData), 1);
        // no ray-vertex intersection
        assert.equal(geom.testPointInRing(4, 3, [1], arcData), 1);
        assert.equal(geom.testPointInRing(1.3, 3, [1], arcData), 1);
      })

      it('test outside', function () {
        assert.equal(geom.testPointInRing(5, 2, [1], arcData), 0);
        assert.equal(geom.testPointInRing(4, 1, [1], arcData), 0);
        assert.equal(geom.testPointInRing(1, 2, [1], arcData), 0);
        assert.equal(geom.testPointInRing(5, 4, [1], arcData), 0);
        assert.equal(geom.testPointInRing(3, 0.5, [1], arcData), 0);
      })

      it('test touching a boundary vertex (-1)', function() {
        assert.equal(geom.testPointInRing(5, 3, [1], arcData), -1);
        assert.equal(geom.testPointInRing(3, 5, [1], arcData), -1);
        assert.equal(geom.testPointInRing(3, 1, [1], arcData), -1);
        assert.equal(geom.testPointInRing(1, 3, [1], arcData), -1);
      })
    })

    describe('testPointInPolygon()', function () {
      it('point in a hole', function () {
        assert.equal(geom.testPointInPolygon(3, 3, lyr1.shapes[0], arcData), false)
        assert.equal(geom.testPointInPolygon(3.1, 3.1, lyr1.shapes[0], arcData), false)
      })

      it('point outside hole', function () {
        assert.equal(geom.testPointInPolygon(3, 1.2, lyr1.shapes[0], arcData), true)
        assert.equal(geom.testPointInPolygon(3.1, 1.3, lyr1.shapes[0], arcData), true)
      })

      it('point outside shape', function () {
        assert.equal(geom.testPointInPolygon(3.1, 1, lyr1.shapes[0], arcData), false)
        assert.equal(geom.testPointInPolygon(3, 0.2, lyr1.shapes[0], arcData), false)
      })
    })

    describe('getPointToPathDistance()', function () {
      it('exterior distance', function () {
        assert.equal(geom.getPointToPathDistance(3, 0, [1], arcData), 1);
      })

      it('interior distance', function() {
        assert.equal(geom.getPointToPathDistance(3, 3, [1], arcData), Math.sqrt(2));
        assert.equal(geom.getPointToPathDistance(3, 4, [1], arcData), Math.sqrt(2) / 2);
        assert.equal(geom.getPointToPathDistance(4, 3, [1], arcData), Math.sqrt(2) / 2);
      })

      it('point is on boundary', function() {
        assert.equal(geom.getPointToPathDistance(3, 5, [1], arcData), 0);
        assert.equal(geom.getPointToPathDistance(4, 4, [1], arcData), 0);
        assert.equal(geom.getPointToPathDistance(1, 3, [1], arcData), 0);
        assert.equal(geom.getPointToPathDistance(2, 2, [1], arcData), 0);
      })

    })
  })


  describe("getPlanarPathArea2()", function() {

    it("returns negative area if points are counter-clockwise", function() {
      assert.equal(geom.getPlanarPathArea2([[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]), -1)
    })

    it("returns positive area if points are clockwise", function() {
      assert.equal(geom.getPlanarPathArea2([[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]), 1)
    })

    it("Fix: tiny CCW triangle", function() {
      var coords = [ [ -89.93838884833583, 37.87449410425668 ],
      [ -89.93838904665556, 37.87449407735467 ],
      [ -89.9383888795177, 37.87449407735467 ],
      [ -89.93838884833583, 37.87449410425668 ] ];
      assert.ok(geom.getPlanarPathArea2(coords) < 0);
    })
  })

  describe("getPlanarPathArea()", function() {

    it("returns positive area if points are clockwise", function() {
      var arcs = new api.internal.ArcCollection([[[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]]);
      assert.equal(geom.getPlanarPathArea([0], arcs), 1)
    })

    it("returns negative area if points are counter-clockwise", function() {
      var arcs = new api.internal.ArcCollection([[[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]]);
      assert.equal(geom.getPlanarPathArea([0], arcs), -1)
    })

    it("returns 0 if shape has collapsed", function() {
      var ids = [[[0, 0], [1, 1], [0, 0]], [[2, 0], [1, 1], [0, 2], [2, 0]], [[3, 4], [3, 4], [3, 4], [3, 4]]],
          arcs = new api.internal.ArcCollection(ids);
      assert.equal(geom.getPlanarPathArea([0], arcs), 0);
      assert.equal(geom.getPlanarPathArea([1], arcs), 0);
      assert.equal(geom.getPlanarPathArea([2], arcs), 0);
    })

    it("Fix: tiny CCW triangle", function() {
      // This tiny triangle tested as CW before area function was rewritten
      // to reduce fp rounding error.
      var coords = [ [ [ -89.93838884833583, 37.87449410425668 ],
      [ -89.93838904665556, 37.87449407735467 ],
      [ -89.9383888795177, 37.87449407735467 ],
      [ -89.93838884833583, 37.87449410425668 ] ] ];
      var arcs = new api.internal.ArcCollection(coords);
      assert.ok(geom.getPlanarPathArea([0], arcs) < 0);
    })

    it("Fix: tiny CW triangle", function() {
      var coords = [ [ [ -89.93838884833583, 37.87449410425668 ],
      [ -89.93838904665556, 37.87449407735467 ],
      [ -89.9383888795177, 37.87449407735467 ],
      [ -89.93838884833583, 37.87449410425668 ] ] ];
      var arcs = new api.internal.ArcCollection(coords);
      assert.ok(geom.getPlanarPathArea([~0], arcs) > 0);
    })

  })

  describe('calcPathLen()', function () {
    it('tests', function () {
      //
      //  a ----------- b
      //  |             |
      //  |  h - e - i  |
      //  |  |   |   |  |
      //  |  g - f - j  |
      //  |             |
      //  d ----------- c
      //
      var coords = [[[1, 4], [5, 4], [5, 1], [1, 1], [1, 4]], // abcda
          [[3, 3], [3, 2]],  // ef
          [[3, 2], [2, 2], [2, 3], [3, 3]],  // fghe
          [[3, 3], [4, 3], [4, 2], [3, 2]]]; // eijf
      var arcs = new api.internal.ArcCollection(coords);
      assert.equal(geom.calcPathLen([0], arcs), 14);
      assert.equal(geom.calcPathLen([2, 3], arcs), 6);
    })
  })
})