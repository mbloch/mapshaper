
var api = require('..'),
  assert = require('assert'),
  Utils = api.Utils,
  trace = api.trace;

describe('mapshaper-sorting.js', function () {

  describe('bucketSort()', function () {

    it('should', function () {
      var src = [2, 4, 0, 1, 9, 7, 3],
          xx = new Float64Array(src),
          ids = [2, 3, 0, 6, 1, 5, 4];
      var output = api.bucketSortIds(xx, 2);
      assert.deepEqual(Utils.toArray(output), ids);
    })

  })
})