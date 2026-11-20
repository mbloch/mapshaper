import { internal } from './gui-core';
import {
  maxSchemeColors, maxCategoricalColors, maxFilePaletteColors,
  getDefaultSchemeOfType, getSchemeColors, getSchemeTiles, getSchemeValues, getNumericFields,
  getCategoryFields, getCategories, getCategoricalPresetColors, getContinuousTileStops,
  updateDivergingLayout, resetSchemeBreaks, setTileCount, setSchemeNullColor,
  getElevationFields, getElevationPresetNames, getClimatePresetNames, getElevationPresetColors,
  setSchemeField, getElevationSchemeFromSpec, isElevationScheme, setSchemeMethod
} from './gui-color-scheme-model';
import { getRasterUnitMeters } from './gui-raster-band-values';

// Color palettes from text: a GMT color palette table (.cpt), the JSON that
// gui-color-scheme-export.mjs writes, a legend of categories (see
// parseLegend()), or a list of CSS colors. Names that a palette gives a
// raster's categories go with its scheme, to -classify category-names=.
// See docs/development/color-scheme-panel-design.md, "Importing a palette"
//
// A file that mapshaper exported has the -classify command that made it,
// which gives back the scheme. Other palettes give classes or categories,
// used as they are if they fit the layer's data, or else just their colors.

// Returns {scheme, note}, where note says what couldn't be imported (or is
// null). Throws an Error with a message for the user if the text isn't a
// palette.
// scheme: the panel's current scheme, which a palette of colors only goes into
// points: [lon, lat] points across the layer, for the preset that a blend of
//   elevation presets uses where it can't blend (see getDefaultElevationPreset())
export function importColorPalette(text, scheme, lyr, points) {
  var palette = parsePalette(text);
  var result = palette.command || palette.elevations ? importCommand(palette, lyr, points) : null;
  var note;
  if (!result || !result.scheme) {
    note = result ? result.note : palette.command ? 'The palette was made for a field this layer doesn\'t have.' : null;
    if (palette.kind == 'elevations') throw new Error(note);
    // other colors go into a ramp, which fixed elevations don't have
    if (isElevationScheme(scheme)) scheme = setSchemeMethod(scheme, 'equal-interval');
    result = palette.kind == 'categories' ? importCategories(palette, scheme, lyr) :
      palette.kind == 'classes' ? importClasses(palette, scheme, lyr) :
      {scheme: importColors(palette.colors, scheme, lyr), note: null};
    if (note) result.note = note + (result.note ? ' ' + result.note : '');
  }
  if (palette.nullColor) result.scheme = setSchemeNullColor(result.scheme, palette.nullColor);
  if (palette.kind == 'categories') result.scheme = addCategoryNames(result.scheme, palette, lyr);
  return result;
}

// A raster's categories get the names that a palette gives them: the labels
// of a GMT table (;label), the names of a JSON palette's classes, or a
// legend's text. A label that is just the category's value isn't a name.
function addCategoryNames(scheme, palette, lyr) {
  var byKey = {}, names = {}, found = false;
  if (!internal.layerHasRaster(lyr) || scheme.type != 'categorical' || scheme.method != 'categorical') {
    return scheme;
  }
  palette.categories.forEach(function(c) {
    if (c.label && c.label != c.key && !(c.key in byKey)) byKey[c.key] = c.label;
  });
  getCategories(lyr, scheme.field).forEach(function(val) {
    var name = byKey[String(val)];
    if (name) {
      names[val] = name;
      found = true;
    }
  });
  return found ? Object.assign({}, scheme, {categoryNames: {field: scheme.field, names: names}}) : scheme;
}

// {kind, command, preset, nullColor, ...}
//   kind 'classes': classes: [{from, to, colors: [low, high]}], ascending
//   kind 'categories': categories: [{key, label, color}]
//   kind 'colors': colors: [...]
export function parsePalette(text) {
  var str = String(text || '').trim();
  if (!str) throw new Error('There is no palette to import.');
  if (str[0] == '{' || str[0] == '[') return parseJsonPalette(str);
  return parseColorList(str) || parseTable(str);
}

// A GMT table, or else a legend
function parseTable(str) {
  var legend;
  try {
    return parseCPT(str);
  } catch(e) {
    legend = parseLegend(str);
    if (legend) return legend;
    throw e;
  }
}

// A legend of categories, like the text that comes with a classified raster:
// lines that start with a value and give a color and a name, e.g.
// "4: BWh Arid, desert, hot [255 0 0]", "4,#ff0000,Desert", or a line of a
// QGIS color map export, "4,255,0,0,255,Desert". Other lines (a title, notes,
// a header row) are skipped. Returns null if no line is a category.
function parseLegend(str) {
  var categories = str.split(/\r?\n/).map(parseLegendLine).filter(Boolean);
  if (categories.length === 0) return null;
  return {kind: 'categories', command: null, preset: null, nullColor: null, categories: categories};
}

function parseLegendLine(line) {
  var m = /^\s*([-+]?\d+)(?:\s*[:=,;\t]\s*|\s+)(\S.*)$/.exec(line);
  var rest, found, color, label;
  if (!m) return null;
  rest = m[2];
  found = /[[(]\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*[\])]/.exec(rest) ||
    /^(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,]+\d{1,3})?(?=[\s,;]|$)/.exec(rest);
  if (found) {
    color = fromRGB(found.slice(1, 4).map(Number));
  } else {
    found = /rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/i.exec(rest);
    color = found ? parseGmtColor(found[0]) : null;
  }
  if (!color) return null;
  label = (rest.slice(0, found.index) + ' ' + rest.slice(found.index + found[0].length))
    .replace(/^[\s,;:"']+|[\s,;:"']+$/g, '').replace(/\s+/g, ' ');
  return {key: m[1].replace(/^\+/, ''), label: label || m[1], color: color};
}

function parseJsonPalette(str) {
  var data, palette;
  try {
    data = JSON.parse(str);
  } catch(e) {
    // e.g. ['#364774', '#984b64'] from JavaScript
    palette = parseColorList(str);
    if (palette) return palette;
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
  if (data.elevations && typeof data.elevations == 'object') {
    palette.elevations = parseElevations(data.elevations);
    palette.elevations.classed = data.continuous === false;
    palette.field = typeof data.field == 'string' ? data.field : null;
  }
  if (palette.elevations && !(Array.isArray(data.classes) && data.classes.length > 0)) {
    palette.kind = 'elevations';
  } else if (Array.isArray(data.classes) && data.classes.length > 0) {
    if (data.classes.every(function(c) { return c && 'value' in c; })) {
      palette.kind = 'categories';
      palette.categories = data.classes.map(function(c) {
        var name = c.name || c.label;
        return {key: String(c.value), label: name ? String(name) : String(c.value), color: parseColorValue(c.color)};
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

// The elevations of a JSON export of fixed elevations (see
// getElevationExportData()): {units, stops, colors, blend, sea}
function parseElevations(o) {
  var blend = null;
  if (o.blend && typeof o.blend == 'object') {
    blend = {};
    Object.keys(o.blend).forEach(function(name) {
      blend[name] = parseColorArray(o.blend[name], name);
    });
  }
  return {
    units: typeof o.units == 'string' ? o.units : null,
    stops: o.stops ? parseStops(o.stops, 'stops') : null,
    colors: o.colors ? parseColorArray(o.colors, 'colors') : null,
    blend: blend,
    // without sea, the command's
    sea: !('sea' in o) ? undefined : o.sea && typeof o.sea == 'object' ? {
      preset: typeof o.sea.palette == 'string' ? o.sea.palette : null,
      stops: o.sea.stops ? parseStops(o.sea.stops, 'sea stops') : null,
      colors: o.sea.colors ? parseColorArray(o.sea.colors, 'sea colors') : null,
      classed: o.sea.classed === true
    } : null
  };
}

function parseStops(arr, name) {
  if (!Array.isArray(arr) || !arr.every(function(val, i) {
    return isFinite(val) && val !== null && (i === 0 || +val >= +arr[i - 1]);
  })) {
    throw new Error('The ' + name + ' should be numbers in ascending order.');
  }
  return arr.map(Number);
}

function parseColorArray(arr, name) {
  if (!Array.isArray(arr)) throw new Error('The ' + name + ' should be a list of colors.');
  return arr.map(parseColorValue);
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
// by spaces, commas or lines, and possibly quoted or in brackets
function parseColorList(str) {
  var tokens = (str.match(/rgba?\([^)]*\)|[^\s,;]+/g) || []).map(function(tok) {
    return tok.replace(/^["'“”‘’[\]]+|["'“”‘’[\]]+$/g, '');
  }).filter(Boolean);
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
// this layer can use, or {scheme: null, note} for fixed elevations that
// can't be imported (see importElevations()).
function importCommand(palette, lyr, points) {
  var o = palette.command ? parseClassifyCommand(palette.command) : null;
  var colors, type, scheme;
  if (palette.elevations || o && isElevationCommand(o)) {
    return importElevations(o || {}, palette, lyr, points);
  }
  if (!o || !Array.isArray(o.colors) || o.colors.length < 2 || !o.field) return null;
  // breaks given as percentages ("30%") depend on the data they were used with
  if (o.breaks && !o.breaks.every(isFinite)) return null;
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

function parseClassifyCommand(str) {
  var cmd;
  try {
    cmd = internal.parseCommands(str)[0];
  } catch(e) {
    return null;
  }
  return cmd && cmd.name == 'classify' ? cmd.options : null;
}

// Fixed elevations are land-colors= or sea-colors= (see formatSchemeCommand()),
// or hypsometric= in older commands, or in still older ones, stops given as
// breaks= and outer-breaks=, without a method=
function isElevationCommand(o) {
  return !!(o.land_colors || o.sea_colors && !o.colors || o.hypsometric) || !o.method && !!o.outer_breaks;
}

// Fixed elevations, from the command, and from a JSON export's elevations
// (see getElevationExportData()), which take precedence, so that they can be
// edited. Colors and stops have to be one at each of the presets' stops.
function importElevations(o, palette, lyr, points) {
  var elev = palette.elevations || {};
  var field = o.field || palette.field;
  var cmd = readElevationCommand(o);
  var hypsometric = cmd.hypsometric;
  // land colors, from the elevations or else the command
  var landTransparent = !elev.blend && !elev.colors && !cmd.colors && (hypsometric == 'none' || !hypsometric);
  // transparent land keeps the palette it had, for when it has colors again
  var blended = !!elev.blend || !elev.colors && (hypsometric == 'blended' ||
    landTransparent && String(palette.preset).toLowerCase() == 'blended');
  var classed = !blended && !landTransparent && (elev.classed || cmd.classed);
  var spec, scheme, base;
  if (!getElevationFields(lyr).includes(field)) {
    return {scheme: null, note: 'The palette is for elevations, and this layer has no ' +
      (field ? field + ' band of elevations.' : 'elevations.')};
  }
  base = setSchemeField(getDefaultSchemeOfType('elevation', lyr, points), field);
  spec = {
    preset: palette.preset || (hypsometric != 'blended' && hypsometric != 'none' ? hypsometric : null),
    stops: elev.stops ? convertStops(elev.stops, elev.units, lyr) : cmd.stops,
    classed: classed,
    landTransparent: landTransparent,
    sea: elev.sea !== undefined ? getJsonSea(elev.sea, elev.units, lyr) : cmd.sea
  };
  if (blended) {
    spec.blend = {};
    getClimatePresetNames().forEach(function(name) {
      var colors = elev.blend ? elev.blend[name] : cmd.named[name.toLowerCase()];
      if (colors) spec.blend[name] = colors.map(parseColorValue);
    });
  } else if (!landTransparent) {
    spec.colors = elev.colors || (cmd.colors ? cmd.colors.map(parseColorValue) : null) ||
      (spec.preset ? getPresetColorsByKey(spec.preset) : null);
  }
  scheme = getElevationSchemeFromSpec(base, spec, lyr);
  if (!scheme) {
    return {scheme: null, note: blended ? 'The blended presets have ' +
      getElevationPresetColors(getClimatePresetNames()[0]).length +
      ' stops, with a color at each; the palette\'s don\'t match.' :
      'The palette needs a color at each of its stops, and at least two of them, on land and at sea.'};
  }
  return {scheme: scheme, note: null};
}

function getPresetColorsByKey(key) {
  var name = getElevationPresetNames().find(function(name) { return name.toLowerCase() == key.toLowerCase(); });
  return name ? getElevationPresetColors(name) : null;
}

// The fixed elevations of a command: {hypsometric, classed, colors, stops,
// named, sea}, as -classify reads them (see getElevationOptions()):
// hypsometric is the land's preset, blended or none (null for custom
// colors), and a blend's colors are by preset (named: {name: colors}). An
// older command without land colors gives the stops as breaks= and
// outer-breaks=; its classes have no continuous flag, and every stop but the
// first in breaks=.
function readElevationCommand(o) {
  var eo = o.land_colors || o.sea_colors || o.hypsometric ? readElevationOptions(o) : null;
  var breaks = o.breaks || null;
  var classed = !!o.outer_breaks && !o.continuous;
  var stops = null;
  if (eo) {
    return {
      hypsometric: eo.land == 'custom' ? null : eo.land,
      classed: eo.landClassed,
      colors: eo.landColors,
      stops: eo.landBreaks ? eo.landBreaks.map(Number) : null,
      named: eo.blendColors || {},
      sea: getCommandSea(eo)
    };
  }
  if (breaks && o.outer_breaks && o.outer_breaks.length == 2) {
    stops = [o.outer_breaks[0]].concat(breaks, classed ? [] : [o.outer_breaks[1]]);
  }
  return {hypsometric: null, classed: classed, colors: null, stops: stops ? stops.map(Number) : null, named: {}, sea: null};
}

// A command's options that -classify would reject give no elevations
function readElevationOptions(o) {
  try {
    return internal.getElevationOptions(o);
  } catch(e) {
    return {land: null, landClassed: false, landColors: null, landBreaks: null, blendColors: null, sea: null};
  }
}

// A bathymetric sea, with its colors and depths if they were changed
function getCommandSea(eo) {
  var sea = eo.sea;
  var preset = sea && sea != 'transparent' && sea != 'land' && sea != 'custom' ? sea : null;
  if (!preset && !eo.seaColors) return null;
  return {preset: preset, stops: eo.seaBreaks ? eo.seaBreaks.map(Number) : null,
    colors: eo.seaColors ? eo.seaColors.map(parseColorValue) : null, classed: !!eo.seaClassed};
}

function getJsonSea(sea, units, lyr) {
  return sea ? Object.assign({}, sea, {stops: sea.stops ? convertStops(sea.stops, units, lyr) : null}) : null;
}

// Stops in @units (e.g. 'm' or 'ft') in the band's units
function convertStops(stops, units, lyr) {
  var meters = units ? internal.getVerticalUnitMeters(internal.parseVerticalUnits(units)) : null;
  var bandMeters = getRasterUnitMeters(lyr);
  if (!meters || meters == bandMeters) return stops;
  return stops.map(function(val) { return +(val * meters / bandMeters).toPrecision(6); });
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
    if (categories.length > 0 && categories.length <= maxFilePaletteColors && colors.every(Boolean)) {
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
