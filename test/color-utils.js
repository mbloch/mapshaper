import { parseColor } from '../src/color/color-utils'
import assert from 'assert';

describe('color-utils.js', function () {
  describe('parseColor()', function () {
    it('#00ff00', function () {
      const col = parseColor('#00ff00');
      assert.deepEqual(col, {r: 0, g: 255, b: 0, a: 1 });
    })
  })
})

