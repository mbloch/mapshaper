// The tone panel's sliders (gui-raster-tone-tool.mjs) and the -tone command
// they add up to.
//
// contrast= and gamma= are multipliers that are undone by their reciprocals,
// so their sliders are logarithmic: the middle is 1, and a step either way
// is the same factor.
//
// A slider's name is its key in the settings object, which is the parsed
// name of its -tone option; @option is the option as typed, if different.
// @value is the default, which leaves the image alone (1 if missing).
var LOG_RANGE = 3; // a log slider goes from 1/LOG_RANGE to LOG_RANGE

export var TONE_SLIDERS = [
  {name: 'lightness', label: 'Lightness', scale: 'linear', min: 0, max: 2},
  {name: 'saturation', label: 'Saturation', scale: 'linear', min: 0, max: 2},
  {name: 'contrast', label: 'Contrast', scale: 'log'},
  {name: 'gamma', label: 'Gamma', scale: 'log'},
  {name: 'hue_shift', option: 'hue-shift', label: 'Hue', scale: 'linear', min: -1, max: 1, value: 0},
  {name: 'opacity', label: 'Opacity', scale: 'linear', min: 0, max: 1}
];

export function getDefaultToneValue(slider) {
  return 'value' in slider ? slider.value : 1;
}

export function getDefaultToneSettings() {
  return TONE_SLIDERS.reduce(function(memo, slider) {
    memo[slider.name] = getDefaultToneValue(slider);
    return memo;
  }, {});
}

function toneValueIsDefault(slider, settings) {
  return settings[slider.name] == getDefaultToneValue(slider);
}

// The range input's min and max, in slider units
export function getToneSliderRange(slider) {
  return slider.scale == 'log' ? [-1, 1] : [slider.min, slider.max];
}

export function sliderPosToToneValue(slider, pos) {
  var val = slider.scale == 'log' ? Math.pow(LOG_RANGE, pos) : pos;
  return roundToneValue(val);
}

export function toneValueToSliderPos(slider, val) {
  if (slider.scale == 'log') {
    return val > 0 ? Math.max(-1, Math.min(1, Math.log(val) / Math.log(LOG_RANGE))) : -1;
  }
  return Math.max(slider.min, Math.min(slider.max, val));
}

export function roundToneValue(val) {
  return Math.round(val * 100) / 100;
}

export function toneSettingsAreDefault(settings) {
  return TONE_SLIDERS.every(function(slider) {
    return toneValueIsDefault(slider, settings);
  });
}

// True if the settings leave the colors alone (opacity aside)
export function toneColorsAreDefault(settings) {
  return TONE_SLIDERS.every(function(slider) {
    return slider.name == 'opacity' || toneValueIsDefault(slider, settings);
  });
}

// Returns '' if the settings change nothing
export function getToneCommand(settings) {
  var opts = TONE_SLIDERS.filter(function(slider) {
    return !toneValueIsDefault(slider, settings);
  }).map(function(slider) {
    return (slider.option || slider.name) + '=' + settings[slider.name];
  });
  return opts.length > 0 ? '-tone ' + opts.join(' ') : '';
}
