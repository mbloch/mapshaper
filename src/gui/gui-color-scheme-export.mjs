import { internal } from './gui-core';
import {
  getSchemeBreaks, getSchemeColors, getAppliedColors, getCategories, getSchemeNullColor,
  getContinuousTileStops, getCenterTile, getDivergingTileUse, isContinuousScheme, formatSchemeCommand,
  getCategoryName, isElevationScheme, isBlendedScheme, isLandTransparent, getBlendRampColors,
  getElevationSchemeStops, getSeaScheme, getSeaSolidColor, getLandSolidColor
} from './gui-color-scheme-model';
import { getRasterUnitsLabel } from './gui-raster-band-values';

// Text versions of a color scheme as applied to a layer's data: a GMT color
// palette table (.cpt) and a JSON format for web maps.
// See docs/development/color-scheme-panel-design.md, "Exporting a palette"

// The scheme's classes, the base of both formats: {from, to, color} for
// classes, {from, to, colors: [low, high]} for a stretch of continuous colors
// (classes include from and exclude to, but for the last, which includes the
// max), or {value, color} for a category, with the category's name if it has
// one (a raster's, from its file or a palette). Returns null if the scheme has no
// classes to export (non-adjacent colors, or no data).
export function getExportClasses(scheme, lyr) {
  if (scheme.method == 'non-adjacent') return null;
  if (scheme.type == 'categorical') return getCategoryClasses(scheme, lyr);
  if (isContinuousScheme(scheme)) return getContinuousClasses(scheme, lyr);
  return getClassedClasses(scheme, lyr);
}

function getCategoryClasses(scheme, lyr) {
  var categories = getCategories(lyr, scheme.field);
  var colors = getAppliedColors(scheme, categories.length);
  if (categories.length === 0) return null;
  // as -classify assigns them, repeating the colors if there are more categories
  return categories.map(function(val, i) {
    var o = {value: val, color: colors[i % colors.length]};
    var name = getCategoryName(scheme, lyr, val);
    if (name) o.name = name;
    return o;
  });
}

function getClassedClasses(scheme, lyr) {
  var info = getSchemeBreaks(scheme, lyr);
  var colors, use, ends, breaks;
  if (!info) return null;
  colors = getSchemeColors(scheme);
  breaks = info.breaks;
  if (getLandSolidColor(scheme)) {
    return [{from: tidy(info.min), to: tidy(info.max), color: getLandSolidColor(scheme)}];
  }
  if (isElevationScheme(scheme)) {
    // a class from each stop up to the next, as continuous elevations start
    // at the first stop
    breaks = breaks.slice(1);
    ends = [info.breaks[0], info.max];
  } else if (scheme.type == 'diverging') {
    use = getDivergingTileUse(scheme);
    colors = colors.filter(function(c, i) { return use[i]; });
    // the outer classes may reach past the data (e.g. equal intervals)
    ends = scheme.layout.extent;
  } else {
    ends = [info.min, info.max];
  }
  var edges = [Math.min(ends[0], breaks.length ? breaks[0] : ends[0])].concat(breaks,
    [Math.max(ends[1], breaks.length ? breaks[breaks.length - 1] : ends[1])]);
  return colors.map(function(color, i) {
    return {from: tidy(edges[i]), to: tidy(edges[i + 1]), color: color};
  });
}

// The stretches between the color stops; a diverging scheme's sides are
// separate (the colors jump at the pivot), with its pivot class between them
function getContinuousClasses(scheme, lyr) {
  var tiles = getContinuousTileStops(scheme, lyr);
  var colors = getSchemeColors(scheme);
  var k = getCenterTile(scheme);
  var classes = [];
  var stops;
  if (!tiles) return null;
  stops = tiles.map(function(tile, i) { return tile && !tile.range ? i : -1; })
    .filter(function(i) { return i > -1; });
  for (var j=1; j<stops.length; j++) {
    var a = stops[j - 1], b = stops[j];
    if (k > -1 && (a < k) != (b < k)) continue;
    classes.push({from: tidy(tiles[a].value), to: tidy(tiles[b].value), colors: [colors[a], colors[b]]});
  }
  if (k > -1 && tiles[k] && tiles[k].range) {
    classes.push({from: tidy(tiles[k].range[0]), to: tidy(tiles[k].range[1]), color: colors[k]});
  }
  return classes.sort(function(a, b) { return a.from - b.from; });
}

// The JSON format. Classes also come as breaks and colors, which is what
// d3.scaleThreshold().domain(breaks).range(colors) takes, and the whole
// scheme as a Mapbox GL / MapLibre style expression, for a fill-color property.
export function getSchemeExportData(scheme, lyr) {
  var classes = getExportClasses(scheme, lyr);
  var continuous = isContinuousScheme(scheme);
  var data;
  if (!classes) return null;
  data = {
    type: scheme.type,
    field: scheme.field,
    palette: scheme.preset || null,
    method: scheme.method,
    continuous: continuous
  };
  if (scheme.type == 'diverging' && scheme.layout) {
    data.pivot = tidy(scheme.layout.pivot);
  }
  if (continuous) {
    // the panel's ramps are interpolated in OKLCH, which a renderer that
    // interpolates in RGB approaches between the colors
    data.interpolation = 'oklch';
  }
  if (isElevationScheme(scheme)) {
    data.elevations = getElevationExportData(scheme, lyr);
  }
  data.classes = classes;
  if (scheme.type != 'categorical' && !continuous) {
    data.breaks = classes.slice(1).map(function(c) { return c.from; });
    data.colors = classes.map(function(c) { return c.color; });
  }
  // null: transparent (a raster's default)
  data.nullColor = getSchemeNullColor(scheme);
  data.expression = getStyleExpression(scheme.field, scheme.type, classes, data.nullColor || 'rgba(0,0,0,0)');
  data.command = getSchemeCommand(scheme, lyr);
  return data;
}

// The -classify command that colors the layer with the scheme, which is also
// what an import rebuilds the scheme from (see gui-color-scheme-import.mjs)
function getSchemeCommand(scheme, lyr) {
  var count = scheme.type == 'categorical' ? getCategories(lyr, scheme.field).length : -1;
  return formatSchemeCommand(scheme, getAppliedColors(scheme, count), {layer: lyr});
}

// A fixed-elevation scheme's stops (in the band's units) and the colors at
// them, which an import takes over the command's, so that they can be edited:
// {units, stops, colors} for one preset, {units, stops, blend: {name: colors}}
// with every preset's colors for a blend, and sea: {palette, stops, colors}
// or null. Transparent land has only the sea; solid land has one color, at 0.
// A blend's classes are those of the preset it uses where it can't blend.
function getElevationExportData(scheme, lyr) {
  var sea = getSeaScheme(scheme);
  var o = {units: getRasterUnitsLabel(lyr)};
  if (getLandSolidColor(scheme)) {
    // solid land: one color, at sea level
    o.stops = [0];
    o.colors = [getLandSolidColor(scheme)];
  } else if (!isLandTransparent(scheme)) {
    o.stops = getElevationSchemeStops(scheme, lyr).map(tidy);
    if (isBlendedScheme(scheme)) {
      o.blend = {};
      getBlendRampColors(scheme).forEach(function(ramp) { o.blend[ramp.name] = ramp.colors; });
    } else {
      o.colors = getSchemeColors(scheme);
    }
  }
  o.sea = sea ? Object.assign({
    palette: sea.preset || null,
    stops: getElevationSchemeStops(sea, lyr).map(tidy),
    colors: getSchemeColors(sea)
  }, isContinuousScheme(sea) ? {} : {classed: true}) : null;
  // a solid sea: one color, at sea level
  if (getSeaSolidColor(scheme)) o.sea = {palette: null, stops: [0], colors: [getSeaSolidColor(scheme)]};
  return o;
}

export function formatSchemeJSON(scheme, lyr) {
  var data = getSchemeExportData(scheme, lyr);
  return data ? formatCompactJSON(data) + '\n' : null;
}

// Indented JSON, with arrays of numbers and strings on one line (e.g. a
// preset's colors), which makes them easier to read and edit
function formatCompactJSON(data) {
  return JSON.stringify(data, null, 2).replace(/\[\n([^[\]{}]*)\n\s*\]/g, function(match, items) {
    return '[' + items.split('\n').map(function(line) { return line.trim(); }).join(' ') + ']';
  });
}

// Features without a number get the null color
function getStyleExpression(field, type, classes, nullColor) {
  var value = ['get', field];
  var strings;
  if (type == 'categorical') {
    strings = classes.some(function(c) { return typeof c.value != 'number'; });
    return ['match', strings ? ['to-string', value] : value]
      .concat(getMatchArms(classes, strings), [nullColor]);
  }
  return ['case', ['!=', ['typeof', value], 'number'], nullColor, getNumberExpression(value, classes)];
}

// one arm per color, with all the categories it colors
function getMatchArms(classes, strings) {
  var colors = [], labels = {};
  classes.forEach(function(c) {
    var label = strings ? String(c.value) : c.value;
    if (!labels[c.color]) {
      labels[c.color] = [];
      colors.push(c.color);
    }
    if (!labels[c.color].includes(label)) labels[c.color].push(label);
  });
  return colors.reduce(function(memo, color) {
    var arr = labels[color];
    return memo.concat([arr.length == 1 ? arr[0] : arr, color]);
  }, []);
}

// Classes are a step expression. Continuous colors are an interpolate
// expression for each run of stretches that meet at the same color, chosen
// between by a case expression where the colors jump.
function getNumberExpression(value, classes) {
  var runs, expr;
  if (classes.every(function(c) { return !c.colors; })) {
    return classes.reduce(function(memo, c, i) {
      return i === 0 ? memo.concat([c.color]) : memo.concat([c.from, c.color]);
    }, ['step', value]);
  }
  runs = getColorRuns(classes);
  if (runs.length == 1) return getRunExpression(value, runs[0]);
  expr = ['case'];
  runs.forEach(function(run, i) {
    if (i < runs.length - 1) expr.push(['<', value, run.to]);
    expr.push(getRunExpression(value, run));
  });
  return expr;
}

function getColorRuns(classes) {
  var runs = [];
  var run = null;
  classes.forEach(function(c) {
    var colors = c.colors || [c.color, c.color];
    if (run && !c.color && !run.flat && run.stops[run.stops.length - 1][1] == colors[0]) {
      run.stops.push([c.to, colors[1]]);
    } else {
      run = {flat: !!c.color, stops: [[c.from, colors[0]], [c.to, colors[1]]]};
      runs.push(run);
    }
    run.to = c.to;
  });
  return runs;
}

function getRunExpression(value, run) {
  // a flat class, or a stretch with no length, is just its color
  var stops = run.stops.filter(function(stop, i) {
    return i === 0 || stop[0] > run.stops[i - 1][0];
  });
  if (run.flat || stops.length < 2) return stops[stops.length - 1][1];
  return stops.reduce(function(memo, stop) {
    return memo.concat(stop);
  }, ['interpolate', ['linear'], value]);
}

// A GMT color palette table: a line for each class, from a value and color
// to a value and color (the same color for classes, the stretch's two
// colors for continuous colors), then the colors of values below and above
// the range (B and F) and of no data (N). A categorical table has a line
// for each category: its key, color and label. Keys are words or numbers,
// so a category with spaces has them replaced in its key.
export function formatSchemeCPT(scheme, lyr) {
  var classes = getExportClasses(scheme, lyr);
  var lines;
  if (!classes) return null;
  lines = [
    '# Color palette exported by mapshaper',
    '# Field: ' + scheme.field + (scheme.preset ? ', palette: ' + scheme.preset : ''),
    '# mapshaper: ' + getSchemeCommand(scheme, lyr),
    '# COLOR_MODEL = RGB'
  ];
  if (scheme.type == 'categorical') {
    classes.forEach(function(c) {
      var key = String(c.value);
      lines.push([key.replace(/\s+/g, '_'), formatGmtColor(c.color), ';' + (c.name || key)].join('\t'));
    });
  } else {
    classes.forEach(function(c) {
      var colors = c.colors || [c.color, c.color];
      if (!(c.to > c.from)) return; // GMT wants a range
      lines.push([formatGmtNumber(c.from), formatGmtColor(colors[0]),
        formatGmtNumber(c.to), formatGmtColor(colors[1])].join('\t'));
    });
    lines.push('B\t' + formatGmtColor(getFirstColor(classes[0])));
    lines.push('F\t' + formatGmtColor(getLastColor(classes[classes.length - 1])));
  }
  // GMT has no transparent color, so a transparent no-data color is left out
  if (getSchemeNullColor(scheme)) {
    lines.push('N\t' + formatGmtColor(getSchemeNullColor(scheme)));
  }
  return lines.join('\n') + '\n';
}

function getFirstColor(c) {
  return c.colors ? c.colors[0] : c.color;
}

function getLastColor(c) {
  return c.colors ? c.colors[1] : c.color;
}

function formatGmtColor(color) {
  var rgb = internal.parseColor(color);
  return [rgb.r, rgb.g, rgb.b].join('/');
}

function formatGmtNumber(val) {
  return String(tidy(val));
}

// A file name for an export: the layer and field, e.g. counties-pop.cpt
export function getSchemeExportFileName(lyr, scheme, ext) {
  var base = [lyr && lyr.name, scheme.field].filter(Boolean).join('-') || 'palette';
  return base.replace(/[^\w.-]+/g, '-') + '.' + ext;
}

function tidy(val) {
  return isFinite(val) ? +(+val).toPrecision(12) : val;
}
