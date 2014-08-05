
var assert = require('assert'),
    api = require("../"),
    ArcCollection = api.internal.ArcCollection,
    NodeCollection = api.internal.NodeCollection,
    dissolveLayers = api.dissolvePolygonLayers2,
    dissolvePolygons = api.internal.dissolvePolygons2;

describe('mapshaper-dissolve2.js dissolve tests', function () {
  /*
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

    it ('should skip spike - test 2', function() {
      var nodes = new NodeCollection(coords);
      var shapes = [[[1, ~1, 2, 0]]];
      var target = [[[2, 0]]];
      assert.deepEqual(dissolvePolygons(shapes, nodes), target);
    })

    it ('should skip spike - test 3', function() {
      var nodes = new NodeCollection(coords);
      var shapes = [[[~1, 2, 0, 1]]];
      var target = [[[2, 0]]];
      assert.deepEqual(dissolvePolygons(shapes, nodes), target);
    })
  })
  */

 })