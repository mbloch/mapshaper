import cmd from '../mapshaper-cmd';
import { parseColor } from '../color/color-utils';
import { layerHasRaster, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { applyOpacityAndBackground, toneRgbPixels } from '../rasters/mapshaper-raster-color';
import { createRasterPreview, getRasterGrid, getRasterViewRecipe } from '../rasters/mapshaper-raster-utils';
import { runningInBrowser } from '../mapshaper-env';
import { stop } from '../utils/mapshaper-logging';

// Adjusts the colors of an RGB image (see docs/development/raster-tone-tint.md)
// Returns a new layer; -tone replaces the target unless + is used
cmd.tone = function(lyr, opts) {
  var grid, saturation, lightness, opacity, background, samples, result, out;
  if (!layerHasRaster(lyr)) {
    stop('Command requires a raster layer');
  }
  grid = getRasterGrid(lyr.raster);
  validateToneGrid(grid);
  saturation = opts.saturation == null ? 1 : opts.saturation;
  lightness = opts.lightness == null ? 1 : opts.lightness;
  if (!(saturation >= 0)) stop('saturation= should be 0 or more');
  if (!(lightness >= 0)) stop('lightness= should be 0 or more');
  opacity = getRasterOpacity(opts);
  background = getRasterBackground(opts);
  samples = saturation == 1 && lightness == 1 ? grid.samples :
    toneRgbPixels(grid.samples, grid.bands, {saturation: saturation, lightness: lightness});
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
      opacity: opacity,
      background: opts.background || null
    })
  };
  setOutputLayerName(out, lyr, 'tone', opts);
  return [out];
};

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
