import assert from 'assert';
import api from '../mapshaper.js';


describe('mapshaper-subdivide.js', function () {
  describe('subdivideLayer()', function () {
    var nullArcs = new api.internal.ArcCollection([]);
    it('divide a layer into individual shapes', function() {
      var lyr = {
        geometry_type: "polygon",
        shapes: [[[0]], [[1]], [[2]], [[3]], [[4]]]
      }

      var layers = api.cmd.subdivideLayer(lyr, nullArcs, "true");
      assert.equal(layers.length, 5);
      assert.deepEqual(layers[0].shapes, [[[0]]])
      assert.deepEqual(layers[1].shapes, [[[1]]])
      assert.deepEqual(layers[2].shapes, [[[2]]])
      assert.deepEqual(layers[3].shapes, [[[3]]])
      assert.deepEqual(layers[4].shapes, [[[4]]])
    })

    it('subdivided layer naming is consistent with split command', function() {
      var lyr = {
        geometry_type: "polygon",
        shapes: [[[0]], [[1]], [[2]], [[3]], [[4]]]
      }
      var layers = api.cmd.subdivideLayer(lyr, nullArcs, "true");
      assert.equal(layers[0].name, 'split-1')
      assert.equal(layers[1].name, 'split-2')
      lyr.name = 'foo';
      layers = api.cmd.subdivideLayer(lyr, nullArcs, "true");
      assert.equal(layers[0].name, 'foo-1')
      assert.equal(layers[1].name, 'foo-2')
    })

    it('divide on a sum', function() {
      var lyr = {
        geometry_type: "polygon",
        shapes: [[[0]], [[1]], [[2]], [[3]]],
        data: new api.internal.DataTable([{foo: 1}, {foo: 0}, {foo: 39}, {foo: 3}])
      }

      var layers = api.cmd.subdivideLayer(lyr, nullArcs, "sum(foo) > 5");
      assert.equal(layers.length, 3);
      assert.deepEqual(layers[0].shapes, [[[0]], [[1]]])
      assert.deepEqual(layers[1].shapes, [[[2]]])
      assert.deepEqual(layers[2].shapes, [[[3]]])
    })

    it('divide on a sum, field name not quoted', function() {
      var lyr = {
        geometry_type: "polygon",
        shapes: [[[0]], [[1]], [[2]], [[3]]],
        data: new api.internal.DataTable([{foo: 1}, {foo: 0}, {foo: 39}, {foo: 3}])
      }

      var layers = api.cmd.subdivideLayer(lyr, nullArcs, "sum(foo) > 5");
      assert.equal(layers.length, 3);
      assert.deepEqual(layers[0].shapes, [[[0]], [[1]]])
      assert.deepEqual(layers[1].shapes, [[[2]]])
      assert.deepEqual(layers[2].shapes, [[[3]]])
    })

  })
})
