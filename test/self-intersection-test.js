var assert = require('assert'),
    api = require("../"),
    internal = api.internal;

describe('mapshaper-self-intersection.js', function () {
  describe('splitPathByIds()', function () {
    it('test1', function () {
      var path = [5, 6, 7, 8],
          ids = [5, 7];
      assert.deepEqual(internal.splitPathByIds(path, ids), [[5, 6], [7, 8]])
    })
    it('test2', function () {
      var path = [5, 6, 7, 8],
          ids = [7, 5];
      assert.deepEqual(internal.splitPathByIds(path, ids), [[5, 6], [7, 8]])
    })
    it('test3', function () {
      var path = [5, 6, 7, 8],
          ids = [8, 7, 6];
      assert.deepEqual(internal.splitPathByIds(path, ids), [[5, 8], [6], [7]])
    })
  })

  describe('getSelfIntersectionSplitter()', function () {
    //
    //   a -- b
    //   |    |
    //   f ---c-- e
    //        | /
    //        d
    //
    it("test 1", function() {
      var coords = [[[1, 3], [2, 3], [2, 2]], // abc
          [[2, 2], [2, 1], [3, 2], [2, 2]],  // cedc
          [[2, 2], [1, 2], [1, 3]]];        // cf
      var path = [0, 1, 2];
      var nodes = new internal.NodeCollection(coords);
      var splitPath = internal.getSelfIntersectionSplitter(nodes);
      var parts = splitPath(path);
      var target = [[0, 2], [1]];
      assert.deepEqual(parts, target);
    })

  })

})