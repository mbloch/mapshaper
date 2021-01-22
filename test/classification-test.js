import {
  getSequentialClassifier,
  interpolateValuesToClasses
} from '../src/classification/mapshaper-classification';
var api = require('../'),
  assert = require('assert');

describe('mapshaper-classification.js', function () {
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
    it('non-numeric data should not be coerced to numbers', function () {
      var f = getSequentialClassifier([10], ['red', 'blue'], null);
      assert.strictEqual(f(0), 'red');
      assert.strictEqual(f(null), null);
      assert.strictEqual(f(), null);
      assert.strictEqual(f(NaN), null);
      assert.strictEqual(f([0]), null);
      assert.strictEqual(f("0"), null);
      assert.strictEqual(f(""), null);
      assert.strictEqual(f([]), null);
      assert.strictEqual(f({}), null);
    })

    it('all color classes are reachable', function () {
      var f = getSequentialClassifier([0, 10], ['red', 'white', 'blue']);
      assert.strictEqual(f(-1), 'red');
      assert.strictEqual(f(0), 'white');
      assert.strictEqual(f(5), 'white');
      assert.strictEqual(f(10), 'blue');
      assert.strictEqual(f(15), 'blue');
    })
  })


})
