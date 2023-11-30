import { mightBeExpression } from '../src/svg/svg-properties';
import api from '../mapshaper.js';
import assert from 'assert';


describe('svg-properties.js', function () {
  describe('mightBeExpression()', function () {
    it('lists of numbers are not expressions', function() {
      assert(!mightBeExpression('1,2,3'));
    });

    it('division', function() {
      var str = 'foo / 3';
      assert(mightBeExpression('foo / 3'));
    });

  })
})
