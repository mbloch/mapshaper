import api from '../mapshaper.js';
import assert from 'assert';

describe('mapshaper-dataset-utils.js', function () {

  describe('copyLayerShapes()', function () {
    it('deep-copy shapes, shallow-copy other attributes', function () {
      var data = new api.internal.DataTable([{foo: 'bar'}]);
      var shapes = [[[1, 1]]];
      var lyr = {
        geometry_type: 'point',
        data: data,
        shapes: shapes,
        target_id: 1,
        name: 'layer1'
      }
      var copy = api.internal.copyLayerShapes(lyr);
      assert.strictEqual(data, copy.data);
      assert(copy.shapes != shapes);
      assert(copy.shapes[0] != shapes[0]);
      assert(copy.shapes[0][0] != shapes[0][0]);
      assert.equal(copy.target_id, 1);
      assert.equal(copy.name, 'layer1');
      assert.equal(copy.geometry_type, 'point');
    })
  })

  describe('copyLayer()', function () {
    it('duplicate data records', function () {
      var lyr = {
        data: new api.internal.DataTable([{foo: 'a', bar: null}])
      };
      var copy = api.internal.copyLayer(lyr);
      assert.deepEqual(copy.data.getRecords(), lyr.data.getRecords());
      assert.notEqual(copy.data.getRecords()[0], lyr.data.getRecords()[0])
    })

    it('duplicate shapes', function () {
      var lyr = {
        geometry_type: 'point',
        shapes: [[[1, 3]], null]
      };
      var copy = api.internal.copyLayer(lyr);
      assert.deepEqual(copy, lyr);
      assert.notEqual(copy.shapes[0], lyr.shapes[0])
    })
  })

})
