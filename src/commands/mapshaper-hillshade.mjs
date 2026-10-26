import cmd from '../mapshaper-cmd';
import { getDatasetCRS, getScaleFactorAtXY, isLatLngCRS } from '../crs/mapshaper-projections';
import { layerHasRaster, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { getRasterValidityMask } from '../rasters/mapshaper-raster-grid';
import { createRasterPreview, getRasterGrid, getRasterViewRecipe, rasterGridIsRotated } from '../rasters/mapshaper-raster-utils';
import { featurePreservingSmooth, twoLevelSmooth } from '../rasters/mapshaper-terrain-smoothing';
import {
  applyAerialPerspective,
  blendAmbientLight,
  computeHillshade,
  computeLightAdjustment,
  computeOpenness,
  getDefaultBaseColor,
  getDefaultHighlightRatio,
  getDefaultMaxOpacity,
  getHillshadeTones,
  sharpenTones,
  writeHillshadeRgba,
  DEFAULT_ALTITUDE,
  DEFAULT_AZIMUTH,
  DEFAULT_GAMMA,
  generalizeTerrain,
  getAutoExaggeration,
  getHillshadeLights,
  raiseLowElevations,
  restoreLowElevations
} from '../rasters/mapshaper-hillshade';
import { formatColor, parseColor } from '../color/color-utils';
import { runningInBrowser } from '../mapshaper-env';
import { stop, verbose, warnOnce } from '../utils/mapshaper-logging';

// More passes don't generalize much more: beyond three or four, FPS facets
// slopes instead of removing small landforms. high smooths a 2x downsampled
// copy instead (see twoLevelSmooth()); its settings are for that level.
var FPS_PRESETS = {
  low: {rounds: 1, threshold: 15, radius: 4, levels: 1},
  medium: {rounds: 3, threshold: 20, radius: 4, levels: 1},
  high: {rounds: 3, threshold: 20, radius: 4, levels: 2}
};
// the full-resolution pass of two-level smoothing
var FPS_REFINEMENT = {rounds: 1, threshold: 20, radius: 4};
var AUTO_SMOOTHING = 'medium';
var DEFAULT_LOWPASS_RADIUS = 1;
var METERS_PER_DEGREE = 6371008.8 * Math.PI / 180;
// Experimental lighting parameters, in raster pixels
var LIGHT_ADJUSTMENT_SIGMA = 10;
var OPENNESS_RADIUS = 24;
var DEFAULT_SHARPEN_RADIUS = 3;
var DEFAULT_SHARPENING = 0.25;
var DEFAULT_AMBIENT = 0.5;

function getAboveMinimumMask(elev, valid, min) {
  var mask = new Uint8Array(elev.length);
  for (var i = 0; i < elev.length; i++) {
    mask[i] = (!valid || valid[i]) && elev[i] > min ? 1 : 0;
  }
  return mask;
}

function isFpsSmoothing(method) {
  return method == 'low' || method == 'medium' || method == 'high';
}

// Returns none, lowpass or an FPS preset (low, medium, high)
function getSmoothingMethod(opts) {
  var method = opts.smoothing || 'auto';
  if (method == 'auto') method = AUTO_SMOOTHING;
  if (method == 'off') method = 'none';
  if (method != 'none' && method != 'lowpass' && !isFpsSmoothing(method)) {
    stop('Unsupported smoothing method:', method + '. Use off, low, medium, high, lowpass or auto');
  }
  if (!isFpsSmoothing(method) && (opts.fps_passes != null || opts.fps_radius != null ||
      opts.fps_threshold != null || opts.fps_levels != null || opts.maximum_change != null)) {
    stop('FPS settings need smoothing=low, medium, high or auto');
  }
  if (method != 'lowpass' && opts.lowpass_radius != null) {
    stop('lowpass-radius= needs smoothing=lowpass');
  }
  return method;
}

// FPS presets: feature-preserving smoothing, with preset settings
// lowpass: the earlier blur-and-restore method
function smoothElevations(elev, valid, grid, cells, exaggeration, method, opts) {
  if (method == 'lowpass') {
    return generalizeTerrain(elev, valid, grid.width, grid.height, getLowpassRadius(opts));
  }
  var fpsOpts = getFpsOptions(method, opts);
  if (fpsOpts.levels == 2) {
    return twoLevelSmooth(elev, valid, grid.width, grid.height, cells.widths, cells.heights,
      exaggeration, fpsOpts, FPS_REFINEMENT);
  }
  return featurePreservingSmooth(elev, valid, grid.width, grid.height, cells.widths, cells.heights,
    exaggeration, fpsOpts);
}

function getLowpassRadius(opts) {
  return opts.lowpass_radius || DEFAULT_LOWPASS_RADIUS;
}

function getFpsOptions(method, opts) {
  var preset = FPS_PRESETS[method];
  return {
    rounds: opts.fps_passes || preset.rounds,
    radius: opts.fps_radius || preset.radius,
    threshold: opts.fps_threshold || preset.threshold,
    maxChange: opts.maximum_change || null,
    levels: opts.fps_levels || preset.levels
  };
}

function getSmoothingParams(method, opts) {
  var fps = isFpsSmoothing(method) ? getFpsOptions(method, opts) : null;
  return {
    smoothing: method,
    fps_levels: fps ? fps.levels : null,
    fps_passes: fps ? fps.rounds : null,
    fps_radius: fps ? fps.radius : null,
    fps_threshold: fps ? fps.threshold : null,
    maximum_change: fps ? fps.maxChange : null,
    lowpass_radius: method == 'lowpass' ? getLowpassRadius(opts) : null
  };
}

// Returns a new layer; -hillshade replaces the target unless + is used
cmd.hillshade = function(lyr, dataset, opts) {
  var grid, cells, elev, valid, shade, altitude, exaggeration, style, out;
  var hasMin, raised, toneOpts, tones, azimuth, offsets, colors, smoothing, params, sharpening, ambient;
  if (!layerHasRaster(lyr)) {
    stop('Command requires a raster layer');
  }
  grid = getRasterGrid(lyr.raster);
  validateHillshadeGrid(grid, opts);
  style = getHillshadeStyle(opts);
  smoothing = getSmoothingMethod(opts);
  altitude = opts.altitude >= 0 ? opts.altitude : DEFAULT_ALTITUDE;
  if (altitude > 90) stop('altitude= should be from 0 to 90 degrees');
  colors = {
    shadow: readToneColor(opts.shadow_color, 'shadow-color'),
    highlight: readToneColor(opts.highlight_color, 'highlight-color'),
    base: style == 'opaque' ? readToneColor(opts.base_color, 'base-color') ||
      getDefaultBaseColor(altitude) : null
  };
  cells = getHillshadeCellSizes(grid, getDatasetCRS(dataset));
  // rounded like the printed settings, so that pasting them reproduces the output
  exaggeration = opts.exaggeration > 0 ? opts.exaggeration : +getAutoExaggeration(cells.median).toFixed(3);
  azimuth = opts.azimuth == null ? DEFAULT_AZIMUTH : opts.azimuth;
  sharpening = opts.sharpening >= 0 ? opts.sharpening : DEFAULT_SHARPENING;
  ambient = opts.ambient >= 0 ? opts.ambient : DEFAULT_AMBIENT;
  toneOpts = {
    maxOpacity: opts.max_opacity >= 0 ? opts.max_opacity : getDefaultMaxOpacity(style),
    highlightRatio: opts.highlights >= 0 ? opts.highlights : getDefaultHighlightRatio(),
    gamma: opts.gamma > 0 ? opts.gamma : DEFAULT_GAMMA,
    flatBrightness: Math.sin(altitude * Math.PI / 180)
  };
  hasMin = opts.min_elevation != null;
  params = Object.assign({style: style, azimuth: azimuth, altitude: altitude,
    single_light: !!opts.single_light, exaggeration: exaggeration,
    max_opacity: toneOpts.maxOpacity, highlights: toneOpts.highlightRatio, gamma: toneOpts.gamma,
    shadow_color: opts.shadow_color || null, highlight_color: opts.highlight_color || null,
    base_color: colors.base ? opts.base_color || formatColor(colors.base) : null,
    min_elevation: hasMin ? opts.min_elevation : null},
  getSmoothingParams(smoothing, opts), {
    light_adjust: opts.light_adjust || 0, ambient: ambient, aerial: opts.aerial || 0,
    sharpening: sharpening,
    sharpen_radius: sharpening > 0 ? opts.sharpen_radius || DEFAULT_SHARPEN_RADIUS : null,
    sharpen_threshold: sharpening > 0 ? opts.sharpen_threshold || 0 : null,
    band: opts.band || 0});
  verbose('Settings:', formatHillshadeSettings(params));
  verbose('Ground pixel size:', formatPixelSize(cells.median) +
    (opts.exaggeration > 0 ? '' : ' (sets the automatic exaggeration)'));
  elev = readElevationBand(grid, opts.band || 0);
  valid = getRasterValidityMask(grid);
  if (hasMin) {
    raised = raiseLowElevations(elev, valid, opts.min_elevation);
  }
  if (smoothing != 'none') {
    elev = smoothElevations(elev, valid, grid, cells, exaggeration, smoothing, opts);
    if (hasMin) restoreLowElevations(elev, valid, raised, opts.min_elevation);
  }
  if (opts.light_adjust > 0) {
    offsets = computeLightAdjustment(elev, valid, grid.width, grid.height, azimuth,
      opts.light_adjust, LIGHT_ADJUSTMENT_SIGMA);
  }
  shade = computeHillshade(elev, valid, grid.width, grid.height, cells.widths, cells.heights,
    getHillshadeLights(azimuth, altitude, opts.single_light), exaggeration, offsets);
  if (ambient > 0) {
    // a flattened sea stays flat, rather than darkening along the coast
    blendAmbientLight(shade, computeOpenness(elev, valid, grid.width, grid.height,
      cells.widths, cells.heights, exaggeration, OPENNESS_RADIUS),
      hasMin ? getAboveMinimumMask(elev, valid, opts.min_elevation) : valid, ambient);
  }
  if (opts.aerial > 0) {
    applyAerialPerspective(shade, elev, valid, opts.aerial);
  }
  tones = getHillshadeTones(shade, valid, style, toneOpts);
  if (sharpening > 0) {
    sharpenTones(tones, valid, grid.width, grid.height, sharpening,
      opts.sharpen_radius || DEFAULT_SHARPEN_RADIUS, opts.sharpen_threshold || 0);
  }
  out = {
    raster_type: 'grid',
    raster: getHillshadeRaster(lyr.raster, grid,
      writeHillshadeRgba(tones, valid, style, colors), params)
  };
  setOutputLayerName(out, lyr, 'hillshade', opts);
  return [out];
};

// derivation entries that aren't options
var UNFORMATTED_PARAMS = ['type', 'sourceId'];

// Formats the settings recorded in a hillshade's derivation as command
// options, so they can be pasted into a command
export function formatHillshadeSettings(params) {
  return Object.keys(params).filter(function(key) {
    var val = params[key];
    return val !== null && val !== false && UNFORMATTED_PARAMS.indexOf(key) == -1 &&
      !(key == 'band' && val === 0);
  }).map(function(key) {
    var name = key.replace(/_/g, '-');
    var val = params[key];
    if (val === true) return name;
    return name + '=' + (typeof val == 'number' ? +val.toFixed(3) : val);
  }).join(' ');
}

function formatPixelSize(meters) {
  return meters >= 100 ? Math.round(meters) + ' m' : +meters.toFixed(1) + ' m';
}

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
  if (opts.highlights != null && !(opts.highlights >= 0)) {
    stop('highlights= should be 0 or more');
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
  if (opts.fps_passes != null && !(opts.fps_passes >= 1 && opts.fps_passes <= 20)) {
    stop('fps-passes= should be from 1 to 20');
  }
  if (opts.fps_levels != null && opts.fps_levels != 1 && opts.fps_levels != 2) {
    stop('fps-levels= should be 1 or 2');
  }
  if (opts.lowpass_radius != null && !(opts.lowpass_radius > 0 && opts.lowpass_radius <= 20)) {
    stop('lowpass-radius= should be a number of pixels, up to 20');
  }
  if (opts.fps_radius != null && !(opts.fps_radius >= 1 && opts.fps_radius <= 20)) {
    stop('fps-radius= should be from 1 to 20 pixels');
  }
  if (opts.maximum_change != null && !(opts.maximum_change > 0)) {
    stop('maximum-change= should be a positive number');
  }
  if (opts.sharpening != null && !(opts.sharpening >= 0 && opts.sharpening <= 3)) {
    stop('sharpening= should be from 0 to 3');
  }
  if (opts.sharpen_threshold != null && !(opts.sharpen_threshold >= 0 && opts.sharpen_threshold <= 1)) {
    stop('sharpen-threshold= should be from 0 to 1');
  }
  if (opts.sharpen_radius != null && !(opts.sharpen_radius > 0 && opts.sharpen_radius <= 20)) {
    stop('sharpen-radius= should be a number of pixels, up to 20');
  }
  ['ambient', 'aerial'].forEach(function(name) {
    if (opts[name] != null && !(opts[name] >= 0 && opts[name] <= 1)) {
      stop(name + '= should be from 0 to 1');
    }
  });
}

// gray and grey are the earlier name of the opaque style; base-color= implies it
function getHillshadeStyle(opts) {
  var style = opts.style || (opts.base_color ? 'opaque' : 'shadow');
  if (style == 'gray' || style == 'grey') style = 'opaque';
  if (style != 'shadow' && style != 'opaque') {
    stop('Unsupported style:', style + '. Use shadow or opaque');
  }
  if (style == 'shadow' && opts.base_color) {
    stop('base-color= needs style=opaque');
  }
  return style;
}

function readToneColor(str, optionName) {
  var color;
  if (!str) return null;
  color = parseColor(str);
  if (!color) stop('Unsupported ' + optionName + '=', str);
  return color;
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
