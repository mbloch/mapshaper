
import api from '../';
import assert from 'assert';

var parseDMS = api.internal.parseDMS;
var formatDMS = api.internal.formatDMS;

describe('mapshaper-dms.js', function () {

  describe('formatDMS()', function() {
    // verified by
    var fmt1 = 'DDMMSS[WE]';
    it(fmt1, function() {
      assert.equal(formatDMS(0, fmt1), '000000E')
      assert.equal(formatDMS(180, fmt1), '1800000E')
      assert.equal(formatDMS(-180, fmt1), '1800000W')
      assert.equal(formatDMS(-180.00001, fmt1), '1800000W')
      assert.equal(formatDMS(-179.99999, fmt1), '1800000W')
    });

    var fmt2 = 'DDMMSS.SSS';
    it(fmt2, function() {
      assert.equal(formatDMS(32.0451, fmt2), '320242.360')
    })

    var fmt3 = '[+-]DdMmSs';
    it(fmt3, function() {
      assert.equal(formatDMS(32.0451, fmt3), '+32d2m42s')
      assert.equal(formatDMS(-32.0451, fmt3), '-32d2m42s')
    })
  })

  describe('parseDMS()', function () {
    // references for format variations
    // https://www.maptools.com/tutorials/lat_lon/formats
    // http://www.geomidpoint.com/latlon.html
    it('valid DMS values', function () {
      // D
      assert.equal(parseDMS('0°'), 0);
      assert.equal(parseDMS('0d'), 0);
      assert.equal(parseDMS('-1°'), -1);
      assert.equal(parseDMS('1S'), -1);

      // D M
      assert.equal(parseDMS('0°30\''), 0.5);
      assert.equal(parseDMS('-1°30'), -1.5);

      // D M.M
      assert.equal(parseDMS('-1°30.000'), -1.5);
      assert.equal(parseDMS('-1°30.02'), -1 - 30.02 / 60);

      // D M S
     assert.equal(parseDMS('11 6 36 W'), -11.11);
      assert.equal(parseDMS('11 6 36 S'), -11.11);
      assert.equal(parseDMS('-11 6 36'), -11.11);
      assert.equal(parseDMS('11 6 36 e'), 11.11);
      assert.equal(parseDMS('11 6 36 N'), 11.11);
      assert.equal(parseDMS('-11°6\'36"'), -11.11);
      assert.equal(parseDMS('11°6\'36"S'), -11.11);
      assert.equal(parseDMS('11° 6\' 36" W'), -11.11);
      assert.equal(parseDMS('11° 6′ 36″ W'), -11.11); // fancy quotes
      assert.equal(parseDMS('0° 6\' 36" s'), -0.11);
      assert.equal(parseDMS('-0° 6\' 36"'), -0.11);

      // D M S.S
      assert.equal(parseDMS('-11°7\'36.5"'), -11 - 7 / 60 - 36.5 / 3600);

      // D.D
      assert.equal(parseDMS('122.61458° W'), -122.61458)
      assert.equal(parseDMS('-122.61458°'), -122.61458)
      assert.equal(parseDMS('-122.61458D'), -122.61458)
      assert.equal(parseDMS('W122.61458°'), -122.61458)
      assert.equal(parseDMS('S122.61458°'), -122.61458)
      assert.equal(parseDMS('N122.61458°'), 122.61458)
      assert.equal(parseDMS('E122.61458°'), 122.61458)
      assert.equal(parseDMS('+122.61458°'), 122.61458)
    });

    it('invalid DMS values', function () {
      assert(isNaN(parseDMS('0x')));
      assert(isNaN(parseDMS('')));
      assert(isNaN(parseDMS('X122.61458°')));
    });
  });
});
