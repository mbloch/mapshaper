
var api = require('../'),
  assert = require('assert'),
  TopoJSON = api.topojson,
  trace = api.trace;


function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('topojson-test.js', function () {

  describe('#remapShapeArcs()', function () {
    it('Remap a shape, removing a reversed arc', function () {
      var shape = [[0, 1, 2], [~1, 2, 3]],
          map = [0, -1, 1, 2];

      TopoJSON.remapShapeArcs(shape, map);
      assert.deepEqual([[0, 1], [1, 2]], shape);
    })

    it('Remap a shape, including a reversed arc', function () {
      var shape = [[0, 1, 2], [1, 2, ~3]],
          map = [0, 1, -1, 2];

      TopoJSON.remapShapeArcs(shape, map);
      assert.deepEqual([[0, 1], [1, ~2]], shape);
    })


    it('Handle a null shape', function() {
      var shape = null,
          map = [0, 1, -1, 2];

      TopoJSON.remapShapeArcs(shape, map);
      assert.equal(null, shape);
    })
  })

})