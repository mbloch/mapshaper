import assert from 'assert';
import {
  BLEND_SLIDERS, getBlendColorSetting, getBlendCommand, getBlendOptionValues,
  getDefaultBlendSettings, hexToRgb, rgbToHex
} from '../src/gui/gui-blend-settings.mjs';

describe('gui-blend-settings.mjs', function () {
  it('defaults are -blend\'s defaults', function () {
    var settings = getDefaultBlendSettings();
    assert.deepEqual(getBlendOptionValues(settings), {strength: [1, 1], chroma: [0, 1]});
    assert.equal(settings.shadow_color, null);
    assert.equal(settings.highlight_color, null);
    assert.equal(BLEND_SLIDERS.length, 4);
  })

  it('default settings name only the source', function () {
    assert.equal(getBlendCommand(getDefaultBlendSettings(), 'relief'), '-blend source=relief');
  })

  it('adds keep-source to keep the hillshade', function () {
    var settings = getDefaultBlendSettings();
    settings.shadow_chroma = 0.5;
    assert.equal(getBlendCommand(settings, 'relief', true),
      '-blend source=relief chroma=0.5,1 keep-source');
  })

  it('writes overlay for an overlay of a polygon layer, and nothing for an image', function () {
    var settings = getDefaultBlendSettings();
    settings.highlight_strength = 0.5;
    assert.equal(getBlendCommand(settings, 'relief', true, 'overlay'),
      '-blend source=relief overlay strength=1,0.5 keep-source');
    assert.equal(getBlendCommand(settings, 'relief', false, 'image'),
      '-blend source=relief strength=1,0.5');
  })

  it('writes clip to clip the shading to the polygons', function () {
    var settings = getDefaultBlendSettings();
    assert.equal(getBlendCommand(settings, 'relief', false, 'overlay', true),
      '-blend source=relief overlay clip');
    assert.equal(getBlendCommand(settings, 'relief', false, 'image', true),
      '-blend source=relief clip');
  })

  it('writes shadows,highlights, or one value if they are the same', function () {
    var settings = getDefaultBlendSettings();
    settings.shadow_strength = 0.8;
    assert.equal(getBlendCommand(settings, 'relief'), '-blend source=relief strength=0.8,1');
    settings.highlight_strength = 0.8;
    settings.shadow_chroma = 0.5;
    assert.equal(getBlendCommand(settings, 'relief'),
      '-blend source=relief strength=0.8 chroma=0.5,1');
    settings.highlight_chroma = 0.5;
    assert.equal(getBlendCommand(settings, '"my relief"'),
      '-blend source="my relief" strength=0.8 chroma=0.5');
  })

  it('writes colors that are not the hillshade\'s own', function () {
    var settings = getDefaultBlendSettings();
    settings.shadow_color = getBlendColorSetting('#2A2550', '#000000');
    settings.highlight_color = getBlendColorSetting('#FFFFFF', '#ffffff');
    assert.equal(settings.highlight_color, null);
    assert.equal(getBlendCommand(settings, 'relief'), '-blend source=relief shadow-color=#2a2550');
    assert.equal(getBlendColorSetting('', '#000000'), null);
  })

  it('converts colors to and from hex', function () {
    assert.equal(rgbToHex({r: 42, g: 5, b: 255}), '#2a05ff');
    assert.deepEqual(hexToRgb('#2a05ff'), {r: 42, g: 5, b: 255});
  })
})
