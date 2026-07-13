import api from '../mapshaper.js';
import assert from 'assert';
import { importJSONTable } from '../src/datatable/mapshaper-json-table';



describe('mapshaper-json-table.js', function () {
  describe('importJSONTable()', function () {
    it('imports clean table', function () {
      var json = JSON.stringify([{
        id: 0
      }, {
        id: 1
      }]);
      var output = importJSONTable(JSON.parse(json));
      assert.deepEqual(output.layers[0].data.getRecords(), JSON.parse(json));
    })
  })

  describe('applyCommands() tests', function () {

    it('ndjson output', function(done) {
      var input = [{a: 'foo'}, {b: 'bar'}];
      api.applyCommands('-i data.json -o ndjson', {'data.json': input}, function(err, out) {
        var str = out['data.json'].toString();
        assert.equal(str, '{"a":"foo"}\n{"b":"bar"}');
        done();
      })
    });

    it('json -> csv', function(done) {
      var json = [{id: 0}, {id: 1}];
      api.applyCommands('-i input.json -o format=csv output.csv', {'input.json': json}, function(err, data) {
        assert.equal(data['output.csv'], 'id\n0\n1');
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
      api.applyCommands('-i input.json -o format=json output.json', {'input.json': geo}, function(err, data) {
        assert.deepEqual(JSON.parse(data['output.json']), [{id: 'a'}, {id: 'b'}]);
        done();
      })
    })
  })

})