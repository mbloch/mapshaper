var assert = require('assert'),
    api = require("../"),
    utils = api.Utils;

describe('mapshaper-arc-dissolve2.js', function () {

  describe('dissolveArcs()', function () {

    describe('two adjacent triangles', function () {

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

      it('dissolve all', function() {
        var lyr = {
              geometry_type: 'polygon',
              shapes: [[[0, 1]], [[-2, 2]]]
            };

        var lyr2 = api.dissolve(lyr, arcData, null);

        assert.deepEqual(lyr2.shapes, [[[0, 2]]]); // check that dissolve worked correctly
        var arcData2 = api.dissolveArcs([lyr2], arcData);
        assert.deepEqual(lyr2.shapes, [[[0]]]);
        assert.deepEqual(arcData2.toArray(), [[[3, 1], [1, 1], [2, 3], [4, 3], [3, 1]]]);
      })


      it('dissolve nothing', function() {

        var lyr = {
              geometry_type: 'polygon',
              shapes: [[[0, 1]], [[-2, 2]]]
            };
        var arcData2 = api.dissolveArcs([lyr], arcData);
        assert.equal(arcData2.size(), 3); // same as original data
      })


      it('dissolved layer + undissolved layer', function() {
        var lyr = {
              geometry_type: 'polygon',
              shapes: [[[0, 1]], [[-2, 2]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, null);
        assert.deepEqual(lyr2.shapes, [[[0, 2]]])
        var arcData2 = api.dissolveArcs([lyr, lyr2], arcData);
        assert.equal(arcData2.size(), 3); // same as original data
        assert.deepEqual(lyr.shapes, [[[0, 1]], [[-2, 2]]])
      })
    })

    describe('shape 2', function () {

      //       e
      //      /|\
      //     / | \
      //    /  a  \
      //   /  / \  \
      //  h  d   b  f
      //   \  \ /  /
      //    \  c  /
      //     \ | /
      //      \|/
      //       g
      //
      //   abc,  cda,  ae,   efg, gc,   ghe
      //   0/-1, 1/-2, 2/-3, 3,   4/-5, 5
      var arcs = [[[3, 4, 3], [4, 3, 2]],
          [[3, 2, 3], [2, 3, 4]],
          [[3, 3], [4, 5]],
          [[3, 5, 3], [5, 3, 1]],
          [[3, 3], [1, 2]],
          [[3, 1, 3], [1, 3, 5]]];
      var arcData = new api.ArcDataset(arcs);
      it('dissolve everything', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 1}, {foo: 1}]),
              shapes: [[[0, 1]], [[2, 3, 4, -1]], [[5, -3, -2, -5]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        var arcData2 = api.dissolveArcs([lyr2], arcData);
        assert.deepEqual(lyr2.shapes, [[[0]]]);
      })

      it('dissolve into 2', function() {

        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 1}, {foo: 2}]),
              shapes: [[[0, 1]], [[2, 3, 4, -1]], [[5, -3, -2, -5]]]
            };
        // var lyr2 = api.dissolve(lyr, arcData, null);
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        //assert.deepEqual(lyr2.shapes, [[[3, 5]]]);
        assert.deepEqual(lyr2.shapes, [[[1, 2, 3, 4]], [[5, -3, -2, -5]]]);
        var arcData2 = api.dissolveArcs([lyr2], arcData);
        assert.equal(arcData2.size(), 3)
        //assert.deepEqual(lyr2.shapes, [[[0, 1, 2]], [[3, -1, -3]]])
      })
    })
  })
})
