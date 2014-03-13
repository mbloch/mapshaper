var api = require('../'),
    assert = require('assert');

var Utils = api.Utils,
    Node = api.Node;

function fixPath(p) {
  return Node.path.join(__dirname, p);
}

describe('mapshaper-geojson.js', function () {
  describe('importGeoJSON', function () {
    it('Import FeatureCollection with polygon geometries', function () {
      var data = api.importFromFile(fixPath('test_data/two_states.json'))
      assert.equal(data.layers[0].shapes.length, 2);
      assert.equal(data.layers[0].data.size(), 2);
    })

    it('Import FeatureCollection with three null geometries', function () {
      var data = api.importFromFile(fixPath('test_data/six_counties_three_null.json'), 'geojson');
      assert.equal(data.layers[0].data.size(), 6);
      assert.equal(data.layers[0].shapes.length, 6);
      assert.equal(Utils.filter(data.layers[0].shapes, function(shape) {return shape != null}).length, 3)
      assert.deepEqual(Utils.pluck(data.layers[0].data.getRecords(), 'NAME'), ["District of Columbia", "Arlington", "Fairfax County", "Alexandria", "Fairfax City", "Manassas"]);
    })
  })

  describe('exportGeoJSON()', function () {
    it('collapsed polygon exported as null geometry', function () {
      var arcs = new api.ArcDataset([[[1, 2, 1], [1, 3, 1]]]),
          lyr = {
            geometry_type: "polygon",
            data: new api.data.DataTable([{FID: 1}]),
            shapes: [[[0]]]
          };

      var target = {"type":"FeatureCollection","features":[
        {type: 'Feature', properties: {FID: 1}, geometry: null}
      ]};

      assert.deepEqual(target, api.exportGeoJSONObject(lyr, arcs));
    })
  })

  describe('Import/Export roundtrip tests', function () {
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
        bbox: [100, 0, 110, 10],
        geometries:[{
          type: "Polygon",
          coordinates: [[[100.0, 0.0], [100.0, 10.0], [110.0, 10.0], [110.0, 0.0], [100.0, 0.0]],
            [[101.0, 1.0], [109.0, 1.0], [109.0, 9.0], [101.0, 9.0], [101.0, 1.0]]
          ]
        }]};
      assert.deepEqual(target, output);
    })

    it('reversed ring with duplicate points is not removed (#42)', function() {
      var geoStr = Node.readFile(fixPath("test_data/ccw_polygon.json"), 'utf8'),
          outputObj = importExport(geoStr);

      assert.ok(outputObj.features[0].geometry != null);
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
  })
})

function geoJSONRoundTrip(fname) {
  var data = api.importFromFile(fixPath(fname));
  var files = api.exportContent(data.layers, data.arcs, {output_format:'geojson'});
  var data2 = api.importContent(files[0].content, 'json');
  var files2 = api.exportContent(data2.layers, data2.arcs, {output_format:'geojson'});

  assert.deepEqual(files, files2);
}

function importExport(obj) {
  var geom = api.importPaths(api.importGeoJSON(obj), true);
  return api.exportGeoJSONObject(geom.layers[0], geom.arcs);
}
