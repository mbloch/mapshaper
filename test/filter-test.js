var assert = require('assert'),
    api = require("../");

describe('mapshaper-filter.js', function () {
  describe('filter()', function () {
    var nullArcs = new api.internal.ArcCollection([]);
    it('removes records based on attribute value', function () {
      var records = [{foo: 0}, {foo: 2}];
      var lyr = {
        shapes: [[[0]], [[1]]],
        data: new api.internal.DataTable(records)
      };
      api.filterFeatures(lyr, nullArcs, "foo == 2");
      assert.deepEqual(lyr.data.getRecords(), [{foo: 2}]);
      assert.deepEqual(lyr.shapes, [[[1]]]);
    })

    it('removes records based on shape geometry', function () {
      var records = [{foo: 0}, {foo: 2}];
      var lyr = {
        geometry_type: 'polygon',
        shapes: [[[0], [1]], [[1]]],
        data: new api.internal.DataTable(records)
      };
      api.filterFeatures(lyr, nullArcs, "$.partCount > 1");
      assert.deepEqual(lyr.data.getRecords(), [{foo: 0}]);
      assert.deepEqual(lyr.shapes, [[[0], [1]]]);
    })
  })
})