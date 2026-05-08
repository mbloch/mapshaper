
import assert from 'assert';
import api from '../mapshaper.js';
import helpers from './helpers';
import { captureLogCallsAsync } from './helpers';
import fs from 'fs';

describe('mapshaper-proj.js', function() {

  describe('antimeridian issues', function () {
    it('issue: split-apart island does not dissolve', function (done) {
      var file = 'test/data/issues/proj_issues/split_island_geo.json';
      var proj = '-proj +proj=laea clip-angle=160 +lon_0=170 +lat_0=20';
      var cmd = `-i ${file} -dissolve ${proj} -o out.json`;
      api.applyCommands(cmd, function(err, out) {
        var json = JSON.parse(out['out.json']);
        // one polygon is created
        assert.equal(json.geometries.length, 1);
        assert.equal(json.geometries[0].type, 'Polygon');
        done();
      })
    })

    it('does not warn from antimeridian pre-cut after filtering', async function() {
      var input = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {keep: true},
          geometry: {type: 'Polygon', coordinates: [[
            [73, 18], [135, 18], [135, 54], [73, 54], [73, 18]
          ]]}
        }, {
          type: 'Feature',
          properties: {keep: false},
          geometry: {type: 'Polygon', coordinates: [[
            [-100, 0], [-50, 0], [-50, 10], [-100, 10], [-100, 0]
          ]]}
        }]
      };
      var cmd = '-i countries.json name=countries -filter keep -proj lcc -o format=geojson';
      var captured = await captureLogCallsAsync(function() {
        return api.applyCommands(cmd, {'countries.json': input});
      });
      var hit = captured.log.find(function(line) {
        return /does not overlap target/.test(line);
      });
      assert.equal(hit, undefined);
    });
  })

  describe('dynamic projection definition using -calc', function () {
    it('set tmerc origin', function (done) {
      var csv = 'id,x,y\na,1,2\nb,3,4';
      var cmd = '-i data.csv -points -calc "PROJ = `+proj=tmerc +lon_0=${this.layer.bbox.cx} +lat_0=${this.layer.bbox.cy}`" -proj PROJ -o data.shp';
      api.applyCommands(cmd, {'data.csv': csv}, function(err, out) {
        var prj = out['data.prj'];
        assert(prj.includes('Transverse_Mercator'));
        assert(prj.includes('PARAMETER["central_meridian",2]'))
        assert(prj.includes('PARAMETER["latitude_of_origin",3]'))
        done();
      });
    })
  })

  describe('-proj EPSG:XXXX form works', function () {
    it('-proj EPSG:3395', function (done) {
      var input = 'lat,lng\n0,0';
      var cmd = '-i point.csv -points -proj EPSG:3395 -o format=geojson';
      api.applyCommands(cmd, {'point.csv': input}, function(err, out) {
        var json = JSON.parse(out['point.json']);
        var xy = json.features[0].geometry.coordinates;
        helpers.coordinatesAlmostEqual(xy, [0, 0], 1e-9)
        done();
      });
    })

    it('-proj from=epsg:4326 epsg:3395', function (done) {
      var input = 'lat,lng\n-1,1';
      var cmd = '-i point.csv -points -proj from=epsg:4326 epsg:3395 -o format=geojson';
      api.applyCommands(cmd, {'point.csv': input}, function(err, out) {
        var json = JSON.parse(out['point.json']);
        var xy = json.features[0].geometry.coordinates;
        // reference coordinates from command line "proj" program
        helpers.coordinatesAlmostEqual(xy, [111319.49079327357, -110579.96522189587], 1e-9)
        done();
      });
    })
  })

  describe('-proj <alias>', function() {
    it('webmercator alias', function(done) {
      api.applyCommands('-i test/data/three_points.shp -proj webmercator -o',
          {}, function(err, output) {
        assert(/Mercator/.test(output['three_points.prj']));
        done();
      })
    })

    it('robinson alias', function(done) {
      api.applyCommands('-i test/data/three_points.shp -proj robinson -o',
          {}, function(err, output) {
        assert(/Robinson/.test(output['three_points.prj']));
        done();
      })
    })
  })

  describe('-proj from= tests', function () {
    it('Assign projection to bare .shp file', function (done) {
      var cmd = '-i test/data/two_states_merc_copy.shp -proj from="+proj=merc" +proj=robin -o robin.shp';
      api.applyCommands(cmd, null, function(err, output) {
        assert(/Robinson/.test(output['robin.prj']));
        done();
      })
    })

    it('from= sets CRS if no dest CRS is given', function (done) {
      var cmd = '-i test/data/two_states_merc_copy.shp -proj from="+proj=merc" -o merc.shp';
      api.applyCommands(cmd, null, function(err, output) {
        assert(/Mercator/.test(output['merc.prj']));
        done();
      })
    })

    it('from= works even if dataset is empty', function (done) {
      var input = {type: 'GeometryCollection', geometries: []};
      var cmd = '-i in.json -proj from="+proj=merc" -o merc.shp';
      api.applyCommands(cmd, {'in.json': input}, function(err, output) {
        assert(/Mercator/.test(output['merc.prj']));
        done();
      })
    })


    it('Match a .prj file', function (done) {
      var cmd = '-i test/data/two_states_merc_copy.shp -proj from="test/data/two_states_mercator.prj" +proj=robin -o robin.shp';
      api.applyCommands(cmd, null, function(err, output) {
        assert(/Robinson/.test(output['robin.prj']));
        done();
      })
    })

    it('Match a .prj file even if dataset is empty', function (done) {
      var input = {type: 'GeometryCollection', geometries: []};
      var cmd = '-i in.json -proj from="test/data/two_states_mercator.prj" +proj=robin -o robin.shp';
      api.applyCommands(cmd, {'in.json': input}, function(err, output) {
        assert(/Robinson/.test(output['robin.prj']));
        done();
      })
    })

  })

  describe('-proj match= tests', function () {
    it('match= argument can be a .prj file', function(done) {
      api.applyCommands('-i test/data/three_points.shp -proj match=test/data/two_states_mercator.prj -o',
          {}, function(err, output) {
        assert(/Mercator/.test(output['three_points.prj']));
        done();
      })
    })

    it('source= is an alias for match= (TODO: phase this out)', function(done) {
      api.applyCommands('-i test/data/three_points.shp -proj source=test/data/two_states_mercator.prj -o',
          {}, function(err, output) {
        assert(/Mercator/.test(output['three_points.prj']));
        done();
      })
    })

    it('match= argument can be a layer name', function(done) {
      api.applyCommands('-i test/data/two_states_mercator.shp name=states -i test/data/three_points.shp -proj match=states -o',
          {}, function(err, output) {
        assert(/Mercator/.test(output['three_points.prj']));
        done();
      })
    })

    it('match= works even if dataset is empty', function(done) {
      var empty = {type: 'GeometryCollection', geometries: []};
      api.applyCommands('-i test/data/two_states_mercator.shp name=states -i in.json -proj match=states -o format=shapefile',
          {'in.json': empty}, function(err, output) {
        assert(/Mercator/.test(output['in.prj']));
        done();
      })
    })

    it('output copies .prj string from match= source', function(done) {
      var prj = fs.readFileSync('test/data/two_states_mercator.prj', 'utf8');
      api.applyCommands('-i test/data/two_states_mercator.shp name=states -i test/data/three_points.shp -proj match=states -o',
          {}, function(err, output) {
        var prj2 = output['three_points.prj'];
        assert.equal(prj2, prj);
        done();
      })
    })

  })

  describe('-proj target-layer side effects', function() {
    it('reports non-target layers that were also projected', async function() {
      var a = {
        type: 'FeatureCollection',
        features: [{type: 'Feature', properties: {id: 1}, geometry: {type: 'Point', coordinates: [0, 0]}}]
      };
      var b = {
        type: 'FeatureCollection',
        features: [{type: 'Feature', properties: {id: 2}, geometry: {type: 'Point', coordinates: [1, 1]}}]
      };
      var cmd = '-i a.json b.json combine-files -rename-layers alpha,beta -target alpha -proj webmercator -o format=geojson';
      var captured = await captureLogCallsAsync(function() {
        return api.applyCommands(cmd, {'a.json': a, 'b.json': b});
      });
      var hit = captured.log.find(function(line) {
        return /\[proj\] Also projected non-target layer/.test(line);
      });
      assert(hit, 'expected side-effect projection message');
      assert(hit.includes('beta'), hit);
    });

    it('does not report side-effect layers when all layers are targeted', async function() {
      var a = {
        type: 'FeatureCollection',
        features: [{type: 'Feature', properties: {id: 1}, geometry: {type: 'Point', coordinates: [0, 0]}}]
      };
      var b = {
        type: 'FeatureCollection',
        features: [{type: 'Feature', properties: {id: 2}, geometry: {type: 'Point', coordinates: [1, 1]}}]
      };
      var cmd = '-i a.json b.json combine-files -rename-layers alpha,beta -proj webmercator -o format=geojson';
      var captured = await captureLogCallsAsync(function() {
        return api.applyCommands(cmd, {'a.json': a, 'b.json': b});
      });
      var hasMessage = captured.log.some(function(line) {
        return /\[proj\] Also projected non-target layer/.test(line);
      });
      assert.equal(hasMessage, false);
    });
  });
});
