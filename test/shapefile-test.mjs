import api from '../mapshaper.js';
import assert from 'assert';
import { fixPath } from './helpers';

describe('mapshaper-shapefile.js', function () {

  it('Fix: reading .shp with invalid record numbers', function(done) {
    var file = 'test/data/issues/518_519_shp_reading/max_callstack_error.shp';
    var cmd = `-i ${file} -o out.json`;
    api.applyCommands(cmd, {}, function(err, out) {
      var json = JSON.parse(out['out.json']);
      assert.equal(json.features.length, 138);
      assert.deepEqual(json.features[0].properties.Length, 8057.3);
      done();
    });
  })

  it('Fix: reading .shp with invalid record numbers 2', function(done) {
    var file = 'test/data/issues/518_519_shp_reading/data_corruption_error.shp';
    var cmd = `-i ${file} -o out.json`;
    api.applyCommands(cmd, {}, function(err, out) {
      var json = JSON.parse(out['out.json']);
      assert.equal(json.features.length, 8);
      assert.deepEqual(json.features[0].properties.dp_oid, 3978824);
      done();
    });
  })


  it('Fix: point shapefile importing', function (done) {

    api.internal.testCommands('-i test/data/issues/point_shapefile_import_error/points.shp', function(err, dataset) {
      assert.deepEqual(dataset.layers[0].shapes, [[[0, 0]], [[1, 1], [1, 2]]]);
      assert.equal(dataset.layers[0].geometry_type, 'point');
      done();
    });
  })

  describe('.prj tests', function() {

    it('prj is exported even if mapshaper can not parse it (Issue #193)', function() {
      var data = api.internal.importFile(fixPath('data/issues/193/three_points.shp'), {});
      var files = api.internal.exportFileContent(data, {});
      var prj = api.utils.find(files, function(o) {
        return o.filename == 'three_points.prj';
      });
      assert.equal(prj && prj.filename, 'three_points.prj');
    });

    it('prj is exported if input prj is present', function() {
      var data = api.internal.importFile(fixPath('data/three_points.shp'), {});
      var files = api.internal.exportFileContent(data, {});
      var prj = api.utils.find(files, function(o) {
        return o.filename == 'three_points.prj';
      });
      assert.equal(prj && prj.filename, 'three_points.prj');
    });

    it('prj is exported if data is reprojected to "webmercator"', function(done) {
      api.applyCommands('-i test/data/three_points.shp -proj webmercator -o', {}, function(err, output) {
        var prj = output['three_points.prj']
        assert(/Pseudo-Mercator/.test(prj));
        done();
      });
    });

    it('Albers WKT is exported if data is reprojected to "albersusa"', function(done) {
      api.applyCommands('-i test/data/three_points.shp -proj albersusa -o', {}, function(err, output) {
        var prj = output['three_points.prj']
        assert(/Albers/.test(prj));
        done();
      });
    });

    it('WGS84 prj is generated if input is unprojected GeoJSON', function(done) {
      api.applyCommands('-i test/data/three_points.geojson -o format=shapefile', {}, function(err, output) {
        var prj = output['three_points.prj']
        assert(/WGS84/.test(prj));
        done();
      });
    });

    it('Fallback WKT (with custom_proj4 PROJECTION) is generated if CRS has no known WKT equivalent', function(done) {
      api.applyCommands('-i test/data/three_points.geojson -proj +proj=boggs -o format=shapefile', {}, function(err, output) {
        var prj = output['three_points.prj']
        assert(prj.indexOf('custom_proj4') > -1);
        assert(prj.indexOf('EXTENSION["PROJ4","+proj=boggs') > -1);
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

  describe('GeoJSON -> Shapefile -> GeoJSON roundtrip tests', function() {

    it ('Point type dataset (testing shp type 1 output)', function(done) {
      var input = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {
            name: 'alpha',
            value: 94.3
          },
          geometry: {
            type: 'Point',
            coordinates: [-35.8, 22.4]
          }
        }, {
          type: 'Feature',
          properties: {
            name: 'beta',
            value: 0
          },
          geometry: {
            type: 'Point',
            coordinates: [10.2, -55.1]
          }
        }]
      };
      roundtrip(input, done);
    });

    it ('Mixed point type dataset', function(done) {
      var input = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {
            name: 'alpha',
            value: 94.3
          },
          geometry: {
            type: 'Point',
            coordinates: [-35.8, 22.4]
          }
        }, {
          type: 'Feature',
          properties: {
            name: 'beta',
            value: 0
          },
          geometry: {
            type: 'MultiPoint',
            coordinates: [[10.2, -55.1], [-180, -90]]
          }
        }]
      };
      roundtrip(input, done);
    });

    function fail(err) {
      assert(false, err);
    }

    function roundtrip(input, done) {
      toShapefile(input, function(err, output) {
        if (err) fail(err);
        toGeoJSON(output, function(err, output) {
          if (err) fail(err);
          assert.deepEqual(JSON.parse(output['output.json']), input);
          done();
        });
      });
    }

    function toShapefile(input, cb) {
      api.applyCommands('-i input.json -o output.shp', {'input.json': input}, cb);
    }

    function toGeoJSON(input, cb) {
      api.applyCommands('-i output.shp -o output.json format=geojson', input, cb);
    }
  })

  describe('Export/Import roundtrip tests', function () {

    it('Six counties', function () {
      shapefileRoundTrip('data/six_counties.shp');
    })

    it('Six counties, two null geometries', function () {
      shapefileRoundTrip('data/two_states.shp');
    })

    it('World land borders from Natural Earth', function() {
      shapefileRoundTrip('data/ne/ne_110m_admin_0_boundary_lines_land.shp');
    })

    it('U.S. states from Natural Earth', function() {
      shapefileRoundTrip('data/ne/ne_110m_admin_1_states_provinces_shp.shp');
    })

    it('Pacific groupings from Natural Earth', function() {
      shapefileRoundTrip('data/ne/ne_110m_admin_0_pacific_groupings.shp');
    })

    it('Single multipoint record (shplib)', function() {
      shapefileRoundTrip('data/shplib/multipnt.shp');
    })

    it('POINTZ layer (shplib)', function() {
      shapefileRoundTrip('data/shplib/masspntz.shp');
    })

  })
})


function shapefileRoundTrip(fname) {
  var data = api.internal.importFile(fixPath(fname), {encoding: 'ascii'});
  var files = api.internal.exportFileContent(data, {encoding: 'ascii', format:"shapefile"});
  var input2 = {
    shp: {filename: fname, content: files[0].content},
    shx: {content: files[1].content}};
  var data2 = api.internal.importContent(input2, {encoding: 'ascii'});
  var files2 = api.internal.exportFileContent(data2, {encoding: 'ascii', format:"shapefile"});

  assert.ok(api.internal.buffersAreIdentical(files[0].content, files2[0].content));
}
