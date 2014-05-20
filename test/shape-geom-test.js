var assert = require('assert'),
    api = require("../"),
    geom = api.geom;

describe('mapshaper-shape-geom.js', function () {

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
    it('getShapeArea()', function () {
      assert.equal(geom.getShapeArea(lyr1.shapes[0], arcData), 6)
      assert.equal(geom.getShapeArea(lyr2.shapes[0], arcData), 8)
    })

    it('getShapeCentroid()', function () {
      assert.deepEqual(geom.getShapeCentroid(lyr1.shapes[0], arcData), {x: 3, y: 3})
    })

    it('getAvgPathXY()', function () {
      assert.deepEqual(geom.getAvgPathXY([1], arcData), {x: 3, y: 3})
    })

    it('getMaxPath()', function () {
      assert.deepEqual(geom.getMaxPath(lyr2.shapes[0], arcData), [1])
    })

    describe('testPointInRing()', function () {

      it('test inside', function () {
        // vertical ray at x hits a vertex on the path
        assert.equal(geom.testPointInRing(3, 3, [1], arcData), true);
        // no ray-vertex intersection
        assert.equal(geom.testPointInRing(4, 3, [1], arcData), true);
        assert.equal(geom.testPointInRing(1.3, 3, [1], arcData), true);
      })

      it('test outside', function () {
        assert.equal(geom.testPointInRing(5, 2, [1], arcData), false);
        assert.equal(geom.testPointInRing(4, 1, [1], arcData), false);
        assert.equal(geom.testPointInRing(1, 2, [1], arcData), false);
        assert.equal(geom.testPointInRing(5, 4, [1], arcData), false);
        assert.equal(geom.testPointInRing(3, 0.5, [1], arcData), false);

      })

      it('test touching a boundary vertex (false)', function() {
        assert.equal(geom.testPointInRing(5, 3, [1], arcData), false);
        assert.equal(geom.testPointInRing(3, 5, [1], arcData), false);
        assert.equal(geom.testPointInRing(3, 1, [1], arcData), false);
        assert.equal(geom.testPointInRing(1, 3, [1], arcData), false);
      })
    })

    describe('testPointInShape()', function () {
      it('point in a hole', function () {
        assert.equal(geom.testPointInShape(3, 3, lyr1.shapes[0], arcData), false)
        assert.equal(geom.testPointInShape(3.1, 3.1, lyr1.shapes[0], arcData), false)
      })

      it('point outside hole', function () {
        assert.equal(geom.testPointInShape(3, 1.2, lyr1.shapes[0], arcData), true)
        assert.equal(geom.testPointInShape(3.1, 1.3, lyr1.shapes[0], arcData), true)
      })

      it('point outside shape', function () {
        assert.equal(geom.testPointInShape(3.1, 1, lyr1.shapes[0], arcData), false)
        assert.equal(geom.testPointInShape(3, 0.2, lyr1.shapes[0], arcData), false)
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


  describe("getSignedArea3()", function() {

    it("returns 0 if shape has collapsed", function() {
      assert.equal(geom.getPathArea3([0, 1, 0], [0, 1, 0]), 0);
      assert.equal(geom.getPathArea3([2, 1, 0, 2], [0, 1, 2, 0]), 0);
      assert.equal(geom.getPathArea3([3, 3, 3, 3], [4, 4, 4, 4]), 0);
    })

    it("returns negative area if points are counter-clockwise", function() {
      assert.equal(geom.getPathArea3([1, 2, 2, 1, 1], [1, 1, 2, 2, 1]), -1)
    })

    it("returns positive area if points are clockwise", function() {
      assert.equal(geom.getPathArea3([1, 1, 2, 2, 1], [1, 2, 2, 1, 1]), 1)
    })

    it("accepts start and length parameters", function() {
      assert.equal(geom.getPathArea3([0, 0, 4, 5, 6, 4], [-1, -4, 0, 1, 0, 0], 2), 1)
      assert.equal(geom.getPathArea3([0, 0, 4, 5, 6, 4, 3], [-1, -4, 0, 1, 0, 0, 1], 2, 4), 1)
    })
  })

})