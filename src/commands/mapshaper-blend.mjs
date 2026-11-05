import cmd from '../mapshaper-cmd';
import { layerHasRaster, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { requireOverlaySourceCRS } from '../crs/mapshaper-projections';
import { blendShadingPixels } from '../rasters/mapshaper-raster-color';
import { getShadingAmounts, resampleShadingAmounts } from '../rasters/mapshaper-raster-blend';
import { getRasterGrid, rasterGridIsRotated, renderRasterPreview } from '../rasters/mapshaper-raster-utils';
import { getColoredRaster, rasterCanBeToned } from './mapshaper-tone';
import { stop } from '../utils/mapshaper-logging';

var DEFAULT_STRENGTH = [1, 1];
var DEFAULT_CHROMA = [0, 1]; // shadows as stacked, highlights without haze

// Applies a hillshade's shadows and highlights to a raster layer
// (see docs/development/raster-blend.md)
// @source {layer, dataset} of the hillshade
// Returns a new layer; -blend replaces the target unless + is used
cmd.blend = function(lyr, dataset, source, opts) {
  var grid, settings, shading, amounts, image, samples, out;
  if (!layerHasRaster(lyr)) {
    stop('-blend requires a raster target layer');
  }
  if (!source || !layerHasRaster(source.layer)) {
    stop('source= should name a hillshade layer');
  }
  if (source.layer == lyr) {
    stop('source= names the target layer');
  }
  requireOverlaySourceCRS(dataset, source.dataset);
  grid = getRasterGrid(lyr.raster);
  if (rasterGridIsRotated(grid) || rasterGridIsRotated(getRasterGrid(source.layer.raster))) {
    stop('-blend does not support rotated rasters');
  }
  settings = getBlendSettings(opts);
  shading = getShadingAmounts(source.layer.raster);
  amounts = resampleShadingAmounts(shading, grid);
  if (amounts == shading.amounts) amounts = amounts.slice();
  scaleShadingAmounts(amounts, settings.strength[0], settings.strength[1]);
  image = getImagePixels(lyr.raster);
  samples = blendShadingPixels(image.samples, image.bands, amounts, {
    shadow: shading.shadow,
    highlight: shading.highlight,
    shadowChroma: settings.chroma[0],
    highlightChroma: settings.chroma[1]
  });
  out = {
    raster_type: 'grid',
    raster: getColoredRaster(lyr.raster, grid, {samples: samples, bands: image.bands},
      Object.assign({type: 'blend', source: source.layer.name || null}, settings))
  };
  setOutputLayerName(out, lyr, 'blend', opts);
  return [out];
};

function getBlendSettings(opts) {
  return {
    strength: readShadowHighlightPair(opts.strength, DEFAULT_STRENGTH, 'strength'),
    chroma: readShadowHighlightPair(opts.chroma, DEFAULT_CHROMA, 'chroma')
  };
}

// One value for both shadows and highlights, or shadow,highlight
function readShadowHighlightPair(arr, defaultVal, name) {
  if (arr == null) return defaultVal.concat();
  if (arr.length < 1 || arr.length > 2 || !arr.every(function(v) { return v >= 0; })) {
    stop(name + '= should be one value, or two (shadows,highlights), of 0 or more');
  }
  return arr.length == 1 ? [arr[0], arr[0]] : arr.concat();
}

function scaleShadingAmounts(amounts, shadows, highlights) {
  var i, a;
  if (shadows == 1 && highlights == 1) return;
  for (i = 0; i < amounts.length; i++) {
    a = amounts[i];
    amounts[i] = a < 0 ? Math.max(-1, a * shadows) : Math.min(1, a * highlights);
  }
}

// RGB(A) images are blended as they are; other rasters (e.g. a tinted or
// classified data raster) as they are displayed
function getImagePixels(raster) {
  var grid = getRasterGrid(raster);
  var preview;
  if (rasterCanBeToned(raster)) {
    return {samples: grid.samples, bands: grid.bands};
  }
  preview = renderRasterPreview(grid, raster.view && raster.view.recipe, grid.width, grid.height);
  return {samples: preview.pixels, bands: 4};
}
