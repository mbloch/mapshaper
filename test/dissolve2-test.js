var assert = require('assert'),
    api = require("../"),
    ArcCollection = api.internal.ArcCollection,
    NodeCollection = api.internal.NodeCollection,
    dissolvePolygons2 = api.dissolvePolygons2,
    dissolvePolygons = api.internal.dissolvePolygonLayer;

describe('mapshaper-dissolve2.js dissolve tests', function () {
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
      var lyr = {
        geometry_type: "polygon",
        shapes: shapes
      };
      var dataset = {
        arcs: arcs,
        layers: [lyr]
      };

      var target = [[[0, 2]]];
      var dissolved = dissolvePolygons2(lyr, dataset)
      assert.deepEqual(dissolved.shapes, target);
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

    it ('ignores collapsed arcs', function() {
     var arcs = new api.internal.ArcCollection(coords);
     var lyr = {
        geometry_type: "polygon",
        shapes: [[[1, 0]], [[2, 5, 3, -2]]]
      },
      dataset = {
        arcs: arcs,
        layers: [lyr]
      };

      var target = [[[0, 2, 3]]];
      var dissolved = dissolvePolygons2(lyr, dataset);
      assert.deepEqual(dissolved.shapes, target);
    });

    it ('ignores collapsed arcs 2', function() {
      var arcs = new api.internal.ArcCollection(coords);
      var lyr = {
        geometry_type: "polygon",
        shapes: [[[4, 1, 0]], [[~4, 2, 3, -2]]]
      },
      dataset = {
        arcs: arcs,
        layers: [lyr]
      };

      var target = [[[0, 2, 3]]];
      var dissolved = dissolvePolygons2(lyr, dataset);
      assert.deepEqual(dissolved.shapes, target);
    })

    it ('ignores collapsed arcs 3', function() {
     var arcs = new api.internal.ArcCollection(coords);
     var lyr = {
        geometry_type: "polygon",
        shapes: [[[4, 4, 1, 0, 4]], [[~4, 2, 3, -2, 4]]]
      },
      dataset = {
        arcs: arcs,
        layers: [lyr]
      };

      var target = [[[0, 2, 3]]];
      var dissolved = dissolvePolygons2(lyr, dataset);
      assert.deepEqual(dissolved.shapes, target);
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

    it('filled triangle', function () {
      var arcs = new ArcCollection(coords);
      var lyr = {
        geometry_type: "polygon",
        shapes: [[[0, ~1, 2]], [[1]]]
      },
      dataset = {
        arcs: arcs,
        layers: [lyr]
      };

      var target = [[[0, 2]]];
      var dissolved = dissolvePolygons2(lyr, dataset);
      assert.deepEqual(dissolved.shapes, target);
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
    var nodes = new NodeCollection(coords);

    it('dissolve a shape into itself', function () {
      var shapes = [[[1, 2, ~1, ~0]]];
      var target = [[[2],[~0]]];
      assert.deepEqual(dissolvePolygons({shapes: shapes}, nodes).shapes, target);
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
    var nodes = new NodeCollection(coords);

    it('dissolve all', function () {
      var shapes = [[[0, ~3, ~1, 4]], [[2, 3]], [[1, ~2]]];
      var target = [[[0, 4]]]
      assert.deepEqual(dissolvePolygons({shapes: shapes}, nodes).shapes, target);
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
    var nodes = new NodeCollection(coords);

    // TODO: removal is a consequence of blocking shared boundaries of
    //   adjacent polygons -- need to reconsider this?
    it('stem of hourglass is removed', function () {
      var shapes = [[[0, 1, 2, 3, ~1]]];
      var target = [[[0], [2, 3]]];
      assert.deepEqual(dissolvePolygons({shapes: shapes}, nodes).shapes, target);
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

    it ('should skip spike - test 1', function() {
      var nodes = new NodeCollection(coords);
      var shapes = [[[0, 1, ~1, 2]]];
      var target = [[[0, 2]]];
      assert.deepEqual(dissolvePolygons({shapes: shapes}, nodes).shapes, target);
    })

    it ('should skip spike - test 2', function() {
      var nodes = new NodeCollection(coords);
      var shapes = [[[1, ~1, 2, 0]]];
      var target = [[[2, 0]]];
      assert.deepEqual(dissolvePolygons({shapes: shapes}, nodes).shapes, target);
    })

    it ('should skip spike - test 3', function() {
      var nodes = new NodeCollection(coords);
      var shapes = [[[~1, 2, 0, 1]]];
      var target = [[[2, 0]]];
      assert.deepEqual(dissolvePolygons({shapes: shapes}, nodes).shapes, target);
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
    var nodes = new NodeCollection(coords);

    it ('should dissolve overlapping rings', function() {
      var shapes = [[[0, 1]], [[2, 3]]];
      var target = [[[0, 3]]];
      assert.deepEqual(dissolvePolygons({shapes: shapes}, nodes).shapes, target);
    })
  })

  describe('two adjacent triangles', function () {

    //      b --- d
    //     / \   /
    //    /   \ /
    //   a --- c
    //
    //   cab, bc, bdc
    //   0,   1,  2

    var coords = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]];

    it('dissolve on "foo" 1', function() {
      var lyr = {
            geometry_type: 'polygon',
            data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
            shapes: [[[0, 1]], [[-2, 2]]]
          };
      var lyr2 = dissolvePolygons(lyr, new NodeCollection(coords), {field: 'foo'});
      assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
      assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}])
    })


    it('dissolve on "foo" 2', function() {
      var lyr = {
            geometry_type: 'polygon',
            data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
            shapes: [[[0, 1]], [[2, -2]]]
          };
      var lyr2 = dissolvePolygons(lyr, new NodeCollection(coords), {field: 'foo'});
      assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
    })

    it('dissolve on "foo" 3', function() {
      var lyr = {
            geometry_type: 'polygon',
            data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
            shapes: [[[1, 0]], [[2, -2]]]
          };
      var lyr2 = dissolvePolygons(lyr, new NodeCollection(coords), {field: 'foo'});
      assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
    })

    it('dissolve on null + data table', function() {
      var lyr = {
            geometry_type: 'polygon',
            data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
            shapes: [[[1, 0]], [[2, -2]]]
          };
      var lyr2 = dissolvePolygons(lyr, new NodeCollection(coords), {});
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
      var lyr2 = dissolvePolygons(lyr, new NodeCollection(coords), {field: 'foo'});
      assert.deepEqual(lyr2.shapes, [null, [[0, 2]]]);
      assert.deepEqual(lyr2.data.getRecords(), [{foo: 2}, {foo: 1}])
    })

    it('dissolve on "foo" with null shapes 2', function() {
      var records = [{foo: 1}, {foo: 1}, {foo: 1}, {foo: 2}];
      var lyr = {
            geometry_type: 'polygon',
            data: new api.internal.DataTable(records),
            shapes: [null, [[0, 1]], [[-2, 2]], null]
          };
      var lyr2 = dissolvePolygons(lyr, new NodeCollection(coords), {field: 'foo'});
      assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}, {foo: 2}])
      assert.deepEqual(lyr2.shapes, [[[0, 2]], null]);
    })

    it('no dissolve', function() {
      var lyr = {
            geometry_type: 'polygon',
            data: new api.internal.DataTable([{foo: 1}, {foo: 2}]),
            shapes: [[[0, 1]], [[-2, 2]]]
          };
      var lyr2 = dissolvePolygons(lyr, new NodeCollection(coords), {field: 'foo'});
      assert.deepEqual(lyr2.shapes, [[[0, 1]], [[-2, 2]]]);
    })


    // Handle arcs with a kink
    it('bugfix 2 (abnormal topology) test 1', function() {
      var lyr = {
            geometry_type: 'polygon',
            data: new api.internal.DataTable([{foo: 1}, {foo: 2}]),
            shapes: [[[0, 1, ~1, 1]], [[~1, 1, ~1, 2]]]
          },
          dataset = {
            layers:[lyr],
            arcs: new ArcCollection(coords)
          };
      var lyr2 = dissolvePolygons2(lyr, dataset, {field:'foo'});
      assert.deepEqual(lyr2.shapes, [[[0, 1]], [[~1, 2]]]);
    })

    it('bugfix 2 (abnormal topology) test 2', function() {
      var lyr = {
            geometry_type: 'polygon',
            data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
            shapes: [[[0, 1, ~1, 1]], [[~1, 1, ~1, 2]]]
          },
          dataset = {
            layers: [lyr],
            arcs: new ArcCollection(coords)
          };
      var lyr2 = dissolvePolygons2(lyr, dataset, {field: 'foo'});
      assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
    })

  })

})
