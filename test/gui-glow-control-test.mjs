import assert from 'assert';
import {
  getGlowState, getEffectsState, getGlowColorEdits, getEffectsOffEdits, getShownGlow
} from '../src/gui/gui-glow-control';

describe('gui-glow-control.mjs', function() {

  describe('getGlowState()', function() {
    it('a glow is on where its color is set', function() {
      var records = [{'outer-glow-color': 'red'}, {'outer-glow-color': ''}, {'outer-glow-width': 8}];
      assert.strictEqual(getGlowState(records, [0], 'outer'), 'on');
      assert.strictEqual(getGlowState(records, [1, 2], 'outer'), 'off');
      assert.strictEqual(getGlowState(records, [0, 1], 'outer'), 'mixed');
    });
  });

  describe('getEffectsState()', function() {
    it('is on for features with either glow', function() {
      var records = [{'outer-glow-color': 'red'}, {'inner-glow-color': 'white'}, {}];
      assert.strictEqual(getEffectsState(records, [0, 1]), 'on');
      assert.strictEqual(getEffectsState(records, [0, 1, 2]), 'mixed');
      assert.strictEqual(getEffectsState(records, [2]), 'off');
    });
  });

  describe('getGlowColorEdits()', function() {
    it('a color goes to every feature that lacks it', function() {
      var records = [{}, {'inner-glow-color': '#ff0000'}];
      assert.deepStrictEqual(getGlowColorEdits(records, [0, 1], 'inner', '#ff0000', {}), [
        {id: 0, styles: [['inner-glow-color', '#ff0000']]}
      ]);
    });

    it('a pending width and opacity go with it, where a feature has none', function() {
      var records = [{}, {'outer-glow-width': 3}];
      var pending = {width: 12, opacity: 0.4};
      assert.deepStrictEqual(getGlowColorEdits(records, [0, 1], 'outer', 'black', pending), [
        {id: 0, styles: [['outer-glow-color', 'black'], ['outer-glow-width', 12], ['outer-glow-opacity', 0.4]]},
        {id: 1, styles: [['outer-glow-color', 'black'], ['outer-glow-opacity', 0.4]]}
      ]);
    });

    it('full opacity is not stored', function() {
      assert.deepStrictEqual(getGlowColorEdits([{}], [0], 'outer', 'black', {opacity: 1}), [
        {id: 0, styles: [['outer-glow-color', 'black']]}
      ]);
    });

    it('an empty color removes the color', function() {
      var records = [{'outer-glow-color': 'red', 'outer-glow-width': 4}, {}];
      assert.deepStrictEqual(getGlowColorEdits(records, [0, 1], 'outer', '', {}), [
        {id: 0, styles: [['outer-glow-color', '']]}
      ]);
    });
  });

  describe('getEffectsOffEdits()', function() {
    it('removes every glow setting', function() {
      var records = [{'outer-glow-color': 'red', 'inner-glow-width': 6, fill: 'blue'}, {}];
      assert.deepStrictEqual(getEffectsOffEdits(records, [0, 1]), [
        {id: 0, styles: [['outer-glow-color', ''], ['inner-glow-width', '']]}
      ]);
    });
  });

  describe('getShownGlow()', function() {
    it('shows what the features share, with the default width and opacity', function() {
      var records = [{'inner-glow-color': '#ffffff'}, {'inner-glow-color': '#ffffff', 'inner-glow-width': '10', 'inner-glow-opacity': 1}];
      assert.deepStrictEqual(getShownGlow(records, [0, 1], 'inner', {}),
        {color: '#ffffff', mixed: false, width: 10, opacity: 1});
    });

    it('a color some features lack, or that differs, is mixed', function() {
      var records = [{'outer-glow-color': 'red', 'outer-glow-width': 6}, {'outer-glow-color': 'red', 'outer-glow-width': 8}, {}];
      assert.deepStrictEqual(getShownGlow(records, [0, 1, 2], 'outer', {}),
        {color: '', mixed: true, width: '', opacity: 1});
      records[1]['outer-glow-color'] = 'blue';
      assert.deepStrictEqual(getShownGlow(records, [0, 1], 'outer', {}),
        {color: '', mixed: true, width: '', opacity: 1});
    });

    it('with no glow, the color and opacity are blank and the width is the default', function() {
      assert.deepStrictEqual(getShownGlow([{}], [0], 'outer', {}),
        {color: '', mixed: false, width: 10, opacity: ''});
      assert.deepStrictEqual(getShownGlow([{}], [0], 'outer', {width: 4, opacity: 0.5}),
        {color: '', mixed: false, width: 4, opacity: 0.5});
    });
  });
});
