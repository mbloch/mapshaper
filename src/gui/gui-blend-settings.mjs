// The blend panel's controls (gui-raster-blend-tool.mjs) and the -blend
// command they add up to.
//
// The panel has a section for shadows and one for highlights, each with a
// strength and a chroma slider and a color. A slider's name is its key in
// the settings object; @option is the -blend option it sets, and @side which
// of the option's two values (shadows, highlights). @value is the slider's
// default, which is the option's.
//
// A section's @color is the key of its color in the settings object, and
// @colorOption the -blend option it sets. A color is a hex string, or null
// for the hillshade's own color, which the panel shows.
export var BLEND_SECTIONS = [
  {side: 0, title: 'Shadows', color: 'shadow_color', colorOption: 'shadow-color'},
  {side: 1, title: 'Highlights', color: 'highlight_color', colorOption: 'highlight-color'}
];

var BLEND_OPTIONS = ['strength', 'chroma'];

// What Apply makes of a polygon layer: an overlay, which recolors the
// hillshade to stack on the polygons and keeps them, or an image of the
// polygons blended with the hillshade, which replaces them (see -blend's
// overlay option)
export var BLEND_OUTPUTS = [
  {value: 'overlay', label: 'Overlay'},
  {value: 'image', label: 'Image'}
];

export var BLEND_SLIDERS = [
  {name: 'shadow_strength', label: 'Strength', option: 'strength', side: 0, min: 0, max: 1.5, value: 1},
  {name: 'shadow_chroma', label: 'Chroma', option: 'chroma', side: 0, min: 0, max: 1.5, value: 0.5},
  {name: 'highlight_strength', label: 'Strength', option: 'strength', side: 1, min: 0, max: 1.5, value: 1},
  {name: 'highlight_chroma', label: 'Chroma', option: 'chroma', side: 1, min: 0, max: 1.5, value: 0.5}
];

// Sliders for -blend's hidden options, for tuning (see
// docs/development/raster-blend.md), shown with the URL flag ?blend-testing.
// Each defaults to the option's default; @option is written when the slider
// is away from it.
export var BLEND_TEST_SLIDERS = [
  {name: 'depth_chroma', label: 'Depth', option: 'depth-chroma', min: 0, max: 0.5, value: 0.15},
  {name: 'depth_fade', label: 'Depth fade', option: 'depth-fade', min: 0, max: 0.8, value: 0.4},
  {name: 'evenness', label: 'Evenness', option: 'evenness', min: 0, max: 1, value: 0.8},
  {name: 'evenness_lightness', label: 'Even at L', option: 'evenness-lightness', min: 0.3, max: 0.9, value: 0.8}
];

export function getDefaultBlendSettings() {
  var settings = BLEND_SLIDERS.concat(BLEND_TEST_SLIDERS).reduce(function(memo, slider) {
    memo[slider.name] = slider.value;
    return memo;
  }, {});
  BLEND_SECTIONS.forEach(function(section) {
    settings[section.color] = null;
  });
  return settings;
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

// A color that is the hillshade's own is stored as null
// @ownColor the hillshade's color, as '#rrggbb'
export function getBlendColorSetting(hex, ownColor) {
  return !hex || hex.toLowerCase() == ownColor.toLowerCase() ? null : hex.toLowerCase();
}

// @sourceId the hillshade layer, as a target id
// @keepSource keep the hillshade layer, which -blend removes by default
// @output for a polygon layer, one of BLEND_OUTPUTS
// @clip leave out the shading outside the polygons
// Options left at their defaults are left out, and an option with the same
// value for shadows and highlights is written as one value
export function getBlendCommand(settings, sourceId, keepSource, output, clip) {
  var values = getBlendOptionValues(settings);
  var defaults = getBlendOptionValues(getDefaultBlendSettings());
  var parts = ['-blend', 'source=' + sourceId];
  if (output == 'overlay') parts.push('overlay');
  if (clip) parts.push('clip');
  BLEND_OPTIONS.forEach(function(option) {
    var pair = values[option];
    if (pair[0] == defaults[option][0] && pair[1] == defaults[option][1]) return;
    parts.push(option + '=' + (pair[0] == pair[1] ? pair[0] : pair.join(',')));
  });
  BLEND_SECTIONS.forEach(function(section) {
    if (settings[section.color]) parts.push(section.colorOption + '=' + settings[section.color]);
  });
  BLEND_TEST_SLIDERS.forEach(function(slider) {
    var val = settings[slider.name];
    if (val != null && val != slider.value) parts.push(slider.option + '=' + val);
  });
  if (keepSource) parts.push('keep-source');
  return parts.join(' ');
}

export function rgbToHex(c) {
  return '#' + [c.r, c.g, c.b].map(function(v) {
    return (v < 16 ? '0' : '') + v.toString(16);
  }).join('');
}

// Returns {r, g, b} for a '#rrggbb' string
export function hexToRgb(hex) {
  var n = parseInt(hex.slice(1), 16);
  return {r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255};
}
