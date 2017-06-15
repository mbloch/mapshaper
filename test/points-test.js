var assert = require('assert'),
    api = require("../");

describe('mapshaper-points.js', function () {

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
