
import { fromScaledStr, toScaledStr, findBigIntScaleFactor
} from '../src/geom/mapshaper-bigint-utils';
import assert from 'assert';

describe('mapshaper-bigint-utils', function () {

  describe('toScaledStr()', function () {

    it('simple tests', function () {
      assert.equal(toScaledStr(0.00123, 4), '12');
      assert.equal(toScaledStr(0.000000000123, 12), '123');
      assert.equal(toScaledStr(0.0123, 4), '123');
      assert.equal(toScaledStr(0.123, 4), '1230');
      assert.equal(toScaledStr(0.123, 16), '1230000000000000');
      assert.equal(toScaledStr(1.23, 4), '12300');
      assert.equal(toScaledStr(123000, 4), '1230000000');
    })


    it('negative tests', function () {
      assert.equal(toScaledStr(-0.00123, 4), '-12');
      assert.equal(toScaledStr(-0.000000000123, 12), '-123');
      assert.equal(toScaledStr(-0.0123, 4), '-123');
      assert.equal(toScaledStr(-0.123, 4), '-1230');
      assert.equal(toScaledStr(-0.123, 16), '-1230000000000000');
      assert.equal(toScaledStr(-1.23, 4), '-12300');
      assert.equal(toScaledStr(-123000, 4), '-1230000000');
    })

  })

  describe('fromScaledStr()', function () {
    it ('tests', function() {
      assert.equal(fromScaledStr('1234567890', 2), 12345678.9);
      assert.equal(fromScaledStr('-1234567890', 2), -12345678.9);
      assert.equal(fromScaledStr('1234567890', 10), 0.123456789);
      assert.equal(fromScaledStr('-1234567890', 10), -0.123456789);
      assert.equal(fromScaledStr('1234567890', 11), 0.0123456789);
      assert.equal(fromScaledStr('-1234567890', 11), -0.0123456789);
      assert.equal(fromScaledStr('1234567890', 15), 0.00000123456789);
      assert.equal(fromScaledStr('-1234567890', 15), -0.00000123456789);
    })
  });

  describe('round trip tests', function() {
    function test(num, decimals) {
      var s = toScaledStr(num, decimals);
      var num2 = fromScaledStr(s, decimals);
      assert.equal(num2, num);
    }

    it ('tests', function() {
      test(-118.79818199909548, 16);
      test(35.193436012849126, 16);
      test(-118.79818199909548, 17);
      test(35.193436012849126, 17);
      test(-118.79818199909548, 14);
      test(35.193436012849126, 15);
      test(-10574171.24727916,8);
      test(3767932.7402447183, 12);
    })
  })

  describe('findBigIntScaleFactor()', function() {
    it('tests', function() {
      assert.equal(findBigIntScaleFactor(12.234), 15);
      assert.equal(findBigIntScaleFactor(-12.234), 15);
      assert.equal(findBigIntScaleFactor(0.234), 17);
      assert.equal(findBigIntScaleFactor(0.0234), 18);
      assert.equal(findBigIntScaleFactor(-0.02345555555555555555555555), 18);
      assert.equal(findBigIntScaleFactor(12.234, 10, 4), 16);
      assert.equal(findBigIntScaleFactor(0, 5.2), 17);
      assert.equal(findBigIntScaleFactor(0.000045, 5.2), 21);
      assert.equal(findBigIntScaleFactor(12000, 5000, -118), 14);
    })
  });

})
