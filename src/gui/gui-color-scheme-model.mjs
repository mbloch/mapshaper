import { internal } from './gui-core';
import { quoteCommandValue } from './gui-command-utils';

// The state behind the color scheme panel, as plain objects and functions
// that return new ones. See docs/development/color-scheme-panel-design.md
//
// A sequential scheme is either a preset (a named d3 ramp, possibly reversed)
// or a custom ramp defined by pins ([{t, color}], see src/color/color-ramps.mjs).
// Editing a tile of a preset turns it into a custom ramp, pinned at the
// preset's two ends and at the edited tile.
//
// A categorical scheme is a palette of swatches, either a d3 categorical
// scheme (in its own order, or rearranged) or a custom list, of which the
// first n are used. Its 'categorical' method gives each unique value of the
// field a swatch, taking them in turn (so there are never more swatches in
// use than values); 'non-adjacent' has no field, and colors neighboring
// polygons differently. Editing a swatch of a preset turns it into a custom
// list.
//
// scheme: {
//   type: 'sequential' or 'categorical',
//   field, method, n,
//   preset: name or null, reversed: boolean,  (presets)
//   pins: [{t, color}] or null,               (custom sequential ramps)
//   vibrance, longHue                         (custom sequential ramps, see
//                                             getOklchInterpolator())
//   order: [...] or null                      (categorical presets: indexes
//                                             of the preset's colors, as
//                                             rearranged)
//   swatches: [...] or null                   (custom categorical lists)
//   nullColor       the color of features with no data (both types; not
//                   used by non-adjacent schemes)
//   colors: [...]   the colors that were applied, for checking a layer later
// }

export var schemeTypes = [
  {name: 'sequential', label: 'Sequential'},
  {name: 'categorical', label: 'Categorical'}
];

export var classifyMethods = [
  {name: 'quantile', label: 'Quantile'},
  {name: 'equal-interval', label: 'Equal interval'},
  {name: 'nice', label: 'Nice breaks'},
  {name: 'hybrid', label: 'Hybrid'}
];

export var categoricalMethods = [
  {name: 'categorical', label: 'Categories'},
  {name: 'non-adjacent', label: 'Non-adjacent'}
];

// -classify's default null value for colors, as hex
export var defaultNullColor = '#eeeeee';

export var minSchemeColors = 2;
export var maxSchemeColors = 12;
export var maxCategoricalColors = 20;
var defaultCategoricalPreset = 'Tableau10';
var defaultNonAdjacentColors = 5;
// colors for growing a custom categorical list past the palette it came from
var extraSwatchSource = 'Tableau20';
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

export function getCategoricalPresetNames() {
  return internal.getColorSchemeNames('categorical');
}

// The scheme a panel tab starts with on a layer
export function getDefaultSchemeOfType(type, lyr) {
  if (type == 'categorical') return getDefaultCategoricalScheme(lyr);
  return getDefaultScheme(getNumericFields(lyr)[0]);
}

// By the first text field, or else the first field that can be classified
// by value, or else non-adjacent
export function getDefaultCategoricalScheme(lyr) {
  var fields = getCategoryFields(lyr);
  var records = lyr && lyr.data ? lyr.data.getRecords() : [];
  var field = fields.find(function(name) {
    return internal.getColumnType(name, records) == 'string';
  }) || fields[0] || null;
  var scheme = {
    type: 'categorical',
    field: field,
    method: field ? 'categorical' : 'non-adjacent',
    n: defaultNonAdjacentColors,
    preset: defaultCategoricalPreset,
    order: null,
    swatches: null
  };
  return field ? setSchemeField(scheme, field, getCategories(lyr, field).length) : scheme;
}

export function getSchemeMethods(scheme) {
  return scheme.type == 'categorical' ? categoricalMethods : classifyMethods;
}

// count: the number of categories, for the categorical method
export function getMaxSchemeColors(scheme, count) {
  var max = maxSchemeColors;
  if (scheme.type != 'categorical') return max;
  max = scheme.preset ? internal.getCategoricalColors(scheme.preset).length : maxCategoricalColors;
  if (scheme.method == 'categorical' && count >= 0) {
    max = Math.min(max, Math.max(count, minSchemeColors));
  }
  return max;
}

function clampColorCount(scheme, n, count) {
  return clamp(Math.round(n) || minSchemeColors, minSchemeColors, getMaxSchemeColors(scheme, count));
}

// A new field for a categorical scheme gets a swatch for each of its values,
// up to as many as the palette has.
// count: the number of categories in the field
export function setSchemeField(scheme, field, count) {
  var next = Object.assign({}, scheme, {field: field});
  if (next.type == 'categorical' && next.method == 'categorical') {
    next.n = clampColorCount(next, count, count);
  }
  return next;
}

// field, count: the field to use, and its number of categories, when a
// categorical scheme changes to the categorical method
export function setSchemeMethod(scheme, method, field, count) {
  var next = Object.assign({}, scheme, {method: method});
  if (next.type != 'categorical') return next;
  if (method == 'categorical') {
    return setSchemeField(next, next.field || field, count);
  }
  return setTileCount(next, defaultNonAdjacentColors);
}

// Fields that a categorical scheme can classify: text and numbers. The
// fill field is left out, since the scheme writes over it.
export function getCategoryFields(lyr) {
  var records = lyr && lyr.data ? lyr.data.getRecords() : [];
  if (!lyr || !lyr.data) return [];
  return lyr.data.getFields().filter(function(field) {
    var type = internal.getColumnType(field, records);
    return field != 'fill' && (type == 'string' || type == 'number');
  });
}

// The values of a field, in the order -classify gives them swatches. Empty
// values are left out, as -classify leaves them out: they are no data.
export function getCategories(lyr, field) {
  if (!lyr || !lyr.data || !field || !lyr.data.fieldExists(field)) return [];
  return internal.getUniqFieldValues(lyr.data.getRecords(), field).filter(isCategoryValue);
}

// The same test as -classify's (0 is a value; null, undefined, '' and NaN
// are not)
function isCategoryValue(val) {
  return !!val || val === 0;
}

// How many features the scheme gives the no-data color
export function getNoDataCount(lyr, scheme) {
  var records, test;
  if (!lyr || !lyr.data || !scheme.field || scheme.method == 'non-adjacent' ||
      !lyr.data.fieldExists(scheme.field)) return 0;
  records = lyr.data.getRecords();
  test = scheme.type == 'categorical' ? isCategoryValue : isFiniteNumber;
  return records.filter(function(rec) {
    return !test(rec ? rec[scheme.field] : undefined);
  }).length;
}

function isFiniteNumber(val) {
  return typeof val == 'number' && isFinite(val);
}

export function getSchemeNullColor(scheme) {
  return scheme.nullColor || defaultNullColor;
}

// An empty or unreadable color is the default
export function setSchemeNullColor(scheme, color) {
  var rgb = color ? internal.parseColor(color) : null;
  return Object.assign({}, scheme, {nullColor: rgb ? internal.formatColor(rgb) : defaultNullColor});
}

// The categories each swatch colors, as -classify assigns them
export function getSwatchCategories(categories, n) {
  var groups = [];
  for (var i=0; i<n; i++) groups.push([]);
  categories.forEach(function(val, i) {
    groups[i % n].push(val);
  });
  return groups;
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
  if (scheme.type == 'categorical') {
    return getCategoricalPalette(scheme).slice(0, scheme.n).map(function(color) {
      return {color: color, pinned: false, adjusted: false};
    });
  }
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

// All the swatches of a categorical scheme, in order: the first n are used
export function getCategoricalPalette(scheme) {
  var colors;
  if (!scheme.preset) return scheme.swatches.concat();
  colors = getCategoricalPresetColors(scheme.preset);
  if (!scheme.order) return colors;
  return scheme.order.map(function(i) { return colors[i]; });
}

export function getCategoricalPresetColors(name) {
  return internal.getCategoricalColors(name).map(toHex);
}

// A list of n colors, starting with the given ones and going on with colors
// they don't have yet
function extendSwatches(colors, n) {
  var swatches = colors.slice(0, n);
  getCategoricalPresetColors(extraSwatchSource).forEach(function(color) {
    if (swatches.length < n && !swatches.includes(color)) {
      swatches.push(color);
    }
  });
  return internal.wrapColors(swatches, n);
}

// One boolean per tile: whether the user set its color.
export function getPinnedTiles(scheme) {
  if (scheme.preset || scheme.type == 'categorical') {
    return new Array(scheme.n).fill(false);
  }
  return internal.getPinnedSlots(scheme.pins, scheme.n).map(function(pinId) {
    return pinId > -1;
  });
}

// count: the number of categories, for a categorical scheme
export function choosePreset(scheme, name, count) {
  var next;
  if (scheme.type == 'categorical') {
    next = Object.assign({}, scheme, {preset: name, order: null, swatches: null});
    next.n = clampColorCount(next, next.n, count);
    return next;
  }
  return Object.assign({}, scheme, {preset: name, reversed: false, pins: null});
}

// A preset as a custom ramp, pinned at its ends, for editing.
export function makeSchemeCustom(scheme) {
  var colors;
  if (!scheme.preset) return scheme;
  if (scheme.type == 'categorical') {
    return Object.assign({}, scheme, {preset: null, order: null, swatches: getCategoricalPalette(scheme)});
  }
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
  var slot = scheme.preset || scheme.type == 'categorical' ? -1 :
    internal.getPinnedSlots(scheme.pins, scheme.n)[i];
  if (slot > -1) return toHex(scheme.pins[slot].color);
  return getSchemeColors(scheme)[i];
}

export function setTileColor(scheme, i, color) {
  var custom = makeSchemeCustom(scheme);
  var swatches;
  if (custom.type == 'categorical') {
    swatches = custom.swatches.concat();
    swatches[i] = toHex(color);
    return Object.assign({}, custom, {swatches: swatches});
  }
  return Object.assign({}, custom, {
    pins: internal.setRampPin(custom.pins, custom.n, i, toHex(color))
  });
}

export function clearTileColor(scheme, i) {
  if (scheme.preset || scheme.type == 'categorical') return scheme;
  return Object.assign({}, scheme, {
    pins: internal.clearRampPin(scheme.pins, scheme.n, i)
  });
}

// A custom categorical list grows to have at least n swatches.
// count: the number of categories, for a categorical scheme
export function setTileCount(scheme, n, count) {
  var next = Object.assign({}, scheme, {n: clampColorCount(scheme, n, count)});
  if (next.type == 'categorical' && !next.preset && next.swatches.length < next.n) {
    next.swatches = extendSwatches(next.swatches, next.n);
  }
  return next;
}

// Moves a categorical swatch to a new place in the palette. Moving one
// into the swatches in use pushes the last of them out of use, and moving one
// out of use brings the first unused one in.
// to: the swatch's index after the move
export function moveSwatch(scheme, from, to) {
  return rearrangeSwatches(scheme, function(items) {
    var item = items.splice(from, 1)[0];
    items.splice(to, 0, item);
    return items;
  });
}

// Shuffles all of a categorical palette's swatches, in use or not, into a
// new order.
// random: a function like Math.random (for testing)
export function shuffleScheme(scheme, random) {
  var rand = random || Math.random;
  return rearrangeSwatches(scheme, function(items) {
    var shuffled, tries = 0;
    do {
      shuffled = shuffle(items.concat(), rand);
    } while (items.length > 1 && ++tries < 10 && shuffled.every(function(item, i) {
      return item == items[i];
    }));
    return shuffled;
  });
}

function shuffle(arr, rand) {
  var j, tmp;
  for (var i=arr.length - 1; i>0; i--) {
    j = Math.floor(rand() * (i + 1));
    tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// Presets are rearranged by index, so that they keep their name
function rearrangeSwatches(scheme, rearrange) {
  var order;
  if (scheme.type != 'categorical') return scheme;
  if (!scheme.preset) {
    return Object.assign({}, scheme, {swatches: rearrange(scheme.swatches.concat())});
  }
  order = scheme.order || getCategoricalPresetColors(scheme.preset).map(function(c, i) { return i; });
  return Object.assign({}, scheme, {order: rearrange(order.concat())});
}

export function reverseScheme(scheme) {
  if (scheme.type == 'categorical') return scheme;
  if (scheme.preset) {
    return Object.assign({}, scheme, {reversed: !scheme.reversed});
  }
  return Object.assign({}, scheme, {
    pins: scheme.pins.map(function(pin) {
      return {t: 1 - pin.t, color: pin.color};
    }).reverse()
  });
}

// The colors to give -classify: no more than there are categories, for the
// categorical method.
// count: the number of categories
export function getAppliedColors(scheme, count) {
  var colors = getSchemeColors(scheme);
  if (scheme.type == 'categorical' && scheme.method == 'categorical' && count > 0) {
    colors = colors.slice(0, count);
  }
  return colors;
}

// opts.target  a -target value, when the layer is not the active one
export function formatSchemeCommand(scheme, colors, opts) {
  var parts = ['-classify'];
  if (scheme.method != 'non-adjacent') {
    parts.push('field=' + quoteCommandValue(scheme.field));
  }
  parts.push('method=' + scheme.method, 'colors=' + colors.join(','));
  if (scheme.method != 'non-adjacent' && getSchemeNullColor(scheme) != defaultNullColor) {
    parts.push('null-value=' + getSchemeNullColor(scheme));
  }
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
  if (scheme.method != 'non-adjacent' && !lyr.data.fieldExists(scheme.field)) return false;
  colors = scheme.colors.map(function(c) { return c.toLowerCase(); });
  records = lyr.data.getRecords();
  for (var i=0; i<records.length; i++) {
    val = records[i] && records[i].fill;
    if (!val || (!colors.includes(String(val).toLowerCase()) && !isNullFill(val, scheme))) {
      return false;
    }
  }
  return true;
}

function isNullFill(val, scheme) {
  var color = getSchemeNullColor(scheme);
  val = String(val).toLowerCase();
  // -classify writes its default as #eee
  return val == color || color == defaultNullColor && val == '#eee';
}

function toHex(color) {
  return internal.formatColor(internal.parseColor(color));
}
