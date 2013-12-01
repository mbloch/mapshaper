var assert = require('assert'),
    api = require("../"),
    utils = api.Utils;

describe('mapshaper-dissolve.js', function () {

  describe('dissolve()', function () {

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

      it('dissolve 1', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, 1]], [[-2, 2]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
      })

      it('dissolve 2', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, 1]], [[2, -2]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
      })

      it('dissolve 3', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[1, 0]], [[2, -2]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
      })

      it('no dissolve', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 2}]),
              shapes: [[[0, 1]], [[-2, 2]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0, 1]], [[-2, 2]]]);
      })
    })

    describe('two islands', function () {

      //      b     d --- e
      //     / \     \   /
      //    /   \     \ /
      //   a --- c     f
      //
      //   cabc, defd
      //   0,    1

      var arcs = [[[3, 1, 2, 3], [1, 1, 3, 1]],
          [[4, 6, 5, 4], [3, 3, 1, 3]]];
      var arcData = new api.ArcDataset(arcs);

      it('no dissolve', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0]], [[1]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0], [1]]]);
      })

      it('no dissolve 2', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 2}]),
              shapes: [[[0]], [[1]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0]], [[1]]]);
      })
    })

    describe('simple hole', function () {

      //       e
      //      / \
      //     /   \
      //    /  a  \
      //   /  / \  \
      //  h  d   b  f
      //   \  \ /  /
      //    \  c  /
      //     \   /
      //      \ /
      //       g
      //
      //   abcda, efghe
      //   0/-1,  1

      var arcs = [[[3, 4, 3, 2, 3], [4, 3, 2, 3, 4]],
          [[3, 5, 3, 1, 3], [5, 3, 1, 3, 5]]];
      var arcData = new api.ArcDataset(arcs);

      it('empty hole', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}]),
              shapes: [[[0], [-2]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0], [-2]]]);
      })

      it('dissolve filled hole', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0], [-2]], [[1]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0]]]);
      })

      it('dissolve filled hole 2', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[1]], [[-2], [0]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0]]]);
      })

      it('no dissolve filled hole', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 2}]),
              shapes: [[[0], [-2]], [[1]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0], [-2]], [[1]]]);
      })
    })

    describe('shape 1', function () {

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
      //   abcda, ae,   efghe
      //   0/-1,  1/-2, 2

      var arcs = [[[3, 4, 3, 2, 3], [4, 3, 2, 3, 4]],
          [[3, 3], [4, 5]],
          [[3, 5, 3, 1, 3], [5, 3, 1, 3, 5]]];
      var arcData = new api.ArcDataset(arcs);

      // TODO: is this the desired behavior?
      it('dissolve a shape into itself', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}]),
              shapes: [[[1, 2, -2, -1]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[2],[-1]]]);
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

      it('dissolve two of three shapes', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 1}, {foo: 2}]),
              shapes: [[[0, 1]], [[2, 3, 4, -1]], [[5, -3, -2, -5]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes,
            [[[1, 2, 3, 4]], [[5, -3, -2, -5]]]);
      })

      it('dissolve everything', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 1}, {foo: 1}]),
              shapes: [[[0, 1]], [[2, 3, 4, -1]], [[5, -3, -2, -5]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[3, 5]]]);
      })


      it('dissolve two shapes around an empty hole', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[2, 3, 4, -1]], [[5, -3, -2, -5]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[3, 5], [-1, -2]]]);
      })


      it('dissolve two shapes around a filled hole', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 1}, {foo: 2}]),
              shapes: [[[2, 3, 4, -1]], [[5, -3, -2, -5]], [[0, 1]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[3, 5], [-1, -2]], [[0, 1]]]);
      })
    })


    describe('shape 3', function () {

      //
      //  d -- e -- a
      //  |   / \   |
      //  |  g - f  |
      //  |         |
      //  c ------- b
      //
      //   abcde, efge,  ea
      //   0,     1/-2, 3

      var arcs = [[[5, 5, 1, 1, 3], [3, 1, 1, 3, 3]],
          [[3, 4, 2, 3], [3, 2, 2, 3]],
          [[3, 5], [3, 3]]];
      var arcData = new api.ArcDataset(arcs);

      it('odd shape', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, -2, 3]], [[1]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0, 3]]]);

      })
    })

    describe('shape 4', function () {

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

      var arcs = [[[5, 5, 1, 1, 3], [4, 1, 1, 4, 4]],
          [[3, 4, 3], [4, 3, 2]],
          [[3, 3], [4, 2]],
          [[3, 2, 3], [2, 3, 4]],
          [[3, 5], [4, 4]]];
      var arcData = new api.ArcDataset(arcs);

      it('dissolve all', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 1}, {foo: 1}]),
              shapes: [[[0, -4, -2, 4]], [[2, 3]], [[1, -3]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0, 4]]]);
      })

      /*
      // TODO: test partial dissolves of this figure
      it('dissolve 2', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.data.DataTable([{foo: 1}, {foo: 2}, {foo: 1}]),
              shapes: [[[0, -4, -2, 4]], [[2, 3]], [[1, -3]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[]]]);
      })
      */

    })


    describe('shape 5', function () {

      //
      //    a - b - c - d
      //     \   \ /   /
      //      e - f - g
      //     /   / \   \
      //    h - i - j - k
      //     \   \ /   /
      //      l - m - n
      //

    })

  })

})
