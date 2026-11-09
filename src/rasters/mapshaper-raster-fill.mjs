// Fills the pixels of a raster grid that hold no content: pixels that -proj
// could not reach from the source raster, or that -clip removed. The grid's
// coverage mask marks them (0 = empty).
//
// By default, empty pixels are made transparent, in the way that survives
// export: with the raster's nodata value, or for an 8-bit image without one,
// with an alpha band. A raster that needs a nodata value and has none gets
// one that the data does not use. nodata-color=<color> paints them instead.

import { parseColor } from '../color/color-utils';
import { stop, message, warnOnce } from '../utils/mapshaper-logging';
import { getSampleArrayRange, rasterSamplesAreFloat } from './mapshaper-raster-grid';

var FLOAT_NODATA_VALUES = [-9999, -3.4028234663852886e38];

export function rasterAppearsCategorical(raster) {
  var grid = raster && (raster.grid || raster);
  var recipe = raster && raster.view && raster.view.recipe || {};
  var derivation = raster && raster.derivation || {};
  return raster && raster.interpretation == 'categorical' ||
    grid && grid.colorModel == 'palette' ||
    recipe.type == 'palette' ||
    recipe.type == 'categorical' ||
    derivation.type == 'palette' ||
    derivation.type == 'categorical';
}

// Whether empty pixels need a numeric nodata value rather than a color, so
// that they are not mistaken for data. This is a separate question from the
// resampling method: elevation data (raster-type=continuous) wants numeric
// nodata AND bilinear resampling, a combination that a single
// image/categorical switch could not express.
export function rasterUsesNumericNodataFill(raster) {
  return !!raster && raster.interpretation == 'continuous' ||
    rasterAppearsCategorical(raster);
}

// Modifies @grid in place: an alpha band may be added, and grid.nodata may
// be set.
export function fillEmptyRasterPixels(grid, raster, opts) {
  var fill;
  if (!grid.coverage || !gridHasEmptyPixels(grid)) return;
  fill = getEmptyPixelFill(grid, raster, opts || {});
  if (fill.color) {
    fillWithColor(grid, raster, fill.color);
  } else if (fill.alpha) {
    fillWithAlpha(grid);
  } else {
    fillWithValue(grid, fill.value);
    if (fill.assigned) grid.nodata = fill.value;
  }
}

// Keeps the display recipe in step with a grid that gained an alpha band.
export function updateRasterViewForGrid(raster) {
  var grid = raster.grid;
  var recipe = raster.view && raster.view.recipe;
  var derivation = raster.derivation;
  if (!grid || grid.bands != 4 || !grid.sampleBands || grid.sampleBands.length != 4) return;
  if (recipe && recipe.bands && recipe.bands.length < 4) {
    if (recipe.type == 'gray') recipe.type = 'rgb';
    recipe.bands = grid.sampleBands.concat();
  }
  if (derivation && derivation.bands && derivation.bands.length < 4) {
    if (derivation.type == 'gray') derivation.type = 'rgb';
    derivation.bands = grid.sampleBands.concat();
  }
}

function getEmptyPixelFill(grid, raster, opts) {
  var arg = opts.nodata_color || opts.nodataColor;
  var color, value;
  if (arg && String(arg).toLowerCase() != 'transparent') {
    color = parseColor(arg);
    if (!color) stop('Unsupported nodata-color:', arg);
    return {color: color};
  }
  if (gridHasNodataValue(grid)) {
    return {value: grid.nodata};
  }
  if (canAddAlphaBand(grid, raster) || rasterHasAlphaBand(grid, raster)) {
    return {alpha: true};
  }
  value = findUnusedSampleValue(grid);
  if (value === null) {
    warnOnce('This raster has no nodata value, and no unused value is available to mark empty pixels, so they will be 0');
    return {value: 0};
  }
  message('Using ' + value + ' as the nodata value for empty pixels');
  return {value: value, assigned: true};
}

function gridHasEmptyPixels(grid) {
  var coverage = grid.coverage;
  for (var i = 0, n = grid.width * grid.height; i < n; i++) {
    if (!coverage[i]) return true;
  }
  return false;
}

function gridHasNodataValue(grid) {
  return grid.nodata !== null && grid.nodata !== undefined && isFinite(grid.nodata);
}

function gridIsEightBit(grid) {
  return grid.samples instanceof Uint8Array || grid.samples instanceof Uint8ClampedArray;
}

// Two-band images are not displayed as gray + alpha, so a one-band image
// becomes RGBA.
function canAddAlphaBand(grid, raster) {
  return gridIsEightBit(grid) && (grid.bands == 1 || grid.bands == 3) &&
    !rasterUsesNumericNodataFill(raster);
}

function rasterHasAlphaBand(grid, raster) {
  return gridIsEightBit(grid) && grid.bands == 4 && !rasterUsesNumericNodataFill(raster);
}

function addAlphaBand(grid) {
  var n = grid.width * grid.height;
  var src = grid.samples;
  var bands = grid.bands;
  var samples = new src.constructor(n * 4);
  var i, j, k;
  for (i = 0, j = 0, k = 0; i < n; i++, j += bands, k += 4) {
    if (bands == 1) {
      samples[k] = samples[k + 1] = samples[k + 2] = src[j];
    } else {
      samples[k] = src[j];
      samples[k + 1] = src[j + 1];
      samples[k + 2] = src[j + 2];
    }
    samples[k + 3] = 255;
  }
  grid.samples = samples;
  grid.bands = 4;
  grid.sampleBands = [0, 1, 2, 3];
}

function fillWithAlpha(grid) {
  var coverage = grid.coverage;
  var samples, i, k, n;
  if (grid.bands != 4) addAlphaBand(grid);
  samples = grid.samples;
  for (i = 0, n = grid.width * grid.height; i < n; i++) {
    if (coverage[i]) continue;
    k = i * 4;
    samples[k] = samples[k + 1] = samples[k + 2] = samples[k + 3] = 0;
  }
}

function fillWithColor(grid, raster, color) {
  var alpha = Math.round((color.a == null ? 1 : color.a) * 255);
  var gray = Math.round(0.299 * color.r + 0.587 * color.g + 0.114 * color.b);
  var coverage = grid.coverage;
  var samples, bands, i, k, n;
  if (alpha < 255 && canAddAlphaBand(grid, raster)) addAlphaBand(grid);
  samples = grid.samples;
  bands = grid.bands;
  for (i = 0, n = grid.width * grid.height; i < n; i++) {
    if (coverage[i]) continue;
    k = i * bands;
    if (bands == 1) {
      samples[k] = gray;
    } else {
      samples[k] = color.r;
      samples[k + 1] = color.g;
      samples[k + 2] = color.b;
      if (bands > 3) samples[k + 3] = alpha;
    }
  }
}

function fillWithValue(grid, value) {
  var coverage = grid.coverage;
  var samples = grid.samples;
  var bands = grid.bands;
  for (var i = 0, n = grid.width * grid.height; i < n; i++) {
    if (!coverage[i]) samples.fill(value, i * bands, i * bands + bands);
  }
}

// Returns a value that no sample of the grid holds (so that no real pixel
// becomes nodata), or null if there is none.
export function findUnusedSampleValue(grid) {
  var samples = grid.samples;
  var range, stats, i;
  if (rasterSamplesAreFloat(samples)) {
    for (i = 0; i < FLOAT_NODATA_VALUES.length; i++) {
      if (!arrayIncludes(samples, FLOAT_NODATA_VALUES[i])) return FLOAT_NODATA_VALUES[i];
    }
    return null;
  }
  range = getSampleArrayRange(samples);
  stats = getMinMax(samples);
  if (range.min < 0 && stats.min > range.min) return range.min;
  if (stats.max < range.max) return range.max;
  if (stats.min > range.min) return range.min;
  if (range.max - range.min < 65536) return findGapInIntegerRange(samples, range);
  return null;
}

function arrayIncludes(samples, value) {
  for (var i = 0, n = samples.length; i < n; i++) {
    if (samples[i] === value) return true;
  }
  return false;
}

function getMinMax(samples) {
  var min = Infinity, max = -Infinity, val;
  for (var i = 0, n = samples.length; i < n; i++) {
    val = samples[i];
    if (val < min) min = val;
    if (val > max) max = val;
  }
  return {min: min, max: max};
}

function findGapInIntegerRange(samples, range) {
  var used = new Uint8Array(range.max - range.min + 1);
  var i;
  for (i = 0; i < samples.length; i++) {
    used[samples[i] - range.min] = 1;
  }
  for (i = 0; i < used.length; i++) {
    if (!used[i]) return i + range.min;
  }
  return null;
}
