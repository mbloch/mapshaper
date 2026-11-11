import { inflateSync } from 'fflate';

// Where on Earth each hypsometric preset applies (see hypsometric-schemes.mjs):
// a 2-degree grid of the weights of Arid, Lush, Temperate and Polar, fitted to
// the land colors of Tom Patterson's public-domain Equal Earth physical map,
// whose cross-blended tints blend between these four. Each cell is a 16-bit
// number, little-endian, of three 4-bit weights (Arid, Lush, Temperate; Polar
// is the rest of 15), or 0xffff for sea that is more than a cell from land.
// Rows run from north to south and columns from 180W, deflated and in base64.
var GRID_WIDTH = 180;
var GRID_HEIGHT = 90;
var CELL_SIZE = 2;
var MAX_WEIGHT = 15;
var CLIMATE_NAMES = ['Arid', 'Lush', 'Temperate', 'Polar'];
var GRID_DATA =
  '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' +
  'iPYn/T8=';
var cells = null;

function getCells() {
  var bytes, i;
  if (!cells) {
    bytes = inflateSync(decodeBase64(GRID_DATA));
    cells = new Uint16Array(GRID_WIDTH * GRID_HEIGHT);
    for (i = 0; i < cells.length; i++) cells[i] = bytes[i * 2] | bytes[i * 2 + 1] << 8;
  }
  return cells;
}

function decodeBase64(str) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var len = str.replace(/=+$/, '').length;
  var out = new Uint8Array(Math.floor(len * 3 / 4));
  var bits = 0, n = 0, j = 0;
  for (var i = 0; i < len; i++) {
    bits = bits << 6 | chars.indexOf(str[i]);
    n += 6;
    if (n >= 8) {
      n -= 8;
      out[j++] = bits >> n & 255;
    }
  }
  return out;
}

// The weights of the four presets at a location, summing to 1, interpolated
// between the cells around it, as {Arid: 0.7, Lush: 0.1, ...}; or null at sea,
// away from land
export function getClimateWeights(lon, lat) {
  var grid = getCells();
  var x = (lon + 180) / CELL_SIZE - 0.5;
  var y = (90 - lat) / CELL_SIZE - 0.5;
  var c0 = Math.floor(x), r0 = Math.floor(y);
  var fx = x - c0, fy = y - r0;
  var sums = [0, 0, 0, 0], total = 0;
  var r, c, f, cell, i;
  if (!isFinite(x) || !isFinite(y)) return null;
  for (var dr = 0; dr < 2; dr++) {
    for (var dc = 0; dc < 2; dc++) {
      r = Math.min(GRID_HEIGHT - 1, Math.max(0, r0 + dr));
      c = ((c0 + dc) % GRID_WIDTH + GRID_WIDTH) % GRID_WIDTH;
      f = (dc ? fx : 1 - fx) * (dr ? fy : 1 - fy);
      cell = grid[r * GRID_WIDTH + c];
      if (cell == 0xffff || f === 0) continue;
      addCellWeights(sums, cell, f);
      total += f;
    }
  }
  if (!(total > 0)) return null;
  return CLIMATE_NAMES.reduce(function(memo, name, i) {
    memo[name] = sums[i] / total;
    return memo;
  }, {});
}

function addCellWeights(sums, cell, f) {
  var base = MAX_WEIGHT + 1;
  var arid = Math.floor(cell / base / base);
  var lush = Math.floor(cell / base) % base;
  var temperate = cell % base;
  sums[0] += f * arid / MAX_WEIGHT;
  sums[1] += f * lush / MAX_WEIGHT;
  sums[2] += f * temperate / MAX_WEIGHT;
  sums[3] += f * (MAX_WEIGHT - arid - lush - temperate) / MAX_WEIGHT;
}

// The preset with the most weight at a set of [lon, lat] points (e.g. across
// a map), or null if they are all at sea. Points are weighted by the area
// they stand for on a grid of longitudes and latitudes, so that the polar
// regions don't count for more than their size.
export function getClimatePreset(points) {
  var sums = {}, found = false, best = null;
  points.forEach(function(p) {
    var w = getClimateWeights(p[0], p[1]);
    var area = Math.cos(p[1] * Math.PI / 180);
    if (!w) return;
    found = true;
    CLIMATE_NAMES.forEach(function(name) {
      sums[name] = (sums[name] || 0) + w[name] * area;
    });
  });
  if (!found) return null;
  CLIMATE_NAMES.forEach(function(name) {
    if (!best || sums[name] > sums[best]) best = name;
  });
  return best;
}
