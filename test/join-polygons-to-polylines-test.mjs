import api from '../mapshaper.js';
import assert from 'assert';


describe('Polygons to polylines spatial joins', function () {

  var lines = {
    type: 'GeometryCollection',
    geometries: [{
      type: 'LineString',
      coordinates: [[0, 0], [1, 1], [2, 2]]
    }, {
      type: 'LineString',
      coordinates: [[3, 3], [4, 4]]
    }]
  }

  var polygon = {
    type: 'Polygon',
    coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]]]
  };

  it ('polyline to polygon', function(done) {
    var cmd = '-i targ.json -join point-method src.json calc="n = count()" -o';
    api.applyCommands(cmd, {'targ.json': polygon, 'src.json': lines}, function(err, out) {
      var json = JSON.parse(out['targ.json']);
      var expect = {n: 1};
      assert.deepEqual(json.features[0].properties, expect)
      done();
    })
  });

  it ('polygon to polyline', function(done) {
    var cmd = '-i targ.json -join point-method src.json calc="n = count()" -o';
    api.applyCommands(cmd, {'targ.json': lines, 'src.json': polygon}, function(err, out) {
      var json = JSON.parse(out['targ.json']);
      assert.deepEqual(json.features[0].properties, {n: 1})
      assert.deepEqual(json.features[1].properties, {n: 0})
      done();
    })
  });
})
