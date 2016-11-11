var assert = require('assert'),
    api = require("../");

describe('mapshaper-merge-files.js', function () {
  it('import a point GeoJSON and a csv file', function() {
    var a = 'test/test_data/three_points.geojson',
        b = 'test/test_data/text/two_states.csv';
    var combined = api.internal.importFiles([a, b], {});
    assert(combined.info.crs.is_latlong);
    assert.deepEqual(combined.info.input_files, ['test/test_data/three_points.geojson', 'test/test_data/text/two_states.csv']);
    assert.deepEqual(combined.info.input_formats, ['geojson', 'dsv']);
  })

  it('import a polygon Shapefile and a polygon GeoJSON file', function() {
      var a = 'test/test_data/six_counties.shp',
          b = 'test/test_data/two_states.json',
          combined = api.internal.importFiles([a, b], {});
      assert(combined.info.crs.is_latlong);
      // TODO: check geometry
  })

  it('importing a projected and an unprojected polygon file throws and error', function() {
    assert.throws(function() {
      var a = 'test/test_data/two_states_mercator.shp',
          b = 'test/test_data/two_states.shp',
          combined = api.internal.importFiles([a, b], {});
    })
  })
})
