
import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';

describe('mapshaper-units.js', function () {
  describe('parseMeasure()', function () {
    function good(str, expect) {
      it(str, function() {
        var o = api.internal.parseMeasure(str);
        assert.deepEqual(o, expect)
      });
    }

    function bad(s) {
      it(s, function() {
        assert.throws(function() {
          api.internal.parseMeasure(s);
        });
      })
    }

    good('5km', {units: 'kilometers', areal: false, value: 5})
    good('5000 km2', {units: 'kilometers', areal: true, value: 5000})
    good('5.0sqkm', {units: 'kilometers', areal: true, value: 5})
    good('10000ft', {units: 'feet', areal: false, value: 10000})
    good('1e5 feet', {units: 'feet', areal: false, value: 100000})
    good('1e5', {value: 100000})
    good('2.43e3 m2', {units: 'meters', areal: true, value: 2430})
    good('5000 miles', {value: 5000, units: 'miles', areal: false})
    good('5000mi', {value: 5000, units: 'miles', areal: false})

    bad('a');
    bad('');
    bad('30 hectares');
  })

  describe('getIntervalConversionFactor()', function () {
    function good(param, crs, expect) {
      it(param + ', ' + crs, function() {
        var P = crs ? api.internal.parseCrsString(crs) : null;
        var k = api.internal.getIntervalConversionFactor(param, P);
        assert.strictEqual(k, expect);
      });
    }

    function bad(param, crs) {
      it('invalid: ' + param + ', ' + crs, function() {
        assert.throws(function() {
          var P = crs ? api.internal.parseCrsString(crs) : null;
          var k = api.internal.getIntervalConversionFactor(param, P);
        });
      })
    }

    good('meters', '+init=epsg:3424', 1/0.304800609601219) // state plane (us-ft)
    good('miles', '+init=epsg:3424', 1609.344 * 1/0.304800609601219) // state plane (us-ft)
    good('kilometers', '+init=epsg:3707', 1000) // UTM 60N (meters)

    good('', null, 1)
    good('', 'wgs84', 1)
    good('kilometers', 'wgs84', 1000)
    good('meters', 'wgs84', 1)
    good('feet', 'wgs84', 0.3048)
    good('miles', 'wgs84', 1609.344)
    good('miles', 'wgs84', 1609.344)

    bad('hectares', 'wgs84')
    bad('kilometers', null)
    bad('meters', null)

  })

  describe('convertAreaParam()', function () {
    it('km2/wgs84', function () {
      var json = fs.readFileSync('test/data/three_points.geojson', 'utf8');
      var crs = api.internal.getDatasetCRS(api.internal.importGeoJSON(json, {}));
      var val = api.internal.convertAreaParam('20km2', crs);
      assert.equal(val, 20e6)
    })
  })

  describe('convertDistanceParam()', function () {
    var wgs84 = api.internal.parseCrsString('wgs84')
    it('areal units trigger error', function () {
      assert.throws(function() {
        var val = api.internal.convertDistanceParam('20km2', wgs84);
      })
    })

    it('miles/wgs84', function () {
      var val = api.internal.convertDistanceParam('10mi', wgs84);
      assert.equal(val, 10 * 1609.344);
    })

    it('no units/wgs84', function () {
      var val = api.internal.convertDistanceParam('4000', wgs84);
      assert.equal(val, 4000);
    })

  })

  describe('convertIntervalParam()', function () {
    var wgs84 = api.internal.parseCrsString('wgs84')
    it('km units trigger error for latlong dataset', function () {
      assert.throws(function() {
        var val = api.internal.convertIntervalParam('20km', wgs84);
      })
    })

    it('mi units trigger error for latlong dataset', function () {
      assert.throws(function() {
        var val = api.internal.convertIntervalParam('10mi', wgs84);
      })
    })

    it('no units/wgs84', function () {
      var val = api.internal.convertIntervalParam('4000', wgs84);
      assert.equal(val, 4000);
    })
  })

  describe('convertIntervalPair()', function () {
    var crs = api.internal.parseCrsString('wgs84');
    it('less than two args = error', function () {
      assert.throws(function() {
        var val = api.internal.convertIntervalPair(['20'], crs);
      })
    })

    it('mi units trigger error for latlong dataset', function () {
      assert.throws(function() {
        var val = api.internal.convertIntervalPair(['10mi', '2mi'], crs);
      })
    })

    it('no units/wgs84', function () {
      var val = api.internal.convertIntervalPair(['4000', '2000'], crs);
      assert.deepEqual(val, [4000, 2000]);
    })

    it('km/mercator', function(done) {
      var cmd = '-i test/data/three_points.geojson -proj webmercator';
      api.internal.testCommands(cmd, function(err, dataset) {
        var pair = api.internal.convertIntervalPair(['2km','5km'], api.internal.getDatasetCRS(dataset));
        assert.deepEqual(pair, [2000, 5000])
        done();
      });
    })

  })


})
