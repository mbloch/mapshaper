// Gaussian-like blurs of Float32 channels, as repeated box blurs. This module
// has no imports, so that the hillshade worker bundle stays small.

export var BOX_BLUR_PASSES = 3;

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
