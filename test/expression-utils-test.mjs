import {interpolated_median, distance_xy} from '../src/expressions/mapshaper-expression-utils';
import assert from 'assert';
import api from '../mapshaper.js';

describe('mapshaper-expression-utils.js', function() {

  describe('round()', function() {

    it ('test 1', function(done) {
      var data = [{a: 100.1}, {a: 0.5}, {a: -2.001}, {a: null}];
      var target = [{a: 100.1, b: 100, c: 100.1}, {a: 0.5, b: 1, c: 0.5}, {a: -2.001, b: -2, c: -2}, {a: null, b: null, c: null}];
      api.applyCommands('-i a.json -each "b=round(a), c=_.round(a, 1)" -o', {'a.json': data}, function(err, output) {
        assert.deepStrictEqual(JSON.parse(output['a.json']), target);
        done();
      });
    });
  });

  describe('int_median()', function() {
    var data = [{
      counts: [3,3]
    }, {
      counts: [0,0]
    }];

    it ('test 1', function(done) {
      api.applyCommands('-i data.json -each "med=int_median(counts, [0,10,20])" -o', {'data.json': data}, function(err, output) {
        var data = JSON.parse(output['data.json']);
        assert.equal(data[0].med, 10);
        assert.strictEqual(data[1].med, null);
        done();
      });
    });

    it('test 2', function() {
      var counts = [2, 2, 2];
      var values = [10,20,30,40];
      var median = interpolated_median(counts, values);
      assert.equal(median, 25);
    })
  })

  describe('sprintf()', function() {

    it ('test 1', function(done) {
      var data = 'a,b\n3000,3.001'
      var target = 'a,b,c\n3000,3.001,"3,000 3.0"';
      api.applyCommands('-i data.csv -each "c = sprintf(\'%,d %.1f\', a, b)" -o', {'data.csv': data}, function(err, output) {
        assert.equal(output['data.csv'], target);
        done();
      });
    });
  });

  describe('distance_xy()', function() {
    it('returns Euclidean distance', function() {
      assert.equal(distance_xy(0, 0, 3, 4), 5);
      assert.equal(distance_xy(-1, -1, -1, -1), 0);
    });

    it('returns null for missing or non-numeric coordinates', function() {
      assert.strictEqual(distance_xy(0, 0, null, 4), null);
      assert.strictEqual(distance_xy(0, undefined, 3, 4), null);
      assert.strictEqual(distance_xy(0, 0, '3', 4), null);
      assert.strictEqual(distance_xy(0, 0, NaN, 4), null);
    });

    it('works in -each, including via the _ alias', async function() {
      var data = 'x,y,x2,y2\n0,0,3,4\n1,1,,1';
      var output = await api.applyCommands('-i data.csv -each "d = distance_xy(x, y, x2, y2), d2 = _.distance_xy(x, y, x2, y2)" -o', {'data.csv': data});
      assert.equal(String(output['data.csv']), 'x,y,x2,y2,d,d2\n0,0,3,4,5,5\n1,1,,1,,');
    });
  });

  describe('distance_lonlat()', function() {
    // geographiclib is loaded via require(), so these tests run through the bundle
    async function lonlatDistances(records) {
      var output = await api.applyCommands('-i data.json -each "d = distance_lonlat(lon, lat, lon2, lat2)" -o',
          {'data.json': records});
      return JSON.parse(output['data.json']).map(rec => rec.d);
    }

    it('one degree of longitude at the equator is 2 * PI * semimajor axis / 360', async function() {
      var d = await lonlatDistances([{lon: 0, lat: 0, lon2: 1, lat2: 0}]);
      assert.equal(d[0].toFixed(3), '111319.491');
    });

    it('one degree of latitude at the equator is shorter, reflecting the ellipsoid', async function() {
      var d = await lonlatDistances([{lon: 0, lat: 0, lon2: 0, lat2: 1}]);
      assert.equal(d[0].toFixed(3), '110574.389');
    });

    it('JFK to LAX is about 3983 km', async function() {
      var d = await lonlatDistances([{lon: -73.7781, lat: 40.6413, lon2: -118.4085, lat2: 33.9416}]);
      assert(Math.abs(d[0] - 3983e3) < 2e3, String(d[0]));
    });

    it('returns 0 for identical points', async function() {
      var d = await lonlatDistances([{lon: -150, lat: 61, lon2: -150, lat2: 61}]);
      assert.strictEqual(d[0], 0);
    });

    it('returns null for missing coordinates or out-of-range latitudes', async function() {
      var d = await lonlatDistances([
        {lon: 0, lat: 0, lon2: null, lat2: 0},
        {lon: 61, lat: -150, lon2: 62, lat2: -150},
        {lon: 0, lat: 91, lon2: 0, lat2: 0}
      ]);
      assert.deepStrictEqual(d, [null, null, null]);
    });

    it('can be called via the _ alias', async function() {
      var output = await api.applyCommands('-i data.csv -each "km = round(_.distance_lonlat(lon, lat, lon2, lat2) / 1000, 3)" -o',
          {'data.csv': 'lon,lat,lon2,lat2\n0,0,1,0'});
      assert.equal(String(output['data.csv']), 'lon,lat,lon2,lat2,km\n0,0,1,0,111.319');
    });
  });

});
