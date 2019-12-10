var assert = require('assert'),
    api = require("../");

describe('mapshaper-merge-files.js', function () {
  it('import a point GeoJSON and a csv file', function() {
    var a = 'test/data/three_points.geojson',
        b = 'test/data/text/two_states.csv';
    var combined = api.internal.importFiles([a, b], {});
    assert(api.internal.getDatasetCRS(combined).is_latlong);
    assert.deepEqual(combined.info.input_files, ['test/data/three_points.geojson', 'test/data/text/two_states.csv']);
    assert.deepEqual(combined.info.input_formats, ['geojson', 'dsv']);
  })

  it('import a polygon Shapefile and a polygon GeoJSON file', function() {
      var a = 'test/data/six_counties.shp',
          b = 'test/data/two_states.json',
          combined = api.internal.importFiles([a, b], {});
      assert(api.internal.getDatasetCRS(combined).is_latlong);
      // TODO: check geometry
  })

  it('issue #153 topology was ignored when using -i combine-files option', function(done) {
    var a = 'test/data/issues/153/a.json',
        b = 'test/data/issues/153/b.json',
        cmd = '-i combine-files ' + a + ' ' + b;
    api.internal.testCommands(cmd, function(err, combined) {
      var targetArcs = [ [ [ 1, 1 ], [ 1, 0 ] ],
          [ [ 1, 0 ], [ 0, 0 ], [ 0, 1 ], [ 1, 1 ] ],
          [ [ 1, 1 ], [ 2, 1 ], [ 2, 0 ], [ 1, 0 ] ] ];
      var targetA = {
        geometry_type: 'polygon',
        name: 'a',
        shapes: [[[0, 1]]]
      };
      var targetB = {
        geometry_type: 'polygon',
        name: 'b',
        shapes: [[[2, ~0]]]
      }
      assert.deepEqual(combined.arcs.toArray(), targetArcs)
      assert.deepEqual(combined.layers[0], targetA);
      assert.deepEqual(combined.layers[1], targetB);
      done();
    })
  })

  it('importing a projected and an unprojected polygon file throws and error', function() {
    assert.throws(function() {
      var a = 'test/data/two_states_mercator.shp',
          b = 'test/data/two_states.shp',
          combined = api.internal.importFiles([a, b], {});
    })
  })
})
