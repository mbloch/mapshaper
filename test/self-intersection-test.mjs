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

    // Regression: a ring with many chained self-intersections must not overflow
    // the call stack. The splitter peels one loop at a time, which used to
    // recurse once per loop ("Maximum call stack size exceeded"). Each base
    // point c_i sits at a distinct spot on a big ring and carries a detour loop
    // that returns to c_i (a self-touch), so the splits cannot be batched.
    it("handles deeply chained self-intersections without a stack overflow", function() {
      // Builds a deliberately deep chain (~8000 loops) that overflowed the old
      // recursive splitter; the work legitimately takes ~2s, so give headroom
      // above mocha's 2000ms default to avoid flaking under parallel load.
      this.timeout(15000);
      var M = 8000;
      var coords = [];
      var path = [];
      var Rbig = 1000;
      for (var i = 0; i < M; i++) {
        var a = (i / M) * Math.PI * 2;
        var ci = [Math.cos(a) * Rbig, Math.sin(a) * Rbig];
        var an = ((i + 1) % M / M) * Math.PI * 2;
        var cnext = [Math.cos(an) * Rbig, Math.sin(an) * Rbig];
        coords.push([ci, [ci[0] * 1.05 + 1, ci[1] * 1.05],
          [ci[0] * 1.05, ci[1] * 1.05 + 1], ci]); // detour loop back to ci
        path.push(coords.length - 1);
        coords.push([ci, cnext]); // hop to next base point
        path.push(coords.length - 1);
      }
      var nodes = new internal.NodeCollection(coords);
      var splitPath = internal.getSelfIntersectionSplitter(nodes);
      var parts = splitPath(path);
      assert.equal(parts.length, M + 1); // M detour loops + the main ring
    })

  })

})