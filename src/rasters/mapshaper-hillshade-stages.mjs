import { getBlurReach } from './mapshaper-box-blur';
import {
  applyAerialPerspective,
  applyTextureTones,
  blendAmbientLight,
  computeHillshade,
  computeLightAdjustment,
  computeOpenness,
  computeTextureShading,
  generalizeTerrain,
  getHillshadeTones,
  getLightAdjustmentReach,
  getOpennessReach,
  getTextureShadingReach,
  restoreLowElevations,
  sharpenTones
} from './mapshaper-hillshade';
import {
  featurePreservingSmooth,
  getFpsReach,
  getSlopeThresholdReach,
  getSlopeThresholds,
  getSpreadThresholdReach,
  getSpreadThresholds,
  getTwoLevelReach,
  twoLevelSmooth
} from './mapshaper-terrain-smoothing';

// The two stages of -hillshade that take nearly all of its time: smoothing
// the terrain, and shading it. Their inputs are plain objects and typed
// arrays, so they can run in workers (see mapshaper-hillshade-worker.mjs), on
// overlapping tiles of the grid.
//
// A grid, or a tile of one, is {elev, valid, width, height, cellWidths,
// cellHeights}: Float32Array elevations, an optional Uint8Array of valid
// pixels, and the ground size of a pixel in each row (in elevation units).
// This module imports only pure raster modules, to keep the worker small.

// Experimental lighting parameters, in raster pixels
var LIGHT_ADJUSTMENT_SIGMA = 10;
var OPENNESS_RADIUS = 24;
var TEXTURE_MAX_SCALE = 24;
// Overlap of tiles beyond the computed reach of a stage
export var REACH_MARGIN = 2;

export function runHillshadeStage(task) {
  if (task.stage == 'smooth') return smoothTerrain(task.grid, task.settings);
  if (task.stage == 'shade') return {tones: shadeTerrain(task.grid, task.settings)};
  throw new Error('Unknown hillshade stage: ' + task.stage);
}

// @s.method lowpass or an FPS preset (low, medium, high)
// @s.fps FPS options (featurePreservingSmooth() and getSlopeThresholds())
// @s.refinement options of the full-resolution pass of two-level smoothing
// @s.lowpassRadius, @s.exaggeration
// @s.minElevation optional; elevations were raised to it before smoothing
// Returns {elev, thresholds}: thresholds are the per-pixel FPS thresholds of
//   dynamic smoothing, or null
export function smoothTerrain(grid, s) {
  var elev = grid.elev, valid = grid.valid, w = grid.width, h = grid.height;
  var thresholds = null, fps, out;
  if (s.method == 'lowpass') {
    out = generalizeTerrain(elev, valid, w, h, s.lowpassRadius);
  } else {
    fps = s.fps;
    if (fps.spread > 0) {
      thresholds = getSpreadThresholds(elev, valid, w, h, grid.cellWidths, grid.cellHeights,
        s.exaggeration, {
          min: fps.minThreshold,
          max: fps.threshold,
          factor: fps.spread,
          spreadRadius: fps.spreadRadius
        });
      fps = Object.assign({}, fps, {thresholds: thresholds});
    } else if (fps.minThreshold > 0) {
      thresholds = getSlopeThresholds(elev, valid, w, h, grid.cellWidths, grid.cellHeights,
        s.exaggeration, {
          min: fps.minThreshold,
          max: fps.threshold,
          slopeFactor: fps.slopeFactor,
          slopeRadius: fps.slopeRadius
        });
      fps = Object.assign({}, fps, {thresholds: thresholds});
    }
    out = fps.levels == 2 ?
      twoLevelSmooth(elev, valid, w, h, grid.cellWidths, grid.cellHeights, s.exaggeration, fps, s.refinement) :
      featurePreservingSmooth(elev, valid, w, h, grid.cellWidths, grid.cellHeights, s.exaggeration, fps);
  }
  if (s.minElevation != null) {
    restoreLowElevations(out, elev, valid, s.minElevation);
  }
  return {elev: out, thresholds: thresholds};
}

// Infinity for lowpass smoothing, which scales curvature by its mean over the
// whole grid
export function getSmoothingReach(s) {
  var fps = s.fps;
  var reach;
  if (s.method == 'lowpass') return Infinity;
  reach = fps.levels == 2 ? getTwoLevelReach(fps, s.refinement) : getFpsReach(fps);
  if (fps.spread > 0) {
    reach += getSpreadThresholdReach(fps.spreadRadius);
  } else if (fps.minThreshold > 0) {
    reach += getSlopeThresholdReach(fps.slopeRadius);
  }
  return reach + REACH_MARGIN;
}

// @s.lights, @s.azimuth, @s.exaggeration
// @s.lightAdjust, @s.ambient, @s.aerial, @s.texture: 0 for off
// @s.aerialRange from getAerialRange() on the whole grid, if @s.aerial > 0
// @s.minElevation optional
// @s.style, @s.toneOpts see getHillshadeTones()
// @s.sharpening, @s.sharpenRadius, @s.sharpenThreshold
// @s.textureDetail, @s.textureHighlights
// Returns signed tones (see getHillshadeTones())
export function shadeTerrain(grid, s) {
  var elev = grid.elev, valid = grid.valid, w = grid.width, h = grid.height;
  var offsets, shade, land, tones;
  if (s.lightAdjust > 0) {
    offsets = computeLightAdjustment(elev, valid, w, h, s.azimuth, s.lightAdjust,
      LIGHT_ADJUSTMENT_SIGMA);
  }
  shade = computeHillshade(elev, valid, w, h, grid.cellWidths, grid.cellHeights,
    s.lights, s.exaggeration, offsets);
  // a flattened sea stays flat, rather than shading along the coast
  land = s.minElevation != null && (s.ambient > 0 || s.texture > 0) ?
    getAboveMinimumMask(elev, valid, s.minElevation) : valid;
  if (s.ambient > 0) {
    blendAmbientLight(shade, computeOpenness(elev, valid, w, h, grid.cellWidths,
      grid.cellHeights, s.exaggeration, OPENNESS_RADIUS), land, s.ambient);
  }
  if (s.aerial > 0) {
    applyAerialPerspective(shade, elev, valid, s.aerial, s.aerialRange);
  }
  tones = getHillshadeTones(shade, valid, s.style, s.toneOpts);
  if (s.sharpening > 0) {
    sharpenTones(tones, valid, w, h, s.sharpening, s.sharpenRadius, s.sharpenThreshold);
  }
  // after the tone curve, so max-opacity= and gamma= don't affect it
  if (s.texture > 0) {
    applyTextureTones(tones, computeTextureShading(elev, land, w, h, getRowCellSizes(grid),
      s.exaggeration, s.textureDetail, TEXTURE_MAX_SCALE), land,
      s.texture, Math.min(1, s.texture * s.textureHighlights));
  }
  return tones;
}

export function getShadingReach(s) {
  var reach = 1; // computeHillshade()
  if (s.lightAdjust > 0) {
    reach = Math.max(reach, getLightAdjustmentReach(LIGHT_ADJUSTMENT_SIGMA));
  }
  if (s.ambient > 0) {
    reach = Math.max(reach, getOpennessReach(OPENNESS_RADIUS));
  }
  if (s.sharpening > 0) {
    reach += getBlurReach(s.sharpenRadius);
  }
  if (s.texture > 0) {
    reach = Math.max(reach, getTextureShadingReach(TEXTURE_MAX_SCALE));
  }
  return reach + REACH_MARGIN;
}

function getRowCellSizes(grid) {
  var sizes = new Float64Array(grid.height);
  for (var y = 0; y < sizes.length; y++) {
    sizes[y] = Math.sqrt(grid.cellWidths[y] * grid.cellHeights[y]);
  }
  return sizes;
}

function getAboveMinimumMask(elev, valid, min) {
  var mask = new Uint8Array(elev.length);
  for (var i = 0; i < elev.length; i++) {
    mask[i] = (!valid || valid[i]) && elev[i] > min ? 1 : 0;
  }
  return mask;
}
