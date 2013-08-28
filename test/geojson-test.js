var api = require('../'),
    assert = require('assert');

var Utils = api.Utils,
    Node = api.Node;

function fixPath(p) {
  return Node.path.join(__dirname, p);
}

describe('mapshaper-geojson.js', function () {
  describe('#importGeoJSON', function () {
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
  var arcs = new api.ArcDataset(data.arcs);
  var files = api.exportContent(data.layers, arcs, {output_format:'geojson'})

  var data2 = api.importContent(files[0].content, 'json');
  var arcs2 = new api.ArcDataset(data2.arcs);
  var files2 = api.exportContent(data2.layers, arcs2, {output_format:'geojson'})

  //assert.deepEqual(data.layers[0].properties, data2.layers[0].properties);
  //assert.deepEqual(data.layers[0].shapes, data2.layers[0].shapes);
  assert.deepEqual(files, files2);
}