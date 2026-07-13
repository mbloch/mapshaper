import api from '../mapshaper.js';
import assert from 'assert';
import helpers from './helpers';
var fixPath = helpers.fixPath;


describe('mapshaper-file-import.js', function () {
  describe('importFile()', function () {

    it('import .shp when .dbf is missing', function () {
      var path = fixPath('data/shapefile/polygons.shp');
      var dataset = api.internal.importFile(path);
      var lyr = dataset.layers[0];
      assert.equal(lyr.shapes.length, 3);
      assert.equal(lyr.data, undefined);
    })

    it('import .shp when .dbf is present', function () {
      var path = fixPath('data/shapefile/two_states.shp');
      var dataset = api.internal.importFile(path);
      var lyr = dataset.layers[0];
      assert.equal(lyr.shapes.length, 2);
      assert.equal(lyr.data.size(), 2);
      assert.equal(lyr.name, 'two_states');
    })
  })

  describe('importDatasetsFromFile()', function () {
    it('resolves to an array for formats with synchronous parsers', async function () {
      var path = fixPath('data/shapefile/two_states.shp');
      var datasets = await api.internal.importDatasetsFromFile(path);
      var dataset = datasets[0];
      assert.equal(datasets.length, 1);
      var lyr = dataset.layers[0];
      assert.equal(lyr.shapes.length, 2);
      assert.equal(lyr.data.size(), 2);
    })
  })

  describe('importDatasetsFromContent()', function () {
    it('resolves to an array for formats with synchronous parsers', async function () {
      var datasets = await api.internal.importDatasetsFromContent({
        json: {
          filename: 'point.geojson',
          content: '{"type":"Point","coordinates":[1,2]}'
        }
      });
      var dataset = datasets[0];
      assert.equal(datasets.length, 1);
      assert.equal(dataset.layers.length, 1);
      assert.deepEqual(dataset.layers[0].shapes, [[[1, 2]]]);
    })
  })
})
