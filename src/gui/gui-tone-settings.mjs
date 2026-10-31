// The tone panel's sliders (gui-raster-tone-tool.mjs) and the -tone command
// they add up to.
//
// contrast= and gamma= are multipliers that are undone by their reciprocals,
// so their sliders are logarithmic: the middle is 1, and a step either way
// is the same factor.
var LOG_RANGE = 3; // a log slider goes from 1/LOG_RANGE to LOG_RANGE

export var TONE_SLIDERS = [
  {name: 'lightness', label: 'Lightness', scale: 'linear', min: 0, max: 2},
  {name: 'saturation', label: 'Saturation', scale: 'linear', min: 0, max: 2},
  {name: 'contrast', label: 'Contrast', scale: 'log'},
  {name: 'gamma', label: 'Gamma', scale: 'log'}
];

export function getDefaultToneSettings() {
  return {lightness: 1, saturation: 1, contrast: 1, gamma: 1};
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
    return settings[slider.name] == 1;
  });
}

// Returns '' if the settings change nothing
export function getToneCommand(settings) {
  var opts = TONE_SLIDERS.filter(function(slider) {
    return settings[slider.name] != 1;
  }).map(function(slider) {
    return slider.name + '=' + settings[slider.name];
  });
  return opts.length > 0 ? '-tone ' + opts.join(' ') : '';
}
