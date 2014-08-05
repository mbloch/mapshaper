var api = require('../'),
    assert = require('assert'),
    ArcCollection = api.internal.ArcCollection,
    NodeCollection = api.internal.NodeCollection;

describe('mapshaper-clipping.js', function () {
  describe('Bugfix ## - interior ring touches clip shape at one point', function () {
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

    it('erasing against containing ring should make inner ring disappear', function () {
      var clipLyr = {
        name: "clip",
        geometry_type: "polygon",
        shapes: [[[0, 2]]]
      };
      var targetLyr = {
        name: "target",
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [clipLyr, targetLyr]
      };

      var erasedLyr = api.erasePolygons(targetLyr, clipLyr, dataset);
      var target = [null];
      assert.deepEqual(erasedLyr.shapes, target);
    })
  })
})
