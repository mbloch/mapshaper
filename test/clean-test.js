var assert = require('assert'),
    api = require("../"),
    ArcCollection = api.internal.ArcCollection;

function clean(shapes, arcs) {
  var dataset = {
    arcs: arcs,
    layers: [{
      geometry_type: 'polygon',
      shapes: shapes
    }]
  };
  api.cleanLayers(dataset.layers, dataset, {no_arc_dissolve: true});
  return dataset.layers[0].shapes;
}

function cleanArcs(dataset) {
  api.cleanLayers(dataset.layers, dataset, {arcs: true});
}


describe('mapshaper-clean.js', function () {

  describe('clean arcs', function () {
    it('removes unused arcs', function () {
      var arcs = [[[0, 0], [1, 0]], [[0, 1], [1, 1]], [[0, 2], [1, 2]], [[0, 3], [1, 3]]];
      var dataset = {
        layers: [{
          geometry_type: 'polyline',
          shapes: [[[0, 1], [3]]]
        }],
        arcs: new ArcCollection(arcs)
      };
      cleanArcs(dataset);
      var expectedShapes = [[[0, 1], [2]]];
      var expectedArcs = [[[0, 0], [1, 0]], [[0, 1], [1, 1]], [[0, 3], [1, 3]]];
      assert.deepEqual(dataset.arcs.toArray(), expectedArcs)
      assert.deepEqual(dataset.layers[0].shapes, expectedShapes)
    })
  })

  describe('-clean command', function () {

  it('Removes empty geometries by default', function(done) {
      //  a ----- b
      //  |       |
      //  |       |
      //  |       |
      //  d ----- c

      var input = {
        type: 'FeatureCollection',
        features: [{
          type: "Feature",
          properties: {id: 0},
          geometry: null
        }, {
          type: "Feature",
          properties: {id: 1},
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 1], [1, 1], [1, 0], [0, 0], [0, 1]]]
          }
        }, {
          type: "Feature",
          properties: {id: 2},
          geometry: null
        }]};

      var expected = {
        type: 'FeatureCollection',
        features: [{
          type: "Feature",
          properties: {id: 1},
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 1], [1, 1], [1, 0], [0, 0], [0, 1]]]
          }
        }]};
      api.applyCommands('-i poly.json -clean -o', {'poly.json': input}, function(err, output) {
        var poly2 = JSON.parse(output['poly.json']);
        assert.deepEqual(poly2, expected);
        done();
      });
    })

  it('Retains empty geometries if "allow-empty" flag is present', function(done) {
      //  a ----- b
      //  |       |
      //  |       |
      //  |       |
      //  d ----- c

      var input = {
        type: 'FeatureCollection',
        features: [{
          type: "Feature",
          properties: {id: 0},
          geometry: null
        }, {
          type: "Feature",
          properties: {id: 1},
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 1], [1, 1], [1, 0], [0, 0], [0, 1]]]
          }
        }, {
          type: "Feature",
          properties: {id: 2},
          geometry: null
        }]};

      api.applyCommands('-i poly.json -clean allow-empty -o', {'poly.json': input}, function(err, output) {
        var poly2 = JSON.parse(output['poly.json']);
        assert.deepEqual(poly2, input);
        done();
      });
    });


    it('Removes overlapping section in GeoJSON input', function(done) {
      api.applyCommands('-i test/data/features/clean/overlapping_polygons.json -clean -o out.json', null, function(err, data) {
        var geojson = JSON.parse(data['out.json']);
        var a = geojson.geometries[0].coordinates;
        var b = geojson.geometries[1].coordinates;
        assert.deepEqual(a, [ [ [ 0, 0 ], [ 0, 2 ], [ 2, 2 ], [ 1, 1 ], [ 2, 0 ], [ 0, 0 ] ] ])
        assert.deepEqual(b, [ [ [ 2, 0 ], [ 1, 1 ], [ 2, 2 ], [ 3, 3 ], [ 5, 1 ], [ 3, -1 ], [ 2, 0 ] ] ])
        done();
      })

    })

    it('Removes spurious endpoints (arc dissolve)', function(done) {
      //  a ----- b
      //  |       |
      //  |       c
      //  |       |
      //  f - e - d

      var poly = {
        type: 'Polygon',
        coordinates: [[[0, 1], [1, 1], [1, 0.5], [1, 0], [0.5, 0], [0.5, 0], [0, 0], [0, 1]]]
      }
      var expected = poly = {
        type: 'Polygon',
        coordinates: [[[0, 1], [1, 1], [1, 0], [0, 0], [0, 1]]]
      }
      api.applyCommands('-i poly.json -clean -o', {'poly.json': poly}, function(err, output) {
        var poly2 = JSON.parse(output['poly.json']).geometries[0];
        assert.deepEqual;(poly2, expected);
        done();

      });

    })

    it('handles bowtie shapes', function(done) {
      // Fig 16 in figures.txt
      var a = {
        type: "Polygon",
        coordinates: [[[0, 2], [2, 2], [3, 2], [2, 3], [2, 2], [2, 0], [0, 0], [0, 2]]]
      }
      var b = {
        type: "Polygon",
        coordinates: [[[4, 2], [2, 2], [2, 4], [4, 2]]]
      }
      var input = {
        type: 'GeometryCollection',
        geometries: [a, b]
      };
      var expected = [{
        type: 'MultiPolygon',
        coordinates: [[[[3, 2], [2, 2], [2, 3], [3, 2]]], [[[2, 2], [2, 0], [0, 0], [0, 2], [2, 2]]]]
      }, {
        type: 'Polygon',
        coordinates: [[[3, 2], [2, 3], [2, 4], [4, 2], [3, 2]]]
      }];
      api.applyCommands('-i input.json -clean -o output.json', {'input.json': input}, function(err, out) {
        var geojson = JSON.parse(out['output.json']);
        assert.deepEqual(geojson.geometries, expected);
        done();
      })
    })

  })

  describe('cleanLayers()', function() {

    describe('Fig. 1', function() {
      //
      //      b --- d
      //     / \   /
      //    /   \ /
      //   a --- c
      //

      it('adjacent shapes are preserved', function () {
        //   cab, bc, bdc
        //   0,   1,  2
        var coords = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]];
        var arcs = new api.internal.ArcCollection(coords);

        var shapes = [[[1, 0]], [[2, -2]]];
        var target = [[[0, 1]], [[-2, 2]]]; // new mosaic-based clean function can re-arrange arc order
        assert.deepEqual(clean(shapes, arcs), target);
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
        var shapes = [[[1, 0]], [[2, 5, 3, -2]]];
        var target = [[[0, 1]], [[~1, 2, 3]]];
        assert.deepEqual(clean(shapes, arcs), target);
      })


      it ('ignores collapsed arcs 2', function() {
        var arcs = new api.internal.ArcCollection(coords);
        var shapes = [[[4, 1, 0]], [[~4, 2, 3, -2]]];
        var target = [[[0, 1]], [[~1, 2, 3]]];
        arcs = new api.internal.ArcCollection(coords);
        assert.deepEqual(clean(shapes, arcs), target);
      })

      it ('ignores collapsed arcs 3', function() {
        var arcs = new api.internal.ArcCollection(coords);
        var shapes = [[[4, 4, 1, 0, 4]], [[~4, 2, 3, -2, 4]]];
        var target = [[[0, 1]], [[~1, 2, 3]]];
        assert.deepEqual(clean(shapes, arcs), target);
      })
    })

    describe('Fig. 2', function () {
      //
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

      it('paths are preserved', function () {
        var shapes = [[[1, 2, -2, -1]]];
        // var target = [[[1, 2, -2, -1]]];
        var target = [[[-1], [2]]]; // new clean function dissolves the shape
        assert.deepEqual(clean(shapes, arcs), target);

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

      it('paths are preserved', function () {
        var shapes = [[[0, ~1, 2]], [[1]]];
        var target = [[[0, ~1, 2]], [[1]]];
        assert.deepEqual(clean(shapes, arcs), target);
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

      it('paths are preserved', function () {
        var shapes = [[[0, ~3, ~1, 4]], [[2, 3]], [[1, ~2]]];
        var target = [[[0, ~3, ~1, 4]], [[2, 3]], [[1, ~2]]];
        assert.deepEqual(clean(shapes, arcs), target);
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

      it('hourglass shape is preserved', function () {
        var shapes = [[[0, 1, 2, 3, ~1]]];
        var target = [[[0], [2, 3]]];
        assert.deepEqual(clean(shapes, arcs), target);
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
        var shapes = [[[0, 1, ~1, 2]]];
        var target = [[[0, 1]]];
        var arcs = new ArcCollection(coords);
        assert.deepEqual(clean(shapes, arcs), target);
      })

      it ('should skip spike - test 2', function() {
        var shapes = [[[1, ~1, 2, 0]]];
        var target = [[[0, 1]]];
        var arcs = new ArcCollection(coords);
        assert.deepEqual(clean(shapes, arcs), target);
      })

      it ('should skip spike - test 3', function() {
        var shapes = [[[~1, 2, 0, 1]]];
        var target = [[[0, 1]]];
        var arcs = new ArcCollection(coords);
        assert.deepEqual(clean(shapes, arcs), target);
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

      it ('should remove overlapping portion of smaller ring', function() {
        var shapes = [[[0, 1]], [[2, 3]]];
        var target = [[[0, ~2], [1, 2]], [[3, ~1]]];
        var target = [[[0, ~2]], [[2, 3]]]
        assert.deepEqual(clean(shapes, arcs), target);
      })
    })
  })
})
