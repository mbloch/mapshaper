import assert from 'assert';
import api from '../mapshaper.js';
var internal = api.internal;

describe('mapshaper-self-intersection.js', function () {
  describe('splitPathByIds()', function () {
    it('test1', function() {
      var path = [5, 6, 7, 8],
          ids = [0, 2];
      assert.deepEqual(internal.splitPathByIds(path, ids), [[5, 6], [7, 8]])
    })
    it('test2', function() {
      var path = [5, 6, 7, 8],
          ids = [2, 0];
      assert.deepEqual(internal.splitPathByIds(path, ids), [[5, 6], [7, 8]])
    })
    it('test3', function() {
      var path = [5, 6, 7, 8],
          ids = [3, 2, 1];
      assert.deepEqual(internal.splitPathByIds(path, ids), [[5, 8], [6], [7]])
    })
    it('test4', function() {
      var path = [5, 6, 7, 8],
          ids = [3, 0];
      assert.deepEqual(internal.splitPathByIds(path, ids), [[5, 6, 7], [8]]);
    })
    it('test5', function() {
      var path = [5, 6, 7, 8],
          ids = [1, 2];
      assert.deepEqual(internal.splitPathByIds(path, ids), [[5, 7, 8], [6]]);
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
    //
    //       a --- b
    //     / | \   |
    //    f  |  e  |
    //     \ | /   |
    //       d --- c
    //
    it("test 2", function() {
      var coords = [[[2, 3], [4, 3], [4, 1], [2, 1]], // abcd
          [[2, 1], [2, 3]], // da
          [[2, 3], [3, 2], [2, 1]], // aed
          [[2, 1], [1, 2], [2, 3]]]; // dfa
      var path = [0, 1, 2, 3];
      var nodes = new internal.NodeCollection(coords);
      var splitPath = internal.getSelfIntersectionSplitter(nodes);
      var parts = splitPath(path);
      // console.log(parts) // [ [ 0, 3 ], [ 1, 2 ] ]
    })
    it("test 3", function() {
      var coords = [[[2, 3], [4, 3], [4, 1], [2, 1]], // abcd
          [[2, 1], [2, 3]], // da
          [[2, 3], [3, 2], [2, 1]], // aed
          [[2, 1], [1, 2], [2, 3]]]; // dfa
      var path = [0, 3, 2, 1];
      var nodes = new internal.NodeCollection(coords);
      var splitPath = internal.getSelfIntersectionSplitter(nodes);
      var parts = splitPath(path);
      // REMINDER THAT rings may still overlap
      // console.log(parts) // [ [ 0, 1 ], [ 3, 2 ] ]
    })

  })

})