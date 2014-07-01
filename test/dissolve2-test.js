var assert = require('assert'),
    api = require("../"),
    ArcCollection = api.internal.ArcCollection,
    dissolveShapes = api.internal.dissolveShapes;

describe('mapshaper-clipping.js dissolve tests', function () {
  describe('Fig. 1', function () {
    //
    //      b --- d
    //     / \   /
    //    /   \ /
    //   a --- c
    //

    it('two adjacent triangles', function () {
      //   cab, bc, bdc
      //   0,   1,  2
      var coords = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]];
      var arcs = new api.internal.ArcCollection(coords);

      var shapes = [[[1, 0]], [[2, -2]]];
      var target = [[[0, 2]]];
      assert.deepEqual(dissolveShapes(shapes, arcs), target);
    })

  })

  describe('triangles containing collapsed arcs', function () {
    //
    //      b --- d
    //     / \   /
    //    /   \ /
    //   a --- c
    //
    //   cab, bc, bd, dc, bb, dd, a
    //   0,   1,  2,  3,  4,  5
    var coords = [[[3, 1], [1, 1], [2, 3]], // 0
        [[2, 3], [3, 1]],
        [[2, 3], [4, 3]],
        [[4, 3], [3, 1]], // 4
        [[2, 3], [2, 3]],
        [[4, 3], [4, 3]], // 6
        [[1, 1]]];
    var arcs = new api.internal.ArcCollection(coords);

    it ('ignores collapsed arcs', function() {
      var shapes = [[[1, 0]], [[2, 5, 3, -2]]];
      var target = [[[0, 2, 3]]];
      assert.deepEqual(dissolveShapes(shapes, arcs), target);
    })

    it ('ignores collapsed arcs 2', function() {
      var shapes = [[[4, 1, 0]], [[~4, 2, 3, -2]]];
      var target = [[[0, 2, 3]]];
      assert.deepEqual(dissolveShapes(shapes, arcs), target);
    })

    it ('ignores collapsed arcs 3', function() {
      var shapes = [[[4, 4, 1, 0, 4]], [[~4, 2, 3, -2, 4]]];
      var target = [[[0, 2, 3]]];
      assert.deepEqual(dissolveShapes(shapes, arcs), target);
    })
  })

  describe('Fig. 2', function () {
    //       e
    //      /|\
    //     / | \
    //    /  a  \
    //   /  / \  \
    //  h  d   b  f
    //   \  \ /  /
    //    \  c  /
    //     \   /
    //      \ /
    //       g
    //
    //   abcda, ae, efghe
    //   0,     1,  2

    var coords = [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
        [[3, 4], [3, 5]],
        [[3, 5], [5, 3], [3, 1], [1, 3], [3, 5]]];
    var arcs = new ArcCollection(coords);

    it('dissolve a shape into itself', function () {
      var shapes = [[[1, 2, -2, -1]]];
      var target = [[[2],[-1]]];
      assert.deepEqual(dissolveShapes(shapes, arcs), target);

    })
  })

  describe('Fig. 3', function () {
    //
    //  d -- e -- a
    //  |   / \   |
    //  |  g - f  |
    //  |         |
    //  c ------- b
    //
    //   abcde, efge, ea
    //   0,     1,    2

    var coords = [[[5, 3], [5, 1], [1, 1], [1, 3], [3, 3]],
        [[3, 3], [4, 2], [2, 2], [3, 3]],
        [[3, 3], [5, 3]]];
    var arcs = new ArcCollection(coords);

    it('odd shape', function () {
      var shapes = [[[0, ~1, 2]], [[1]]];
      var target = [[[0, 2]]];

      assert.deepEqual(dissolveShapes(shapes, arcs), target);
    })
  })

  describe('Fig. 4', function () {
    //
    //  d -- e -- a
    //  |   /|\   |
    //  |  h | f  |
    //  |   \|/   |
    //  |    g    |
    //  |         |
    //  c ------- b
    //
    //   abcde, efg,  eg,   ghe,  ea
    //   0,     1/-2, 2/-3, 3/-4, 4

    var coords = [[[5, 4], [5, 1], [1, 1], [1, 4], [3, 4]],
        [[3, 4], [4, 3], [3, 2]],
        [[3, 4], [3, 2]],
        [[3, 2], [2, 3], [3, 4]],
        [[3, 4], [5, 4]]];
    var arcs = new ArcCollection(coords);

    it('dissolve all', function () {
      var shapes = [[[0, ~3, ~1, 4]], [[2, 3]], [[1, ~2]]];
      var target = [[[0, 4]]]
      assert.deepEqual(dissolveShapes(shapes, arcs), [[[0, 4]]]);
    })

  })


  describe('Fig. 5 - hourglass shape', function () {
    //
    //   b - c
    //    \ /
    //     a
    //     |
    //     d
    //    / \
    //   f - e
    //
    //   abca, ad, de, efd
    //   0,    1,  2,  3

    var coords = [[[2, 3], [1, 4], [3, 4], [2, 3]],
        [[2, 3], [2, 2]],
        [[2, 2], [3, 1]],
        [[3, 1], [1, 1], [2, 2]]];
    var arcs = new ArcCollection(coords);

    // TODO: removal is a consequence of blocking shared boundaries of
    //   adjacent polygons -- need to reconsider this?
    it('stem of hourglass is removed', function () {
      var shapes = [[[0, 1, 2, 3, ~1]]];
      var target = [[[0], [2, 3]]];
      assert.deepEqual(dissolveShapes(shapes, arcs), target);
    })
  })


  describe('Fig. 6', function () {
    //
    //  a - b - d
    //  |   |   |
    //  |   c   |
    //  |       |
    //  f ----- e
    //
    //   ab, bc, bdefa
    //   0,  1,  2

    var coords = [[[1, 3], [2, 3]],
        [[2, 3], [2, 2]],
        [[2, 3], [3, 3], [3, 1], [1, 1], [1, 3]]];
    var arcs = new ArcCollection(coords);

    it ('should skip spike - test 1', function() {
      var shapes = [[[0, 1, ~1, 2]]];
      var target = [[[0, 2]]];
      assert.deepEqual(dissolveShapes(shapes, arcs), target);
    })

    it ('should skip spike - test 2', function() {
      var shapes = [[[1, ~1, 2, 0]]];
      var target = [[[2, 0]]];
      assert.deepEqual(dissolveShapes(shapes, arcs), target);
    })

    it ('should skip spike - test 3', function() {
      var shapes = [[[~1, 2, 0, 1]]];
      var target = [[[2, 0]]];
      assert.deepEqual(dissolveShapes(shapes, arcs), target);
    })
  })

  describe('Fig. 7', function () {

    //     b
    //    / \
    //  a --- c
    //  | \ / |
    //  |  d  |
    //  |     |
    //  f --- e
    //
    //   abc, cda, ac, cefa
    //   0,   1,   2,  3

    var coords = [[[1, 3], [2, 4], [3, 3]],
        [[3, 3], [2, 2], [1, 3]],
        [[1, 3], [3, 3]],
        [[3, 3], [3, 1], [1, 1], [1, 3]]];
    var arcs = new ArcCollection(coords);

    it ('should dissolve overlapping rings', function() {
      var shapes = [[[0, 1]], [[2, 3]]];
      var target = [[[0, 3]]];
      assert.deepEqual(dissolveShapes(shapes, arcs), target);
    })
  })

})
