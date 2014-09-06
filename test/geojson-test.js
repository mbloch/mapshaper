var api = require('../'),
    DataTable = api.internal.DataTable,
    assert = require('assert');

var Utils = api.utils;

function fixPath(p) {
  return require('path').join(__dirname, p);
}

describe('mapshaper-geojson.js', function () {

  describe('importGeoJSON', function () {
    it('Import FeatureCollection with polygon geometries', function () {
      var data = api.importFile(fixPath('test_data/two_states.json'))
      assert.equal(data.layers[0].shapes.length, 2);
      assert.equal(data.layers[0].data.size(), 2);
    })

    it('Import FeatureCollection with three null geometries', function () {
      var data = api.importFile(fixPath('test_data/six_counties_three_null.json'), 'geojson');
      assert.equal(data.layers[0].data.size(), 6);
      assert.equal(data.layers[0].shapes.length, 6);
      assert.equal(Utils.filter(data.layers[0].shapes, function(shape) {return shape != null}).length, 3)
      assert.deepEqual(Utils.pluck(data.layers[0].data.getRecords(), 'NAME'), ["District of Columbia", "Arlington", "Fairfax County", "Alexandria", "Fairfax City", "Manassas"]);
    })

    it('Import Feature with id field', function () {
      var obj = {
        type: 'Feature',
        id: 'foo',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: [2, 1]
        }
      };
      var dataset = api.internal.importGeoJSON(obj, {id_field: 'name'});
      var records = dataset.layers[0].data.getRecords();
      assert.deepEqual(records, [{name: 'foo'}]);
    })
  })

  describe('exportGeoJSON()', function () {
    it('collapsed polygon exported as null geometry', function () {
      var arcs = new api.internal.ArcCollection([[[1, 1], [2, 3], [1, 1]]]);
          lyr = {
            geometry_type: "polygon",
            data: new DataTable([{FID: 1}]),
            shapes: [[[0]]]
          };

      var target = {"type":"FeatureCollection","features":[
        {type: 'Feature', properties: {FID: 1}, geometry: null}
      ]};

      assert.deepEqual(api.internal.exportGeoJSONObject(lyr, arcs), target);
    })

    it('use cut_table option', function () {
      var arcs = new api.internal.ArcCollection([[[1, 1], [1, 3], [2, 3], [1, 1]]]);
          lyr = {
            geometry_type: "polygon",
            data: new DataTable([{FID: 1}]),
            shapes: [[[0]]]
          };

      var geojson = {"type":"GeometryCollection","geometries":[
        { type: 'Polygon',
          coordinates: [[[1, 1], [1, 3], [2, 3], [1, 1]]]
          }
        ]};
      var table = [{
        FID: 1
      }];
      var opts = {
        cut_table: true,
        format: 'geojson'
      };
      var files = api.internal.exportFileContent({layers:[lyr], arcs:arcs}, opts);
      assert.deepEqual(JSON.parse(files[0].content), geojson);
      assert.deepEqual(JSON.parse(files[1].content), table);
    })

    it('use drop_table and id_field options', function () {
      var arcs = new api.internal.ArcCollection([[[1, 1], [1, 3], [2, 3], [1, 1]]]);
          lyr = {
            geometry_type: "polygon",
            data: new DataTable([{FID: 1}]),
            shapes: [[[0]]]
          };

      var geojson = {"type":"FeatureCollection", "features":[{
            type: "Feature",
            properties: null,
            id: 1,
            geometry: {
              type: 'Polygon',
              coordinates: [[[1, 1], [1, 3], [2, 3], [1, 1]]]
            }
          }]};

      var opts = {
        drop_table: true,
        id_field: 'FID',
        format: 'geojson'
      };
      var files = api.internal.exportFileContent({layers:[lyr], arcs:arcs}, opts);
      assert.deepEqual(JSON.parse(files[0].content), geojson);
    })

    it('export points with bbox', function() {
      var lyr = {
        geometry_type: 'point',
        shapes: [[[0, 1]], [[2, 3], [1, 4]]]
      };

      var target = {
        type: "GeometryCollection",
        geometries: [{
          type: "Point",
          coordinates: [0,1]
        }, {
          type: "MultiPoint",
          coordinates: [[2, 3], [1, 4]]
        }],
        bbox: [0, 1, 2, 4]
      };

      var result = api.internal.exportGeoJSONObject(lyr, null, {bbox: true});
      assert.deepEqual(result, target);
    })

    it('export polygons with bbox', function() {
      var arcs = new api.internal.ArcCollection(
            [[[1, 1], [1, 3], [2, 3], [1, 1]],
            [[-1, 1], [0, 0], [0, 1], [-1, 1]]]),
          lyr = {
            geometry_type: "polygon",
            shapes: [[[0]], [[~1]]]
          };

      var target = {"type":"GeometryCollection","geometries":[
        { type: 'Polygon',
          coordinates: [[[1, 1], [1, 3], [2, 3], [1, 1]]]
          }, { type: 'Polygon',
          coordinates: [[[-1, 1], [0, 1], [0, 0], [-1, 1]]]
          }
        ]
        , bbox: [-1, 0, 2, 3]
      };
      var result = api.internal.exportGeoJSONObject(lyr, arcs, {bbox: true});
      assert.deepEqual(result, target);
    })

    it('export feature with id property', function() {
      var lyr = {
            geometry_type: "point",
            shapes: [[[1, 1]]],
            data: new DataTable([{FID: 1}])
          };

      var target = {"type":"FeatureCollection","features":[{
          type: 'Feature',
          properties: {FID: 1},
          id: 1,
          geometry: { type: 'Point',
            coordinates: [1, 1]
          }
        }]
      };
      var result = api.internal.exportGeoJSONObject(lyr, null, {id_field: 'FID'});
      assert.deepEqual(result, target);
    })

  })

  describe('Import/Export roundtrip tests', function () {
    /*
    it('bbox added to polygon output', function() {
      var onePoly = {"type":"GeometryCollection","geometries":[
        {
          type: "Polygon",
          coordinates: [[[100.0, 0.0], [100.0, 1.0], [101.0, 1.0], [101.0, 0.0], [100.0, 0.0]]]
        }
      ]};
      var output = importExport(onePoly);
      var target = Utils.extend(onePoly, {
        bbox: [100, 0, 101, 1]
      });
      assert.deepEqual(target, output);
    })
  */


    it('empty GeometryCollection', function () {
      var empty = {"type":"GeometryCollection","geometries":[]};
      assert.deepEqual(empty, importExport(empty));
    })

    it('null geom, one property', function () {
      var geom = {"type":"FeatureCollection", "features":[
        { type: "Feature",
          geometry: null,
          properties: {FID: 0}
        }
      ]};
      assert.deepEqual(geom, importExport(geom));
    })

    it('collapsed polygon converted to null geometry', function() {
      var geom = {"type":"FeatureCollection", "features":[
        { type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[100.0, 0.0], [100.0, 1.0], [100.0, 0.0]]]
          },
          properties: {FID: 0}
        }
      ]};

      var target = {"type":"FeatureCollection", "features":[
        { type: "Feature",
          geometry: null,
          properties: {FID: 0}
        }
      ]};

      assert.deepEqual(target, importExport(geom));
    })

    it('ccw polygon and cw hole are reversed', function() {
      var onePoly = {
        type:"GeometryCollection",
        geometries:[{
          type: "Polygon",
          coordinates: [[[100.0, 0.0], [110.0, 0.0], [110.0, 10.0], [100.0, 10.0], [100.0, 0.0]],
            [[101.0, 1.0], [101.0, 9.0], [109.0, 9.0], [109.0, 1.0], [101.0, 1.0]]]
        }]};
      var output = importExport(onePoly);
      var target = {
        type:"GeometryCollection",
        // bbox: [100, 0, 110, 10],
        geometries:[{
          type: "Polygon",
          coordinates: [[[100.0, 0.0], [100.0, 10.0], [110.0, 10.0], [110.0, 0.0], [100.0, 0.0]],
            [[101.0, 1.0], [109.0, 1.0], [109.0, 9.0], [101.0, 9.0], [101.0, 1.0]]
          ]
        }]};
      assert.deepEqual(target, output);
    })

    it('reversed ring with duplicate points is not removed (#42)', function() {
      var geoStr = api.cli.readFile(fixPath("test_data/ccw_polygon.json"), 'utf8'),
          outputObj = importExport(geoStr);
      assert.ok(outputObj.features[0].geometry != null);
    })


    it('GeometryCollection with a Point and a MultiPoint', function() {
      var json = {
        type: "GeometryCollection",
        geometries:[{
          type: "Point",
          coordinates: [2, 1]
        }, {
          type: "MultiPoint",
          coordinates: [[1, 0], [1, 0]]
        }]
      };

      assert.deepEqual(importExport(json), json);
    })


    it('FeatureCollection with two points and a null geometry', function() {
      var json = {
        type: "FeatureCollection",
        features:[{
          type: "Feature",
          properties: {id: 'pdx'},
          geometry: {
            type: "Point",
            coordinates: [0, 0]
          }
        }, {
          type: "Feature",
          properties: {id: 'sfo'},
          geometry: {
            type: "Point",
            coordinates: [-1, 1]
          }
        }, {
          type: "Feature",
          properties: {id: ''},
          geometry: null
        }]
      };

      assert.deepEqual(importExport(json), json);
    })

  })

  describe('Export/Import roundtrip tests', function () {

    it('two states', function () {
      geoJSONRoundTrip('test_data/two_states.json');
    })

    it('six counties, two null geometries', function () {
      geoJSONRoundTrip('test_data/six_counties_three_null.json');
    })

    it('Internal state borders (polyline)', function () {
      geoJSONRoundTrip('test_data/ne/ne_110m_admin_1_states_provinces_lines.json');
    })
    /* */
  })
})

function geoJSONRoundTrip(fname) {
  var data = api.importFile(fixPath(fname));
  var files = api.internal.exportFileContent(data, {format:'geojson'});
  var data2 = api.internal.importFileContent(files[0].content, 'json');
  var files2 = api.internal.exportFileContent(data2, {format:'geojson'});

  assert.equal(files2[0].content, files[0].content);
  // assert.equal(files2[0].filename, files[0].filename); // these are different
}

function importExport(obj, noTopo) {
  var json = Utils.isString(obj) ? obj : JSON.stringify(obj);
  var geom = api.internal.importFileContent(json, 'json', {no_topology: noTopo});
  return api.internal.exportGeoJSONObject(geom.layers[0], geom.arcs);
}
