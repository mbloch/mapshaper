var api = require('../'),
    assert = require('assert');

var Utils = api.Utils;

describe('mapshaper-geojson.js', function () {


  describe('#importGeoJSON', function () {
    it('Import FeatureCollection with polygon geometries', function () {
      var data = api.importFromFile('test_data/two_states.json', 'geojson')
      var topo = api.buildTopology(data);
      assert.equal(data.info.input_shape_count, 2);
      assert.equal(topo.shapes.length, 2);
      assert.equal(data.properties.length, 2);
   })

    it('Import FeatureCollection with polyline geometries', function () {

    })

    it('Import FeatureCollection with three null geometries', function () {
      var data = api.importFromFile('test_data/six_counties_three_null.json', 'geojson');
      var topo = api.buildTopology(data);
      assert.equal(data.info.input_shape_count, 6);
      assert.equal(data.properties.length, 6);
      assert.equal(topo.shapes.length, 6);
      assert.equal(Utils.filter(topo.shapes, function(shape) {return shape != null}).length, 3)
      assert.deepEqual(Utils.pluck(data.properties, 'NAME'), ["District of Columbia", "Arlington", "Fairfax County", "Alexandria", "Fairfax City", "Manassas"]);
    })
  })


  describe('Export/Import roundtrip tests', function () {
    it('Six counties', function () {
      geoJSONRoundTrip('test_data/six_counties.json');
    })

    it('Six counties, two null geometries', function () {
      geoJSONRoundTrip('test_data/six_counties_three_null.json');
    })
  })
})


function geoJSONRoundTrip(fname) {
  var data = api.importFromFile(fname, 'geojson');
  var topo = api.buildTopology(data);
  var arcs = new api.ArcDataset(topo.arcs);
  var json = api.exportGeoJSON({arcs: arcs, shapes: topo.shapes, type: data.info.input_geometry_type, properties: data.properties})

  var data2 = api.importGeoJSON(json);
  var topo2 = api.buildTopology(data2);
  var arcs2 = new api.ArcDataset(topo2.arcs);
  var json2 = api.exportGeoJSON({arcs: arcs2, shapes: topo2.shapes, type: data2.info.input_geometry_type, properties: data2.properties})

  assert.deepEqual(data.pathData, data2.pathData);
  assert.deepEqual(data.properties, data2.properties);
  assert.deepEqual(topo.shapes, topo2.shapes);
  assert.deepEqual(json, json2);
}