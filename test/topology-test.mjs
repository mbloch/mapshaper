import assert from 'assert';
import api from '../mapshaper.js';
var utils = api.utils;

function buildPathTopology(nn, xx, yy) {
  var obj = api.internal.buildPathTopology(nn, xx, yy);
  obj.arcs =  new api.internal.ArcCollection(obj.nn, obj.xx, obj.yy);
  return obj;
};

describe("mapshaper-topology.js", function() {

  describe('irregular holes', function () {
    it('hole shares two segments with enclosing path', function () {

          //      b --- c
          //     / \   /
          //    /   \ /
          //   a --- d

          //   [a, b, c, d, a] [a, d, b, a]
      var yy = [1, 3, 3, 1, 1,  1, 1, 3, 1],
          xx = [1, 2, 4, 3, 1,  1, 3, 2, 1],
          nn = [5, 4];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.paths, [[0, 1], [2, -2]]);
      assert.deepEqual(out.arcs.toArray(),
        [[[2, 3], [4, 3], [3, 1]],
        [[3, 1], [1, 1], [2, 3]],
        [[3, 1], [2, 3]]]);
    })
  })

  describe('two rings share one point', function () {

    //      b     d
    //     / \   / \
    //    /   \ /   \
    //   a --- c --- e

    it('shared point is endpoint of one ring', function () {
          //   [a, b, c, a] [c, d, e, c]
      var yy = [1, 3, 1, 1,  1, 3, 1, 1],
          xx = [1, 2, 3, 1,  3, 4, 5, 3],
          nn = [4, 4];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.paths, [[0],[1]]);
      assert.deepEqual(out.arcs.toArray(),
        [[[3, 1], [1, 1], [2, 3], [3, 1]],
        [[3, 1], [4, 3], [5, 1], [3, 1]]]);
    })

    it('shared point is endpoint of neither ring', function () {
          //   [a, b, c, a] [e, c, d, e]
      var yy = [1, 3, 1, 1,  3, 1, 1, 3],
          xx = [1, 2, 3, 1,  4, 5, 3, 4],
          nn = [4, 4];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.paths, [[0],[1]]);
      assert.deepEqual(out.arcs.toArray(),
        [[[3, 1], [1, 1], [2, 3], [3, 1]],
        [[3, 1], [4, 3], [5, 1], [3, 1]]]);
    })

  })

  describe('congruent rings', function () {

    //      b
    //     / \
    //    /   \
    //   a --- c

    it('hole-around-island, aligned', function () {
          //   [a, b, c, a] [a, c, b, a]
      var yy = [1, 3, 1, 1,  1, 1, 3, 1],
          xx = [1, 2, 3, 1,  1, 3, 2, 1],
          nn = [4, 4];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.paths, [[0],[~0]]);
      assert.deepEqual(out.arcs.toArray(),
        [[[1, 1], [2, 3], [3, 1], [1, 1]]]);
    })

    it('hole-around-island, misaligned', function () {
          //   [a, b, c, a] [c, b, a, c]
      var yy = [1, 3, 1, 1,  1, 3, 1, 1],
          xx = [1, 2, 3, 1,  3, 2, 1, 3],
          nn = [4, 4];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.paths, [[0],[~0]]);
      assert.deepEqual(out.arcs.toArray(),
        [[[1, 1], [2, 3], [3, 1], [1, 1]]]);
    })

    it('duplicate islands, aligned', function () {
          //   [a, b, c, a] [a, b, c, a]
      var yy = [1, 3, 1, 1,  1, 3, 1, 1],
          xx = [1, 2, 3, 1,  1, 2, 3, 1],
          nn = [4, 4];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.paths, [[0], [0]]);
    })

    it('duplicate islands, misaligned', function () {
          //   [a, b, c, a] [c, a, b, c]
      var yy = [1, 3, 1, 1,  1, 1, 3, 1],
          xx = [1, 2, 3, 1,  3, 1, 2, 3],
          nn = [4, 4];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.paths, [[0], [0]]);
    })

    it('three duplicate islands, aligned', function () {
          //   [a, b, c, a] [a, b, c, a] [a, b, c, a]
      var yy = [1, 3, 1, 1,  1, 3, 1, 1,  1, 3, 1, 1],
          xx = [1, 2, 3, 1,  1, 2, 3, 1,  1, 2, 3, 1],
          nn = [4, 4, 4];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.paths, [[0], [0], [0]]);
    })

    it('three duplicate islands, misaligned', function () {
          //   [a, b, c, a] [c, a, b, c] [b, c, a, b]
      var yy = [1, 3, 1, 1,  1, 1, 3, 1,  3, 1, 1, 3],
          xx = [1, 2, 3, 1,  3, 1, 2, 3,  2, 3, 1, 2],
          nn = [4, 4, 4];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.paths, [[0], [0], [0]]);
    })

    it('two duplicate islands and a hole, misaligned', function () {
          //   [a, b, c, a] [c, a, b, c] [b, a, c, b]
      var yy = [1, 3, 1, 1,  1, 1, 3, 1,  3, 1, 1, 3],
          xx = [1, 2, 3, 1,  3, 1, 2, 3,  2, 1, 3, 2],
          nn = [4, 4, 4];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.paths, [[0], [0], [~0]]);
    })

  })


  describe('two rings, one shared segment', function () {

    //      b --- d
    //     / \   /
    //    /   \ /
    //   a --- c

    it('ring endpoints are aligned', function () {
          //   [c, a, b, c] [c, b, d, c]
      var yy = [1, 1, 3, 1,  1, 3, 3, 1],
          xx = [3, 1, 2, 3,  3, 2, 4, 3],
          nn = [4, 4];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.arcs.toArray(),
        // [c, a, b] [b, c] [b, d, c]
        [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]]);

      assert.deepEqual(out.paths, [[0, 1], [~1, 2]]);
      //assert.deepEqual(out.sharedArcFlags, [0, 1, 0]);
    })

    it('ring endpoints are misaligned 1', function () {
          //   [c, a, b, c] [b, d, c, b]
      var yy = [1, 1, 3, 1,  3, 3, 1, 3],
          xx = [3, 1, 2, 3,  2, 4, 3, 2],
          nn = [4, 4];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.arcs.toArray(),
        // [c, a, b] [b, c] [b, d, c]
        [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]]);
      assert.deepEqual(out.paths, [[0, 1], [2, ~1]]);
      //assert.deepEqual(out.sharedArcFlags, [0, 1, 0]);
    })

    it('ring endpoints are misaligned 2', function () {
          //   [c, a, b, c] [d, c, b, c]
      var yy = [1, 1, 3, 1,  3, 1, 3, 3],
          xx = [3, 1, 2, 3,  4, 3, 2, 4],
          nn = [4, 4];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.arcs.toArray(),
        // [c, a, b] [b, c] [b, d, c]
        [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]]);
      assert.deepEqual(out.paths, [[0, 1], [~1, 2]]);
      //assert.deepEqual(out.sharedArcFlags, [0, 1, 0]);
    })
  })

  describe('two rings, one multi-segment shared edge', function () {

    //         b --- e
    //        /|    /
    //       / |   /
    //      /  c  /
    //     /   | /
    //    /    |/
    //   a --- d

    it('ring two endpoint is within edge', function () {
          //   [a, b, c, d, a] [c, b, e, d, c]
      var yy = [1, 3, 2, 1, 1,  2, 3, 3, 1, 2],
          xx = [1, 2, 2, 2, 1,  2, 2, 3, 2, 2],
          nn = [5, 5];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.paths, [[0, 1], [2, ~0]])
      assert.deepEqual(out.arcs.toArray(),
        [[[2, 3], [2, 2], [2, 1]], [[2, 1], [1, 1], [2, 3]], [[2, 3], [3, 3], [2, 1]]]);
      // assert.deepEqual(out.sharedArcFlags, [1, 0, 0])
    })

  })

  describe('two congruent polylines', function () {
    //
    //   a --- b
    //
    it('single-segment lines, same direction', function () {
      var yy = [1, 1,  1, 1],
          xx = [1, 2,  1, 2],
          nn = [2, 2];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.arcs.toArray(), [[[1, 1], [2, 1]]]);
      assert.deepEqual(out.paths, [[0], [0]]);
    })

    it('single-segment lines, opposite direction', function () {
      var yy = [1, 1,  1, 1],
          xx = [1, 2,  2, 1],
          nn = [2, 2];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.arcs.toArray(), [[[1, 1], [2, 1]]]);
      assert.deepEqual(out.paths, [[0], [~0]]);
    })
  })

  describe('two intersecting polylines', function () {

    //         c
    //         |
    //         |
    //   a --- b

    it('paths share one endpoint', function () {
          //   [a, b] [c, b]
      var yy = [1, 1,  2, 1],
          xx = [1, 2,  2, 2],
          nn = [2, 2];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.arcs.toArray(),
        [[[1, 1], [2, 1]], [[2, 2], [2, 1]]]);
      assert.deepEqual(out.paths, [[0], [1]]);
    })

    //         d
    //         |
    //         |
    //   a --- b --- c

    it('path 2 intersects path 1 midway', function () {
          //   [a, b, c] [d, b]
      var yy = [1, 1, 1,  2, 1],
          xx = [1, 2, 3,  2, 2],
          nn = [3, 2];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.arcs.toArray(),
        [[[1, 1], [2, 1]], [[2, 1], [3, 1]], [[2, 2], [2, 1]]]);
      assert.deepEqual(out.paths, [[0, 1], [2]]);
    })

    //         d
    //         |
    //         |
    //   a --- b --- c

    it('two paths share one segment', function () {
          //   [a, b, c] [a, b, d]
      var yy = [1, 1, 1,  1, 1, 2],
          xx = [1, 2, 3,  1, 2, 2],
          nn = [3, 3];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.arcs.toArray(),
        [[[1, 1], [2, 1]], [[2, 1], [3, 1]], [[2, 1], [2, 2]]]);
      assert.deepEqual(out.paths, [[0, 1], [0, 2]]);
    })

    it('two paths share one segment, opposite directions', function () {
          //   [a, b, c] [d, b, a]
      var yy = [1, 1, 1,  2, 1, 1],
          xx = [1, 2, 3,  2, 2, 1],
          nn = [3, 3];

      var out = buildPathTopology(nn, xx, yy);
      assert.deepEqual(out.arcs.toArray(),
        [[[1, 1], [2, 1]], [[2, 1], [3, 1]], [[2, 2], [2, 1]]]);
      assert.deepEqual(out.paths, [[0, 1], [2, ~0]]);
    })

  })

})