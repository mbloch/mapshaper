import { inflateSync } from 'fflate';

// Where on Earth each hypsometric preset applies (see hypsometric-schemes.mjs):
// a 1-degree grid of the weights of the six climate zones, Desert, Steppe,
// Tropical, Temperate, Boreal and Polar, from the Köppen-Geiger
// classification for 1991-2020 (Beck et al. 2023, CC BY 4.0), using the
// climate of each cell's land below 2000 m, since the presets' own
// elevations color the highlands. Hot deserts are Desert and steppes
// Steppe; cold deserts, savanna and dry-summer classes are part Steppe, by
// how they look in NASA's Blue Marble imagery; warm-summer continental
// classes are half Temperate and half Boreal; tundra below 1000 m and ice
// caps are Polar (higher tundra is alpine, left to the presets' elevations).
// Each cell is a 24-bit number, little-endian, of five 4-bit weights (Desert
// in the high bits, then Steppe, Tropical, Temperate, Boreal; Polar is the
// rest of 15), or all ones for sea that is more than a cell from land. Rows run from north to
// south and columns from 180W, deflated and in base64.
var GRID_WIDTH = 360;
var GRID_HEIGHT = 180;
var CELL_SIZE = 1;
var CELL_BYTES = 3;
var MAX_WEIGHT = 15;
var CLIMATE_NAMES = ['Desert', 'Steppe', 'Tropical', 'Temperate', 'Boreal', 'Polar'];
var STORED_WEIGHTS = CLIMATE_NAMES.length - 1;
var SEA_CELL = 0xffffff;
var GRID_DATA =
  '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' +
  '/w==';
var cells = null;

function getCells() {
  var bytes, i, j;
  if (!cells) {
    bytes = inflateSync(decodeBase64(GRID_DATA));
    cells = new Uint32Array(GRID_WIDTH * GRID_HEIGHT);
    for (i = 0; i < cells.length; i++) {
      for (j = 0; j < CELL_BYTES; j++) cells[i] |= bytes[i * CELL_BYTES + j] << j * 8;
    }
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

// The weights of the presets at a location, summing to 1, interpolated
// between the cells around it, as {Desert: 0.7, Steppe: 0.1, ...}; or null
// at sea, away from land
export function getClimateWeights(lon, lat) {
  var grid = getCells();
  var x = (lon + 180) / CELL_SIZE - 0.5;
  var y = (90 - lat) / CELL_SIZE - 0.5;
  var c0 = Math.floor(x), r0 = Math.floor(y);
  var fx = x - c0, fy = y - r0;
  var sums = CLIMATE_NAMES.map(function() { return 0; }), total = 0;
  var r, c, f, cell;
  if (!isFinite(x) || !isFinite(y)) return null;
  for (var dr = 0; dr < 2; dr++) {
    for (var dc = 0; dc < 2; dc++) {
      r = Math.min(GRID_HEIGHT - 1, Math.max(0, r0 + dr));
      c = ((c0 + dc) % GRID_WIDTH + GRID_WIDTH) % GRID_WIDTH;
      f = (dc ? fx : 1 - fx) * (dr ? fy : 1 - fy);
      cell = grid[r * GRID_WIDTH + c];
      if (cell == SEA_CELL || f === 0) continue;
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
  var rest = MAX_WEIGHT, w;
  for (var i = 0; i < STORED_WEIGHTS; i++) {
    w = cell >> (STORED_WEIGHTS - 1 - i) * 4 & 15;
    sums[i] += f * w / MAX_WEIGHT;
    rest -= w;
  }
  sums[STORED_WEIGHTS] += f * rest / MAX_WEIGHT;
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
