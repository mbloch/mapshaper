
var api = require('..'),
    assert = require('assert');

describe('mapshaper-buffer.js', function () {

  describe('parseConstantBufferDistance()', function () {
    var parse = api.internal.parseConstantBufferDistance;
    var WGS84 = api.internal.getCRS('wgs84');
    var webmercator = api.internal.getCRS('webmercator');

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

})

