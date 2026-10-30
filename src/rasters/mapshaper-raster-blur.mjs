import { getRasterGrid } from './mapshaper-raster-utils';
import {
  getSampleArrayRange,
  rasterGridHasInvalidPixels,
  rasterPixelIsValid,
  rasterSamplesAreFloat
} from './mapshaper-raster-grid';
import { convertIntervalParam, parseMeasure } from '../geom/mapshaper-units';
import { stop } from '../utils/mapshaper-logging';
import { BOX_BLUR_PASSES, blurChannel, getGaussianBoxWidths } from './mapshaper-box-blur';

export { blurFloatChannel } from './mapshaper-box-blur';

export function blurRasterGrid(raster, optsArg, crs) {
  var opts = optsArg || {};
  var grid = getRasterGrid(raster);
  var radius = getBlurRadius(grid, opts, crs);
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

// The blur kernel works in pixels, but the radius may be given either in pixels
// (a bare number or a px suffix) or as a real-world distance (e.g. 20m), which
// is converted using the size of a pixel on the ground.
export function getBlurRadius(grid, opts, crs) {
  var arg = opts.radius;
  var measure, radius;
  if (arg === null || arg === undefined || arg === '') {
    stop('Missing blur radius');
  }
  if (typeof arg == 'string' && /px$/i.test(arg.trim())) {
    radius = Number(arg.trim().replace(/px$/i, ''));
  } else {
    measure = parseMeasure(arg);
    radius = measure.units ?
      convertDistanceToPixels(arg, grid, crs) :
      measure.value;
  }
  if (!(radius > 0 && isFinite(radius))) {
    stop('Expected a positive blur radius, received:', arg);
  }
  return radius;
}

function convertDistanceToPixels(arg, grid, crs) {
  // convertIntervalParam() gives the distance in the coordinate units of the
  // dataset, which is what the grid's bbox is measured in.
  return convertIntervalParam(arg, crs) / getPixelSize(grid);
}

// Blurring is isotropic in pixel space, so a distance has to map to a single
// pixel count; use the geometric mean when the pixels are not square.
function getPixelSize(grid) {
  var bbox = grid.bbox;
  var dx, dy;
  if (!bbox) {
    stop('Raster layer is missing the georeferencing needed to blur by a distance');
  }
  dx = Math.abs(bbox[2] - bbox[0]) / grid.width;
  dy = Math.abs(bbox[3] - bbox[1]) / grid.height;
  return Math.sqrt(dx * dy);
}

function validateBlurGrid(grid) {
  if (!grid || !grid.samples || !grid.width || !grid.height || !grid.bands) {
    stop('Expected a raster grid');
  }
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
  var isFloat = rasterSamplesAreFloat(samples);
  var range = isFloat ? null : getSampleArrayRange(samples);
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
  var isFloat = rasterSamplesAreFloat(samples);
  var range = isFloat ? null : getSampleArrayRange(samples);
  var val;
  for (var i = 0, j = band; i < channel.length; i++, j += bands) {
    val = channel[i];
    samples[j] = isFloat ? val : clamp(Math.round(val), range.min, range.max);
  }
}

function getRasterBlurWeights(grid) {
  if (!rasterGridHasInvalidPixels(grid)) return null;
  var weights = new Float32Array(grid.width * grid.height);
  for (var i = 0; i < weights.length; i++) {
    weights[i] = rasterPixelIsValid(grid, i) ? 1 : 0;
  }
  return weights;
}

function getAlphaMaxValue(samples) {
  if (rasterSamplesAreFloat(samples)) return 1;
  return getSampleArrayRange(samples).max;
}

function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}
