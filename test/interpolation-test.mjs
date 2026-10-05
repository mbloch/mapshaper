import {
  interpolateValuesToClasses,
  getStoppedValues,
  getInterpolatedValueGetter
} from '../src/classification/mapshaper-interpolation';
import { interpolateOklch } from '../src/color/oklab';
import { parseColor } from '../src/color/color-utils';
import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-interpolation.js', function () {

  describe('getStoppedValues()', function () {
    it('test1', function () {
      var stops = [0, 100];
      var values = [10, 20, 30];
      var values2 = getStoppedValues(values, stops);
      assert.deepEqual(values2, [10, 20, 30]);
    })

    it('test2', function() {
      var stops = [50, 75];
      var values = [0, 100, 200];
      var values2 = getStoppedValues(values, stops);
      assert.deepEqual(values2, [100, 125, 150]);
    })
  })

  describe('interpolateValuesToClasses', function () {
    it('no interpolation if none needed', function () {
      var out = interpolateValuesToClasses([0, 1, 2], 3);
      assert.deepEqual(out, [0, 1, 2])
    })

    it('fewer values than classes', function () {
      var out = interpolateValuesToClasses([0, 2], 3);
      assert.deepEqual(out, [0, 1, 2])
      out = interpolateValuesToClasses([0, 2, 4], 5);
      assert.deepEqual(out, [0, 1, 2, 3, 4]);
    })

    it('more values than classes', function () {
      var out = interpolateValuesToClasses([1, 2, 3, 4, 5], 3);
      assert.deepEqual(out, [1, 3, 5]);
    })

    it('interpolate colors', function() {
      var out = interpolateValuesToClasses(['#000', '#222'], 3);
      // not sure what the output should be... d3 returns 'rgb()' format
      assert(out[1].includes('rgb('));
    })

  })

  describe('getInterpolatedValueGetter()', function () {
    it('cached oklch colors are close to the uncached ones; numbers are not cached', function () {
      var get = getInterpolatedValueGetter(['#fff8da', '#2d4d8e'], null, {interpolation: 'oklch'});
      var exact = interpolateOklch('#fff8da', '#2d4d8e');
      for (var t = 0.01; t < 0.99; t += 0.0173) {
        var a = parseColor(get(t)), b = parseColor(exact(t));
        assert(Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b)) <= 2, String(t));
      }
      assert.equal(get(1), '#2d4d8e');
      get = getInterpolatedValueGetter([0, 1000], null, {interpolation: 'oklch'});
      assert.equal(get(0.12345), 123.45);
    })
  })

})