var api = require('../'),
    assert = require('assert');

var Utils = api.utils;

function fixPath(p) {
  return require('path').join(__dirname, p);
}

describe('mapshaper-shapefile.js', function () {

  describe('Export/Import roundtrip tests', function () {

    it('Six counties', function () {
      shapefileRoundTrip('test_data/six_counties.shp');
    })

    it('Six counties, two null geometries', function () {
      shapefileRoundTrip('test_data/two_states.shp');
    })

    it('World land borders from Natural Earth', function() {
      shapefileRoundTrip('test_data/ne/ne_110m_admin_0_boundary_lines_land.shp');
    })

    it('U.S. states from Natural Earth', function() {
      shapefileRoundTrip('test_data/ne/ne_110m_admin_1_states_provinces_shp.shp');
    })

    it('Pacific groupings from Natural Earth', function() {
      shapefileRoundTrip('test_data/ne/ne_110m_admin_0_pacific_groupings.shp');
    })

    it('Single multipoint record (shplib)', function() {
      shapefileRoundTrip('test_data/shplib/multipnt.shp');
    })

    it('POINTZ layer (shplib)', function() {
      shapefileRoundTrip('test_data/shplib/masspntz.shp');
    })

  })
})


function shapefileRoundTrip(fname) {
  var data = api.importFile(fixPath(fname), {encoding: 'ascii'});
  var files = api.internal.exportFileContent(data, {encoding: 'ascii', format:"shapefile"});

  var data2 = api.internal.importFileContent(files[0].content, fname, {encoding: 'ascii'});
  var files2 = api.internal.exportFileContent(data2, {encoding: 'ascii', format:"shapefile"});

  assert.ok(Utils.buffersAreIdentical(files[0].content, files2[0].content));
}
