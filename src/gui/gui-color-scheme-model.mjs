import { internal } from './gui-core';
import { quoteCommandValue } from './gui-command-utils';

// The state behind the color scheme panel, as plain objects and functions
// that return new ones. See docs/development/color-scheme-panel-design.md
//
// A scheme is either a preset (a named d3 ramp, possibly reversed) or a
// custom ramp defined by pins ([{t, color}], see src/color/color-ramps.mjs).
// Editing a tile of a preset turns it into a custom ramp, pinned at the
// preset's two ends and at the edited tile.
//
// scheme: {
//   type: 'sequential',
//   field, method, n,
//   preset: name or null, reversed: boolean,  (presets)
//   pins: [{t, color}] or null,               (custom ramps)
//   vibrance, longHue                         (custom ramps, see
//                                             getOklchInterpolator())
//   colors: [...]   the colors that were applied, for checking a layer later
// }

export var classifyMethods = [
  {name: 'quantile', label: 'Quantile'},
  {name: 'equal-interval', label: 'Equal interval'},
  {name: 'nice', label: 'Nice breaks'},
  {name: 'hybrid', label: 'Hybrid'}
];

export var minSchemeColors = 2;
export var maxSchemeColors = 12;
// vibrance is OKLCH chroma added to the colors of each interpolated segment
export var defaultVibrance = 0;
export var maxVibrance = 0.09;
var defaultEnds = ['#344a72', '#f0d26b'];
// Cyclic ramps start and end on the same hue, which reads as a category
// rather than an order.
var excludedPresets = ['Rainbow', 'Sinebow'];

// Layers keep the scheme that colored them, so that the panel can reopen it
// and the style panel can show it. Undo and redo of a scheme edit put back
// the scheme that went with the colors (see the panel's command session).
var layerSchemes = new WeakMap();

export function getSequentialPresetNames() {
  return internal.getColorSchemeNames('sequential')
    .concat(internal.getColorSchemeNames('rainbow'))
    .filter(function(name) {
      return !excludedPresets.includes(name);
    });
}

export function getDefaultScheme(field) {
  return {
    type: 'sequential',
    field: field || null,
    method: 'quantile',
    n: 5,
    preset: null,
    reversed: false,
    pins: [{t: 0, color: defaultEnds[0]}, {t: 1, color: defaultEnds[1]}],
    vibrance: defaultVibrance
  };
}

export function getSchemeColors(scheme) {
  return getSchemeTiles(scheme).map(function(tile) {
    return tile.color;
  });
}

// One object per tile: {color, pinned, adjusted, ...}, where adjusted means
// an interpolated color was moved to fit the sRGB gamut (see resolveRampTiles())
export function getSchemeTiles(scheme) {
  var colors;
  if (scheme.preset) {
    colors = getPresetColors(scheme.preset, scheme.n);
    if (scheme.reversed) colors.reverse();
    return colors.map(function(color) {
      return {color: color, pinned: false, adjusted: false};
    });
  }
  return internal.resolveRampTiles(scheme.pins, scheme.n, {
    vibrance: getSchemeVibrance(scheme),
    hue: scheme.longHue ? 'longer' : 'shorter'
  });
}

export function getSchemeVibrance(scheme) {
  return scheme.vibrance >= 0 ? scheme.vibrance : defaultVibrance;
}

export function setSchemeVibrance(scheme, vibrance) {
  vibrance = clamp(+vibrance || 0, 0, maxVibrance);
  return Object.assign({}, scheme, {vibrance: vibrance});
}

// longHue: hues go the long way around the color wheel between pinned colors
export function setSchemeLongHue(scheme, longHue) {
  return Object.assign({}, scheme, {longHue: !!longHue});
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

export function getPresetColors(name, n) {
  return internal.getColorRamp(name, n).map(toHex);
}

// One boolean per tile: whether the user set its color.
export function getPinnedTiles(scheme) {
  if (scheme.preset) {
    return new Array(scheme.n).fill(false);
  }
  return internal.getPinnedSlots(scheme.pins, scheme.n).map(function(pinId) {
    return pinId > -1;
  });
}

export function choosePreset(scheme, name) {
  return Object.assign({}, scheme, {preset: name, reversed: false, pins: null});
}

// A preset as a custom ramp, pinned at its ends, for editing.
export function makeSchemeCustom(scheme) {
  var colors;
  if (!scheme.preset) return scheme;
  colors = getSchemeColors(scheme);
  return Object.assign({}, scheme, {
    preset: null,
    reversed: false,
    pins: [{t: 0, color: colors[0]}, {t: 1, color: colors[colors.length - 1]}]
  });
}

// The color to edit for tile i: a pinned tile's own color, which vibrance
// may have raised in the ramp, or else the tile's color
export function getTileEditColor(scheme, i) {
  var slot = scheme.preset ? -1 : internal.getPinnedSlots(scheme.pins, scheme.n)[i];
  if (slot > -1) return toHex(scheme.pins[slot].color);
  return getSchemeColors(scheme)[i];
}

export function setTileColor(scheme, i, color) {
  var custom = makeSchemeCustom(scheme);
  return Object.assign({}, custom, {
    pins: internal.setRampPin(custom.pins, custom.n, i, toHex(color))
  });
}

export function clearTileColor(scheme, i) {
  if (scheme.preset) return scheme;
  return Object.assign({}, scheme, {
    pins: internal.clearRampPin(scheme.pins, scheme.n, i)
  });
}

export function setTileCount(scheme, n) {
  n = Math.round(n);
  if (!(n >= minSchemeColors)) n = minSchemeColors;
  if (n > maxSchemeColors) n = maxSchemeColors;
  return Object.assign({}, scheme, {n: n});
}

export function reverseScheme(scheme) {
  if (scheme.preset) {
    return Object.assign({}, scheme, {reversed: !scheme.reversed});
  }
  return Object.assign({}, scheme, {
    pins: scheme.pins.map(function(pin) {
      return {t: 1 - pin.t, color: pin.color};
    }).reverse()
  });
}

// opts.target  a -target value, when the layer is not the active one
export function formatSchemeCommand(scheme, colors, opts) {
  var parts = ['-classify',
    'field=' + quoteCommandValue(scheme.field),
    'method=' + scheme.method,
    'colors=' + colors.join(',')];
  if (opts && opts.target) {
    parts.push('target=' + opts.target);
  }
  return parts.join(' ');
}

export function getNumericFields(lyr) {
  var records = lyr && lyr.data ? lyr.data.getRecords() : [];
  if (!lyr || !lyr.data) return [];
  return lyr.data.getFields().filter(function(field) {
    return internal.getColumnType(field, records) == 'number';
  });
}

export function setLayerScheme(lyr, scheme) {
  if (!lyr) return;
  if (scheme) {
    layerSchemes.set(lyr, scheme);
  } else {
    layerSchemes.delete(lyr);
  }
}

// The scheme that colored a layer, or null if it has none, or if its fills
// have since been changed some other way.
export function getLayerScheme(lyr) {
  var scheme = lyr ? layerSchemes.get(lyr) : null;
  if (!scheme || !schemeMatchesLayer(scheme, lyr)) return null;
  return scheme;
}

// Checked from the data rather than kept in step with every edit, so that
// anything that changes the fills -- a -style command, a typed fill color,
// an undo past the scheme -- retires it.
export function schemeMatchesLayer(scheme, lyr) {
  var records, colors, val;
  if (!lyr || !lyr.data || !scheme.colors) return false;
  if (!lyr.data.fieldExists(scheme.field)) return false;
  colors = scheme.colors.map(function(c) { return c.toLowerCase(); });
  records = lyr.data.getRecords();
  for (var i=0; i<records.length; i++) {
    val = records[i] && records[i].fill;
    if (!val || (!colors.includes(String(val).toLowerCase()) && !isNullFill(val))) {
      return false;
    }
  }
  return true;
}

// The default null-value of -classify colors
function isNullFill(val) {
  return val == '#eee' || val == '#eeeeee';
}

function toHex(color) {
  return internal.formatColor(internal.parseColor(color));
}
