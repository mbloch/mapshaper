import { internal } from './gui-core';
import {
  maxSchemeColors, maxCategoricalColors,
  getDefaultSchemeOfType, getSchemeColors, getSchemeTiles, getSchemeValues, getNumericFields,
  getCategoryFields, getCategories, getCategoricalPresetColors, getContinuousTileStops,
  updateDivergingLayout, resetSchemeBreaks, setTileCount, setSchemeNullColor
} from './gui-color-scheme-model';

// Color palettes from text: a GMT color palette table (.cpt), the JSON that
// gui-color-scheme-export.mjs writes, or a list of CSS colors.
// See docs/development/color-scheme-panel-design.md, "Importing a palette"
//
// A file that mapshaper exported has the -classify command that made it,
// which gives back the scheme. Other palettes give classes or categories,
// used as they are if they fit the layer's data, or else just their colors.

// Returns {scheme, note}, where note says what couldn't be imported (or is
// null). Throws an Error with a message for the user if the text isn't a
// palette.
// scheme: the panel's current scheme, which a palette of colors only goes into
export function importColorPalette(text, scheme, lyr) {
  var palette = parsePalette(text);
  var result = palette.command ? importCommand(palette, lyr) : null;
  if (!result) {
    result = palette.kind == 'categories' ? importCategories(palette, scheme, lyr) :
      palette.kind == 'classes' ? importClasses(palette, scheme, lyr) :
      {scheme: importColors(palette.colors, scheme, lyr), note: null};
    if (palette.command) {
      result.note = 'The palette was made for a field this layer doesn\'t have.' +
        (result.note ? ' ' + result.note : '');
    }
  }
  if (palette.nullColor) result.scheme = setSchemeNullColor(result.scheme, palette.nullColor);
  return result;
}

// {kind, command, preset, nullColor, ...}
//   kind 'classes': classes: [{from, to, colors: [low, high]}], ascending
//   kind 'categories': categories: [{key, label, color}]
//   kind 'colors': colors: [...]
export function parsePalette(text) {
  var str = String(text || '').trim();
  if (!str) throw new Error('There is no palette to import.');
  if (str[0] == '{' || str[0] == '[') return parseJsonPalette(str);
  return parseColorList(str) || parseCPT(str);
}

function parseJsonPalette(str) {
  var data, palette;
  try {
    data = JSON.parse(str);
  } catch(e) {
    throw new Error('The JSON can\'t be read: ' + e.message);
  }
  if (Array.isArray(data)) {
    return {kind: 'colors', colors: parseColors(data)};
  }
  palette = {
    command: typeof data.command == 'string' ? data.command : null,
    preset: typeof data.palette == 'string' ? data.palette : null,
    nullColor: data.nullColor ? parseColorValue(data.nullColor) : null
  };
  if (Array.isArray(data.classes) && data.classes.length > 0) {
    if (data.classes.every(function(c) { return c && 'value' in c; })) {
      palette.kind = 'categories';
      palette.categories = data.classes.map(function(c) {
        return {key: String(c.value), label: String(c.value), color: parseColorValue(c.color)};
      });
    } else {
      palette.kind = 'classes';
      palette.classes = sortClasses(data.classes.map(function(c) {
        var colors = c.colors || [c.color, c.color];
        if (!(isFinite(c.from) && isFinite(c.to)) || !Array.isArray(colors)) {
          throw new Error('Each class needs from, to and a color (or colors).');
        }
        return {from: +c.from, to: +c.to, colors: [parseColorValue(colors[0]), parseColorValue(colors[1])]};
      }));
    }
  } else if (Array.isArray(data.colors)) {
    palette.kind = 'colors';
    palette.colors = parseColors(data.colors);
  } else {
    throw new Error('The JSON has no classes or colors.');
  }
  return palette;
}

function parseColors(arr) {
  if (arr.length === 0) throw new Error('The palette has no colors.');
  return arr.map(parseColorValue);
}

function parseColorValue(val) {
  var rgb = internal.parseColor(val);
  if (!rgb) throw new Error('Unknown color: ' + val);
  return internal.formatColor(rgb);
}

// Text that is nothing but colors (hex codes or names, rgb()...), separated
// by spaces, commas or lines
function parseColorList(str) {
  var tokens = str.match(/rgba?\([^)]*\)|[^\s,;]+/g) || [];
  var colors = tokens.map(function(tok) {
    return isNumber(tok) ? null : internal.parseColor(tok);
  });
  if (colors.length === 0 || !colors.every(Boolean)) return null;
  return {kind: 'colors', colors: colors.map(internal.formatColor)};
}

// GMT's color palette tables: a line for each range of values, from a value
// and color to a value and color (or for a categorical table, a key and a
// color), and B, F and N lines for values below and above the ranges and for
// no data. Colors are r/g/b (0-255), h-s-v, c/m/y/k (0-100), #rrggbb, a name
// or a gray level; older tables have them as columns of numbers, read by the
// table's COLOR_MODEL. A line can end with an annotation flag (L, U or B)
// and a ;label.
export function parseCPT(str) {
  var model = 'rgb';
  var palette = {command: null, preset: null, nullColor: null};
  var classes = [], categories = [];
  str.split(/\r?\n/).forEach(function(raw, i) {
    var line = raw.trim();
    var label = null;
    var tokens, semi, m;
    if (!line) return;
    if (line[0] == '#') {
      if ((m = /^#\s*COLOR_MODEL\s*=\s*\+?(\w+)/i.exec(line))) model = m[1].toLowerCase();
      else if ((m = /^#\s*mapshaper:\s*(-classify\b.*)$/.exec(line))) palette.command = m[1].trim();
      else if ((m = /^#\s*Field:.*\bpalette:\s*(\S+)/.exec(line))) palette.preset = m[1];
      return;
    }
    semi = line.indexOf(';');
    if (semi > -1) {
      label = line.slice(semi + 1).trim();
      line = line.slice(0, semi).trim();
    }
    tokens = line.split(/\s+/);
    if (/^[BFN]$/.test(tokens[0])) {
      if (tokens[0] == 'N') palette.nullColor = readColor(tokens.slice(1), model, i);
      return;
    }
    if (tokens.length > 2 && /^[LUB]$/i.test(tokens[tokens.length - 1])) tokens.pop();
    if (isRangeLine(tokens)) {
      classes.push(readRangeLine(tokens, model, i));
    } else if (tokens.length == 2 || tokens.length == 4 && tokens.slice(1).every(isNumber)) {
      categories.push({key: tokens[0], label: label || tokens[0], color: readColor(tokens.slice(1), model, i)});
    } else if (classes.length === 0 && categories.length === 0) {
      throw new Error('This isn\'t a GMT color palette table, a JSON palette or a list of colors.');
    } else {
      throw lineError(i, 'isn\'t a line of a color palette table.');
    }
  });
  if (classes.length > 0 && categories.length > 0) {
    throw new Error('The table has both ranges of values and categories.');
  }
  if (classes.length > 0) {
    palette.kind = 'classes';
    palette.classes = sortClasses(classes);
  } else if (categories.length > 0) {
    palette.kind = 'categories';
    palette.categories = categories;
  } else {
    throw new Error('This isn\'t a color palette: there are no colors in it.');
  }
  return palette;
}

// z0 color0 z1 color1, with each color as one word or three or four numbers
function isRangeLine(tokens) {
  var n = tokens.length;
  if (n != 4 && n != 8 && n != 10 || !isNumber(tokens[0]) || !isNumber(tokens[n / 2])) return false;
  // four numbers that go down are a key and an r g b color
  return n != 4 || !tokens.every(isNumber) || +tokens[2] > +tokens[0];
}

function readRangeLine(tokens, model, i) {
  var half = tokens.length / 2;
  var from = +tokens[0], to = +tokens[half];
  if (!(to >= from)) throw lineError(i, 'has a range that goes down.');
  return {
    from: from,
    to: to,
    colors: [readColor(tokens.slice(1, half), model, i), readColor(tokens.slice(half + 1), model, i)]
  };
}

function readColor(tokens, model, i) {
  var color = tokens.length == 1 ? parseGmtColor(tokens[0]) :
    tokens.length == 3 && tokens.every(isNumber) ? fromModel(tokens.map(Number), model) :
    tokens.length == 4 && tokens.every(isNumber) ? fromCMYK(tokens.map(Number)) : null;
  if (!color) throw lineError(i, 'has a color that can\'t be read: ' + tokens.join(' '));
  return color;
}

function parseGmtColor(tok) {
  var parts, rgb;
  tok = tok.replace(/@[\d.]+$/, ''); // transparency
  if (isNumber(tok)) return fromRGB([+tok, +tok, +tok]);
  parts = tok.split('/');
  if (parts.length == 3 && parts.every(isNumber)) return fromRGB(parts.map(Number));
  if (parts.length == 4 && parts.every(isNumber)) return fromCMYK(parts.map(Number));
  parts = tok.split('-');
  if (parts.length == 3 && parts.every(isNumber)) return fromHSV(parts.map(Number));
  rgb = internal.parseColor(tok);
  return rgb ? internal.formatColor(rgb) : null;
}

function fromModel(nums, model) {
  return model == 'hsv' ? fromHSV(nums) : model == 'rgb' ? fromRGB(nums) : null;
}

function fromRGB(rgb) {
  if (!rgb.every(function(val) { return val >= 0 && val <= 255; })) return null;
  return internal.formatColor({r: Math.round(rgb[0]), g: Math.round(rgb[1]), b: Math.round(rgb[2]), a: 1});
}

// h: 0-360, s and v: 0-1
function fromHSV(hsv) {
  var h = (hsv[0] % 360 + 360) % 360 / 60, s = hsv[1], v = hsv[2];
  var c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c;
  var rgb = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] :
    h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  if (!(s >= 0 && s <= 1 && v >= 0 && v <= 1)) return null;
  return fromRGB(rgb.map(function(val) { return (val + m) * 255; }));
}

// c, m, y, k: 0-100
function fromCMYK(cmyk) {
  var k = 1 - cmyk[3] / 100;
  return fromRGB(cmyk.slice(0, 3).map(function(val) { return 255 * (1 - val / 100) * k; }));
}

function lineError(i, msg) {
  return new Error('Line ' + (i + 1) + ' of the table ' + msg);
}

function isNumber(tok) {
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(tok);
}

function sortClasses(classes) {
  return classes.sort(function(a, b) { return a.from - b.from; });
}

// The scheme that a mapshaper export was made from, by its -classify command.
// Presets come back as presets if their colors are the same; other ramps
// are pinned at every tile. Returns null if the command's field isn't one
// this layer can use.
function importCommand(palette, lyr) {
  var cmd, o, colors, type, scheme;
  try {
    cmd = internal.parseCommands(palette.command)[0];
  } catch(e) {
    return null;
  }
  o = cmd && cmd.name == 'classify' ? cmd.options : null;
  if (!o || !Array.isArray(o.colors) || o.colors.length < 2 || !o.field) return null;
  colors = o.colors.map(function(c) { return internal.parseColor(c); });
  if (!colors.every(Boolean)) return null;
  colors = colors.map(internal.formatColor);
  type = o.method == 'categorical' ? 'categorical' : o.pivot !== undefined ? 'diverging' : 'sequential';
  if (!(type == 'categorical' ? getCategoryFields(lyr) : getNumericFields(lyr)).includes(o.field)) return null;
  if (type == 'categorical') {
    scheme = {type: type, field: o.field, method: 'categorical', n: colors.length,
      preset: null, order: null, swatches: colors};
  } else {
    scheme = getRampCommandScheme(o, type, colors, lyr);
    if (!scheme) return null;
  }
  return {scheme: findPreset(scheme, palette.preset, colors, lyr), note: null};
}

function getRampCommandScheme(o, type, colors, lyr) {
  var custom = o.method == 'breaks' && Array.isArray(o.breaks);
  var scheme = {
    type: type,
    field: o.field,
    method: custom ? 'breaks' : o.method || 'quantile',
    n: colors.length,
    preset: null,
    reversed: false,
    pins: getTilePins(colors),
    vibrance: 0,
    continuous: !!o.continuous
  };
  var pivot, layout;
  if (custom) {
    scheme.breaks = o.breaks.concat();
    scheme.baseMethod = 'quantile';
  }
  if (type == 'sequential') return scheme;
  pivot = isNumber(String(o.pivot)) ? +o.pivot : String(o.pivot);
  Object.assign(scheme, {
    pivot: pivot,
    split: o.classes && o.classes.length == 2 ? 'count' : 'size',
    neutral: !o.no_pivot_class,
    continuousNeutral: !!o.pivot_class
  });
  if (custom) scheme.breakPivot = pivot;
  if (o.classes) scheme.n = o.classes[0];
  scheme = updateDivergingLayout(scheme, lyr);
  if (!scheme.layout && custom) scheme = updateDivergingLayout(resetSchemeBreaks(scheme), lyr);
  layout = scheme.layout;
  if (!layout) return null;
  // custom breaks don't say how many classes the method had
  if (!o.classes) scheme.n = Math.min(layout.below + layout.above + (layout.neutral ? 1 : 0), maxSchemeColors);
  return scheme;
}

// Pins at every tile, so that the ramp has just these colors
function getTilePins(colors) {
  return colors.map(function(color, i) {
    return {t: i == colors.length - 1 ? 1 : i / (colors.length - 1), color: color};
  });
}

// The scheme as the preset it was exported from (as it was, or reversed),
// if that gives the same colors
function findPreset(scheme, preset, colors, lyr) {
  var candidates, found;
  if (!preset) return scheme;
  try {
    if (scheme.type == 'categorical') {
      return sameColors(getCategoricalPresetColors(preset).slice(0, colors.length), colors) ?
        Object.assign({}, scheme, {preset: preset, swatches: null}) : scheme;
    }
    candidates = [false, true].map(function(reversed) {
      return updateDivergingLayout(Object.assign({}, scheme, {preset: preset, reversed: reversed, pins: null, range: null}), lyr);
    });
    found = candidates.find(function(s) { return sameColors(getSchemeColors(s), colors); });
  } catch(e) {
    return scheme; // not a preset here
  }
  return found || scheme;
}

function sameColors(a, b) {
  return a.length == b.length && a.every(function(color, i) { return color.toLowerCase() == b[i].toLowerCase(); });
}

// A categorical palette fits a field whose every category it has a color
// for (the scheme's field first); the categories get their colors.
function importCategories(palette, scheme, lyr) {
  var fields = getCategoryFields(lyr);
  var lookup = getCategoryLookup(palette.categories);
  var match = null;
  if (scheme.type == 'categorical' && fields.includes(scheme.field)) {
    fields = [scheme.field].concat(fields.filter(function(f) { return f != scheme.field; }));
  }
  fields.some(function(field) {
    var categories = getCategories(lyr, field);
    var colors = categories.map(function(val) {
      return lookup[String(val)] || lookup[String(val).replace(/\s+/g, '_')];
    });
    if (categories.length > 0 && categories.length <= maxCategoricalColors && colors.every(Boolean)) {
      match = {field: field, colors: colors};
    }
    return !!match;
  });
  var target = scheme.type == 'categorical' ? scheme : getDefaultSchemeOfType('categorical', lyr);
  if (!match) {
    return {
      scheme: importColors(palette.categories.map(function(c) { return c.color; }), target, lyr),
      note: 'None of the layer\'s fields has the palette\'s categories, so only its colors were imported.'
    };
  }
  return {scheme: {
    type: 'categorical',
    field: match.field,
    method: 'categorical',
    n: match.colors.length,
    preset: null,
    order: null,
    swatches: match.colors
  }, note: null};
}

// categories by key and by label
function getCategoryLookup(categories) {
  var lookup = {};
  categories.forEach(function(c) {
    if (!lookup[c.label]) lookup[c.label] = c.color;
    if (!lookup[c.key]) lookup[c.key] = c.color;
  });
  return lookup;
}

// Ranges of values are used as they are if the data are all inside them:
// classes as custom breaks, and continuous colors as stops at the data's
// min, the values between, and its max (or if there are too many, stops at
// equal intervals). Otherwise the colors go into the panel's ramp.
function importClasses(palette, scheme, lyr) {
  var classes = palette.classes;
  var continuous = classes.some(function(c) { return c.colors[0] != c.colors[1]; });
  var target = scheme.type != 'categorical' ? scheme : getDefaultSchemeOfType('sequential', lyr);
  var field = target.field;
  var values = field ? getSchemeValues({field: field}, lyr) : [];
  var lo = classes[0].from, hi = classes[classes.length - 1].to;
  var min = values[0], max = values[values.length - 1];
  var getColor = getTableColorGetter(classes);
  var result, colors, n;
  if (values.length > 0 && min >= lo && max <= hi) {
    result = continuous ? getContinuousImport(classes, getColor, field, values, lyr) :
      getClassedImport(classes, field, values);
    if (result.scheme) return result;
  } else if (values.length > 0) {
    result = {note: 'The palette\'s values (' + formatNumber(lo) + ' to ' + formatNumber(hi) +
      ') don\'t cover ' + field + ' (' + formatNumber(min) + ' to ' + formatNumber(max) +
      '), so only its colors were imported.'};
  } else {
    result = {note: null};
  }
  if (continuous) {
    n = target.type == 'diverging' ? getSchemeTiles(target).length : target.n;
    colors = [];
    for (var i=0; i<n; i++) colors.push(getColor(lo + (hi - lo) * i / (n - 1)));
  } else {
    colors = classes.map(function(c) { return c.colors[0]; });
  }
  return {scheme: importColors(colors, target, lyr), note: result.note};
}

function getContinuousImport(classes, getColor, field, values, lyr) {
  var min = values[0], max = values[values.length - 1];
  var inner = [];
  var scheme;
  classes.forEach(function(c) {
    [c.from, c.to].forEach(function(z) {
      if (z > min && z < max && !inner.includes(z)) inner.push(z);
    });
  });
  inner.sort(function(a, b) { return a - b; });
  scheme = {
    type: 'sequential', field: field, preset: null, reversed: false, vibrance: 0, continuous: true,
    method: 'equal-interval', n: Math.min(inner.length + 2, maxSchemeColors)
  };
  if (inner.length > 0 && inner.length + 2 <= maxSchemeColors) {
    Object.assign(scheme, {method: 'breaks', baseMethod: 'equal-interval', breaks: inner});
  }
  var stops = getContinuousTileStops(scheme, lyr);
  scheme.pins = getTilePins(stops.map(function(stop) { return getColor(stop.value); }));
  return {scheme: scheme, note: null};
}

// The classes that the data reach, as custom breaks
function getClassedImport(classes, field, values) {
  var min = values[0], max = values[values.length - 1];
  var used = classes.filter(function(c, i) {
    return c.to > min && c.from <= max || i == classes.length - 1 && c.to == max;
  });
  if (used.length < 2) return {note: null};
  if (used.length > maxSchemeColors) {
    return {note: 'The palette has ' + used.length + ' classes, and the panel has up to ' + maxSchemeColors +
      ', so only its colors were imported.'};
  }
  return {scheme: {
    type: 'sequential',
    field: field,
    method: 'breaks',
    baseMethod: 'quantile',
    breaks: used.slice(1).map(function(c) { return c.from; }),
    n: used.length,
    preset: null,
    reversed: false,
    pins: getTilePins(used.map(function(c) { return c.colors[0]; })),
    vibrance: 0,
    continuous: false
  }, note: null};
}

// The color a table gives a value, interpolated in RGB as GMT does
function getTableColorGetter(classes) {
  return function(z) {
    var c = classes.find(function(c) { return z <= c.to; }) || classes[classes.length - 1];
    var t = c.to > c.from ? Math.min(Math.max((z - c.from) / (c.to - c.from), 0), 1) : 0;
    var a = internal.parseColor(c.colors[0]), b = internal.parseColor(c.colors[1]);
    return internal.formatColor({
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t),
      a: 1
    });
  };
}

// Colors into a scheme, keeping its field and classes: a categorical
// scheme's swatches, or a ramp pinned at every tile (with as many tiles as
// colors, for a sequential ramp; a diverging ramp has as many as its
// classes need, and the colors are spread over them)
function importColors(colors, scheme, lyr) {
  var count, size, next;
  if (scheme.type == 'categorical') {
    count = scheme.method == 'categorical' ? getCategories(lyr, scheme.field).length : -1;
    next = Object.assign({}, scheme, {preset: null, order: null, swatches: colors.slice(0, maxCategoricalColors)});
    return setTileCount(next, colors.length, count);
  }
  next = Object.assign({}, scheme, {preset: null, reversed: false, range: null, vibrance: 0});
  if (scheme.type == 'sequential') {
    next = setTileCount(next, Math.min(Math.max(colors.length, 2), maxSchemeColors), -1, lyr);
  }
  size = getSchemeTiles(Object.assign({}, next, {pins: getTilePins(['#000', '#000'])})).length;
  if (colors.length == 1) colors = [colors[0], colors[0]];
  if (colors.length != size) colors = internal.resolveRamp(getTilePins(colors), size);
  next.pins = getTilePins(colors.map(function(c) { return internal.formatColor(internal.parseColor(c)); }));
  return next;
}

function formatNumber(val) {
  return String(+(+val).toPrecision(6));
}
