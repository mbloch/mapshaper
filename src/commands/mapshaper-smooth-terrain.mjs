import cmd from '../mapshaper-cmd';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { layerHasRaster, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { getRasterValidityMask } from '../rasters/mapshaper-raster-grid';
import { createRasterPreview, getRasterGrid, getRasterGridBandIndex, rasterGridIsRotated } from '../rasters/mapshaper-raster-utils';
import { raiseLowElevations } from '../rasters/mapshaper-hillshade';
import { runSmoothingStage } from '../rasters/mapshaper-hillshade-runner';
import {
  formatSmoothingSettings,
  formatThresholdRange,
  getSmoothingParams,
  getSmoothingSettings,
  parseSmoothingLevel,
  validateFpsOptions
} from '../rasters/mapshaper-terrain-smoothing-options';
import { getElevationScale, getHillshadeCellSizes, rasterMayBeTerrain, readElevationBand } from './mapshaper-hillshade';
import { runningInBrowser } from '../mapshaper-env';
import { stop, verbose } from '../utils/mapshaper-logging';

// Feature-preserving smoothing of an elevation raster, as -hillshade smoothing=
// does before shading, so that contours and tints can use the same
// generalized terrain as a hillshade. The output records its settings in its
// derivation, so -hillshade doesn't smooth it again by default.
// Returns a new layer; -smooth-terrain replaces the target unless + is used
// @resume optional function to call after each wait for workers
//   (job.resumeCommand())
cmd.smoothTerrain = async function(lyr, dataset, opts, resume) {
  var grid, band, level, cells, valid, unitMeters, elev, raised, minElevation, params, result, out;
  if (!layerHasRaster(lyr)) {
    stop('Command requires a raster layer');
  }
  grid = getRasterGrid(lyr.raster);
  validateTerrainGrid(lyr.raster, grid);
  band = getRasterGridBandIndex(grid, opts.band);
  level = parseSmoothingLevel(opts.level, 'The smoothing level', 1);
  validateFpsOptions(opts);
  if (opts.workers != null && !(opts.workers >= 0 && opts.workers <= 64)) {
    stop('workers= should be from 0 to 64');
  }
  params = getSmoothingParams(level, opts);
  verbose('Settings:', formatSmoothingSettings(params));
  cells = getHillshadeCellSizes(grid, getDatasetCRS(dataset));
  valid = getRasterValidityMask(grid);
  unitMeters = getElevationScale(lyr, grid, band, valid, cells,
    'it was smoothed as if its relief had a typical steepness', 'To smooth it to scale');
  // min-elevation= is in the raster's own units, like the values -info shows
  minElevation = opts.min_elevation != null ? opts.min_elevation * unitMeters : null;
  elev = readElevationBand(grid, band, unitMeters);
  raised = minElevation != null ? raiseLowElevations(elev, valid, minElevation) : null;
  result = await runSmoothingStage({
    elev: elev,
    valid: valid,
    width: grid.width,
    height: grid.height,
    cellWidths: cells.widths,
    cellHeights: cells.heights
  }, getSmoothingSettings(level, opts, cells.median, minElevation), {workers: opts.workers, resume: resume});
  if (result.workers > 0) {
    verbose('Workers:', result.workers);
  }
  if (result.thresholds) {
    verbose('FPS thresholds:', formatThresholdRange(result.thresholds, valid));
  }
  if (opts.min_elevation != null) {
    params.min_elevation = opts.min_elevation;
  }
  out = {
    raster_type: 'grid',
    raster: getSmoothedRaster(lyr.raster, grid,
      getSmoothedSamples(grid, band, result.elev, valid, raised, unitMeters), params)
  };
  setOutputLayerName(out, lyr, 'smooth-terrain', opts);
  return [out];
};

function validateTerrainGrid(raster, grid) {
  if (!grid || !grid.samples || !grid.bbox) {
    stop('Raster layer is missing the data needed for smoothing');
  }
  if (!rasterMayBeTerrain(raster, grid)) {
    stop('-smooth-terrain needs an elevation raster');
  }
  if (rasterGridIsRotated(grid)) {
    stop('Smoothing does not support rotated or skewed rasters');
  }
}

// Float32 samples of every band, with @smoothed (in meters) in @band. Pixels
// without an elevation, and pixels below min-elevation= (@raised), keep their
// values, so that a sea floor flattened for smoothing keeps its depths.
function getSmoothedSamples(grid, band, smoothed, valid, raised, unitMeters) {
  var src = grid.samples;
  var out = new Float32Array(src.length);
  var n = grid.width * grid.height;
  var i, j;
  for (i = 0; i < src.length; i++) out[i] = src[i];
  for (i = 0, j = band; i < n; i++, j += grid.bands) {
    if (valid && !valid[i] || raised && raised[i]) continue;
    out[j] = smoothed[i] / unitMeters;
  }
  return out;
}

// The source raster with new samples
// @params settings recorded in the derivation (see getSmoothingParams())
function getSmoothedRaster(src, grid, samples, params) {
  var raster = Object.assign({}, src, {
    grid: Object.assign({}, grid, {samples: samples, pixelType: 'float32'}),
    derivation: Object.assign({}, src.derivation, {terrain_smoothing: params}),
    view: Object.assign({}, src.view)
  });
  if (grid.coverage) raster.grid.coverage = grid.coverage.slice();
  delete raster.view.preview;
  delete raster.view.scalingStats;
  if (runningInBrowser()) {
    raster.view.preview = createRasterPreview(raster, {});
  }
  return raster;
}
