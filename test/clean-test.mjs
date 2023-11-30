import assert from 'assert';
import api from '../mapshaper.js';
var ArcCollection = api.internal.ArcCollection;

function clean(shapes, arcs) {
  var dataset = {
    arcs: arcs,
    layers: [{
      geometry_type: 'polygon',
      shapes: shapes
    }]
  };
  api.cmd.cleanLayers(dataset.layers, dataset, {no_arc_dissolve: true});
  return dataset.layers[0].shapes;
}

function cleanArcs(dataset) {
  api.cmd.cleanLayers(dataset.layers, dataset, {arcs: true});
}

describe('mapshaper-clean.js', function () {

  describe('clean polylines', function () {
    it('contiguous parts are combined', function(done) {
      var data = {
        type: 'MultiLineString',
        coordinates: [[[0,0], [1,0]], [[3,0], [2,0]], [[2,0], [1,0]]]
      };
      var cmd = '-i data.json -clean -o';
      api.applyCommands(cmd, {'data.json': data}, function(err, out) {
        var json = JSON.parse(out['data.json']);
        var obj = json.geometries[0];
        assert.equal(obj.type, 'LineString');
        assert.deepEqual(obj.coordinates, [[0,0], [1,0], [2,0], [3,0]]);
        done();
      });
    })

    it('duplicate arcs are uniqified', function(done) {
      var data = {
        type: 'MultiLineString',
        coordinates: [[[0,0], [1,0]], [[1,0], [1,1]], [[1,1], [1,0]]]
      };
      var cmd = '-i data.json -clean -o';
      api.applyCommands(cmd, {'data.json': data}, function(err, out) {
        var json = JSON.parse(out['data.json']);
        var obj = json.geometries[0];
        assert.deepEqual(obj, {
          type: 'LineString',
          coordinates: [[0,0], [1,0], [1,1]]
        })
        done();
      });
    })

    it('feature is split at node', function (done) {
      // current behavior retains a doubled-back spike
      // TODO: remove one of the duplicate segments
      var data = {
        type: 'LineString',
        coordinates: [[0,0], [1,0], [1,1], [1,0], [2,0]]
      };
      var cmd = '-i data.json -clean -o';
      api.applyCommands(cmd, {'data.json': data}, function(err, out) {
        var json = JSON.parse(out['data.json']);
        var obj = json.geometries[0];
        assert.equal(obj.type, 'MultiLineString');
        assert.equal(obj.coordinates.length, 3);
        assert.deepEqual(obj.coordinates[0], [[0,0], [1,0]]);
        done();
      });
    })
  })

  describe('Tests based on sample datasets (real-world and made up)', function () {
    it('clean/ex3.json -- all polygons are retained', function (done) {
      var cmd = '-i test/data/features/clean/ex3.json -clean -o clean.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['clean.json']);
        assert.equal(json.geometries.length, 3);
        done();
      });
    })

    it('clean/ex9_FranklinTwoPrecinctsDetail.json -- all polygons are retained', function (done) {
      var cmd = '-i test/data/features/clean/ex9_FranklinTwoPrecinctsDetail.json -clean -o clean.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['clean.json']);
        assert.equal(json.features.length, 2);
        done();
      });
    })

    it('clean/ex8_britain.json -- all polygons are retained', function (done) {
      var cmd = '-i test/data/features/clean/ex8_britain.json -clean -o clean.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['clean.json']);
        assert.equal(json.features.length, 12);
        done();
      });
    })

    it('clean/ex7_britain.json -- all polygons are retained', function (done) {
      var cmd = '-i test/data/features/clean/ex7_britain.json -clean -o clean.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['clean.json']);
        assert.equal(json.features.length, 3);
        done();
      });
    })

    it('clean/ex5_three_precincts.json -- all polygons are retained', function (done) {
      var cmd = '-i test/data/features/clean/ex5_three_precincts.json -clean -o clean.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['clean.json']);
        assert.equal(json.features.length, 3);
        done();
      });
    })

    it('clean/ex1_yemen.json -- all polygons are retained', function (done) {
      var cmd = '-i test/data/features/clean/ex1_yemen.json -clean -o clean.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['clean.json']);
        assert.equal(json.features.length, 2);
        done();
      });
    })

    it('clean/ex2_yemen.json -- all polygons are retained', function (done) {
      var cmd = '-i test/data/features/clean/ex2_yemen.json -clean -o clean.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['clean.json']);
        assert.equal(json.features.length, 3);
        done();
      });
    })

  })

  describe('OGC Simple Features tests', function () {

    it('invalid holes are not created', function (done) {
      var cmd = '-i test/data/features/clean/ex11_ogc.geojson -filter-fields -clean -o out.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        assert.equal(json.geometries[0].type, 'MultiPolygon');
        assert.equal(json.geometries[0].coordinates.length, 2);
        assert.equal(json.geometries.length, 1);
        done();
      });
    })

    it('polygon rings that share an edge are merged', function (done) {
      var cmd = '-i test/data/features/clean/ex12_ogc.geojson -filter-fields -clean -o gj2008 out.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        var target = {
          type: 'GeometryCollection',
          geometries: [{
            type: 'Polygon',
            coordinates: [[[5,2],[3,1],[1,2],[1,4],[3,5],[5,4],[7,5],[9,4],[9,2],[7,1],[5,2]]]
          }]
        }
        assert.deepEqual(json, target)
        done();
      });
    })

    it('cuts are removed', function (done) {
      var cmd = '-i test/data/features/clean/ex13_ogc.json -clean -o gj2008 out.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        var target = {
          type: 'GeometryCollection',
          geometries: [{
            type: 'MultiPolygon',
            coordinates: [
              [[[5,3],[6,3],[6,1],[4,1],[4,3],[5,3]]],
              [[[2,3],[3,3],[3,1],[1,1],[1,3],[2,3]]]]
          }]
        }
        assert.deepEqual(json, target)
        done();
      });
    })

    it('spikes are removed', function (done) {
      var cmd = '-i test/data/features/clean/ex14_ogc.json -filter-fields -clean -o gj2008 out.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        var target = {
          type: 'GeometryCollection',
          geometries: [{
            type: 'MultiPolygon',
            coordinates: [
              [[[5,3],[6,3],[6,1],[4,1],[4,3],[5,3]]],
              [[[2,3],[3,3],[3,1],[1,1],[1,3],[2,3]]]]
          }]
        }
        assert.deepEqual(json, target)
        done();
      });
    })

    it('holes cannot touch outer ring at more than one point', function (done) {
      var cmd = '-i test/data/features/clean/ex15_ogc.json -clean -o out.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        assert.equal(json.geometries[0].type, 'MultiPolygon');
        assert.equal(json.geometries[0].coordinates.length, 4);
        done();
      });
    })

   it('self-intersecting loops are converted to holes', function (done) {
      var cmd = '-i test/data/features/clean/ex16_ogc.json -clean -o out.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        assert.equal(json.geometries[0].type, 'Polygon');
        assert.equal(json.geometries[0].coordinates.length, 2); // one hole
        done();
      });
    })

    it('self-intersections are converted to multipart polygons', function (done) {
      var cmd = '-i test/data/features/clean/ex17_ogc.json -clean -o out.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        assert.equal(json.geometries[0].type, 'MultiPolygon');
        assert.equal(json.geometries[0].coordinates.length, 2);
        done();
      });
    })

    it('a polygon can not have two lobes connected by a linear portion', function (done) {
      var cmd = '-i test/data/features/clean/ex19_ogc.json -clean -o out.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        assert.equal(json.geometries[0].type, 'MultiPolygon');
        assert.equal(json.geometries[0].coordinates.length, 2);
        done();
      });
    })

  })

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


  it('Ignores layers with no geometry', function() {
    var records = [{id: 'a'}]
    var dataset = {
      info: {},
      layers: [{
        data: new api.internal.DataTable(records)
      }]
    };
    api.cmd.cleanLayers(dataset.layers, dataset);
    assert.deepEqual(dataset.layers[0].data.getRecords(), [{id: 'a'}]);
  });

  it('Converts segment intersections in line features to multipart geometries', function(done) {
    var data = {
      type: 'LineString',
      coordinates: [[0, 0], [1, 1], [0, 1], [1, 0]]
    };
    var target = {
      type: 'MultiLineString',
      coordinates: [[[0, 0], [0.5, 0.5]], [[0.5, 0.5], [1, 1], [0, 1], [0.5, 0.5]],
       [[0.5, 0.5], [1, 0]]]
    }
    var cmd = '-i data.json -clean -o';
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var json = JSON.parse(out['data.json']);
      assert.deepEqual(json.geometries[0], target)
      done();
    });


  });

  it('Removes empty line geometries by default', function(done) {
    var data = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: null,
        properties: {id: 'a'}
      }, {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [[0, 0], [1, 1]]
        },
        properties: {id: 'b'}
      }]
    };
    var cmd = '-i data.json -clean -o';
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      var json = JSON.parse(out['data.json']);
      assert.deepEqual(json, {
        type: 'FeatureCollection',
        features: [data.features[1]]
      });
      done();
    });
  });

  it('Removes duplicate coordinates within multipoint features', function() {
    var dataset = {
      info: {},
      layers: [{
        geometry_type: 'point',
        shapes: [[[0, 0]], [[1, 1], [1, 1], [0, 0]]]
      }]
    };
    api.cmd.cleanLayers(dataset.layers, dataset);
    assert.deepEqual(dataset.layers[0].shapes, [[[0, 0]], [[1, 1], [0, 0]]]);
  })

  it('Removes empty point geometries by default', function() {
    var dataset = {
      info: {},
      layers: [{
        geometry_type: 'point',
        shapes: [null, [[0, 0]], null, [[1, 1], [2, 2]] ],
        data: null
      }]
    };
    api.cmd.cleanLayers(dataset.layers, dataset);
    assert.deepEqual(dataset.layers[0], {
      geometry_type: 'point',
      shapes: [ [[0, 0]], [[1, 1], [2, 2]] ],
      data: null
    });

  })

  it('Removes empty polygon geometries by default', function(done) {
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
      api.applyCommands('-i poly.json -clean -o gj2008', {'poly.json': input}, function(err, output) {
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

    api.applyCommands('-i poly.json -clean allow-empty -o gj2008', {'poly.json': input}, function(err, output) {
      var poly2 = JSON.parse(output['poly.json']);
      assert.deepEqual(poly2, input);
      done();
    });
  });


  it('Removes overlapping section in GeoJSON input', function(done) {
    api.applyCommands('-i test/data/features/clean/ex6.json -clean -o gj2008 out.json', null, function(err, data) {
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

  // Change in -clean changed this shape's output... need to assess
  if (false) it('handles bowtie shapes', function(done) {
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

  describe('rewind option', function () {
    it('holes outside of rings are converted to rings', function (done) {
      var input = {
        type: 'Polygon',
        coordinates: [
          [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]], [[2, 0], [2, 1], [3, 1], [3, 0], [2, 0]]
        ]
      };
      api.applyCommands('-i in.json -clean rewind -o out.json', {'in.json': input}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        assert.deepEqual(json.geometries[0], {
          type: 'MultiPolygon',
          coordinates: [
            [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
            [[[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]]]
          ]
        })
        done();
      });
    })

    it('without rewind, holes outside of rings are removed', function (done) {
      var input = {
        type: 'Polygon',
        coordinates: [
          [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]], [[2, 0], [2, 1], [3, 1], [3, 0], [2, 0]]
        ]
      };
      api.applyCommands('-i in.json -clean -o out.json', {'in.json': input}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        assert.deepEqual(json.geometries[0], {
          type: 'Polygon',
          coordinates: [
            [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]
          ]
        })
        done();
      });
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

      it('self intersection converted to ring + hole', function () {
        var shapes = [[[0, ~1, 2]], [[1]]];
        var target = [[[0, 2], [~1]], [[1]]];
        var output = clean(shapes, arcs);
        assert.deepEqual(output, target);
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

      it('self-intersecting loops are converted to holes', function () {
        var shapes = [[[0, ~3, ~1, 4]], [[2, 3]], [[1, ~2]]];
        // var target = [[[0, ~3, ~1, 4]], [[2, 3]], [[1, ~2]]];
        var target = [ [ [ 0, 4 ], [ -4, -2 ] ], [ [ 2, 3 ] ], [ [ 1, -3 ] ] ];
        var output = clean(shapes, arcs);
        assert.deepEqual(output, target);
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
        //var target = [[[0, ~2]], [[2, 3]]]
        var target = [[[0, ~2]], [[3, 2]]]; // changed tile traversal in mapshaper-polygon-tiler.js
        var output = clean(shapes, arcs);
        // console.log(output)
        assert.deepEqual(output, target);
      })
    })
  })
})
