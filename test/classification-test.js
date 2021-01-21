import { getSequentialClassifier } from '../src/classification/mapshaper-classification';
var api = require('../'),
  assert = require('assert');

describe('mapshaper-colorizer.js', function () {

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
