// references for format variations
// https://www.sunearthtools.com/dp/tools/conversion.php
// https://www.maptools.com/tutorials/lat_lon/formats
// http://www.geomidpoint.com/latlon.html

import api from '../mapshaper.js';
import assert from 'assert';

var parseDMS = api.internal.parseDMS;
var formatDMS = api.internal.formatDMS;

describe('mapshaper-dms.js', function () {

  describe('roundtrip tests', function() {
    tests('[-]DDD.DDDDD°');
    tests('[-]DDMMSS');
    tests('DD° MM′ SS.SSSSS″ [N S]');
    tests('[+-]DDMM.MMMMM', true);
    tests('[EW] DDD° MM\' SS.S"', true);

    function tests(fmt, isLon) {
      function test(coord) {
        var dms = formatDMS(coord, fmt);
        var coord2 = parseDMS(dms, fmt);
        var dms2 = formatDMS(coord2, fmt);
        assert.equal(dms, dms2);
      }

      it(fmt, function() {
        test(0);
        test(89.99452);
        test(-89.99452);
        test(-3.03539843345);
        test(-37.49999999999);
        test(10.00000001);
        test(10.0000001);
        test(10.000001);
        test(10.00001);
        test(10.0001);
        test(10.001);
        test(10.005);
        test(10.049);
        if (isLon) {
          test(180);
          test(-180);
          test(-179.999);
          test(-100.45140975209458);
        }
        var n = 1000; // 100000;
        while (n--) {
          test((Math.random() - 0.5) * (isLon ? 360 : 180));
        }
      })
    }
  });


  describe('format_dms() expression function', function() {
    it ('test1', async function() {
      var data = 'lat,lon\n'

    })
  })

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

    var fmt2 = '[-]DDMMSS.SSS';
    it(fmt2, function() {
      assert.equal(formatDMS(-32.0451, fmt2), '-320242.360')
    })

    var fmt3 = '[+-]DdMmSs';
    it(fmt3, function() {
      assert.equal(formatDMS(32.0451, fmt3), '+32d2m42s')
      assert.equal(formatDMS(-32.0451, fmt3), '-32d2m42s')
    })

    var fmt4 = 'DD° MM′ SS.SSSSS″ [N S]';
    it(fmt4, function() {
      assert.equal(formatDMS(149.128684, fmt4), "149° 07′ 43.26240″ N")
      assert.equal(formatDMS(-35.282000, fmt4), "35° 16′ 55.20000″ S")
    })

    var fmt5 = 'DDD° MM.MMM\' [SN]';
    it(fmt5, function() {
      assert.equal(formatDMS(32.30642, fmt5), "032° 18.385' N")
      assert.equal(formatDMS(-122.61458, fmt5), "122° 36.875' S")
    })
  })


  describe('parseDMS()', function () {

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

    var fmt1 = '[-]DDDMMSS.SSS';
    it(fmt1, function() {
      assert.equal(parseDMS('00000.0', fmt1), 0);
    })

    var fmt2 = '[-]DDD.DDD°';
    it(fmt2, function() {
      assert.equal(parseDMS('45.9334°', fmt2), 45.9334);
      assert.equal(parseDMS('-50.0°', fmt2), -50);
    })

    it('invalid DMS values', function () {
      assert(isNaN(parseDMS('0x')));
      assert(isNaN(parseDMS('')));
      assert(isNaN(parseDMS('X122.61458°')));
    });
  });
});
