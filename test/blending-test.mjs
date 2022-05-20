import { blend } from '../src/color/blending'
import assert from 'assert';

describe('blending.js', function () {
  describe('blend()', function () {
    it('test1', function () {
      const col = blend('#ff0000', 1, '#00ff00', 1);
      assert.equal(col, '#808000');
    })
  })
})
