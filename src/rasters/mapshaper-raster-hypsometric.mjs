import { stop } from '../utils/mapshaper-logging';
import { getHypsometricSchemeNames, getHypsometricStops } from '../color/hypsometric-schemes';
import { getClimateWeights } from '../color/hypsometric-climate';
import { getProjTransform2, parseCrsString, crsToProj4 } from '../crs/mapshaper-projections';
import { getVerticalUnitMeters } from './mapshaper-vertical-units';
import { getRasterGrid } from './mapshaper-raster-utils';

// -classify hypsometric=: the hypsometric presets as raster palettes, at their
// elevations (see hypsometric-schemes.mjs), and a blend of them that varies
// across the map by climate (see hypsometric-climate.mjs).
//
// A blended palette is an ordinary continuous palette (the preset with the
// most weight across the raster, for anything that draws it without a blend)
// with:
// palette.blend = {
//   ramps,  // [{name, breaks, colors}] for each preset, in the band's units
//   field   // the presets' weights across the raster (see getClimateWeightField())
// }

var BLEND_NAME = 'blended';
// cells on the long side of a weight field; the climate grid has 2-degree
// cells, so a world raster gets about that resolution
var FIELD_CELLS = 180;

export function getHypsometricOptionNames() {
  return getHypsometricSchemeNames().map(function(name) { return name.toLowerCase(); }).concat([BLEND_NAME]);
}

// @name: a preset (any case) or 'blended'
// @crs: the raster's CRS, for a blend
export function getHypsometricPalette(raster, band, name, crs) {
  var grid = getRasterGrid(raster);
  var key = String(name).toLowerCase();
  var meters = getVerticalUnitMeters(grid.verticalUnits) || 1;
  var field, preset;
  if (getHypsometricOptionNames().indexOf(key) == -1) {
    stop('Unknown hypsometric= value:', name, '(expected ' + getHypsometricOptionNames().join(', ') + ')');
  }
  if (key != BLEND_NAME) {
    preset = getPresetName(key);
    return Object.assign({band: band}, getPresetRamp(preset, meters), {hypsometric: preset});
  }
  field = crs ? getClimateWeightField(grid.bbox, crs) : null;
  if (!field) {
    stop('hypsometric=blended needs a raster with a known projection, on land');
  }
  preset = field.preset;
  return Object.assign({band: band}, getPresetRamp(preset, meters), {
    hypsometric: BLEND_NAME,
    blend: {
      ramps: getHypsometricSchemeNames().map(function(name) {
        var ramp = getPresetRamp(name, meters);
        return {name: name, breaks: ramp.breaks, colors: ramp.colors};
      }),
      field: field
    }
  });
}

function getPresetName(key) {
  return getHypsometricSchemeNames().find(function(name) { return name.toLowerCase() == key; });
}

// Continuous colors at the preset's elevations, converted to the band's
// units; values beyond the end stops take the end colors
function getPresetRamp(name, meters) {
  var stops = getHypsometricStops(name);
  return {
    type: 'sequential',
    continuous: true,
    interpolation: 'oklch',
    breaks: stops.map(function(stop) { return +(stop.elevation / meters).toPrecision(6); }),
    colors: stops.map(function(stop) { return stop.color; }),
    nullColor: null
  };
}

// The presets' weights across @bbox, in the coordinates of @crs, on a grid
// of @cells (default FIELD_CELLS) on its long side, for drawing a blended
// palette:
// {bbox, width, height, weights, key}
//   weights: three numbers 0-255 for each cell, row by row from the top
//     (Arid, Lush, Temperate; Polar is the rest of 255). Cells at sea, or
//     that can't be projected, are filled in smoothly from the others (see
//     fillFieldGaps()), which matters where sea=land colors the sea.
//   preset: the preset with the most weight, by area
//   key: changes with the weights, for caching what is drawn with them
// Returns null if no cell is on land, or the CRS can't be inverted
export function getClimateWeightField(bbox, crs, cells) {
  var n = cells || FIELD_CELLS;
  var w = bbox[2] - bbox[0], h = bbox[3] - bbox[1];
  var width = Math.max(2, Math.round(w >= h ? n : n * w / h));
  var height = Math.max(2, Math.round(h >= w ? n : n * h / w));
  var names = getHypsometricSchemeNames();
  var lookups = [], areaSums = [0, 0, 0, 0], landCells = 0;
  var toLngLat, weights, i, j, p, cell;
  if (!(w > 0 && h > 0)) return null;
  try {
    toLngLat = getProjTransform2(crs, parseCrsString('wgs84'));
  } catch(e) {
    return null;
  }
  for (j = 0; j < height; j++) {
    for (i = 0; i < width; i++) {
      p = projectSafely(toLngLat, bbox[0] + (i + 0.5) / width * w, bbox[3] - (j + 0.5) / height * h);
      cell = p ? getClimateWeights(p[0], p[1]) : null;
      if (cell) {
        landCells++;
        names.forEach(function(name, k) {
          areaSums[k] += cell[name] * Math.cos(p[1] * Math.PI / 180);
        });
      }
      lookups.push(cell);
    }
  }
  if (landCells === 0) return null;
  weights = fillFieldGaps(lookups.map(function(cell) {
    return cell ? names.slice(0, 3).map(function(name) { return cell[name]; }) : null;
  }), width, height).map(function(val) { return Math.round(val * 255); });
  return {
    bbox: bbox.concat(),
    width: width,
    height: height,
    weights: weights,
    preset: names[areaSums.indexOf(Math.max.apply(null, areaSums))],
    key: getFieldKey(bbox, width, height, weights, crs)
  };
}

// Fills the null cells of a grid of [a, b, c] values, and returns them all
// as a flat array: each gap first takes the mean of its filled neighbors, in
// waves outward from the filled cells, and then is smoothed (repeatedly
// averaging each gap cell's neighbors, with the filled cells held), so that
// the values fade from one coast to another rather than changing in steps.
var FILL_SMOOTHING_PASSES = 40;

function fillFieldGaps(cells, width, height) {
  var n = width * height;
  var vals = new Float64Array(n * 3);
  var state = new Uint8Array(n); // 0: gap, 1: filled before this wave, 2: given
  var gaps = [], wave, next, i, k, pass;
  for (i = 0; i < n; i++) {
    if (cells[i]) {
      state[i] = 2;
      for (k = 0; k < 3; k++) vals[i * 3 + k] = cells[i][k];
    } else {
      gaps.push(i);
    }
  }
  wave = gaps;
  while (wave.length > 0) {
    var filled = [];
    next = [];
    wave.forEach(function(i) {
      if (averageNeighbors(vals, state, i, width, height)) {
        filled.push(i);
      } else {
        next.push(i);
      }
    });
    if (filled.length === 0) break;
    filled.forEach(function(i) { state[i] = 1; });
    wave = next;
  }
  for (pass = 0; pass < FILL_SMOOTHING_PASSES; pass++) {
    gaps.forEach(function(i) {
      averageNeighbors(vals, state, i, width, height);
    });
  }
  return Array.from(vals);
}

// Sets cell i to the mean of its filled 8-neighbors (cells filled in the
// current wave are still gaps); returns false if it has none
function averageNeighbors(vals, state, i, width, height) {
  var x = i % width, y = (i - x) / width;
  var sum = [0, 0, 0], count = 0, dx, dy, j, k;
  for (dy = -1; dy <= 1; dy++) {
    for (dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0 || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
      j = i + dy * width + dx;
      if (state[j] === 0) continue;
      for (k = 0; k < 3; k++) sum[k] += vals[j * 3 + k];
      count++;
    }
  }
  if (count === 0) return false;
  for (k = 0; k < 3; k++) vals[i * 3 + k] = sum[k] / count;
  return true;
}

function projectSafely(proj, x, y) {
  var p;
  try {
    p = proj(x, y);
  } catch(e) {
    return null;
  }
  return p && isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[1]) <= 90 ? p : null;
}

function getFieldKey(bbox, width, height, weights, crs) {
  var hash = 0;
  for (var i = 0; i < weights.length; i++) {
    hash = (hash * 31 + weights[i]) | 0;
  }
  return [bbox.join(','), width, height, hash, crsToProj4(crs)].join('|');
}

// A blended palette's field is in the raster's coordinates, so it is made
// again when the raster is reprojected
export function updateHypsometricBlend(raster, crs) {
  var recipe = raster.view && raster.view.recipe;
  var palette = recipe && recipe.palette;
  var grid = getRasterGrid(raster);
  var field;
  if (!palette || !palette.blend || !grid) return;
  field = crs ? getClimateWeightField(grid.bbox, crs) : null;
  palette = Object.assign({}, palette);
  if (field) {
    palette.blend = Object.assign({}, palette.blend, {field: field});
  } else {
    delete palette.blend;
  }
  raster.view.recipe = Object.assign({}, recipe, {palette: palette});
}
