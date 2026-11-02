import cmd from '../mapshaper-cmd';
import { getDatasetCRS, getScaleFactorAtXY, isLatLngCRS } from '../crs/mapshaper-projections';
import { layerHasRaster, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { getRasterValidityMask } from '../rasters/mapshaper-raster-grid';
import { createRasterPreview, getRasterGrid, getRasterViewRecipe, rasterGridIsRotated } from '../rasters/mapshaper-raster-utils';
import {
  getDefaultHighlightRatio,
  getDefaultMaxOpacity,
  writeHillshadeRgba,
  DEFAULT_ALTITUDE,
  DEFAULT_AZIMUTH,
  DEFAULT_GAMMA,
  getAutoExaggeration,
  getHillshadeLights,
  getHillshadeMaxShade,
  raiseLowElevations
} from '../rasters/mapshaper-hillshade';
import { runHillshadeStages } from '../rasters/mapshaper-hillshade-runner';
import { formatColor, parseColor } from '../color/color-utils';
import { getHillshadeColorRamp, getHillshadeRampColors } from '../rasters/mapshaper-raster-color';
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
// dynamic smoothing (fps-min-threshold=)
var DEFAULT_FPS_SLOPE_FACTOR = 3;
var DEFAULT_FPS_SLOPE_RADIUS = 10;
var DEFAULT_FPS_BLEND = [5, 15];
// spread-based dynamic smoothing (fps-spread=)
var DEFAULT_FPS_SPREAD_RADIUS = 3;
var DEFAULT_SPREAD_MIN_THRESHOLD = 1;
var AUTO_SMOOTHING = 'low';
var DEFAULT_LOWPASS_RADIUS = 1;
var METERS_PER_DEGREE = 6371008.8 * Math.PI / 180;
var DEFAULT_SHARPEN_RADIUS = 3;
var DEFAULT_SHARPENING = 0.25;
var DEFAULT_AMBIENT = 0.5;
var DEFAULT_TEXTURE_DETAIL = 0.5;

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
      opts.fps_threshold != null || opts.fps_levels != null || opts.maximum_change != null ||
      opts.fps_min_threshold != null || opts.fps_spread != null)) {
    stop('FPS settings need smoothing=low, medium, high or auto');
  }
  if (opts.fps_spread != null && (opts.fps_slope_factor != null || opts.fps_slope_radius != null)) {
    stop('fps-slope-factor= and fps-slope-radius= do not apply with fps-spread=');
  }
  if (opts.fps_spread_radius != null && opts.fps_spread == null) {
    stop('fps-spread-radius= needs fps-spread=');
  }
  if (opts.fps_min_threshold == null && (opts.fps_slope_factor != null ||
      opts.fps_slope_radius != null || opts.fps_blend != null)) {
    stop('fps-slope-factor=, fps-slope-radius= and fps-blend= need fps-min-threshold=');
  }
  if (method != 'lowpass' && opts.lowpass_radius != null) {
    stop('lowpass-radius= needs smoothing=lowpass');
  }
  return method;
}

// Settings for smoothTerrain(), or null for no smoothing
// FPS presets: feature-preserving smoothing, with preset settings
// lowpass: the earlier blur-and-restore method
function getSmoothingSettings(method, opts, exaggeration) {
  if (method == 'none') return null;
  return {
    method: method,
    fps: isFpsSmoothing(method) ? getFpsOptions(method, opts) : null,
    refinement: FPS_REFINEMENT,
    lowpassRadius: getLowpassRadius(opts),
    exaggeration: exaggeration,
    minElevation: opts.min_elevation != null ? opts.min_elevation : null
  };
}

// e.g. "2.1 (10th percentile), 3.4 (median), 11.3 (90th percentile) degrees"
function formatThresholdRange(thresholds, valid) {
  var stride = Math.max(1, Math.floor(thresholds.length / 100000));
  var values = [];
  for (var i = 0; i < thresholds.length; i += stride) {
    if (!valid || valid[i]) values.push(thresholds[i]);
  }
  if (values.length === 0) return 'none';
  values.sort(function(a, b) { return a - b; });
  return [[0.1, '10th percentile'], [0.5, 'median'], [0.9, '90th percentile']].map(function(o) {
    return values[Math.floor(o[0] * (values.length - 1))].toFixed(1) + ' (' + o[1] + ')';
  }).join(', ') + ' degrees';
}

function getLowpassRadius(opts) {
  return opts.lowpass_radius || DEFAULT_LOWPASS_RADIUS;
}

function getFpsOptions(method, opts) {
  var preset = FPS_PRESETS[method];
  var levels = opts.fps_levels || preset.levels;
  var threshold = opts.fps_threshold || preset.threshold;
  var spread = opts.fps_spread > 0;
  var minThreshold = opts.fps_min_threshold > 0 ? opts.fps_min_threshold :
    spread ? Math.min(DEFAULT_SPREAD_MIN_THRESHOLD, threshold) : null;
  var dynamic = minThreshold > 0;
  if (dynamic && minThreshold > threshold) {
    stop('fps-min-threshold= should not be larger than the FPS threshold (' + threshold + ' degrees)');
  }
  if (opts.fps_blend != null && levels != 2) {
    stop('fps-blend= applies to two-level smoothing (smoothing=high or fps-levels=2)');
  }
  return {
    rounds: opts.fps_passes || preset.rounds,
    radius: opts.fps_radius || preset.radius,
    threshold: threshold,
    maxChange: opts.maximum_change || null,
    levels: levels,
    minThreshold: dynamic ? minThreshold : null,
    spread: spread ? opts.fps_spread : null,
    spreadRadius: spread ? (opts.fps_spread_radius > 0 ? opts.fps_spread_radius : DEFAULT_FPS_SPREAD_RADIUS) : null,
    slopeFactor: dynamic && !spread ? (opts.fps_slope_factor >= 0 ? opts.fps_slope_factor : DEFAULT_FPS_SLOPE_FACTOR) : null,
    slopeRadius: dynamic && !spread ? (opts.fps_slope_radius >= 0 ? opts.fps_slope_radius : DEFAULT_FPS_SLOPE_RADIUS) : null,
    blendRange: dynamic && levels == 2 ? parseFpsBlend(opts.fps_blend) : null
  };
}

// Returns [lo, hi] in degrees, or null for off
function parseFpsBlend(str) {
  var range;
  if (str == null) return DEFAULT_FPS_BLEND.concat();
  if (String(str).toLowerCase() == 'off') return null;
  range = String(str).split(',').map(Number);
  if (range.length != 2 || !(range[0] >= 0 && range[1] >= range[0] && range[1] < 90)) {
    stop('fps-blend= takes two angles, low to high (e.g. 5,15), or off');
  }
  return range;
}

function getSmoothingParams(method, opts) {
  var fps = isFpsSmoothing(method) ? getFpsOptions(method, opts) : null;
  var dynamic = fps && fps.minThreshold > 0;
  return {
    smoothing: method,
    fps_levels: fps ? fps.levels : null,
    fps_passes: fps ? fps.rounds : null,
    fps_radius: fps ? fps.radius : null,
    fps_threshold: fps ? fps.threshold : null,
    fps_min_threshold: dynamic ? fps.minThreshold : null,
    fps_spread: dynamic ? fps.spread : null,
    fps_spread_radius: dynamic ? fps.spreadRadius : null,
    fps_slope_factor: dynamic ? fps.slopeFactor : null,
    fps_slope_radius: dynamic ? fps.slopeRadius : null,
    fps_blend: dynamic && fps.levels == 2 ? (fps.blendRange ? fps.blendRange.join(',') : 'off') : null,
    maximum_change: fps ? fps.maxChange : null,
    lowpass_radius: method == 'lowpass' ? getLowpassRadius(opts) : null
  };
}

// Returns a new layer; -hillshade replaces the target unless + is used
// @resume optional function to call after each wait for workers
//   (job.resumeCommand())
cmd.hillshade = async function(lyr, dataset, opts, resume) {
  var grid, cells, elev, valid, altitude, exaggeration, style, out, result;
  var hasMin, toneOpts, azimuth, colors, smoothing, params, sharpening, ambient, lights, stops = null;
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
    ramp: null
  };
  if (style == 'opaque') {
    stops = getHillshadeRampColors(colors.shadow, readToneColor(opts.base_color, 'base-color'),
      colors.highlight);
    colors.ramp = getHillshadeColorRamp(stops);
  }
  cells = getHillshadeCellSizes(grid, getDatasetCRS(dataset));
  // rounded like the printed settings, so that pasting them reproduces the output
  exaggeration = opts.exaggeration > 0 ? opts.exaggeration : +getAutoExaggeration(cells.median).toFixed(3);
  azimuth = opts.azimuth == null ? DEFAULT_AZIMUTH : opts.azimuth;
  sharpening = opts.sharpening >= 0 ? opts.sharpening : DEFAULT_SHARPENING;
  ambient = opts.ambient >= 0 ? opts.ambient : DEFAULT_AMBIENT;
  lights = getHillshadeLights(azimuth, altitude, opts.single_light);
  toneOpts = {
    maxOpacity: opts.max_opacity >= 0 ? opts.max_opacity : getDefaultMaxOpacity(style),
    highlightRatio: opts.highlights >= 0 ? opts.highlights : getDefaultHighlightRatio(),
    gamma: opts.gamma > 0 ? opts.gamma : DEFAULT_GAMMA,
    maxShade: getHillshadeMaxShade(lights)
  };
  hasMin = opts.min_elevation != null;
  params = Object.assign({style: style, azimuth: azimuth, altitude: altitude,
    single_light: !!opts.single_light, exaggeration: exaggeration,
    max_opacity: stops ? null : toneOpts.maxOpacity,
    highlights: stops ? null : toneOpts.highlightRatio,
    gamma: toneOpts.gamma,
    // the opaque style's colors as used, including derived ones
    shadow_color: stops ? opts.shadow_color || formatColor(stops.shadow) : opts.shadow_color || null,
    highlight_color: stops ? opts.highlight_color || formatColor(stops.highlight) : opts.highlight_color || null,
    base_color: stops ? opts.base_color || formatColor(stops.base) : null,
    min_elevation: hasMin ? opts.min_elevation : null},
  getSmoothingParams(smoothing, opts), {
    light_adjust: opts.light_adjust || 0, ambient: ambient,
    texture: opts.texture || 0,
    texture_detail: opts.texture > 0 ? opts.texture_detail || DEFAULT_TEXTURE_DETAIL : null,
    texture_highlights: opts.texture > 0 ? opts.texture_highlights || 0 : null,
    aerial: opts.aerial || 0,
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
    raiseLowElevations(elev, valid, opts.min_elevation);
  }
  result = await runHillshadeStages({
    elev: elev,
    valid: valid,
    width: grid.width,
    height: grid.height,
    cellWidths: cells.widths,
    cellHeights: cells.heights
  }, getSmoothingSettings(smoothing, opts, exaggeration), {
    lights: lights,
    azimuth: azimuth,
    exaggeration: exaggeration,
    lightAdjust: opts.light_adjust || 0,
    ambient: ambient,
    aerial: opts.aerial || 0,
    texture: opts.texture || 0,
    textureDetail: params.texture_detail,
    textureHighlights: params.texture_highlights,
    minElevation: hasMin ? opts.min_elevation : null,
    style: style,
    toneOpts: toneOpts,
    sharpening: sharpening,
    sharpenRadius: opts.sharpen_radius || DEFAULT_SHARPEN_RADIUS,
    sharpenThreshold: opts.sharpen_threshold || 0
  }, {workers: opts.workers, resume: resume});
  if (result.workers > 0) {
    verbose('Workers:', result.workers);
  }
  if (result.thresholds) {
    verbose('FPS thresholds:', formatThresholdRange(result.thresholds, valid));
  }
  out = {
    raster_type: 'grid',
    raster: getHillshadeRaster(lyr.raster, grid,
      writeHillshadeRgba(result.tones, valid, style, colors), params)
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
  if (opts.fps_min_threshold != null && !(opts.fps_min_threshold > 0 && opts.fps_min_threshold < 90)) {
    stop('fps-min-threshold= should be an angle between 0 and 90 degrees');
  }
  if (opts.fps_slope_factor != null && !(opts.fps_slope_factor >= 0 && opts.fps_slope_factor <= 20)) {
    stop('fps-slope-factor= should be from 0 to 20');
  }
  if (opts.fps_slope_radius != null && !(opts.fps_slope_radius >= 0 && opts.fps_slope_radius <= 50)) {
    stop('fps-slope-radius= should be from 0 to 50 pixels');
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
  if (opts.texture_detail != null && !(opts.texture_detail > 0 && opts.texture_detail <= 2)) {
    stop('texture-detail= should be from 0 to 2');
  }
  if (opts.texture_highlights != null && !(opts.texture_highlights >= 0)) {
    stop('texture-highlights= should be 0 or more');
  }
  if ((opts.texture_detail != null || opts.texture_highlights != null) && !(opts.texture > 0)) {
    stop('texture-detail= and texture-highlights= require texture=');
  }
  if (opts.workers != null && !(opts.workers >= 0 && opts.workers <= 64)) {
    stop('workers= should be from 0 to 64');
  }
  ['ambient', 'aerial', 'texture'].forEach(function(name) {
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
  if (style == 'opaque' && (opts.max_opacity != null || opts.highlights != null)) {
    stop('max-opacity= and highlights= are for style=shadow. With style=opaque, use shadow-color=, base-color= and highlight-color=');
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
