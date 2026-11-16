import { getRasterDisplayBands } from './mapshaper-raster-display-bands';
import { getVerticalUnitMeters } from './mapshaper-vertical-units';

// No dry land is this far below sea level (the shore of the Dead Sea, the
// lowest, is at about -430 m), so a basin this deep holds water.
var DEEP_BASIN_METERS = 500;

// The sea of an elevation raster, for palettes with sea= (see
// mapshaper-raster-palette.mjs): pixels at or below 0 that are connected,
// through other such pixels, to the edge of the grid or to a pixel without a
// value (nodata, outside the grid's coverage, or masked by an alpha band),
// where the sea usually is in a DEM. Many DEMs give the sea's surface 0
// rather than its depth. Basins below sea level that are enclosed by higher
// ground (the Dead Sea, Death Valley) are land. A basin that the grid's edge
// cuts through looks like sea.
//
// At the resolution of a world map, straits like Gibraltar and the Bosporus
// are narrower than a pixel, which leaves seas like the Mediterranean and the
// Black Sea enclosed. @seeds, points in these seas (see
// mapshaper-inland-seas.mjs), add them back: the pixels at or below a sea's
// level that connect to one of its points. Without @seeds (a grid without a
// known CRS), enclosed basins deeper than DEEP_BASIN_METERS are sea instead,
// which only finds seas in DEMs with their depths.
//
// @seeds: [[x, y, level], ...] in the grid's coordinates, level in meters, or
//   null
// Returns a Uint8Array with 1 for each sea pixel, cached by the grid's
// samples and the band.
var masks = new WeakMap();

export function getRasterSeaMask(grid, band, seeds) {
  var bands = masks.get(grid.samples);
  var seedKey = seeds ? JSON.stringify(seeds) : null;
  var entry;
  if (!bands) {
    bands = {};
    masks.set(grid.samples, bands);
  }
  entry = bands[band];
  // a grid's coverage can be replaced without its samples (see -clip)
  if (!entry || entry.coverage != grid.coverage || entry.units != grid.verticalUnits ||
      entry.seeds != seedKey) {
    entry = bands[band] = {coverage: grid.coverage, units: grid.verticalUnits, seeds: seedKey,
      mask: buildSeaMask(grid, band, seeds || null)};
  }
  return entry.mask;
}

function buildSeaMask(grid, band, seeds) {
  var w = grid.width, h = grid.height, n = w * h;
  var samples = grid.samples, bands = grid.bands, nodata = grid.nodata;
  var coverage = grid.coverage || null;
  var alpha = getRasterDisplayBands(grid).alpha;
  var meters = getVerticalUnitMeters(grid.verticalUnits) || 1;
  // the sea's surface, in the band's units: 0, or an inland sea's level
  var level = 0;
  // 1: sea; 2: without a value, which the sea spreads from; 3: an enclosed
  // basin that is land
  var mask = new Uint8Array(n);
  var queue = new Int32Array(n);
  var tail = 0, head = 0;
  var i, x, y;

  for (i = 0; i < n; i++) {
    if (isEmpty(i)) {
      mask[i] = 2;
      queue[tail++] = i;
    }
  }
  for (x = 0; x < w; x++) {
    if (mask[x] === 0) visit(x);
    if (mask[(h - 1) * w + x] === 0) visit((h - 1) * w + x);
  }
  for (y = 0; y < h; y++) {
    if (mask[y * w] === 0) visit(y * w);
    if (mask[y * w + w - 1] === 0) visit(y * w + w - 1);
  }
  spread();
  if (seeds) {
    seeds.forEach(addInlandSea);
  } else {
    for (i = 0; i < n; i++) {
      if (mask[i] === 0 && isAtOrBelowSeaLevel(i)) {
        addEnclosedBasin(i);
      }
    }
  }
  for (i = 0; i < n; i++) {
    if (mask[i] > 1) mask[i] = 0;
  }
  return mask;

  function isEmpty(i) {
    var val;
    if (coverage && !coverage[i] || alpha > -1 && samples[i * bands + alpha] === 0) return true;
    val = samples[i * bands + band];
    return !isFinite(val) || nodata !== null && nodata !== undefined && val == nodata;
  }

  function isAtOrBelowSeaLevel(i) {
    return samples[i * bands + band] <= level;
  }

  function visit(i) {
    if (mask[i] === 0 && isAtOrBelowSeaLevel(i)) {
      mask[i] = 1;
      queue[tail++] = i;
    }
  }

  function spread() {
    var j, col;
    while (head < tail) {
      j = queue[head++];
      col = j % w;
      if (col > 0) visit(j - 1);
      if (col < w - 1) visit(j + 1);
      if (j >= w) visit(j - w);
      if (j < n - w) visit(j + w);
    }
  }

  // Floods the sea containing @seed, from its pixel or, if that one is
  // above the sea's level (a coastal pixel of a coarse grid), a neighbor
  function addInlandSea(seed) {
    var p = mapXYToPixel(grid, seed[0], seed[1]);
    var px = Math.floor(p[0]), py = Math.floor(p[1]);
    var dx, dy, cx, cy;
    level = seed[2] / meters;
    head = tail = 0;
    for (dy = 0; dy <= 2 && tail === 0; dy++) {
      for (dx = 0; dx <= 2 && tail === 0; dx++) {
        // the seed's pixel first, then its neighbors
        cx = px + (dx == 2 ? -1 : dx);
        cy = py + (dy == 2 ? -1 : dy);
        if (cx >= 0 && cy >= 0 && cx < w && cy < h) visit(cy * w + cx);
      }
    }
    spread();
    level = 0;
  }

  // Marks the basin containing pixel @start as sea or land
  function addEnclosedBasin(start) {
    var deepLevel = -DEEP_BASIN_METERS / meters;
    var min = Infinity;
    var val, j;
    head = tail = 0;
    visit(start);
    spread();
    for (j = 0; j < tail; j++) {
      val = samples[queue[j] * bands + band];
      if (val < min) min = val;
    }
    if (min > deepLevel) {
      for (j = 0; j < tail; j++) mask[queue[j]] = 3;
    }
  }
}

function mapXYToPixel(grid, x, y) {
  var t = grid.transform;
  if (t) {
    return [(x - t[2]) / t[0], (y - t[5]) / t[4]];
  }
  return [
    (x - grid.bbox[0]) / (grid.bbox[2] - grid.bbox[0]) * grid.width,
    (grid.bbox[3] - y) / (grid.bbox[3] - grid.bbox[1]) * grid.height
  ];
}
