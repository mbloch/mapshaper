
var api = require('../'),
  assert = require('assert');


function testSortedIds(ids, arr) {
  for (var i=1, n=ids.length; i<n; i++) {
    if (arr[ids[i]] < arr[ids[i-1]]) {
      return false;
    }
  }
  return true;
};


describe('mapshaper-snapping.js', function () {
  /*
  describe('bucketSortIds()', function () {
    it('test 1', function () {
      var arr = [2, 0, 1, -1, -1, 0, 3];

      assert(testSortedIds(api.utils.bucketSortIds(arr, 1), arr));
      assert(testSortedIds(api.utils.bucketSortIds(arr, 2), arr));
      assert(testSortedIds(api.utils.bucketSortIds(arr, 3), arr));
      assert(testSortedIds(api.utils.bucketSortIds(arr, 4), arr));
      assert(testSortedIds(api.utils.bucketSortIds(arr, 5), arr));
    })
  })
  */

  describe('sortCoordinateIds()', function () {

    it('test 2', function () {
      var arr = [];
      api.utils.repeat(10000, function() {
        arr.push(Math.random());
      });

      var ids = api.utils.sortCoordinateIds(arr);
      assert(testSortedIds(ids, arr));
    })

  })

})