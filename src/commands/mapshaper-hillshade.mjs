import cmd from '../mapshaper-cmd';
import { getDatasetCRS, getScaleFactorAtXY, isLatLngCRS } from '../crs/mapshaper-projections';
import { layerHasRaster, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { getRasterValidityMask } from '../rasters/mapshaper-raster-grid';
import { createRasterPreview, getRasterGrid, getRasterGridBandIndex, getRasterViewRecipe, rasterGridIsRotated } from '../rasters/mapshaper-raster-utils';
import {
  getDefaultHighlightRatio,
  getDefaultMaxOpacity,
  writeHillshadeRgba,
  DEFAULT_ALTITUDE,
  DEFAULT_AZIMUTH,
  DEFAULT_GAMMA,
  getAutoExaggeration,
  getFittedVerticalScale,
  getHillshadeLights,
  getHillshadeMaxShade,
  raiseLowElevations
} from '../rasters/mapshaper-hillshade';
import { runHillshadeStages } from '../rasters/mapshaper-hillshade-runner';
import { formatVerticalUnits, getVerticalUnitMeters } from '../rasters/mapshaper-vertical-units';
import { formatColor, parseColor } from '../color/color-utils';
import { getHillshadeColorRamp, getHillshadeRampColors } from '../rasters/mapshaper-raster-color';
import { runningInBrowser } from '../mapshaper-env';
import { message, stop, verbose, warnOnce } from '../utils/mapshaper-logging';
// Smoothing levels 1-4 (smoothing=0 is off). Each uses dynamic smoothing:
// the FPS threshold rises from DEFAULT_FPS_MIN_THRESHOLD in flat terrain to
// the preset's threshold on steep slopes, by slopeFactor degrees per degree of
// mean slope. More passes don't generalize much more: beyond three or four, FPS
// facets slopes instead of removing small landforms.
var FPS_PRESETS = {
  1: {rounds: 1, threshold: 10, radius: 3, levels: 1, slopeFactor: 0.6},
  2: {rounds: 2, threshold: 15, radius: 4, levels: 1, slopeFactor: 1},
  3: {rounds: 3, threshold: 20, radius: 6, levels: 1, slopeFactor: 1.4},
  4: {rounds: 3, threshold: 25, radius: 8, levels: 1, slopeFactor: 1.9}
};
var DEFAULT_SMOOTHING = 1;
// the full-resolution pass of two-level smoothing (fps-levels=2)
var FPS_REFINEMENT = {rounds: 1, threshold: 20, radius: 4};
// dynamic smoothing
var DEFAULT_FPS_MIN_THRESHOLD = 1;
var DEFAULT_FPS_SLOPE_FACTOR = 1;
var DEFAULT_FPS_SLOPE_RADIUS = 10;
var DEFAULT_FPS_BLEND = [5, 15];
// spread-based dynamic smoothing (fps-spread=)
var DEFAULT_FPS_SPREAD_RADIUS = 3;
var METERS_PER_DEGREE = 6371008.8 * Math.PI / 180;
var DEFAULT_AMBIENT = 0.5;
var DEFAULT_TEXTURE_DETAIL = 0.5;

// Returns a smoothing level, from 0 (off) to 4
function getSmoothingLevel(opts) {
  var str = opts.smoothing == null ? String(DEFAULT_SMOOTHING) : String(opts.smoothing).toLowerCase();
  var level;
  if (str == 'off') str = '0';
  if (!/^[0-4]$/.test(str)) {
    stop('smoothing= should be a level from 0 (off) to 4');
  }
  level = Number(str);
  // fps-passes=0 or fps-threshold=0 turns smoothing off, like smoothing=0
  if (opts.fps_passes === 0 || opts.fps_threshold === 0) {
    return 0;
  }
  if (level === 0 && (opts.fps_passes != null || opts.fps_radius != null ||
      opts.fps_threshold != null || opts.fps_levels != null || opts.maximum_change != null ||
      opts.fps_min_threshold != null || opts.fps_slope_factor != null ||
      opts.fps_slope_radius != null || opts.fps_blend != null || opts.fps_spread != null ||
      opts.fps_spread_radius != null)) {
    stop('FPS settings do not apply with smoothing=0');
  }
  if (opts.fps_spread != null && (opts.fps_slope_factor != null || opts.fps_slope_radius != null)) {
    stop('fps-slope-factor= and fps-slope-radius= do not apply with fps-spread=');
  }
  if (opts.fps_spread_radius != null && opts.fps_spread == null) {
    stop('fps-spread-radius= needs fps-spread=');
  }
  return level;
}

// Settings for smoothTerrain(), or null for no smoothing
// @minElevation: min-elevation= in meters, or null
function getSmoothingSettings(level, opts, exaggeration, minElevation) {
  if (level === 0) return null;
  return {
    fps: getFpsOptions(level, opts),
    refinement: FPS_REFINEMENT,
    exaggeration: exaggeration,
    minElevation: minElevation
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

// A minimum threshold equal to the threshold gives a fixed threshold, without
// dynamic smoothing
function getFpsOptions(level, opts) {
  var preset = FPS_PRESETS[level];
  var levels = opts.fps_levels || preset.levels;
  var threshold = opts.fps_threshold || preset.threshold;
  var spread = opts.fps_spread > 0;
  var minThreshold = opts.fps_min_threshold > 0 ? opts.fps_min_threshold :
    Math.min(DEFAULT_FPS_MIN_THRESHOLD, threshold);
  var dynamic = minThreshold < threshold;
  var slopeFactor = opts.fps_slope_factor >= 0 ? opts.fps_slope_factor :
    preset.slopeFactor >= 0 ? preset.slopeFactor : DEFAULT_FPS_SLOPE_FACTOR;
  if (minThreshold > threshold) {
    stop('fps-min-threshold= should not be larger than the FPS threshold (' + threshold + ' degrees)');
  }
  if (opts.fps_blend != null && levels != 2) {
    stop('fps-blend= applies to two-level smoothing (fps-levels=2)');
  }
  return {
    rounds: opts.fps_passes || preset.rounds,
    radius: opts.fps_radius || preset.radius,
    threshold: threshold,
    maxChange: opts.maximum_change || null,
    levels: levels,
    minThreshold: dynamic ? minThreshold : null,
    spread: dynamic && spread ? opts.fps_spread : null,
    spreadRadius: dynamic && spread ? (opts.fps_spread_radius > 0 ? opts.fps_spread_radius : DEFAULT_FPS_SPREAD_RADIUS) : null,
    slopeFactor: dynamic && !spread ? slopeFactor : null,
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

function getSmoothingParams(level, opts) {
  var fps = level > 0 ? getFpsOptions(level, opts) : null;
  var dynamic = fps && fps.minThreshold > 0;
  return {
    smoothing: level,
    fps_levels: fps ? fps.levels : null,
    fps_passes: fps ? fps.rounds : null,
    fps_radius: fps ? fps.radius : null,
    fps_threshold: fps ? fps.threshold : null,
    // the threshold itself, for a fixed threshold
    fps_min_threshold: dynamic ? fps.minThreshold : fps ? fps.threshold : null,
    fps_spread: dynamic ? fps.spread : null,
    fps_spread_radius: dynamic ? fps.spreadRadius : null,
    fps_slope_factor: dynamic ? fps.slopeFactor : null,
    fps_slope_radius: dynamic ? fps.slopeRadius : null,
    fps_blend: dynamic && fps.levels == 2 ? (fps.blendRange ? fps.blendRange.join(',') : 'off') : null,
    maximum_change: fps ? fps.maxChange : null
  };
}

// Returns a new layer; -hillshade replaces the target unless + is used
// @resume optional function to call after each wait for workers
//   (job.resumeCommand())
cmd.hillshade = async function(lyr, dataset, opts, resume) {
  var grid, cells, elev, valid, altitude, exaggeration, style, out, result;
  var hasMin, toneOpts, azimuth, colors, smoothing, params, ambient, lights, stops = null;
  var unitMeters, minElevation, band;
  if (!layerHasRaster(lyr)) {
    stop('Command requires a raster layer');
  }
  grid = getRasterGrid(lyr.raster);
  validateHillshadeGrid(grid, opts);
  band = getRasterGridBandIndex(grid, opts.band);
  style = getHillshadeStyle(opts);
  smoothing = getSmoothingLevel(opts);
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
  exaggeration = opts.exaggeration > 0 ? opts.exaggeration : getAutoExaggeration(cells.median);
  if (!(opts.exaggeration > 0)) {
    message('Exaggeration:', formatExaggeration(exaggeration) + ' (automatic)');
  }
  azimuth = opts.azimuth == null ? DEFAULT_AZIMUTH : opts.azimuth;
  ambient = opts.ambient >= 0 ? opts.ambient : DEFAULT_AMBIENT;
  lights = getHillshadeLights(azimuth, altitude, opts.single_light);
  toneOpts = {
    maxOpacity: opts.max_opacity >= 0 ? opts.max_opacity : getDefaultMaxOpacity(style),
    highlightRatio: opts.highlights >= 0 ? opts.highlights : getDefaultHighlightRatio(),
    gamma: opts.gamma > 0 ? opts.gamma : DEFAULT_GAMMA,
    maxShade: getHillshadeMaxShade(lights)
  };
  hasMin = opts.min_elevation != null;
  valid = getRasterValidityMask(grid);
  // In pixel coordinates, the ratio of a DEM's values to its pixel size is
  // unknown, whatever units the values are in, so the ratio is fitted instead.
  unitMeters = cells.unknown ?
    getFittedElevationScale(lyr, grid, band, valid, cells) :
    getElevationUnitMeters(grid);
  // min-elevation= is in the raster's own units, like the values -info shows
  minElevation = hasMin ? opts.min_elevation * unitMeters : null;
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
    band: opts.band || null});
  verbose('Settings:', formatHillshadeSettings(params));
  if (!cells.unknown) {
    verbose('Ground pixel size:', formatPixelSize(cells.median));
    if (grid.verticalUnits) {
      verbose('Elevation units:', formatVerticalUnits(grid.verticalUnits));
    }
  }
  elev = readElevationBand(grid, band, unitMeters);
  if (hasMin) {
    raiseLowElevations(elev, valid, minElevation);
  }
  result = await runHillshadeStages({
    elev: elev,
    valid: valid,
    width: grid.width,
    height: grid.height,
    cellWidths: cells.widths,
    cellHeights: cells.heights
  }, getSmoothingSettings(smoothing, opts, exaggeration, minElevation), {
    lights: lights,
    azimuth: azimuth,
    exaggeration: exaggeration,
    lightAdjust: opts.light_adjust || 0,
    ambient: ambient,
    aerial: opts.aerial || 0,
    texture: opts.texture || 0,
    textureDetail: params.texture_detail,
    textureHighlights: params.texture_highlights,
    minElevation: hasMin ? minElevation : null,
    style: style,
    toneOpts: toneOpts
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
    return val !== null && val !== false && UNFORMATTED_PARAMS.indexOf(key) == -1;
  }).map(function(key) {
    var name = key.replace(/_/g, '-');
    var val = params[key];
    if (val === true) return name;
    return name + '=' + (typeof val == 'number' ? +val.toFixed(3) : val);
  }).join(' ');
}

// e.g. 3.0, 2.75
function formatExaggeration(val) {
  return val % 1 === 0 ? val.toFixed(1) : String(val);
}

function formatPixelSize(meters) {
  return meters >= 100 ? Math.round(meters) + ' m' : +meters.toFixed(1) + ' m';
}

function validateHillshadeGrid(grid, opts) {
  if (!grid || !grid.samples || !grid.bbox) {
    stop('Raster layer is missing the data needed for hillshading');
  }
  if (rasterGridIsRotated(grid)) {
    stop('Hillshading does not support rotated or skewed rasters');
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
  if (opts.fps_threshold != null && !(opts.fps_threshold >= 0 && opts.fps_threshold < 90)) {
    stop('fps-threshold= should be an angle from 0 (off) to 90 degrees');
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
  if (opts.fps_passes != null && !(opts.fps_passes >= 0 && opts.fps_passes <= 20)) {
    stop('fps-passes= should be from 0 (off) to 20');
  }
  if (opts.fps_levels != null && opts.fps_levels != 1 && opts.fps_levels != 2) {
    stop('fps-levels= should be 1 or 2');
  }
  if (opts.fps_radius != null && !(opts.fps_radius >= 1 && opts.fps_radius <= 20)) {
    stop('fps-radius= should be from 1 to 20 pixels');
  }
  if (opts.maximum_change != null && !(opts.maximum_change > 0)) {
    stop('maximum-change= should be a positive number');
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

// Returns elevations in meters
// @metersPerUnit: the length of the raster's vertical unit in meters
function readElevationBand(grid, band, metersPerUnit) {
  var n = grid.width * grid.height;
  var out = new Float32Array(n);
  for (var i = 0, j = band; i < n; i++, j += grid.bands) {
    out[i] = grid.samples[j] * metersPerUnit;
  }
  return out;
}

// The factor that scales a DEM in pixel coordinates to a typical steepness,
// with pixels taken to be 1 m across
function getFittedElevationScale(lyr, grid, band, valid, cells) {
  var raw = readElevationBand(grid, band, 1);
  var scale = getFittedVerticalScale(raw, valid, grid.width, grid.height, cells.widths, cells.heights);
  message((lyr.name || 'This raster') + ' has no ground scale (it is in pixel' +
    ' coordinates), so its relief was scaled to a typical steepness (vertical scale ' +
    +scale.toPrecision(3) + '). To adjust it, use exaggeration=. To shade it to' +
    ' scale, import it with pixel-size= (and vertical-units=, if not meters).');
  return scale;
}

// Meters per vertical unit of the raster. A raster in unknown units is taken
// to be in meters, as most DEMs are.
function getElevationUnitMeters(grid) {
  var units = grid.verticalUnits;
  var meters = getVerticalUnitMeters(units);
  if (units && !meters) {
    warnOnce('Unknown elevation units (' + units + '); assuming meters');
  }
  return meters || 1;
}

// Ground size of a pixel in meters, for each row: the size in map units,
// converted to meters and corrected by the projection's scale factor.
// A size given with pixel-size= at import takes the place of a CRS.
// Returns {widths, heights, median, unknown}; unknown is true for a raster in
// pixel coordinates, whose sizes are in pixels.
export function getHillshadeCellSizes(grid, crs) {
  var h = grid.height;
  var bbox = grid.bbox;
  var unitsX = (bbox[2] - bbox[0]) / grid.width;
  var unitsY = (bbox[3] - bbox[1]) / h;
  var widths = new Float64Array(h);
  var heights = new Float64Array(h);
  var centerX = (bbox[0] + bbox[2]) / 2;
  var unitMeters = grid.horizontalUnitMeters > 0 ? grid.horizontalUnitMeters : null;
  var unknown = !crs && !unitMeters && !!grid.pixelCoordinates;
  var y, rowY, k, lastK, kx;
  if (!crs && !unitMeters && !unknown) {
    warnOnce('The raster\'s coordinate system is unknown; assuming that its coordinates are in meters');
  }
  for (y = 0; y < h; y++) {
    rowY = bbox[3] - (y + 0.5) * unitsY;
    if (unitMeters) {
      widths[y] = unitsX * unitMeters;
      heights[y] = unitsY * unitMeters;
    } else if (!crs) {
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
  return {widths: widths, heights: heights, median: getMedian(widths), unknown: unknown};
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
