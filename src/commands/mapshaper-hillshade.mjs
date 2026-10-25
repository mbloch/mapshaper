import cmd from '../mapshaper-cmd';
import { getDatasetCRS, getScaleFactorAtXY, isLatLngCRS } from '../crs/mapshaper-projections';
import { layerHasRaster, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { getRasterValidityMask } from '../rasters/mapshaper-raster-grid';
import { createRasterPreview, getRasterGrid, getRasterViewRecipe, rasterGridIsRotated } from '../rasters/mapshaper-raster-utils';
import { featurePreservingSmooth } from '../rasters/mapshaper-terrain-smoothing';
import {
  applyAerialPerspective,
  blendAmbientLight,
  computeHillshade,
  computeLightAdjustment,
  computeOpenness,
  DEFAULT_ALTITUDE,
  DEFAULT_AZIMUTH,
  DEFAULT_GAMMA,
  DEFAULT_MAX_OPACITY,
  generalizeTerrain,
  getAutoExaggeration,
  getHillshadeLights,
  raiseLowElevations,
  renderHillshadeRgba,
  restoreLowElevations
} from '../rasters/mapshaper-hillshade';
import { runningInBrowser } from '../mapshaper-env';
import { stop, warnOnce } from '../utils/mapshaper-logging';

var DEFAULT_FPS_ROUNDS = 3;
var DEFAULT_FPS_RADIUS = 4;
var DEFAULT_FPS_THRESHOLD = 20;
var DEFAULT_LOWPASS_SIGMA = 1;
var METERS_PER_DEGREE = 6371008.8 * Math.PI / 180;
// Experimental lighting parameters, in raster pixels
var LIGHT_ADJUSTMENT_SIGMA = 10;
var OPENNESS_RADIUS = 24;

function getGeneralization(opts) {
  if (opts.generalize > 0) return opts.generalize;
  return opts.smoothing == 'lowpass' ? DEFAULT_LOWPASS_SIGMA : DEFAULT_FPS_ROUNDS;
}

// fps: feature-preserving smoothing; generalize= is the number of rounds
// lowpass: the earlier blur-and-restore method; generalize= is the blur radius
function smoothElevations(elev, valid, grid, cells, exaggeration, opts) {
  var method = opts.smoothing || 'fps';
  if (method == 'lowpass') {
    return generalizeTerrain(elev, valid, grid.width, grid.height, getGeneralization(opts));
  }
  if (method != 'fps') {
    stop('Unsupported smoothing method:', method + '. Use fps or lowpass');
  }
  return featurePreservingSmooth(elev, valid, grid.width, grid.height, cells.widths, cells.heights,
    exaggeration, getFpsOptions(opts));
}

function getFpsOptions(opts) {
  return {
    rounds: Math.round(getGeneralization(opts)),
    radius: opts.fps_radius || DEFAULT_FPS_RADIUS,
    threshold: opts.fps_threshold || DEFAULT_FPS_THRESHOLD,
    maxChange: opts.maximum_change || null
  };
}

// Returns a new layer; -hillshade replaces the target unless + is used
cmd.hillshade = function(lyr, dataset, opts) {
  var grid, cells, elev, valid, shade, altitude, exaggeration, style, out;
  var hasMin, raised, toneOpts, azimuth, offsets;
  if (!layerHasRaster(lyr)) {
    stop('Command requires a raster layer');
  }
  grid = getRasterGrid(lyr.raster);
  validateHillshadeGrid(grid, opts);
  style = opts.style || 'shadow';
  if (style != 'shadow' && style != 'gray') {
    stop('Unsupported style:', style + '. Use shadow or gray');
  }
  altitude = opts.altitude >= 0 ? opts.altitude : DEFAULT_ALTITUDE;
  if (altitude > 90) stop('altitude= should be from 0 to 90 degrees');
  cells = getHillshadeCellSizes(grid, getDatasetCRS(dataset));
  exaggeration = opts.exaggeration > 0 ? opts.exaggeration : getAutoExaggeration(cells.median);
  elev = readElevationBand(grid, opts.band || 0);
  valid = getRasterValidityMask(grid);
  hasMin = opts.min_elevation != null;
  if (hasMin) {
    raised = raiseLowElevations(elev, valid, opts.min_elevation);
  }
  if (opts.generalize !== 0) {
    elev = smoothElevations(elev, valid, grid, cells, exaggeration, opts);
    if (hasMin) restoreLowElevations(elev, valid, raised, opts.min_elevation);
  }
  azimuth = opts.azimuth == null ? DEFAULT_AZIMUTH : opts.azimuth;
  if (opts.light_adjust > 0) {
    offsets = computeLightAdjustment(elev, valid, grid.width, grid.height, azimuth,
      opts.light_adjust, LIGHT_ADJUSTMENT_SIGMA);
  }
  shade = computeHillshade(elev, valid, grid.width, grid.height, cells.widths, cells.heights,
    getHillshadeLights(azimuth, altitude, opts.single_light), exaggeration, offsets);
  if (opts.ambient > 0) {
    blendAmbientLight(shade, computeOpenness(elev, valid, grid.width, grid.height,
      cells.widths, cells.heights, exaggeration, OPENNESS_RADIUS), valid, opts.ambient);
  }
  if (opts.aerial > 0) {
    applyAerialPerspective(shade, elev, valid, opts.aerial);
  }
  toneOpts = {
    maxOpacity: opts.max_opacity >= 0 ? opts.max_opacity : DEFAULT_MAX_OPACITY,
    gamma: opts.gamma > 0 ? opts.gamma : DEFAULT_GAMMA,
    flatBrightness: Math.sin(altitude * Math.PI / 180)
  };
  out = {
    raster_type: 'grid',
    raster: getHillshadeRaster(lyr.raster, grid,
      renderHillshadeRgba(shade, valid, style, toneOpts),
      {style: style, azimuth: azimuth,
        altitude: altitude, exaggeration: exaggeration,
        max_opacity: toneOpts.maxOpacity, gamma: toneOpts.gamma,
        min_elevation: hasMin ? opts.min_elevation : null,
        smoothing: opts.generalize === 0 ? 'none' : opts.smoothing || 'fps',
        generalize: opts.generalize === 0 ? 0 : getGeneralization(opts),
        fps_radius: opts.fps_radius || DEFAULT_FPS_RADIUS,
        fps_threshold: opts.fps_threshold || DEFAULT_FPS_THRESHOLD,
        maximum_change: opts.maximum_change || null,
        light_adjust: opts.light_adjust || 0, ambient: opts.ambient || 0, aerial: opts.aerial || 0})
  };
  setOutputLayerName(out, lyr, 'hillshade', opts);
  return [out];
};

function validateHillshadeGrid(grid, opts) {
  var band = opts.band || 0;
  if (!grid || !grid.samples || !grid.bbox) {
    stop('Raster layer is missing the data needed for hillshading');
  }
  if (rasterGridIsRotated(grid)) {
    stop('Hillshading does not support rotated or skewed rasters');
  }
  if (band < 0 || band >= grid.bands) {
    stop('Raster layer does not have band', band);
  }
  if (opts.max_opacity != null && !(opts.max_opacity >= 0 && opts.max_opacity <= 1)) {
    stop('max-opacity= should be from 0 to 1');
  }
  if (opts.gamma != null && !(opts.gamma > 0)) {
    stop('gamma= should be a positive number');
  }
  if (opts.light_adjust != null && !(opts.light_adjust >= 0 && opts.light_adjust <= 60)) {
    stop('light-adjust= should be from 0 to 60 degrees');
  }
  if (opts.fps_threshold != null && !(opts.fps_threshold > 0 && opts.fps_threshold < 90)) {
    stop('fps-threshold= should be an angle between 0 and 90 degrees');
  }
  if (opts.fps_radius != null && !(opts.fps_radius >= 1 && opts.fps_radius <= 20)) {
    stop('fps-radius= should be from 1 to 20 pixels');
  }
  if (opts.maximum_change != null && !(opts.maximum_change > 0)) {
    stop('maximum-change= should be a positive number');
  }
  ['ambient', 'aerial'].forEach(function(name) {
    if (opts[name] != null && !(opts[name] >= 0 && opts[name] <= 1)) {
      stop(name + '= should be from 0 to 1');
    }
  });
}

function readElevationBand(grid, band) {
  var n = grid.width * grid.height;
  var out = new Float32Array(n);
  for (var i = 0, j = band; i < n; i++, j += grid.bands) {
    out[i] = grid.samples[j];
  }
  return out;
}

// Ground size of a pixel in meters, for each row: the size in map units,
// converted to meters and corrected by the projection's scale factor
// Returns {widths, heights, median}
export function getHillshadeCellSizes(grid, crs) {
  var h = grid.height;
  var bbox = grid.bbox;
  var unitsX = (bbox[2] - bbox[0]) / grid.width;
  var unitsY = (bbox[3] - bbox[1]) / h;
  var widths = new Float64Array(h);
  var heights = new Float64Array(h);
  var centerX = (bbox[0] + bbox[2]) / 2;
  var y, rowY, k, lastK, kx;
  if (!crs) {
    warnOnce('The raster\'s coordinate system is unknown; assuming that its coordinates are in meters');
  }
  for (y = 0; y < h; y++) {
    rowY = bbox[3] - (y + 0.5) * unitsY;
    if (!crs) {
      widths[y] = unitsX;
      heights[y] = unitsY;
    } else if (isLatLngCRS(crs)) {
      kx = Math.cos(Math.max(-89.9, Math.min(89.9, rowY)) * Math.PI / 180);
      widths[y] = unitsX * METERS_PER_DEGREE * kx;
      heights[y] = unitsY * METERS_PER_DEGREE;
    } else {
      k = getScaleFactorAtXY(centerX, rowY, crs);
      if (!(k > 0 && isFinite(k))) k = lastK || 1;
      lastK = k;
      widths[y] = unitsX * crs.to_meter / k;
      heights[y] = unitsY * crs.to_meter / k;
    }
  }
  return {widths: widths, heights: heights, median: getMedian(widths)};
}

function getMedian(arr) {
  var sorted = Array.from(arr).sort(function(a, b) { return a - b; });
  return sorted[Math.floor(sorted.length / 2)];
}

function getHillshadeRaster(src, grid, samples, params) {
  var raster = {
    sourceId: src.sourceId,
    interpretation: 'image',
    grid: {
      width: grid.width,
      height: grid.height,
      bands: 4,
      pixelType: 'uint8',
      samples: samples,
      sampleBands: [0, 1, 2, 3],
      nodata: null,
      bbox: grid.bbox.concat(),
      transform: grid.transform ? grid.transform.concat() : null
    },
    derivation: Object.assign({type: 'hillshade', sourceId: src.sourceId}, params),
    view: {recipe: {type: 'rgb', bands: [0, 1, 2, 3], scaling: 'none'}}
  };
  raster.view.recipe = getRasterViewRecipe(raster.grid, raster.view.recipe, {});
  if (runningInBrowser()) {
    raster.view.preview = createRasterPreview(raster, {});
  }
  return raster;
}
