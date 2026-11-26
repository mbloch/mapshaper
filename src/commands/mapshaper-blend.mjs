import cmd from '../mapshaper-cmd';
import { parseColor } from '../color/color-utils';
import { layerHasRaster, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { requireOverlaySourceCRS } from '../crs/mapshaper-projections';
import { blendShadingPixels, getShadingOverlayPixels } from '../rasters/mapshaper-raster-color';
import { getShadingAmounts, resampleShadingAmounts, scaleShadingAmounts } from '../rasters/mapshaper-raster-blend';
import { drawLayersOnGrid, getDrawingScale } from '../rasters/mapshaper-raster-draw';
import { getRasterGrid, rasterGridIsRotated, renderRasterPreview } from '../rasters/mapshaper-raster-utils';
import { getColoredRaster, rasterCanBeToned } from './mapshaper-tone';
import { stop } from '../utils/mapshaper-logging';

var DEFAULT_STRENGTH = [1, 1];
var DEFAULT_CHROMA = [0, 1]; // shadows as stacked, highlights without haze
var MIN_DRAWING_SCALE = 2; // like the default pixel-ratio= of PNG output
var MAX_DRAWING_PIXELS = 4e7;

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
    stop('source= should name a hillshade raster');
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
  shading = getShadingAmounts(source.layer.raster, readColorOption(opts.base_color, 'base-color'));
  amounts = resampleShadingAmounts(shading, grid);
  if (amounts == shading.amounts) amounts = amounts.slice();
  scaleShadingAmounts(amounts, settings.strength[0], settings.strength[1]);
  image = getImagePixels(lyr.raster);
  samples = blendShadingPixels(image.samples, image.bands, amounts,
    getBlendOptions(shading, settings));
  out = {
    raster_type: 'grid',
    raster: getColoredRaster(lyr.raster, grid, {samples: samples, bands: image.bands},
      Object.assign({type: 'blend', source: source.layer.name || null}, settings))
  };
  setOutputLayerName(out, lyr, 'blend', opts);
  return [out];
};

// Blends a hillshade with layers drawn together on the hillshade's grid: the
// targets of -blend if any of them is a vector layer, or if the overlay
// option is used (see docs/development/raster-blend.md)
// @layers [{layer, dataset}], bottom to top
// Returns the output layer: the drawn layers blended with the shading, or with
// overlay, the shading recolored so that stacked on the layers it gives the
// same result
cmd.blendDrawnLayers = async function(catalog, layers, source, opts) {
  var drawing, grid, settings, shading, amounts, pixels, blendOpts, samples, out;
  if (!source || !layerHasRaster(source.layer)) {
    stop('source= should name a hillshade raster');
  }
  if (layers.length === 0) {
    stop('-blend found no layers to blend');
  }
  layers.forEach(function(o) {
    if (o.layer == source.layer) stop('source= names a target layer');
    requireOverlaySourceCRS(o.dataset, source.dataset);
  });
  if (rasterGridIsRotated(getRasterGrid(source.layer.raster))) {
    stop('-blend does not support rotated rasters');
  }
  settings = getBlendSettings(opts);
  shading = getShadingAmounts(source.layer.raster, readColorOption(opts.base_color, 'base-color'));
  drawing = getDrawingGrid(catalog, layers, getRasterGrid(source.layer.raster));
  grid = drawing.grid;
  amounts = resampleShadingAmounts(shading, grid);
  scaleShadingAmounts(amounts, settings.strength[0], settings.strength[1]);
  pixels = await drawLayersOnGrid(layers, grid, drawing.scale);
  blendOpts = getBlendOptions(shading, settings);
  samples = blendShadingPixels(pixels, 4, amounts, blendOpts);
  if (opts.overlay) {
    samples = getShadingOverlayPixels(pixels, samples, amounts, blendOpts);
  }
  out = {
    raster_type: 'grid',
    raster: getColoredRaster(source.layer.raster, grid, {samples: samples, bands: 4},
      Object.assign({type: 'blend', source: source.layer.name || null}, settings,
        opts.overlay ? {overlay: true} : null))
  };
  if (opts.overlay) {
    setOutputLayerName(out, source.layer, 'blend', opts);
  } else {
    setOutputLayerName(out, layers.length == 1 ? layers[0].layer : null, 'blend', opts);
  }
  return out;
};

// The grid the layers are drawn on: the hillshade's grid, or a finer grid over
// the same area if the hillshade has fewer than MIN_DRAWING_SCALE pixels per
// CSS pixel of the map, so that the layers stay as sharp as in PNG output.
// Returns {grid, scale}, with scale in grid pixels per CSS pixel
function getDrawingGrid(catalog, layers, hillshadeGrid) {
  var g = hillshadeGrid;
  var scale = getDrawingScale(catalog, layers, g);
  var k = MIN_DRAWING_SCALE / scale;
  var width, height;
  if (k * k * g.width * g.height > MAX_DRAWING_PIXELS) {
    k = Math.sqrt(MAX_DRAWING_PIXELS / (g.width * g.height));
  }
  if (k <= 1) return {grid: g, scale: scale};
  width = Math.round(g.width * k);
  height = Math.round(g.height * k);
  return {
    grid: {width: width, height: height, bbox: g.bbox.concat(), transform: null},
    scale: scale * width / g.width
  };
}

function getBlendSettings(opts) {
  var settings = {
    strength: readShadowHighlightPair(opts.strength, DEFAULT_STRENGTH, 'strength'),
    chroma: readShadowHighlightPair(opts.chroma, DEFAULT_CHROMA, 'chroma'),
    base_color: opts.base_color || null
  };
  // recorded only if set, so that a blend's settings name the colors it was
  // given rather than the hillshade's
  if (opts.shadow_color) settings.shadow_color = opts.shadow_color;
  if (opts.highlight_color) settings.highlight_color = opts.highlight_color;
  if (opts.clip) settings.clip = true;
  return settings;
}

// blendShadingPixels() options. shadow-color= and highlight-color= replace
// the hillshade's colors in the stacking, after its amounts have been read
// with its own (which tell a transparent hillshade's shadows from its
// highlights)
function getBlendOptions(shading, settings) {
  return {
    shadow: readColorOption(settings.shadow_color, 'shadow-color') || shading.shadow,
    highlight: readColorOption(settings.highlight_color, 'highlight-color') || shading.highlight,
    shadowChroma: settings.chroma[0],
    highlightChroma: settings.chroma[1],
    clip: !!settings.clip
  };
}

// Returns {r, g, b}, or null if @str is empty
function readColorOption(str, name) {
  var color;
  if (!str) return null;
  color = parseColor(str);
  if (!color) stop('Unsupported ' + name + '=', str);
  return {r: color.r, g: color.g, b: color.b};
}

// One value for both shadows and highlights, or shadow,highlight
function readShadowHighlightPair(arr, defaultVal, name) {
  if (arr == null) return defaultVal.concat();
  if (arr.length < 1 || arr.length > 2 || !arr.every(function(v) { return v >= 0; })) {
    stop(name + '= should be one value, or two (shadows,highlights), of 0 or more');
  }
  return arr.length == 1 ? [arr[0], arr[0]] : arr.concat();
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
