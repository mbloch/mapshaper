
var api = require('..'),
  assert = require('assert'),
  Utils = api.Utils,
  trace = api.trace;

describe('mapshaper-sorting.js', function () {
  describe('bucketSort()', function () {

    it('Works with various bucket counts', function () {
      var src = new Float64Array([2, 4, 0, 0, 1, 9, 7, 3, 7]),
          ids = api.sortIds(src),
          output;

      output = api.bucketSortIds(src, 2);
      assert.deepEqual(Utils.toArray(output), ids);

      output = api.bucketSortIds(src, 1);
      assert.deepEqual(Utils.toArray(output), ids);

      output = api.bucketSortIds(src, 2000);
      assert.deepEqual(Utils.toArray(output), ids);
    })

    it('Sorts 1000 random numbers', function() {
      var src = [];
      Utils.repeat(1000, function(i) {
        src.push(Math.random());
      })

      var ids = api.sortIds(src),
          output;

      output = api.bucketSortIds(src, 10);
      assert.deepEqual(Utils.toArray(output), ids);

      output = api.bucketSortIds(src, 100);
      assert.deepEqual(Utils.toArray(output), ids);

      output = api.bucketSortIds(src);
      assert.deepEqual(Utils.toArray(output), ids);
    })

  })
})