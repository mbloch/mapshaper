import assert from 'assert';
import { addBufferVertex } from '../src/buffer/mapshaper-path-buffer-v1';

describe('mapshaper-polyline-buffer.js', function () {
  // addBufferVertex function is no longer exported
  return;
  describe('addBufferVertex', function () {
    var a = [[1, 1], [3, 3], [1, 5], [3, 7], [2, 8]];
    it('remove intersections with backtracking == 10', function () {
      var arr = a.concat();
      addBufferVertex(arr, [2, 1], 10);
      var expect = [[1, 1], [2, 2], [2, 1]];
      assert.deepEqual(arr, expect);
    })

    it('remove intersections with backtracking == 1', function () {
      var arr = a.concat();
      addBufferVertex(arr, [2, 1], 1);
      var expect = [[1, 1], [3, 3], [1, 5], [2, 6], [2, 1]];
      assert.deepEqual(arr, expect);
    })

  })
})
