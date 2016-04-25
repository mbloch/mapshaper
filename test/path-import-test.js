var api = require('../'),
    DataTable = api.internal.DataTable,
    assert = require('assert');

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

      api.applyCommands('-o', src, function(err, data) {
        assert.deepEqual(JSON.parse(data), target);
        done();
      });
    })
  })


})