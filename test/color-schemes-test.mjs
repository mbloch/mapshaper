import { wrapColors } from '../src/color/color-schemes';
import assert from 'assert';

describe('color-schemes.js', function () {
  describe('wrapColors()', function () {
    it('test 1', function () {
      var colors = ['black', 'white'];
      var output = wrapColors(colors, 3);
      assert.deepEqual(output, ['black', 'white', 'black']);
    })

    it('test 2', function () {
      var colors = ['black', 'white'];
      var output = wrapColors(colors, 4);
      assert.deepEqual(output, ['black', 'white', 'black', 'white']);
    })

    it('test 3', function () {
      var colors = ['black', 'white'];
      var output = wrapColors(colors, 5);
      assert.deepEqual(output, ['black', 'white', 'black', 'white', 'black']);
    })
  })
})

