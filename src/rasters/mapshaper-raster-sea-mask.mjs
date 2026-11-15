import { getRasterDisplayBands } from './mapshaper-raster-display-bands';

// The sea of an elevation raster, for palettes with sea= (see
// mapshaper-raster-palette.mjs): pixels at or below 0 that are connected,
// through other such pixels, to the edge of the grid or to a pixel without a
// value (nodata, outside the grid's coverage, or masked by an alpha band),
// where the sea usually is in a DEM. Many DEMs give the sea's surface 0
// rather than its depth. Basins below sea level that are enclosed by higher
// ground (the Dead Sea, Death Valley) are land. A basin that the grid's edge
// cuts through looks like sea.
//
// Returns a Uint8Array with 1 for each sea pixel, cached by the grid's
// samples and the band.
var masks = new WeakMap();

export function getRasterSeaMask(grid, band) {
  var bands = masks.get(grid.samples);
  if (!bands) {
    bands = {};
    masks.set(grid.samples, bands);
  }
  // a grid's coverage can be replaced without its samples (see -clip)
  if (!bands[band] || bands[band].coverage != grid.coverage) {
    bands[band] = {coverage: grid.coverage, mask: buildSeaMask(grid, band)};
  }
  return bands[band].mask;
}

function buildSeaMask(grid, band) {
  var w = grid.width, h = grid.height, n = w * h;
  var samples = grid.samples, bands = grid.bands, nodata = grid.nodata;
  var coverage = grid.coverage || null;
  var alpha = getRasterDisplayBands(grid).alpha;
  // 1: sea; 2: without a value, which the sea spreads from
  var mask = new Uint8Array(n);
  var queue = new Int32Array(n);
  var tail = 0, head = 0;
  var i, x, y;

  function isEmpty(i) {
    var val;
    if (coverage && !coverage[i] || alpha > -1 && samples[i * bands + alpha] === 0) return true;
    val = samples[i * bands + band];
    return !isFinite(val) || nodata !== null && nodata !== undefined && val == nodata;
  }

  function isAtOrBelowSeaLevel(i) {
    return samples[i * bands + band] <= 0;
  }

  function visit(i) {
    if (mask[i] === 0 && isAtOrBelowSeaLevel(i)) {
      mask[i] = 1;
      queue[tail++] = i;
    }
  }

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
  while (head < tail) {
    i = queue[head++];
    x = i % w;
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (i >= w) visit(i - w);
    if (i < n - w) visit(i + w);
  }
  for (i = 0; i < n; i++) {
    if (mask[i] == 2) mask[i] = 0;
  }
  return mask;
}
