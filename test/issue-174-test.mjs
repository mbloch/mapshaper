import api from '../mapshaper.js';
import assert from 'assert';


describe('Issue #174: Error in -merge-layers', function () {
  it ('single layer, no attributes', function(done) {

    var a = {
      type: 'Point',
      coordinates: [0, 0]
    }

    var cmd = '-i 1.json -merge-layers -o';
    api.applyCommands(cmd, {'1.json': a}, function(err, output) {
      assert.deepEqual(JSON.parse(output['1.json']), {type: 'GeometryCollection', geometries: [a]});
      done();
    });
  });

  it ('two layers with no attributes', function(done) {
    var a = {
      type: 'Feature',
      properties: null,
      geometry: {
        type: 'Point',
        coordinates: [0, 0]
      }
    };

    var b = {
      type: 'Point',
      coordinates: [1, 1]
    }

    var cmd = '-i 1.json 2.json combine-files -merge-layers -o out.json';
    api.applyCommands(cmd, {'1.json': a, '2.json': b}, function(err, output) {
      var target = {type: 'GeometryCollection', geometries: [a.geometry, b]}
      assert.deepEqual(JSON.parse(output['out.json']), target);
      done();
    });
  });


});
