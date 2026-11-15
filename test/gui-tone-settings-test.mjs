import assert from 'assert';
import api from '../mapshaper.js';
import {
  TONE_SLIDERS, getDefaultToneSettings, getToneCommand, sliderPosToToneValue,
  toneColorsAreDefault, toneSettingsAreDefault, toneValueToSliderPos
} from '../src/gui/gui-tone-settings.mjs';

var internal = api.internal;

function getSlider(name) {
  return TONE_SLIDERS.find(function(slider) { return slider.name == name; });
}

describe('gui-tone-settings.mjs', function () {
  it('the default settings make no command', function () {
    var settings = getDefaultToneSettings();
    assert(toneSettingsAreDefault(settings));
    assert.equal(getToneCommand(settings), '');
  })

  it('the command has the settings that are not 1', function () {
    var settings = getDefaultToneSettings();
    settings.lightness = 1.25;
    settings.gamma = 0.8;
    assert(!toneSettingsAreDefault(settings));
    assert.equal(getToneCommand(settings), '-tone lightness=1.25 gamma=0.8');
  })

  it('opacity is in the command, but leaves the colors alone', function () {
    var settings = getDefaultToneSettings();
    settings.opacity = 0.6;
    assert(!toneSettingsAreDefault(settings));
    assert(toneColorsAreDefault(settings));
    assert.equal(getToneCommand(settings), '-tone opacity=0.6');
    settings.saturation = 0.5;
    assert(!toneColorsAreDefault(settings));
  })

  it('hue is 0 by default, and is in the command as hue-shift=', function () {
    var settings = getDefaultToneSettings();
    assert.equal(settings.hue_shift, 0);
    settings.hue_shift = 0.4;
    assert(!toneColorsAreDefault(settings));
    assert.equal(getToneCommand(settings), '-tone hue-shift=0.4');
  })

  it('the command parses', function () {
    var settings = {lightness: 0.9, saturation: 1.2, contrast: 1.5, gamma: 1.1, hue_shift: -0.3, opacity: 0.75};
    var cmd = internal.parseCommands(getToneCommand(settings))[0];
    assert.equal(cmd.name, 'tone');
    assert.deepEqual(cmd.options, settings);
  })

  it('a log slider is 1 in the middle, and the ends are reciprocals', function () {
    var slider = getSlider('contrast');
    assert.equal(sliderPosToToneValue(slider, 0), 1);
    assert.equal(sliderPosToToneValue(slider, 1), 3);
    assert.equal(sliderPosToToneValue(slider, -1), 0.33);
    assert.equal(sliderPosToToneValue(slider, -0.5), 0.58);
    assert.equal(sliderPosToToneValue(slider, 0.5), 1.73);
  })

  it('slider positions and values round-trip', function () {
    TONE_SLIDERS.forEach(function(slider) {
      var vals = slider.name == 'opacity' ? [0, 0.35, 1] :
        slider.name == 'hue_shift' ? [-0.5, 0, 0.5] : [0.5, 1, 1.5];
      vals.forEach(function(val) {
        assert.equal(sliderPosToToneValue(slider, toneValueToSliderPos(slider, val)), val);
      });
    });
  })
})
