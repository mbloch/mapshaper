
var api = require('../'),
  assert = require('assert'),
  TopoJSON = api.topojson,
  ArcDataset = api.ArcDataset,
  Utils = api.Utils;


function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('topojson-test.js', function () {

  describe('#remapShapeArcs()', function () {
    it('Remap a shape, removing a reversed arc', function () {
      var shape = [[0, 1, 2], [~1, 2, 3]],
          map = [0, -1, 1, 2];

      TopoJSON.remapShapeArcs(shape, map);
      assert.deepEqual([[0, 1], [1, 2]], shape);
    })

    it('Remap a shape, including a reversed arc', function () {
      var shape = [[0, 1, 2], [1, 2, ~3]],
          map = [0, 1, -1, 2];

      TopoJSON.remapShapeArcs(shape, map);
      assert.deepEqual([[0, 1], [1, ~2]], shape);
    })

    it('Handle a null shape', function() {
      var shape = null,
          map = [0, 1, -1, 2];

      TopoJSON.remapShapeArcs(shape, map);
      assert.equal(null, shape);
    })
  })

  describe('filterExportArcs()', function () {

    //      b     d
    //     / \   / \
    //    /   \ /   \
    //   a --- c --- e

    // cc, ddd, cabc, cdec
    var arcs1 = [[[3, 3], [1, 1]], [[4, 4, 4], [3, 3, 3]], [[3, 1, 2, 3], [1, 1, 3, 1]], [[3, 4, 5, 3], [1, 3, 1, 1]]];

    // cabc, cdec
    var arcs2 = [[[3, 1, 2, 3], [1, 1, 3, 1]], [[3, 4, 5, 3], [1, 3, 1, 1]]];

    it('Collapsed arcs are removed', function () {
      var arcs = new ArcDataset(arcs1);
      var map = TopoJSON.filterExportArcs(arcs);
      assert.equal(2, arcs.size());
      assert.deepEqual([-1, -1, 0, 1], Utils.toArray(map));
      assert.deepEqual([[[3, 1], [1, 1], [2, 3], [3, 1]], [[3, 1], [4, 3], [5, 1], [3, 1]]], arcs.toArray());
    })

    it("Returns null if no arcs are removed", function() {
      var arcs = new ArcDataset(arcs2);
      var map = TopoJSON.filterExportArcs(arcs);
      assert.equal(2, arcs.size());
      assert.equal(null, map);
      assert.deepEqual([[[3, 1], [1, 1], [2, 3], [3, 1]], [[3, 1], [4, 3], [5, 1], [3, 1]]], arcs.toArray());
    })
  })



})