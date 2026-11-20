import { stop } from '../utils/mapshaper-logging';
import { parseColor } from '../color/color-utils';
import { getHypsometricSchemeNames, getClimateSchemeNames, getHypsometricStops } from '../color/hypsometric-schemes';
import { getClimateWeights } from '../color/hypsometric-climate';
import { getBathymetricSchemeNames, getBathymetricStops } from '../color/bathymetric-schemes';
import { getProjTransform2, parseCrsString, crsToProj4, isLatLngCRS, isInvertibleCRS } from '../crs/mapshaper-projections';
import { projectRasterGridForward } from './mapshaper-raster-reprojection';
import { getVerticalUnitMeters } from './mapshaper-vertical-units';
import { getInlandSeaSeeds } from './mapshaper-inland-seas';
import { getRasterGrid } from './mapshaper-raster-utils';
import { splitRampLists, listHasRampNames } from '../cli/mapshaper-option-parsing-utils';

// -classify land-colors=: the hypsometric presets as raster palettes, at their
// elevations (see hypsometric-schemes.mjs), a blend of the climate presets
// that varies across the map by climate (see hypsometric-climate.mjs), or
// custom colors at elevations of their own.
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
// land-breaks= moves a preset's elevations (every one, in the band's units);
// a blend's presets each have their own colors (land-colors=desert:...,polar:...),
// and share their elevations. land-classed gives one preset classes, from
// each elevation up to the next. sea-colors=, sea-breaks= and sea-classed do
// the same for the sea (see setRasterPaletteSea()). The older options
// (hypsometric=, sea=, classed, and lists named sea: in colors= and breaks=)
// still work (see readOlderElevationOptions()).

var BLEND_NAME = 'blended';
var NONE_NAME = 'none';
var CUSTOM_NAME = 'custom';
// cells on the long side of a weight field; the climate grid has 1-degree
// cells, so a world raster gets about that resolution
var FIELD_CELLS = 360;

export function getHypsometricOptionNames() {
  return getHypsometricSchemeNames().map(function(name) { return name.toLowerCase(); }).concat([BLEND_NAME, NONE_NAME]);
}

// The land's palette, from options read by getElevationOptions(): a preset,
// a blend, custom colors, or for a palette of only the sea ('none'), no
// colors (palette.land = 'transparent'), which setRasterPaletteSea() gives.
// palette.hypsometric is the preset, 'blended', 'custom' or 'none'.
// @crs: the raster's CRS, for a blend
export function getHypsometricPalette(raster, band, opts, crs) {
  var grid = getRasterGrid(raster);
  var key = opts.land;
  var names = opts.names;
  var meters = getVerticalUnitMeters(grid.verticalUnits) || 1;
  var field, preset, ramps, main;
  if (key == NONE_NAME) {
    return {band: band, type: 'sequential', continuous: true, interpolation: 'oklch', breaks: [], colors: [],
      nullColor: null, land: 'transparent', hypsometric: NONE_NAME};
  }
  if (key == CUSTOM_NAME) {
    main = customizeRamp(getCustomRamp(), opts.landColors, opts.landBreaks,
      {name: 'the land', colors: names.landColors, breaks: names.landBreaks});
    return Object.assign({band: band}, opts.landClassed ? getRampClasses(main) : main, {hypsometric: CUSTOM_NAME});
  }
  if (key != BLEND_NAME) {
    preset = getPresetName(key);
    main = customizeRamp(getPresetRamp(preset, meters), opts.landColors, opts.landBreaks,
      {name: names.land, colors: names.landColors, breaks: names.landBreaks});
    return Object.assign({band: band}, opts.landClassed ? getRampClasses(main) : main, {hypsometric: preset});
  }
  field = crs ? getClimateWeightField(grid.bbox, crs) : null;
  if (!field) {
    stop(names.land + ' needs a raster with a known projection, on land');
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

// -classify's elevation colors, from land-colors=, land-breaks=,
// land-classed, sea-colors=, sea-breaks= and sea-classed, or the older
// options (see readOlderElevationOptions()), as a copy of the options with:
//   land          a land preset (in lower case), 'blended', 'custom' (colors
//                 at land-breaks=), 'none' (only the sea is colored), or null
//                 for colors given by colors= (or no colors)
//   landColors    custom colors, or (older options) a preset's, recolored
//   blendColors   {preset: colors} for a blend's recolored presets (lower case)
//   landBreaks    every elevation, in the band's units
//   landClassed
//   sea           'transparent', 'land', a bathymetric preset (in lower case),
//                 'custom', or null for the default (transparent with land
//                 colors, otherwise land)
//   seaColors, seaBreaks, seaClassed
//   names         the options as given, for messages
// The older options' colors= and breaks= are the land's lists of colors= and
// breaks=, without the sea's or a blend's.
export function getElevationOptions(opts) {
  var older = ['hypsometric', 'sea', 'classed'].filter(function(key) { return key in opts; });
  var newer = ['land_colors', 'land_breaks', 'land_classed', 'sea_colors', 'sea_breaks', 'sea_classed'].filter(function(key) {
    return key in opts;
  });
  var named = listHasRampNames(opts.colors) || listHasRampNames(opts.breaks);
  if (newer.length > 0 && (older.length > 0 || named)) {
    stop((older.length > 0 ? older[0] + (older[0] == 'classed' ? '' : '=') : 'Named lists in colors= and breaks=') +
      ' and ' + newer[0].replace('_', '-') + (/classed/.test(newer[0]) ? '' : '=') +
      ' are two ways of giving elevation colors; use land-colors=, sea-colors= and their options');
  }
  return older.length > 0 || named ? readOlderElevationOptions(opts) : readElevationOptions(opts);
}

function readElevationOptions(opts) {
  var out = Object.assign({}, opts, {land: null, sea: null, blendColors: null,
    landColors: null, landBreaks: opts.land_breaks || null, landClassed: !!opts.land_classed,
    seaColors: null, seaBreaks: opts.sea_breaks || null, seaClassed: !!opts.sea_classed,
    names: {land: 'land-colors=', landColors: 'land-colors=', landBreaks: 'land-breaks=',
      blendColors: 'land-colors=', sea: 'sea-colors=', seaColors: 'sea-colors=', seaBreaks: 'sea-breaks='}});
  if (opts.land_colors && opts.colors) {
    stop('land-colors= and colors= both give the land\'s colors; use one of them');
  }
  ['land', 'sea'].forEach(function(side) {
    if (!opts[side + '_colors'] && (opts[side + '_breaks'] || opts[side + '_classed'])) {
      stop(side + '-' + (opts[side + '_breaks'] ? 'breaks=' : 'classed') + ' works with ' + side + '-colors=');
    }
  });
  if (opts.land_colors) {
    readLandColors(opts.land_colors, out);
  } else if (opts.sea_colors && !opts.colors) {
    out.land = NONE_NAME;
  }
  if (opts.sea_colors) readSeaColors(opts.sea_colors, out);
  return out;
}

// A preset, a blend's recolored presets (desert:...,polar:..., after
// 'blended' or not), or custom colors, which need their elevations
function readLandColors(list, out) {
  var climate = getClimateSchemeNames().map(function(name) { return name.toLowerCase(); });
  var presets = getLandPresetKeys();
  var lists, key;
  if (listHasRampNames(list)) {
    lists = splitRampLists(list);
    if (lists[''] && (lists[''].length > 1 || String(lists[''][0]).toLowerCase() != BLEND_NAME)) {
      stop('land-colors= takes colors by preset for a blend (e.g. land-colors=desert:...,polar:...), without other colors');
    }
    delete lists[''];
    Object.keys(lists).forEach(function(name) {
      if (!climate.includes(name)) {
        stop('Unknown name in land-colors=: ' + name + ' (expected ' + climate.join(', ') + ')');
      }
    });
    out.land = BLEND_NAME;
    out.names.land = 'land-colors=' + BLEND_NAME;
    out.blendColors = lists;
  } else if (list.length == 1) {
    key = String(list[0]).toLowerCase();
    if (!presets.includes(key)) {
      stop(parseColor(key) ? 'land-colors= needs two or more colors, or the name of a preset' :
        'Unknown land-colors= value: ' + list[0] + ' (expected ' + presets.join(', ') + ', or a list of colors)');
    }
    out.land = key;
    out.names.land = 'land-colors=' + key;
  } else {
    if (!out.landBreaks) stop('land-colors= with a list of colors needs land-breaks=, an elevation for each color');
    out.land = CUSTOM_NAME;
    out.landColors = list;
  }
  if (out.landClassed && out.land == BLEND_NAME) {
    stop('land-classed works with one preset, not a blend');
  }
}

// transparent, land, a bathymetric preset, or custom colors, which need
// their depths
function readSeaColors(list, out) {
  var names = getSeaOptionNames();
  var key;
  if (listHasRampNames(list)) {
    stop('sea-colors= takes a preset or a list of colors, without names');
  } else if (list.length == 1) {
    key = String(list[0]).toLowerCase();
    if (!names.includes(key)) {
      stop(parseColor(key) ? 'sea-colors= needs two or more colors, or the name of a preset' :
        'Unknown sea-colors= value: ' + list[0] + ' (expected ' + names.join(', ') + ', or a list of colors)');
    }
    out.sea = key;
  } else {
    if (!out.seaBreaks) stop('sea-colors= with a list of colors needs sea-breaks=, a depth for each color');
    out.sea = CUSTOM_NAME;
    out.seaColors = list;
  }
  if ((out.sea == 'transparent' || out.sea == 'land') && (out.seaBreaks || out.seaClassed)) {
    stop((out.seaBreaks ? 'sea-breaks=' : 'sea-classed') + ' works with sea colors, not sea-colors=' + out.sea);
  }
}

// The older options: hypsometric= (a land preset, blended, or none), colors=
// and breaks= (with hypsometric=, the land's; and lists named by the
// preset, a blend's presets or sea, see splitRampLists()), classed, and sea=
// (with sea:... lists, which also work without a preset, custom colors).
function readOlderElevationOptions(opts) {
  var key = opts.hypsometric ? String(opts.hypsometric).toLowerCase() : null;
  var climate = getClimateSchemeNames().map(function(name) { return name.toLowerCase(); });
  var out = Object.assign({}, opts, {land: key, sea: null, blendColors: null, landColors: null, landBreaks: null,
    landClassed: !!opts.classed, seaColors: null, seaBreaks: null, seaClassed: false,
    names: {land: 'hypsometric=' + key, landColors: 'colors=', landBreaks: 'breaks=',
      blendColors: 'colors=', sea: 'sea=', seaColors: 'colors=sea:', seaBreaks: 'breaks=sea:'}});
  var ramps = {colors: {}, breaks: {}};
  var sea;
  if (key && getHypsometricOptionNames().indexOf(key) == -1) {
    stop('Unknown hypsometric= value:', opts.hypsometric, '(expected ' + getHypsometricOptionNames().join(', ') + ')');
  }
  if (opts.classed && !key) {
    stop('classed works with hypsometric=; other colors are classes unless they are continuous');
  }
  if (opts.classed && (key == NONE_NAME || key == BLEND_NAME)) {
    stop('classed works with one preset, not hypsometric=' + key);
  }
  ['colors', 'breaks'].forEach(function(opt) {
    var lists = splitRampLists(opts[opt]);
    delete out[opt];
    Object.keys(lists || {}).forEach(function(name) {
      if (name === '' || name == key && key != BLEND_NAME) {
        if (out[opt]) stop(opt + '= gives the list of hypsometric=' + key + ' twice, with and without its name');
        out[opt] = lists[name];
      } else if (name == 'sea' || opt == 'colors' && key == BLEND_NAME && climate.includes(name)) {
        ramps[opt][name] = lists[name];
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
  if (key == NONE_NAME && (out.colors || out.breaks)) {
    stop('hypsometric=none colors only the sea; name its lists, e.g. colors=sea:...');
  }
  if (key == BLEND_NAME && out.colors) {
    stop('hypsometric=blended takes colors for each preset, e.g. colors=desert:...,polar:...');
  }
  if (key) {
    out.landColors = out.colors || null;
    out.landBreaks = out.breaks || null;
    delete out.colors;
    delete out.breaks;
  }
  if (key == BLEND_NAME) {
    delete ramps.colors.sea;
    out.blendColors = ramps.colors;
  }
  out.seaColors = ramps.colors.sea || null;
  out.seaBreaks = ramps.breaks.sea || null;
  sea = opts.sea ? String(opts.sea).toLowerCase() : null;
  if (out.seaColors || out.seaBreaks || sea == CUSTOM_NAME) {
    if ((!sea || sea == CUSTOM_NAME) && (!out.seaColors || !out.seaBreaks)) {
      stop('A sea without a bathymetric preset (sea=pale, blue or gray) needs colors=sea:... and breaks=sea:..., a color at each depth');
    }
    if (sea == 'transparent' || sea == 'land') {
      stop('colors=sea: and breaks=sea: work with a bathymetric sea= (pale, blue or gray), or without sea=');
    }
    sea = sea || CUSTOM_NAME;
  }
  if (sea && sea != CUSTOM_NAME && getSeaOptionNames().indexOf(sea) == -1) {
    stop('Unsupported sea= value:', opts.sea, '(expected ' + getSeaOptionNames().join(', ') + ')');
  }
  out.sea = sea;
  return out;
}

function getLandPresetKeys() {
  return getHypsometricSchemeNames().map(function(name) { return name.toLowerCase(); }).concat([BLEND_NAME]);
}

function getBlendRamps(meters, opts) {
  var names = getClimateSchemeNames();
  var colors = opts.blendColors || {};
  return names.map(function(name) {
    var key = name.toLowerCase();
    var ramp = customizeRamp(getPresetRamp(name, meters), colors[key], opts.landBreaks,
      {name: opts.names.land, colors: opts.names.blendColors + key + ':', breaks: opts.names.landBreaks, fixed: true});
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
// last stop. stops keeps the first stop, which isn't a break.
function getRampClasses(ramp) {
  var classes = Object.assign({}, ramp, {continuous: false, breaks: ramp.breaks.slice(1), stops: ramp.breaks.concat()});
  delete classes.interpolation;
  return classes;
}

export function getSeaOptionNames() {
  return ['transparent', 'land'].concat(getBathymetricSchemeNames().map(function(name) {
    return name.toLowerCase();
  }));
}

// -classify sea-colors=: what a palette does with the sea of an elevation
// raster (see mapshaper-raster-sea-mask.mjs). Land colors (land-colors=)
// leave it out by default.
//   transparent  palette.sea = 'transparent': the sea is not drawn
//   land         (no palette.sea) the sea takes the palette's colors
//   a bathymetric preset (see bathymetric-schemes.mjs): palette.sea is its
//                name, and palette.seaRamp = {breaks, colors} its depths, in
//                the band's units, which color the sea continuously
//   custom colors, at the depths of sea-breaks=: palette.sea is 'custom'
// sea-breaks= also moves a preset's depths, which makes it custom too.
// sea-classed gives the sea classes (seaRamp.classed), which mirror the
// land's: from each depth down to the next (see getRasterSeaTable()). A
// palette of only the sea takes the sea's colors as its own, for anything
// that draws it without a sea. palette.seaSeeds are points in the inland
// seas, in the raster's coordinates (see getInlandSeaSeeds()), or null if
// its CRS is unknown.
// @opts: options from getElevationOptions()
// @crs: the raster's CRS, or null
export function setRasterPaletteSea(palette, raster, opts, crs) {
  var names = opts.names;
  var sea = opts.sea || (opts.land ? 'transparent' : 'land');
  var custom = !!(opts.seaColors || opts.seaBreaks);
  var meters = getVerticalUnitMeters(getRasterGrid(raster).verticalUnits) || 1;
  var name, stops, ramp;
  if (sea == CUSTOM_NAME) {
    ramp = {breaks: [], colors: []};
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
    ramp = custom ? customizeRamp(ramp, opts.seaColors, opts.seaBreaks,
      {name: name ? names.sea + sea : 'the sea', colors: names.seaColors, breaks: names.seaBreaks, stop: 'depth'}) : ramp;
    if (custom) palette.sea = CUSTOM_NAME;
    palette.seaRamp = {breaks: ramp.breaks, colors: ramp.colors};
    if (opts.seaClassed) palette.seaRamp.classed = true;
  }
  if (palette.sea) {
    palette.seaSeeds = getInlandSeaSeeds(crs || null);
  }
  if (palette.land == 'transparent') {
    if (!palette.seaRamp) stop('A palette of only the sea needs sea colors: sea-colors=pale, blue, gray, or a list of colors');
    palette.breaks = palette.seaRamp.classed ? palette.seaRamp.breaks.slice(0, -1) : palette.seaRamp.breaks.concat();
    palette.colors = palette.seaRamp.colors.concat();
    if (palette.seaRamp.classed) {
      palette.continuous = false;
      delete palette.interpolation;
    }
  }
  return palette;
}

function getPresetName(key) {
  return getHypsometricSchemeNames().find(function(name) { return name.toLowerCase() == key; });
}

// Continuous colors without stops, for custom colors to fill in
function getCustomRamp() {
  return {type: 'sequential', continuous: true, interpolation: 'oklch', breaks: [], colors: [], nullColor: null};
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
// A CRS without an inverse gets its field by projecting the climate data
// forward (see getForwardClimateWeightField()).
// Returns null if no cell is on land. A field depends only on the arguments
// and is slow to make (mostly filling in the sea), so the last few are kept
// and shared; e.g. each step of the GUI's lightness slider runs -classify
// again. Callers must not modify them.
var FIELD_CACHE_SIZE = 4;
var fieldCache = [];

export function getClimateWeightField(bbox, crs, cells) {
  var key, entry, field;
  try {
    key = [bbox.join(','), crsToProj4(crs), cells || FIELD_CELLS].join('|');
  } catch(e) {
    key = null;
  }
  entry = key === null ? null : fieldCache.find(function(o) { return o.key == key; });
  if (entry) return entry.field;
  field = makeClimateWeightFieldOfBbox(bbox, crs, cells);
  if (key !== null) {
    fieldCache.unshift({key: key, field: field});
    fieldCache.length = Math.min(fieldCache.length, FIELD_CACHE_SIZE);
  }
  return field;
}

function makeClimateWeightFieldOfBbox(bbox, crs, cells) {
  var n = cells || FIELD_CELLS;
  var w = bbox[2] - bbox[0], h = bbox[3] - bbox[1];
  var width = Math.max(2, Math.round(w >= h ? n : n * w / h));
  var height = Math.max(2, Math.round(h >= w ? n : n * h / w));
  var names = getClimateSchemeNames();
  var lookups = [], areaSums = names.map(function() { return 0; }), landCells = 0;
  var toLngLat, i, j, p, cell;
  if (!(w > 0 && h > 0)) return null;
  if (!isLatLngCRS(crs) && !isInvertibleCRS(crs)) {
    return getForwardClimateWeightField(bbox, crs, width, height);
  }
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
  return makeClimateWeightField(bbox, crs, width, height, lookups.map(function(cell) {
    return cell ? names.slice(0, -1).map(function(name) { return cell[name]; }) : null;
  }), areaSums);
}

// @cells: the weights of the presets but the last, for each cell, or null for
//   cells to fill (see fillFieldGaps())
// @areaSums: the weight of each preset across the field
function makeClimateWeightField(bbox, crs, width, height, cells, areaSums) {
  var names = getClimateSchemeNames();
  var weights = fillFieldGaps(cells, width, height, names.length - 1).map(function(val) {
    return Math.round(val * 255);
  });
  return {
    bbox: bbox.concat(),
    width: width,
    height: height,
    weights: weights,
    preset: names[areaSums.indexOf(Math.max.apply(null, areaSums))],
    key: getFieldKey(bbox, width, height, weights, crs)
  };
}

// For a CRS without an inverse (e.g. Dymaxion), whose cells can't be placed
// on the globe: the climate data, as a lon-lat raster (see getClimateGrid()),
// projected forward onto the field's cells, the way -proj projects a raster.
// Sea cells are left out of the interpolation, so the projected grid's
// coverage is the land; cells at sea, or outside the projection's outline,
// are filled in as in getClimateWeightField(). The preset is chosen by
// projected area.
export function getForwardClimateWeightField(bbox, crs, width, height) {
  var names = getClimateSchemeNames();
  var k = names.length - 1;
  var areaSums = names.map(function() { return 0; });
  var cells = [], landCells = 0;
  var grid, i, j, vals, rest;
  try {
    grid = projectRasterGridForward(getClimateGrid(), parseCrsString('wgs84'), crs, {
      output_bbox: bbox, output_width: width, output_height: height,
      resampling: 'bilinear', raster_mesh_interval: CLIMATE_MESH_INTERVAL, fill_uncovered: false, fill_layout: false
    });
  } catch(e) {
    return null;
  }
  for (i = 0; i < width * height; i++) {
    if (!grid.coverage[i]) {
      cells.push(null);
      continue;
    }
    vals = [];
    rest = 1;
    for (j = 0; j < k; j++) {
      vals.push(grid.samples[i * k + j]);
      areaSums[j] += vals[j];
      rest -= vals[j];
    }
    areaSums[k] += rest;
    cells.push(vals);
    landCells++;
  }
  if (landCells === 0) return null;
  return makeClimateWeightField(bbox, crs, width, height, cells, areaSums);
}

// mesh vertices every 2 degrees, about as far as the climate data is
// interpolated between its 1-degree cells
var CLIMATE_MESH_INTERVAL = 2;
var climateGrid = null;

// The weights of the presets but the last (see getClimateWeights()), as a
// lon-lat raster of the climate data's 1-degree cells, with the land as its
// coverage
function getClimateGrid() {
  var names = getClimateSchemeNames();
  var k = names.length - 1;
  var width = 360, height = 180;
  var samples, coverage, r, c, i, j, cell;
  if (climateGrid) return climateGrid;
  samples = new Float32Array(width * height * k);
  coverage = new Uint8Array(width * height);
  for (r = 0; r < height; r++) {
    for (c = 0; c < width; c++) {
      cell = getClimateWeights(-179.5 + c, 89.5 - r);
      if (!cell) continue;
      i = r * width + c;
      coverage[i] = 1;
      for (j = 0; j < k; j++) samples[i * k + j] = cell[names[j]];
    }
  }
  climateGrid = {
    width: width, height: height, bands: k, pixelType: 'float32',
    samples: samples, coverage: coverage, nodata: null,
    bbox: [-180, -90, 180, 90], transform: [1, 0, -180, 0, -1, 90]
  };
  return climateGrid;
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
  var sum = new Float64Array(k); // scratch for averageNeighbors()
  var gaps = [], wave, next, filled, i, j, pass;
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
    filled = [];
    next = [];
    for (j = 0; j < wave.length; j++) {
      if (averageNeighbors(vals, state, wave[j], width, height, k, sum)) {
        filled.push(wave[j]);
      } else {
        next.push(wave[j]);
      }
    }
    if (filled.length === 0) break;
    for (j = 0; j < filled.length; j++) state[filled[j]] = 1;
    wave = next;
  }
  for (pass = 0; pass < FILL_SMOOTHING_PASSES; pass++) {
    for (j = 0; j < gaps.length; j++) {
      averageNeighbors(vals, state, gaps[j], width, height, k, sum);
    }
  }
  return Array.from(vals);
}

// Sets cell i to the mean of its filled 8-neighbors (cells filled in the
// current wave are still gaps); returns false if it has none.
// @sum: scratch space for k values
function averageNeighbors(vals, state, i, width, height, k, sum) {
  var x = i % width, y = (i - x) / width;
  var count = 0, dx, dy, j, m;
  for (m = 0; m < k; m++) sum[m] = 0;
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

// A blended palette's field and the sea's seeds are in the raster's
// coordinates, so they are made again when the raster is reprojected
export function updateRasterPaletteGeography(raster, crs) {
  var recipe = raster.view && raster.view.recipe;
  var palette = recipe && recipe.palette;
  var grid = getRasterGrid(raster);
  var field;
  if (!palette || !grid || !palette.blend && !palette.sea) return;
  palette = Object.assign({}, palette);
  if (palette.blend) {
    field = crs ? getClimateWeightField(grid.bbox, crs) : null;
    if (field) {
      palette.blend = Object.assign({}, palette.blend, {field: field});
    } else {
      delete palette.blend;
    }
  }
  if (palette.sea) {
    palette.seaSeeds = getInlandSeaSeeds(crs || null);
  }
  raster.view.recipe = Object.assign({}, recipe, {palette: palette});
}
