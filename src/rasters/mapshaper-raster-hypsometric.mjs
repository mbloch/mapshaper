import { stop } from '../utils/mapshaper-logging';
import { parseColor } from '../color/color-utils';
import { getHypsometricSchemeNames, getClimateSchemeNames, getHypsometricStops } from '../color/hypsometric-schemes';
import { getClimateWeights } from '../color/hypsometric-climate';
import { getBathymetricSchemeNames, getBathymetricStops } from '../color/bathymetric-schemes';
import { getProjTransform2, parseCrsString, crsToProj4 } from '../crs/mapshaper-projections';
import { getVerticalUnitMeters } from './mapshaper-vertical-units';
import { getRasterGrid } from './mapshaper-raster-utils';
import { splitRampLists } from '../cli/mapshaper-option-parsing-utils';

// -classify hypsometric=: the hypsometric presets as raster palettes, at their
// elevations (see hypsometric-schemes.mjs), and a blend of the climate
// presets that varies across the map by climate (see hypsometric-climate.mjs).
//
// A blended palette is an ordinary continuous palette (the ramp of the preset
// with the most weight across the raster, for anything that draws it without
// a blend) with:
// palette.blend = {
//   ramps,  // [{name, breaks, colors}] for each preset, in the band's units
//   field   // the presets' weights across the raster (see getClimateWeightField())
// }
// The climate presets have the same elevations.
//
// colors= and breaks= change a preset's colors and elevations (every one, in
// the band's units). Their lists can be named (see splitRampOptions()): a
// blend's presets each have their own colors (colors=desert:...,polar:...),
// and share their elevations; the sea's are colors=sea:... and breaks=sea:...
// (see setRasterPaletteSea()). classed gives one preset classes, from each
// elevation up to the next.

var BLEND_NAME = 'blended';
var NONE_NAME = 'none';
// cells on the long side of a weight field; the climate grid has 1-degree
// cells, so a world raster gets about that resolution
var FIELD_CELLS = 360;

export function getHypsometricOptionNames() {
  return getHypsometricSchemeNames().map(function(name) { return name.toLowerCase(); }).concat([BLEND_NAME, NONE_NAME]);
}

// @name: a preset (any case), 'blended', or 'none', for a palette of only the
//   sea (palette.land = 'transparent'), whose colors setRasterPaletteSea()
//   gives
// @crs: the raster's CRS, for a blend
// @opts: -classify's options, for a blend's colors and elevations
export function getHypsometricPalette(raster, band, name, crs, opts) {
  var grid = getRasterGrid(raster);
  var key = String(name).toLowerCase();
  var meters = getVerticalUnitMeters(grid.verticalUnits) || 1;
  var field, preset, ramps, main;
  if (getHypsometricOptionNames().indexOf(key) == -1) {
    stop('Unknown hypsometric= value:', name, '(expected ' + getHypsometricOptionNames().join(', ') + ')');
  }
  opts = opts || {};
  if (opts.classed && (key == NONE_NAME || key == BLEND_NAME)) {
    stop('classed works with one preset, not hypsometric=' + key);
  }
  if (key == NONE_NAME) {
    if (opts.colors || opts.breaks) {
      stop('hypsometric=none colors only the sea; name its lists, e.g. colors=sea:...');
    }
    return {band: band, type: 'sequential', continuous: true, interpolation: 'oklch', breaks: [], colors: [],
      nullColor: null, land: 'transparent', hypsometric: NONE_NAME};
  }
  if (key != BLEND_NAME) {
    preset = getPresetName(key);
    main = customizeRamp(getPresetRamp(preset, meters), opts.colors, opts.breaks,
      {name: 'hypsometric=' + key, colors: 'colors=', breaks: 'breaks='});
    return Object.assign({band: band}, opts.classed ? getRampClasses(main) : main, {hypsometric: preset});
  }
  if (opts.colors) {
    stop('hypsometric=blended takes colors for each preset, e.g. colors=desert:...,polar:...');
  }
  field = crs ? getClimateWeightField(grid.bbox, crs) : null;
  if (!field) {
    stop('hypsometric=blended needs a raster with a known projection, on land');
  }
  ramps = getBlendRamps(meters, opts);
  main = ramps.find(function(ramp) { return ramp.name == field.preset; });
  return Object.assign({band: band}, getPresetRamp(field.preset, meters), {
    breaks: main.breaks.concat(),
    colors: main.colors.concat(),
    hypsometric: BLEND_NAME,
    blend: {ramps: ramps, field: field}
  });
}

// colors= and breaks= with named lists (see splitRampLists()), as a copy of
// the options with the unnamed lists (the land's) as colors and breaks, and
// the named ones as ramps: {colors: {name: list}, breaks: {name: list}}.
// Names: sea (see setRasterPaletteSea()), a blend's presets (colors only,
// since they share their elevations), and the preset of hypsometric=, which
// is the same as no name.
export function splitRampOptions(opts) {
  var key = opts.hypsometric ? String(opts.hypsometric).toLowerCase() : null;
  var climate = getClimateSchemeNames().map(function(name) { return name.toLowerCase(); });
  var out = Object.assign({}, opts, {ramps: {colors: {}, breaks: {}}});
  ['colors', 'breaks'].forEach(function(opt) {
    var lists = splitRampLists(opts[opt]);
    delete out[opt];
    Object.keys(lists || {}).forEach(function(name) {
      if (name === '' || name == key && key != BLEND_NAME) {
        if (out[opt]) stop(opt + '= gives the list of hypsometric=' + key + ' twice, with and without its name');
        out[opt] = lists[name];
      } else if (name == 'sea' || opt == 'colors' && key == BLEND_NAME && climate.includes(name)) {
        out.ramps[opt][name] = lists[name];
      } else if (climate.includes(name) && key == BLEND_NAME) {
        stop('The presets of hypsometric=blended share their elevations; give them as breaks= without a name');
      } else if (climate.includes(name)) {
        stop(opt + '=' + name + ': works with hypsometric=blended');
      } else {
        stop('Unknown name in ' + opt + '=: ' + name + ' (expected sea' +
          (key == BLEND_NAME && opt == 'colors' ? ', ' + climate.join(', ') : key && key != NONE_NAME ? ' or ' + key : '') + ')');
      }
    });
  });
  return out;
}

function getBlendRamps(meters, opts) {
  var names = getClimateSchemeNames();
  return names.map(function(name) {
    var key = name.toLowerCase();
    var ramp = customizeRamp(getPresetRamp(name, meters), opts.ramps.colors[key], opts.breaks,
      {name: 'hypsometric=blended', colors: 'colors=' + key + ':', breaks: 'breaks=', fixed: true});
    return {name: name, breaks: ramp.breaks, colors: ramp.colors};
  });
}

// Colors and elevations in place of a ramp's. With only one of them, there
// are as many as the ramp has; with both, as many as each other (unless the
// count is fixed, as for a blend, whose presets share their elevations).
// @labels: {name, colors, breaks, fixed, stop} for messages (stop: what a
//   stop is, 'elevation' by default)
function customizeRamp(ramp, colors, breaks, labels) {
  var n = ramp.colors.length;
  var unit = labels.stop || 'elevation';
  if (colors && breaks && !labels.fixed) {
    if (colors.length != breaks.length) {
      stop(labels.colors + ' and ' + labels.breaks + ' need the same number of values, a color at each ' + unit);
    }
    n = colors.length;
    if (n < 2) stop(labels.colors + ' needs two or more colors');
  } else if (colors && colors.length != n) {
    stop(labels.colors + ' needs ' + n + ' colors, one at each ' + unit + ' of ' + labels.name);
  } else if (breaks && breaks.length != n) {
    stop(labels.breaks + ' needs ' + n + ' ' + unit + 's, one for each color of ' + labels.name);
  }
  return Object.assign({}, ramp, {
    colors: colors ? colors.map(function(c) {
      if (!parseColor(c)) stop('Unsupported color in ' + labels.colors + ':', c);
      return String(c);
    }) : ramp.colors,
    breaks: breaks ? breaks.map(function(b, i) {
      if (!isFinite(b) || b === '' || i > 0 && +b < +breaks[i - 1]) {
        stop(labels.breaks + ' should be numbers in ascending order, one at each ' + unit + ' of ' + labels.name);
      }
      return +b;
    }) : ramp.breaks
  });
}

// A ramp's colors as classes, from each stop up to the next: the first class
// also takes the values below the first stop, and the last those above the
// last stop
function getRampClasses(ramp) {
  var classes = Object.assign({}, ramp, {continuous: false, breaks: ramp.breaks.slice(1)});
  delete classes.interpolation;
  return classes;
}

export function getSeaOptionNames() {
  return ['transparent', 'land'].concat(getBathymetricSchemeNames().map(function(name) {
    return name.toLowerCase();
  }));
}

// -classify sea=: what a palette does with the sea of an elevation raster
// (see mapshaper-raster-sea-mask.mjs). Hypsometric tints leave it out by
// default.
//   transparent  palette.sea = 'transparent': the sea is not drawn
//   land         (no palette.sea) the sea takes the palette's colors
//   a bathymetric preset (see bathymetric-schemes.mjs): palette.sea is its
//                name, and palette.seaRamp = {breaks, colors} its depths, in
//                the band's units, which color the sea continuously
// colors=sea:... and breaks=sea:... (in the band's units) change a preset's
// colors and depths, or without a preset, give them all; either way,
// palette.sea is 'custom'. A palette of only the sea (hypsometric=none) takes
// the sea's colors as its own, for anything that draws it without a sea.
// @opts: options from splitRampOptions()
export function setRasterPaletteSea(palette, raster, opts) {
  var colors = opts.ramps && opts.ramps.colors.sea;
  var breaks = opts.ramps && opts.ramps.breaks.sea;
  var custom = !!(colors || breaks);
  var sea = String(opts.sea || (custom ? 'custom' : opts.hypsometric ? 'transparent' : 'land')).toLowerCase();
  var meters = getVerticalUnitMeters(getRasterGrid(raster).verticalUnits) || 1;
  var name, stops, ramp;
  if (sea == 'custom') {
    if (!colors || !breaks) {
      stop('A sea without a bathymetric preset (sea=pale, blue or gray) needs colors=sea:... and breaks=sea:..., a color at each depth');
    }
    ramp = {breaks: [], colors: []};
  } else if (getSeaOptionNames().indexOf(sea) == -1) {
    stop('Unsupported sea= value:', opts.sea, '(expected ' + getSeaOptionNames().join(', ') + ')');
  } else if (custom && (sea == 'transparent' || sea == 'land')) {
    stop('colors=sea: and breaks=sea: work with a bathymetric sea= (pale, blue or gray), or without sea=');
  } else if (sea == 'transparent') {
    palette.sea = sea;
  } else if (sea != 'land') {
    name = getBathymetricSchemeNames().find(function(name) { return name.toLowerCase() == sea; });
    stops = getBathymetricStops(name);
    palette.sea = name;
    ramp = {
      breaks: stops.map(function(stop) { return +(stop.elevation / meters).toPrecision(6); }),
      colors: stops.map(function(stop) { return stop.color; })
    };
  }
  if (ramp) {
    ramp = custom ? customizeRamp(ramp, colors, breaks,
      {name: name ? 'sea=' + sea : 'the sea', colors: 'colors=sea:', breaks: 'breaks=sea:', stop: 'depth'}) : ramp;
    if (custom) palette.sea = 'custom';
    palette.seaRamp = {breaks: ramp.breaks, colors: ramp.colors};
  }
  if (palette.land == 'transparent') {
    if (!palette.seaRamp) stop('hypsometric=none needs colors for the sea: a bathymetric sea= or colors=sea:...');
    palette.breaks = palette.seaRamp.breaks.concat();
    palette.colors = palette.seaRamp.colors.concat();
  }
  return palette;
}

function getPresetName(key) {
  return getHypsometricSchemeNames().find(function(name) { return name.toLowerCase() == key; });
}

// Continuous colors at the preset's elevations, converted to the band's
// units; values beyond the end stops take the end colors
function getPresetRamp(name, meters) {
  var stops = getHypsometricStops(name);
  return {
    type: 'sequential',
    continuous: true,
    interpolation: 'oklch',
    breaks: stops.map(function(stop) { return +(stop.elevation / meters).toPrecision(6); }),
    colors: stops.map(function(stop) { return stop.color; }),
    nullColor: null
  };
}

// The presets' weights across @bbox, in the coordinates of @crs, on a grid
// of @cells (default FIELD_CELLS) on its long side, for drawing a blended
// palette:
// {bbox, width, height, weights, key}
//   weights: a number 0-255 for each preset but the last, for each cell,
//     row by row from the top (Desert, Steppe, Tropical, Temperate, Boreal;
//     Polar is the rest of 255). Cells at sea, or that can't be projected,
//     are filled in smoothly from the others (see fillFieldGaps()), which
//     matters where sea=land colors the sea.
//   preset: the preset with the most weight, by area
//   key: changes with the weights, for caching what is drawn with them
// Returns null if no cell is on land, or the CRS can't be inverted
export function getClimateWeightField(bbox, crs, cells) {
  var n = cells || FIELD_CELLS;
  var w = bbox[2] - bbox[0], h = bbox[3] - bbox[1];
  var width = Math.max(2, Math.round(w >= h ? n : n * w / h));
  var height = Math.max(2, Math.round(h >= w ? n : n * h / w));
  var names = getClimateSchemeNames();
  var lookups = [], areaSums = names.map(function() { return 0; }), landCells = 0;
  var toLngLat, weights, i, j, p, cell;
  if (!(w > 0 && h > 0)) return null;
  try {
    toLngLat = getProjTransform2(crs, parseCrsString('wgs84'));
  } catch(e) {
    return null;
  }
  for (j = 0; j < height; j++) {
    for (i = 0; i < width; i++) {
      p = projectSafely(toLngLat, bbox[0] + (i + 0.5) / width * w, bbox[3] - (j + 0.5) / height * h);
      cell = p ? getClimateWeights(p[0], p[1]) : null;
      if (cell) {
        landCells++;
        names.forEach(function(name, k) {
          areaSums[k] += cell[name] * Math.cos(p[1] * Math.PI / 180);
        });
      }
      lookups.push(cell);
    }
  }
  if (landCells === 0) return null;
  weights = fillFieldGaps(lookups.map(function(cell) {
    return cell ? names.slice(0, -1).map(function(name) { return cell[name]; }) : null;
  }), width, height, names.length - 1).map(function(val) { return Math.round(val * 255); });
  return {
    bbox: bbox.concat(),
    width: width,
    height: height,
    weights: weights,
    preset: names[areaSums.indexOf(Math.max.apply(null, areaSums))],
    key: getFieldKey(bbox, width, height, weights, crs)
  };
}

// Fills the null cells of a grid of arrays of @k values, and returns them all
// as a flat array: each gap first takes the mean of its filled neighbors, in
// waves outward from the filled cells, and then is smoothed (repeatedly
// averaging each gap cell's neighbors, with the filled cells held), so that
// the values fade from one coast to another rather than changing in steps.
var FILL_SMOOTHING_PASSES = 40;

function fillFieldGaps(cells, width, height, k) {
  var n = width * height;
  var vals = new Float64Array(n * k);
  var state = new Uint8Array(n); // 0: gap, 1: filled before this wave, 2: given
  var gaps = [], wave, next, i, j, pass;
  for (i = 0; i < n; i++) {
    if (cells[i]) {
      state[i] = 2;
      for (j = 0; j < k; j++) vals[i * k + j] = cells[i][j];
    } else {
      gaps.push(i);
    }
  }
  wave = gaps;
  while (wave.length > 0) {
    var filled = [];
    next = [];
    wave.forEach(function(i) {
      if (averageNeighbors(vals, state, i, width, height, k)) {
        filled.push(i);
      } else {
        next.push(i);
      }
    });
    if (filled.length === 0) break;
    filled.forEach(function(i) { state[i] = 1; });
    wave = next;
  }
  for (pass = 0; pass < FILL_SMOOTHING_PASSES; pass++) {
    gaps.forEach(function(i) {
      averageNeighbors(vals, state, i, width, height, k);
    });
  }
  return Array.from(vals);
}

// Sets cell i to the mean of its filled 8-neighbors (cells filled in the
// current wave are still gaps); returns false if it has none
function averageNeighbors(vals, state, i, width, height, k) {
  var x = i % width, y = (i - x) / width;
  var sum = new Float64Array(k), count = 0, dx, dy, j, m;
  for (dy = -1; dy <= 1; dy++) {
    for (dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0 || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
      j = i + dy * width + dx;
      if (state[j] === 0) continue;
      for (m = 0; m < k; m++) sum[m] += vals[j * k + m];
      count++;
    }
  }
  if (count === 0) return false;
  for (m = 0; m < k; m++) vals[i * k + m] = sum[m] / count;
  return true;
}

function projectSafely(proj, x, y) {
  var p;
  try {
    p = proj(x, y);
  } catch(e) {
    return null;
  }
  return p && isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[1]) <= 90 ? p : null;
}

function getFieldKey(bbox, width, height, weights, crs) {
  var hash = 0;
  for (var i = 0; i < weights.length; i++) {
    hash = (hash * 31 + weights[i]) | 0;
  }
  return [bbox.join(','), width, height, hash, crsToProj4(crs)].join('|');
}

// A blended palette's field is in the raster's coordinates, so it is made
// again when the raster is reprojected
export function updateHypsometricBlend(raster, crs) {
  var recipe = raster.view && raster.view.recipe;
  var palette = recipe && recipe.palette;
  var grid = getRasterGrid(raster);
  var field;
  if (!palette || !palette.blend || !grid) return;
  field = crs ? getClimateWeightField(grid.bbox, crs) : null;
  palette = Object.assign({}, palette);
  if (field) {
    palette.blend = Object.assign({}, palette.blend, {field: field});
  } else {
    delete palette.blend;
  }
  raster.view.recipe = Object.assign({}, recipe, {palette: palette});
}
