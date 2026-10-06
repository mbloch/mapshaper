import assert from 'assert';
import { hexToPickerHsb } from '../src/gui/gui-color-picker';

describe('gui-color-picker', function() {
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
