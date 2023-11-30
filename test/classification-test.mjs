import {
  getDiscreteValueGetter
} from '../src/classification/mapshaper-classification';
import {
  getSequentialClassifier,
  getDiscreteClassifier,
  getContinuousClassifier,
  getQuantileBreaks,
  getClassRanges,
  getDistributionData,
  getAscendingNumbers

} from '../src/classification/mapshaper-sequential-classifier';
import {
  getInterpolatedValueGetter
} from '../src/classification/mapshaper-interpolation';
import assert from 'assert';
import api from '../mapshaper.js';


describe('mapshaper-classification.js', function () {

  describe('getClassRanges()', function () {
    it('test 1', function() {
      var data = [0,1,1,3,4];
      var breaks = [1, 4];
      var out = getClassRanges(breaks, data);
      assert.deepEqual(out, [[0,0], [1,3], [4,4]])
    })

    it('test 2', function() {
      var data = [0,1,1,3,4];
      var breaks = [-1, 7];
      var out = getClassRanges(breaks, data);
      assert.deepEqual(out, [[-1, -1], [0, 4], [7, 7]])
    })

    it('test 3', function() {
      var data = [1,1,2,2,3,3,4,4,5,5];
      var breaks = [2, 4];
      var out = getClassRanges(breaks, data);
      assert.deepEqual(out, [[1, 1], [2, 3], [4, 5]])
    });

    it('test 4', function() {
      var data = [1, 2, 3, 9, 10];
      var breaks = [5, 8];
      var out = getClassRanges(breaks, data);
      assert.deepEqual(out, [[1, 3], [5,8], [9, 10]])
    });
  })


  describe('getDistributionData()', function () {
    it('test 1', function () {
      var data = [0, 3, 4, 4, 9, 10];
      var breaks = [3, 5, 9];
      var out = getDistributionData(breaks, data);
      assert.deepEqual(out, [1, 3, 0, 2]);
    })
  })

  describe('getQuantileBreaks()', function () {
    it('creates equal-sized classes (when possible)', function () {
      var values = getAscendingNumbers((Array(125)).fill(null).map(Math.random));
      var breaks = getQuantileBreaks(values, 4);
      var dist = getDistributionData(breaks, values);
      assert.deepEqual(dist.concat(), [25,25,25,25,25]);
    })
  })

  describe('getContinuousClassifier()', function () {
    it('uses piecewise linear interpolation', function () {
      var classify = getContinuousClassifier([1, 2, 4], 0, 8);
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
      var classify = getContinuousClassifier([], 0, 8);
      var classToValue = getInterpolatedValueGetter([5,10], null);
      var f = function(val) { return classToValue(classify(val)) };
      assert.equal(f(0), 5);
      assert.equal(f(8), 10);
      assert.equal(f(4), 7.5);
    })
  })

  describe('getDiscreteClassifier()', function () {
    it('non-numeric data is classified as -1', function () {
      var f = getDiscreteClassifier([10]);
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
      var f = getDiscreteClassifier([0, 10]);
      assert.strictEqual(f(-1), 0);
      assert.strictEqual(f(0), 1);
      assert.strictEqual(f(5), 1);
      assert.strictEqual(f(10), 2);
      assert.strictEqual(f(15), 2);
    })
  })

})
