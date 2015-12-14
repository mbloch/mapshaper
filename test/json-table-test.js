var api = require('../'),
  assert = require('assert');


describe('mapshaper-json-table.js', function () {
  describe('importJSONTable()', function () {
    it('imports clean table', function () {
      var json = JSON.stringify([{
        id: 0
      }, {
        id: 1
      }]);
      var output = api.internal.importJSONTable(JSON.parse(json));
      assert.deepEqual(output.layers[0].data.getRecords(), JSON.parse(json));
    })
  })

  describe('applyCommands() tests', function () {

    it('json -> csv', function(done) {
      var json = [{id: 0}, {id: 1}];
      api.applyCommands('-o format=csv', json, function(err, data) {
        assert.equal(data, 'id\n0\n1');
        done();
      })
    })

    it('geojson -> json', function (done) {
      var geo = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: null,
          properties: {id: 'a'}
        }, {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [0, 0]
          },
          properties: {
            id: 'b'
          }
        }]
      }
      api.applyCommands('-o format=json', geo, function(err, data) {
        assert.deepEqual(JSON.parse(data), [{id: 'a'}, {id: 'b'}]);
        done();
      })
    })
  })

})