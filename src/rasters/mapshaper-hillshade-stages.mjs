import {
  applyAerialPerspective,
  applyAmbientTones,
  applyTextureTones,
  computeHillshade,
  computeLightAdjustment,
  computeOpenness,
  computeTextureShading,
  getHillshadeTones,
  getLightAdjustmentReach,
  getOpennessReach,
  getTextureShadingReach,
  getToneMaxOpacity,
  removeThinHighlights,
  restoreLowElevations,
  THIN_HIGHLIGHT_REACH
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
// for settings without textureMaxScale (see getTextureMaxScale())
var DEFAULT_TEXTURE_MAX_SCALE = 24;
// Overlap of tiles beyond the computed reach of a stage
export var REACH_MARGIN = 2;

export function runHillshadeStage(task) {
  if (task.stage == 'smooth') return smoothTerrain(task.grid, task.settings);
  if (task.stage == 'shade') return {tones: shadeTerrain(task.grid, task.settings)};
  if (task.stage == 'fields') return computeShadingFields(task.grid, task.settings);
  if (task.stage == 'texture') return {texture: computeTextureField(task.grid, task.settings)};
  throw new Error('Unknown hillshade stage: ' + task.stage);
}

// @s.fps FPS options (featurePreservingSmooth() and getSlopeThresholds())
// @s.refinement options of the full-resolution pass of two-level smoothing
// @s.exaggeration
// @s.minElevation optional; elevations were raised to it before smoothing
// Returns {elev, thresholds}: thresholds are the per-pixel FPS thresholds of
//   dynamic smoothing, or null
export function smoothTerrain(grid, s) {
  var elev = grid.elev, valid = grid.valid, w = grid.width, h = grid.height;
  var thresholds = null, fps = s.fps, out;
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
  if (s.minElevation != null) {
    restoreLowElevations(out, elev, valid, s.minElevation);
  }
  return {elev: out, thresholds: thresholds};
}

export function getSmoothingReach(s) {
  var fps = s.fps;
  var reach = fps.levels == 2 ? getTwoLevelReach(fps, s.refinement) : getFpsReach(fps);
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
// @s.textureDetail, @s.textureHighlights, @s.textureMaxScale, @s.textureGain
// @grid.texture optional texture field from computeTextureField(), which has a
//   much longer reach than the rest of shading, so it can be computed on
//   larger tiles
// Returns signed tones (see getHillshadeTones())
export function shadeTerrain(grid, s) {
  return combineShadingFields(computeShadingFields(grid, s), grid, s);
}

// The parts of shading that read neighboring pixels, and so take nearly all
// of its time. They depend only on these settings, so the hillshade panel
// computes them once and recombines them as other settings change:
// @s.lights, @s.azimuth, @s.exaggeration, @s.lightAdjust, @s.minElevation,
// @s.textureDetail, @s.textureMaxScale, @s.textureGain, and whether
// @s.ambient and @s.texture are above 0.
// Returns {shade, openness, texture}: openness is null unless @s.ambient > 0,
//   and texture null unless @s.texture > 0 (@grid.texture, if given)
export function computeShadingFields(grid, s) {
  var elev = grid.elev, valid = grid.valid, w = grid.width, h = grid.height;
  var offsets;
  if (s.lightAdjust > 0) {
    offsets = computeLightAdjustment(elev, valid, w, h, s.azimuth, s.lightAdjust,
      LIGHT_ADJUSTMENT_SIGMA);
  }
  return {
    shade: computeHillshade(elev, valid, w, h, grid.cellWidths, grid.cellHeights,
      s.lights, s.exaggeration, offsets),
    openness: s.ambient > 0 ? computeOpenness(elev, valid, w, h, grid.cellWidths,
      grid.cellHeights, s.exaggeration, OPENNESS_RADIUS) : null,
    texture: s.texture > 0 ? grid.texture || computeTextureField(grid, s) : null
  };
}

// The texture field of computeShadingFields()
export function computeTextureField(grid, s) {
  return computeTextureShading(grid.elev, getLandMask(grid, s), grid.width, grid.height,
    getRowCellSizes(grid), s.exaggeration * (s.textureGain > 0 ? s.textureGain : 1),
    s.textureDetail, getTextureScaleSetting(s));
}

// Reach of computeTextureField()
export function getTextureReach(s) {
  return getTextureShadingReach(getTextureScaleSetting(s)) + REACH_MARGIN;
}

function getTextureScaleSetting(s) {
  return s.textureMaxScale > 0 ? s.textureMaxScale : DEFAULT_TEXTURE_MAX_SCALE;
}

// Combines the fields of computeShadingFields() into signed tones, pixel by
// pixel, apart from removeThinHighlights(), which reaches one pixel. The
// fields are not modified.
// @grid the grid the fields were computed on
export function combineShadingFields(fields, grid, s) {
  var elev = grid.elev, valid = grid.valid;
  var shade = fields.shade, land, tones;
  land = s.ambient > 0 || s.texture > 0 ? getLandMask(grid, s) : valid;
  if (s.aerial > 0) {
    shade = applyAerialPerspective(Float32Array.from(shade), elev, valid, s.aerial, s.aerialRange);
  }
  tones = getHillshadeTones(shade, valid, s.style, s.toneOpts);
  if (s.ambient > 0) {
    applyAmbientTones(tones, fields.openness, land, s.ambient,
      getToneMaxOpacity(s.style, s.toneOpts));
  }
  // after the tone curve, so max-opacity= and gamma= don't affect it
  if (s.texture > 0) {
    applyTextureTones(tones, fields.texture, land,
      s.texture, Math.min(1, s.texture * s.textureHighlights));
  }
  return removeThinHighlights(tones, valid, grid.width, grid.height);
}

// a flattened sea stays flat, rather than shading along the coast
function getLandMask(grid, s) {
  return s.minElevation != null ? getAboveMinimumMask(grid.elev, grid.valid, s.minElevation) : grid.valid;
}

export function getShadingReach(s) {
  var reach = 1; // computeHillshade()
  if (s.lightAdjust > 0) {
    reach = Math.max(reach, getLightAdjustmentReach(LIGHT_ADJUSTMENT_SIGMA));
  }
  if (s.ambient > 0) {
    reach = Math.max(reach, getOpennessReach(OPENNESS_RADIUS));
  }
  if (s.texture > 0) {
    reach = Math.max(reach, getTextureShadingReach(getTextureScaleSetting(s)));
  }
  return reach + THIN_HIGHLIGHT_REACH + REACH_MARGIN;
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
