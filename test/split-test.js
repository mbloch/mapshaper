var assert = require('assert'),
    api = require("../");

describe('mapshaper-split.js', function () {
  describe('splitOnField()', function () {
    var nullArcs = new api.ArcDataset([]);
    it('divides a layer into multiple named layers', function () {
      var records = [{foo: "spruce"}, {foo: "fir"}, {foo: "apple"}, {foo: "fir"}];
      var lyr = {
        data: new api.data.DataTable(records),
        shapes: [[[0]], [[1], [2]], null, [[3]]]
      };
      var layers = api.splitOnField(lyr, nullArcs, 'foo');
      assert.equal(layers.length, 3)
      assert.deepEqual(layers[0].data.getRecords(), [{foo: 'spruce'}]);
      assert.deepEqual(layers[0].shapes, [[[0]]]);
      assert.equal(layers[0].name, 'spruce')
      assert.deepEqual(layers[1].data.getRecords(), [{foo: "fir"}, {foo: "fir"}]);
      assert.deepEqual(layers[1].shapes, [[[1], [2]], [[3]]]);
      assert.equal(layers[1].name, 'fir')
      assert.deepEqual(layers[2].data.getRecords(), [{foo: 'apple'}]);
      assert.deepEqual(layers[2].shapes, [null]);
      assert.equal(layers[2].name, 'apple')
    })
  })

})
