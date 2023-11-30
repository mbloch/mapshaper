import {
  interpolateValuesToClasses,
  getStoppedValues,
  getInterpolatedValueGetter
} from '../src/classification/mapshaper-interpolation';
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

})