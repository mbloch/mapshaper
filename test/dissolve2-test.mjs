import assert from 'assert';
import api from '../mapshaper.js';

var ArcCollection = api.internal.ArcCollection,
    NodeCollection = api.internal.NodeCollection,
    dissolve2 = api.cmd.dissolve2,
    dissolvePolygons = function(lyr, arcs, opts) {
      // wrapper for bw compatibility with tests
      return api.internal.dissolvePolygonLayer2(lyr, {arcs: arcs, layers: [lyr], info: {}}, opts);
    };

describe('mapshaper-dissolve2.js dissolve tests', function () {

  describe('allow-overlaps tests', function() {
    it('test 1', function(done) {
      var cmd = '-i test/data/features/dissolve2/ex3_two_polygons.json -dissolve2 field=name allow-overlaps -o out.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        assert.deepEqual(json.features[0].geometry.coordinates,
          [[[0,1],[1,0],[1.5,0.5],[2,1],[1.5,1.5],[1,2],[0,1]]])
        assert.deepEqual(json.features[1].geometry.coordinates,
          [[[1.5,0.5],[2,0],[3,1],[2,2],[1.5,1.5],[1,1],[1.5,0.5]]])
        done();
      });
    })
  })

  describe('gap-fill-area= option tests', function () {

    function test(input, args, expect, done) {
      var expectArray = Array.isArray(expect);
      var cmd = '-i in.json -dissolve2 ' + args + ' -o gj2008 out.json';
      api.applyCommands(cmd, {'in.json': input}, function(err, output) {
        var out = JSON.parse(output['out.json']);
        var result = out.geometries || out.features;
        if (!expectArray) {
          assert.equal(result.length, 1);
          result = result[0];
        }
        assert.deepEqual(result, expect);
        done();
      });
    }

    it('dissolves cw ring inside another cw ring', function (done) {
      // Fig. 14
      var input = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]]]
        }, {
          type: 'Polygon',
          coordinates: [[[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]]
        }]
      };
      var expect = {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]]]
      };
      test(input, '', expect, done);
    })

    it('dissolving single polygon preserves hole', function (done) {
      // Fig. 14
      var input = {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]]
      };
      var expect = {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]]
      };
      test(input, '', expect, done);
    })

    it('dissolving single polygon with gap-fill-area=<area> removes hole', function (done) {
      // Fig. 14
      var input = {
        type: 'Polygon',
        coordinates: [[[0, 100], [0, 103], [3, 103], [3, 100], [0, 100]],  // y-coord is kludge to prevent lat-long detection
          [[1, 101], [2, 101], [2, 102], [1, 102], [1, 101]]]
      };
      var expect = {
        type: 'Polygon',
        coordinates: [[[0, 100], [0, 103], [3, 103], [3, 100], [0,100]]]
      };
      test(input, 'gap-fill-area=1.1', expect, done);
    })

    it('gap-fill-area=<area> supports units', function(done) {
      // Fig. 14
      var input = {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 13], [3, 13], [3, 0], [0, 0]],
          [[1, 1], [1.02, 1], [1.02, 1.02], [1, 1.02], [1, 1]]]
      };
      var expect = {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 13], [3, 13], [3, 0], [0, 0]]]
      };
      test(input, 'gap-fill-area=10km2', expect, done);
    })


    it('dissolving single polygon with gap-fill-area=<smaller area> retains hole', function (done) {
      // Fig. 14
      var input = {
        type: 'Polygon',
        coordinates: [[[0, 100], [0, 103], [3, 103], [3, 100], [0, 100]],  // y-coord is kludge to prevent lat-long detection
          [[1, 101], [2, 101], [2, 102], [1, 102], [1, 101]]]
      };
      var expect = {
        type: 'Polygon',
        coordinates: [[[0, 100], [0, 103], [3, 103], [3, 100], [0,100]],
          [[1, 101], [2, 101], [2, 102], [1, 102], [1, 101]]]
      };
      test(input, 'gap-fill-area=0.9 sliver-control=0', expect, done);
    })


    it('donut and hole dissolve cleanly', function (done) {
      // Fig. 14
      var input = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]]
        }, {
          type: 'Polygon',
          coordinates: [[[1, 2], [2, 2], [2, 1], [1, 1], [1, 2]]] // rotated relative to containing hole
        }]
      };
      var expect = {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]]]
      };
      test(input, '', expect, done);
    })
  })


  it('Fix: dissolving preserves simplification', function(done) {
    var input = {
      type: 'Polygon',
      coordinates: [[[0,0], [0,1], [0.1, 1.1], [0, 1.2], [0, 2], [2,2], [2, 0], [0, 0]]]
    };
    api.applyCommands('-i in.json -simplify planar interval=0.5 -dissolve2 -o gj2008 out.json', {'in.json': input}, function(err, output) {
      var json = JSON.parse(output['out.json']);
      assert.deepEqual(json.geometries[0].coordinates, [[[0,0], [0, 2], [2,2], [2, 0], [0, 0]]])
      done();
    })
  })

  describe('Issue #206', function() {

    it('Fully contained polygon is dissolved', function(done) {
      var innerRing = {
        "type": "Polygon",
        "coordinates": [[[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]]
      };

      var outerRing = {
        "type": "Polygon",
        "coordinates": [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]]]
      };

      var target = {
        "type": "Polygon",
        "coordinates": [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]]]
      };

      api.applyCommands('-i inner.json outer.json combine-files -merge-layers -dissolve2 -o gj2008 out.json',
        {'inner.json': innerRing, 'outer.json': outerRing}, function(err, output) {
          var json = JSON.parse(output['out.json']);
          assert.deepEqual(json.geometries[0], target)
          done();
        })
    })

    // see test file dissolve2/ex1.json
    it('Space-enclosing rings take precedence over holes in areas of overlap', function(done) {
      var input = {
        type: 'GeometryCollection',
        geometries: [
          {
            type: 'Polygon',
            coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]]
          }, {
            type: 'Polygon',
            coordinates: [[[-1,-1], [-1, 4], [4, 4], [4, -1], [-1, -1]], [[1.1, 1.1], [1.9, 1.1], [1.9, 1.9], [1.1, 1.9], [1.1, 1.1]]]
          }
        ]
      };

      var target = {
        type: 'Polygon',
        coordinates: [[[-1,-1], [-1, 4], [4, 4], [4, -1], [-1, -1]],  [[1.1, 1.1], [1.9, 1.1], [1.9, 1.9], [1.1, 1.9], [1.1, 1.1]]]
      };

      api.applyCommands('-i input.json -dissolve2 gap-fill-area=0 -o gj2008 out.json',
        {'input.json': input}, function(err, output) {
          var json = JSON.parse(output['out.json']);
          assert.deepEqual(json.geometries[0], target);
          done();
        })

    })


    it('Smallest enclosing ring is found in atypical case', function(done) {
      // Large polygon with an L-shaped hole and a small polygon; small polygon is outside hole, but its bbox is inside hole bbox
      // outcome: small polygon should be removed
      var poly = {
        type: 'MultiPolygon',
        coordinates: [
          [[[0, 0], [0, 6], [6, 6], [6, 0], [0, 0]], [[1, 1], [2, 1], [2, 4], [5, 4], [5, 5], [1, 5], [1, 1]]],
          [[[3, 2], [3, 3], [4, 3], [4, 2], [3, 2]]]]
      };

      var target = {
        type: 'Polygon',
        coordinates:  [[[0, 0], [0, 6], [6, 6], [6, 0], [0, 0]], [[1, 1], [2, 1], [2, 4], [5, 4], [5, 5], [1, 5], [1, 1]]]
      };

      api.applyCommands('-i input.json -dissolve2 -o gj2008 out.json', {'input.json': poly}, function(err, output) {
        output = JSON.parse(output['out.json']).geometries[0];
        assert.deepEqual(output, target);
        done();
      })

    })

  })


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
      var dissolved = dissolve2([lyr], dataset)
      assert.deepEqual(dissolved[0].shapes, target);
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
      var dissolved = dissolve2(dataset.layers, dataset);
      assert.deepEqual(dissolved[0].shapes, target);
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
      var dissolved = dissolve2(dataset.layers, dataset);
      assert.deepEqual(dissolved[0].shapes, target);
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
      var dissolved = dissolve2(dataset.layers, dataset);
      assert.deepEqual(dissolved[0].shapes, target);
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
      var dissolved = dissolve2(dataset.layers, dataset);
      assert.deepEqual(dissolved[0].shapes, target);
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

    it('dissolve a shape into itself', function () {
      var shapes = [[[1, 2, ~1, ~0]]];
      // var target = [[[2],[~0]]];
      var target = [[[~0],[2]]]; // new dissolve function put this hole first
      assert.deepEqual(dissolvePolygons({shapes: shapes}, new ArcCollection(coords)).shapes, target);
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
      assert.deepEqual(dissolvePolygons({shapes: shapes}, arcs).shapes, target);
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

    // TODO: removal is a consequence of blocking shared boundaries of
    //   adjacent polygons -- need to reconsider this?
    it('stem of hourglass is removed', function () {
      var arcs = new ArcCollection(coords);
      var shapes = [[[0, 1, 2, 3, ~1]]];
      var target = [[[0], [2, 3]]];
      assert.deepEqual(dissolvePolygons({shapes: shapes}, arcs).shapes, target);
    })

    it('stem of hourglass is removed 2', function () {
      var arcs = new ArcCollection(coords);
      var shapes = [[[1, 2, 3, ~1, 0]]]; // shape starts at stem
      var target = [[[0], [2, 3]]];
      assert.deepEqual(dissolvePolygons({shapes: shapes}, arcs).shapes, target);
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
      var arcs = new ArcCollection(coords);
      var shapes = [[[0, 1, ~1, 2]]];
      var target = [[[0, 2]]];
      assert.deepEqual(dissolvePolygons({shapes: shapes}, arcs).shapes, target);
    })

    it ('should skip spike - test 2', function() {
      var arcs = new ArcCollection(coords);
      var shapes = [[[1, ~1, 2, 0]]];
      var target = [[[0, 2]]];
      assert.deepEqual(dissolvePolygons({shapes: shapes}, arcs).shapes, target);
    })

    it ('should skip spike - test 3', function() {
      var arcs = new ArcCollection(coords);
      var shapes = [[[~1, 2, 0, 1]]];
      var target = [[[0, 2]]];
      assert.deepEqual(dissolvePolygons({shapes: shapes}, arcs).shapes, target);
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
      assert.deepEqual(dissolvePolygons({shapes: shapes}, arcs).shapes, target);
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
      var lyr2 = dissolvePolygons(lyr, new ArcCollection(coords), {field: 'foo'});
      assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
      assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}])
    })


    it('dissolve on "foo" 2', function() {
      var lyr = {
            geometry_type: 'polygon',
            data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
            shapes: [[[0, 1]], [[2, -2]]]
          };
      var lyr2 = dissolvePolygons(lyr, new ArcCollection(coords), {field: 'foo'});
      assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
    })

    it('dissolve on "foo" 3', function() {
      var lyr = {
            geometry_type: 'polygon',
            data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
            shapes: [[[1, 0]], [[2, -2]]]
          };
      var lyr2 = dissolvePolygons(lyr, new ArcCollection(coords), {field: 'foo'});
      assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
    })

    it('dissolve on null + data table', function() {
      var lyr = {
            geometry_type: 'polygon',
            data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
            shapes: [[[1, 0]], [[2, -2]]]
          };
      var lyr2 = dissolvePolygons(lyr, new ArcCollection(coords), {});
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
      var lyr2 = dissolvePolygons(lyr, new ArcCollection(coords), {field: 'foo'});
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
      var lyr2 = dissolvePolygons(lyr, new ArcCollection(coords), {field: 'foo'});
      assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}, {foo: 2}])
      assert.deepEqual(lyr2.shapes, [[[0, 2]], null]);
    })

    it('no dissolve', function() {
      var lyr = {
            geometry_type: 'polygon',
            data: new api.internal.DataTable([{foo: 1}, {foo: 2}]),
            shapes: [[[0, 1]], [[-2, 2]]]
          };
      var lyr2 = dissolvePolygons(lyr, new ArcCollection(coords), {field: 'foo'});
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
      var lyr2 = dissolve2(dataset.layers, dataset, {field:'foo'})[0];
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
      var lyr2 = dissolve2(dataset.layers, dataset, {field: 'foo'})[0];
      assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
    })

  })

})
