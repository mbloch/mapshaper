import cmd from '../mapshaper-cmd';
import { layerHasRaster, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { sharpenImageSamples } from '../rasters/mapshaper-raster-sharpen';
import { createRasterPreview, getRasterGrid } from '../rasters/mapshaper-raster-utils';
import { runningInBrowser } from '../mapshaper-env';
import { stop } from '../utils/mapshaper-logging';

var DEFAULT_SHARPEN_AMOUNT = 0.25;
var DEFAULT_SHARPEN_RADIUS = 3;

// Applies an unsharp mask to an image, or to the shading of a hillshade
// Returns a new layer; -sharpen replaces the target unless + is used
cmd.sharpen = function(lyr, opts) {
  var grid, settings, out;
  if (!layerHasRaster(lyr)) {
    stop('Command requires a raster layer');
  }
  grid = getRasterGrid(lyr.raster);
  validateSharpenGrid(grid);
  settings = getSharpenSettings(opts);
  out = {
    raster_type: 'grid',
    raster: getSharpenedRaster(lyr.raster, grid,
      sharpenImageSamples(grid, lyr.raster.derivation, settings))
  };
  setOutputLayerName(out, lyr, 'sharpen', opts);
  return [out];
};

export function getSharpenSettings(opts) {
  var amount = opts.amount == null ? DEFAULT_SHARPEN_AMOUNT : opts.amount;
  var radius = opts.radius == null ? DEFAULT_SHARPEN_RADIUS : opts.radius;
  var threshold = opts.threshold == null ? 0 : opts.threshold;
  if (!(amount >= 0 && amount <= 3)) stop('amount= should be from 0 to 3');
  if (!(radius > 0 && radius <= 20)) stop('radius= should be a number of pixels, up to 20');
  if (!(threshold >= 0 && threshold <= 1)) stop('threshold= should be from 0 to 1');
  return {amount: amount, radius: radius, threshold: threshold};
}

function validateSharpenGrid(grid) {
  if (!grid || !grid.samples || !grid.bbox) {
    stop('Raster layer is missing image data');
  }
  if (!(grid.samples instanceof Uint8Array || grid.samples instanceof Uint8ClampedArray)) {
    stop('-sharpen works on 8-bit images. To sharpen the shading of an elevation raster, use -hillshade first');
  }
  if (grid.bands != 1 && grid.bands != 3 && grid.bands != 4 || grid.colorModel == 'palette') {
    stop('-sharpen supports grayscale, RGB and RGBA images');
  }
}

// The source raster with new samples; its derivation is kept, so that a
// sharpened hillshade is still read as a hillshade (e.g. by -blend)
function getSharpenedRaster(src, grid, samples) {
  var raster = Object.assign({}, src, {
    grid: Object.assign({}, grid, {samples: samples}),
    view: Object.assign({}, src.view)
  });
  delete raster.view.preview;
  delete raster.view.scalingStats;
  if (runningInBrowser()) {
    raster.view.preview = createRasterPreview(raster, {});
  }
  return raster;
}
