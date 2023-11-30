import api from '../mapshaper.js';
import assert from 'assert';
var internal = api.internal;

describe('mapshaper-polyline-buffer.js', function () {
  describe('addBufferVertex', function () {
    var a = [[1, 1], [3, 3], [1, 5], [3, 7], [2, 8]];
    it('remove intersections with backtracking == 10', function () {
      var arr = a.concat();
      internal.addBufferVertex(arr, [2, 1], 10);
      var expect = [[1, 1], [2, 2], [2, 1]];
      assert.deepEqual(arr, expect);
    })

    it('remove intersections with backtracking == 1', function () {
      var arr = a.concat();
      internal.addBufferVertex(arr, [2, 1], 1);
      var expect = [[1, 1], [3, 3], [1, 5], [2, 6], [2, 1]];
      assert.deepEqual(arr, expect);
    })

  })
})
