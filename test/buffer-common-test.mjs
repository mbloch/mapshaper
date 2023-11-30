import api from '../mapshaper.js';
import assert from 'assert';
import helpers from './helpers';
var internal = api.internal;

describe('mapshaper-buffer-common.js', function () {

  describe('parseConstantBufferDistance()', function () {
    var parse = api.internal.parseConstantBufferDistance;
    var WGS84 = api.internal.parseCrsString('wgs84');
    var webmercator = api.internal.parseCrsString('webmercator');

    it('throws an error if there are units but no CRS', function () {
      assert.throws(function() {parse('12km', null)})
    });

    it('throws an error if units are unrecognized', function () {
      assert.throws(function() {parse('12parsecs', null)})
    });

    it('returns null if value is not parsable as a distance', function() {
      assert.strictEqual(parse(''), null);
      assert.strictEqual(parse('', WGS84), null);
      assert.strictEqual(parse('10 * 10'), null);
      assert.strictEqual(parse('202 W 23rd St.'), null);
    })

    it('converts units to meters with a latlong CRS or meters CRS', function() {
      assert.equal(parse('12km', WGS84), 12000)
      assert.equal(parse('12km', webmercator), 12000)
    })

    it('accepts unitless numbers if there is no CRS', function() {
      assert.equal(parse('12', null), 12)
    })
  })


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
