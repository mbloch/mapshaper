var assert = require('assert'),
    api = require("../"),
    utils = api.Utils,
    ArcDataset = api.internal.ArcDataset;

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
      var arcData = new ArcDataset(arcs);

      // Handle arcs with a kink
      it('bugfix 2 (abnormal topology) test 1', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 2}]),
              shapes: [[[0, 1, ~1, 1]], [[~1, 1, ~1, 2]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0, 1]], [[~1, 2]]]);
      })

      it('bugfix 2 (abnormal topology) test 2', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, 1, ~1, 1]], [[~1, 1, ~1, 2]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
      })

      it('dissolve on "foo" 1', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, 1]], [[-2, 2]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
        assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}])
      })

      it('dissolve on "foo" 2', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, 1]], [[2, -2]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
      })

      it('dissolve on "foo" 3', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[1, 0]], [[2, -2]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
      })

      it('dissolve on null, no data table', function() {
        var lyr = {
              geometry_type: 'polygon',
              shapes: [[[1, 0]], [[2, -2]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, null);
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
        assert.ok(!lyr2.data);
      })

      it('dissolve on null + data table', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[1, 0]], [[2, -2]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, null);
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
        assert.deepEqual(lyr2.data.getRecords(), [{}]); // empty table (?)
      })

      it('dissolve on "foo" with null shapes', function() {
        var records = [{foo: 2}, {foo: 1}, {foo: 1}, {foo: 1}];
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable(records),
              shapes: [null, [[0, 1]], [[-2, 2]], null]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
        assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}])
      })

      it('no dissolve', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 2}]),
              shapes: [[[0, 1]], [[-2, 2]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0, 1]], [[-2, 2]]]);
      })

      it('bugfix 1 test 1', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, 1]], [[~1, ~0], [2, 0]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[2, 0]]]);
        assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}])
      })

      it('bugfix 1 test 2', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, 1]], [[2, 0], [~1, ~0]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[2, 0]]]);
        assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}])
      })

      it('bugfix 1 test 3', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, 2], [~1, ~0]], [[1, 0]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
        assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}])
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
      var arcData = new ArcDataset(arcs);

      it('no dissolve', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0]], [[1]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0], [1]]]);
      })

      it('no dissolve 2', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 2}]),
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
      var arcData = new ArcDataset(arcs);

      it('empty hole', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}]),
              shapes: [[[0], [-2]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0], [-2]]]);
      })

      it('dissolve filled hole', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0], [-2]], [[1]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0]]]);
      })

      it('dissolve filled hole 2', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[1]], [[-2], [0]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0]]]);
      })

      it('no dissolve filled hole', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 2}]),
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
      var arcData = new ArcDataset(arcs);

      // TODO: is this the desired behavior?
      it('dissolve a shape into itself', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}]),
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
      var arcData = new ArcDataset(arcs);

      it('dissolve two of three shapes', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}, {foo: 2}]),
              shapes: [[[0, 1]], [[2, 3, 4, -1]], [[5, -3, -2, -5]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes,
            [[[1, 2, 3, 4]], [[5, -3, -2, -5]]]);
        assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}, {foo: 2}]);
      })

      it('dissolve everything', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}, {foo: 1}]),
              shapes: [[[0, 1]], [[2, 3, 4, -1]], [[5, -3, -2, -5]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[3, 5]]]);
      })

      it('dissolve two shapes around an empty hole', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[2, 3, 4, -1]], [[5, -3, -2, -5]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[3, 5], [-1, -2]]]);
      })


      it('dissolve two shapes around a filled hole', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}, {foo: 2}]),
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
      var arcData = new ArcDataset(arcs);

      it('odd shape', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
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
      var arcData = new ArcDataset(arcs);

      it('dissolve all', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}, {foo: 1}]),
              shapes: [[[0, -4, -2, 4]], [[2, 3]], [[1, -3]]]
            };
        var lyr2 = api.dissolve(lyr, arcData, 'foo');
        assert.deepEqual(lyr2.shapes, [[[0, 4]]]);
      })

    })

    /*
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
      // ab, ae, bc, bf, cdg, df, ef, eh, fg, fi, fj, gk
      // 0,  1,  2,  3,  4,   5,  6,  7,  8,  9,  10, 11
      //
      // hi, hl, ij, im, jm, knm, lm, mn
      // 12, 13, 14, 15, 16, 17,  18, 19
      //
      var arcs = [[[1, 3], [4, 4]],
          [[1, 2], [4, 3]],
          [[3, 5], [4, 4]],
          [[3, 4], [4, 3]],
          [[5, 7, 6], [4, 4, 3]],
          [[5, 4], [4, 3]],
          [[2, 4], [3, 3]],
          [[2, 1], [3, 2]],
          [[4, 5], [3, 3]],
          [[4, 3], [3, 2]],
          [[4, 5], [3, 2]],
          [[6, 7], [3, 3]],
          [[1, 3], [2, 2]], // hi
          [[1, 2], [2, 1]], // hl
          [[3, 5], [2, 2]], // ij
          [[3, 4], [2, 1]], // im
          [[5, 7], [5, 4]], //
          [[7, 6, 4], [2, 1, 1]],
          [[2, 4], [1, 1]],
          [[4, 6], [1, 1]]];
      var arcData = new ArcDataset(arcs);

      it('patchwork', function() {
        var shapes = [[[0, 3, ~6, ~1]]]

      })
    })
    */

  })

})
