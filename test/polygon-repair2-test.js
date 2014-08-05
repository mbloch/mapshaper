var assert = require('assert'),
    api = require("../"),
    ArcCollection = api.internal.ArcCollection,
    repairPolygonGeometry2 = api.internal.repairPolygonGeometry2;



function repairPolygons(shapes, arcs) {
  var lyr = {
    geometry_type: "polygon",
    shapes: shapes
  };
  var layers = api.internal.repairPolygonGeometry2([lyr], arcs);
  return layers[0].shapes;
}

describe('mapshaper-polygon-repair2.js tests', function () {

  return;

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
      var arcs = new ArcCollection(coords);

      var shapes = [[[1, 0], [2, ~1]]];
      var target = [[[0, 2]]];
      assert.deepEqual(repairPolygons(shapes, arcs), target);
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
      assert.deepEqual(repairPolygons(shapes, arcs), target);

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

    it('ring with gap', function () {
      var arcs = new ArcCollection(coords);
      var shapes = [[[0, ~1, 2]]];
      var target = [[[2, 0], [~1]]];
      assert.deepEqual(repairPolygons(shapes, arcs), target);
    })

    it('ring with filled gap', function () {
      // pos. and neg. rings not dissolved.
      var arcs = new ArcCollection(coords);
      var shapes = [[[0, ~1, 2], [1]]];
      var target = [[[2, 0], [~1]]];
      assert.deepEqual(repairPolygons(shapes, arcs), target);
    })

  })


  describe('Fig. 3 v2', function () {
    // Arc 0 shouldn't exist if input rings are converted to arcs
    return;
    //
    //  d -- e -- a
    //  |   / \   |
    //  |  g - f  |
    //  |         |
    //  c ------- b
    //
    //   abcdegfe, efge
    //   0,        1

    var coords = [[[5, 3], [5, 1], [1, 1], [1, 3], [3, 3], [2, 2], [4, 2], [3, 3], [5, 3]],
        [[3, 3], [4, 2], [2, 2], [3, 3]]];
  })


  describe('Fig. 4', function () {
    // This generates incorrect input, shows problem with dissolving holes and
    // rings separately
    return;
    //
    //  d -- e -- a
    //  |   /|\   |
    //  |  h | f  |
    //  |   \|/   |
    //  |    g    |
    //  |         |
    //  c ------- b
    //
    //   abcde, efg, eg, ghe, ea
    //   0,     1,   2,  3,   4

    var coords = [[[5, 4], [5, 1], [1, 1], [1, 4], [3, 4]],
        [[3, 4], [4, 3], [3, 2]],
        [[3, 4], [3, 2]],
        [[3, 2], [2, 3], [3, 4]],
        [[3, 4], [5, 4]]];
    var arcs = new ArcCollection(coords);

    it('dissolve all', function () {
      var shapes = [[[0, ~3, ~1, 4], [2, 3], [1, ~2]]];
      var target = [[[0, 4]]]
      assert.deepEqual(repairPolygons(shapes, arcs), [[[4, 0]]]);
    })

  })

})