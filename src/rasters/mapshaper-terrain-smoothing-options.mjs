import { getAutoExaggeration } from './mapshaper-hillshade';
import { stop } from '../utils/mapshaper-logging';

// Smoothing levels of -smooth-terrain and -hillshade smoothing=, and the FPS
// options of -smooth-terrain that override them.

// Smoothing levels 1-4. Each uses dynamic smoothing: the FPS threshold rises
// from DEFAULT_FPS_MIN_THRESHOLD in flat terrain to the preset's threshold on
// steep slopes, by slopeFactor degrees per degree of mean slope. More passes
// don't generalize much more: beyond three or four, FPS facets slopes instead
// of removing small landforms.
var FPS_PRESETS = {
  1: {rounds: 1, threshold: 10, radius: 3, levels: 1, slopeFactor: 0.6},
  2: {rounds: 2, threshold: 15, radius: 4, levels: 1, slopeFactor: 1},
  3: {rounds: 3, threshold: 20, radius: 6, levels: 1, slopeFactor: 1.4},
  4: {rounds: 3, threshold: 25, radius: 8, levels: 1, slopeFactor: 1.9}
};
// default level of -smooth-terrain; -hillshade doesn't smooth unless
// smoothing= is given
export var DEFAULT_SMOOTHING = 1;
// the full-resolution pass of two-level smoothing (fps-levels=2)
var FPS_REFINEMENT = {rounds: 1, threshold: 20, radius: 4};
// dynamic smoothing
var DEFAULT_FPS_MIN_THRESHOLD = 1;
var DEFAULT_FPS_SLOPE_FACTOR = 1;
var DEFAULT_FPS_SLOPE_RADIUS = 10;
var DEFAULT_FPS_BLEND = [5, 15];
// spread-based dynamic smoothing (fps-spread=)
var DEFAULT_FPS_SPREAD_RADIUS = 3;

// @str a level from 0 (off) to 4, or off; @min the lowest level allowed
// Returns a number, or the default level if @str is null
export function parseSmoothingLevel(str, optionName, min) {
  var s = str == null ? String(DEFAULT_SMOOTHING) : String(str).toLowerCase();
  if (s == 'off' && min === 0) s = '0';
  if (!/^[0-4]$/.test(s) || Number(s) < min) {
    stop(optionName + ' should be a level from ' + (min === 0 ? '0 (off)' : min) + ' to 4');
  }
  return Number(s);
}

// Settings for smoothTerrain(), or null for no smoothing
// Smoothing uses the automatic exaggeration even when -hillshade
// exaggeration= is given, so that exaggeration= styles the shading without
// changing how much detail smoothing keeps (FPS thresholds are angles on the
// exaggerated surface).
// @opts FPS options of -smooth-terrain, or {}
// @metersPerPixel median ground size of a pixel
// @minElevation: min-elevation= in meters, or null
export function getSmoothingSettings(level, opts, metersPerPixel, minElevation) {
  if (level === 0) return null;
  return {
    fps: getFpsOptions(level, opts),
    refinement: FPS_REFINEMENT,
    exaggeration: getAutoExaggeration(metersPerPixel),
    minElevation: minElevation
  };
}

// The settings used, as recorded in the derivation of the output of
// -smooth-terrain (see formatSmoothingSettings())
export function getSmoothingParams(level, opts) {
  var fps = getFpsOptions(level, opts);
  var dynamic = fps.minThreshold > 0;
  return {
    level: level,
    fps_levels: fps.levels,
    fps_passes: fps.rounds,
    fps_radius: fps.radius,
    fps_threshold: fps.threshold,
    // the threshold itself, for a fixed threshold
    fps_min_threshold: dynamic ? fps.minThreshold : fps.threshold,
    fps_spread: dynamic ? fps.spread : null,
    fps_spread_radius: dynamic ? fps.spreadRadius : null,
    fps_slope_factor: dynamic ? fps.slopeFactor : null,
    fps_slope_radius: dynamic ? fps.slopeRadius : null,
    fps_blend: dynamic && fps.levels == 2 ? (fps.blendRange ? fps.blendRange.join(',') : 'off') : null,
    maximum_change: fps.maxChange
  };
}

// Formats settings from getSmoothingParams() as -smooth-terrain options, so
// they can be pasted into a command
export function formatSmoothingSettings(params) {
  return Object.keys(params).filter(function(key) {
    return params[key] !== null;
  }).map(function(key) {
    var val = params[key];
    return key.replace(/_/g, '-') + '=' + (typeof val == 'number' ? +val.toFixed(3) : val);
  }).join(' ');
}

export function validateFpsOptions(opts) {
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
  if (opts.fps_radius != null && !(opts.fps_radius >= 1 && opts.fps_radius <= 20)) {
    stop('fps-radius= should be from 1 to 20 pixels');
  }
  if (opts.maximum_change != null && !(opts.maximum_change > 0)) {
    stop('maximum-change= should be a positive number');
  }
  if (opts.fps_spread != null && (opts.fps_slope_factor != null || opts.fps_slope_radius != null)) {
    stop('fps-slope-factor= and fps-slope-radius= do not apply with fps-spread=');
  }
  if (opts.fps_spread_radius != null && opts.fps_spread == null) {
    stop('fps-spread-radius= needs fps-spread=');
  }
}

// e.g. "2.1 (10th percentile), 3.4 (median), 11.3 (90th percentile) degrees"
export function formatThresholdRange(thresholds, valid) {
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
