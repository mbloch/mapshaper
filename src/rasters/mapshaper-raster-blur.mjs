import { getRasterGrid } from './mapshaper-raster-utils';
import { stop } from '../utils/mapshaper-logging';

var BOX_BLUR_PASSES = 3;

export function blurRasterGrid(raster, optsArg) {
  var opts = optsArg || {};
  var grid = getRasterGrid(raster);
  var radius = getBlurRadius(opts);
  var sigma = radius / 2;
  var boxes = getGaussianBoxWidths(sigma, BOX_BLUR_PASSES);
  var samples = new grid.samples.constructor(grid.samples.length);
  var tmp = new Float32Array(grid.width * grid.height);
  var channel = new Float32Array(grid.width * grid.height);
  var weights = getRasterBlurWeights(grid);
  validateBlurGrid(grid);
  if (grid.bands == 4) {
    blurRgbaGrid(grid, samples, channel, tmp, weights, boxes);
    return Object.assign({}, grid, {
      samples: samples
    });
  }
  for (var band = 0; band < grid.bands; band++) {
    copyBandToChannel(grid, band, channel);
    blurChannel(channel, tmp, weights, grid.width, grid.height, boxes);
    copyChannelToBand(channel, samples, grid, band);
  }
  return Object.assign({}, grid, {
    samples: samples
  });
}

function getBlurRadius(opts) {
  var arg = opts.radius;
  var radius;
  if (arg == null || arg === '') stop('Missing blur radius');
  if (typeof arg == 'string') {
    arg = arg.trim().replace(/px$/i, '');
  }
  radius = Number(arg);
  if (!(radius > 0 && isFinite(radius))) {
    stop('Expected radius= to be a positive pixel value');
  }
  return radius;
}

function validateBlurGrid(grid) {
  if (!grid || !grid.samples || !grid.width || !grid.height || !grid.bands) {
    stop('Expected a raster grid');
  }
}

// Convert a Gaussian sigma to box widths using the method described by
// Ivan Kutskir / Peter Kovesi. Three box passes are a close, fast approximation.
function getGaussianBoxWidths(sigma, n) {
  var ideal = Math.sqrt((12 * sigma * sigma / n) + 1);
  var wl = Math.floor(ideal);
  if (wl % 2 === 0) wl--;
  var wu = wl + 2;
  var m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  var boxes = [];
  for (var i = 0; i < n; i++) {
    boxes.push(i < m ? wl : wu);
  }
  return boxes;
}

function blurRgbaGrid(grid, samples, channel, tmp, weights, boxes) {
  var alpha = new Float32Array(grid.width * grid.height);
  copyBandToChannel(grid, 3, alpha);
  blurChannel(alpha, tmp, weights, grid.width, grid.height, boxes);
  for (var band = 0; band < grid.bands; band++) {
    if (band < 3) {
      copyPremultipliedBandToChannel(grid, band, channel);
      blurChannel(channel, tmp, weights, grid.width, grid.height, boxes);
      copyUnpremultipliedChannelToBand(channel, alpha, samples, grid, band);
    } else {
      copyChannelToBand(alpha, samples, grid, 3);
    }
  }
}

function blurChannel(channel, tmp, weights, width, height, boxes) {
  boxes.forEach(function(widthPx) {
    var radius = Math.floor((widthPx - 1) / 2);
    if (radius < 1) return;
    if (weights) {
      boxBlurWeighted(channel, tmp, weights, width, height, radius);
    } else {
      boxBlur(channel, tmp, width, height, radius);
    }
  });
}

function boxBlur(src, tmp, width, height, radius) {
  boxBlurHorizontal(src, tmp, width, height, radius);
  boxBlurVertical(tmp, src, width, height, radius);
}

function boxBlurHorizontal(src, dest, width, height, radius) {
  var size = radius * 2 + 1;
  var x, y, row, sum;
  for (y = 0; y < height; y++) {
    row = y * width;
    sum = src[row] * (radius + 1);
    for (x = 1; x <= radius; x++) sum += src[row + Math.min(width - 1, x)];
    for (x = 0; x < width; x++) {
      dest[row + x] = sum / size;
      sum += src[row + Math.min(width - 1, x + radius + 1)] - src[row + Math.max(0, x - radius)];
    }
  }
}

function boxBlurVertical(src, dest, width, height, radius) {
  var size = radius * 2 + 1;
  var x, y, sum;
  for (x = 0; x < width; x++) {
    sum = src[x] * (radius + 1);
    for (y = 1; y <= radius; y++) sum += src[Math.min(height - 1, y) * width + x];
    for (y = 0; y < height; y++) {
      dest[y * width + x] = sum / size;
      sum += src[Math.min(height - 1, y + radius + 1) * width + x] - src[Math.max(0, y - radius) * width + x];
    }
  }
}

function boxBlurWeighted(src, tmp, weights, width, height, radius) {
  boxBlurHorizontalWeighted(src, tmp, weights, width, height, radius);
  boxBlurVerticalWeighted(tmp, src, weights, width, height, radius);
}

function boxBlurHorizontalWeighted(src, dest, weights, width, height, radius) {
  var x, y, row, id, addId, subId, sum, weightSum;
  for (y = 0; y < height; y++) {
    row = y * width;
    sum = src[row] * weights[row] * (radius + 1);
    weightSum = weights[row] * (radius + 1);
    for (x = 1; x <= radius; x++) {
      id = row + Math.min(width - 1, x);
      sum += src[id] * weights[id];
      weightSum += weights[id];
    }
    for (x = 0; x < width; x++) {
      id = row + x;
      dest[id] = weightSum > 0 ? sum / weightSum : src[id];
      addId = row + Math.min(width - 1, x + radius + 1);
      subId = row + Math.max(0, x - radius);
      sum += src[addId] * weights[addId] - src[subId] * weights[subId];
      weightSum += weights[addId] - weights[subId];
    }
  }
}

function boxBlurVerticalWeighted(src, dest, weights, width, height, radius) {
  var x, y, id, addId, subId, sum, weightSum;
  for (x = 0; x < width; x++) {
    sum = src[x] * weights[x] * (radius + 1);
    weightSum = weights[x] * (radius + 1);
    for (y = 1; y <= radius; y++) {
      id = Math.min(height - 1, y) * width + x;
      sum += src[id] * weights[id];
      weightSum += weights[id];
    }
    for (y = 0; y < height; y++) {
      id = y * width + x;
      dest[id] = weightSum > 0 ? sum / weightSum : src[id];
      addId = Math.min(height - 1, y + radius + 1) * width + x;
      subId = Math.max(0, y - radius) * width + x;
      sum += src[addId] * weights[addId] - src[subId] * weights[subId];
      weightSum += weights[addId] - weights[subId];
    }
  }
}

function copyBandToChannel(grid, band, channel) {
  var samples = grid.samples;
  var bands = grid.bands;
  for (var i = 0, j = band; i < channel.length; i++, j += bands) {
    channel[i] = samples[j];
  }
}

function copyPremultipliedBandToChannel(grid, band, channel) {
  var samples = grid.samples;
  var bands = grid.bands;
  var alphaOffset = 3 - band;
  var maxAlpha = getAlphaMaxValue(samples);
  for (var i = 0, j = band; i < channel.length; i++, j += bands) {
    channel[i] = samples[j] * samples[j + alphaOffset] / maxAlpha;
  }
}

function copyUnpremultipliedChannelToBand(channel, alpha, samples, grid, band) {
  var bands = grid.bands;
  var isFloat = samples instanceof Float32Array || samples instanceof Float64Array;
  var range = isFloat ? null : getTypedArrayRange(samples);
  var maxAlpha = getAlphaMaxValue(samples);
  var val, a;
  for (var i = 0, j = band; i < channel.length; i++, j += bands) {
    a = alpha[i];
    val = a > 0 ? channel[i] * maxAlpha / a : 0;
    samples[j] = isFloat ? val : clamp(Math.round(val), range.min, range.max);
  }
}

function copyChannelToBand(channel, samples, grid, band) {
  var bands = grid.bands;
  var isFloat = samples instanceof Float32Array || samples instanceof Float64Array;
  var range = isFloat ? null : getTypedArrayRange(samples);
  var val;
  for (var i = 0, j = band; i < channel.length; i++, j += bands) {
    val = channel[i];
    samples[j] = isFloat ? val : clamp(Math.round(val), range.min, range.max);
  }
}

function getRasterBlurWeights(grid) {
  if (!grid.coverage && grid.nodata == null) return null;
  var weights = new Float32Array(grid.width * grid.height);
  for (var i = 0; i < weights.length; i++) {
    weights[i] = rasterBlurPixelIsValid(grid, i) ? 1 : 0;
  }
  return weights;
}

function rasterBlurPixelIsValid(grid, pixelId) {
  var off, n;
  if (grid.coverage && grid.coverage[pixelId] === 0) return false;
  if (grid.nodata == null) return true;
  off = pixelId * grid.bands;
  n = Math.min(grid.bands, 3);
  for (var i = 0; i < n; i++) {
    if (grid.samples[off + i] != grid.nodata) return true;
  }
  return false;
}

function getAlphaMaxValue(samples) {
  if (samples instanceof Float32Array || samples instanceof Float64Array) return 1;
  return getTypedArrayRange(samples).max;
}

function getTypedArrayRange(arr) {
  if (arr instanceof Uint8Array || arr instanceof Uint8ClampedArray) return {min: 0, max: 255};
  if (arr instanceof Int8Array) return {min: -128, max: 127};
  if (arr instanceof Uint16Array) return {min: 0, max: 65535};
  if (arr instanceof Int16Array) return {min: -32768, max: 32767};
  if (arr instanceof Uint32Array) return {min: 0, max: 4294967295};
  if (arr instanceof Int32Array) return {min: -2147483648, max: 2147483647};
  return {min: -Infinity, max: Infinity};
}

function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}
