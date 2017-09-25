var assert = require('assert'),
    api = require("../");

function test(input, arg, expect, done) {
  var expectArray = Array.isArray(expect);
  var cmd = '-i in.json -dissolve2 max-gap-area=0 ' + (arg || '') + ' -o out.json';
  api.applyCommands(cmd, {'in.json': input}, function(err, output) {
    var out = JSON.parse(output['out.json']);
    var result = out.geometries || out.features;
    if (!expectArray) {
      assert.equal(result.length, 1);
      result = result[0];
    }
    assert.deepEqual(result, expect);
    done();
  });
}

describe('mapshaper-dissolve2.js II', function () {

  describe('-dissolve2 command', function () {

    it('dissolves cw ring inside another cw ring', function (done) {
      // Fig. 14
      var input = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]]]
        }, {
          type: 'Polygon',
          coordinates: [[[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]]
        }]
      };
      var expect = {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]]]
      };
      test(input, null, expect, done);
    })


    it('dissolving single polygon preserves hole', function (done) {
      // Fig. 14
      var input = {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]]
      };
      var expect = {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]]
      };
      test(input, null, expect, done);
    })

    it('donut and hole dissolve cleanly', function (done) {
      // Fig. 14
      var input = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]]
        }, {
          type: 'Polygon',
          coordinates: [[[1, 2], [2, 2], [2, 1], [1, 1], [1, 2]]] // rotated relative to containing hole
        }]
      };
      var expect = {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 3], [3, 3], [3, 0], [0, 0]]]
      };
      test(input, null, expect, done);
    })

  })
})
