var assert = require('assert'),
    api = require("../");

describe('mapshaper-split.js', function () {
  describe('splitLayer()', function () {
    var nullArcs = new api.internal.ArcCollection([]);
    it('divides a layer into multiple named layers', function () {
      var records = [{foo: "spruce"}, {foo: "fir"}, {foo: "apple"}, {foo: "fir"}];
      var lyr = {
        name: "trees",
        data: new api.internal.DataTable(records),
        shapes: [[[0]], [[1], [2]], null, [[3]]]
      };
      var layers = api.splitLayer(lyr, nullArcs, 'foo');
      assert.equal(layers.length, 3)
      assert.deepEqual(layers[0].data.getRecords(), [{foo: 'spruce'}]);
      assert.deepEqual(layers[0].shapes, [[[0]]]);
      assert.equal(layers[0].name, 'trees-spruce')
      assert.deepEqual(layers[1].data.getRecords(), [{foo: "fir"}, {foo: "fir"}]);
      assert.deepEqual(layers[1].shapes, [[[1], [2]], [[3]]]);
      assert.equal(layers[1].name, 'trees-fir')
      assert.deepEqual(layers[2].data.getRecords(), [{foo: 'apple'}]);
      assert.deepEqual(layers[2].shapes, [null]);
      assert.equal(layers[2].name, 'trees-apple')
    })

    it('Fix: numerical values are converted to string names', function () {
      var records = [{foo: 0}, {foo: -1}, {foo: 1}, {foo: 1}];
      var lyr = {
        data: new api.internal.DataTable(records),
        shapes: [[[0, -2]], [[1], [2, 4]], null, [[3, 4]]]
      };
      var layers = api.splitLayer(lyr, nullArcs, 'foo');
      assert.equal(layers.length, 3)
      assert.equal(layers[0].name, 'split-0');
      assert.equal(layers[1].name, 'split--1')
      assert.equal(layers[2].name, 'split-1')
    })
  })
})
