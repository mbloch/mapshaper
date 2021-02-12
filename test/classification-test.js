import {
  getSequentialClassifier,
  interpolateValuesToClasses,
  getInterpolatedValueGetter,
  getDiscreteValueGetter,
  getContinuousClassifier,
  getQuantileBreaks,
  getDistributionData
} from '../src/classification/mapshaper-classification';
var api = require('../'),
  assert = require('assert');

describe('mapshaper-classification.js', function () {

  describe('getInterpolatedValueGetter()', function () {

  })

  describe('getQuantileBreaks()', function () {
    it('creates equal-sized classes (when possible)', function () {
      var values = (Array(125)).fill(null).map(Math.random);
      var breaks = getQuantileBreaks(values, 4);
      var dist = getDistributionData(breaks, values);
      assert.deepEqual(dist.concat(), [25,25,25,25,25]);
      assert.strictEqual(dist.nulls, 0);
    })
  })

  describe('getContinuousClassifier()', function () {
    it('uses piecewise linear interpolation', function () {
      var classify = getContinuousClassifier([1, 2, 4], [0, 8]);
      var classToValue = getInterpolatedValueGetter([5, 6, 7, 8, 9], null);
      var f = function(val) { return classToValue(classify(val)) };
      assert.equal(f(1), 6);
      assert.equal(f(0), 5);
      assert.equal(f(8), 9);
      assert.strictEqual(f(9), null);
      assert.strictEqual(f(undefined), null);
      assert.equal(f(3), 7.5)
      assert.equal(f(6), 8.5)
      assert.equal(f(0.5), 5.5)
      assert.equal(f(8), 9)
    })

    it('handles a single class', function() {
      var classify = getContinuousClassifier([], [0, 8]);
      var classToValue = getInterpolatedValueGetter([5,10], null);
      var f = function(val) { return classToValue(classify(val)) };
      assert.equal(f(0), 5);
      assert.equal(f(8), 10);
      assert.equal(f(4), 7.5);
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

  describe('getSequentialClassifier()', function () {
    it('non-numeric data is classified as -1', function () {
      var f = getSequentialClassifier([10]);
      assert.strictEqual(f(0), 0);
      assert.strictEqual(f(null), -1);
      assert.strictEqual(f(), -1);
      assert.strictEqual(f(NaN), -1);
      assert.strictEqual(f([0]), -1);
      assert.strictEqual(f("0"), -1);
      assert.strictEqual(f(""), -1);
      assert.strictEqual(f([]), -1);
      assert.strictEqual(f({}), -1);
    })

    it('all classes are reachable', function () {
      var f = getSequentialClassifier([0, 10]);
      assert.strictEqual(f(-1), 0);
      assert.strictEqual(f(0), 1);
      assert.strictEqual(f(5), 1);
      assert.strictEqual(f(10), 2);
      assert.strictEqual(f(15), 2);
    })
  })

})
