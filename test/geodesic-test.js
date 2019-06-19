var assert = require('assert'),
    api = require('..'),
    internal = api.internal;

describe('mapshaper-geodesic.js', function () {
  describe('segmentTurn()', function () {

    it('left turn', function () {
      var pp = [[0, 0], [0, 1], [2, 2], [1, 2]];
      assert.equal(internal.segmentTurn.apply(null, pp), -1);
    })
    it('right turn', function () {
      var pp = [[0, 0], [0, 1], [1, 2], [2, 2]];
      assert.equal(internal.segmentTurn.apply(null, pp), 1);
    })
    it('collinear', function () {
      var pp = [[0, 0], [0, 1], [2, 2], [2, 3]];
      assert.equal(internal.segmentTurn.apply(null, pp), 0);
    })
    it('collinear 2', function () {
      var pp = [[0, 0], [0, 1], [2, 2], [2, 1]];
      assert.equal(internal.segmentTurn.apply(null, pp), 0);
    })
  })
})
