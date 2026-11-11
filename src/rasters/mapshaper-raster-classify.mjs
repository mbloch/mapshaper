import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { parseColor } from '../color/color-utils';
import { getDivergingStops, countBelow } from '../classification/mapshaper-diverging';
import { numbersAreAscending } from '../classification/mapshaper-sequential-classifier';
import { getRasterDisplayBands, rasterGridDisplaysColor } from './mapshaper-raster-display-bands';
import { createRasterPreview, getRasterGrid } from './mapshaper-raster-utils';
import { runningInBrowser } from '../mapshaper-env';

// Helpers for -classify on raster layers (see
// docs/development/raster-palette-design.md)

// classification uses a sample of at most this many valid pixels
var MAX_SAMPLE_PIXELS = 1e6;
// continuous quantile colors are placed by rank, which a palette follows with
// a color stop at each of this many quantiles of the data
var RANK_STOPS = 32;
// ...or a stop at each value, if there are no more than this many
var MAX_VALUE_STOPS = 256;
// Samples and categories, by grid.samples and then by band (see getBandCache()).
// Editing a palette in the GUI classifies the same pixels again and again.
var bandCaches = new WeakMap();
// fraction of the sample at each end of the range that 0% and 100% ignore, so
// that a spike or an artifact doesn't shift every percentage break
var RANGE_TRIM = 0.001;

// Options that write or read attributes, or make a key
var VECTOR_ONLY_OPTIONS = ['save_as', 'values', 'index_field', 'key', 'key_style', 'key_name',
  'key_width', 'key_font_size', 'key_tile_height', 'key_tic_length', 'key_label_suffix',
  'key_last_suffix'];

export function validateRasterClassifyOptions(raster, grid, opts) {
  var name = VECTOR_ONLY_OPTIONS.find(function(key) { return key in opts; });
  if (!grid || !grid.samples) {
    stop('Raster layer is missing the data needed for classifying');
  }
  if (name) {
    stop(name.replace(/_/g, '-') + '= does not work with raster layers');
  }
  if (opts.method == 'non-adjacent' || opts.method == 'blacki' || opts.method == 'indexed') {
    stop('The', opts.method, 'method does not work with raster layers');
  }
  if (!opts.colors) {
    stop('Classifying a raster requires colors=');
  }
  if (rasterIsColorImage(raster, grid)) {
    stop('-classify colors data rasters, not RGB images. To adjust the colors of an image, use -tone');
  }
}

// Whether -classify can give a raster a palette: any raster with values,
// except an image displayed in color
export function rasterCanTakePalette(raster) {
  var grid = getRasterGrid(raster);
  return !!(grid && grid.samples) && !rasterIsColorImage(raster, grid);
}

function rasterIsColorImage(raster, grid) {
  return raster.interpretation == 'image' && rasterGridDisplaysColor(grid);
}

// The bands that -classify can color, leaving out an alpha band:
// [{band, index, description}] (band: the file band number; index: the
// grid's)
export function getRasterClassifyBands(grid) {
  var alpha = getRasterDisplayBands(grid).alpha;
  var descriptions = grid.bandDescriptions || null;
  var bands = [];
  var band;
  for (var i = 0; i < grid.bands; i++) {
    if (i == alpha) continue;
    band = grid.sampleBands && grid.sampleBands[i] >= 0 ? grid.sampleBands[i] + 1 : i + 1;
    bands.push({band: band, index: i, description: descriptions && descriptions[band] || null});
  }
  return bands;
}

// The file band number (1-based) that -classify colors: from a band field
// (band1, band2, ...) or band=; a single-band raster needs neither
export function getRasterClassifyBand(grid, opts) {
  var fieldBand = null;
  var match;
  if (opts.field) {
    match = /^band([0-9]+)$/.exec(opts.field);
    if (!match) stop('Raster layers are classified by band, e.g. -classify band1 (not ' + opts.field + ')');
    fieldBand = +match[1];
  }
  if (fieldBand !== null && opts.band && opts.band != fieldBand) {
    stop('band=' + opts.band, 'does not match', opts.field);
  }
  if (fieldBand !== null) return fieldBand;
  if (opts.band) return opts.band;
  if (grid.bands > 1) {
    stop('This raster has ' + grid.bands + ' bands; name the one to classify, e.g. -classify band1');
  }
  return grid.sampleBands ? grid.sampleBands[0] + 1 : 1;
}

export function rasterBandIsInteger(grid) {
  return /^u?int/.test(grid.pixelType || '');
}

// A sample of the valid values of a band: not nodata or NaN, inside the
// grid's coverage, and not masked by an alpha band
// Returns {values, count, total, sampled}, which is cached: don't modify it
//   values: up to MAX_SAMPLE_PIXELS values, ascending, as an Array (sorted
//     once here, so that the classifiers' sorts can skip it)
//   count: the number of valid pixels; total: the number of pixels
export function getRasterBandSample(grid, band) {
  var cache = getBandCache(grid, band);
  var n, step, values, count;
  if (cache.sample) return cache.sample;
  n = grid.width * grid.height;
  step = Math.max(1, Math.ceil(n / MAX_SAMPLE_PIXELS));
  values = [];
  count = 0;
  forEachValidBandValue(grid, band, function(val, i) {
    count++;
    if (i % step === 0) values.push(val);
  });
  cache.sample = {values: Array.from(sortAscending(values)), count: count, total: n, sampled: step > 1};
  return cache.sample;
}

// The band's unique values, in increasing order (cached: don't modify it).
// Every pixel is read, so that a category covering a few pixels isn't missed
// by a sample.
export function getRasterBandCategories(grid, band) {
  var cache = getBandCache(grid, band);
  var index;
  if (cache.categories) return cache.categories;
  index = new Set();
  forEachValidBandValue(grid, band, function(val) {
    index.add(val);
  });
  cache.categories = Array.from(index).sort(function(a, b) { return a - b; });
  return cache.categories;
}

// Commands make a new grid rather than changing a grid's pixels, but a grid's
// nodata value, coverage or display bands can be replaced, which changes the
// valid pixels
function getBandCache(grid, band) {
  var byBand = bandCaches.get(grid.samples);
  var key = [band, grid.nodata, getRasterDisplayBands(grid).alpha, grid.bands].join(',');
  var cache;
  if (!byBand) {
    byBand = {};
    bandCaches.set(grid.samples, byBand);
  }
  cache = byBand[key];
  if (!cache || cache.coverage !== (grid.coverage || null)) {
    cache = byBand[key] = {coverage: grid.coverage || null, sample: null, categories: null};
  }
  return cache;
}

function forEachValidBandValue(grid, band, cb) {
  var n = grid.width * grid.height;
  var bands = grid.bands;
  var samples = grid.samples;
  var nodata = grid.nodata;
  var hasNodata = nodata !== null && nodata !== undefined;
  var coverage = grid.coverage || null;
  var alpha = getRasterDisplayBands(grid).alpha;
  var val;
  for (var i = 0; i < n; i++) {
    val = samples[i * bands + band];
    if (!isFinite(val) || hasNodata && val == nodata) continue;
    if (coverage && !coverage[i] || alpha > -1 && samples[i * bands + alpha] === 0) continue;
    cb(val, i);
  }
}

export function formatRasterSampleMessage(band, sample) {
  var msg = utils.format('Band %d: %,d valid pixels', band, sample.count);
  if (sample.count < sample.total) {
    msg += utils.format(' (%,d nodata)', sample.total - sample.count);
  }
  if (sample.sampled) {
    msg += utils.format(', classified from a sample of %,d', sample.values.length);
  }
  return msg;
}

// The range of a sample of values, ignoring RANGE_TRIM of them at each end
export function getTrimmedRange(values) {
  var sorted = sortAscending(values);
  var lo = Math.floor((sorted.length - 1) * RANGE_TRIM);
  var hi = Math.ceil((sorted.length - 1) * (1 - RANGE_TRIM));
  return [sorted[lo], sorted[hi]];
}

// Converts the classes resolved by -classify into a palette (see
// mapshaper-raster-palette.mjs)
// @o: from getClassification() in mapshaper-classify.mjs
// @band: file band number
// @values: the sample of values that was classified
export function getRasterPaletteFromClassification(o, band, opts, values) {
  var palette;
  if (o.method == 'quantile' && opts.continuous && !o.opts.breaks) {
    values = getSortedValues(values, opts.outer_breaks);
    palette = o.diverging ?
      getRankedDivergingPalette(o.classifyByValue, values, o.divergingLayout, o.values) :
      getRankedPalette(o.classifyByValue, values);
  } else if (o.method == 'categorical') {
    palette = {type: 'categorical', categories: o.opts.categories, colors: o.values};
    if (opts.other !== undefined) palette.otherColor = getPaletteColor(opts.other, 'other=');
  } else if (o.diverging && opts.continuous) {
    palette = getContinuousDivergingPalette(o.divergingLayout, o.values);
  } else {
    palette = getSequentialPalette(o.sequential, o.values, !!opts.continuous);
  }
  palette = Object.assign({band: band}, palette);
  if (palette.type != 'categorical') {
    palette.type = o.diverging ? 'diverging' : 'sequential';
  }
  palette.nullColor = 'null_value' in opts ? getPaletteColor(opts.null_value, 'null-value=') : null;
  if (palette.continuous) {
    palette.interpolation = o.opts.interpolation || 'oklch';
    if (opts.vibrance > 0) palette.vibrance = opts.vibrance;
  }
  palette.command = getPaletteCommand(opts);
  return palette;
}

// Continuous quantile output places a value by its rank in the data, rather
// than between breaks. Stops at quantiles of the data follow that placement
// (exactly at the stops, and closely between them).
// @sorted: from getSortedValues()
function getRankedPalette(classify, sorted) {
  var stops = getRankStops(classify, sorted);
  if (stops.breaks.length == 1) {
    return {continuous: false, breaks: [], colors: stops.colors};
  }
  return {continuous: true, breaks: stops.breaks, colors: stops.colors};
}

// Each side of a diverging ramp is ranked on its own; the side below ends at
// the pivot (or the pivot class) with its last color, as in
// getContinuousDivergingClassifier()
function getRankedDivergingPalette(classify, sorted, layout, classValues) {
  var edges = layout.neutral || [layout.pivot, layout.pivot];
  var nb = getDivergingStops(layout).below.length;
  var below = getRankStops(classify, sorted.slice(0, countBelow(sorted, edges[0])));
  var above = getRankStops(classify, sorted.slice(countBelow(sorted, edges[1])));
  var breaks = below.breaks.concat();
  var colors = below.colors.concat();
  if (nb > 0) {
    breaks.push(edges[0]);
    colors.push(classValues[nb - 1]);
  }
  if (layout.neutral) {
    breaks.push(edges[0], edges[1]);
    colors.push(classValues[nb], classValues[nb]);
  }
  if (above.breaks.length > 0 && above.breaks[0] > edges[1]) {
    breaks.push(edges[1]);
    colors.push(classify(edges[1]));
  }
  return {continuous: true, breaks: breaks.concat(above.breaks), colors: colors.concat(above.colors)};
}

// Values clamped to outer-breaks=, as the classifier ranks them, in
// increasing order
function getSortedValues(values, range) {
  var sorted = sortAscending(values);
  if (range) {
    if (sorted === values) sorted = Float64Array.from(values);
    for (var i = 0; i < sorted.length; i++) {
      sorted[i] = Math.min(Math.max(sorted[i], range[0]), range[1]);
    }
  }
  return sorted;
}

// @values, if they are ascending, or else a sorted Float64Array copy
function sortAscending(values) {
  return numbersAreAscending(values) ? values : Float64Array.from(values).sort();
}

// Color stops at each value of @sorted, if it has few of them (as integer
// rasters often do), otherwise at RANK_STOPS quantiles. Tied values are
// placed at the middle of their ranks, so a long run of one value (e.g. the
// values clamped by outer-breaks=) jumps to the next value's rank.
function getRankStops(classify, sorted) {
  var stopValues = getDistinctValues(sorted, MAX_VALUE_STOPS + 1);
  var colors;
  if (stopValues.length > MAX_VALUE_STOPS) {
    stopValues = [];
    for (var i = 0; i <= RANK_STOPS && sorted.length > 0; i++) {
      addDistinctValue(stopValues, sorted[Math.round(i / RANK_STOPS * (sorted.length - 1))]);
    }
  }
  colors = stopValues.map(function(val) { return classify(val); });
  return {breaks: stopValues, colors: colors};
}

// Up to @max distinct values of @sorted
function getDistinctValues(sorted, max) {
  var values = [];
  for (var i = 0; i < sorted.length && values.length < max; i++) {
    addDistinctValue(values, sorted[i]);
  }
  return values;
}

function addDistinctValue(values, val) {
  if (values.length === 0 || val != values[values.length - 1]) values.push(val);
}

// Continuous colors are at the data's min and max, and at the inner breaks
function getSequentialPalette(classifier, colors, continuous) {
  var breaks = classifier.breaks;
  var stops;
  if (continuous) {
    stops = [classifier.range[0]].concat(breaks, [classifier.range[1]]);
    if (stops[0] == stops[stops.length - 1]) {
      // constant data has the color the classifier gives it
      return {continuous: false, breaks: [], colors: [classifier(stops[0])]};
    }
    return {continuous: true, breaks: stops, colors: colors};
  }
  if (breaks.length > 1 && breaks[0] > breaks[breaks.length - 1]) {
    return {continuous: false, breaks: breaks.concat().reverse(), colors: colors.concat().reverse()};
  }
  return {continuous: false, breaks: breaks.concat(), colors: colors};
}

// The colors of each side are at its stops; a pivot class has one color.
// Values at the pivot (or the top of the pivot class) take the color above:
// a repeated break starts a segment.
function getContinuousDivergingPalette(layout, values) {
  var stops = getDivergingStops(layout);
  var nb = stops.below.length;
  var na = stops.above.length;
  var breaks = stops.below.concat();
  var colors = values.slice(0, nb);
  var center;
  if (layout.neutral) {
    center = values[nb];
    breaks.push(layout.neutral[0], layout.neutral[1]);
    colors.push(center, center);
  }
  breaks = breaks.concat(stops.above);
  colors = colors.concat(values.slice(values.length - na));
  return {continuous: true, breaks: breaks, colors: colors};
}

function getPaletteColor(val, name) {
  if (val === null || val === 'null' || val === '') return null;
  if (!parseColor(val)) stop('Unsupported color for ' + name, val);
  return String(val);
}

// The options that made the palette, for the GUI panel to reopen with
function getPaletteCommand(opts) {
  var out = {};
  Object.keys(opts).forEach(function(key) {
    if (key == 'target' || key == 'count_label') return;
    out[key] = opts[key];
  });
  return out;
}

// Sets the palette, and sets the interpretation of an image raster (which
// chooses how -proj resamples it): categorical for categories, otherwise
// continuous
export function setRasterPalette(raster, palette) {
  var view = raster.view || (raster.view = {});
  view.recipe = Object.assign({}, view.recipe, {palette: palette});
  if (palette.type == 'categorical') {
    raster.interpretation = 'categorical';
  } else if (raster.interpretation == 'image' || !raster.interpretation) {
    raster.interpretation = 'continuous';
  }
  updateRasterPreview(raster);
}

// Removes the palette and display opacity (-style clear)
export function clearRasterStyle(raster) {
  var recipe = raster.view && raster.view.recipe;
  if (!recipe || !recipe.palette && recipe.opacity === undefined) return false;
  recipe = Object.assign({}, recipe);
  delete recipe.palette;
  delete recipe.opacity;
  raster.view.recipe = recipe;
  updateRasterPreview(raster);
  return true;
}

// Sets the display opacity, which is applied when the raster is drawn (see
// getRasterViewOpacity())
export function setRasterOpacity(raster, opacity) {
  var view = raster.view || (raster.view = {});
  view.recipe = Object.assign({}, view.recipe);
  if (opacity < 1) {
    view.recipe.opacity = opacity;
  } else {
    delete view.recipe.opacity;
  }
}

function updateRasterPreview(raster) {
  if (raster.view.preview || runningInBrowser()) {
    raster.view.preview = createRasterPreview(raster, {});
  }
}