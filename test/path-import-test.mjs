import api from '../mapshaper.js';
import assert from 'assert';
var DataTable = api.internal.DataTable;


describe('mapshaper-path-import.js', function () {

  describe('issue #125', function () {
    it('open polygon paths are automatically closed', function (done) {
      var src = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0]], [[1, 1], [2, 1], [2, 2], [1, 2]]]
        }]
      };

      var target = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]]
        }]
      };

      api.applyCommands('-o gj2008', src, function(err, data) {
        assert.deepEqual(JSON.parse(data), target);
        done();
      });
    })

    it('test 2', function (done) {
      api.applyCommands('-i test/data/issues/125/openring.json -o', null, function(err, output) {
        var coords = JSON.parse(output['openring.json']).geometries[0].coordinates;
        var first = coords[0][0];
        var last = coords[0][coords[0].length - 1];
        assert(!!first);
        assert.deepEqual(first, last);
        done();
      });
    })

  })

})
