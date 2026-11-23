// Gaussian-like blurs of Float32 channels, as repeated box blurs, plus an exact
// Gaussian for small blurs. This module has no imports, so that the hillshade
// worker bundle stays small.

export var BOX_BLUR_PASSES = 3;

// Box widths are odd integers, so at small sigmas the box passes miss the
// requested sigma by 5-10% (or don't blur at all, below 0.75) and give a
// box-shaped falloff.
var MAX_KERNEL_SIGMA = 3;

// Gaussian blur of a single Float32 channel, in place: a discrete Gaussian
// kernel up to MAX_KERNEL_SIGMA, box passes above it
// @tmp Float32Array the size of the channel
// @weights optional per-pixel weights (0 for invalid pixels), or null
export function blurChannelGaussian(channel, tmp, weights, width, height, sigma) {
  if (!(sigma > 0)) return channel;
  if (sigma <= MAX_KERNEL_SIGMA) {
    kernelBlur(channel, tmp, weights, width, height, getDiscreteGaussianKernel(sigma));
  } else {
    blurChannel(channel, tmp, weights, width, height, getGaussianBoxWidths(sigma, BOX_BLUR_PASSES));
  }
  return channel;
}

// Weights of a symmetric kernel, from the center outwards. Uses the discrete
// Gaussian (e^-t * I_n(t), with t = sigma^2), whose variance is exactly sigma^2
// at any sigma; a sampled Gaussian comes out too narrow below about sigma 0.8.
// Truncated one pixel past 4 sigma; at small sigmas the tails of the discrete
// Gaussian are relatively heavy.
export function getDiscreteGaussianKernel(sigma) {
  var t = sigma * sigma;
  var reach = Math.ceil(sigma * 4) + 1;
  var kernel = new Float64Array(reach + 1);
  var sum = 0;
  for (var n = 0; n <= reach; n++) {
    kernel[n] = Math.exp(-t) * besselI(n, t);
    sum += n === 0 ? kernel[n] : kernel[n] * 2;
  }
  for (n = 0; n <= reach; n++) {
    kernel[n] /= sum;
  }
  return kernel;
}

// Modified Bessel function of the first kind, from its power series, which
// converges quickly for the arguments used here (x <= MAX_KERNEL_SIGMA^2)
function besselI(n, x) {
  var half = x / 2;
  var term = 1;
  var sum, k;
  for (k = 1; k <= n; k++) term *= half / k;
  sum = term;
  for (k = 1; k < 200 && term > sum * 1e-15; k++) {
    term *= half * half / (k * (k + n));
    sum += term;
  }
  return sum;
}

// Gaussian-like blur of a single Float32 channel, in place.
// @weights optional per-pixel weights (0 for invalid pixels), or null
// @sigma standard deviation in pixels
export function blurFloatChannel(channel, weights, width, height, sigma) {
  if (!(sigma > 0)) return channel;
  var tmp = new Float32Array(width * height);
  blurChannel(channel, tmp, weights, width, height, getGaussianBoxWidths(sigma, BOX_BLUR_PASSES));
  return channel;
}

// How far, in pixels, values travel in blurFloatChannel(): the sum of the
// radii of its box passes
export function getBlurReach(sigma) {
  if (!(sigma > 0)) return 0;
  return getGaussianBoxWidths(sigma, BOX_BLUR_PASSES).reduce(function(memo, widthPx) {
    return memo + Math.max(0, Math.floor((widthPx - 1) / 2));
  }, 0);
}

// Convert a Gaussian sigma to box widths using the method described by
// Ivan Kutskir / Peter Kovesi. Three box passes are a close, fast approximation.
export function getGaussianBoxWidths(sigma, n) {
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

export function blurChannel(channel, tmp, weights, width, height, boxes) {
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

// Separable convolution, in place. Like the box passes, it repeats edge pixels
// past the edges and, with weights, gives each pixel the weighted mean of its
// valid neighbors.
function kernelBlur(channel, tmp, weights, width, height, kernel) {
  if (weights) {
    kernelBlurHorizontalWeighted(channel, tmp, weights, width, height, kernel);
    kernelBlurVerticalWeighted(tmp, channel, weights, width, height, kernel);
  } else {
    kernelBlurHorizontal(channel, tmp, width, height, kernel);
    kernelBlurVertical(tmp, channel, width, height, kernel);
  }
}

function kernelBlurHorizontal(src, dest, width, height, kernel) {
  var reach = kernel.length - 1;
  var padded = new Float64Array(width + reach * 2);
  var x, y, k, i, row, c, sum;
  for (y = 0; y < height; y++) {
    row = y * width;
    for (i = 0; i < padded.length; i++) {
      padded[i] = src[row + clampIndex(i - reach, width)];
    }
    for (x = 0; x < width; x++) {
      c = x + reach;
      sum = padded[c] * kernel[0];
      for (k = 1; k <= reach; k++) {
        sum += (padded[c - k] + padded[c + k]) * kernel[k];
      }
      dest[row + x] = sum;
    }
  }
}

function kernelBlurVertical(src, dest, width, height, kernel) {
  var reach = kernel.length - 1;
  var sums = new Float64Array(width);
  var x, y, k, row, above, below, w;
  for (y = 0; y < height; y++) {
    row = y * width;
    w = kernel[0];
    for (x = 0; x < width; x++) sums[x] = src[row + x] * w;
    for (k = 1; k <= reach; k++) {
      above = clampIndex(y - k, height) * width;
      below = clampIndex(y + k, height) * width;
      w = kernel[k];
      for (x = 0; x < width; x++) sums[x] += (src[above + x] + src[below + x]) * w;
    }
    for (x = 0; x < width; x++) dest[row + x] = sums[x];
  }
}

function kernelBlurHorizontalWeighted(src, dest, weights, width, height, kernel) {
  var reach = kernel.length - 1;
  var values = new Float64Array(width + reach * 2);
  var wts = new Float64Array(width + reach * 2);
  var x, y, k, i, id, row, c, sum, weightSum;
  for (y = 0; y < height; y++) {
    row = y * width;
    for (i = 0; i < values.length; i++) {
      id = row + clampIndex(i - reach, width);
      wts[i] = weights[id];
      values[i] = getWeightedValue(src, weights, id);
    }
    for (x = 0; x < width; x++) {
      c = x + reach;
      sum = values[c] * kernel[0];
      weightSum = wts[c] * kernel[0];
      for (k = 1; k <= reach; k++) {
        sum += (values[c - k] + values[c + k]) * kernel[k];
        weightSum += (wts[c - k] + wts[c + k]) * kernel[k];
      }
      dest[row + x] = weightSum > 0 ? sum / weightSum : src[row + x];
    }
  }
}

function kernelBlurVerticalWeighted(src, dest, weights, width, height, kernel) {
  var reach = kernel.length - 1;
  var sums = new Float64Array(width);
  var weightSums = new Float64Array(width);
  var x, y, k, id, row, above, below, w;
  for (y = 0; y < height; y++) {
    row = y * width;
    w = kernel[0];
    for (x = 0; x < width; x++) {
      id = row + x;
      sums[x] = getWeightedValue(src, weights, id) * w;
      weightSums[x] = weights[id] * w;
    }
    for (k = 1; k <= reach; k++) {
      above = clampIndex(y - k, height) * width;
      below = clampIndex(y + k, height) * width;
      w = kernel[k];
      for (x = 0; x < width; x++) {
        sums[x] += (getWeightedValue(src, weights, above + x) + getWeightedValue(src, weights, below + x)) * w;
        weightSums[x] += (weights[above + x] + weights[below + x]) * w;
      }
    }
    for (x = 0; x < width; x++) {
      id = row + x;
      dest[id] = weightSums[x] > 0 ? sums[x] / weightSums[x] : src[id];
    }
  }
}

// Invalid pixels may hold NaN, which a weight of 0 doesn't cancel
function getWeightedValue(src, weights, id) {
  return weights[id] > 0 ? src[id] * weights[id] : 0;
}

function clampIndex(i, n) {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
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
