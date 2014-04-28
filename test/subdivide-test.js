var assert = require('assert'),
    api = require("../");

describe('mapshaper-subdivide.js', function () {
  describe('subdivideLayers()', function () {
    var nullArcs = new api.internal.ArcDataset([]);
    it('divide a layer into individual shapes', function() {
      var lyr = {
        shapes: [[[0]], [[1]], [[2]], [[3]], [[4]]]
      }

      var layers = api.subdivideLayers([lyr], nullArcs, "true");
      assert.equal(layers.length, 5);
      assert.deepEqual(layers[0].shapes, [[[0]]])
      assert.deepEqual(layers[1].shapes, [[[1]]])
      assert.deepEqual(layers[2].shapes, [[[2]]])
      assert.deepEqual(layers[3].shapes, [[[3]]])
      assert.deepEqual(layers[4].shapes, [[[4]]])
    })

    it('divide on a sum', function() {
      var lyr = {
        shapes: [[[0]], [[1]], [[2]], [[3]]],
        data: new api.internal.DataTable([{foo: 1}, {foo: 0}, {foo: 39}, {foo: 3}])
      }

      var layers = api.subdivideLayers([lyr], nullArcs, "sum('foo') > 5");
      assert.equal(layers.length, 3);
      assert.deepEqual(layers[0].shapes, [[[0]], [[1]]])
      assert.deepEqual(layers[1].shapes, [[[2]]])
      assert.deepEqual(layers[2].shapes, [[[3]]])
    })

  })
})
