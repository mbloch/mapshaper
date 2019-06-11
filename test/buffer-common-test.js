var api = require('..'),
    assert = require('assert'),
    internal = api.internal,
    helpers = require('./helpers');

describe('mapshaper-buffer-common.js', function () {

  describe('getBufferToleranceFromCircleSegments()', function () {
    function test(segs) {
      var pct = internal.getBufferToleranceFromCircleSegments(segs);
      var deg = internal.getArcDegreesFromTolerancePct(pct);
      var segs2 = 360 / deg;
      helpers.almostEqual(segs, segs2);
    }

    it('roundtrip with getArcDegreesFromTolerancePct()', function () {
      test(10);
      test(4);
      test(72);
    })

  })
  describe('getBufferToleranceFromCircleSegments2()', function () {
    function test2(segs) {
      var pct = internal.getBufferToleranceFromCircleSegments2(segs);
      var deg = internal.getArcDegreesFromTolerancePct2(pct);
      var segs2 = 360 / deg;
      helpers.almostEqual(segs, segs2);
    }
    it('roundtrip with getArcDegreesFromTolerancePct()2', function () {
      test2(10);
      test2(4);
      test2(72);
    })
  });
});
