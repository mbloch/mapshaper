var api = require('../'),
    assert = require('assert');

var Utils = api.utils;

function fixPath(p) {
  return require('path').join(__dirname, p);
}

describe('mapshaper-shapefile.js', function () {

  it('Fix: point shapefile importing', function (done) {

    api.internal.testCommands('-i test/test_data/issues/shp_point_import/points.shp', function(err, dataset) {
      assert.deepEqual(dataset.layers[0].shapes, [[[0, 0]], [[1, 1], [1, 2]]]);
      assert.equal(dataset.layers[0].geometry_type, 'point');
      done();
    });
  })

  describe('.prj tests', function() {

    it('prj is exported even if mapshaper can not parse it (Issue #193)', function() {
      var data = api.importFile(fixPath('test_data/issues/193/three_points.shp'), {});
      var files = api.internal.exportFileContent(data, {});
      var prj = Utils.find(files, function(o) {
        return o.filename == 'three_points.prj';
      });
      assert.equal(prj && prj.filename, 'three_points.prj');
    });

    it('prj is exported if input prj is present', function() {
      var data = api.importFile(fixPath('test_data/three_points.shp'), {});
      var files = api.internal.exportFileContent(data, {});
      var prj = Utils.find(files, function(o) {
        return o.filename == 'three_points.prj';
      });
      assert.equal(prj && prj.filename, 'three_points.prj');
    });

    it('prj is exported if data is reprojected to "webmercator"', function(done) {
      api.applyCommands('-i test/test_data/three_points.shp -proj webmercator -o', {}, function(err, output) {
        var prj = output['three_points.prj']
        assert(/Pseudo-Mercator/.test(prj));
        done();
      });
    });

    it('Albers WKT is exported if data is reprojected to "albersusa"', function(done) {
      api.applyCommands('-i test/test_data/three_points.shp -proj albersusa -o', {}, function(err, output) {
        var prj = output['three_points.prj']
        assert(/Albers/.test(prj));
        done();
      });
    });

    it('WGS84 prj is generated if input is unprojected GeoJSON', function(done) {
      api.applyCommands('-i test/test_data/three_points.geojson -o format=shapefile', {}, function(err, output) {
        var prj = output['three_points.prj']
        assert(/WGS84/.test(prj));
        done();
      });
    });

    it('No prj is generated if CRS has no WKT equivalent', function(done) {
      api.applyCommands('-i test/test_data/three_points.geojson -proj +proj=boggs -o format=shapefile', {}, function(err, output) {
        var prj = output['three_points.prj']
        assert(!err && !prj);
        done();
      });
    });

  })

  describe('Export and import layers containing data but no shapes', function () {
    it('test 1', function () {
      var records = [{foo: 'a'}]
      var dataset = {
        layers: [{
          name: 'test',
          data: new api.internal.DataTable(records)
        }]
      };
      var files = api.internal.exportFileContent(dataset, {encoding: 'ascii', format:"shapefile"});
      var obj = {
        shp: {content: files[0].content},
        dbf: {content: files[2].content}
      };
      var dataset2 = api.internal.importContent(obj, {encoding: 'ascii'});
      assert.deepEqual(dataset2.layers[0].data.getRecords(), records);
      assert.equal(dataset2.layers[0].shapes, null);
    })
  })

  describe('Import/Export rountrip tests', function() {


  })

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
