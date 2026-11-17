// The blend panel's sliders (gui-raster-blend-tool.mjs) and the -blend
// command they add up to.
//
// A slider's name is its key in the settings object; @option is the -blend
// option it sets (the panel has a section for each), and @side which of the
// option's two values (shadows, highlights). @value is the slider's default,
// which is the option's.
export var BLEND_SECTIONS = [
  {option: 'strength', title: 'Strength'},
  {option: 'chroma', title: 'Chroma'}
];

export var BLEND_SLIDERS = [
  {name: 'shadow_strength', label: 'Shadows', option: 'strength', side: 0, min: 0, max: 2, value: 1},
  {name: 'highlight_strength', label: 'Highlights', option: 'strength', side: 1, min: 0, max: 2, value: 1},
  {name: 'shadow_chroma', label: 'Shadows', option: 'chroma', side: 0, min: 0, max: 2, value: 0},
  {name: 'highlight_chroma', label: 'Highlights', option: 'chroma', side: 1, min: 0, max: 2, value: 1}
];

export function getDefaultBlendSettings() {
  return BLEND_SLIDERS.reduce(function(memo, slider) {
    memo[slider.name] = slider.value;
    return memo;
  }, {});
}

export function roundBlendValue(val) {
  return Math.round(val * 100) / 100;
}

// Returns {strength: [shadows, highlights], chroma: [shadows, highlights]}
export function getBlendOptionValues(settings) {
  return BLEND_SLIDERS.reduce(function(memo, slider) {
    memo[slider.option] = memo[slider.option] || [];
    memo[slider.option][slider.side] = settings[slider.name];
    return memo;
  }, {});
}

// @sourceId the hillshade layer, as a target id
// @keepSource keep the hillshade layer, which -blend removes by default
// Options left at their defaults are left out, and an option with the same
// value for shadows and highlights is written as one value
export function getBlendCommand(settings, sourceId, keepSource) {
  var values = getBlendOptionValues(settings);
  var defaults = getBlendOptionValues(getDefaultBlendSettings());
  var parts = ['-blend', 'source=' + sourceId];
  BLEND_SECTIONS.forEach(function(section) {
    var option = section.option;
    var pair = values[option];
    if (pair[0] == defaults[option][0] && pair[1] == defaults[option][1]) return;
    parts.push(option + '=' + (pair[0] == pair[1] ? pair[0] : pair.join(',')));
  });
  if (keepSource) parts.push('keep-source');
  return parts.join(' ');
}
