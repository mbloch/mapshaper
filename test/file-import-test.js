var api = require('../'),
  path = require('path'),
  assert = require('assert');

function fixPath(p) {
  return require('path').join(__dirname, p);
}

describe('mapshaper-file-import.js', function () {
  describe('importFile()', function () {

    it('import .shp when .dbf is missing', function () {
      var path = fixPath('data/shapefile/polygons.shp');
      var dataset = api.importFile(path);
      var lyr = dataset.layers[0];
      assert.equal(lyr.shapes.length, 3);
      assert.equal(lyr.data, undefined);
    })

    it('import .shp when .dbf is present', function () {
      var path = fixPath('data/two_states.shp');
      var dataset = api.importFile(path);
      var lyr = dataset.layers[0];
      assert.equal(lyr.shapes.length, 2);
      assert.equal(lyr.data.size(), 2);
      assert.equal(lyr.name, 'two_states');
    })

  })
})
