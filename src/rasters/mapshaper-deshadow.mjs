// Removes the effects of direct sunlight from aerial imagery, using a DEM, so
// that the terrain can be lit from another direction (e.g. by a hillshade)
// (see -deshadow).
//
// Each band's linear value is modeled as A * (S * I + D): A is the ground's
// albedo, S the direct sunlight, D the diffuse skylight, and I the cosine of
// the sun's angle of incidence on the ground (0 in cast shadows and on slopes
// facing away from the sun). Values are corrected to those of flat ground,
// v * (sin(altitude) + c) / (I + c), where c = D / S (topographic
// C-correction): shadows are a special case, where I is 0.
//
// 1. The sun's position is fitted by correlating I with the image's linear
//    luma within tiles. (Across the whole image, albedo varies with the
//    terrain, e.g. from forested valleys to snowy peaks.) With the image's
//    date (or range of dates), only positions on the sun's path are tried.
//    A mosaic of images taken at different times gets the sun position of
//    each region that matches its lighting better than the image's.
// 2. c is fitted to each band and class of ground (by color, after a first
//    correction): it's the median, over tiles where the band varies with I,
//    of the intercept of the band's regression on I over its slope. Shadows
//    darken forest less than rock or snow (sunlit forest is partly shadowed
//    by its own trees), so forest has a larger c.

// Tiles that the sun's position is fitted in (cells at the fit level), and
// the fewest cells a tile is scored with
var FIT_TILE = globalThis.DSTILE || 4000;
var MIN_FIT_TILE = 16;
var MIN_TILE_CELLS = 50;
// lowest sun altitude fitted, in degrees
export var MIN_ALTITUDE = 10;
var MAX_ALTITUDE = 88;
export var MIN_SUN_FIT = 0.1;
// declinations searched in a range of dates, at most this far apart (degrees)
var DECLINATION_STEP = 2;
// The sun is fitted on up to this many cells, no larger than MAX_FIT_CELL
// meters (with a first search on coarser cells)
var FIT_CELLS = globalThis.DSFITCELLS || 120000;
var MAX_FIT_CELL = 60;
var COARSE_FIT_CELLS = 25000;
var MAX_COARSE_FIT_CELL = 120;
// Mosaics: the image is divided into up to MAX_BLOCKS x MAX_BLOCKS blocks of
// at least BLOCK_TILES tiles, and a block's sun position is used if it
// matches the block better than the image's does by REGION_GAIN; each tile
// gets the sun that matches it and its neighbors best, if by LABEL_MARGIN
// better than the image's, and areas of fewer than MIN_REGION_TILES tiles get
// the sun of the tiles around them. Each sun is fitted again on its tiles,
// and the tiles labeled again, up to MAX_REFITS times. Positions within
// SAME_SUN degrees are merged.
var MAX_BLOCKS = 4;
var BLOCK_TILES = globalThis.DSBT || 15;
var REGION_GAIN = 0.04;
var LABEL_MARGIN = 0.03;
var MIN_REGION_TILES = 9;
var SAME_SUN = 5;
var MAX_REFITS = 5;
// shadows cast from this far outside a block are included (meters)
var BLOCK_MARGIN = 2000;
// c is fitted in tiles this size (meters, and at least MIN_C_TILE pixels),
// where the band and I correlate at least MIN_C_FIT, with I varying at least
// MIN_C_SPREAD (standard deviation) over at least MIN_C_PIXELS pixels
var C_TILE = 300;
var MIN_C_TILE = 32;
var MAX_C_TILES = 400;
// c is measured from shadowed and sunlit pixels at least this many DEM pixels
// (or image pixels, if larger) from the edges of shadows, in groups of at
// least MIN_GROUP_PIXELS, with sunlit pixels lit within FLAT_RANGE of flat
// ground
var SHADOW_MARGIN = 1.5;
var MIN_GROUP_PIXELS = 50;
var FLAT_RANGE = 0.1;
// Without a shadow mask, pixels within the same distance of the edges of the
// DEM's shadows are shadowed by their luma, compared with the sunlit and
// shadowed pixels within SHADOW_REFERENCE times the distance, if those differ
// by at least MIN_SHADOW_CONTRAST (log luma)
var SHADOW_REFERENCE = 3;
var MIN_SHADOW_CONTRAST = 0.3;

// Shadow mask: dark pixels within MIN_BAND meters (or 2.4 DEM pixels) of the
// DEM's shadows (cast from as far below the fitted sun as they stay mostly
// dark, since a DEM smoother than the terrain casts shorter shadows), in
// areas where most of a REGION_RADIUS window is dark (tree shadows never
// are). With a near-infrared band, the window counts only pixels that are
// dark in both (sunlit tree canopy is dark in visible light but bright in
// near-infrared). Sizes are in meters.
var MAJORITY_RADIUS = 1.2;
var REGION_RADIUS = 4.8;
var REGION_SHARE = 0.7;
var SMALL_AREA = 1100; // square meters
var MIN_BAND = 24;
var BAND_DEM_PIXELS = 2.4;
// The mask is used if it's at most this many times the size of the DEM's
// shadows, and of their lengthening by the lower sun the mask is made from
// (see lowerSunAltitude()); larger means it has taken in other dark areas,
// e.g. forest
export var MAX_MASK_RATIO = globalThis.DSMMR || 1.5;
// see addDemShadows()
var DEM_EDGE_AGREEMENT = 0.95;
var MIN_DEM_AGREEMENT = 0.5;
var MIN_DEM_EDGE_PIXELS = 100;
// A shadow area's share of pixels inside the DEM's shadows, to be kept
var MIN_OVERLAP = 0.2;
var MIN_SMALL_OVERLAP = 0.5;
// near-infrared threshold, as a multiple of the median in the DEM's shadows
var NIR_FACTOR = 1.6;
// ... and at most this share of the image's median near-infrared (terrain
// shadows are about 0.12, sunlit forest 0.3 or more)
var MAX_NIR_SHARE = 0.25;
// the mask's edges are blurred over this distance
var EDGE_BLUR_RADIUS = 1.2;
var MIN_C_FIT = 0.5;
var MIN_C_SPREAD = 0.05;
var MIN_C_PIXELS = 64;
// Classes of ground, by color; a class's own c gets half the weight with this
// many tiles, and classes are blended over CLASS_RADIUS meters
var GROUND_CLASSES = 6;
var CLASS_PRIOR = globalThis.DSCP || 20;
var CLASS_LUMA_WEIGHT = 0.5;
var CLASS_PRIOR_PIXELS = globalThis.DSCPP || 1000;
var CLASS_ROUNDS = 3;
var SHADOW_CLASSES = 8;
var LUMA_WEIGHTS = [0.2126, 0.7152, 0.0722];
var MIN_HAZE_TILES = 10;
var HAZE_DARK_QUANTILE = 0.002;
var ALTITUDE_TOLERANCE = 0.02;
var MIN_ALTITUDE_SPAN = 10; // degrees
var EDGE_STEP = 2; // cells
var EDGE_FACING = 0.3;
var MIN_EDGE_CELLS = 30;
// see getEdgeAltitude()
var EDGE_ALTITUDE_RANGE = [MIN_ALTITUDE, 70];
var EDGE_Z = globalThis.DSEZ || 3;
var EDGE_ALTITUDE_STEP = 2;
var LOG_EPSILON = 0.005;
// sunlit pixels are lit at least this share of flat ground's I (a DEM
// smoothes cliffs into slopes lit at a lower angle)
var LIT_CAP_QUANTILE = globalThis.DSLCQ || 0.98;
var LIT_FLOOR = globalThis.DSLF === undefined ? 0.25 : globalThis.DSLF;
// Brightened pixels (by at least BOOSTED_GAIN) are kept within the colors of
// sunlit ground (lit at least LIT_SHARE of flat ground) of similar luma (in
// bins of COLOR_LUMA_STEP, log scale, with the bins next to them), within
// COLOR_TILE meters (tiles of that size, with their neighbors; at most
// MAX_COLOR_TILES of them): the most common colors that cover COLOR_COVERAGE
// of at least MIN_COLOR_SAMPLES sunlit pixels (or else of the whole image's).
// Colors are log red/green and blue/green ratios within ±COLOR_RANGE, in bins
// of COLOR_RANGE / COLOR_BINS
var BOOSTED_GAIN = 1.15;
var LIT_SHARE = 0.5;
var COLOR_TILE = globalThis.DSCTL || 1500;
var MAX_COLOR_TILES = 1000;
var COLOR_LUMA_STEP = Math.LN2 / 2;
var COLOR_LUMA_BINS = 20;
var COLOR_RANGE = 1.5;
var COLOR_BINS = 12;
var COLOR_COVERAGE = globalThis.DSCCOV || 0.95;
var MIN_COLOR_SAMPLES = 100;
var EDGE_RADIUS = 1.8;
var BLOCK_SIZE = 18;
var CHROMA_RADIUS = 1.8;
var CONTRAST_RADIUS = 3.6;
var CONTRAST_BRIGHT = 0.35;
var CONTRAST_DARK = 0.85;
var CLASS_CAP_PAIRS = 50;
var CLASS_TILE = 500;
var TILE_PRIOR = 30;
var VEG_RATIO = 1.15;
var VEG_SHARE_FULL = 0.1;
var VEG_CELL = 100;
var BARE_TILE_PRIOR = 10;
// see measureRankGains()
var RANK_BINS = globalThis.DSRB || 8;
var MIN_RANK_SAMPLES = 10;
var RANK_PRIOR = globalThis.DSRP || 200;
var RANK_MAX_RADIUS = 3;
var CLASS_NIR_WEIGHT = 1;
var CLASS_RADIUS = 2.4;
// meters; the share of the DEM's lighting of sunlit ground that the image
// shows is measured within this distance (see getLightingResponse())
var RESPONSE_RADIUS = globalThis.DSRR || 100;
var RESPONSE_SMOOTHING = globalThis.DSRS || 20;
// Elevations are smoothed over this many DEM pixels for the slopes that are
// lit, so that the facets of a DEM resampled to a finer grid don't show
var NORMAL_SMOOTHING = globalThis.DSNS || 1;
// meters; DEMs are often resampled from coarser ones (e.g. 1/9 arc-second
// DEMs from 10 m data), which leaves steps in their slopes
var MIN_NORMAL_SMOOTHING = globalThis.DSMNS === undefined ? 10 : globalThis.DSMNS;
// largest gain applied to a linear value
var MAX_GAIN = globalThis.DSMG || 25;
// Shadows are lit by blue skylight, so they need more red gain than blue
// (measured as 8-bit values); dark slopes that don't are probably something
// else, e.g. forest
export var MIN_RED_BLUE_GAIN = 1.0;
// approximate exponent of the image's transfer curve, for reporting gains as
// they apply to 8-bit values
var DISPLAY_GAMMA = 2.2;

// Elevations of a north-up grid, resampled (bilinear) onto another north-up
// grid; NaN outside the source and next to nodata
// @grid source raster grid
// Returns a Float32Array of @width x @height values, in the source's units
export function resampleGridBand(grid, band, width, height, bbox) {
  var sw = grid.width, sh = grid.height, sb = grid.bbox, bands = grid.bands;
  var samples = grid.samples, nodata = grid.nodata;
  var out = new Float32Array(width * height).fill(NaN);
  var sx = (sb[2] - sb[0]) / sw, sy = (sb[3] - sb[1]) / sh;
  var dx = (bbox[2] - bbox[0]) / width, dy = (bbox[3] - bbox[1]) / height;
  var x, y, px, py, x0, y0, x1, y1, fx, fy;
  function val(c, r) {
    var v = samples[(r * sw + c) * bands + band];
    return v === nodata ? NaN : v;
  }
  for (y = 0; y < height; y++) {
    py = (sb[3] - (bbox[3] - (y + 0.5) * dy)) / sy - 0.5;
    if (py < -0.5 || py > sh - 0.5) continue;
    py = Math.max(0, Math.min(sh - 1, py));
    y0 = Math.floor(py);
    y1 = Math.min(sh - 1, y0 + 1);
    fy = py - y0;
    for (x = 0; x < width; x++) {
      px = (bbox[0] + (x + 0.5) * dx - sb[0]) / sx - 0.5;
      if (px < -0.5 || px > sw - 0.5) continue;
      px = Math.max(0, Math.min(sw - 1, px));
      x0 = Math.floor(px);
      x1 = Math.min(sw - 1, x0 + 1);
      fx = px - x0;
      out[y * width + x] = (val(x0, y0) * (1 - fx) + val(x1, y0) * fx) * (1 - fy) +
        (val(x0, y1) * (1 - fx) + val(x1, y1) * fx) * fy;
    }
  }
  return out;
}

// Cells shadowed by terrain in the direction of the sun (including slopes
// facing away from it). NaN cells don't cast or receive shadows.
// @sun {azimuth, altitude} in radians; azimuth is clockwise from north
// @region optional {x0, y0, x1, y1}: the cells to test
// Returns a Uint8Array with 1 for shadowed cells
export function castTerrainShadow(Z, w, h, cellW, cellH, sun, region) {
  var r = region || {x0: 0, y0: 0, x1: w, y1: h};
  var out = new Uint8Array(w * h);
  // cells per meter toward the sun
  var sx = Math.sin(sun.azimuth) / cellW, sy = -Math.cos(sun.azimuth) / cellH;
  // Each step toward the sun is one cell along the axis the sun is closer to
  // (between "lines" of cells) and a fraction of a cell along the other. A
  // cell's shadow height (the highest terrain toward the sun, lowered by the
  // rise of the sun's rays over the distance) is found from the shadow
  // heights and terrain of the previous line, interpolated a step toward the
  // sun. This takes one pass, where marching a ray from each cell takes as
  // many steps as the shadows of the highest terrain are long, and it is
  // closer to rays marched over interpolated terrain.
  var byRow = Math.abs(sy) >= Math.abs(sx);
  var lines = byRow ? h : w, n = byRow ? w : h;
  var step = 1 / Math.max(Math.abs(sx), Math.abs(sy)); // meters per step
  var lineStep = (byRow ? sy : sx) > 0 ? 1 : -1;
  var shift = (byRow ? sx : sy) * step;
  var rise = step * Math.tan(sun.altitude);
  var prev = new Float32Array(n).fill(-Infinity), curr = new Float32Array(n);
  var tmp, line, k, a, b, j0, f, s, z, i, x, y;
  for (var m = 0; m < lines; m++) {
    // lines nearest the sun first
    line = lineStep > 0 ? lines - 1 - m : m;
    for (k = 0; k < n; k++) {
      i = byRow ? line * w + k : k * w + line;
      f = k + shift;
      j0 = Math.floor(f);
      f -= j0;
      a = j0 >= 0 && j0 < n ? prev[j0] : -Infinity;
      b = j0 + 1 < n ? prev[j0 + 1] : -Infinity;
      s = f === 0 || b == -Infinity ? a : a == -Infinity ? b : a + (b - a) * f;
      s -= rise;
      z = Z[i];
      if (z > -Infinity) {
        // a little above the ground, so interpolation doesn't shade flat ground
        if (s > z + 0.2) {
          x = byRow ? k : line;
          y = byRow ? line : k;
          if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) out[i] = 1;
        }
        curr[k] = s > z ? s : z;
      } else {
        curr[k] = s;
      }
    }
    tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return out;
}

// The sun's declination on a day of the year (1-366), in degrees (Spencer's
// formula, within about 0.1 degrees)
export function getSolarDeclination(day) {
  var g = 2 * Math.PI * (day - 1) / 365;
  return (0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)) * 180 / Math.PI;
}

// @hour hour angle, in degrees from solar noon (15 per hour; negative before)
// Returns {azimuth, altitude} in degrees; azimuth is clockwise from north
export function getSunPosition(latitude, declination, hour) {
  var deg = Math.PI / 180;
  var lat = latitude * deg, dec = declination * deg, H = hour * deg;
  var sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  var az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) + Math.PI;
  return {azimuth: az / deg, altitude: Math.asin(Math.max(-1, Math.min(1, sinAlt))) / deg};
}

// Fits the sun position whose lighting of the terrain (I, see above) best
// matches the image's brightness
// @brightness one value per cell, linear in the light reaching the ground; NaN
//   to ignore a cell
// @region {x0, y0, x1, y1}: the cells that have brightness values
// @start optional sun position to refine, instead of searching all positions
// @path optional {latitude, declination} or {latitude, declinations: [min,
//   max]} (degrees): the sun is searched along its path on the image's date
//   (or dates), instead of at all positions (@start is ignored)
// Returns {azimuth, altitude, score} (radians; score is a correlation, -1 to
//   1); with @path, also {hour, declination} in degrees
export function fitSunPosition(Z, brightness, w, h, cellW, cellH, region, start, path) {
  var level = getFitLevel(Z, brightness, w, h, cellW, cellH, region, FIT_CELLS, MAX_FIT_CELL);
  if (path) return fitSunPath(level, path);
  return fitFreeSun(level, start ? null :
    getFitLevel(Z, brightness, w, h, cellW, cellH, region, COARSE_FIT_CELLS, MAX_COARSE_FIT_CELL), start);
}

// @coarse level searched every 10 degrees, if there's no @start
function fitFreeSun(level, coarse, start) {
  var deg = Math.PI / 180;
  var best = {score: -2};
  var az, alt, s, moved, cand, i, sc;
  if (start) {
    best = {azimuth: start.azimuth / deg, altitude: start.altitude / deg};
  } else {
    for (az = 0; az < 360; az += 10) {
      for (alt = MIN_ALTITUDE; alt <= 80; alt += 10) {
        sc = scoreSun(coarse, az * deg, alt * deg);
        if (sc > best.score) best = {azimuth: az, altitude: alt, score: sc};
      }
    }
    if (best.score <= -1) return {azimuth: 0, altitude: 0, score: -1};
  }
  best.score = scoreSun(level, best.azimuth * deg, best.altitude * deg);
  // pattern search, from a step of half the grid spacing
  for (s = 5; s >= 0.5; ) {
    moved = false;
    cand = [[s, 0], [-s, 0], [0, s], [0, -s]];
    for (i = 0; i < 4; i++) {
      az = best.azimuth + cand[i][0];
      alt = Math.max(MIN_ALTITUDE, Math.min(MAX_ALTITUDE, best.altitude + cand[i][1]));
      sc = scoreSun(level, az * deg, alt * deg);
      if (sc > best.score) {
        best = {azimuth: (az + 360) % 360, altitude: alt, score: sc};
        moved = true;
      }
    }
    if (!moved) s /= 2;
  }
  return {azimuth: best.azimuth * deg, altitude: best.altitude * deg, score: best.score};
}

// Brightness tells the sun's azimuth better than its altitude: where albedo
// varies with the shape of the terrain (e.g. pale rock on steep slopes and
// dark forest in valleys), scores can vary little over a wide range of
// altitudes. If altitudes within ALTITUDE_TOLERANCE of @sun's score span more
// than MIN_ALTITUDE_SPAN degrees, the altitude among them is the one whose
// cast shadows' edges are the most distinct (see getShadowEdgeContrast()).
function refineAltitude(level, sun) {
  var deg = Math.PI / 180, lo = Infinity, hi = -Infinity, alt, best = null, H, c;
  for (alt = MIN_ALTITUDE; alt <= MAX_ALTITUDE; alt += 2) {
    if (scoreSun(level, sun.azimuth, alt * deg) >= sun.score - ALTITUDE_TOLERANCE) {
      lo = Math.min(lo, alt);
      hi = Math.max(hi, alt);
    }
  }
  if (!(hi - lo > MIN_ALTITUDE_SPAN)) return sun;
  H = getHorizonAngles(level, sun.azimuth, lo, hi);
  for (alt = lo; alt <= hi; alt++) {
    c = getShadowEdgeContrast(level, H, sun.azimuth, alt);
    if (c.count >= MIN_EDGE_CELLS && c.contrast > 0 && (!best || c.contrast > best.contrast)) {
      best = {altitude: alt, contrast: c.contrast};
    }
  }
  if (globalThis.DSCLOG) console.log('altitude range', lo, hi, 'edges', best && best.altitude, best && best.contrast.toFixed(3));
  if (!best) return sun;
  return {azimuth: sun.azimuth, altitude: best.altitude * deg,
    score: scoreSun(level, sun.azimuth, best.altitude * deg)};
}

// The highest altitude (whole degrees from @lo to @hi) at which each cell is
// shadowed by terrain in the direction @azimuth (@hi if higher), or 0
function getHorizonAngles(level, azimuth, lo, hi) {
  var deg = Math.PI / 180, H = new Uint8Array(level.w * level.h), alt, P, i;
  for (alt = Math.min(MAX_ALTITUDE, hi); alt >= lo; alt--) {
    P = castTerrainShadow(level.Z, level.w, level.h, level.cellW, level.cellH,
      {azimuth: azimuth, altitude: alt * deg}, level.region);
    for (i = 0; i < P.length; i++) if (P[i] && H[i] === 0) H[i] = alt;
  }
  return H;
}

// How much brighter (mean log brightness) sunlit cells just beyond the edges
// of cast shadows are than the shadowed cells EDGE_STEP cells before them
// (toward the sun), with the sun at @altitude. Only cells facing the sun are
// compared, so that the edges are of cast shadows, which are sharp, and not
// of slopes facing away from the sun, which darken gradually.
// @H horizon angles (see getHorizonAngles())
// Returns {contrast, count}
function getShadowEdgeContrast(level, H, azimuth, altitude) {
  var r = level.region, w = level.w, LB = getLevelLogBrightness(level), nrm = getLevelNormals(level);
  var a = altitude * Math.PI / 180, sx = Math.sin(azimuth) * Math.cos(a), sy = Math.cos(azimuth) * Math.cos(a);
  var sz = Math.sin(a), dx = -Math.sin(azimuth) * EDGE_STEP, dy = Math.cos(azimuth) * EDGE_STEP;
  var sum = 0, sum2 = 0, n = 0, x, y, i, j, px, py, d;
  function facing(i) {
    return nrm.x[i] * sx + nrm.y[i] * sy + nrm.z[i] * sz > EDGE_FACING;
  }
  for (y = r.y0; y < r.y1; y++) {
    for (x = r.x0; x < r.x1; x++) {
      i = y * w + x;
      if (H[i] < altitude || LB[i] !== LB[i] || !facing(i)) continue;
      px = Math.round(x + dx);
      py = Math.round(y + dy);
      if (px < r.x0 || py < r.y0 || px >= r.x1 || py >= r.y1) continue;
      j = py * w + px;
      if (H[j] >= altitude || LB[j] !== LB[j] || !facing(j)) continue;
      d = LB[j] - LB[i];
      sum += d;
      sum2 += d * d;
      n++;
    }
  }
  return {contrast: n > 0 ? sum / n : 0, count: n,
    variance: n > 1 ? Math.max(0, sum2 / n - (sum / n) * (sum / n)) * n / (n - 1) : 0};
}

// The altitude (degrees) at which the edges of cast shadows are the most
// distinct, if their contrast there exceeds the contrast MIN_ALTITUDE_SPAN
// degrees higher and lower (with at least MIN_EDGE_CELLS cells each) by
// EDGE_Z standard errors; otherwise null
function getEdgeAltitude(level, azimuth) {
  var lo = EDGE_ALTITUDE_RANGE[0], hi = EDGE_ALTITUDE_RANGE[1];
  var cache = [], best = -1, alt, c, z, k, other;
  // searched every EDGE_ALTITUDE_STEP degrees, then refined
  function stats(alt) {
    if (cache[alt] === undefined) {
      var s = getShadowEdgeContrast(level, getHorizonAngles(level, azimuth, alt, alt), azimuth, alt);
      cache[alt] = s.count >= MIN_EDGE_CELLS ? s : null;
    }
    return cache[alt];
  }
  function test(alt) {
    var s = alt >= lo && alt <= hi ? stats(alt) : null;
    if (s && s.contrast > 0 && (best < 0 || s.contrast > cache[best].contrast)) best = alt;
  }
  for (alt = lo; alt <= hi; alt += EDGE_ALTITUDE_STEP) test(alt);
  if (best < 0) return null;
  for (alt = best - EDGE_ALTITUDE_STEP + 1; alt < best + EDGE_ALTITUDE_STEP; alt++) test(alt);
  c = cache[best];
  z = Infinity;
  for (k of [best - MIN_ALTITUDE_SPAN, best + MIN_ALTITUDE_SPAN]) {
    other = k >= lo && k <= hi ? stats(k) : null;
    if (!other) return null;
    z = Math.min(z, (c.contrast - other.contrast) /
      Math.sqrt(c.variance / c.count + other.variance / other.count));
  }
  if (globalThis.DSSUNLOG) console.log('  edge altitude', best, 'contrast', c.contrast.toFixed(2), 'n', c.count, 'z', z.toFixed(1));
  return z >= EDGE_Z ? best : null;
}

function getLevelLogBrightness(level) {
  if (!level.LB) {
    level.LB = new Float32Array(level.B.length);
    for (var i = 0; i < level.B.length; i++) level.LB[i] = Math.log(level.B[i] + LOG_EPSILON);
  }
  return level.LB;
}

// The time of day (hour angle), and the declination within the range of
// @path.declinations, whose sun position best matches; hours are searched
// every half hour and refined to about a minute
function fitSunPath(level, path) {
  var deg = Math.PI / 180;
  var lo = path.declinations ? path.declinations[0] : path.declination;
  var hi = path.declinations ? path.declinations[1] : path.declination;
  var steps = Math.ceil((hi - lo) / DECLINATION_STEP);
  var best = null;
  var hour, j, s, c, ds;
  function candidate(hour, dec) {
    var pos = getSunPosition(path.latitude, dec, hour);
    if (hour < -90 || hour > 90 || dec < lo || dec > hi || pos.altitude < MIN_ALTITUDE) return null;
    return {azimuth: pos.azimuth * deg, altitude: pos.altitude * deg, hour: hour, declination: dec,
      score: scoreSun(level, pos.azimuth * deg, pos.altitude * deg)};
  }
  for (hour = -90; hour <= 90; hour += 7.5) {
    for (j = 0; j <= steps; j++) {
      c = candidate(hour, steps > 0 ? lo + (hi - lo) * j / steps : lo);
      if (c && (!best || c.score > best.score)) best = c;
    }
  }
  if (!best || best.score <= -1) return {azimuth: 0, altitude: 0, score: -1};
  ds = steps > 0 ? (hi - lo) / steps / 2 : 0;
  for (s = 3.75; s >= 0.25; s /= 2, ds /= 2) {
    [[-s, 0], [s, 0], [0, -ds], [0, ds]].forEach(function(d) {
      var c = d[0] || d[1] ? candidate(best.hour + d[0], best.declination + d[1]) : null;
      if (c && c.score > best.score) best = c;
    });
  }
  return best;
}

// Mean correlation of I with brightness within the tiles of @level.region
// (weighted by cells); -1 if no tile has both varying
// @tileR optional array for each tile's correlation (NaN if not scored)
function scoreSun(level, azimuth, altitude, tileR) {
  var r = level.region, w = level.w, B = level.B, T = level.tile;
  var tw = Math.ceil((r.x1 - r.x0) / T), th = Math.ceil((r.y1 - r.y0) / T);
  var nrm = getLevelNormals(level), NX = nrm.x, NY = nrm.y, NZ = nrm.z;
  var P = castTerrainShadow(level.Z, w, level.h, level.cellW, level.cellH,
    {azimuth: azimuth, altitude: altitude}, r);
  var sx = Math.sin(azimuth) * Math.cos(altitude), sy = Math.cos(azimuth) * Math.cos(altitude);
  var sz = Math.sin(altitude);
  var acc = new Float64Array(tw * 6), total = 0, wsum = 0;
  var tx, ty, x, y, y1, i, k, a, b, n, cov, va, vb, rr;
  if (globalThis.DSSCORE == 'grad') return scoreGradients(level, P, sx, sy, sz, tileR);
  if (globalThis.DSSCORE == 'partial') return scorePartial(level, P, sx, sy, sz, tileR);
  var LOG = globalThis.DSSCORE != "lin", LC = globalThis.DSC || 0.3, LE = globalThis.DSEPS || 0.005;
  if (LOG && !level.LB) {
    level.LB = new Float32Array(B.length);
    for (i = 0; i < B.length; i++) level.LB[i] = Math.log(B[i] + LE);
  }
  if (LOG) B = level.LB;
  for (ty = 0; ty < th; ty++) {
    acc.fill(0);
    y1 = Math.min(r.y1, r.y0 + (ty + 1) * T);
    for (y = r.y0 + ty * T; y < y1; y++) {
      for (x = r.x0; x < r.x1; x++) {
        i = y * w + x;
        b = B[i];
        if (b !== b || NZ[i] !== NZ[i]) continue;
        a = P[i] ? 0 : NX[i] * sx + NY[i] * sy + NZ[i] * sz;
        if (a < 0) a = 0;
        if (LOG) a = Math.log(a + LC);
        k = ((x - r.x0) / T | 0) * 6;
        acc[k]++;
        acc[k + 1] += a;
        acc[k + 2] += b;
        acc[k + 3] += a * a;
        acc[k + 4] += b * b;
        acc[k + 5] += a * b;
      }
    }
    for (tx = 0; tx < tw; tx++) {
      k = tx * 6;
      n = acc[k];
      rr = NaN;
      if (n >= MIN_TILE_CELLS) {
        cov = acc[k + 5] / n - acc[k + 1] / n * acc[k + 2] / n;
        va = acc[k + 3] / n - (acc[k + 1] / n) * (acc[k + 1] / n);
        vb = acc[k + 4] / n - (acc[k + 2] / n) * (acc[k + 2] / n);
        if (va > 1e-9 && vb > 0) {
          rr = cov / Math.sqrt(va * vb);
          total += n * rr;
          wsum += n;
        }
      }
      if (tileR) tileR[ty * tw + tx] = rr;
    }
  }
  return wsum > 0 ? total / wsum : -1;
}

function scorePartial(level, P, sx, sy, sz, tileR) {
  var r = level.region, w = level.w, B = level.B, T = level.tile, Z = level.Z;
  var tw = Math.ceil((r.x1 - r.x0) / T), th = Math.ceil((r.y1 - r.y0) / T);
  var nrm = getLevelNormals(level), NX = nrm.x, NY = nrm.y, NZ = nrm.z;
  var LC = globalThis.DSC || 0.3, LE = globalThis.DSEPS || 0.005, CTRL = globalThis.DSCTRL || 'nz';
  var D = CTRL == 'nz,z' ? 4 : 3, M = D * (D + 3) / 2 + 1;
  var acc = new Float64Array(tw * th * M), v = new Float64Array(D);
  var x, y, i, a, k, o, p, q, j, total = 0, wsum = 0;
  for (y = r.y0; y < r.y1; y++) {
    for (x = r.x0; x < r.x1; x++) {
      i = y * w + x;
      if (B[i] !== B[i] || NZ[i] !== NZ[i]) continue;
      a = P[i] ? 0 : NX[i] * sx + NY[i] * sy + NZ[i] * sz;
      v[0] = Math.log((a > 0 ? a : 0) + LC);
      v[1] = Math.log(B[i] + LE);
      v[2] = NZ[i];
      if (D == 4) v[3] = Z[i];
      o = (Math.floor((y - r.y0) / T) * tw + Math.floor((x - r.x0) / T)) * M;
      acc[o]++;
      for (p = 0, j = o + 1; p < D; p++) acc[j++] += v[p];
      for (p = 0; p < D; p++) for (q = p; q < D; q++) acc[j++] += v[p] * v[q];
    }
  }
  for (k = 0; k < tw * th; k++) {
    o = k * M;
    var n = acc[o], rr = NaN;
    if (n >= MIN_TILE_CELLS) {
      var C = [], mean = [];
      for (p = 0; p < D; p++) mean.push(acc[o + 1 + p] / n);
      for (p = 0; p < D; p++) C.push(new Float64Array(D));
      for (p = 0, j = o + 1 + D; p < D; p++) {
        for (q = p; q < D; q++, j++) C[p][q] = C[q][p] = acc[j] / n - mean[p] * mean[q];
      }
      var Pm = invertMatrix(C);
      if (Pm && Pm[0][0] > 0 && Pm[1][1] > 0) {
        rr = -Pm[0][1] / Math.sqrt(Pm[0][0] * Pm[1][1]);
        total += n * rr;
        wsum += n;
      }
    }
    if (tileR) tileR[k] = rr;
  }
  return wsum > 0 ? total / wsum : -1;
}

function invertMatrix(A) {
  var n = A.length, M = A.map(function(row, i) {
    var r = Array.from(row);
    for (var j = 0; j < n; j++) r.push(i == j ? 1 : 0);
    return r;
  });
  for (var c = 0; c < n; c++) {
    var best = c;
    for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[best][c])) best = r;
    if (Math.abs(M[best][c]) < 1e-12) return null;
    var t = M[c]; M[c] = M[best]; M[best] = t;
    var d = M[c][c];
    for (var j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (r = 0; r < n; r++) {
      if (r == c) continue;
      var f = M[r][c];
      if (f) for (j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map(function(row) { return row.slice(n); });
}

function scoreGradients(level, P, sx, sy, sz, tileR) {
  var r = level.region, w = level.w, B = level.B, T = level.tile;
  var tw = Math.ceil((r.x1 - r.x0) / T), th = Math.ceil((r.y1 - r.y0) / T);
  var nrm = getLevelNormals(level), NX = nrm.x, NY = nrm.y, NZ = nrm.z;
  var c = globalThis.DSC || 0.3, eps = globalThis.DSEPS || 0.005;
  var LI = new Float32Array(level.w * level.h).fill(NaN), LB = new Float32Array(level.w * level.h).fill(NaN);
  var x, y, i, a, j, d1, d2, n = 0, s1 = 0, s2 = 0, s11 = 0, s22 = 0, s12 = 0;
  var acc = new Float64Array(tw * th * 6);
  for (y = r.y0; y < r.y1; y++) {
    for (x = r.x0; x < r.x1; x++) {
      i = y * w + x;
      if (B[i] !== B[i] || NZ[i] !== NZ[i]) continue;
      a = P[i] ? 0 : NX[i] * sx + NY[i] * sy + NZ[i] * sz;
      LI[i] = Math.log((a > 0 ? a : 0) + c);
      LB[i] = Math.log(B[i] + eps);
    }
  }
  for (y = r.y0; y < r.y1; y++) {
    for (x = r.x0; x < r.x1; x++) {
      i = y * w + x;
      if (LI[i] !== LI[i]) continue;
      for (j of [x + 1 < r.x1 ? i + 1 : -1, y + 1 < r.y1 ? i + w : -1]) {
        if (j < 0 || LI[j] !== LI[j]) continue;
        d1 = LI[j] - LI[i];
        d2 = LB[j] - LB[i];
        n++; s1 += d1; s2 += d2; s11 += d1 * d1; s22 += d2 * d2; s12 += d1 * d2;
        if (tileR) {
          var k = (((y - r.y0) / T | 0) * tw + ((x - r.x0) / T | 0)) * 6;
          acc[k]++; acc[k + 1] += d1; acc[k + 2] += d2; acc[k + 3] += d1 * d1; acc[k + 4] += d2 * d2; acc[k + 5] += d1 * d2;
        }
      }
    }
  }
  if (tileR) {
    for (var t = 0; t < tw * th; t++) {
      var k2 = t * 6, m = acc[k2];
      var cv = acc[k2 + 5] / m - acc[k2 + 1] / m * acc[k2 + 2] / m;
      var v1 = acc[k2 + 3] / m - (acc[k2 + 1] / m) ** 2, v2 = acc[k2 + 4] / m - (acc[k2 + 2] / m) ** 2;
      tileR[t] = m >= MIN_TILE_CELLS && v1 > 1e-9 && v2 > 0 ? cv / Math.sqrt(v1 * v2) : NaN;
    }
  }
  if (n < 2) return -1;
  var cov = s12 / n - s1 / n * s2 / n, v11 = s11 / n - (s1 / n) ** 2, v22 = s22 / n - (s2 / n) ** 2;
  return v11 > 1e-9 && v22 > 0 ? cov / Math.sqrt(v11 * v22) : -1;
}

// The grids reduced by an integer factor, to have up to @maxCells cells in the
// region (means, ignoring NaN), with cells no larger than @maxCell meters
// Returns {Z, B, w, h, cellW, cellH, region, factor}
function getFitLevel(Z, B, w, h, cellW, cellH, region, maxCells, maxCell) {
  var cells = (region.x1 - region.x0) * (region.y1 - region.y0);
  var f = Math.min(Math.ceil(Math.sqrt(cells / maxCells)),
    Math.floor(maxCell / Math.max(cellW, cellH)));
  f = Math.max(1, f);
  var tile = Math.max(MIN_FIT_TILE, Math.round(FIT_TILE / (Math.sqrt(cellW * cellH) * f)));
  if (f == 1) return {Z: Z, B: B, w: w, h: h, cellW: cellW, cellH: cellH, region: region, factor: 1, tile: tile};
  return {
    Z: downsampleMeans(Z, w, h, f),
    B: downsampleMeans(B, w, h, f),
    w: Math.ceil(w / f),
    h: Math.ceil(h / f),
    cellW: cellW * f,
    cellH: cellH * f,
    region: {x0: Math.floor(region.x0 / f), y0: Math.floor(region.y0 / f),
      x1: Math.ceil(region.x1 / f), y1: Math.ceil(region.y1 / f)},
    factor: f,
    tile: tile
  };
}

// The part of @level within @margin cells of @region (cell coordinates)
function cropLevel(level, region, margin) {
  var x0 = Math.max(0, region.x0 - margin), y0 = Math.max(0, region.y0 - margin);
  var x1 = Math.min(level.w, region.x1 + margin), y1 = Math.min(level.h, region.y1 + margin);
  var w = x1 - x0, h = y1 - y0, Z = new Float32Array(w * h), B = new Float32Array(w * h), y;
  for (y = 0; y < h; y++) {
    Z.set(level.Z.subarray((y + y0) * level.w + x0, (y + y0) * level.w + x1), y * w);
    B.set(level.B.subarray((y + y0) * level.w + x0, (y + y0) * level.w + x1), y * w);
  }
  return {Z: Z, B: B, w: w, h: h, cellW: level.cellW, cellH: level.cellH, factor: level.factor,
    tile: level.tile, region: {x0: region.x0 - x0, y0: region.y0 - y0, x1: region.x1 - x0, y1: region.y1 - y0}};
}

function getLevelNormals(level) {
  if (!level.normals) level.normals = getNormals(level.Z, level.w, level.h, level.cellW, level.cellH);
  return level.normals;
}

function downsampleMeans(src, w, h, f) {
  var cw = Math.ceil(w / f), ch = Math.ceil(h / f);
  var sum = new Float64Array(cw * ch), count = new Uint32Array(cw * ch);
  var out = new Float32Array(cw * ch);
  var x, y, i, v;
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      v = src[y * w + x];
      if (v !== v) continue;
      i = Math.floor(y / f) * cw + Math.floor(x / f);
      sum[i] += v;
      count[i]++;
    }
  }
  for (i = 0; i < out.length; i++) out[i] = count[i] > 0 ? sum[i] / count[i] : NaN;
  return out;
}

// Unit normals of the terrain (x east, y north, z up); NaN next to NaN cells
// Returns {x, y, z}: Float32Arrays
export function getNormals(Z, w, h, cellW, cellH) {
  var NX = new Float32Array(w * h), NY = new Float32Array(w * h);
  var NZ = new Float32Array(w * h).fill(NaN);
  var x, y, i, xa, xb, ya, yb, dx, dy, m;
  for (y = 0; y < h; y++) {
    ya = y > 0 ? y - 1 : y;
    yb = y < h - 1 ? y + 1 : y;
    for (x = 0; x < w; x++) {
      xa = x > 0 ? x - 1 : x;
      xb = x < w - 1 ? x + 1 : x;
      if (xa == xb || ya == yb) continue;
      i = y * w + x;
      dx = (Z[y * w + xb] - Z[y * w + xa]) / ((xb - xa) * cellW);
      dy = (Z[ya * w + x] - Z[yb * w + x]) / ((yb - ya) * cellH);
      if (dx !== dx || dy !== dy) continue;
      m = Math.sqrt(dx * dx + dy * dy + 1);
      NX[i] = -dx / m;
      NY[i] = -dy / m;
      NZ[i] = 1 / m;
    }
  }
  return {x: NX, y: NY, z: NZ};
}

// Sun positions for regions of a mosaic (see MAX_BLOCKS)
// @sun the image's sun position
// Returns {suns, labels, tw, th}: labels has the index in suns of each tile
//   of @level's region (null if there's one sun)
function fitRegionSuns(level, sun, path) {
  var r = level.region, T = level.tile;
  var tw = Math.ceil((r.x1 - r.x0) / T), th = Math.ceil((r.y1 - r.y0) / T);
  var blocks = Math.min(MAX_BLOCKS, Math.floor(Math.sqrt(tw * th / BLOCK_TILES)));
  var margin = Math.ceil(BLOCK_MARGIN / Math.max(level.cellW, level.cellH));
  var suns = [sun], single = {suns: suns, labels: null, tw: tw, th: th};
  var bx, by, region, sub, fit, tileR, labels;
  if (globalThis.DSSUNLOG) console.log('fitRegionSuns tiles', tw, th, 'tile', T, 'cells', level.cellW.toFixed(0), 'level', level.w, level.h, 'blocks', blocks);
  if (blocks < 2) return single;
  for (by = 0; by < blocks; by++) {
    for (bx = 0; bx < blocks; bx++) {
      region = {
        x0: r.x0 + Math.round(tw * bx / blocks) * T, x1: Math.min(r.x1, r.x0 + Math.round(tw * (bx + 1) / blocks) * T),
        y0: r.y0 + Math.round(th * by / blocks) * T, y1: Math.min(r.y1, r.y0 + Math.round(th * (by + 1) / blocks) * T)
      };
      sub = cropLevel(level, region, margin);
      fit = fitRegionSun(sub, sun, path, false);
      if (globalThis.DSSUNLOG) console.log('block', bx, by, 'az', (fit.azimuth * 180 / Math.PI).toFixed(0), 'alt', (fit.altitude * 180 / Math.PI).toFixed(0), 'score', fit.score.toFixed(3), 'image sun score', scoreSun(sub, sun.azimuth, sun.altitude).toFixed(3));
      if (fit.score > scoreSun(sub, sun.azimuth, sun.altitude) + REGION_GAIN &&
          !suns.some(function(s) { return isSameSun(s, fit); })) {
        suns.push(fit);
      }
    }
  }
  if (suns.length == 1) return single;
  labels = labelSuns(level, suns, tw, th);
  if (globalThis.DSSUNLOG) for (var yy = 0; yy < th; yy++) console.log('first', Array.from(labels.subarray(yy * tw, (yy + 1) * tw)).join(''));
  var out = compactSuns(suns, labels, tw, th), iter, prev;
  for (iter = 0; iter < MAX_REFITS && out.labels && !globalThis.DSNOREFIT; iter++) {
    suns = out.suns.map(function(s, k) {
      return refitSun(level, out.labels, k, tw, th, margin, s, path, !globalThis.DSNOREFITEDGES);
    });
    if (globalThis.DSSUNLOG) console.log('refit', iter, suns.map(function(s) { return (s.azimuth * 180 / Math.PI).toFixed(0) + '/' + (s.altitude * 180 / Math.PI).toFixed(0); }).join(' '));
    suns = suns.filter(function(s, k) {
      return k === 0 || !suns.slice(0, k).some(function(s2) { return isSameSun(s, s2); });
    });
    prev = out.labels;
    // once the image is a mosaic, its own sun is just one of the candidates
    out = compactSuns(suns, labelSuns(level, suns, tw, th, globalThis.DSRM !== undefined ? globalThis.DSRM : 0), tw, th);
    if (out.labels && out.suns.length == suns.length && out.labels.every(function(l, t) { return l == prev[t]; })) break;
  }
  if (out.labels && !globalThis.DSNOAREAFIT) out = fitAreaSuns(level, out, margin, path);
  return out;
}

// Tiles are labeled by how well brightness matches each sun, which tells
// azimuths apart but not altitudes, so each connected area of a sun's tiles
// is fitted again on its own (e.g. flight lines on either side of another,
// taken at the same azimuth but different altitudes)
function fitAreaSuns(level, regions, margin, path) {
  var tw = regions.tw, th = regions.th, areas = getLabelAreas(regions.labels, tw, th);
  var areaLabels = new Int32Array(tw * th), suns = [], labels = new Int8Array(tw * th);
  areas.forEach(function(area, a) {
    area.forEach(function(t) { areaLabels[t] = a; });
  });
  areas.forEach(function(area, a) {
    var start = regions.suns[regions.labels[area[0]]];
    var sun = refitSun(level, areaLabels, a, tw, th, margin, start, path, true);
    var k = suns.findIndex(function(s) { return isSameSun(s, sun); });
    if (globalThis.DSSUNLOG) console.log('area', a, 'tiles', area.length, (sun.azimuth * 180 / Math.PI).toFixed(0) + '/' + (sun.altitude * 180 / Math.PI).toFixed(0));
    if (k < 0) {
      k = suns.length;
      suns.push(sun);
    }
    area.forEach(function(t) { labels[t] = k; });
  });
  if (globalThis.DSSUNLOG) for (var y = 0; y < th; y++) console.log('labels', Array.from(labels.subarray(y * tw, (y + 1) * tw)).join(''), ' before', Array.from(regions.labels.subarray(y * tw, (y + 1) * tw)).join(''));
  return {suns: suns, labels: suns.length > 1 ? labels : null, tw: tw, th: th};
}

function labelSuns(level, suns, tw, th, margin) {
  var tileR = suns.map(function(s) {
    var arr = new Float32Array(tw * th);
    scoreSun(level, s.azimuth, s.altitude, arr);
    return arr;
  });
  return labelTiles(tileR, tw, th, margin);
}

// @sun fitted again on the tiles of @level labeled @k (see fitRegionSun())
function refitSun(level, labels, k, tw, th, margin, sun, path, edges) {
  var r = level.region, T = level.tile, tx0 = tw, ty0 = th, tx1 = -1, ty1 = -1;
  var t, tx, ty, x, y, sub, region, fit;
  for (t = 0; t < labels.length; t++) {
    if (labels[t] != k) continue;
    tx = t % tw;
    ty = t / tw | 0;
    tx0 = Math.min(tx0, tx); tx1 = Math.max(tx1, tx);
    ty0 = Math.min(ty0, ty); ty1 = Math.max(ty1, ty);
  }
  if (tx1 < 0) return sun;
  region = {x0: r.x0 + tx0 * T, y0: r.y0 + ty0 * T,
    x1: Math.min(r.x1, r.x0 + (tx1 + 1) * T), y1: Math.min(r.y1, r.y0 + (ty1 + 1) * T)};
  sub = cropLevel(level, region, margin);
  for (y = sub.region.y0; y < sub.region.y1; y++) {
    for (x = sub.region.x0; x < sub.region.x1; x++) {
      tx = tx0 + ((x - sub.region.x0) / T | 0);
      ty = ty0 + ((y - sub.region.y0) / T | 0);
      if (labels[ty * tw + tx] != k) sub.B[y * sub.w + x] = NaN;
    }
  }
  fit = fitRegionSun(sub, sun, path, edges);
  return fit.score > -1 ? fit : sun;
}

// Brightness tells a region's sun azimuth, but not always its altitude, which
// can trade off against albedo that varies with the terrain; with @edges, the
// azimuth is fitted again at the altitude the region's shadow edges tell (see
// getEdgeAltitude()), or if they don't, at @sun's
function fitRegionSun(sub, sun, path, edges) {
  if (path) return fitSunPath(sub, path);
  var fit = fitFreeSun(sub, null, sun), alt, az, k;
  for (k = 0; edges && fit.score > -1 && k < 2; k++) {
    az = fit.azimuth;
    alt = getEdgeAltitude(sub, az);
    fit = fitAzimuth(sub, az, alt === null ? sun.altitude : alt * Math.PI / 180);
    // the edges are compared in the direction of the azimuth
    if (Math.abs(fit.azimuth - az) < SAME_SUN * Math.PI / 180 / 2) break;
  }
  return fit;
}

// Pattern search for the azimuth (radians) at a fixed altitude
function fitAzimuth(level, azimuth, altitude) {
  var deg = Math.PI / 180, az = azimuth / deg, best = scoreSun(level, azimuth, altitude);
  var s, moved, d, sc;
  for (s = 5; s >= 0.5; ) {
    moved = false;
    for (d of [s, -s]) {
      sc = scoreSun(level, (az + d) * deg, altitude);
      if (sc > best) {
        best = sc;
        az = (az + d + 360) % 360;
        moved = true;
      }
    }
    if (!moved) s /= 2;
  }
  return {azimuth: az * deg, altitude: altitude, score: best};
}

function isSameSun(a, b) {
  var deg = Math.PI / 180;
  var daz = Math.abs(a.azimuth - b.azimuth) / deg;
  return Math.min(daz, 360 - daz) < SAME_SUN && Math.abs(a.altitude - b.altitude) / deg < SAME_SUN;
}

// Each tile's sun: the best-matching one over the tile and its neighbors, if
// by @margin (default LABEL_MARGIN) better than the first; then the most
// common label among each tile and its neighbors, which also labels tiles
// that weren't scored; then small areas are merged with their surroundings
// @tileR each sun's correlation in each tile (NaN if not scored)
export function labelTiles(tileR, tw, th, margin) {
  var nt = tw * th, labels = new Int8Array(nt).fill(-1), t, k, best, base;
  var mean = tileR.map(function(arr) { return getNeighborMeans(arr, tw, th); });
  if (margin === undefined) margin = LABEL_MARGIN;
  for (t = 0; t < nt; t++) {
    base = mean[0][t];
    if (base !== base) continue;
    best = 0;
    for (k = 1; k < mean.length; k++) {
      if (mean[k][t] > base + margin && (best === 0 || mean[k][t] > mean[best][t])) best = k;
    }
    labels[t] = best;
  }
  labels = modeFilter(labels, tw, th, tileR.length);
  for (t = 0; t < nt; t++) if (labels[t] < 0) labels[t] = 0;
  mergeSmallAreas(labels, tw, th, tileR.length, MIN_REGION_TILES);
  return labels;
}

// Mean of each tile and its neighbors, ignoring NaN
function getNeighborMeans(arr, tw, th) {
  var out = new Float32Array(arr.length), x, y, dx, dy, u, v, s, n, a;
  for (y = 0; y < th; y++) {
    for (x = 0; x < tw; x++) {
      s = 0;
      n = 0;
      for (dy = -1; dy <= 1; dy++) {
        for (dx = -1; dx <= 1; dx++) {
          u = x + dx;
          v = y + dy;
          if (u < 0 || v < 0 || u >= tw || v >= th) continue;
          a = arr[v * tw + u];
          if (a !== a) continue;
          s += a;
          n++;
        }
      }
      out[y * tw + x] = arr[y * tw + x] === arr[y * tw + x] ? s / n : NaN;
    }
  }
  return out;
}

// Gives each 4-connected area of fewer than @minSize tiles the most common
// label of the tiles bordering it (smallest areas first)
export function mergeSmallAreas(labels, tw, th, K, minSize) {
  var areas = getLabelAreas(labels, tw, th), counts = new Uint32Array(K), i, a, k, best, t, u;
  areas.sort(function(a, b) { return a.length - b.length; });
  for (i = 0; i < areas.length; i++) {
    a = areas[i];
    if (a.length >= minSize) break;
    counts.fill(0);
    for (k = 0; k < a.length; k++) {
      t = a[k];
      for (u of [t % tw > 0 ? t - 1 : -1, t % tw < tw - 1 ? t + 1 : -1, t - tw, t + tw]) {
        if (u >= 0 && u < labels.length && labels[u] != labels[t]) counts[labels[u]]++;
      }
    }
    best = -1;
    for (k = 0; k < K; k++) if (counts[k] > 0 && (best < 0 || counts[k] > counts[best])) best = k;
    if (best < 0) continue;
    for (k = 0; k < a.length; k++) labels[a[k]] = best;
  }
}

// 4-connected areas of tiles with the same label: arrays of tile indexes
function getLabelAreas(labels, tw, th) {
  var seen = new Uint8Array(labels.length), areas = [], stack, area, t, u, s;
  for (s = 0; s < labels.length; s++) {
    if (seen[s]) continue;
    area = [];
    stack = [s];
    seen[s] = 1;
    while (stack.length > 0) {
      t = stack.pop();
      area.push(t);
      for (u of [t % tw > 0 ? t - 1 : -1, t % tw < tw - 1 ? t + 1 : -1, t - tw, t + tw]) {
        if (u >= 0 && u < labels.length && !seen[u] && labels[u] == labels[s]) {
          seen[u] = 1;
          stack.push(u);
        }
      }
    }
    areas.push(area);
  }
  return areas;
}

function modeFilter(labels, tw, th, K) {
  var out = new Int8Array(labels.length), counts = new Uint8Array(K);
  var x, y, dx, dy, u, v, k, best, l;
  for (y = 0; y < th; y++) {
    for (x = 0; x < tw; x++) {
      counts.fill(0);
      for (dy = -1; dy <= 1; dy++) {
        for (dx = -1; dx <= 1; dx++) {
          u = x + dx;
          v = y + dy;
          if (u < 0 || v < 0 || u >= tw || v >= th) continue;
          l = labels[v * tw + u];
          if (l >= 0) counts[l]++;
        }
      }
      l = labels[y * tw + x];
      best = l;
      for (k = 0; k < K; k++) {
        if (counts[k] > (best >= 0 ? counts[best] : 0)) best = k;
      }
      out[y * tw + x] = best;
    }
  }
  return out;
}

// Removes suns that no tile has
function compactSuns(suns, labels, tw, th) {
  var used = suns.map(function(s, k) { return k === 0 || labels.includes(k); });
  var index = [], kept = [], t;
  suns.forEach(function(s, k) {
    index[k] = used[k] ? kept.length : 0;
    if (used[k]) kept.push(s);
  });
  for (t = 0; t < labels.length; t++) labels[t] = index[labels[t]];
  return {suns: kept, labels: kept.length > 1 ? labels : null, tw: tw, th: th};
}

// I of each terrain cell, blended between the suns of nearby tiles
// @regions see fitRegionSuns()
// @level the fit level that @regions was fitted on
// Returns {I, direct, flat}: Float32Arrays of I, of I without cast shadows,
//   and of I on flat ground (sine of the sun's altitude); NaN outside
//   @region and where I is unknown
function getCellLighting(terrain, region, demPixelSize, regions, level) {
  var w = terrain.width, h = terrain.height, suns = regions.suns;
  var cell = Math.sqrt(terrain.cellWidth * terrain.cellHeight);
  var rs = Math.round(Math.max(NORMAL_SMOOTHING * demPixelSize, MIN_NORMAL_SMOOTHING) / cell);
  var nrm = getNormals(rs > 0 ? boxMeanValid(boxMeanValid(terrain.Z, w, h, rs), w, h, rs) : terrain.Z, w, h,
    terrain.cellWidth, terrain.cellHeight);
  var shadows = suns.map(function(sun) {
    return castTerrainShadow(terrain.Z, w, h, terrain.cellWidth, terrain.cellHeight, sun, region);
  });
  var vecs = suns.map(function(sun) {
    return [Math.sin(sun.azimuth) * Math.cos(sun.altitude), Math.cos(sun.azimuth) * Math.cos(sun.altitude),
      Math.sin(sun.altitude)];
  });
  var I = new Float32Array(w * h).fill(NaN), flat = new Float32Array(w * h).fill(NaN);
  var direct = new Float32Array(w * h).fill(NaN);
  var weights = new Float64Array(suns.length);
  var f = level.factor, lr = level.region, T = level.tile, labels = regions.labels;
  var tw = regions.tw, th = regions.th;
  var x, y, i, k, v, s, sum, fsum, dsum, u, t, u0, t0, u1, t1, fu, ft;
  for (y = region.y0; y < region.y1; y++) {
    for (x = region.x0; x < region.x1; x++) {
      i = y * w + x;
      if (nrm.z[i] !== nrm.z[i]) continue;
      if (labels) {
        weights.fill(0);
        u = ((x + 0.5) / f - lr.x0) / T - 0.5;
        t = ((y + 0.5) / f - lr.y0) / T - 0.5;
        u0 = Math.max(0, Math.min(tw - 1, Math.floor(u)));
        t0 = Math.max(0, Math.min(th - 1, Math.floor(t)));
        u1 = Math.min(tw - 1, u0 + 1);
        t1 = Math.min(th - 1, t0 + 1);
        fu = Math.max(0, Math.min(1, u - u0));
        ft = Math.max(0, Math.min(1, t - t0));
        weights[labels[t0 * tw + u0]] += (1 - fu) * (1 - ft);
        weights[labels[t0 * tw + u1]] += fu * (1 - ft);
        weights[labels[t1 * tw + u0]] += (1 - fu) * ft;
        weights[labels[t1 * tw + u1]] += fu * ft;
      } else {
        weights[0] = 1;
      }
      sum = 0;
      fsum = 0;
      dsum = 0;
      for (k = 0; k < suns.length; k++) {
        if (weights[k] === 0) continue;
        v = vecs[k];
        s = nrm.x[i] * v[0] + nrm.y[i] * v[1] + nrm.z[i] * v[2];
        if (s < 0) s = 0;
        dsum += weights[k] * s;
        sum += shadows[k][i] ? 0 : weights[k] * s;
        fsum += weights[k] * v[2];
      }
      I[i] = sum;
      direct[i] = dsum;
      flat[i] = fsum;
    }
  }
  return {I: I, direct: direct, flat: flat};
}

// I of each pixel. Near the edges of the DEM's shadows (within @band pixels),
// where the DEM and the image disagree, a pixel's share of shadow is from its
// log luma between the mean log lumas of the sunlit and shadowed pixels around
// it (beyond the band, within SHADOW_REFERENCE times @band), and the rest of it
// is lit like the sunlit pixels around it (the DEM's slopes are least reliable
// at the edges of shadows, e.g. on cliffs); elsewhere I is from the DEM.
// @I I of each pixel, from the DEM
function getPixelLighting(lin, valid, I, W, H, band) {
  var N = W * H, isShadow = new Float32Array(N), logY = new Float32Array(N), out = I.slice();
  var lit = new Float32Array(N), shade = new Float32Array(N), litI = new Float32Array(N);
  var near, r, mLit, wLit, mShade, wShade, mI, i, a, b, s;
  for (i = 0; i < N; i++) {
    isShadow[i] = I[i] === 0 ? 1 : 0;
    logY[i] = Math.log(0.2126 * lin[0][i] + 0.7152 * lin[1][i] + 0.0722 * lin[2][i] + 1e-4);
  }
  near = boxMean(isShadow, W, H, band);
  for (i = 0; i < N; i++) {
    if (!valid[i] || out[i] !== out[i]) continue;
    if (near[i] > 0.999) {
      shade[i] = 1;
    } else if (near[i] < 0.001) {
      lit[i] = 1;
      litI[i] = out[i];
    }
  }
  r = Math.round(band * SHADOW_REFERENCE);
  wLit = boxMean(lit, W, H, r);
  wShade = boxMean(shade, W, H, r);
  mI = boxMean(litI, W, H, r);
  for (i = 0; i < N; i++) {
    lit[i] *= logY[i];
    shade[i] *= logY[i];
  }
  mLit = boxMean(lit, W, H, r);
  mShade = boxMean(shade, W, H, r);
  for (i = 0; i < N; i++) {
    if (!(near[i] > 0.001 && near[i] < 0.999 && wLit[i] > 0.01 && wShade[i] > 0.01)) continue;
    a = mLit[i] / wLit[i];
    b = mShade[i] / wShade[i];
    if (a - b < MIN_SHADOW_CONTRAST) continue;
    s = Math.max(0, Math.min(1, (a - logY[i]) / (a - b)));
    out[i] = (1 - s) * mI[i] / wLit[i];
  }
  return out;
}

// @image {samples, bands, width, height}: uint8 RGB or RGBA
// @terrain {Z, width, height, factor, x0, y0, cellWidth, cellHeight}:
//   elevations in meters on a grid aligned with the image; cell
//   (x0 + floor(x / factor), y0 + floor(y / factor)) contains pixel (x, y)
// @nir optional near-infrared value of each pixel
// @pixelSize ground size of a pixel, in meters
// @demPixelSize ground size of the DEM's own pixels, in meters
// @path optional {latitude, declination}, to fit the sun along its path on
//   the image's date (see fitSunPosition)
// Returns {samples, sun, suns, diffuse, shadowGains, shadowShare, failure}:
//   samples is null if the image couldn't be corrected; suns are the sun
//   positions of a mosaic's regions (with the image's first), each with the
//   share of the image it lights; diffuse is c of each band; shadowGains are
//   the gains of shadows on flat ground, as they apply to 8-bit values;
//   failure is 'fit' (no sun position matches), 'diffuse' (c couldn't be
//   fitted) or 'color' (shadows aren't bluer than sunlit ground)
export function deshadowImage(image, terrain, nir, pixelSize, demPixelSize, path) {
  var W = image.width, H = image.height, N = W * H;
  var valid = getValidPixels(image);
  var lin = getLinearBands(image.samples, image.bands, N);
  var region = getTerrainRegion(terrain, W, H);
  var cells = getPixelCells(terrain, W, H);
  var result = {samples: null, sun: null, suns: null, diffuse: null, shadowGains: null,
    shadowShare: 0, failure: null};
  var level = getFitLevel(terrain.Z, getCellMeans(getLinearLuma(lin, N), W, H, terrain, valid),
    terrain.width, terrain.height, terrain.cellWidth, terrain.cellHeight, region, FIT_CELLS, MAX_FIT_CELL);
  var sun = path ? fitSunPath(level, path) : fitFreeSun(level, getFitLevel(level.Z, level.B,
    level.w, level.h, level.cellW, level.cellH, level.region,
    COARSE_FIT_CELLS, MAX_COARSE_FIT_CELL), null);
  if (!path && sun.score > -1 && !globalThis.DSNOREFINE) sun = refineAltitude(level, sun);
  var regions, light, tile, margin, all, classes, ratios, litRatios, pixelI, gains, inShadow, i, byShadows = true;
  var flat, direct, hardI, predicted, shadows, haze;
  if (globalThis.DSPROBE) {
    var Yl = getLinearLuma(lin, N), ys = [];
    for (i = 0; i < N; i += 7) if (valid[i]) ys.push(Yl[i]);
    ys.sort(function(a, b) { return a - b; });
    var q = ys[Math.floor(ys.length * 0.06)], dark = new Float32Array(N);
    for (i = 0; i < N; i++) dark[i] = Yl[i] <= q ? 1 : 0;
    var dl = getFitLevel(terrain.Z, getCellMeans(dark, W, H, terrain, valid),
      terrain.width, terrain.height, terrain.cellWidth, terrain.cellHeight, region, FIT_CELLS, MAX_FIT_CELL);
    for (i = 0; i < globalThis.DSPROBE.length; i += 2) {
      var Pp = castTerrainShadow(dl.Z, dl.w, dl.h, dl.cellW, dl.cellH, {azimuth: globalThis.DSPROBE[i] * Math.PI / 180, altitude: globalThis.DSPROBE[i + 1] * Math.PI / 180}, dl.region);
      var n0 = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (var yy = dl.region.y0; yy < dl.region.y1; yy++) for (var xx = dl.region.x0; xx < dl.region.x1; xx++) {
        var ii = yy * dl.w + xx, bb = dl.B[ii], aa = Pp[ii];
        if (bb !== bb) continue;
        n0++; sa += aa; sb += bb; saa += aa * aa; sbb += bb * bb; sab += aa * bb;
      }
      var cv = sab / n0 - sa / n0 * sb / n0;
      console.log('old-score', globalThis.DSPROBE[i], globalThis.DSPROBE[i + 1],
        (cv / Math.sqrt((saa / n0 - (sa / n0) ** 2) * (sbb / n0 - (sb / n0) ** 2))).toFixed(3),
        'shadow share', (sa / n0).toFixed(3));
      console.log('probe', globalThis.DSPROBE[i], globalThis.DSPROBE[i + 1],
        scoreSun(level, globalThis.DSPROBE[i] * Math.PI / 180, globalThis.DSPROBE[i + 1] * Math.PI / 180).toFixed(3));
    }
    console.log('level', level.w, level.h, level.cellW.toFixed(1), level.factor);
  }
  result.sun = sun;
  if (!(sun.score >= MIN_SUN_FIT)) {
    result.failure = 'fit';
    return result;
  }
  if (globalThis.DSFNS) globalThis.DSFNS = {level: level, sun: sun, scoreSun: scoreSun, fitFreeSun: fitFreeSun, refineAltitude: refineAltitude, cropLevel: cropLevel, getFitLevel: getFitLevel, getHorizonAngles: getHorizonAngles, getShadowEdgeContrast: getShadowEdgeContrast};
  regions = fitRegionSuns(level, sun, path);
  light = getCellLighting(terrain, region, demPixelSize, regions, level);
  result.suns = getSunShares(regions, level, light, cells, terrain.width, valid, N);
  if (globalThis.DSDEBUG) globalThis.DSDEBUG = {regions: regions, light: light, level: level, terrain: terrain, lin: lin, valid: valid, cells: cells, W: W, H: H, pixelSize: pixelSize};
  tile = Math.max(MIN_C_TILE, Math.round(C_TILE / pixelSize), Math.ceil(Math.sqrt(N / MAX_C_TILES)));
  margin = Math.max(1, Math.round(SHADOW_MARGIN * Math.max(demPixelSize, pixelSize) / pixelSize));
  flat = getPixelValues(light.flat, cells, Float32Array);
  direct = getPixelValues(light.direct, cells, Float32Array);
  hardI = getPixelValues(light.I, cells, Float32Array);
  for (i = 0, predicted = new Uint8Array(N); i < N; i++) predicted[i] = hardI[i] === 0 ? 1 : 0;
  shadows = getPixelShadows(image, nir, valid, predicted, cells, terrain, region, regions,
    W, H, pixelSize, demPixelSize);
  result.masked = shadows.masked;
  result.maskRatio = shadows.ratio;
  if (shadows.masked) {
    for (i = 0; i < N; i++) hardI[i] = (1 - shadows.shadow[i]) * direct[i];
  }
  haze = !globalThis.DSHAZE ? null : fitHazeOffsets(image, valid, hardI, flat, W, H, tile, margin);
  if (globalThis.DSCLOG) console.log('haze', haze && haze.map(function(v) { return v.toFixed(4); }).join(' '));
  all = fitShadowRatios(image, valid, hardI, flat, W, H, null, 1, tile, margin, haze)[0];
  if (globalThis.DSREGRESS || !all.c.every(function(c) { return c > 0; })) {
    all = fitDiffuseRatios(lin, valid, hardI, W, H, null, 1, tile)[0];
    byShadows = false;
  }
  result.diffuse = all.c;
  if (globalThis.DSPROBE || globalThis.DSCLOG) console.log('c', all.c.map(function(c) { return c.toFixed(3); }).join(' '), 'tiles', all.tiles.join(' '));
  if (!all.c.every(function(c) { return c > 0; })) {
    result.failure = 'diffuse';
    return result;
  }
  result.shadowGains = all.c.map(function(c) {
    return Math.pow(Math.min(MAX_GAIN, (Math.sin(sun.altitude) + c) / c), 1 / DISPLAY_GAMMA);
  });
  if (result.shadowGains[0] < result.shadowGains[2] * MIN_RED_BLUE_GAIN) {
    result.failure = 'color';
    return result;
  }
  if (globalThis.DSOLDCLASS) {
    classes = classifyGround(lin, valid, hardI, flat, all.c, nir, N);
    ratios = (byShadows ? fitShadowRatios(image, valid, hardI, flat, W, H, classes.labels, classes.K, tile, margin) :
      fitDiffuseRatios(lin, valid, hardI, W, H, classes.labels, classes.K, tile))
      .map(function(o) { return blendDiffuseRatios(o, all); });
  } else if (byShadows) {
    classes = fitGroundClasses(image, lin, valid, hardI, flat, all.c, W, H, margin, haze);
    ratios = classes.ratios;
    litRatios = fitSlopeRatios(lin, valid, hardI, W, H, classes.labels, ratios.length, tile, margin);
    if (globalThis.DSCLOG) console.log('slope fit', litRatios.map(function(o) { return o.c.map(function(c) { return c.toFixed(2); }).join('/') + ' n' + o.tiles.join('/') + ' sd' + o.spread.map(function(v) { return v.toFixed(2); }).join('/'); }).join('  '));
    litRatios = litRatios.map(function(o) { return blendDiffuseRatios(o, {c: getNeutralRatios(all.c)}); });
  } else {
    classes = {labels: new Uint8Array(N)};
    ratios = [all.c];
  }
  if (globalThis.DSCLOG && litRatios) console.log('slope c', litRatios.map(function(r) { return r.map(function(c) { return c.toFixed(2); }).join('/'); }).join('  '));
  if (globalThis.DSNOSLOPE || !litRatios) litRatios = ratios;
  if (globalThis.DSCLOG) console.log('class c', ratios.map(function(r) { return r.map(function(c) { return c.toFixed(2); }).join('/'); }).join('  '), 'masked', shadows.masked, shadows.ratio.toFixed(2));
  if (shadows.masked && !globalThis.DSMODELONLY) {
    var relit = relightMaskedImage(image, lin, valid, classes.labels, ratios, litRatios, flat, direct, hardI,
      shadows, W, H, pixelSize, margin);
    if (relit && relit.samples) {
      result.samples = relit.samples;
      result.shadowGains = relit.gains;
      result.shadowShare = shadows.count / N;
      return result;
    }
    if (relit) {
      result.shadowGains = relit.gains;
      result.failure = 'color';
      return result;
    }
  }
  pixelI = shadows.masked ? softenShadows(shadows.shadow, direct, W, H, toPixels(EDGE_BLUR_RADIUS, pixelSize)) :
    getPixelLighting(lin, valid, hardI, W, H, margin);
  gains = getPixelGains(lin, classes.labels, ratios, litRatios, flat, direct, pixelI, valid, W, H, pixelSize);
  if (!globalThis.DSNOCAP) limitBrightness(lin, gains, valid, getLitCap(lin, valid, pixelI, flat, null), haze);
  if (!globalThis.DSNORECT) rectifyColors(lin, gains, valid, hardI, pixelI, flat, W, H, pixelSize, margin, haze);
  if (globalThis.DSDEBUG) Object.assign(globalThis.DSDEBUG, {pixelI: pixelI, gains: gains, labels: classes.labels});
  for (i = 0, inShadow = 0; i < N; i++) {
    if (valid[i] && pixelI[i] < flat[i] * 0.5) inShadow++;
  }
  result.shadowShare = inShadow / N;
  result.samples = writeCorrectedSamples(image, lin, gains, valid, haze);
  return result;
}

// With shadows masked from the image, sunlit pixels are corrected for their
// lighting as on any image (see getPixelGains()), and then the shadows are
// brightened to match the corrected ground around them (see relightShadows()),
// and kept within the colors of sunlit ground (see rectifyColors()). Shadows
// on detailed imagery can't be corrected from their color and c alone: dark
// ground with a small c and pale ground with a large one (e.g. forest and
// granite) look alike in shadow, so their gains are measured across the
// shadows' edges.
// @labels, @ratios, @litRatios classes of ground (see getPixelGains())
// @flat, @direct, @I I of flat ground, I without cast shadows, and I, of each
//   pixel
// Returns null if the shadows' gains can't be measured, or {samples, gains}
//   (samples is null if the gains fail the color check)
function relightMaskedImage(image, lin, valid, labels, ratios, litRatios, flat, direct, I, shadows, W, H,
    pixelSize, margin) {
  var N = W * H, hard = shadows.mask.hard, litI = new Float32Array(N), i, b, gains, lit, relit;
  // ground outside the mask is sunlit, even where the DEM faces away from the sun
  for (i = 0; i < N; i++) litI[i] = Math.max(direct[i], LIT_FLOOR * flat[i]);
  gains = getPixelGains(lin, labels, ratios, litRatios, flat, litI, litI, valid, W, H, pixelSize);
  for (i = 0; i < N; i++) {
    if (hard[i]) for (b = 0; b < 3; b++) gains[b][i] = NaN;
  }
  limitBrightness(lin, gains, valid, getLitCap(lin, valid, direct, flat, hard));
  lit = Object.assign({}, image, {samples: writeCorrectedSamples(image, lin, gains, valid)});
  relit = relightShadows(lit, getLuma(lit.samples, lit.bands, N), valid, shadows.mask, pixelSize, shadows.sun);
  if (relit && relit.samples && !globalThis.DSNORECT) {
    relit.samples = rectifySamples(image, lin, relit.samples, valid, I, flat, pixelSize, margin);
  }
  return relit;
}

// @samples corrected copy of @image's samples, kept within the colors of
// sunlit ground (see rectifyColors())
// @I I of each pixel
function rectifySamples(image, lin, samples, valid, I, flat, pixelSize, margin) {
  var W = image.width, H = image.height, N = W * H, bands = image.bands, src = image.samples;
  var decode = getDecodeTable(), encode = getEncodeTable(), scale = encode.length - 1;
  var gains = [0, 1, 2].map(function() { return new Float32Array(N).fill(1); });
  var before, i, b, j, v, changed;
  for (i = 0; i < N; i++) {
    for (b = 0; b < 3; b++) {
      j = i * bands + b;
      if (samples[j] != src[j] && lin[b][i] > 0) gains[b][i] = decode[samples[j]] / lin[b][i];
    }
  }
  before = gains.map(function(arr) { return arr.slice(); });
  rectifyColors(lin, gains, valid, I, I, flat, W, H, pixelSize, margin, null);
  for (i = 0; i < N; i++) {
    for (b = 0, changed = false; b < 3; b++) {
      if (gains[b][i] !== before[b][i]) changed = true;
    }
    if (!changed) continue;
    for (b = 0; b < 3; b++) {
      v = lin[b][i] * gains[b][i];
      samples[i * bands + b] = v >= 1 ? 255 : encode[Math.round(Math.sqrt(v) * scale)];
    }
  }
  return samples;
}

// Linear luma at the LIT_CAP_QUANTILE of sunlit pixels lit within FLAT_RANGE
// of flat ground
// @shadow optional, 1 for shadowed pixels
function getLitCap(lin, valid, I, flat, shadow) {
  var hist = new Float64Array(1024), n = 0, t = 0, i, y, v;
  for (i = 0; i < I.length; i++) {
    if (!valid[i] || (shadow && shadow[i]) || !(Math.abs(I[i] - flat[i]) < FLAT_RANGE)) continue;
    y = 0.2126 * lin[0][i] + 0.7152 * lin[1][i] + 0.0722 * lin[2][i];
    hist[Math.min(1023, Math.floor(y * 1024))]++;
    n++;
  }
  if (n === 0) return 1;
  for (v = 0; v < 1024; v++) {
    t += hist[v];
    if (t >= n * LIT_CAP_QUANTILE) return (v + 1) / 1024;
  }
  return 1;
}

// Lowers @gains (as powers of themselves, keeping their colors in proportion)
// of pixels they would make brighter than @cap: brightened ground brighter
// than sunlit flat ground is likely lit more than the DEM shows (e.g. a cliff
// smoothed into a slope)
// @haze optional P of each band (see applyGain())
function limitBrightness(lin, gains, valid, cap, haze) {
  var N = lin[0].length, P = haze || [0, 0, 0], i, b, y, yg, t, g;
  for (i = 0; i < N; i++) {
    if (!valid[i] || !(gains[0][i] > 1 || gains[1][i] > 1 || gains[2][i] > 1)) continue;
    y = 0.2126 * lin[0][i] + 0.7152 * lin[1][i] + 0.0722 * lin[2][i];
    yg = 0.2126 * applyGain(lin[0][i], gains[0][i], P[0]) + 0.7152 * applyGain(lin[1][i], gains[1][i], P[1]) +
      0.0722 * applyGain(lin[2][i], gains[2][i], P[2]);
    if (!(yg > cap && yg > y && y > 0)) continue;
    t = Math.log(Math.max(cap, y) / y) / Math.log(yg / y);
    for (b = 0; b < 3; b++) {
      g = gains[b][i];
      if (g === g) gains[b][i] = Math.pow(g, t);
    }
  }
}

// Changes @gains of brightened pixels whose colors aren't those of sunlit
// ground nearby, of similar luma, to the nearest such color (keeping their
// luma): the light of shadows and of ground facing away from the sun depends
// on light reflected from the ground around them as well as on the sky, and
// the DEM's shadows don't match the image's exactly, so gains from c alone can
// turn some pixels orange or leave them blue. (Classes of ground don't narrow
// the colors: the pixels that need this are the ones most likely to be in the
// wrong class.)
// @hardI, @pixelI I of each pixel, from the DEM and refined
// @margin pixels within this many pixels of the DEM's shadows aren't sunlit
// @haze optional P of each band (see applyGain())
function rectifyColors(lin, gains, valid, hardI, pixelI, flat, W, H, pixelSize, margin, haze) {
  var N = W * H, P = haze || [0, 0, 0], nc = COLOR_BINS * 2, cells = nc * nc;
  var size = COLOR_LUMA_BINS * cells, step = COLOR_RANGE / COLOR_BINS, LB = COLOR_LUMA_BINS;
  var T = Math.max(toPixels(COLOR_TILE, pixelSize), Math.ceil(Math.sqrt(N / MAX_COLOR_TILES)));
  var tw = Math.ceil(W / T), th = Math.ceil(H / T);
  var hist = new Uint32Array(tw * th * size), sum = new Float64Array(size);
  var local = makeEnvelope(), whole = makeEnvelope();
  var counts = new Float64Array(cells), shadow = new Float32Array(N), near, out = [0, 0, 0], f = [0, 0, 0];
  var i, j, b, x, y, tx, ty, l, k, o, y0, y1, cr, cb, u, v, sc, env, x0, x1;

  function makeEnvelope() {
    return {hist: new Float64Array(size), total: new Float64Array(LB), min: new Float64Array(LB),
      nearest: new Int16Array(size)};
  }

  // sunlit colors of each luma bin include those of the bins next to it
  function setEnvelope(env, add) {
    var l, o, b, t;
    env.hist.fill(0);
    env.min.fill(-1);
    env.nearest.fill(-1);
    for (l = 0; l < LB; l++) {
      for (o = Math.max(0, l - 1); o <= Math.min(LB - 1, l + 1); o++) {
        for (b = 0; b < cells; b++) env.hist[l * cells + b] += add[o * cells + b];
      }
      for (b = 0, t = 0; b < cells; b++) t += env.hist[l * cells + b];
      env.total[l] = t;
    }
  }

  // luma bin, color bin and log color ratios of the corrected color of pixel i
  function measure(i) {
    for (b = 0; b < 3; b++) out[b] = applyGain(lin[b][i], gains[b][i], P[b]);
    y1 = LUMA_WEIGHTS[0] * out[0] + LUMA_WEIGHTS[1] * out[1] + LUMA_WEIGHTS[2] * out[2];
    l = Math.max(0, Math.min(LB - 1, Math.floor(-Math.log(y1 + 1e-6) / COLOR_LUMA_STEP)));
    cr = Math.log((out[0] + 1e-3) / (out[1] + 1e-3));
    cb = Math.log((out[2] + 1e-3) / (out[1] + 1e-3));
    u = Math.max(0, Math.min(nc - 1, Math.floor((cr + COLOR_RANGE) / step)));
    v = Math.max(0, Math.min(nc - 1, Math.floor((cb + COLOR_RANGE) / step)));
    k = l * cells + v * nc + u;
  }

  // the fewest pixels of the color bins of histogram @o that are sunlit
  // ground's colors
  function getMinCount(hist, o, total) {
    var t = 0, j;
    for (j = 0; j < cells; j++) counts[j] = hist[o + j];
    counts.sort();
    for (j = cells - 1; j > 0; j--) {
      t += counts[j];
      if (t >= COLOR_COVERAGE * total) break;
    }
    return Math.max(1, counts[j]);
  }

  // the color bin of histogram @o with sunlit colors nearest bin @k, or -1
  function findNearest(hist, o, min, k) {
    var u0 = k % nc, v0 = Math.floor(k / nc), best = -1, d = Infinity, j, du, dv;
    for (j = 0; j < cells; j++) {
      if (hist[o + j] < min) continue;
      du = j % nc - u0;
      dv = Math.floor(j / nc) - v0;
      if (du * du + dv * dv < d) {
        d = du * du + dv * dv;
        best = j;
      }
    }
    return best;
  }

  for (i = 0; i < N; i++) shadow[i] = hardI[i] === 0 ? 1 : 0;
  near = boxMean(shadow, W, H, margin);
  for (i = 0; i < N; i++) {
    if (!valid[i] || !(hardI[i] > 0) || near[i] > 0.001 || !(pixelI[i] >= LIT_SHARE * flat[i])) continue;
    y0 = LUMA_WEIGHTS[0] * lin[0][i] + LUMA_WEIGHTS[1] * lin[1][i] + LUMA_WEIGHTS[2] * lin[2][i];
    measure(i);
    if (!(y1 < y0 * BOOSTED_GAIN)) continue;
    hist[(Math.floor(i / W / T) * tw + Math.floor(i % W / T)) * size + k]++;
  }
  for (i = 0; i < tw * th * size; i++) sum[i % size] += hist[i];
  setEnvelope(whole, sum);
  for (ty = 0; ty < th; ty++) {
    for (tx = 0; tx < tw; tx++) {
      sum.fill(0);
      for (y = Math.max(0, ty - 1); y <= Math.min(th - 1, ty + 1); y++) {
        for (x = Math.max(0, tx - 1); x <= Math.min(tw - 1, tx + 1); x++) {
          o = (y * tw + x) * size;
          for (j = 0; j < size; j++) sum[j] += hist[o + j];
        }
      }
      setEnvelope(local, sum);
      x0 = tx * T;
      x1 = Math.min(W, x0 + T);
      for (y = ty * T; y < Math.min(H, ty * T + T); y++) {
        for (x = x0; x < x1; x++) {
          i = y * W + x;
          if (!valid[i] || !(gains[0][i] === gains[0][i])) continue;
          y0 = LUMA_WEIGHTS[0] * lin[0][i] + LUMA_WEIGHTS[1] * lin[1][i] + LUMA_WEIGHTS[2] * lin[2][i];
          measure(i);
          if (!(y1 >= y0 * BOOSTED_GAIN)) continue;
          env = local.total[l] >= MIN_COLOR_SAMPLES ? local : whole;
          if (env.total[l] < MIN_COLOR_SAMPLES) continue;
          o = l * cells;
          if (env.min[l] < 0) env.min[l] = getMinCount(env.hist, o, env.total[l]);
          j = k % cells;
          if (env.hist[o + j] >= env.min[l]) continue;
          if (env.nearest[o + j] == -1) env.nearest[o + j] = findNearest(env.hist, o, env.min[l], j);
          j = env.nearest[o + j];
          if (j < 0) continue;
          u = j % nc * step - COLOR_RANGE;
          v = Math.floor(j / nc) * step - COLOR_RANGE;
          f[0] = Math.exp(Math.max(u, Math.min(u + step, cr)));
          f[1] = 1;
          f[2] = Math.exp(Math.max(v, Math.min(v + step, cb)));
          sc = y1 / (LUMA_WEIGHTS[0] * f[0] + LUMA_WEIGHTS[1] + LUMA_WEIGHTS[2] * f[2]);
          for (b = 0; b < 3; b++) {
            o = lin[b][i] - P[b];
            if (o > 0) gains[b][i] = Math.min(MAX_GAIN, (f[b] * sc - P[b]) / o);
          }
        }
      }
    }
  }
}

// Each sun's share of the image's pixels (by the labels of their cells' tiles)
// @w width of the terrain grid that @cells indexes
function getSunShares(regions, level, light, cells, w, valid, N) {
  var suns = regions.suns;
  if (suns.length == 1) return [Object.assign({share: 1}, suns[0])];
  var counts = new Float64Array(suns.length), total = 0;
  var f = level.factor, lr = level.region, T = level.tile, tw = regions.tw, th = regions.th;
  var i, c, u, t;
  for (i = 0; i < N; i += 3) {
    c = cells[i];
    if (!valid[i] || light.flat[c] !== light.flat[c]) continue;
    u = Math.max(0, Math.min(tw - 1, Math.floor(((c % w + 0.5) / f - lr.x0) / T)));
    t = Math.max(0, Math.min(th - 1, Math.floor(((Math.floor(c / w) + 0.5) / f - lr.y0) / T)));
    counts[regions.labels[t * tw + u]]++;
    total++;
  }
  return suns.map(function(s, k) { return Object.assign({share: total > 0 ? counts[k] / total : 0}, s); });
}

// c of each band for each class, from the ratio of sunlit to shadowed values
// in tiles of @tile pixels: (v_lit - P) / (v_shadow - P) = (I_lit + c) / c,
// from medians of pixels at least @margin pixels inside shadows (I = 0) and
// inside sunlit ground lit like flat ground (I within FLAT_RANGE of it)
// @I, @flat I and I of flat ground, of each pixel
// @labels optional class of each pixel (0 to @K - 1)
// @haze optional P of each band (see fitHazeOffsets())
// Returns an array of {c, tiles} for each class (see fitDiffuseRatios())
export function fitShadowRatios(image, valid, I, flat, W, H, labels, K, tile, margin, haze) {
  var tiles = getTileMedians(image, valid, I, flat, W, H, labels, K, tile, margin);
  var nt = tiles.length / K, out = [], ratios, k, t, b, m, med, P;
  for (k = 0; k < K; k++) {
    ratios = [[], [], []];
    for (t = 0; t < nt; t++) {
      m = tiles[k * nt + t];
      if (!m) continue;
      for (b = 0; b < 3; b++) {
        P = haze ? haze[b] : 0;
        med = m.shadow[b] > P ? (m.lit[b] - P) / (m.shadow[b] - P) : 0;
        if (med > 1) ratios[b].push(m.I / (med - 1));
      }
    }
    out.push({
      c: ratios.map(function(arr) { return arr.length > 0 ? getMedian(arr) : NaN; }),
      tiles: ratios.map(function(arr) { return arr.length; })
    });
  }
  return out;
}

// Offsets P of each band's linear values that don't depend on lighting (haze,
// which brightens shadows as much as sunlit ground): v = A (I + c) + P. In
// tiles with sunlit and shadowed ground of different brightness (e.g. snow and
// forest), v_shadow = s v_lit + (1 - s) P, so P is from the intercept of a
// regression of the tiles' shadow medians on their sunlit medians. P is kept
// below the band's HAZE_DARK_QUANTILE (the darkest ground can't be darker than
// haze), and is 0 if there are fewer than MIN_HAZE_TILES tiles.
// Returns [P_red, P_green, P_blue]
export function fitHazeOffsets(image, valid, I, flat, W, H, tile, margin) {
  var tiles = getTileMedians(image, valid, I, flat, W, H, null, 1, tile, margin).filter(Boolean);
  var dark = getBandQuantiles(image, valid, HAZE_DARK_QUANTILE);
  return [0, 1, 2].map(function(b) {
    var n = tiles.length, w = 0, mx = 0, my = 0, sxx = 0, sxy = 0, s, P;
    if (n < MIN_HAZE_TILES) return 0;
    tiles.forEach(function(m) {
      w += m.weight;
      mx += m.weight * m.lit[b];
      my += m.weight * m.shadow[b];
    });
    mx /= w;
    my /= w;
    tiles.forEach(function(m) {
      sxx += m.weight * (m.lit[b] - mx) * (m.lit[b] - mx);
      sxy += m.weight * (m.lit[b] - mx) * (m.shadow[b] - my);
    });
    s = sxy / sxx;
    if (!(s > 0 && s < 1)) return 0;
    P = (my - s * mx) / (1 - s);
    return Math.max(0, Math.min(dark[b], P));
  });
}

// Medians (linear) of each band in each tile of each class, of shadowed and
// sunlit pixels (see fitShadowRatios())
// Returns an array (K x tiles) of {shadow, lit, I, weight} (null for tiles with
//   fewer than MIN_GROUP_PIXELS of either): I is the mean I of the sunlit
//   pixels; weight is the smaller count
function getTileMedians(image, valid, I, flat, W, H, labels, K, tile, margin) {
  var N = W * H, src = image.samples, bands = image.bands, decode = getDecodeTable();
  var tw = Math.ceil(W / tile), th = Math.ceil(H / tile), nt = tw * th;
  var inShadow = new Float32Array(N), near, hist, isum, x, y, i, g, o, b, k, n, nl, a, out = [];
  for (i = 0; i < N; i++) inShadow[i] = I[i] === 0 ? 1 : 0;
  near = boxMean(inShadow, W, H, margin);
  hist = new Uint32Array(K * nt * 2 * 3 * 256);
  isum = new Float64Array(K * nt);
  for (y = 0; y < H; y++) {
    for (x = 0; x < W; x++) {
      i = y * W + x;
      a = I[i];
      if (!valid[i] || a !== a) continue;
      if (a === 0 && near[i] > 0.999) {
        g = 0;
      } else if (a > 0 && near[i] < 0.001 && Math.abs(a - flat[i]) < FLAT_RANGE) {
        g = 1;
      } else {
        continue;
      }
      k = (labels ? labels[i] : 0) * nt + Math.floor(y / tile) * tw + Math.floor(x / tile);
      if (g == 1) isum[k] += a;
      o = k * 6 + g * 3;
      for (b = 0; b < 3; b++) hist[(o + b) * 256 + src[i * bands + b]]++;
    }
  }
  for (k = 0; k < K * nt; k++) {
    o = k * 6;
    n = countHistogram(hist, o * 256);
    nl = countHistogram(hist, (o + 3) * 256);
    if (n < MIN_GROUP_PIXELS || nl < MIN_GROUP_PIXELS) {
      out.push(null);
      continue;
    }
    out.push({
      shadow: [0, 1, 2].map(function(b) { return decode[getHistogramMedian(hist, (o + b) * 256, n)]; }),
      lit: [0, 1, 2].map(function(b) { return decode[getHistogramMedian(hist, (o + 3 + b) * 256, nl)]; }),
      I: isum[k] / nl,
      weight: Math.min(n, nl)
    });
  }
  return out;
}

// The @q quantile (linear) of each band of the valid pixels
function getBandQuantiles(image, valid, q) {
  var src = image.samples, bands = image.bands, decode = getDecodeTable();
  var hist = new Float64Array(3 * 256), n = 0, i, b;
  for (i = 0; i < valid.length; i++) {
    if (!valid[i]) continue;
    n++;
    for (b = 0; b < 3; b++) hist[b * 256 + src[i * bands + b]]++;
  }
  return [0, 1, 2].map(function(b) {
    for (var v = 0, t = 0; v < 256; v++) {
      t += hist[b * 256 + v];
      if (t >= n * q) return decode[v];
    }
    return decode[255];
  });
}

function countHistogram(hist, o) {
  for (var v = 0, n = 0; v < 256; v++) n += hist[o + v];
  return n;
}

function getHistogramMedian(hist, o, n) {
  for (var v = 0, sum = 0; v < 256; v++) {
    sum += hist[o + v];
    if (sum * 2 >= n) return v;
  }
  return 255;
}

// c of each band for each class, from regressions of linear values on I in
// tiles of @tile pixels
// @I I of each pixel
// @labels optional class of each pixel (0 to @K - 1)
// Returns an array of {c, tiles} for each class: c and the number of tiles it
//   was fitted in, for each band (c is NaN with no tiles)
export function fitDiffuseRatios(lin, valid, I, W, H, labels, K, tile) {
  var tw = Math.ceil(W / tile), th = Math.ceil(H / tile), nt = tw * th, S = 12;
  var acc = new Float64Array(K * nt * S);
  var x, y, i, a, o, b, v, k, t, n, mx, va, my, vy, cov, slope, icpt, ratios, out = [];
  for (y = 0; y < H; y++) {
    for (x = 0; x < W; x++) {
      i = y * W + x;
      if (!valid[i]) continue;
      a = I[i];
      if (a !== a) continue;
      o = ((labels ? labels[i] : 0) * nt + Math.floor(y / tile) * tw + Math.floor(x / tile)) * S;
      acc[o]++;
      acc[o + 1] += a;
      acc[o + 2] += a * a;
      for (b = 0; b < 3; b++) {
        v = lin[b][i];
        acc[o + 3 + b] += v;
        acc[o + 6 + b] += v * v;
        acc[o + 9 + b] += a * v;
      }
    }
  }
  for (k = 0; k < K; k++) {
    ratios = [[], [], []];
    for (t = 0; t < nt; t++) {
      o = (k * nt + t) * S;
      n = acc[o];
      if (n < MIN_C_PIXELS) continue;
      mx = acc[o + 1] / n;
      va = acc[o + 2] / n - mx * mx;
      if (!(va > MIN_C_SPREAD * MIN_C_SPREAD)) continue;
      for (b = 0; b < 3; b++) {
        my = acc[o + 3 + b] / n;
        vy = acc[o + 6 + b] / n - my * my;
        cov = acc[o + 9 + b] / n - mx * my;
        if (!(vy > 0)) continue;
        var rr = cov / Math.sqrt(va * vy);
        if (globalThis.DSCT ? rr * Math.sqrt((n - 2) / Math.max(1e-9, 1 - rr * rr)) < globalThis.DSCT : rr < MIN_C_FIT) continue;
        slope = cov / va;
        icpt = my - slope * mx;
        if (icpt > 0) ratios[b].push(icpt / slope);
      }
    }
    out.push({
      c: ratios.map(function(arr) { return arr.length > 0 ? getMedian(arr) : NaN; }),
      tiles: ratios.map(function(arr) { return arr.length; }),
      spread: ratios.map(getLogSpread)
    });
  }
  return out;
}

// Robust standard deviation (from the median absolute deviation) of the logs
// of @arr's values
function getLogSpread(arr) {
  if (arr.length < 2) return NaN;
  var logs = arr.map(Math.log), m = getMedian(logs);
  return 1.4826 * getMedian(logs.map(function(v) { return Math.abs(v - m); }));
}

// c of each band for each class, from sunlit ground at least @margin pixels
// from shadows (see fitDiffuseRatios()): the light of sunlit ground facing
// away from the sun includes light reflected from sunlit ground around it,
// which shadows (e.g. snow in the shadow of a ridge) don't get as much of
// @I I of each pixel
function fitSlopeRatios(lin, valid, I, W, H, labels, K, tile, margin) {
  var N = W * H, inShadow = new Float32Array(N), lit = new Float32Array(N).fill(NaN), near, i;
  for (i = 0; i < N; i++) inShadow[i] = I[i] === 0 ? 1 : 0;
  near = boxMean(inShadow, W, H, margin);
  for (i = 0; i < N; i++) {
    if (I[i] > 0 && near[i] < 0.001) lit[i] = I[i];
  }
  return fitDiffuseRatios(lin, valid, lit, W, H, labels, K, tile);
}

// The luma of @c, for each band: without evidence of how a class of sunlit
// ground's color changes with its lighting (see fitSlopeRatios()), its gains
// don't change it (classes' c from shadows don't apply: e.g. shadowed forest
// is darkened by its own trees' shadows too)
function getNeutralRatios(c) {
  var cy = LUMA_WEIGHTS[0] * c[0] + LUMA_WEIGHTS[1] * c[1] + LUMA_WEIGHTS[2] * c[2];
  return [cy, cy, cy];
}

// A class's c, blended with the image's (log scale) by its number of tiles
// (see CLASS_PRIOR)
function blendDiffuseRatios(cls, all) {
  return all.c.map(function(c, b) {
    var n = cls.c[b] > 0 ? cls.tiles[b] : 0;
    return n > 0 ? Math.exp((n * Math.log(cls.c[b]) + CLASS_PRIOR * Math.log(c)) / (n + CLASS_PRIOR)) : c;
  });
}

// Classes of ground and their c. Classes are made from the colors of sunlit
// ground lit like flat ground (k-means), and each pixel gets the class whose
// color, lit like the pixel is (with the class's c), is nearest its own (in
// log RGB, with differences in lightness weighted by CLASS_LUMA_WEIGHT).
// A class's c is @all times a factor, from its pixels in shadow and on sunlit
// flat ground (see fitShadowRatios()), blended with 1 by its number of
// shadowed pixels (CLASS_PRIOR_PIXELS gets half the weight). The sky's color
// is the same over all ground, which differs in how much of it it sees (and
// with a factor for each band, classes of shadowed ground can be fitted to
// colors that aren't the sky's: dark shadows of any ground look alike).
// Classes are assigned and fitted CLASS_ROUNDS times.
// @I, @flat I and I of flat ground, of each pixel
// @all c of the whole image
// @haze optional P of each band (see fitHazeOffsets())
// Returns {labels, ratios}: ratios has c of each class
export function fitGroundClasses(image, lin, valid, I, flat, all, W, H, margin, haze) {
  var N = W * H, src = image.samples, bands = image.bands, decode = getDecodeTable();
  var group = getRatioGroups(valid, I, flat, W, H, margin);
  var labels = new Uint8Array(N), step = Math.max(1, Math.floor(N / 20000));
  var samples = [], f = new Float64Array(3), centers, K, m, ratios, round, i, k, b, hist, counts;
  var P = haze || [0, 0, 0];
  function logColor(i, out) {
    for (var b = 0; b < 3; b++) out[b] = Math.log(Math.max(0, lin[b][i] - P[b]) + 1e-4);
    return out;
  }
  for (i = 0; i < N; i += step) {
    if (group[i] != 1) continue;
    logColor(i, f);
    samples.push([f[0] - f[1], f[2] - f[1], CLASS_LUMA_WEIGHT * (f[0] + f[1] + f[2]) / 3]);
  }
  centers = kMeans(samples, GROUND_CLASSES);
  K = centers.length;
  if (K < 2) return {labels: labels, ratios: [all]};
  // mean log color of each class's sunlit pixels
  m = centers.map(function() { return [0, 0, 0, 0]; });
  for (i = 0; i < N; i++) {
    if (group[i] != 1) continue;
    logColor(i, f);
    k = nearestCenter(centers, [f[0] - f[1], f[2] - f[1], CLASS_LUMA_WEIGHT * (f[0] + f[1] + f[2]) / 3]);
    for (b = 0; b < 3; b++) m[k][b] += f[b];
    m[k][3]++;
  }
  m = m.map(function(s) { return s[3] > 0 ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : null; });
  ratios = m.map(function() { return all.slice(); });
  for (round = 0; round < CLASS_ROUNDS; round++) {
    hist = new Uint32Array(K * 6 * 256);
    counts = new Float64Array(K * 2);
    for (i = 0; i < N; i++) {
      if (group[i] < 0) continue;
      k = nearestLitClass(m, ratios, logColor(i, f), I[i], flat[i]);
      for (b = 0; b < 3; b++) hist[((k * 2 + group[i]) * 3 + b) * 256 + src[i * bands + b]]++;
      counts[k * 2 + group[i]] += group[i] == 1 ? I[i] : 1;
    }
    ratios = ratios.map(function(r, k) {
      var n = countHistogram(hist, k * 6 * 256), nl = countHistogram(hist, (k * 6 + 3) * 256);
      if (n < MIN_GROUP_PIXELS || nl < MIN_GROUP_PIXELS) return all.slice();
      var logK = 0;
      all.forEach(function(c, b) {
        var sh = decode[getHistogramMedian(hist, (k * 6 + b) * 256, n)] - P[b];
        var ratio = sh > 0 ? (decode[getHistogramMedian(hist, (k * 6 + 3 + b) * 256, nl)] - P[b]) / sh : 0;
        var ck = ratio > 1 ? counts[k * 2 + 1] / nl / (ratio - 1) : c;
        logK += LUMA_WEIGHTS[b] * Math.log(ck / c);
      });
      logK = n * logK / (n + CLASS_PRIOR_PIXELS);
      return all.map(function(c) { return c * Math.exp(logK); });
    });
  }
  for (i = 0; i < N; i++) {
    if (valid[i] && I[i] === I[i]) labels[i] = nearestLitClass(m, ratios, logColor(i, f), I[i], flat[i]);
  }
  return {labels: labels, ratios: ratios};
}

function groupValues(group, n, getValue) {
  var start = new Uint32Array(n + 1), next, values, i, c;
  for (i = 0; i < group.length; i++) if (group[i] >= 0) start[group[i] + 1]++;
  for (c = 0; c < n; c++) start[c + 1] += start[c];
  next = start.slice();
  values = new Float32Array(start[n]);
  for (i = 0; i < group.length; i++) {
    if (group[i] >= 0) values[next[group[i]]++] = getValue(i);
  }
  return {values: values, start: start};
}

function groupMedian(groups, c) {
  return sortedQuantile(groups.values.subarray(groups.start[c], groups.start[c + 1]), 0.5);
}

// Sorts @arr in place
function sortedQuantile(arr, q) {
  arr.sort();
  return arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
}

// Multiplies shadowed pixels by sunlit/shadowed ratios measured across the
// shadows' edges. Partly shadowed pixels are taken to be lit * (1 - a + a / gain).
// Shadows darken some ground less than others (sunlit forest is already
// partly shadowed by its own trees), so the ratios are measured for classes
// of shadowed ground, in tiles; where the sunlit ground nearby isn't
// vegetation (e.g. above the tree line), they are those of the bare ground
// nearby, blended with gains that give the shadows the distribution of
// brightness of the sunlit ground around them (see measureRankGains()). A
// class's shadows are kept below the lightness of its sunlit ground.
// Returns {samples, gains}, or null if there are no edges to measure
function relightShadows(image, L, valid, mask, pixelSize, sun) {
  var W = image.width, H = image.height, N = W * H, bands = image.bands;
  var src = image.samples, hard = mask.hard;
  var edge = boxMean(toFloat(hard), W, H, toPixels(EDGE_RADIUS, pixelSize));
  // samples at least two pixels from the edges: in resampled imagery (e.g.
  // map tiles), pixels next to an edge are partly shadowed
  var edgeR = toPixels(EDGE_RADIUS, pixelSize);
  var gap = edgeR >= 2 ? edge : boxMean(toFloat(hard), W, H, 2);
  // pixels that may be shadowed are neither sunlit nor shadow samples
  if (mask.uncertain) gap = excludeUncertain(gap, mask.uncertain);
  // shadows the mask has missed, and partly lit pixels, aren't sunlit
  var litT = Math.max(mask.threshold, getLitThreshold(L, valid, gap, mask.near));
  var gains = measureGains(src, bands, L, valid, gap, litT, W, H, pixelSize);
  if (!gains) return null;
  if (gains[0] < gains[2] * MIN_RED_BLUE_GAIN) return {samples: null, gains: gains};
  var imageCap = getBrightnessCap(L, valid, edge, mask);
  var maxDist = Math.max(8, toPixels(BLOCK_SIZE, pixelSize));
  var near = boxMean(toFloat(hard), W, H, maxDist);
  var pairs = findEdgePairs(valid, hard, edge, gap, near, W, H, maxDist, sun, globalThis.DSPAIRDARK ? mask.dem : null);
  var classes = measureClassGains(src, bands, L, valid, hard, edge, pairs, W, H, gains, pixelSize);
  var bare = getBareShare(src, bands, valid, hard, gap, near, W, H, pixelSize);
  if (globalThis.DSDEBUG) Object.assign(globalThis.DSDEBUG, {rsHard: hard, rsGap: gap, rsNear: near, rsSrc: src, rsBands: bands, rsW: W, rsPairs: pairs, rsCls: classes.cls});
  var bareGains = measureBareGains(src, bands, pairs, W, H, gains, pixelSize);
  var range = getShadowLightnessRange(L, valid, edge, hard, gains);
  var cls = classes.cls, alpha = new Float32Array(N), wt = new Float32Array(N);
  var logG = [0, 1, 2].map(function() { return new Float32Array(N); });
  var relit, i, k, s, b, x, y, la, a, g, cap, f;
  var ring = near;
  near = null;
  for (i = 0; i < N; i++) {
    s = cls[i];
    if (s < 0) continue;
    x = i % W;
    y = Math.floor(i / W);
    b = bare[i];
    la = getLightnessAlpha(L[i], classes.lo[s], classes.hi[s]);
    if (b > 0) la = (1 - b) * la + b * getLightnessAlpha(L[i], range[0], range[1]);
    if (mask.dem && mask.dem[i]) alpha[i] = 1;
    else if (edge[i] > 0 && edge[i] < 1) alpha[i] = la;
    else if (hard[i]) alpha[i] = globalThis.DSHA ? 1 : Math.min(1, la * 1.5);
    wt[i] = 1;
    for (k = 0; k < 3; k++) {
      logG[k][i] = getTileLogGain(classes, s, x, y, k);
      if (b > 0) logG[k][i] = (1 - b) * logG[k][i] + b * getTileLogGain(bareGains, 0, x, y, k);
    }
  }
  // gains are smoothed, as neighboring pixels can be in different classes
  var r = toPixels(CHROMA_RADIUS, pixelSize), mw = boxMean(wt, W, H, r);
  logG = logG.map(function(arr) { return boxMean(arr, W, H, r); });
  if (!globalThis.DSNOQM) {
    applyRankGains(logG, mw, measureRankGains(src, bands, L, valid, hard, edge, gap, ring, litT, W, H, pixelSize), L, cls, bare, W, H);
  }
  relit = [0, 1, 2].map(function() { return new Float32Array(N); });
  for (i = 0; i < N; i++) {
    a = alpha[i];
    for (k = 0; k < 3; k++) {
      g = src[i * bands + k];
      relit[k][i] = a < 0.01 ? g : Math.min(255, g / (1 - a + a / Math.exp(logG[k][i] / mw[i])));
    }
    if (a < 0.01) continue;
    cap = Math.min(imageCap, classes.cap[cls[i]]);
    if (bare[i] > 0) cap = (1 - bare[i]) * cap + bare[i] * imageCap;
    y = 0.299 * relit[0][i] + 0.587 * relit[1][i] + 0.114 * relit[2][i];
    if (y > cap && y > L[i]) {
      f = Math.max(L[i], cap) / y;
      for (k = 0; k < 3; k++) relit[k][i] *= f;
    }
  }
  if (globalThis.DSRSP) globalThis.DSRSP.forEach(function(q) {
    var j = q[1] * W + q[0], c = cls[j];
    console.log('rsp', q.join(','), 'cls', c, 'alpha', alpha[j].toFixed(2), 'bare', bare[j].toFixed(2), 'L', L[j].toFixed(0),
      'gain', [0, 1, 2].map(function(k) { return Math.exp(logG[k][j] / mw[j]).toFixed(2); }).join('/'),
      'cap', c >= 0 ? Math.min(imageCap, classes.cap[c]).toFixed(0) : '-', 'imageCap', imageCap.toFixed(0), 'lo/hi', c >= 0 ? classes.lo[c].toFixed(0) + '/' + classes.hi[c].toFixed(0) : '-',
      'relit', [0, 1, 2].map(function(k) { return relit[k][j].toFixed(0); }).join('/'), 'global', gains.map(function(g) { return g.toFixed(2); }).join('/'));
  });
  if (!globalThis.DSNOCC) compressContrast(relit, alpha, W, H, toPixels(CONTRAST_RADIUS, pixelSize));
  if (globalThis.DSRSP) globalThis.DSRSP.forEach(function(q) {
    var j = q[1] * W + q[0];
    console.log('rsp after contrast', q.join(','), [0, 1, 2].map(function(k) { return relit[k][j].toFixed(0); }).join('/'));
  });
  return {
    samples: writeRelitSamples(src, bands, relit, alpha, edge, W, H, pixelSize),
    gains: gains
  };
}

// A copy of @gap (share of shadow pixels nearby: 0 for sunlit samples, 1 for
// shadow samples) with @uncertain pixels set between
function excludeUncertain(gap, uncertain) {
  var out = gap.slice();
  for (var i = 0; i < out.length; i++) {
    if (uncertain[i] && (out[i] === 0 || out[i] > 0.999)) out[i] = 0.5;
  }
  return out;
}

// Pairs of pixels across the shadows' edges: each sunlit pixel near a shadow,
// and the first shadow pixel (away from the edges) toward the sun from it, up
// to @maxDist pixels away. On the side of a shadow away from the sun the same
// ground is likely to continue (on the sun's side is whatever casts the
// shadow, e.g. a pale cliff).
// Returns {lit, shadow}: the pairs' pixels
function findEdgePairs(valid, hard, edge, gap, near, W, H, maxDist, sun, dem) {
  var dx = Math.sin(sun.azimuth), dy = -Math.cos(sun.azimuth);
  var lit = [], shadow = [], i, j, d, x, y, px, py;
  for (i = 0; i < W * H; i++) {
    if (!valid[i] || hard[i] || gap[i] > 0 || near[i] === 0) continue;
    x = i % W;
    y = Math.floor(i / W);
    for (d = 1; d <= maxDist; d++) {
      px = Math.round(x + dx * d);
      py = Math.round(y + dy * d);
      if (px < 0 || py < 0 || px >= W || py >= H) break;
      j = py * W + px;
      if (hard[j] && edge[j] > 0.999 && valid[j]) {
        if (dem && dem[j]) break;
        lit.push(i);
        shadow.push(j);
        break;
      }
    }
  }
  return {lit: Int32Array.from(lit), shadow: Int32Array.from(shadow)};
}

// Classes of shadowed ground by color (k-means of the shadows' cores), each
// with gains from the @pairs whose shadow pixel is in the class (ratios of
// medians), blended with the image's @gains; and in tiles, blended with the
// class's
// Returns {cls, lo, hi, cap, tileLog, tileSize, tw, th}: cls is the class of
//   each shadowed or partly shadowed pixel (or -1); lo is the median luma of
//   each class's shadows and hi that luma brightened; cap is the 90th
//   percentile luma of the class's sunlit pixels; tileLog has the log gains
//   of each class in each tile (tw x th tiles of tileSize pixels)
function measureClassGains(src, bands, L, valid, hard, edge, pairs, W, H, gains, pixelSize) {
  var N = W * H, feat = new Float64Array(3), samples = [], ncore = 0;
  var i, j, k, s, p, n, w, g, gl, lo, m, key, lv, sv, stride;
  for (i = 0; i < N; i++) if (valid[i] && hard[i] && edge[i] > 0.999) ncore++;
  stride = Math.max(1, Math.floor(ncore / 20000));
  for (i = 0, j = 0; i < N; i++) {
    if (!(valid[i] && hard[i] && edge[i] > 0.999)) continue;
    if (j++ % stride === 0) samples.push(Array.from(getColorFeatures(src, bands, L, i, feat)));
  }
  var centers = kMeans(samples, Math.min(SHADOW_CLASSES, samples.length));
  var K = centers.length, cls = new Int8Array(N).fill(-1);
  for (i = 0; i < N; i++) {
    if (valid[i] && (hard[i] || edge[i] > 0)) cls[i] = nearestCenter(centers, getColorFeatures(src, bands, L, i, feat));
  }
  var np = pairs.lit.length, classOf = new Int32Array(np), classGains = new Float32Array(K * 3);
  for (p = 0; p < np; p++) classOf[p] = cls[pairs.shadow[p]];
  for (k = 0; k < 3; k++) {
    lv = groupValues(classOf, K, function(p) { return src[pairs.lit[p] * bands + k]; });
    sv = groupValues(classOf, K, function(p) { return src[pairs.shadow[p] * bands + k]; });
    for (s = 0; s < K; s++) {
      n = lv.start[s + 1] - lv.start[s];
      w = n / (n + CLASS_PRIOR);
      g = n > 0 ? Math.max(1, groupMedian(lv, s) / Math.max(1, groupMedian(sv, s))) : gains[k];
      classGains[s * 3 + k] = Math.exp(w * Math.log(g) + (1 - w) * Math.log(gains[k]));
    }
  }
  var out = {cls: cls, lo: new Float32Array(K), hi: new Float32Array(K), cap: new Float32Array(K)};
  var litL = groupValues(classOf, K, function(p) { return L[pairs.lit[p]]; });
  var shL = groupValues(classOf, K, function(p) { return L[pairs.shadow[p]]; });
  for (s = 0; s < K; s++) {
    n = litL.start[s + 1] - litL.start[s];
    gl = 0.299 * classGains[s * 3] + 0.587 * classGains[s * 3 + 1] + 0.114 * classGains[s * 3 + 2];
    lo = n > 0 ? groupMedian(shL, s) : Math.exp(centers[s][2] / CLASS_LUMA_WEIGHT) - 1;
    out.lo[s] = lo;
    out.hi[s] = Math.max(lo + 1, lo * gl);
    out.cap[s] = n >= CLASS_CAP_PAIRS ? sortedQuantile(litL.values.subarray(litL.start[s], litL.start[s + 1]), 0.9) : 255;
  }
  var tileSize = Math.max(8, Math.round(CLASS_TILE / pixelSize));
  var tw = Math.ceil(W / tileSize), th = Math.ceil(H / tileSize), nt = tw * th;
  var tileLog = new Float32Array(K * nt * 3), keys = new Int32Array(np);
  for (p = 0; p < np; p++) keys[p] = classOf[p] * nt + getTileIndex(pairs.shadow[p], W, tileSize, tw);
  for (key = 0; key < K * nt; key++) {
    for (k = 0; k < 3; k++) tileLog[key * 3 + k] = Math.log(classGains[Math.floor(key / nt) * 3 + k]);
  }
  for (k = 0; k < 3; k++) {
    lv = groupValues(keys, K * nt, function(p) { return src[pairs.lit[p] * bands + k]; });
    sv = groupValues(keys, K * nt, function(p) { return src[pairs.shadow[p] * bands + k]; });
    for (key = 0; key < K * nt; key++) {
      m = lv.start[key + 1] - lv.start[key];
      if (m === 0) continue;
      g = Math.max(1, groupMedian(lv, key) / Math.max(1, groupMedian(sv, key)));
      w = m / (m + TILE_PRIOR);
      tileLog[key * 3 + k] = w * Math.log(g) + (1 - w) * tileLog[key * 3 + k];
    }
  }
  out.tileLog = tileLog;
  out.tileSize = tileSize;
  out.tw = tw;
  out.th = th;
  return out;
}

function getTileIndex(i, W, tileSize, tw) {
  return Math.floor(Math.floor(i / W) / tileSize) * tw + Math.floor((i % W) / tileSize);
}

// A class's log gain at a pixel, interpolated between the tiles' centers
function getTileLogGain(classes, s, x, y, k) {
  var T = classes.tileSize, tw = classes.tw, th = classes.th, base = s * tw * th;
  var fx = Math.max(0, Math.min(tw - 1, x / T - 0.5)), fy = Math.max(0, Math.min(th - 1, y / T - 0.5));
  var x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(tw - 1, x0 + 1), y1 = Math.min(th - 1, y0 + 1);
  var ax = fx - x0, ay = fy - y0, v = classes.tileLog;
  function at(tx, ty) { return v[(base + ty * tw + tx) * 3 + k]; }
  return (at(x0, y0) * (1 - ax) + at(x1, y0) * ax) * (1 - ay) + (at(x0, y1) * (1 - ax) + at(x1, y1) * ax) * ay;
}

// Pixel color features for classifying ground: two log chromaticities, and
// log luma (lightness varies more within a kind of ground than color does)
function getColorFeatures(src, bands, L, i, out) {
  var r = src[i * bands] + 1, g = src[i * bands + 1] + 1, b = src[i * bands + 2] + 1;
  out[0] = Math.log(r / g);
  out[1] = Math.log(b / g);
  out[2] = CLASS_LUMA_WEIGHT * Math.log(L[i] + 1);
  return out;
}




// Luma halfway between the shadows' cores and the pixels outside them, near
// the DEM's shadows (medians)
function getLitThreshold(L, valid, edge, near) {
  var core = [], out = [], i;
  for (i = 0; i < L.length; i += 3) {
    if (!valid[i]) continue;
    if (edge[i] > 0.999) core.push(L[i]);
    else if (edge[i] === 0 && near[i]) out.push(L[i]);
  }
  if (core.length === 0 || out.length === 0) return 0;
  return (getMedian(core) + getMedian(out)) / 2;
}

// Median ratio of sunlit to shadowed values, by channel, in square blocks that
// have both shadow and sunlit pixels. (The color of shadows depends on the
// imagery's processing as well as on skylight: e.g. shadows in NAIP 2022
// California imagery are greenish, so gains are measured, not modeled.)
// Blocks are made larger if none has enough of both, as when the shadows are
// only a few pixels wide.
function measureGains(src, bands, L, valid, edge, T, W, H, pixelSize) {
  var bs = Math.max(8, toPixels(BLOCK_SIZE, pixelSize));
  var minCount = Math.max(10, Math.round(bs * bs / 9));
  var gains = null;
  for (var scale = 1; scale <= 4 && !gains; scale *= 2) {
    gains = measureBlockGains(src, bands, L, valid, edge, T, W, H, bs * scale, minCount);
  }
  return gains;
}

function measureBlockGains(src, bands, L, valid, edge, T, W, H, bs, minCount) {
  var ratios = [[], [], []];
  var bx, by, x, y, j, k, ns, nl, sh, lt;
  for (by = 0; by + bs <= H; by += bs) {
    for (bx = 0; bx + bs <= W; bx += bs) {
      sh = [0, 0, 0];
      lt = [0, 0, 0];
      ns = nl = 0;
      for (y = by; y < by + bs; y++) {
        for (x = bx; x < bx + bs; x++) {
          j = y * W + x;
          if (!valid[j]) continue;
          if (edge[j] > 0.999) {
            ns++;
            for (k = 0; k < 3; k++) sh[k] += src[j * bands + k];
          } else if (edge[j] === 0 && L[j] > T) {
            nl++;
            for (k = 0; k < 3; k++) lt[k] += src[j * bands + k];
          }
        }
      }
      if (ns < minCount || nl < minCount) continue;
      for (k = 0; k < 3; k++) {
        if (sh[k] > 0) ratios[k].push((lt[k] / nl) / (sh[k] / ns));
      }
    }
  }
  if (ratios[0].length === 0 || ratios[1].length === 0 || ratios[2].length === 0) return null;
  return ratios.map(function(arr) { return Math.max(1, getMedian(arr)); });
}

// Shadow luma: the median of the shadows' cores, and that luma brightened by
// @gains
function getShadowLightnessRange(L, valid, edge, hard, gains) {
  var N = L.length, core = [], lo, hi, i;
  for (i = 0; i < N; i += 13) if (edge[i] > 0.999 && valid[i]) core.push(L[i]);
  if (core.length === 0) {
    for (i = 0; i < N; i++) if (hard[i] && edge[i] > 0.999 && valid[i]) core.push(L[i]);
  }
  lo = getMedian(core);
  hi = lo * (0.299 * gains[0] + 0.587 * gains[1] + 0.114 * gains[2]);
  if (!(hi > lo)) hi = lo + 1;
  return [lo, hi];
}

// How much of a pixel is shadowed (0-1), from its luma: shadows are ground
// lit only by the sky, so a luma between a shadow's luma (@lo) and that luma
// brightened (@hi) places the pixel between shadow and sun
function getLightnessAlpha(l, lo, hi) {
  return Math.max(0, Math.min(1, (hi - l) / (hi - lo)));
}

// How little of the sunlit ground near each pixel is vegetation, from 0 (at
// least VEG_SHARE_FULL of it) to 1 (none), interpolated between the cells of
// a grid
function getBareShare(src, bands, valid, hard, gap, near, W, H, pixelSize) {
  var N = W * H, cell = Math.max(8, Math.round(VEG_CELL / pixelSize));
  var gw = Math.ceil(W / cell), gh = Math.ceil(H / cell);
  var veg = new Float64Array(gw * gh), tot = new Float64Array(gw * gh), i, c, gx, gy, sx, sy, a, t;
  for (i = 0; i < N; i++) {
    if (!valid[i] || hard[i] || gap[i] > 0 || near[i] === 0) continue;
    c = getTileIndex(i, W, cell, gw);
    tot[c]++;
    if (isVegetation(src, bands, i)) veg[c]++;
  }
  var share = new Float32Array(gw * gh);
  for (gy = 0; gy < gh; gy++) {
    for (gx = 0; gx < gw; gx++) {
      a = 0;
      t = 0;
      for (sy = Math.max(0, gy - 1); sy <= Math.min(gh - 1, gy + 1); sy++) {
        for (sx = Math.max(0, gx - 1); sx <= Math.min(gw - 1, gx + 1); sx++) {
          a += veg[sy * gw + sx];
          t += tot[sy * gw + sx];
        }
      }
      share[gy * gw + gx] = t > 0 ? Math.max(0, 1 - a / t / VEG_SHARE_FULL) : NaN;
    }
  }
  fillEmptyCells(share, gw, gh, 0);
  var out = new Float32Array(N), x, y, fx, fy, x0, y0, x1, y1, ax, ay;
  for (i = 0; i < N; i++) {
    x = i % W;
    y = Math.floor(i / W);
    fx = Math.max(0, Math.min(gw - 1, x / cell - 0.5));
    fy = Math.max(0, Math.min(gh - 1, y / cell - 0.5));
    x0 = Math.floor(fx);
    y0 = Math.floor(fy);
    x1 = Math.min(gw - 1, x0 + 1);
    y1 = Math.min(gh - 1, y0 + 1);
    ax = fx - x0;
    ay = fy - y0;
    out[i] = (share[y0 * gw + x0] * (1 - ax) + share[y0 * gw + x1] * ax) * (1 - ay) +
      (share[y1 * gw + x0] * (1 - ax) + share[y1 * gw + x1] * ax) * ay;
  }
  return out;
}

// Sets NaN cells of a grid to the mean of their neighbors, working outward
// from the cells that have values (or to @fallback, if none do)
function fillEmptyCells(grid, gw, gh, fallback) {
  var empty = 0, next, i, x, y, sx, sy, s, n, v;
  for (i = 0; i < grid.length; i++) if (grid[i] !== grid[i]) empty++;
  if (empty == grid.length) grid.fill(fallback);
  while (empty > 0 && empty < grid.length) {
    next = grid.slice();
    for (y = 0; y < gh; y++) {
      for (x = 0; x < gw; x++) {
        if (grid[y * gw + x] === grid[y * gw + x]) continue;
        s = n = 0;
        for (sy = Math.max(0, y - 1); sy <= Math.min(gh - 1, y + 1); sy++) {
          for (sx = Math.max(0, x - 1); sx <= Math.min(gw - 1, x + 1); sx++) {
            v = grid[sy * gw + sx];
            if (v === v) {
              s += v;
              n++;
            }
          }
        }
        if (n > 0) {
          next[y * gw + x] = s / n;
          empty--;
        }
      }
    }
    grid.set(next);
  }
}

// Green well above red, and above blue (snow and ice in light shade, and
// water, can be green well above red)
function isVegetation(src, bands, i) {
  var g = src[i * bands + 1] + 1;
  return g > (src[i * bands] + 1) * VEG_RATIO && g > src[i * bands + 2] + 1;
}

// Gains that give each tile's shadows the distribution of brightness of the
// sunlit ground around them, by matching their pixels in order of luma, in
// RANK_BINS bins (ground that's bright when lit, e.g. snow, is brightened
// less than dark ground, and the order of brightness is kept)
// @ring 0 for pixels too far from the shadows to be sunlit samples
// Returns {centers, logs, weights, tileSize, tw, th}: the median luma of each
//   bin's shadow pixels, the bin's log gains, and each tile's weight (by
//   its number of samples)
function measureRankGains(src, bands, L, valid, hard, edge, gap, ring, litT, W, H, pixelSize) {
  var tileSize = Math.max(8, Math.round(CLASS_TILE / pixelSize));
  var tw = Math.ceil(W / tileSize), th = Math.ceil(H / tileSize), nt = tw * th, N = W * H, B = RANK_BINS;
  var shGroup = new Int32Array(N).fill(-1), litGroup = new Int32Array(N).fill(-1), i;
  for (i = 0; i < N; i++) {
    if (!valid[i]) continue;
    if (hard[i] && edge[i] > 0.999) shGroup[i] = getTileIndex(i, W, tileSize, tw);
    else if (!hard[i] && gap[i] === 0 && ring[i] > 0 && L[i] > litT) litGroup[i] = getTileIndex(i, W, tileSize, tw);
  }
  var byLuma = function(a, b) { return L[a] - L[b]; };
  var sh = groupIndexes(shGroup, nt), lit = groupIndexes(litGroup, nt);
  var out = {centers: new Float32Array(nt * B), logs: new Float32Array(nt * B * 3),
    weights: new Float32Array(nt), tileSize: tileSize, tw: tw, th: th};
  var t, b, k, ns, nl, s, l, m, r, tx, ty;
  var count = function(g, x0, y0, r) {
    for (var y = Math.max(0, y0 - r), n = 0, x; y <= Math.min(th - 1, y0 + r); y++) {
      for (x = Math.max(0, x0 - r); x <= Math.min(tw - 1, x0 + r); x++) n += g.start[y * tw + x + 1] - g.start[y * tw + x];
    }
    return n;
  };
  var gather = function(g, x0, y0, r) {
    var ids = [], y, x, j, u;
    for (y = Math.max(0, y0 - r); y <= Math.min(th - 1, y0 + r); y++) {
      for (x = Math.max(0, x0 - r); x <= Math.min(tw - 1, x0 + r); x++) {
        u = y * tw + x;
        for (j = g.start[u]; j < g.start[u + 1]; j++) ids.push(g.values[j]);
      }
    }
    return ids.sort(byLuma);
  };
  for (t = 0; t < nt; t++) {
    if (sh.start[t + 1] == sh.start[t]) continue;
    tx = t % tw;
    ty = Math.floor(t / tw);
    // large shadows are matched with the sunlit ground of the tiles around them
    for (r = 0; r < RANK_MAX_RADIUS && Math.min(count(sh, tx, ty, r), count(lit, tx, ty, r)) < RANK_PRIOR; r++);
    ns = count(sh, tx, ty, r);
    nl = count(lit, tx, ty, r);
    m = Math.min(ns, nl);
    if (globalThis.DSRGT && getTileIndex(globalThis.DSRGT[1] * W + globalThis.DSRGT[0], W, tileSize, tw) == t) console.log('rank tile', t, 'tileSize', tileSize, 'r', r, 'ns', ns, 'nl', nl);
    if (m < B * MIN_RANK_SAMPLES) continue;
    s = gather(sh, tx, ty, r);
    l = gather(lit, tx, ty, r);
    out.weights[t] = m / (m + RANK_PRIOR);
    if (globalThis.DSRGT && getTileIndex(globalThis.DSRGT[1] * W + globalThis.DSRGT[0], W, tileSize, tw) == t) {
      console.log('rank tile', t, 'ns', ns, 'nl', nl, 'w', out.weights[t].toFixed(2));
      for (b = 0; b < B; b++) {
        console.log(' bin', b, 'shadow', [0, 1, 2].map(function(k) { return getSliceMean(src, bands, s, Math.floor(b * ns / B), Math.floor((b + 1) * ns / B), k).toFixed(0); }).join('/'),
          'lit', [0, 1, 2].map(function(k) { return getSliceMean(src, bands, l, Math.floor(b * nl / B), Math.floor((b + 1) * nl / B), k).toFixed(0); }).join('/'));
      }
    }
    for (b = 0; b < B; b++) {
      out.centers[t * B + b] = L[s[Math.floor((b + 0.5) * ns / B)]];
      for (k = 0; k < 3; k++) {
        out.logs[(t * B + b) * 3 + k] = Math.log(Math.max(1,
          getSliceMean(src, bands, l, Math.floor(b * nl / B), Math.floor((b + 1) * nl / B), k) /
          Math.max(1, getSliceMean(src, bands, s, Math.floor(b * ns / B), Math.floor((b + 1) * ns / B), k))));
      }
    }
  }
  return out;
}

// Indexes of the elements of @group in each of its @n groups (-1 for none)
// Returns {values, start}, as from groupValues()
function groupIndexes(group, n) {
  var start = new Uint32Array(n + 1), next, values, i, c;
  for (i = 0; i < group.length; i++) if (group[i] >= 0) start[group[i] + 1]++;
  for (c = 0; c < n; c++) start[c + 1] += start[c];
  next = start.slice();
  values = new Int32Array(start[n]);
  for (i = 0; i < group.length; i++) if (group[i] >= 0) values[next[group[i]]++] = i;
  return {values: values, start: start};
}

function getSliceMean(src, bands, ids, a, b, k) {
  for (var j = a, sum = 0; j < b; j++) sum += src[ids[j] * bands + k];
  return b > a ? sum / (b - a) : 0;
}

// Blends the rank gains (see measureRankGains()) of the tiles around each
// shadowed pixel into its gains (@logG, sums of log gains over @mw pixels),
// by the tiles' weights and the pixel's share of bare ground nearby (@bare):
// shadowed forest is darker than the sunlit ground around it is likely to
// be, e.g. clearings
function applyRankGains(logG, mw, rg, L, cls, bare, W, H) {
  var T = rg.tileSize, tw = rg.tw, th = rg.th, B = RANK_BINS, q = [0, 0, 0];
  var i, k, x, y, fx, fy, x0, y0, ax, ay, corners, c, t, wt, w, j, u, base, sum;
  for (i = 0; i < L.length; i++) {
    if (cls[i] < 0) continue;
    x = i % W;
    y = Math.floor(i / W);
    fx = Math.max(0, Math.min(tw - 1, x / T - 0.5));
    fy = Math.max(0, Math.min(th - 1, y / T - 0.5));
    x0 = Math.floor(fx);
    y0 = Math.floor(fy);
    ax = fx - x0;
    ay = fy - y0;
    corners = [[x0, y0, (1 - ax) * (1 - ay)], [Math.min(tw - 1, x0 + 1), y0, ax * (1 - ay)],
      [x0, Math.min(th - 1, y0 + 1), (1 - ax) * ay], [Math.min(tw - 1, x0 + 1), Math.min(th - 1, y0 + 1), ax * ay]];
    sum = [0, 0, 0];
    for (c = 0; c < 4; c++) {
      t = corners[c][1] * tw + corners[c][0];
      wt = corners[c][2];
      w = rg.weights[t] * bare[i];
      base = t * B;
      if (w > 0) {
        for (j = 0; j < B - 1 && L[i] > rg.centers[base + j + 1]; j++);
        u = j == B - 1 || L[i] <= rg.centers[base + j] ? 0 :
          (L[i] - rg.centers[base + j]) / Math.max(1e-6, rg.centers[base + j + 1] - rg.centers[base + j]);
        for (k = 0; k < 3; k++) {
          q[k] = rg.logs[(base + j) * 3 + k] * (1 - u) + (u > 0 ? rg.logs[(base + j + 1) * 3 + k] * u : 0);
        }
      }
      for (k = 0; k < 3; k++) sum[k] += wt * (w * q[k] + (1 - w) * logG[k][i] / mw[i]);
    }
    for (k = 0; k < 3; k++) logG[k][i] = sum[k] * mw[i];
  }
}

// Gains of the ground that isn't vegetation in each tile, from the @pairs
// whose sunlit pixel isn't vegetation, blended with the image's @gains
// Returns {tileLog, tileSize, tw, th}, as from measureClassGains() for one class
function measureBareGains(src, bands, pairs, W, H, gains, pixelSize) {
  var tileSize = Math.max(8, Math.round(CLASS_TILE / pixelSize));
  var tw = Math.ceil(W / tileSize), th = Math.ceil(H / tileSize), nt = tw * th;
  var np = pairs.lit.length, keys = new Int32Array(np), tileLog = new Float32Array(nt * 3);
  var p, k, t, m, g, w, lv, sv;
  for (p = 0; p < np; p++) {
    keys[p] = isVegetation(src, bands, pairs.lit[p]) ? -1 : getTileIndex(pairs.shadow[p], W, tileSize, tw);
  }
  for (k = 0; k < 3; k++) {
    lv = groupValues(keys, nt, function(p) { return src[pairs.lit[p] * bands + k]; });
    sv = groupValues(keys, nt, function(p) { return src[pairs.shadow[p] * bands + k]; });
    for (t = 0; t < nt; t++) {
      m = lv.start[t + 1] - lv.start[t];
      g = m > 0 ? Math.max(1, groupMedian(lv, t) / Math.max(1, groupMedian(sv, t))) : gains[k];
      w = m / (m + BARE_TILE_PRIOR);
      tileLog[t * 3 + k] = w * Math.log(g) + (1 - w) * Math.log(gains[k]);
    }
  }
  return {tileLog: tileLog, tileSize: tileSize, tw: tw, th: th};
}

// Brightened pixels are kept below the 90th percentile luma of sunlit pixels
// near the shadows
function getBrightnessCap(L, valid, edge, mask) {
  var hist = new Float64Array(256), n = 0, t = 0, i, v;
  for (i = 0; i < L.length; i++) {
    if (valid[i] && mask.near[i] && edge[i] === 0 && L[i] > mask.threshold) {
      hist[Math.min(255, Math.round(L[i]))]++;
      n++;
    }
  }
  for (v = 0; v < 256; v++) {
    t += hist[v];
    if (t >= n * 0.9) return v;
  }
  return 255;
}

function compressContrast(relit, alpha, W, H, r) {
  var N = W * H, Y = new Float32Array(N), wY = new Float32Array(N), i, k, a, m, y, y2, s;
  for (i = 0; i < N; i++) {
    Y[i] = 0.299 * relit[0][i] + 0.587 * relit[1][i] + 0.114 * relit[2][i];
    wY[i] = alpha[i] * Y[i];
  }
  var mY = boxMean(wY, W, H, r), mA = boxMean(alpha, W, H, r);
  for (i = 0; i < N; i++) {
    a = alpha[i];
    if (a < 0.01 || mA[i] < 0.01) continue;
    m = mY[i] / mA[i];
    y = Y[i];
    y2 = y > m ? m + CONTRAST_BRIGHT * (y - m) : m + CONTRAST_DARK * (y - m);
    s = (y + a * (y2 - y)) / Math.max(1, y);
    for (k = 0; k < 3; k++) relit[k][i] *= s;
  }
}

// Smooths the color (not the lightness) of brightened pixels, which is noisy
// in shadows, and blurs the shadows' edges, where sharpening in the source
// leaves a dark rim
function writeRelitSamples(src, bands, relit, alpha, edge, W, H, pixelSize) {
  var N = W * H, r = toPixels(CHROMA_RADIUS, pixelSize), out = src.slice();
  var Y = new Float32Array(N), wsum = boxMean(alpha, W, H, r), t = new Float32Array(N);
  var chroma = [], i, k, a, c, v, blurred;
  for (i = 0; i < N; i++) Y[i] = 0.299 * relit[0][i] + 0.587 * relit[1][i] + 0.114 * relit[2][i];
  for (k = 0; k < 3; k++) {
    for (i = 0; i < N; i++) t[i] = alpha[i] * relit[k][i] / (Y[i] + 1);
    chroma.push(boxMean(t, W, H, r));
  }
  for (k = 0; k < 3; k++) {
    for (i = 0; i < N; i++) {
      a = alpha[i];
      c = wsum[i] > 0.01 ? Math.min(255, (Y[i] + 1) * chroma[k][i] / wsum[i]) : relit[k][i];
      t[i] = relit[k][i] * (1 - a) + c * a;
    }
    blurred = boxMean(t, W, H, toPixels(EDGE_BLUR_RADIUS, pixelSize));
    for (i = 0; i < N; i++) {
      v = edge[i] > 0 && edge[i] < 1 ? blurred[i] : t[i];
      if (alpha[i] > 0 || v != src[i * bands + k]) out[i * bands + k] = Math.round(v);
    }
  }
  return out;
}

function toFloat(arr) {
  return arr instanceof Float32Array ? arr : Float32Array.from(arr);
}

// Mean of a (2r+1)-pixel square around each pixel, clipped at the edges

// Pixels for measuring c: 0 for those at least @margin pixels inside shadows,
// 1 for those at least @margin pixels outside them and lit within FLAT_RANGE
// of flat ground, -1 for others
function getRatioGroups(valid, I, flat, W, H, margin) {
  var N = W * H, inShadow = new Float32Array(N), group = new Int8Array(N).fill(-1), near, i, a;
  for (i = 0; i < N; i++) inShadow[i] = I[i] === 0 ? 1 : 0;
  near = boxMean(inShadow, W, H, margin);
  for (i = 0; i < N; i++) {
    a = I[i];
    if (!valid[i] || a !== a) continue;
    if (a === 0 && near[i] > 0.999) group[i] = 0;
    else if (a > 0 && near[i] < 0.001 && Math.abs(a - flat[i]) < FLAT_RANGE) group[i] = 1;
  }
  return group;
}

// The class whose sunlit color @m, lit by @I (with the class's c), is
// nearest the log color @f
function nearestLitClass(m, ratios, f, I, flat) {
  var best = 0, bestD = Infinity, k, b, d, e, mean, p = [0, 0, 0];
  for (k = 0; k < m.length; k++) {
    if (!m[k]) continue;
    mean = 0;
    for (b = 0; b < 3; b++) {
      p[b] = f[b] - m[k][b] - Math.log((I + ratios[k][b]) / (flat + ratios[k][b]));
      mean += p[b] / 3;
    }
    d = CLASS_LUMA_WEIGHT * CLASS_LUMA_WEIGHT * mean * mean;
    for (b = 0; b < 3; b++) {
      e = p[b] - mean;
      d += e * e;
    }
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

// Classes of ground, by color after correcting the image with @c (and by
// near-infrared, if given)
// Returns {labels, K}: labels has the class of each pixel
function classifyGround(lin, valid, I, flat, c, nir, N) {
  var f = new Float64Array(nir ? 4 : 3), samples = [], labels = new Uint8Array(N);
  var step = Math.max(1, Math.floor(N / 20000)), i, centers;
  function features(i) {
    var a = I[i];
    var v = [0, 1, 2].map(function(b) {
      return lin[b][i] * (a === a ? (flat[i] + c[b]) / (a + c[b]) : 1) + 1e-3;
    });
    f[0] = Math.log(v[0] / v[1]);
    f[1] = Math.log(v[2] / v[1]);
    f[2] = CLASS_LUMA_WEIGHT * Math.log(0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]);
    if (nir) f[3] = nir[i] === nir[i] ? CLASS_NIR_WEIGHT * Math.log((nir[i] + 1) / (lin[0][i] * 255 + 1)) : 0;
    return f;
  }
  for (i = 0; i < N; i += step) if (valid[i]) samples.push(Array.from(features(i)));
  centers = kMeans(samples, GROUND_CLASSES);
  if (centers.length < 2) return {labels: labels, K: 1};
  for (i = 0; i < N; i++) if (valid[i]) labels[i] = nearestCenter(centers, features(i));
  return {labels: labels, K: centers.length};
}

// Gain of each band of each pixel, from its class's c in shadow and on sunlit
// ground (blended over CLASS_RADIUS, log scale). A pixel's share s of shadow
// is from its I and its I if it were sunlit, I_lit (I = (1 - s) I_lit): its I
// without cast shadows, or LIT_FLOOR times flat ground's where the DEM faces
// away from the sun (and a DEM smoothes cliffs into slopes lit at a lower
// angle). Its value relative to flat ground's is (1 - s) R^k + s c / (flat +
// c), with R = (I_lit + c_lit) / (flat + c_lit) and k the share of the DEM's
// lighting of sunlit ground that the image shows around it (see
// getLightingResponse()) (with c_lit = c and k = 1, the gain is (flat + c) /
// (I + c)). Pixels known to be sunlit can be given I and I without cast
// shadows of at least LIT_FLOOR times flat ground's.
// @ratios, @litRatios c of each class, in shadow and on sunlit ground
// @flat, @direct, @pixelI I of flat ground, I without cast shadows, and I,
//   of each pixel
// Returns an array of Float32Arrays, one for each band (NaN to leave a
// pixel unchanged)
function getPixelGains(lin, labels, ratios, litRatios, flat, direct, pixelI, valid, W, H, pixelSize) {
  var N = W * H, r = toPixels(CLASS_RADIUS, pixelSize), litI = new Float32Array(N), share = new Float32Array(N);
  var logC = [], logL = [], cy = new Float32Array(N), i, b, d, p, k;
  for (b = 0; b < 3; b++) {
    logC[b] = new Float32Array(N);
    logL[b] = new Float32Array(N);
    for (i = 0; i < N; i++) {
      logC[b][i] = Math.log(ratios[labels[i]][b]);
      logL[b][i] = Math.log(litRatios[labels[i]][b]);
    }
    logC[b] = boxMean(logC[b], W, H, r);
    logL[b] = litRatios == ratios ? logC[b] : boxMean(logL[b], W, H, r);
  }
  for (i = 0; i < N; i++) {
    p = pixelI[i];
    d = Math.max(p, direct[i] > 0 ? direct[i] : LIT_FLOOR * flat[i]);
    litI[i] = d;
    share[i] = d > 0 ? 1 - p / d : 1;
    for (b = 0, cy[i] = 0; b < 3; b++) cy[i] += LUMA_WEIGHTS[b] * Math.exp(logL[b][i]);
  }
  k = globalThis.DSNORESPONSE ? null : getLightingResponse(lin, valid, litI, share, flat, cy, W, H, pixelSize);
  if (globalThis.DSDEBUG) globalThis.DSDEBUG.k = k;
  return [0, 1, 2].map(function(b) {
    var out = new Float32Array(N), c, cl, s, g, R;
    for (i = 0; i < N; i++) {
      p = pixelI[i];
      if (!valid[i] || p !== p) {
        out[i] = NaN;
        continue;
      }
      c = Math.exp(logC[b][i]);
      cl = Math.exp(logL[b][i]);
      s = share[i];
      R = (litI[i] + cl) / (flat[i] + cl);
      if (k) R = Math.pow(R, k[i]);
      g = 1 / ((1 - s) * R + s * c / (flat[i] + c));
      out[i] = g < MAX_GAIN ? g : MAX_GAIN;
    }
    return out;
  });
}

// Share k of the DEM's lighting of sunlit ground that the image shows, around
// each pixel (within RESPONSE_RADIUS): the slope of the log luma of sunlit
// pixels against the log of their predicted lighting, R = (I + c) / (flat +
// c), both averaged over RESPONSE_SMOOTHING (a DEM's finest slopes, e.g. of
// the ground under forest, aren't the image's, and would pull the slope
// toward 0), blended with 1 (the DEM's lighting, where it varies too little to
// measure) by the variance (robust) of the log luma of sunlit ground with
// little variation in R; between 0 and 1. Where the DEM's slopes don't match the
// image's (e.g. at the rims of cliffs, which it smoothes and may misplace),
// sunlit ground isn't lit the way the DEM has it.
// @I, @share I of each pixel if it were sunlit, and its share of shadow
// @cy c of sunlit ground (luma) of each pixel
function getLightingResponse(lin, valid, I, share, flat, cy, W, H, pixelSize) {
  var N = W * H, r = toPixels(RESPONSE_RADIUS, pixelSize), rs = toPixels(RESPONSE_SMOOTHING, pixelSize);
  var w = new Float32Array(N), x = new Float32Array(N), y = new Float32Array(N), xx, xy, sw, sx, sy;
  var n = (2 * r + 1) * (2 * r + 1) / ((2 * rs + 1) * (2 * rs + 1));
  var flatY = [], sigma2, lambda, i, m, mw, mx, my, cov, vx, k;
  for (i = 0; i < N; i++) {
    if (!valid[i] || !(share[i] < 0.01) || !(I[i] > 0)) continue;
    w[i] = 1;
    x[i] = Math.log((I[i] + cy[i]) / (flat[i] + cy[i]));
    y[i] = Math.log(0.2126 * lin[0][i] + 0.7152 * lin[1][i] + 0.0722 * lin[2][i] + 1e-4);
  }
  sw = boxMean(w, W, H, rs);
  sx = boxMean(x, W, H, rs);
  sy = boxMean(y, W, H, rs);
  for (i = 0; i < N; i++) {
    w[i] = w[i] && sw[i] > 0.5 ? 1 : 0;
    x[i] = w[i] ? sx[i] / sw[i] : 0;
    y[i] = w[i] ? sy[i] / sw[i] : 0;
    if (w[i] && Math.abs(x[i]) < 0.05 && i % 7 === 0) flatY.push(y[i]);
  }
  sw = sx = sy = null;
  if (flatY.length < 100) return null;
  m = getMedian(flatY);
  sigma2 = Math.pow(1.4826 * getMedian(flatY.map(function(v) { return Math.abs(v - m); })), 2);
  xx = new Float32Array(N);
  xy = new Float32Array(N);
  for (i = 0; i < N; i++) {
    xx[i] = x[i] * x[i];
    xy[i] = x[i] * y[i];
  }
  mw = boxMean(w, W, H, r);
  mx = boxMean(x, W, H, r);
  my = boxMean(y, W, H, r);
  xx = boxMean(xx, W, H, r);
  xy = boxMean(xy, W, H, r);
  k = new Float32Array(N);
  for (i = 0; i < N; i++) {
    k[i] = 1;
    if (!(mw[i] > 0)) continue;
    // the means of weighted pixels in the window
    vx = xx[i] / mw[i] - Math.pow(mx[i] / mw[i], 2);
    cov = xy[i] / mw[i] - mx[i] / mw[i] * my[i] / mw[i];
    lambda = sigma2 / (mw[i] * n);
    k[i] = Math.max(0, Math.min(1, (cov + lambda) / (vx + lambda)));
  }
  return k;
}

// @haze optional P of each band (see applyGain())
function writeCorrectedSamples(image, lin, gains, valid, haze) {
  var src = image.samples, bands = image.bands, N = image.width * image.height, P = haze || [0, 0, 0];
  var out = new Uint8Array(src.length), encode = getEncodeTable();
  var scale = encode.length - 1, i, b, g, v, same;
  out.set(src);
  for (i = 0; i < N; i++) {
    if (!valid[i]) continue;
    same = true;
    for (b = 0; b < 3; b++) {
      g = gains[b][i];
      if (g === g && Math.abs(g - 1) > 1e-4) same = false;
    }
    if (same) continue;
    for (b = 0; b < 3; b++) {
      g = gains[b][i];
      v = g === g ? applyGain(lin[b][i], g, P[b]) : lin[b][i];
      out[i * bands + b] = v >= 1 ? 255 : encode[Math.round(Math.sqrt(v) * scale)];
    }
  }
  return out;
}

// A linear value @v brightened by gain @g: haze (@P, see fitHazeOffsets())
// doesn't depend on lighting, so only the rest is brightened
function applyGain(v, g, P) {
  return g === g ? (v > P ? (v - P) * g + P : v) : v;
}

var decodeTable = null, encodeTable = null;

// linear values of 8-bit sRGB values
function getDecodeTable() {
  if (!decodeTable) {
    decodeTable = new Float32Array(256);
    for (var i = 0; i < 256; i++) decodeTable[i] = sRGBToLinear(i / 255);
  }
  return decodeTable;
}

// 8-bit sRGB values of linear values, indexed by their square root
function getEncodeTable() {
  if (!encodeTable) {
    encodeTable = new Uint8Array(8192);
    for (var i = 0; i < encodeTable.length; i++) {
      encodeTable[i] = Math.round(linearToSRGB(Math.pow(i / (encodeTable.length - 1), 2)) * 255);
    }
  }
  return encodeTable;
}

function sRGBToLinear(v) {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSRGB(v) {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function getLinearBands(samples, bands, N) {
  var table = getDecodeTable();
  return [0, 1, 2].map(function(b) {
    var out = new Float32Array(N);
    for (var i = 0; i < N; i++) out[i] = table[samples[i * bands + b]];
    return out;
  });
}

function getLinearLuma(lin, N) {
  var Y = new Float32Array(N);
  for (var i = 0; i < N; i++) Y[i] = 0.2126 * lin[0][i] + 0.7152 * lin[1][i] + 0.0722 * lin[2][i];
  return Y;
}

function getValidPixels(image) {
  var n = image.width * image.height, valid = new Uint8Array(n).fill(1), i;
  if (image.bands == 4) {
    for (i = 0; i < n; i++) valid[i] = image.samples[i * 4 + 3] > 0 ? 1 : 0;
  }
  return valid;
}

function getTerrainRegion(terrain, W, H) {
  return {x0: terrain.x0, y0: terrain.y0,
    x1: terrain.x0 + Math.ceil(W / terrain.factor),
    y1: terrain.y0 + Math.ceil(H / terrain.factor)};
}

// The terrain cell of each pixel
function getPixelCells(terrain, W, H) {
  var out = new Uint32Array(W * H), tw = terrain.width, f = terrain.factor, x, y, row;
  for (y = 0; y < H; y++) {
    row = (terrain.y0 + Math.floor(y / f)) * tw + terrain.x0;
    for (x = 0; x < W; x++) out[y * W + x] = row + Math.floor(x / f);
  }
  return out;
}

// Mean of each terrain cell's pixel values; NaN outside the image
// @valid optional: pixels to include
function getCellMeans(values, W, H, terrain, valid) {
  var tw = terrain.width, f = terrain.factor;
  var sum = new Float64Array(terrain.width * terrain.height), count = new Uint32Array(sum.length);
  var out = new Float32Array(sum.length).fill(NaN);
  var x, y, i, j;
  for (y = 0; y < H; y++) {
    for (x = 0; x < W; x++) {
      i = y * W + x;
      if (valid && !valid[i]) continue;
      j = (terrain.y0 + Math.floor(y / f)) * tw + terrain.x0 + Math.floor(x / f);
      sum[j] += values[i];
      count[j]++;
    }
  }
  for (j = 0; j < out.length; j++) if (count[j] > 0) out[j] = sum[j] / count[j];
  return out;
}

function toPixels(meters, pixelSize) {
  return Math.max(1, Math.round(meters / pixelSize));
}

// I of each pixel, with the edges of shadows blurred over @r pixels
// @shadow 1 for shadowed pixels
// @direct I of each pixel without cast shadows
function softenShadows(shadow, direct, W, H, r) {
  var soft = boxMean(shadow, W, H, r);
  for (var i = 0; i < soft.length; i++) soft[i] = (1 - soft[i]) * direct[i];
  return soft;
}

// Each pixel's share of shadow (0 or 1), from a shadow mask made from the
// image if it can be (see getShadowMask()), or else from the DEM
// @predicted 1 for pixels in the DEM's shadows
// Returns {shadow, masked, count, ratio, mask, sun}: masked is true if the
//   shadows are from the mask (see getShadowMask()), cast by @sun; ratio is
//   the mask's size over the DEM's shadows'
function getPixelShadows(image, nir, valid, predicted, cells, terrain, region, regions,
    W, H, pixelSize, demPixelSize) {
  var N = W * H, L = getLuma(image.samples, image.bands, N);
  var band = Math.max(MIN_BAND, demPixelSize * BAND_DEM_PIXELS);
  var shadow = new Float32Array(N), stretch = 1, mask, n, i, maskSun, dark, lowered;
  for (i = 0, n = 0; i < N; i++) if (predicted[i] && valid[i]) n++;
  if (regions.suns.length == 1 && n > 0) {
    dark = thresholdPixels(L, valid, getShadowMidpoint(L, valid, predicted));
    maskSun = lowerSunAltitude(terrain.Z, getCellMeans(dark, W, H, terrain, valid),
      terrain.width, terrain.height, terrain.cellWidth, terrain.cellHeight, region, regions.suns[0]);
    lowered = getPixelValues(castTerrainShadow(terrain.Z, terrain.width, terrain.height,
      terrain.cellWidth, terrain.cellHeight, maskSun, region), cells, Uint8Array);
    stretch = Math.tan(regions.suns[0].altitude) / Math.tan(maskSun.altitude);
    if (globalThis.DSDEMLOG) console.log('mask sun', (maskSun.altitude * 180 / Math.PI).toFixed(1), 'fitted', (regions.suns[0].altitude * 180 / Math.PI).toFixed(1), 'band m', band, 'dem px', demPixelSize, 'px', pixelSize);
  }
  if (globalThis.DSDEBUG) Object.assign(globalThis.DSDEBUG, {actual: predicted, band: band, L: L});
  mask = n > 0 ? getShadowMask(L, nir, valid, lowered || predicted, W, H, pixelSize, band) : null;
  if (mask && mask.count > 0 && mask.count <= n * MAX_MASK_RATIO * stretch) {
    if (!globalThis.DSNODEM) addDemShadows(mask, predicted, valid, W, H);
    for (i = 0; i < N; i++) shadow[i] = mask.hard[i];
    return {shadow: shadow, masked: true, count: mask.count, ratio: mask.count / n, mask: mask,
      sun: maskSun || regions.suns[0]};
  }
  for (i = 0; i < N; i++) shadow[i] = predicted[i];
  return {shadow: shadow, masked: false, count: n, ratio: mask ? mask.count / Math.max(1, n) : 0};
}

// Adds the DEM's shadows to the mask, except near their edges, which may be a
// few pixels off: shadowed ground that's bright when lit (e.g. snow) can be
// brighter than the mask's threshold. The edges are taken to be as wide as
// the depth inside the DEM's shadows at which the mask's share of them stops
// rising (comes within DEM_EDGE_AGREEMENT of the share deeper inside), and
// the shadows are added only if most of them deeper inside are in the mask.
// Sets mask.dem to 1 for the added pixels, and mask.uncertain to 1 for those
// near the edges that aren't in the mask (they're often shadowed)
function addDemShadows(mask, predicted, valid, W, H) {
  var N = W * H, outside = new Uint8Array(N), maxD = 64, i, d, depth, n, m;
  for (i = 0; i < N; i++) outside[i] = predicted[i] ? 0 : 1;
  depth = chamferDistance(outside, W, H);
  n = new Float64Array(maxD + 2);
  m = new Float64Array(maxD + 2);
  for (i = 0; i < N; i++) {
    if (!predicted[i] || !valid[i]) continue;
    d = Math.min(maxD, Math.floor(depth[i] / 3));
    n[d]++;
    if (mask.hard[i]) m[d]++;
  }
  for (d = maxD - 1; d >= 0; d--) {
    n[d] += n[d + 1];
    m[d] += m[d + 1];
  }
  for (d = 1; d < maxD && n[d + 1] >= MIN_DEM_EDGE_PIXELS; d++) {
    if ((m[d] - m[d + 1]) / Math.max(1, n[d] - n[d + 1]) >= DEM_EDGE_AGREEMENT * m[d] / n[d]) break;
  }
  if (!(n[d + 1] >= MIN_DEM_EDGE_PIXELS) || m[d] < n[d] * MIN_DEM_AGREEMENT) return;
  mask.dem = new Uint8Array(N);
  mask.uncertain = new Uint8Array(N);
  for (i = 0; i < N; i++) {
    if (!predicted[i] || !valid[i] || mask.hard[i]) continue;
    if (depth[i] >= d * 3) {
      mask.dem[i] = 1;
      mask.hard[i] = 1;
    } else {
      mask.uncertain[i] = 1;
    }
  }
  if (globalThis.DSDEMLOG) console.log('dem shadows: edge', d, 'px, agreement', (m[d] / n[d]).toFixed(2));
}

function getPixelValues(cellValues, cells, ArrayType) {
  var out = new ArrayType(cells.length);
  for (var i = 0; i < cells.length; i++) out[i] = cellValues[cells[i]];
  return out;
}

// Luma halfway between the DEM's shadows and the rest of the image (medians)
function getShadowMidpoint(L, valid, predicted) {
  var inside = [], outside = [], i;
  for (i = 0; i < L.length; i += 3) {
    if (!valid[i]) continue;
    if (predicted[i]) inside.push(L[i]); else outside.push(L[i]);
  }
  if (inside.length === 0 || outside.length === 0) return 0;
  return (getMedian(inside) + getMedian(outside)) / 2;
}

function thresholdPixels(L, valid, T) {
  var out = new Float32Array(L.length);
  for (var i = 0; i < L.length; i++) out[i] = valid[i] && L[i] < T ? 1 : 0;
  return out;
}

// The lowest altitude, from @sun's down to MIN_ALTITUDE, at which each
// degree lower adds shadows (in @sun's direction) that are mostly dark
// @darkness one value per cell, from 0 (lit) to 1 (dark); NaN to ignore
// Returns {azimuth, altitude}
export function lowerSunAltitude(Z, darkness, w, h, cellW, cellH, region, sun) {
  var level = getFitLevel(Z, darkness, w, h, cellW, cellH, region, FIT_CELLS, MAX_FIT_CELL);
  var deg = Math.PI / 180, D = level.B;
  var best = sun.altitude / deg, prev = null, alt, P, i, n, sum;
  for (alt = best; alt >= MIN_ALTITUDE; alt -= 1) {
    P = castTerrainShadow(level.Z, level.w, level.h, level.cellW, level.cellH,
      {azimuth: sun.azimuth, altitude: alt * deg}, level.region);
    if (prev) {
      for (i = 0, n = 0, sum = 0; i < P.length; i++) {
        if (P[i] && !prev[i] && D[i] === D[i]) {
          n++;
          sum += D[i];
        }
      }
      if (globalThis.DSDEMLOG) console.log('lower', alt, 'added', n, 'dark', (sum / n).toFixed(2));
      if (n > 0 && sum / n < 0.5 && !globalThis.DSLOWERALL) break;
      best = alt;
    }
    prev = P;
  }
  return {azimuth: sun.azimuth, altitude: best * deg};
}

export function getLuma(samples, bands, n) {
  var L = new Float32Array(n), i, j;
  for (i = 0, j = 0; i < n; i++, j += bands) {
    L[i] = 0.299 * samples[j] + 0.587 * samples[j + 1] + 0.114 * samples[j + 2];
  }
  return L;
}

// @predicted 1 for pixels in the DEM's shadows
// @band distance (meters) around the DEM's shadows to look for shadows
// Returns {hard, near, threshold, count}: hard is 1 for shadow pixels; near
//   is 1 for pixels near the DEM's shadows
export function getShadowMask(L, nir, valid, predicted, W, H, pixelSize, band) {
  var N = W * H, i;
  var px = getDarkPixels(L, nir, valid, predicted, W, H, pixelSize, band);
  var inc = px.near, T = px.threshold, dark = px.dark, darkBoth = px.darkBoth;
  var r = Math.round(MAJORITY_RADIUS / pixelSize);
  var maj = r > 0 ? boxMean(dark, W, H, r) : dark;
  var majBoth = darkBoth == dark ? maj : r > 0 ? boxMean(darkBoth, W, H, r) : darkBoth;
  var hard = new Uint8Array(N);
  var regionR = toPixels(REGION_RADIUS, pixelSize);
  var share, region, dist, grow, count = 0;
  region = new Uint8Array(N);
  if (globalThis.DSDEBUG) Object.assign(globalThis.DSDEBUG, {mW: W, mT: T, mDark: dark.slice(), mBoth: darkBoth.slice(), mPred: predicted});
  for (i = 0; i < N; i++) majBoth[i] = majBoth[i] > 0.5 ? 1 : 0;
  share = boxMean(majBoth, W, H, regionR);
  for (i = 0; i < N; i++) region[i] = share[i] > REGION_SHARE ? 1 : 0;
  share = majBoth = darkBoth = null;
  dist = chamferDistance(region, W, H);
  // the window test pulls a straight edge in by about this many pixels
  grow = Math.ceil(regionR * (2 * REGION_SHARE - 1)) + 1;
  for (i = 0; i < N; i++) hard[i] = maj[i] > 0.5 && dist[i] <= grow * 3 ? 1 : 0;
  dist = maj = null;
  removeUnmatchedAreas(hard, predicted, W, H, SMALL_AREA / (pixelSize * pixelSize));
  for (i = 0; i < N; i++) count += hard[i];
  if (globalThis.DSDEBUG) globalThis.DSDEBUG.mHard = hard.slice();
  return {hard: hard, near: inc, threshold: T, count: count};
}

// Pixels near the DEM's shadows that are as dark as them
// Returns {near, threshold, dark, darkBoth}: near is 1 for valid pixels near
//   the DEM's shadows; dark is 1 for those darker than the luma threshold;
//   darkBoth for those also dark in near-infrared (or dark, without it)
function getDarkPixels(L, nir, valid, predicted, W, H, pixelSize, band) {
  var N = W * H, i;
  var near = boxMean(Float32Array.from(predicted), W, H, toPixels(band, pixelSize));
  var inc = new Uint8Array(N);
  for (i = 0; i < N; i++) inc[i] = valid[i] && near[i] > 0.01 ? 1 : 0;
  near = null;
  var T = getAgreementThreshold(L, predicted, inc);
  var dark = new Float32Array(N);
  for (i = 0; i < N; i++) dark[i] = inc[i] && L[i] < T ? 1 : 0;
  return {near: inc, threshold: T, dark: dark,
    darkBoth: nir ? getNirDark(dark, nir, predicted) : dark};
}

// Visibly dark pixels that are also dark in near-infrared. The threshold is
// relative to the DEM's shadows, and capped relative to the whole image, in
// case those are mostly something else dark (e.g. conifer forest).
function getNirDark(dark, nir, predicted) {
  var sample = [], all = [], out = new Float32Array(dark.length), T, i;
  for (i = 0; i < dark.length; i += 7) {
    if (nir[i] !== nir[i]) continue;
    all.push(nir[i]);
    if (dark[i] && predicted[i]) sample.push(nir[i]);
  }
  if (sample.length === 0) return dark;
  T = Math.min(getMedian(sample) * NIR_FACTOR, getMedian(all) * MAX_NIR_SHARE);
  for (i = 0; i < dark.length; i++) out[i] = dark[i] && nir[i] < T ? 1 : 0;
  return out;
}

// The luma threshold that best reproduces the DEM's shadows near them
export function getAgreementThreshold(L, predicted, include) {
  var hIn = new Float64Array(256), hOut = new Float64Array(256), nIn = 0;
  var best = Infinity, t = 0, missIn, falseOut = 0, i, v;
  for (i = 0; i < L.length; i++) {
    if (!include[i]) continue;
    v = Math.min(255, Math.round(L[i]));
    if (predicted[i]) {
      hIn[v]++;
      nIn++;
    } else {
      hOut[v]++;
    }
  }
  missIn = nIn;
  for (v = 0; v < 256; v++) {
    missIn -= hIn[v];
    falseOut += hOut[v];
    if (missIn + falseOut < best) {
      best = missIn + falseOut;
      t = v;
    }
  }
  return t + 0.5;
}

// Removes connected areas that are mostly outside the DEM's shadows (small
// areas need more overlap)
export function removeUnmatchedAreas(mask, predicted, W, H, smallSize) {
  var N = W * H, seen = new Uint8Array(N), queue = new Int32Array(N);
  var i, j, x, head, tail, overlap, k;
  for (i = 0; i < N; i++) {
    if (!mask[i] || seen[i]) continue;
    head = tail = overlap = 0;
    seen[i] = 1;
    queue[tail++] = i;
    while (head < tail) {
      j = queue[head++];
      x = j % W;
      if (predicted[j]) overlap++;
      if (x > 0 && mask[j - 1] && !seen[j - 1]) { seen[j - 1] = 1; queue[tail++] = j - 1; }
      if (x < W - 1 && mask[j + 1] && !seen[j + 1]) { seen[j + 1] = 1; queue[tail++] = j + 1; }
      if (j >= W && mask[j - W] && !seen[j - W]) { seen[j - W] = 1; queue[tail++] = j - W; }
      if (j < N - W && mask[j + W] && !seen[j + W]) { seen[j + W] = 1; queue[tail++] = j + W; }
    }
    if (overlap / tail < (tail < smallSize ? MIN_SMALL_OVERLAP : MIN_OVERLAP)) {
      for (k = 0; k < tail; k++) mask[queue[k]] = 0;
    }
  }
}

// 3-4 chamfer distance to the nearest target pixel, in thirds of a pixel
export function chamferDistance(target, w, h) {
  var d = new Int32Array(w * h), INF = 1e9, x, y, i, v;
  for (i = 0; i < d.length; i++) d[i] = target[i] ? 0 : INF;
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      i = y * w + x;
      v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 3);
        if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
      }
      d[i] = v;
    }
  }
  for (y = h - 1; y >= 0; y--) {
    for (x = w - 1; x >= 0; x--) {
      i = y * w + x;
      v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 3);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
      }
      d[i] = v;
    }
  }
  return d;
}

// k-means, from centers picked farthest from the previous ones (so that
// uncommon colors get a class), starting with the median of the third
// feature (lightness)
function kMeans(samples, K) {
  if (samples.length === 0) return [];
  var dims = samples[0].length;
  var sorted = samples.slice().sort(function(a, b) { return a[2] - b[2]; });
  var centers = [sorted[sorted.length >> 1].slice()], sums, counts, iter, i, c, k;
  var dist = new Float64Array(samples.length).fill(Infinity), far, d;
  while (centers.length < K) {
    far = 0;
    for (i = 0; i < samples.length; i++) {
      d = sqDist(samples[i], centers[centers.length - 1]);
      if (d < dist[i]) dist[i] = d;
      if (dist[i] > dist[far]) far = i;
    }
    if (dist[far] === 0) break;
    centers.push(samples[far].slice());
  }
  K = centers.length;
  for (iter = 0; iter < 15; iter++) {
    sums = centers.map(function() { return new Float64Array(dims); });
    counts = new Uint32Array(K);
    for (i = 0; i < samples.length; i++) {
      c = nearestCenter(centers, samples[i]);
      counts[c]++;
      for (k = 0; k < dims; k++) sums[c][k] += samples[i][k];
    }
    for (c = 0; c < K; c++) {
      if (counts[c] === 0) continue;
      for (k = 0; k < dims; k++) centers[c][k] = sums[c][k] / counts[c];
    }
  }
  return centers;
}

function sqDist(a, b) {
  for (var k = 0, d = 0, e; k < a.length; k++) {
    e = a[k] - b[k];
    d += e * e;
  }
  return d;
}

function nearestCenter(centers, f) {
  var best = 0, bestD = Infinity, c, d;
  for (c = 0; c < centers.length; c++) {
    d = sqDist(f, centers[c]);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// Mean of a (2r+1)-pixel square around each pixel, clipped at the edges
export function boxMean(src, w, h, r) {
  var tmp = new Float32Array(w * h), out = new Float32Array(w * h), x, y, s, o;
  for (y = 0; y < h; y++) {
    o = y * w;
    s = 0;
    for (x = 0; x <= r && x < w; x++) s += src[o + x];
    for (x = 0; x < w; x++) {
      tmp[o + x] = s / (Math.min(x + r, w - 1) - Math.max(x - r, 0) + 1);
      if (x + r + 1 < w) s += src[o + x + r + 1];
      if (x - r >= 0) s -= src[o + x - r];
    }
  }
  for (x = 0; x < w; x++) {
    s = 0;
    for (y = 0; y <= r && y < h; y++) s += tmp[y * w + x];
    for (y = 0; y < h; y++) {
      out[y * w + x] = s / (Math.min(y + r, h - 1) - Math.max(y - r, 0) + 1);
      if (y + r + 1 < h) s += tmp[(y + r + 1) * w + x];
      if (y - r >= 0) s -= tmp[(y - r) * w + x];
    }
  }
  return out;
}

// boxMean() of the values that aren't NaN; NaN where @src is
function boxMeanValid(src, w, h, r) {
  var vals = new Float32Array(src.length), wts = new Float32Array(src.length), out, wsum, i;
  for (i = 0; i < src.length; i++) {
    if (src[i] === src[i]) {
      vals[i] = src[i];
      wts[i] = 1;
    }
  }
  out = boxMean(vals, w, h, r);
  wsum = boxMean(wts, w, h, r);
  for (i = 0; i < src.length; i++) out[i] = src[i] === src[i] ? out[i] / wsum[i] : NaN;
  return out;
}

function getMedian(arr) {
  var sorted = arr.slice().sort(function(a, b) { return a - b; });
  return sorted[Math.floor(sorted.length / 2)];
}
