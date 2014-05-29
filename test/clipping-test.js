var api = require('../'),
    assert = require('assert'),
    ArcCollection = api.internal.ArcCollection;

//      f ----- g
//      |       |
//  d --|-- a   |
//  |   |   |   |
//  |   e ----- h
//  |       |
//  c ----- b
//
var arcs1 = [[[3, 3], [3, 1], [1, 1], [1, 3], [3, 3]],
    [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]]];

//      g ----- h
//      |       |
//  d - f - a   |
//  |   |   |   |
//  |   e - j - i
//  |       |
//  c ----- b
//
// arcs: abcda, efghije
var arcs2 = [[[3, 3], [3, 1], [1, 1], [1, 3], [3, 3]],
    [[2, 2], [2, 3], [2, 4], [4, 4], [4, 2], [3, 2], [2, 2]]];



describe('mapshaper-clipping.js', function () {

  describe('insertClippingPoints()', function () {
    it('intersect two polygons', function () {
      var coll = new ArcCollection(arcs1);
      var map = api.internal.insertClippingPoints(coll);
      var result = coll.toArray();

      var targetArcs = [[[3, 3], [3, 2]],
          [[3, 2], [3, 1], [1, 1], [1, 3], [2, 3]],
          [[2, 3], [3, 3]],
          [[2, 2], [2, 3]],
          [[2, 3], [2, 4], [4, 4], [4, 2], [3, 2]],
          [[3, 2], [2, 2]]];

      assert.deepEqual(result, targetArcs);
      assert.deepEqual(api.utils.toArray(map), [0, 3]);
    })

    it('test point-segment intersections', function () {
      var coll = new ArcCollection(arcs2);
      var map = api.internal.insertClippingPoints(coll);
      var result = coll.toArray();

      var targetArcs = [[[3, 3], [3, 2]],
          [[3, 2], [3, 1], [1, 1], [1, 3], [2, 3]],
          [[2, 3], [3, 3]],
          [[2, 2], [2, 3]],
          [[2, 3], [2, 4], [4, 4], [4, 2], [3, 2]],
          [[3, 2], [2, 2]]];

      assert.deepEqual(result, targetArcs);
      assert.deepEqual(api.utils.toArray(map), [0, 3]);
    })

  })

  describe('intersectLayers()', function () {
    it('intersect two polygons', function () {
      var coll = new ArcCollection(arcs1);
      var lyrA = {
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyrB = {
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var targetA = [[[0, 1, 2]]],
          targetB = [[[3, 4, 5]]];

      api.internal.intersectLayers(lyrA, lyrB, coll);
      assert.deepEqual(lyrA.shapes, targetA);
      assert.deepEqual(lyrB.shapes, targetB);
    })

    it('intersect two reversed polygons', function () {
      var coll = new ArcCollection(arcs1);
      var lyrA = {
        geometry_type: "polygon",
        shapes: [[[~0]]]
      };
      var lyrB = {
        geometry_type: "polygon",
        shapes: [[[~1]]]
      };
      var targetA = [[[~2, ~1, ~0]]],
          targetB = [[[~5, ~4, ~3]]];

      api.internal.intersectLayers(lyrA, lyrB, coll);
      assert.deepEqual(lyrA.shapes, targetA);
      assert.deepEqual(lyrB.shapes, targetB);
    })
  })
})
