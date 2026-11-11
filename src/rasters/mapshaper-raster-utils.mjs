import { Bounds } from '../geom/mapshaper-bounds';
import {
  rasterPixelIsValid,
  rasterSamplesAreFloat,
  samplesAreNodataAtOffset
} from './mapshaper-raster-grid';
import utils from '../utils/mapshaper-utils';
import { formatVerticalUnits } from './mapshaper-vertical-units';
import { stop, warn } from '../utils/mapshaper-logging';
import { runningInBrowser } from '../mapshaper-env';
import { updateRasterViewForGrid } from './mapshaper-raster-fill';
import { copyRasterSourceStatus } from './mapshaper-raster-source';
import { getRasterDisplayBands, getRasterDisplayBandsKey, rasterGridDisplaysColor } from './mapshaper-raster-display-bands';
import { getRasterPaletteTable, rasterPaletteIsCategorical } from './mapshaper-raster-palette';
import {
  markLayerChanged,
  noteLayerWillChange
} from '../undo/mapshaper-undo-tracking';

var DEFAULT_MAX_PREVIEW_PIXELS = 4e6;
var MAX_EXACT_AVERAGE_PIXELS = 256;
var MAX_APPROX_AVERAGE_STEPS = 16;

export function getRasterGrid(raster) {
  return raster && (raster.grid || raster);
}

// Grid band index of a band= option. Bands are numbered from 1, as in the
// source file, so a grid that holds only some of the file's bands
// (grid.sampleBands) finds the band by its file number. Without @band, the
// grid's first band.
export function getRasterGridBandIndex(grid, band) {
  var fileBands = grid.sampleBands || null;
  var i;
  if (band === undefined || band === null) return 0;
  if (band === 0) {
    stop('Invalid band=0; bands are numbered from 1');
  }
  if (!(band >= 1) || band !== Math.floor(band)) {
    stop('Invalid band=' + band);
  }
  i = fileBands ? fileBands.indexOf(band - 1) : band - 1;
  if (i < 0 || i >= grid.bands) {
    stop('Raster layer does not have band ' + band + '; ' + describeGridBands(grid));
  }
  return i;
}

// e.g. "this raster has 1 band", "this raster has bands 1, 4 and 5"
function describeGridBands(grid) {
  var nums = utils.range(grid.bands).map(function(i) {
    return grid.sampleBands && grid.sampleBands[i] >= 0 ? grid.sampleBands[i] + 1 : i + 1;
  });
  var contiguous = nums.every(function(n, i) { return n == i + 1; });
  if (contiguous) {
    return 'this raster has ' + nums.length + (nums.length == 1 ? ' band' : ' bands');
  }
  return 'this raster has bands ' + (nums.length == 1 ? nums[0] :
    nums.slice(0, -1).join(', ') + ' and ' + nums[nums.length - 1]);
}

export function getRasterView(raster) {
  return raster && (raster.view || raster);
}

export function getRasterPreview(raster) {
  var view = getRasterView(raster);
  return view && (view.preview || raster.preview);
}

// The display opacity of a raster (view.recipe.opacity, set by -style
// opacity=), 0-1. It is applied when the raster is drawn, not to its pixels.
export function getRasterViewOpacity(raster) {
  var recipe = raster && raster.view && raster.view.recipe;
  var opacity = recipe ? recipe.opacity : null;
  return opacity >= 0 && opacity < 1 ? opacity : 1;
}

export function getRasterBBox(raster) {
  var grid = getRasterGrid(raster);
  return grid && grid.bbox || raster && raster.bbox || null;
}

export function getRasterTransform(raster) {
  var grid = getRasterGrid(raster);
  return grid && grid.transform || raster && raster.transform || null;
}

export function getRasterWidth(raster) {
  var grid = getRasterGrid(raster);
  return grid && grid.width || 0;
}

export function getRasterHeight(raster) {
  var grid = getRasterGrid(raster);
  return grid && grid.height || 0;
}

export function getRasterBandCount(raster) {
  var grid = getRasterGrid(raster);
  return grid && grid.bands || 0;
}

export function getRasterPixelType(raster) {
  var grid = getRasterGrid(raster);
  return grid && grid.pixelType || null;
}

export function copyRasterData(raster) {
  var copy = utils.extend({}, raster);
  if (raster.grid) {
    copy.grid = copyRasterGrid(raster.grid);
  }
  if (raster.view) {
    copy.view = copyRasterView(raster.view);
  }
  if (raster.derivation) {
    copy.derivation = utils.extend({}, raster.derivation);
    if (raster.derivation.bands) copy.derivation.bands = copyObjectOrArray(raster.derivation.bands);
  }
  if (raster.source) copy.source = utils.extend({}, raster.source);

  // Back-compat for the first raster model.
  if (raster.pixels) copy.pixels = copyTypedArray(raster.pixels);
  if (raster.preview) copy.preview = copyRasterPreview(raster.preview);
  if (raster.bbox) copy.bbox = raster.bbox.concat();
  if (raster.transform) copy.transform = copyObjectOrArray(raster.transform);
  return copy;
}

export function copyRasterGrid(grid) {
  var copy = utils.extend({}, grid);
  if (grid.samples) {
    copy.samples = copyTypedArray(grid.samples);
    copyRasterSourceStatus(grid, copy);
  }
  // The coverage mask is mutated in place by the reprojection code, so an
  // undo snapshot that shared it would track later edits.
  if (grid.coverage) copy.coverage = copyTypedArray(grid.coverage);
  if (grid.sampleBands) copy.sampleBands = grid.sampleBands.concat();
  if (grid.bbox) copy.bbox = grid.bbox.concat();
  if (grid.transform) copy.transform = copyObjectOrArray(grid.transform);
  return copy;
}

export function copyRasterView(view) {
  var copy = utils.extend({}, view);
  if (view.recipe) copy.recipe = copyObjectOrArray(view.recipe);
  if (view.preview) copy.preview = copyRasterPreview(view.preview);
  if (view.scalingStats) copy.scalingStats = copyObjectOrArray(view.scalingStats);
  return copy;
}

export function copyRasterPreview(preview) {
  var copy = utils.extend({}, preview);
  delete copy.canvas;
  if (preview.pixels) copy.pixels = copyTypedArray(preview.pixels);
  return copy;
}

export function copyTypedArray(arr) {
  if (Array.isArray(arr)) return arr.map(copyTypedArray);
  return arr && arr.slice ? arr.slice() : arr;
}

export function createRasterPreview(raster, opts) {
  opts = opts || {};
  var grid = getRasterGrid(raster);
  var recipe = getRasterViewRecipe(grid, raster.view && raster.view.recipe, opts);
  var stats = getRasterViewScalingStats(raster, recipe);
  var maxPixels = opts.maxPixels || opts.raster_max_pixels || opts.rasterMaxPixels || DEFAULT_MAX_PREVIEW_PIXELS;
  var scale = Math.min(1, Math.sqrt(maxPixels / (grid.width * grid.height)));
  var width = Math.max(1, Math.round(grid.width * scale));
  var height = Math.max(1, Math.round(grid.height * scale));
  return renderRasterPreview(grid, recipe, width, height, stats);
}

export function getRasterViewRecipe(grid, recipeArg, opts) {
  var recipe = Object.assign({}, recipeArg || {});
  var scaling = opts && opts.scaling || recipe.scaling || getDefaultRasterScaling(grid, recipe);
  var scaleRange = opts && (opts.scale_range || opts.scaleRange) || recipe.scaleRange;
  var percentileRange = opts && (opts.percentile_range || opts.percentileRange) || recipe.percentileRange;
  if (scaling != 'none' && scaling != 'minmax' && scaling != 'percentile') {
    stop('Unsupported raster scaling method:', scaling);
  }
  return Object.assign(recipe, {
    type: recipe.type || (rasterGridDisplaysColor(grid) ? 'rgb' : 'gray'),
    bands: recipe.bands || grid.sampleBands || null,
    scaling: scaling,
    scaleRange: parseRangeOption(scaleRange, [0, 100], 'scale-range'),
    percentileRange: parseRangeOption(percentileRange, [2, 98], 'percentile-range')
  });
}

export function renderRasterPreview(grid, recipe, width, height, statsArg) {
  recipe = getRasterViewRecipe(grid, recipe);
  if (useFastRawEightBitRendering(grid, recipe)) {
    return renderRawEightBitPreview(grid, width, height, null);
  }
  return renderRasterGridPreview(grid, recipe, width, height, statsArg || getRasterScalingStats(grid, recipe), null);
}

export function renderRasterViewportPreview(grid, recipe, bbox, width, height, statsArg) {
  recipe = getRasterViewRecipe(grid, recipe);
  if (!intersectBboxes(grid.bbox, bbox)) return null;
  if (useFastRawEightBitRendering(grid, recipe)) {
    return Object.assign(renderRawEightBitPreview(grid, width, height, bbox), {
      bbox: bbox.concat()
    });
  }
  return Object.assign(renderRasterGridPreview(grid, recipe, width, height, statsArg || getRasterScalingStats(grid, recipe), bbox), {
    bbox: bbox.concat()
  });
}

export function renderRasterExportPreview(raster, bbox, width, height, opts) {
  var grid = getRasterGrid(raster);
  var recipe = getRasterViewRecipe(grid, raster.view && raster.view.recipe, opts);
  var stats = getRasterViewScalingStats(raster, recipe);
  return renderRasterGridPreview(grid, recipe, width, height, stats, bbox, getRasterExportResamplingMethod(grid, bbox, width, height));
}

export function getRasterScalingStats(grid, recipe) {
  recipe = getRasterViewRecipe(grid, recipe);
  return getScalingStats(grid, recipe);
}

export function getRasterViewScalingStats(raster, recipeArg) {
  var grid = getRasterGrid(raster);
  var view = getRasterView(raster);
  var recipe = getRasterViewRecipe(grid, recipeArg || view && view.recipe);
  var key, cached, stats;
  if (recipe.scaling == 'none' || recipe.palette) return null;
  key = getRasterScalingStatsKey(grid, recipe);
  cached = view && view.scalingStats;
  if (cached && cached.key == key) return cached.stats;
  stats = getRasterScalingStats(grid, recipe);
  if (view) {
    view.scalingStats = {
      key: key,
      stats: stats
    };
  }
  return stats;
}

// Returns the band values and display color of the pixel containing a map
// coordinate, for readouts like the GUI's right-click menu, or null if the point
// falls outside the raster. Rotated grids are not supported, because pixels can
// only be located through the axis-aligned bbox.
// x, y: a point in the coordinate system of the raster's bbox
export function getRasterPixelAtMapXY(raster, x, y) {
  var grid = getRasterGrid(raster);
  var col, row, pixelId, offset, values, valid, isColor, band;
  if (!grid || !grid.samples || !grid.bbox || rasterGridIsRotated(grid)) return null;
  col = Math.floor(mapXToRasterPixel(grid, x));
  row = Math.floor(mapYToRasterPixel(grid, y));
  if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) return null;
  pixelId = row * grid.width + col;
  offset = pixelId * grid.bands;
  values = [];
  for (band = 0; band < grid.bands; band++) {
    values.push(grid.samples[offset + band]);
  }
  isColor = rasterGridDisplaysColor(grid);
  valid = rasterPixelIsValid(grid, pixelId);
  return {
    col: col,
    row: row,
    values: values,
    // 'gray', 'rgb' or 'rgba' if @values are the displayed channels, else null
    channels: getPixelChannels(grid),
    isColor: isColor,
    isFloat: rasterSamplesAreFloat(grid.samples),
    valid: valid,
    // e.g. 'ft', for the values of an elevation raster
    units: !isColor && grid.verticalUnits ? formatVerticalUnits(grid.verticalUnits) : null,
    // Only color images get a color, so that inspecting a measurement raster
    // does not trigger a scaling-stats scan of the whole grid.
    // [r, g, b, a] in the 0-255 range, for formatColor() or a canvas.
    color: isColor && valid ? getRasterPixelDisplayColor(raster, grid, pixelId) : null
  };
}

function getPixelChannels(grid) {
  if (grid.displayBands) return null;
  if (grid.bands == 1) return 'gray';
  if (grid.bands == 3) return 'rgb';
  if (grid.bands == 4) return 'rgba';
  return null;
}

// Returns [r, g, b, a] in the 0-255 range, using the same recipe and scaling as
// the preview renderer, so that a readout agrees with how the pixel is drawn.
function getRasterPixelDisplayColor(raster, grid, pixelId) {
  var view = getRasterView(raster);
  var recipe = getRasterViewRecipe(grid, view && view.recipe);
  var stats = getRasterViewScalingStats(raster, recipe);
  var sourceRange = recipe.scaling == 'none' ? getPixelTypeRange(grid.pixelType) : null;
  var displayRange = getDisplayRange(recipe.scaleRange);
  var offset = pixelId * grid.bands;
  var display = getRasterDisplayBands(grid);
  var color = display.color.map(function(band) {
    return scaleSample(grid.samples[offset + band], stats && stats[band], sourceRange, displayRange);
  });
  if (color.length == 1) color.push(color[0], color[0]);
  color.push(display.alpha > -1 ?
    scaleSample(grid.samples[offset + display.alpha], stats && stats[display.alpha], sourceRange, [0, 255]) : 255);
  return color;
}

// Float samples print with binary noise at full precision (a Float32 holding
// 1234.5678 prints as 1234.5677490234375), so they are rounded to the number of
// digits that the type can actually represent.
export function formatRasterSampleValue(val, isFloat) {
  if (val === null || val === undefined) return '';
  if (!isFinite(val)) return String(val); // NaN, Infinity
  if (!isFloat) return String(val);
  return String(+val.toPrecision(7));
}

function renderRasterGridPreview(grid, recipe, width, height, statsArg, sourceBbox, resamplingMethod) {
  if (recipe.palette) {
    return renderPaletteGridPreview(grid, recipe.palette, width, height, sourceBbox, resamplingMethod);
  }
  var samples = grid.samples;
  var bands = grid.bands;
  var noData = grid.nodata;
  var pixels = new Uint8ClampedArray(width * height * 4);
  var stats = statsArg || getScalingStats(grid, recipe);
  var sourceRange = recipe.scaling == 'none' ? getPixelTypeRange(grid.pixelType) : null;
  var displayRange = getDisplayRange(recipe.scaleRange);
  var display = getRasterDisplayBands(grid);
  var color = display.color, alpha = display.alpha;
  var src, dest, val, isNoData, j, band, sample;
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      dest = (y * width + x) * 4;
      if (resamplingMethod) {
        sample = getResampledRasterSample(grid, sourceBbox, x, y, width, height, resamplingMethod);
        isNoData = !sample.valid;
      } else {
        src = getPreviewSourceOffset(grid, sourceBbox, x, y, width, height, bands);
        sample = null;
        isNoData = noData !== null && noData !== undefined && allSamplesAreNoData(samples, src, bands, noData);
      }
      if (color.length == 1) {
        band = color[0];
        val = scaleSample(sample ? sample.values[band] : samples[src + band], stats && stats[band], sourceRange, displayRange);
        pixels[dest] = val;
        pixels[dest + 1] = val;
        pixels[dest + 2] = val;
      } else {
        for (j = 0; j < 3; j++) {
          band = color[j];
          pixels[dest + j] = scaleSample(sample ? sample.values[band] : samples[src + band], stats && stats[band], sourceRange, displayRange);
        }
      }
      pixels[dest + 3] = isNoData ? 0 : alpha > -1 ? scaleSample(sample ? sample.values[alpha] : samples[src + alpha], stats && stats[alpha], sourceRange, [0, 255]) : 255;
    }
  }
  return {
    width: width,
    height: height,
    bands: 4,
    pixelType: 'uint8',
    colorModel: 'rgba',
    pixels: pixels
  };
}

// Draws the palette's band in the palette's colors (see
// mapshaper-raster-palette.mjs). Pixels outside the grid's coverage or masked
// by its alpha band are transparent, and nodata pixels take the null color.
// Only the palette's band is resampled, and categories aren't resampled at
// all: averaging or interpolating class codes gives the codes of other classes.
function renderPaletteGridPreview(grid, palette, width, height, sourceBbox, resamplingMethod) {
  var samples = grid.samples;
  var bands = grid.bands;
  var band = getRasterGridBandIndex(grid, palette.band);
  var table = getRasterPaletteTable(palette);
  var rgba = table.rgba;
  var alpha = getRasterDisplayBands(grid).alpha;
  var coverage = grid.coverage || null;
  var method = rasterPaletteIsCategorical(palette) ? null : resamplingMethod;
  var pixels = new Uint8ClampedArray(width * height * 4);
  var src, val, i, dest;
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      src = getPreviewSourceOffset(grid, sourceBbox, x, y, width, height, bands);
      if (coverage && !coverage[src / bands] || alpha > -1 && samples[src + alpha] === 0) continue;
      val = method ? getResampledBandValue(grid, band, alpha, sourceBbox, x, y, width, height, method) :
        samples[src + band];
      if (isValidBandValue(val, grid.nodata)) {
        i = table.getIndex(val);
        if (i < 0) i = table.otherIndex;
      } else {
        i = table.nullIndex;
      }
      if (i < 0) continue;
      dest = (y * width + x) * 4;
      i *= 4;
      pixels[dest] = rgba[i];
      pixels[dest + 1] = rgba[i + 1];
      pixels[dest + 2] = rgba[i + 2];
      pixels[dest + 3] = rgba[i + 3];
    }
  }
  return {
    width: width,
    height: height,
    bands: 4,
    pixelType: 'uint8',
    colorModel: 'rgba',
    pixels: pixels
  };
}

// A one-band copy of @grid holding the band that @recipe's palette colors,
// for work that would otherwise process every band (e.g. reprojecting a GUI
// preview). Pixels masked by an alpha band are left out of its coverage.
// Returns @grid itself if there is no palette, or the grid has one band.
export function getRasterPaletteBandGrid(grid, recipe) {
  var palette = recipe && recipe.palette;
  var n = grid.width * grid.height;
  var band, alpha, samples, coverage, copy;
  if (!palette || grid.bands == 1) return grid;
  band = getRasterGridBandIndex(grid, palette.band);
  alpha = getRasterDisplayBands(grid).alpha;
  samples = new grid.samples.constructor(n);
  for (var i = 0; i < n; i++) {
    samples[i] = grid.samples[i * grid.bands + band];
  }
  coverage = grid.coverage || null;
  if (alpha > -1) {
    coverage = new Uint8Array(n);
    for (i = 0; i < n; i++) {
      coverage[i] = (!grid.coverage || grid.coverage[i]) && grid.samples[i * grid.bands + alpha] !== 0 ? 1 : 0;
    }
  }
  copy = Object.assign({}, grid, {
    bands: 1,
    samples: samples,
    sampleBands: [grid.sampleBands ? grid.sampleBands[band] : band]
  });
  delete copy.displayBands;
  if (coverage) copy.coverage = coverage;
  return copy;
}

// The value of one band at an output pixel, from the valid source pixels
// around it (see bandPixelIsValid()); NaN if none are valid
function getResampledBandValue(grid, band, alpha, bbox, x, y, width, height, method) {
  var bounds, p, x0, y0, x1, y1, tx, ty;
  if (method == 'average') {
    bounds = getRasterSourcePixelBounds(grid, bbox, x, y, width, height);
    return getSourcePixelBoundsArea(bounds) > MAX_EXACT_AVERAGE_PIXELS ?
      getApproxAverageBandValue(grid, band, alpha, bounds) :
      getAverageBandValue(grid, band, alpha, bounds);
  }
  p = getRasterSourcePixelCenter(grid, bbox, x, y, width, height);
  x0 = Math.max(0, Math.min(grid.width - 1, Math.floor(p.x)));
  y0 = Math.max(0, Math.min(grid.height - 1, Math.floor(p.y)));
  x1 = Math.min(grid.width - 1, x0 + 1);
  y1 = Math.min(grid.height - 1, y0 + 1);
  tx = Math.max(0, Math.min(1, p.x - x0));
  ty = Math.max(0, Math.min(1, p.y - y0));
  return getWeightedBandValue(grid, band, alpha,
    [y0 * grid.width + x0, y0 * grid.width + x1, y1 * grid.width + x0, y1 * grid.width + x1],
    [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty]);
}

function getWeightedBandValue(grid, band, alpha, pixelIds, weights) {
  var sum = 0, total = 0;
  for (var i = 0; i < pixelIds.length; i++) {
    if (weights[i] <= 0 || !bandPixelIsValid(grid, pixelIds[i], band, alpha)) continue;
    sum += grid.samples[pixelIds[i] * grid.bands + band] * weights[i];
    total += weights[i];
  }
  return total > 0 ? sum / total : NaN;
}

function getAverageBandValue(grid, band, alpha, bounds) {
  var x0 = Math.max(0, Math.floor(Math.min(bounds.x0, bounds.x1)));
  var x1 = Math.min(grid.width, Math.ceil(Math.max(bounds.x0, bounds.x1)));
  var y0 = Math.max(0, Math.floor(Math.min(bounds.y0, bounds.y1)));
  var y1 = Math.min(grid.height, Math.ceil(Math.max(bounds.y0, bounds.y1)));
  var sum = 0, total = 0;
  var weight, id;
  for (var sy = y0; sy < y1; sy++) {
    for (var sx = x0; sx < x1; sx++) {
      weight = getIntervalOverlap(bounds.x0, bounds.x1, sx, sx + 1) *
        getIntervalOverlap(bounds.y0, bounds.y1, sy, sy + 1);
      id = sy * grid.width + sx;
      if (weight <= 0 || !bandPixelIsValid(grid, id, band, alpha)) continue;
      sum += grid.samples[id * grid.bands + band] * weight;
      total += weight;
    }
  }
  return total > 0 ? sum / total : NaN;
}

function getApproxAverageBandValue(grid, band, alpha, bounds) {
  var xSteps = Math.min(MAX_APPROX_AVERAGE_STEPS, Math.max(1, Math.ceil(Math.abs(bounds.x1 - bounds.x0))));
  var ySteps = Math.min(MAX_APPROX_AVERAGE_STEPS, Math.max(1, Math.ceil(Math.abs(bounds.y1 - bounds.y0))));
  var sum = 0, count = 0;
  var sx, sy, id;
  for (var y = 0; y < ySteps; y++) {
    for (var x = 0; x < xSteps; x++) {
      sx = Math.max(0, Math.min(grid.width - 1, Math.floor(bounds.x0 + (x + 0.5) / xSteps * (bounds.x1 - bounds.x0))));
      sy = Math.max(0, Math.min(grid.height - 1, Math.floor(bounds.y0 + (y + 0.5) / ySteps * (bounds.y1 - bounds.y0))));
      id = sy * grid.width + sx;
      if (!bandPixelIsValid(grid, id, band, alpha)) continue;
      sum += grid.samples[id * grid.bands + band];
      count++;
    }
  }
  return count > 0 ? sum / count : NaN;
}

// A pixel's value in one band is valid if it isn't nodata or NaN, and the
// pixel is inside the grid's coverage and not masked by its alpha band
function bandPixelIsValid(grid, pixelId, band, alpha) {
  var src = pixelId * grid.bands;
  return isValidBandValue(grid.samples[src + band], grid.nodata) &&
    !(grid.coverage && !grid.coverage[pixelId]) &&
    !(alpha > -1 && grid.samples[src + alpha] === 0);
}

function getRasterExportResamplingMethod(grid, bbox, width, height) {
  var srcSize = getRasterSourcePixelSize(grid, bbox);
  return width < srcSize.width || height < srcSize.height ? 'average' : 'bilinear';
}

function getRasterSourcePixelSize(grid, bbox) {
  var rb = grid.bbox;
  return {
    width: Math.abs((bbox[2] - bbox[0]) / (rb[2] - rb[0]) * grid.width),
    height: Math.abs((bbox[3] - bbox[1]) / (rb[3] - rb[1]) * grid.height)
  };
}

function getResampledRasterSample(grid, bbox, x, y, width, height, method) {
  return method == 'average' ?
    getAverageRasterSample(grid, bbox, x, y, width, height) :
    getBilinearRasterSample(grid, bbox, x, y, width, height);
}

function getAverageRasterSample(grid, bbox, x, y, width, height) {
  var bounds = getRasterSourcePixelBounds(grid, bbox, x, y, width, height);
  if (getSourcePixelBoundsArea(bounds) > MAX_EXACT_AVERAGE_PIXELS) {
    return getApproxAverageRasterSample(grid, bounds);
  }
  var samples = grid.samples;
  var bands = grid.bands;
  var values = new Array(bands).fill(0);
  var total = 0;
  var src, weight;
  var x0 = Math.max(0, Math.floor(bounds.x0));
  var x1 = Math.min(grid.width, Math.ceil(bounds.x1));
  var y0 = Math.max(0, Math.floor(bounds.y0));
  var y1 = Math.min(grid.height, Math.ceil(bounds.y1));
  for (var sy = y0; sy < y1; sy++) {
    for (var sx = x0; sx < x1; sx++) {
      weight = getIntervalOverlap(bounds.x0, bounds.x1, sx, sx + 1) *
        getIntervalOverlap(bounds.y0, bounds.y1, sy, sy + 1);
      if (weight <= 0) continue;
      src = (sy * grid.width + sx) * bands;
      if (sampleIsNoData(samples, src, bands, grid.nodata)) continue;
      for (var band = 0; band < bands; band++) {
        values[band] += samples[src + band] * weight;
      }
      total += weight;
    }
  }
  if (total <= 0) return {valid: false, values: values};
  for (var i = 0; i < bands; i++) values[i] /= total;
  return {valid: true, values: values};
}

function getApproxAverageRasterSample(grid, bounds) {
  var samples = grid.samples;
  var bands = grid.bands;
  var values = new Array(bands).fill(0);
  var xSteps = Math.min(MAX_APPROX_AVERAGE_STEPS, Math.max(1, Math.ceil(Math.abs(bounds.x1 - bounds.x0))));
  var ySteps = Math.min(MAX_APPROX_AVERAGE_STEPS, Math.max(1, Math.ceil(Math.abs(bounds.y1 - bounds.y0))));
  var count = 0;
  var sx, sy, src;
  for (var y = 0; y < ySteps; y++) {
    for (var x = 0; x < xSteps; x++) {
      sx = Math.max(0, Math.min(grid.width - 1, Math.floor(bounds.x0 + (x + 0.5) / xSteps * (bounds.x1 - bounds.x0))));
      sy = Math.max(0, Math.min(grid.height - 1, Math.floor(bounds.y0 + (y + 0.5) / ySteps * (bounds.y1 - bounds.y0))));
      src = (sy * grid.width + sx) * bands;
      if (sampleIsNoData(samples, src, bands, grid.nodata)) continue;
      for (var band = 0; band < bands; band++) {
        values[band] += samples[src + band];
      }
      count++;
    }
  }
  if (count === 0) return {valid: false, values: values};
  for (var i = 0; i < bands; i++) values[i] /= count;
  return {valid: true, values: values};
}

function getBilinearRasterSample(grid, bbox, x, y, width, height) {
  var p = getRasterSourcePixelCenter(grid, bbox, x, y, width, height);
  var x0 = Math.max(0, Math.min(grid.width - 1, Math.floor(p.x)));
  var y0 = Math.max(0, Math.min(grid.height - 1, Math.floor(p.y)));
  var x1 = Math.max(0, Math.min(grid.width - 1, x0 + 1));
  var y1 = Math.max(0, Math.min(grid.height - 1, y0 + 1));
  var tx = Math.max(0, Math.min(1, p.x - x0));
  var ty = Math.max(0, Math.min(1, p.y - y0));
  var samples = grid.samples;
  var bands = grid.bands;
  var values = new Array(bands).fill(0);
  var offsets = [
    (y0 * grid.width + x0) * bands,
    (y0 * grid.width + x1) * bands,
    (y1 * grid.width + x0) * bands,
    (y1 * grid.width + x1) * bands
  ];
  var weights = [
    (1 - tx) * (1 - ty),
    tx * (1 - ty),
    (1 - tx) * ty,
    tx * ty
  ];
  var total = 0;
  offsets.forEach(function(src, i) {
    if (weights[i] <= 0 || sampleIsNoData(samples, src, bands, grid.nodata)) return;
    for (var band = 0; band < bands; band++) {
      values[band] += samples[src + band] * weights[i];
    }
    total += weights[i];
  });
  if (total <= 0) return {valid: false, values: values};
  for (var j = 0; j < bands; j++) values[j] /= total;
  return {valid: true, values: values};
}

function getRasterSourcePixelBounds(grid, bbox, x, y, width, height) {
  return {
    x0: mapXToRasterPixel(grid, bbox[0] + x / width * (bbox[2] - bbox[0])),
    x1: mapXToRasterPixel(grid, bbox[0] + (x + 1) / width * (bbox[2] - bbox[0])),
    y0: mapYToRasterPixel(grid, bbox[3] - y / height * (bbox[3] - bbox[1])),
    y1: mapYToRasterPixel(grid, bbox[3] - (y + 1) / height * (bbox[3] - bbox[1]))
  };
}

function getRasterSourcePixelCenter(grid, bbox, x, y, width, height) {
  var mapX = bbox[0] + (x + 0.5) / width * (bbox[2] - bbox[0]);
  var mapY = bbox[3] - (y + 0.5) / height * (bbox[3] - bbox[1]);
  return {
    x: mapXToRasterPixel(grid, mapX) - 0.5,
    y: mapYToRasterPixel(grid, mapY) - 0.5
  };
}

function mapXToRasterPixel(grid, x) {
  return (x - grid.bbox[0]) / (grid.bbox[2] - grid.bbox[0]) * grid.width;
}

function mapYToRasterPixel(grid, y) {
  return (grid.bbox[3] - y) / (grid.bbox[3] - grid.bbox[1]) * grid.height;
}

function getIntervalOverlap(a0, a1, b0, b1) {
  return Math.max(0, Math.min(Math.max(a0, a1), b1) - Math.max(Math.min(a0, a1), b0));
}

function getSourcePixelBoundsArea(bounds) {
  return Math.abs((bounds.x1 - bounds.x0) * (bounds.y1 - bounds.y0));
}

function sampleIsNoData(samples, offset, bands, noData) {
  return noData !== null && noData !== undefined && allSamplesAreNoData(samples, offset, bands, noData);
}

function renderRawEightBitPreview(grid, width, height, sourceBbox) {
  var samples = grid.samples;
  var bands = grid.bands;
  var pixels = new Uint8ClampedArray(width * height * 4);
  var display = getRasterDisplayBands(grid);
  var gray = display.color.length == 1;
  var r = display.color[0];
  var g = gray ? r : display.color[1];
  var b = gray ? r : display.color[2];
  var alpha = display.alpha;
  var src, dest;
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      src = getPreviewSourceOffset(grid, sourceBbox, x, y, width, height, bands);
      dest = (y * width + x) * 4;
      pixels[dest] = samples[src + r];
      pixels[dest + 1] = samples[src + g];
      pixels[dest + 2] = samples[src + b];
      pixels[dest + 3] = alpha > -1 ? samples[src + alpha] : 255;
    }
  }
  return {
    width: width,
    height: height,
    bands: 4,
    pixelType: 'uint8',
    colorModel: 'rgba',
    pixels: pixels
  };
}

function getPreviewSourceOffset(grid, sourceBbox, x, y, width, height, bands) {
  var sx, sy, mapX, mapY, rb;
  if (!sourceBbox) {
    sy = Math.min(grid.height - 1, Math.floor((y + 0.5) * grid.height / height));
    sx = Math.min(grid.width - 1, Math.floor((x + 0.5) * grid.width / width));
  } else {
    rb = grid.bbox;
    mapX = sourceBbox[0] + (x + 0.5) / width * (sourceBbox[2] - sourceBbox[0]);
    mapY = sourceBbox[3] - (y + 0.5) / height * (sourceBbox[3] - sourceBbox[1]);
    sx = Math.max(0, Math.min(grid.width - 1, Math.floor((mapX - rb[0]) / (rb[2] - rb[0]) * grid.width)));
    sy = Math.max(0, Math.min(grid.height - 1, Math.floor((rb[3] - mapY) / (rb[3] - rb[1]) * grid.height)));
  }
  return (sy * grid.width + sx) * bands;
}

// A grid is north-up when its affine transform has no rotation/skew terms.
// Cropping and reprojection both index pixels through the axis-aligned bbox,
// so they can only handle north-up grids.
export function rasterGridIsRotated(grid) {
  var t = grid && grid.transform;
  return !!t && (t[1] !== 0 || t[3] !== 0);
}

export function clipRasterToBBox(lyr, bbox, opts) {
  return clipRasterLayer(lyr, bbox, opts, {});
}

// Crops a raster layer to the pixels that @bbox overlaps.
// @params.pixelCenters: keep only pixels whose centers are inside @bbox
// @params.editGrid: function(grid) that modifies the cropped grid in place
export function clipRasterLayer(lyr, bbox, opts, params) {
  var editGrid = params.editGrid;
  var raster = lyr.raster;
  var grid = getRasterGrid(raster);
  var clipBbox, crop, cropped;
  if (rasterGridIsRotated(grid)) {
    stop('Clipping a rotated or skewed raster is not supported');
  }
  clipBbox = intersectBboxes(grid.bbox, bbox);
  if (!clipBbox) {
    warn('Raster clipping rectangle does not intersect the raster layer');
    return false;
  }
  crop = params.pixelCenters ? getRasterCenterCrop(grid, clipBbox) : getRasterCrop(grid, clipBbox);
  if (crop.width === 0 || crop.height === 0) {
    warn('Raster clipping rectangle does not intersect the raster layer');
    return false;
  }
  noteLayerWillChange(lyr, {operation: 'clipRasterToBBox', unit: 'raster'});
  cropped = cropRasterGrid(grid, crop, getRasterCropBBox(grid, crop));
  if (editGrid) editGrid(cropped);
  raster.grid = cropped;
  updateRasterViewForGrid(raster);
  raster.view = raster.view || {};
  delete raster.view.scalingStats;
  if (runningInBrowser()) {
    raster.view.preview = createRasterPreview(raster, opts || {});
  } else {
    delete raster.view.preview;
  }
  clearLegacyRasterFields(raster);
  markLayerChanged(lyr, {operation: 'clipRasterToBBox', unit: 'raster'});
  return true;
}

export function intersectBboxes(a, b) {
  var bbox = [
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.min(a[3], b[3])
  ];
  return bbox[2] <= bbox[0] || bbox[3] <= bbox[1] ? null : bbox;
}

export function getRasterCrop(grid, bbox) {
  var rb = grid.bbox;
  var x0 = Math.max(0, Math.floor((bbox[0] - rb[0]) / (rb[2] - rb[0]) * grid.width));
  var x1 = Math.min(grid.width, Math.ceil((bbox[2] - rb[0]) / (rb[2] - rb[0]) * grid.width));
  var y0 = Math.max(0, Math.floor((rb[3] - bbox[3]) / (rb[3] - rb[1]) * grid.height));
  var y1 = Math.min(grid.height, Math.ceil((rb[3] - bbox[1]) / (rb[3] - rb[1]) * grid.height));
  return {
    x: x0,
    y: y0,
    width: Math.max(0, x1 - x0),
    height: Math.max(0, y1 - y0)
  };
}

// Selects the pixels whose centers are inside @bbox (on the left or top edge
// counts as inside), the rule used by polygon clipping.
function getRasterCenterCrop(grid, bbox) {
  var rb = grid.bbox;
  var px0 = (bbox[0] - rb[0]) / (rb[2] - rb[0]) * grid.width;
  var px1 = (bbox[2] - rb[0]) / (rb[2] - rb[0]) * grid.width;
  var py0 = (rb[3] - bbox[3]) / (rb[3] - rb[1]) * grid.height;
  var py1 = (rb[3] - bbox[1]) / (rb[3] - rb[1]) * grid.height;
  var x0 = Math.max(0, Math.ceil(px0 - 0.5));
  var x1 = Math.min(grid.width, Math.ceil(px1 - 0.5));
  var y0 = Math.max(0, Math.ceil(py0 - 0.5));
  var y1 = Math.min(grid.height, Math.ceil(py1 - 0.5));
  return {
    x: x0,
    y: y0,
    width: Math.max(0, x1 - x0),
    height: Math.max(0, y1 - y0)
  };
}

// The bbox of the pixels selected by @crop
export function getRasterCropBBox(grid, crop) {
  var rb = grid.bbox;
  var dx = (rb[2] - rb[0]) / grid.width;
  var dy = (rb[3] - rb[1]) / grid.height;
  return [
    crop.x === 0 ? rb[0] : rb[0] + crop.x * dx,
    crop.y + crop.height == grid.height ? rb[1] : rb[3] - (crop.y + crop.height) * dy,
    crop.x + crop.width == grid.width ? rb[2] : rb[0] + (crop.x + crop.width) * dx,
    crop.y === 0 ? rb[3] : rb[3] - crop.y * dy
  ];
}

export function cropRasterGrid(grid, crop, bbox) {
  var samples = new grid.samples.constructor(crop.width * crop.height * grid.bands);
  var rowCount = crop.width * grid.bands;
  var src, dest;
  for (var y = 0; y < crop.height; y++) {
    src = ((crop.y + y) * grid.width + crop.x) * grid.bands;
    dest = y * rowCount;
    samples.set(grid.samples.subarray(src, src + rowCount), dest);
  }
  return Object.assign({}, grid, {
    width: crop.width,
    height: crop.height,
    samples: samples,
    coverage: cropRasterCoverage(grid, crop),
    bbox: bbox,
    transform: updateTransformForBBox(grid.transform, bbox, crop.width, crop.height)
  });
}

// The coverage mask is one byte per pixel (not per sample), and must be
// cropped alongside the samples -- consumers index it with the cropped
// grid's dimensions.
function cropRasterCoverage(grid, crop) {
  var coverage = grid.coverage;
  var cropped, src, dest, x, y;
  if (!coverage) return coverage;
  cropped = new Uint8Array(crop.width * crop.height);
  for (y = 0; y < crop.height; y++) {
    src = (crop.y + y) * grid.width + crop.x;
    dest = y * crop.width;
    for (x = 0; x < crop.width; x++) {
      cropped[dest + x] = coverage[src + x];
    }
  }
  return cropped;
}

export function getRasterLayerBounds(lyr) {
  var bbox = lyr.raster && getRasterBBox(lyr.raster);
  return bbox && bbox.length == 4 ? new Bounds(bbox) : null;
}

export function requireRasterLayer(lyr) {
  if (!lyr || !lyr.raster_type || !lyr.raster) {
    stop('Expected a raster layer');
  }
}

function clearLegacyRasterFields(raster) {
  delete raster.width;
  delete raster.height;
  delete raster.bands;
  delete raster.pixelType;
  delete raster.nodata;
  delete raster.bbox;
  delete raster.transform;
  delete raster.colorModel;
  delete raster.preview;
  delete raster.pixels;
}

function updateTransformForBBox(transform, bbox, width, height) {
  if (!transform) return null;
  return [
    (bbox[2] - bbox[0]) / width,
    0,
    bbox[0],
    0,
    -(bbox[3] - bbox[1]) / height,
    bbox[3]
  ];
}

function getBandStats(data, bands, noData) {
  var stats = [];
  for (var band = 0; band < bands; band++) {
    stats[band] = getSingleBandStats(data, bands, band, noData);
  }
  return stats;
}

function getSingleBandStats(data, bands, band, noData) {
  var min = Infinity;
  var max = -Infinity;
  var val;
  for (var i = band; i < data.length; i += bands) {
    val = data[i];
    if (!isValidBandValue(val, noData)) continue;
    if (val < min) min = val;
    if (val > max) max = val;
  }
  return min < Infinity && max > min ? {min: min, max: max} : {min: 0, max: 255};
}

// The red, green and blue bands share a scale, so that scaling doesn't shift
// colors
function getSharedBandStats(data, bands, noData, colorBands) {
  var stats = getBandStats(data, bands, noData);
  var min = Math.min.apply(null, colorBands.map(function(b) { return stats[b].min; }));
  var max = Math.max.apply(null, colorBands.map(function(b) { return stats[b].max; }));
  var shared = max > min ? {min: min, max: max} : {min: 0, max: 255};
  colorBands.forEach(function(b) { stats[b] = shared; });
  return stats;
}

// Stats for each grid band, indexed by band (null for a palette, which
// colors values rather than scaling them)
function getScalingStats(grid, recipe) {
  var data = grid.samples, bands = grid.bands, noData = grid.nodata;
  var colorBands = getRasterDisplayBands(grid).color;
  var shared = recipe.type == 'rgb' && colorBands.length == 3;
  if (recipe.palette) return null;
  if (recipe.scaling == 'minmax') {
    return shared ? getSharedBandStats(data, bands, noData, colorBands) : getBandStats(data, bands, noData);
  }
  if (recipe.scaling == 'percentile') {
    return shared ? getSharedPercentileStats(data, bands, noData, recipe.percentileRange, colorBands) :
      getBandPercentileStats(data, bands, noData, recipe.percentileRange);
  }
  return null;
}

function scaleSample(val, stats, sourceRange, displayRange) {
  var range = stats || sourceRange || {min: 0, max: 255};
  var pct = range.max > range.min ? (val - range.min) / (range.max - range.min) : 0;
  var scaled = displayRange[0] + pct * (displayRange[1] - displayRange[0]);
  return Math.max(0, Math.min(255, Math.round(scaled)));
}

function getDefaultRasterScaling(grid, recipe) {
  return isEightBitPixelType(grid.pixelType) ? 'none' : 'percentile';
}

function parseRangeOption(val, def, name) {
  var range;
  if (val == null || val === '') return def;
  range = Array.isArray(val) ? val : String(val).split(',');
  if (range.length != 2) {
    stop('Expected ' + name + '= to contain two comma-separated numbers');
  }
  range = range.map(Number);
  if (!isFinite(range[0]) || !isFinite(range[1]) || range[0] < 0 || range[1] > 100 || range[1] < range[0]) {
    stop('Expected ' + name + '= values between 0 and 100');
  }
  return range;
}

function getDisplayRange(scaleRange) {
  return [
    scaleRange[0] / 100 * 255,
    scaleRange[1] / 100 * 255
  ];
}

function getPixelTypeRange(pixelType) {
  switch (pixelType) {
    case 'uint8': return {min: 0, max: 255};
    case 'uint16': return {min: 0, max: 65535};
    case 'uint32': return {min: 0, max: 4294967295};
    case 'int8': return {min: -128, max: 127};
    case 'int16': return {min: -32768, max: 32767};
    case 'int32': return {min: -2147483648, max: 2147483647};
  }
  return null;
}

function isEightBitPixelType(pixelType) {
  return pixelType == 'uint8' || pixelType == 'int8';
}

function useFastRawEightBitRendering(grid, recipe) {
  return !recipe.palette && grid.pixelType == 'uint8' &&
    recipe.scaling == 'none' &&
    recipe.scaleRange[0] === 0 &&
    recipe.scaleRange[1] === 100 &&
    (recipe.type == 'gray' && !rasterGridDisplaysColor(grid) || recipe.type == 'rgb' && rasterGridDisplaysColor(grid)) &&
    (grid.nodata === null || grid.nodata === undefined);
}

export function getRasterScalingStatsKey(grid, recipe) {
  return [
    grid.width,
    grid.height,
    grid.bands,
    grid.pixelType,
    grid.samples && grid.samples.length,
    grid.nodata,
    getRasterDisplayBandsKey(grid),
    recipe.type,
    recipe.scaling,
    recipe.scaleRange && recipe.scaleRange.join(','),
    recipe.percentileRange && recipe.percentileRange.join(',')
  ].join('|');
}

function getBandPercentileStats(data, bands, noData, range) {
  var stats = [];
  for (var band = 0; band < bands; band++) {
    stats[band] = getPercentileStats(data, bands, [band], noData, range);
  }
  return stats;
}

function getSharedPercentileStats(data, bands, noData, range, colorBands) {
  var stats = getBandPercentileStats(data, bands, noData, range);
  var shared = getPercentileStats(data, bands, colorBands, noData, range);
  colorBands.forEach(function(b) { stats[b] = shared; });
  return stats;
}

function getPercentileStats(data, bands, bandIds, noData, range) {
  var integerRange = getSmallIntegerRange(data);
  return integerRange ?
    getHistogramPercentileStats(data, bands, bandIds, noData, range, integerRange) :
    getApproxHistogramPercentileStats(data, bands, bandIds, noData, range);
}

function getSmallIntegerRange(data) {
  if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) return {min: 0, max: 255};
  if (data instanceof Int8Array) return {min: -128, max: 127};
  if (data instanceof Uint16Array) return {min: 0, max: 65535};
  if (data instanceof Int16Array) return {min: -32768, max: 32767};
  return null;
}

function getHistogramPercentileStats(data, bands, bandIds, noData, range, integerRange) {
  var counts = new Uint32Array(integerRange.max - integerRange.min + 1);
  var count = 0, val;
  forEachBandValue(data, bands, bandIds, noData, function(v) {
    val = v - integerRange.min;
    counts[val]++;
    count++;
  });
  return count > 0 ? {
    min: getHistogramPercentileValue(counts, integerRange.min, count, range[0]),
    max: getHistogramPercentileValue(counts, integerRange.min, count, range[1])
  } : {min: 0, max: 255};
}

function getApproxHistogramPercentileStats(data, bands, bandIds, noData, range) {
  var bounds = getBandValueBounds(data, bands, bandIds, noData);
  var binCount = 65536;
  var counts, count, scale, maxBin;
  if (!bounds || bounds.max <= bounds.min) {
    return bounds || {min: 0, max: 255};
  }
  counts = new Uint32Array(binCount);
  count = 0;
  scale = (binCount - 1) / (bounds.max - bounds.min);
  maxBin = binCount - 1;
  forEachBandValue(data, bands, bandIds, noData, function(val) {
    counts[Math.max(0, Math.min(maxBin, Math.floor((val - bounds.min) * scale)))]++;
    count++;
  });
  return count > 0 ? {
    min: getApproxHistogramPercentileValue(counts, bounds, count, range[0]),
    max: getApproxHistogramPercentileValue(counts, bounds, count, range[1])
  } : {min: 0, max: 255};
}

function getBandValueBounds(data, bands, bandIds, noData) {
  var min = Infinity;
  var max = -Infinity;
  forEachBandValue(data, bands, bandIds, noData, function(val) {
    if (val < min) min = val;
    if (val > max) max = val;
  });
  return min < Infinity ? {min: min, max: max} : null;
}

function getHistogramPercentileValue(counts, offset, count, pct) {
  var target = getPercentileRank(count, pct);
  var sum = 0;
  for (var i = 0; i < counts.length; i++) {
    sum += counts[i];
    if (sum > target) return i + offset;
  }
  return counts.length - 1 + offset;
}

function getApproxHistogramPercentileValue(counts, bounds, count, pct) {
  var bin = getHistogramPercentileValue(counts, 0, count, pct);
  return bounds.min + bin / (counts.length - 1) * (bounds.max - bounds.min);
}

function forEachBandValue(data, bands, bandIds, noData, cb) {
  var val;
  for (var i = 0; i < data.length; i += bands) {
    for (var j = 0; j < bandIds.length; j++) {
      val = data[i + bandIds[j]];
      if (!isValidBandValue(val, noData)) continue;
      cb(val);
    }
  }
}

function isValidBandValue(val, noData) {
  return isFinite(val) && (noData === null || noData === undefined || val != noData);
}

function getPercentileRank(count, pct) {
  return Math.max(0, Math.min(count - 1, Math.floor((count - 1) * pct / 100)));
}

function allSamplesAreNoData(data, offset, bands, noData) {
  return samplesAreNodataAtOffset(data, offset, bands, noData);
}

function copyObjectOrArray(obj) {
  return obj && obj.concat ? obj.concat() : utils.extend({}, obj);
}
