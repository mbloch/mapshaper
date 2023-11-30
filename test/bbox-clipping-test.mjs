import assert from 'assert';
import api from '../mapshaper.js';

function test(expected, input, bbox, isRing) {
  var bounds = new api.internal.Bounds(bbox);
  var iter = new api.internal.PointIter(input);
  var output = api.internal.clipIterByBounds(iter, bounds, isRing);
  // console.log("output:", output)
  assert.deepEqual(output, expected);
}

describe('mapshaper-bbox-clipping.js', function () {
  describe('clipIterByBounds() tests', function () {

    it('test 2e', function () {
      // segment goes to opposite corner, on the right
      var bbox = [1, 1, 2, 2];
      var input = [[0, -10], [10, 3]];
      var expected = [[1, 1], [2, 1], [2, 2]];
      test(expected, input, bbox, false);
    })

    it('test 2f', function () {
      // segment goes to opposite corner, on the left
      var bbox = [1, 1, 2, 2];
      var input = [[-10, 0], [3, 10]];
      var expected = [[1, 1], [1, 2], [2, 2]];
      test(expected, input, bbox, false);
    })

    it('test 2g', function () {
      // segment goes to opposite corner, on the right (2)
      var bbox = [1, 1, 2, 2];
      var input = [[10, 0], [0, 10]];
      var expected = [[2, 1], [2, 2], [1, 2]];
      test(expected, input, bbox, false);
    })

    it('test 2h', function () {
      // segment goes to opposite corner, on the left (2)
      var bbox = [1, 1, 2, 2];
      var input = [[3, -10], [0, 3]];
      var expected = [[2, 1], [1, 1], [1, 2]];
      test(expected, input, bbox, false);
    })

    it('test 5a', function () {
      var bbox = [1, 1, 2, 2];
      var input = [[3, 3], [3, 0], [1.5, 0], [0.5, 0], [0, 0], [0, 0.5], [0, 3], [3, 3]];
      var expected = [[2, 2], [2, 1], [1, 1], [1, 2], [2, 2]];
      test(expected, input, bbox, true);
    })

    it('test 5b', function () {
      var bbox = [1, 1, 2, 2];
      var input = [[3, 3], [3, 0], [1.5, 0], [0.5, 0], [0, 0], [0, 0.5], [0, 3], [3, 3]].reverse();
      var expected = [[2, 2], [2, 1], [1, 1], [1, 2], [2, 2]].reverse();
      test(expected, input, bbox, true);
    })

    it('test 4b', function () {
      var bbox = [1, 1, 5, 5];
      var input = [[0, 3], [3, 0], [6, 3], [3, 6], [0, 3]];
      var expected = [[1, 2], [1, 4], [2, 5], [4, 5], [5, 4], [5, 2], [4, 1], [2, 1], [1, 2]].reverse();
      test(expected, input, bbox, true);
    })


    it('test 4a', function () {
      var bbox = [1, 1, 5, 5];
      var input = [[0, 3], [3, 6], [6, 3], [3, 0], [0, 3]];
      var expected = [[1, 4], [2, 5], [4, 5], [5, 4], [5, 2], [4, 1], [2, 1], [1, 2], [1, 4]];
      test(expected, input, bbox, true);
    })


    it('test 3b', function () {
      var bbox = [0, 0, 3, 3];
      var input = [[1, 5], [-5, -1]];
      var expected = [[0, 3], [0, 0]];
      test(expected, input, bbox, false);
    })

    it('test 3a', function () {
      var bbox = [0, 0, 3, 3];
      var input = [[1, 5], [-2, 2]];
      var expected = [];
      test(expected, input, bbox, false);
    })

    it('test 1', function () {
      var bbox = [0, 0, 3, 3];
      var input = [[1, 1], [2, 2]];
      var expected = [[1, 1], [2, 2]];
      test(expected, input, bbox, false);
    })

    it('test 2a', function () {
      var bbox = [0, 0, 3, 3];
      var input = [[-1, 1], [4, 1]];
      var expected = [[0, 1], [3, 1]];
      test(expected, input, bbox, false);
    })

    it('test 2b', function () {
      var bbox = [0, 0, 3, 3];
      var input = [[1, 4], [1, -1]];
      var expected = [[1, 3], [1, 0]];
      test(expected, input, bbox, false);
    })

    it('test 2c', function () {
      var bbox = [0, 0, 3, 3];
      var input = [[1, -1], [1, 4]];
      var expected = [[1, 0], [1, 3]];
      test(expected, input, bbox, false);
    })

    it('test 2d', function () {
      var bbox = [0, 0, 3, 3];
      var input = [[4, 1], [-1, 1]];
      var expected = [[3, 1], [0, 1]];
      test(expected, input, bbox, false);
    })

  })

});
