import api from '../mapshaper.js';
import assert from 'assert';
var internal = api.internal;


describe('mapshaper-divide.js', function () {

  it('test 1', function (done) {
    var cmd = '-i test/data/features/divide/ex1_line.json -divide test/data/features/divide/ex1_polygon.json -o output.json';

    var target = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {polygon_name: 'A', line_name: 'B'},
        geometry: {type: 'LineString', coordinates: [[0, 1], [1, 1]]}
      }, {
        type: 'Feature',
        properties: {polygon_name: null, line_name: 'B'},
        geometry: {type: 'LineString', coordinates: [[1, 1], [2, 1]]}
      }]
    };

    api.applyCommands(cmd, {}, function(err, out) {
      var json = JSON.parse(out['output.json']);
      assert.deepEqual(json, target);
      done();
    })
  });

});
