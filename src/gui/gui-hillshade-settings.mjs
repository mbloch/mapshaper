// The hillshade panel's controls (gui-hillshade-tool.mjs) and the -hillshade
// command they add up to.
//
// A setting's default is the command's, so a setting left at its default is
// left out of the command. The panel has some settings of its own, which map
// onto options:
// - exaggeration is a factor of the automatic exaggeration, as a power of 2,
//   so that the slider is centered on it whatever the map scale (0 is the
//   automatic exaggeration, and leaves exaggeration= out)
// - azimuth runs from 135 to 495 degrees, so that the default, 315, is in the
//   middle of the slider, and directions that make terrain look inverted
//   (light from the south) are at its ends
// - an opaque hillshade's shadow and highlight colors have the base color's
//   hue, and are set by strengths (see getHillshadeShadowColor() and
//   getHillshadeHighlightColor() in mapshaper-raster-color.mjs)

export var HILLSHADE_STYLES = [
  {value: 'shadow', label: 'Transparent'},
  {value: 'opaque', label: 'Opaque'}
];

export var HILLSHADE_LIGHTINGS = [
  {value: 'hard', label: 'Hard'},
  {value: 'balanced', label: 'Balanced'},
  {value: 'soft', label: 'Soft'}
];

export var HILLSHADE_SMOOTHING_LEVELS = [
  {value: 0, label: 'Off'},
  {value: 1, label: '1'},
  {value: 2, label: '2'},
  {value: 3, label: '3'},
  {value: 4, label: '4'}
];

// @section the panel section the slider is in
// @style the style the slider is shown for, if only one
// @fields the slider changes the fields of shading, which take longer to
//   compute than the settings that combine them (see computeShadingFields())
// @snap distance from the default within which the slider settles on it
export var HILLSHADE_SLIDERS = [
  {name: 'max_opacity', label: 'Shadows', section: 'shading', style: 'shadow', min: 0, max: 1, step: 0.01, value: 0.55},
  {name: 'highlights', label: 'Highlights', section: 'shading', style: 'shadow', min: 0, max: 2, step: 0.01, value: 1},
  {name: 'shadow_strength', label: 'Shadows', section: 'shading', style: 'opaque', min: 0, max: 2, step: 0.01, value: 1},
  {name: 'highlight_strength', label: 'Highlights', section: 'shading', style: 'opaque', min: 0, max: 1, step: 0.01, value: 1},
  {name: 'azimuth', label: 'Azimuth', section: 'light', min: 135, max: 495, step: 1, value: 315, snap: 3, fields: true},
  {name: 'altitude', label: 'Altitude', section: 'light', min: 10, max: 80, step: 1, value: 45, snap: 1, fields: true},
  {name: 'exaggeration', label: 'Exaggeration', section: 'terrain', min: -2, max: 2, step: 0.05, value: 0, snap: 0.05, fields: true},
  {name: 'ambient', label: 'Ambient', section: 'effects', min: 0, max: 1, step: 0.01, value: 0.5},
  {name: 'texture', label: 'Texture', section: 'effects', min: 0, max: 1, step: 0.01, value: 0},
  {name: 'aerial', label: 'Aerial', section: 'effects', min: 0, max: 1, step: 0.01, value: 0},
  {name: 'gamma', label: 'Gamma', section: 'effects', min: 0.3, max: 1.5, step: 0.01, value: 0.7}
];

export var DEFAULT_HILLSHADE_COLORS = {
  shadow_color: '#000000',
  highlight_color: '#ffffff',
  base_color: '#d7d7d7'
};

// The colors shown for each style, as keys of the settings
export var HILLSHADE_COLOR_ROWS = [
  {name: 'shadow_color', label: 'Shadow', style: 'shadow'},
  {name: 'highlight_color', label: 'Highlight', style: 'shadow'},
  {name: 'base_color', label: 'Base', style: 'opaque'}
];

var COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function getDefaultHillshadeSettings() {
  var settings = {style: 'shadow', lighting: 'balanced', smoothing: 0};
  HILLSHADE_SLIDERS.forEach(function(slider) {
    settings[slider.name] = slider.value;
  });
  return Object.assign(settings, DEFAULT_HILLSHADE_COLORS);
}

export function getHillshadeSlider(name) {
  return HILLSHADE_SLIDERS.find(function(slider) { return slider.name == name; }) || null;
}

// A value from a slider, rounded to its step and settled on the default if
// it is close
export function getHillshadeSliderValue(slider, val) {
  var v = Math.round(val / slider.step) * slider.step;
  if (slider.snap && Math.abs(v - slider.value) < slider.snap) v = slider.value;
  return +v.toFixed(2);
}

// e.g. "315° NW"
export function formatAzimuth(val) {
  var deg = getCompassDegrees(val);
  return deg + '° ' + COMPASS_POINTS[Math.round(deg / 45) % 8];
}

// @autoExaggeration the automatic exaggeration of the raster being shaded
export function formatHillshadeSliderValue(slider, val, autoExaggeration) {
  if (slider.name == 'azimuth') return formatAzimuth(val);
  if (slider.name == 'altitude') return val + '°';
  if (slider.name == 'exaggeration') return formatExaggeration(getExaggeration(val, autoExaggeration));
  return val.toFixed(2);
}

// The two significant digits of getExaggeration(), with a decimal below 10
// (1.0, 0.25, 2.8, 12)
function formatExaggeration(val) {
  return val < 10 ? val.toPrecision(2) : String(val);
}

export function getExaggeration(factor, autoExaggeration) {
  return +(autoExaggeration * Math.pow(2, factor)).toPrecision(2);
}

// The -hillshade options of the settings, as the command's parser gives them
// (a key with an underscore for each option), leaving out those at their
// defaults
// @autoExaggeration see formatHillshadeSliderValue()
// @colorFns {shadow(baseHex, strength), highlight(baseHex, strength)},
//   returning the colors of an opaque hillshade as '#rrggbb'
export function getHillshadeOptions(settings, autoExaggeration, colorFns) {
  var defaults = getDefaultHillshadeSettings();
  var opts = {};
  var azimuth = getCompassDegrees(settings.azimuth);
  if (settings.style == 'opaque') {
    if (settings.base_color == defaults.base_color && settings.shadow_strength == 1 &&
        settings.highlight_strength == 1) {
      opts.opaque = true;
    } else {
      // base-color= implies opaque; a shadow or highlight color without it
      // would put the base between them
      opts.base_color = settings.base_color;
      if (settings.shadow_strength != 1) {
        opts.shadow_color = colorFns.shadow(settings.base_color, settings.shadow_strength);
      }
      if (settings.highlight_strength != 1) {
        opts.highlight_color = colorFns.highlight(settings.base_color, settings.highlight_strength);
      }
    }
  } else {
    ['max_opacity', 'highlights', 'shadow_color', 'highlight_color'].forEach(function(key) {
      if (settings[key] != defaults[key]) opts[key] = settings[key];
    });
  }
  if (azimuth != getCompassDegrees(defaults.azimuth)) opts.azimuth = azimuth;
  ['altitude', 'lighting'].forEach(function(key) {
    if (settings[key] != defaults[key]) opts[key] = settings[key];
  });
  if (settings.exaggeration != defaults.exaggeration) {
    opts.exaggeration = getExaggeration(settings.exaggeration, autoExaggeration);
  }
  ['smoothing', 'ambient', 'texture', 'aerial', 'gamma'].forEach(function(key) {
    if (settings[key] != defaults[key]) opts[key] = settings[key];
  });
  return opts;
}

// @keepElevation keep the elevation layer (+), which -hillshade replaces by
//   default
export function getHillshadeCommand(settings, autoExaggeration, colorFns, keepElevation) {
  var opts = getHillshadeOptions(settings, autoExaggeration, colorFns);
  var parts = ['-hillshade'];
  Object.keys(opts).forEach(function(key) {
    var name = key.replace(/_/g, '-');
    parts.push(opts[key] === true ? name : name + '=' + opts[key]);
  });
  if (keepElevation) parts.push('+');
  return parts.join(' ');
}

function getCompassDegrees(val) {
  return ((Math.round(val) % 360) + 360) % 360;
}
