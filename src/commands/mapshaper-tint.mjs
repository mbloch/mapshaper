import cmd from '../mapshaper-cmd';
import { parseColor } from '../color/color-utils';
import { getColorRamp, isColorSchemeName } from '../color/color-schemes';
import { layerHasRaster, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { getRasterValidityMask } from '../rasters/mapshaper-raster-grid';
import { applyOpacityAndBackground, getColorRampTable, getRampIndex } from '../rasters/mapshaper-raster-color';
import { getRasterGrid } from '../rasters/mapshaper-raster-utils';
import { getColoredRaster, getRasterBackground, getRasterOpacity } from './mapshaper-tone';
import { stop, verbose } from '../utils/mapshaper-logging';

// colors taken from a color scheme when breaks= isn't given
var SCHEME_COLORS = 9;
// fraction of valid pixels at each end of the elevation range that 0% and
// 100% ignore, so that a spike or an artifact doesn't shift every break
var RANGE_TRIM = 0.001;
// percentiles are found from at most this many pixels
var RANGE_SAMPLES = 1e6;

// Colors an elevation raster with hypsometric tints (see
// docs/development/raster-tone-tint.md)
// Returns a new layer; -tint replaces the target unless + is used
cmd.tint = function(lyr, opts) {
  var grid, band, valid, values, colors, breakArgs, range, breaks, table, opacity, background;
  var samples, result, out;
  if (!layerHasRaster(lyr)) {
    stop('Command requires a raster layer');
  }
  grid = getRasterGrid(lyr.raster);
  band = opts.band || 0;
  validateTintGrid(lyr.raster, grid, band);
  opacity = getRasterOpacity(opts);
  background = getRasterBackground(opts);
  breakArgs = opts.breaks ? opts.breaks.map(parseBreak) : null;
  colors = getTintColors(opts.colors, breakArgs ? breakArgs.length : 0);
  if (!breakArgs) {
    breakArgs = colors.map(function(c, i) {
      return {percent: i / (colors.length - 1) * 100};
    });
  }
  valid = getRasterValidityMask(grid);
  values = readBand(grid, band);
  if (breakArgs.some(function(o) { return o.percent != null; })) {
    range = getTrimmedRange(values, valid);
    if (!range) stop('The raster has no valid elevation values');
  }
  breaks = breakArgs.map(function(o) {
    return o.percent == null ? o.value : range[0] + (range[1] - range[0]) * o.percent / 100;
  });
  validateBreaks(breaks);
  verbose('Breaks: breaks=' + formatBreaks(breaks));
  table = getColorRampTable(colors, breaks);
  samples = writeTintPixels(values, valid, table);
  result = applyOpacityAndBackground(samples, valid ? 4 : 3, opacity, background);
  if (result.bands == 4 && !background && isOpaque(result.samples)) {
    result = {samples: dropAlpha(result.samples), bands: 3};
  }
  out = {
    raster_type: 'grid',
    raster: getColoredRaster(lyr.raster, grid, result, {
      type: 'tint',
      colors: colors.join(','),
      breaks: formatBreaks(breaks),
      opacity: opacity,
      background: opts.background || null,
      band: band
    })
  };
  setOutputLayerName(out, lyr, 'tint', opts);
  return [out];
};

function validateTintGrid(raster, grid, band) {
  if (!grid || !grid.samples || !grid.bbox) {
    stop('Raster layer is missing the data needed for tinting');
  }
  if (raster.interpretation == 'image' && grid.bands >= 3) {
    stop('-tint colors elevation rasters. To adjust the colors of an image, use -tone');
  }
  if (band < 0 || band >= grid.bands) {
    stop('Raster layer does not have band', band);
  }
}

// "40%" -> {percent: 40}, "200" -> {value: 200}
function parseBreak(str) {
  var s = String(str).trim();
  var num;
  if (/%$/.test(s)) {
    num = Number(s.slice(0, -1));
    if (s.length > 1 && isFinite(num)) return {percent: num};
  } else {
    num = Number(s);
    if (s !== '' && isFinite(num)) return {value: num};
  }
  stop('Invalid breaks= value:', str + '. Use numbers or percentages (e.g. 0,40%,100%)');
}

// @n number of breaks, or 0 if breaks= wasn't given
function getTintColors(arg, n) {
  var colors;
  if (!arg || arg.length === 0) {
    stop('-tint requires colors=');
  }
  if (arg.length == 1 && isColorSchemeName(arg[0])) {
    colors = getColorRamp(arg[0], n || SCHEME_COLORS);
  } else if (arg.length == 1) {
    stop(parseColor(arg[0]) ? 'colors= needs two or more colors' : 'Unknown color scheme name: ' + arg[0]);
  } else {
    colors = arg.map(function(str) {
      if (!parseColor(str)) stop('Unsupported color:', str);
      return str;
    });
  }
  if (n > 0 && n != colors.length) {
    stop('breaks= should have one value for each color (' + colors.length + ')');
  }
  return colors;
}

function validateBreaks(breaks) {
  for (var i = 1; i < breaks.length; i++) {
    if (breaks[i] < breaks[i - 1]) {
      stop('breaks= should increase from low to high (resolved to ' + formatBreaks(breaks) + ')');
    }
  }
}

function formatBreaks(breaks) {
  var span = Math.abs(breaks[breaks.length - 1] - breaks[0]);
  var decimals = span >= 100 ? 0 : span >= 1 ? 2 : 4;
  return breaks.map(function(val) {
    return +val.toFixed(decimals);
  }).join(',');
}

function readBand(grid, band) {
  var n = grid.width * grid.height;
  var out = new Float64Array(n);
  for (var i = 0, j = band; i < n; i++, j += grid.bands) {
    out[i] = grid.samples[j];
  }
  return out;
}

// The range of valid values, ignoring RANGE_TRIM of them at each end
// Returns [min, max], or null if there are no valid values
export function getTrimmedRange(values, valid) {
  var step = Math.max(1, Math.floor(values.length / RANGE_SAMPLES));
  var sample = [];
  var i, lo, hi;
  for (i = 0; i < values.length; i += step) {
    if (valid && !valid[i]) continue;
    if (!isFinite(values[i])) continue;
    sample.push(values[i]);
  }
  if (sample.length === 0) return null;
  sample = Float64Array.from(sample).sort();
  lo = Math.floor((sample.length - 1) * RANGE_TRIM);
  hi = Math.ceil((sample.length - 1) * (1 - RANGE_TRIM));
  return [sample[lo], sample[hi]];
}

// Returns RGBA samples (transparent where invalid) if @valid is given, else RGB
function writeTintPixels(values, valid, table) {
  var bands = valid ? 4 : 3;
  var out = new Uint8Array(values.length * bands);
  var i, j, k;
  for (i = 0, j = 0; i < values.length; i++, j += bands) {
    if (valid && !valid[i]) continue;
    k = getRampIndex(table, values[i]);
    out[j] = table.r[k];
    out[j + 1] = table.g[k];
    out[j + 2] = table.b[k];
    if (valid) out[j + 3] = 255;
  }
  return out;
}

function isOpaque(rgba) {
  for (var i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 255) return false;
  }
  return true;
}

function dropAlpha(rgba) {
  var n = rgba.length / 4;
  var out = new Uint8Array(n * 3);
  for (var i = 0, j = 0; i < n; i++, j += 4) {
    out[i * 3] = rgba[j];
    out[i * 3 + 1] = rgba[j + 1];
    out[i * 3 + 2] = rgba[j + 2];
  }
  return out;
}
