import { getRasterValidityMask, getSampleArrayRange, rasterSamplesAreFloat } from './mapshaper-raster-grid';
import { getRasterDisplayBands } from './mapshaper-raster-display-bands';
import { stop } from '../utils/mapshaper-logging';

// Resampling of a north-up raster grid onto another north-up grid in the same
// coordinate system (see -resample). Each axis gets a table of the source
// pixels and weights that make up each output column or row, so the grid is
// resampled in two separable passes. Invalid pixels get no weight, and each
// output pixel is divided by the weight of the valid pixels it read; passing
// the weights through both passes keeps that division exact in 2D.
//
// Methods:
//   average   the source pixels under the output pixel, weighted by area
//   bilinear  a triangle filter, widened when reducing so nothing is skipped
//   bicubic   Catmull-Rom, widened when reducing like bilinear. Sharp, but
//             its negative weights overshoot at sharp edges: a hillshade of
//             an enlarged DEM shows sharp crests as beaded lines
//   bspline   cubic B-spline, widened like bilinear. Its weights are all
//             positive and its slopes change smoothly, so a hillshade of an
//             enlarged DEM has neither beads nor bilinear's sawtooth crests;
//             it is softer (about a Gaussian of 0.6 source pixels)
//   nearest   the source pixel under the output pixel's center
//   auto      average when reducing, and @enlargeMethod when enlarging, by
//             axis

export var RESAMPLE_METHODS = ['average', 'bilinear', 'bicubic', 'bspline', 'nearest'];

// With negative bicubic weights, an output pixel next to many invalid pixels
// can be left with little weight, and dividing by it would amplify noise
var MIN_VALID_WEIGHT = 0.25;

// @bbox, @width, @height the output grid
// @enlargeMethod the method of 'auto' when enlarging (default is bspline)
// Returns a new grid; output pixels whose centers fall on invalid or missing
// source pixels have a coverage of 0 and samples of 0
export function resampleRasterGrid(grid, bbox, width, height, methodArg, enlargeMethod) {
  var method = methodArg || 'auto';
  var enlarge = enlargeMethod || 'bspline';
  var rb = grid.bbox;
  var srcDx = (rb[2] - rb[0]) / grid.width;
  var srcDy = (rb[3] - rb[1]) / grid.height;
  var xRatio = (bbox[2] - bbox[0]) / width / srcDx;
  var yRatio = (bbox[3] - bbox[1]) / height / srcDy;
  var xTable = getAxisTable((bbox[0] - rb[0]) / srcDx, xRatio, width, grid.width, getAxisMethod(method, xRatio, enlarge));
  var yTable = getAxisTable((rb[3] - bbox[3]) / srcDy, yRatio, height, grid.height, getAxisMethod(method, yRatio, enlarge));
  var validity = getRasterValidityMask(grid);
  var coverage = getResampledCoverage(xTable, yTable, validity, grid.width);
  var samples = new grid.samples.constructor(width * height * grid.bands);
  var out;
  if (method == 'nearest') {
    copyNearestSamples(grid, samples, xTable, yTable, coverage);
  } else {
    resampleBands(grid, samples, xTable, yTable, validity, coverage);
  }
  out = Object.assign({}, grid, {
    width: width,
    height: height,
    samples: samples,
    coverage: coverage,
    bbox: bbox.concat(),
    transform: [(bbox[2] - bbox[0]) / width, 0, bbox[0], 0, -(bbox[3] - bbox[1]) / height, bbox[3]]
  });
  if (!grid.coverage && coverage.indexOf(0) == -1) delete out.coverage;
  return out;
}

function getAxisMethod(method, ratio, enlargeMethod) {
  if (RESAMPLE_METHODS.includes(method)) return method;
  if (method != 'auto') stop('Unsupported resampling method:', method);
  return ratio < 1 ? enlargeMethod : 'average';
}

// The source pixels and weights of each of @n output pixels along one axis
// @start position of the output's first edge, in source pixels
// @ratio source pixels per output pixel
// @srcN source pixels along the axis
// Returns {n, offsets, indexes, weights, centers, min, max}: the entries of
// output pixel i are offsets[i] to offsets[i + 1]; centers[i] is the source
// pixel under its center (see getCenterPixel()), or -1; min and max bound
// the indexes
export function getAxisTable(start, ratio, n, srcN, method) {
  var offsets = new Int32Array(n + 1);
  var centers = new Int32Array(n);
  var indexes = [], weights = [];
  var min = srcN, max = -1;
  var i, u, first, count, sum, j;
  for (i = 0; i < n; i++) {
    u = start + (i + 0.5) * ratio;
    centers[i] = getCenterPixel(u, ratio, srcN);
    first = indexes.length;
    addAxisWeights(u, ratio, srcN, method, indexes, weights);
    count = indexes.length - first;
    sum = 0;
    for (j = first; j < first + count; j++) sum += weights[j];
    for (j = first; j < first + count; j++) {
      weights[j] /= sum;
      if (indexes[j] < min) min = indexes[j];
      if (indexes[j] > max) max = indexes[j];
    }
    offsets[i + 1] = indexes.length;
  }
  return {
    n: n,
    offsets: offsets,
    indexes: Int32Array.from(indexes),
    weights: Float64Array.from(weights),
    centers: centers,
    min: max < 0 ? 0 : min,
    max: max
  };
}

// An output pixel that overlaps the edge of the grid takes the edge pixel,
// even if its center is off the grid. Otherwise an output grid aligned to a
// frame, which extends up to a pixel beyond the raster, would have a
// transparent edge where the raster had partly covered pixels.
function getCenterPixel(u, ratio, srcN) {
  var k = Math.floor(u);
  if (k < 0) return u + ratio / 2 > 0 ? 0 : -1;
  if (k >= srcN) return u - ratio / 2 < srcN ? srcN - 1 : -1;
  return k;
}

// Interpolating filters repeat the edge pixels beyond the grid; averaging
// leaves out the part of a footprint that is off the grid
function addAxisWeights(u, ratio, srcN, method, indexes, weights) {
  var first = indexes.length;
  var lo, hi, radius, support, k, w;
  if (method == 'nearest') {
    k = Math.floor(u);
    if (k >= 0 && k < srcN) addWeight(k, 1, first, indexes, weights);
  } else if (method == 'average') {
    lo = u - ratio / 2;
    hi = u + ratio / 2;
    for (k = Math.max(0, Math.floor(lo)); k < Math.min(srcN, Math.ceil(hi)); k++) {
      w = Math.min(hi, k + 1) - Math.max(lo, k);
      if (w > 0) addWeight(k, w, first, indexes, weights);
    }
  } else {
    radius = Math.max(1, ratio);
    support = method == 'bilinear' ? 1 : 2;
    for (k = Math.floor(u - 0.5 - support * radius); k <= Math.ceil(u - 0.5 + support * radius); k++) {
      w = method == 'bilinear' ? linearWeight((k + 0.5 - u) / radius) :
        cubicWeight((k + 0.5 - u) / radius, CUBIC_PARAMS[method]);
      if (w !== 0) addWeight(Math.max(0, Math.min(srcN - 1, k)), w, first, indexes, weights);
    }
  }
}

// Mitchell-Netravali B and C
var CUBIC_PARAMS = {
  bicubic: [0, 0.5], // Catmull-Rom
  bspline: [1, 0]
};

// Indexes arrive in order, so clamped indexes repeat only at the end. Only
// the entries of the current output pixel, from @first on, can be merged.
function addWeight(k, w, first, indexes, weights) {
  var last = indexes.length - 1;
  if (last >= first && indexes[last] == k) {
    weights[last] += w;
  } else {
    indexes.push(k);
    weights.push(w);
  }
}

function linearWeight(x) {
  x = Math.abs(x);
  return x < 1 ? 1 - x : 0;
}

function cubicWeight(x, params) {
  var B = params[0], C = params[1];
  x = Math.abs(x);
  if (x < 1) return ((12 - 9 * B - 6 * C) * x * x * x + (-18 + 12 * B + 6 * C) * x * x + (6 - 2 * B)) / 6;
  if (x < 2) return ((-B - 6 * C) * x * x * x + (6 * B + 30 * C) * x * x + (-12 * B - 48 * C) * x + (8 * B + 24 * C)) / 6;
  return 0;
}

function getResampledCoverage(xTable, yTable, validity, srcWidth) {
  var coverage = new Uint8Array(xTable.n * yTable.n);
  var i, j, cx, cy;
  for (j = 0; j < yTable.n; j++) {
    cy = yTable.centers[j];
    if (cy < 0) continue;
    for (i = 0; i < xTable.n; i++) {
      cx = xTable.centers[i];
      if (cx >= 0 && (!validity || validity[cy * srcWidth + cx])) {
        coverage[j * xTable.n + i] = 1;
      }
    }
  }
  return coverage;
}

function copyNearestSamples(grid, samples, xTable, yTable, coverage) {
  var bands = grid.bands;
  var src = grid.samples;
  var i, j, p, s, b;
  for (j = 0; j < yTable.n; j++) {
    for (i = 0; i < xTable.n; i++) {
      p = j * xTable.n + i;
      if (!coverage[p]) continue;
      s = (yTable.centers[j] * grid.width + xTable.centers[i]) * bands;
      for (b = 0; b < bands; b++) samples[p * bands + b] = src[s + b];
    }
  }
}

// An image's color bands are averaged premultiplied by alpha, so that
// transparent pixels don't tint their neighbors
function resampleBands(grid, samples, xTable, yTable, validity, coverage) {
  var win = getSourceWindow(xTable, yTable);
  var alpha = getRasterDisplayBands(grid).alpha;
  var isFloat = rasterSamplesAreFloat(grid.samples);
  var range = getSampleArrayRange(grid.samples);
  var maxAlpha = isFloat ? 1 : range.max;
  var channel = new Float32Array(win.width * win.height);
  var mask = getWindowMask(grid, win, validity);
  var weightSums = mask ? resampleChannel(mask, win, xTable, yTable) : null;
  var alphaSums = null;
  var bandOrder = [];
  var b, sums;
  for (b = 0; b < grid.bands; b++) {
    if (b != alpha) bandOrder.push(b);
  }
  if (alpha > -1) bandOrder.unshift(alpha);
  bandOrder.forEach(function(band) {
    var premultiply = alphaSums && band != alpha;
    copyWindowChannel(grid, band, win, mask, premultiply ? alpha : -1, maxAlpha, channel);
    sums = resampleChannel(channel, win, xTable, yTable);
    writeBand(grid, samples, band, sums, weightSums, premultiply ? alphaSums : null, maxAlpha,
      xTable, yTable, coverage, isFloat, range);
    if (band == alpha) alphaSums = sums;
  });
}

// The part of the source grid that the tables read, with the tables' indexes
// made relative to it
function getSourceWindow(xTable, yTable) {
  return {
    x: xTable.min,
    y: yTable.min,
    width: Math.max(0, xTable.max - xTable.min + 1),
    height: Math.max(0, yTable.max - yTable.min + 1)
  };
}

// 1 for valid pixels of the window and 0 for others, or null if all are valid.
// Invalid pixels may hold NaN, which a weight of 0 doesn't cancel, so they are
// zeroed in the channel too (see copyWindowChannel()).
function getWindowMask(grid, win, validity) {
  var mask = null;
  var isFloat = rasterSamplesAreFloat(grid.samples);
  var x, y, s, valid;
  if (!validity && !isFloat) return null;
  for (y = 0; y < win.height; y++) {
    for (x = 0; x < win.width; x++) {
      s = (win.y + y) * grid.width + win.x + x;
      valid = !validity || validity[s] > 0;
      if (valid && isFloat) valid = !gridPixelHasNaN(grid, s);
      if (!valid && !mask) mask = createFilledArray(win.width * win.height, 1);
      if (mask) mask[y * win.width + x] = valid ? 1 : 0;
    }
  }
  return mask;
}

function gridPixelHasNaN(grid, pixel) {
  var s = pixel * grid.bands;
  for (var b = 0; b < grid.bands; b++) {
    if (grid.samples[s + b] !== grid.samples[s + b]) return true;
  }
  return false;
}

function createFilledArray(n, val) {
  var arr = new Float32Array(n);
  arr.fill(val);
  return arr;
}

function copyWindowChannel(grid, band, win, mask, alpha, maxAlpha, channel) {
  var src = grid.samples;
  var bands = grid.bands;
  var x, y, i, s;
  for (y = 0; y < win.height; y++) {
    for (x = 0; x < win.width; x++) {
      i = y * win.width + x;
      s = ((win.y + y) * grid.width + win.x + x) * bands;
      if (mask && mask[i] === 0) {
        channel[i] = 0;
      } else {
        channel[i] = alpha > -1 ? src[s + band] * src[s + alpha] / maxAlpha : src[s + band];
      }
    }
  }
}

// Weighted sums of @channel (a window of the source grid) for each output
// pixel. The pass that shrinks the data more goes first, to keep the
// intermediate array small.
function resampleChannel(channel, win, xTable, yTable) {
  var out = new Float32Array(xTable.n * yTable.n);
  var tmp;
  if (win.height * xTable.n <= yTable.n * win.width) {
    tmp = new Float32Array(win.height * xTable.n);
    resampleRows(channel, win.width, win.height, xTable, win.x, tmp);
    resampleColumns(tmp, xTable.n, yTable, win.y, out);
  } else {
    tmp = new Float32Array(yTable.n * win.width);
    resampleColumns(channel, win.width, yTable, win.y, tmp);
    resampleRows(tmp, win.width, yTable.n, xTable, win.x, out);
  }
  return out;
}

function resampleRows(src, srcWidth, rows, table, offset, dest) {
  var n = table.n, offsets = table.offsets, indexes = table.indexes, weights = table.weights;
  var r, i, t, s, sum;
  for (r = 0; r < rows; r++) {
    s = r * srcWidth - offset;
    for (i = 0; i < n; i++) {
      sum = 0;
      for (t = offsets[i]; t < offsets[i + 1]; t++) {
        sum += weights[t] * src[s + indexes[t]];
      }
      dest[r * n + i] = sum;
    }
  }
}

function resampleColumns(src, width, table, offset, dest) {
  var offsets = table.offsets, indexes = table.indexes, weights = table.weights;
  var j, t, i, d, s, w;
  for (j = 0; j < table.n; j++) {
    d = j * width;
    for (t = offsets[j]; t < offsets[j + 1]; t++) {
      w = weights[t];
      s = (indexes[t] - offset) * width;
      for (i = 0; i < width; i++) {
        dest[d + i] += w * src[s + i];
      }
    }
  }
}

function writeBand(grid, samples, band, sums, weightSums, alphaSums, maxAlpha, xTable, yTable,
    coverage, isFloat, range) {
  var bands = grid.bands;
  var width = xTable.n;
  var i, j, p, w, val;
  for (j = 0; j < yTable.n; j++) {
    for (i = 0; i < width; i++) {
      p = j * width + i;
      if (!coverage[p]) continue;
      w = weightSums ? weightSums[p] : 1;
      if (w < MIN_VALID_WEIGHT) {
        val = grid.samples[(yTable.centers[j] * grid.width + xTable.centers[i]) * bands + band];
      } else if (alphaSums) {
        val = alphaSums[p] > 0 ? sums[p] * maxAlpha / alphaSums[p] : 0;
      } else {
        val = sums[p] / w;
      }
      samples[p * bands + band] = isFloat ? val : Math.max(range.min, Math.min(range.max, Math.round(val)));
    }
  }
}
