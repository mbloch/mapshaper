import { parseColor } from '../src/color/color-utils'
import assert from 'assert';

describe('color-utils.js', function () {
  describe('parseColor()', function () {
    it('#00ff00', function () {
      const col = parseColor('#00ff00');
      assert.deepEqual(col, {r: 0, g: 255, b: 0, a: 1 });
    })

    it ('black', function() {
      assert.deepEqual(parseColor('black'), {r: 0, g: 0, b: 0, a: 1});
    })

    it ('rgba(0, 34, 255,0.4)', function() {
      assert.deepEqual(parseColor('rgba(0, 34, 255,0.4)'), {r: 0, g: 34, b: 255, a: 0.4});
    })

    it ('rgb(0,2,90)', function() {
      assert.deepEqual(parseColor('rgb( 0,2,90)'), {r: 0, g: 2, b: 90, a: 1});
    })

  })
})

