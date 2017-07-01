var assert = require('assert'),
    api = require("../");

describe('mapshaper-points.js', function () {

  it ('interpolated points', function(done) {
    var a = {
      type: 'LineString',
      coordinates: [[0, 0], [300, 0], [300, 300], [300, 310], [300, 311], [300, 600]]
    };
    var expected = {
      type: 'MultiPoint',
      coordinates: [[0, 0], [200, 0], [300, 100], [300, 300], [300, 500], [300, 600]]
    };
    api.applyCommands('-i a.json -points interpolated interval=200 -o', {'a.json': a}, function(err, output) {
      var geom = JSON.parse(output['a.json']).geometries[0];
      assert.deepEqual(geom, expected);
      done();
    })
  })

  it ('-points command with vertices option', function(done) {
    var a = {
      type: 'Polygon',
      coordinates: [[[2, 2], [3, 2], [2, 1], [2, 2]]]
    };
    var expected = {
      type: 'GeometryCollection',
      geometries: [{
        type: 'MultiPoint',
        coordinates: [[2, 2], [3, 2], [2, 1]]
      }]
    };
    api.applyCommands('-i a.json -points vertices -o', {'a.json': a}, function(err, output) {
      assert.deepEqual(JSON.parse(output['a.json']), expected);
      done();
    })
  })

})
