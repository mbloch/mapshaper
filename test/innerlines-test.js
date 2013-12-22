var assert = require('assert'),
    api = require("../");

describe('mapshaper-innerlines.js', function () {
  describe('convertLayerToInnerLines()', function () {
    it('test 1', function () {

      //      b --- d
      //     / \   /
      //    /   \ /
      //   a --- c
      //
      //   cab, bc,   bdc
      //   0,   1/-2, 2

      var arcs = [[[3, 1, 2], [1, 1, 3]],
          [[2, 3], [3, 1]],
          [[2, 4, 3], [3, 3, 1]]];
      var arcData = new api.ArcDataset(arcs);
      var lyr = {
            name: 'shape',
            geometry_type: 'polygon',
            shapes: [[[0, 1]], [[-2, 2]]]
          };
      var lyr2 = api.convertLayerToInnerLines(lyr, arcData);
      assert.deepEqual(lyr2.shapes, [[[1]]]);
      assert.equal(lyr2.geometry_type, 'polyline');
      assert.equal(lyr2.name, 'shape'); // same as original name
    })

  })
})
