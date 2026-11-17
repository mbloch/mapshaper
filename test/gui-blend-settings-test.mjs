import assert from 'assert';
import {
  BLEND_SLIDERS, getBlendCommand, getBlendOptionValues, getDefaultBlendSettings
} from '../src/gui/gui-blend-settings.mjs';

describe('gui-blend-settings.mjs', function () {
  it('defaults are -blend\'s defaults', function () {
    assert.deepEqual(getBlendOptionValues(getDefaultBlendSettings()),
      {strength: [1, 1], chroma: [0, 1]});
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
})
