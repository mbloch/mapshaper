import cmd from '../mapshaper-cmd';
import { parseColor } from '../color/color-utils';
import { layerHasRaster, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { applyOpacityAndBackground, DEFAULT_HUE_PIVOT_DEGREES, getContrastPivots, getImageLightnessPercentiles,
  getOklchHue, toneRgbPixels } from '../rasters/mapshaper-raster-color';
import { getRasterValidityMask } from '../rasters/mapshaper-raster-grid';
import { createRasterPreview, getRasterGrid, getRasterViewRecipe } from '../rasters/mapshaper-raster-utils';
import { runningInBrowser } from '../mapshaper-env';
import { stop } from '../utils/mapshaper-logging';

var PIVOT_PERCENTILES = [1, 99];
var PIVOT_SAMPLES = 1e6;

// Adjusts the colors of an RGB image (see docs/development/raster-tone-tint.md)
// Returns a new layer; -tone replaces the target unless + is used
cmd.tone = function(lyr, opts) {
  var grid, saturation, lightness, gamma, contrast, pivots, hueShift, huePivot, opacity, background, samples, result, out;
  if (!layerHasRaster(lyr)) {
    stop('Command requires a raster layer');
  }
  grid = getRasterGrid(lyr.raster);
  validateToneGrid(grid);
  saturation = opts.saturation == null ? 1 : opts.saturation;
  lightness = opts.lightness == null ? 1 : opts.lightness;
  if (!(saturation >= 0)) stop('saturation= should be 0 or more');
  if (!(lightness >= 0 && lightness <= 2)) stop('lightness= should be from 0 to 2');
  gamma = opts.gamma == null ? 1 : opts.gamma;
  if (!(gamma > 0)) stop('gamma= should be a positive number');
  contrast = opts.contrast == null ? 1 : opts.contrast;
  if (!(contrast >= 0)) stop('contrast= should be 0 or more');
  hueShift = opts.hue_shift == null ? 0 : opts.hue_shift;
  if (!(hueShift >= -1 && hueShift <= 1)) stop('hue-shift= should be from -1 to 1');
  huePivot = getHuePivot(opts.hue_pivot);
  opacity = getRasterOpacity(opts);
  background = getRasterBackground(opts);
  pivots = gamma == 1 && contrast == 1 ? null : getPivots(grid);
  samples = saturation == 1 && lightness == 1 && !pivots && hueShift === 0 ? grid.samples :
    toneRgbPixels(grid.samples, grid.bands, {saturation: saturation, lightness: lightness,
      gamma: gamma, contrast: contrast, pivots: pivots, hueShift: hueShift, huePivot: huePivot});
  result = applyOpacityAndBackground(samples, grid.bands, opacity, background);
  if (result.samples == grid.samples) {
    result.samples = grid.samples.slice();
  }
  out = {
    raster_type: 'grid',
    raster: getColoredRaster(lyr.raster, grid, result, {
      type: 'tone',
      saturation: saturation,
      lightness: lightness,
      gamma: gamma,
      contrast: contrast,
      pivots: pivots,
      contrast_pivots: pivots ? getContrastPivots(pivots, contrast).map(roundLightness) : null,
      hue_shift: hueShift,
      hue_pivot: huePivot,
      opacity: opacity,
      background: opts.background || null
    })
  };
  setOutputLayerName(out, lyr, 'tone', opts);
  return [out];
};

// @arg a hue angle in degrees, or a color whose OKLCH hue is used
// Returns degrees
function getHuePivot(arg) {
  var color, hue;
  if (arg == null || arg === '') return DEFAULT_HUE_PIVOT_DEGREES;
  if (/^-?[0-9.]+$/.test(String(arg))) {
    hue = Number(arg) % 360;
    return hue < 0 ? hue + 360 : hue;
  }
  color = parseColor(String(arg));
  if (!color) stop('Unsupported hue-pivot=', arg);
  hue = getOklchHue(color.r, color.g, color.b);
  if (hue === null) stop('hue-pivot= needs a color with a hue (not a gray)');
  return Math.round(hue * 10) / 10;
}

// The image's 1st and 99th percentile lightness, the pivots of contrast= and
// gamma= (the extremes are usually a few clouds or shadows)
function getPivots(grid) {
  var range = getImageLightnessPercentiles(grid.samples, grid.bands,
    getRasterValidityMask(grid), PIVOT_PERCENTILES, PIVOT_SAMPLES);
  return range && range[1] > range[0] ? range.map(roundLightness) : null;
}

function roundLightness(L) {
  return Math.round(L * 1000) / 1000;
}

function validateToneGrid(grid) {
  if (!grid || !grid.samples || !grid.bbox) {
    stop('Raster layer is missing image data');
  }
  if (grid.bands < 3) {
    stop('-tone adjusts RGB images. To color an elevation raster, use -tint or -hillshade');
  }
  if (!(grid.samples instanceof Uint8Array || grid.samples instanceof Uint8ClampedArray) ||
      grid.bands > 4 || grid.colorModel == 'palette') {
    stop('-tone supports 8-bit RGB and RGBA images');
  }
}

export function getRasterOpacity(opts) {
  var opacity = opts.opacity == null ? 1 : opts.opacity;
  if (!(opacity >= 0 && opacity <= 1)) {
    stop('opacity= should be from 0 to 1');
  }
  return opacity;
}

export function getRasterBackground(opts) {
  var color;
  if (!opts.background) return null;
  color = parseColor(opts.background);
  if (!color) stop('Unsupported background=', opts.background);
  return color;
}

// @result {samples, bands}: uint8 RGB or RGBA samples
// @params settings recorded in the raster's derivation
export function getColoredRaster(src, grid, result, params) {
  var bands = result.bands == 4 ? [0, 1, 2, 3] : [0, 1, 2];
  var raster = {
    sourceId: src.sourceId,
    interpretation: 'image',
    grid: {
      width: grid.width,
      height: grid.height,
      bands: result.bands,
      pixelType: 'uint8',
      samples: result.samples,
      sampleBands: bands,
      nodata: null,
      bbox: grid.bbox.concat(),
      transform: grid.transform ? grid.transform.concat() : null
    },
    derivation: Object.assign({sourceId: src.sourceId}, params),
    view: {recipe: {type: 'rgb', bands: bands, scaling: 'none'}}
  };
  raster.view.recipe = getRasterViewRecipe(raster.grid, raster.view.recipe, {});
  if (runningInBrowser()) {
    raster.view.preview = createRasterPreview(raster, {});
  }
  return raster;
}
