import assert from 'assert';
import { hexToPickerHsb, toSixDigitHex } from '../src/gui/gui-color-picker';

describe('gui-color-picker', function() {
  describe('toSixDigitHex()', function() {
    it('expands short hex', function() {
      assert.equal(toSixDigitHex('#334'), '#333344');
      assert.equal(toSixDigitHex('#AbC'), '#AAbbCC');
    });

    it('leaves six-digit hex alone', function() {
      assert.equal(toSixDigitHex('#ef6f6f'), '#ef6f6f');
    });

    it('returns null for anything else', function() {
      assert.equal(toSixDigitHex('red'), null);
      assert.equal(toSixDigitHex('#3344'), null);
      assert.equal(toSixDigitHex(''), null);
      assert.equal(toSixDigitHex(undefined), null);
    });
  });

  describe('hexToPickerHsb()', function() {
    var prev = {h: 170, s: 90, b: 200};

    it('keeps the previous hue for a gray', function() {
      assert.deepEqual(hexToPickerHsb('#727272', prev), {h: 170, s: 0, b: 0x72});
      assert.deepEqual(hexToPickerHsb('#ffffff', prev), {h: 170, s: 0, b: 255});
    });

    it('keeps the previous hue and saturation for black', function() {
      assert.deepEqual(hexToPickerHsb('#000000', prev), {h: 170, s: 90, b: 0});
    });

    it('uses the color\'s own hue when it has one', function() {
      assert.deepEqual(hexToPickerHsb('#ff0000', prev), {h: 0, s: 255, b: 255});
    });

    it('reads a gray as hue 0 without a previous color', function() {
      assert.deepEqual(hexToPickerHsb('#727272'), {h: 0, s: 0, b: 0x72});
    });
  });
});
