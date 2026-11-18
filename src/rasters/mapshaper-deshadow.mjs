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

// The sun's position is fitted in tiles: the fit level's region is divided
// into about FIT_TILES tiles (at least MIN_FIT_TILE cells on a side) whatever
// its size, so that the regions of a mosaic have enough tiles to be fitted on
// their own (see MAX_BLOCKS). Tiles are scored with at least MIN_TILE_CELLS
// cells.
var FIT_TILES = 240;
var MIN_FIT_TILE = 16;
var MIN_TILE_CELLS = 50;
// lowest sun altitude fitted, in degrees
export var MIN_ALTITUDE = 10;
var MAX_ALTITUDE = 88;
// weaker fits (e.g. of composites of imagery taken at many times) give
// little or no correction, or a harmful one
export var MIN_SUN_FIT = 0.3;
// declinations searched in a range of dates, at most this far apart (degrees)
var DECLINATION_STEP = 2;
// The sun is fitted on up to this many cells, no larger than MAX_FIT_CELL
// meters (with a first search on coarser cells)
var FIT_CELLS = 120000;
var MAX_FIT_CELL = 60;
var COARSE_FIT_CELLS = 25000;
var MAX_COARSE_FIT_CELL = 120;
// Mosaics: the image is divided into up to MAX_BLOCKS x MAX_BLOCKS blocks of
// at least BLOCK_TILES tiles, and a block's sun position is used if it
// matches the block's tiles better than the image's does by REGION_Z
// standard errors (see getPairedZ()); each tile gets the sun that matches it
// and its neighbors best, if by LABEL_MARGIN better than the image's, and
// areas of fewer than MIN_REGION_TILES tiles get the sun of the tiles around
// them. Each sun is fitted again on its tiles, and the tiles labeled again,
// up to MAX_REFITS times. Positions within SAME_SUN degrees are merged, and
// an area whose sun doesn't match its tiles better than a neighboring area's
// sun by REGION_Z standard errors takes that sun (see mergeAreaLabels()).
var MAX_BLOCKS = 4;
var BLOCK_TILES = 15;
var REGION_Z = 5;
var MIN_PAIRED_TILES = 4;
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
// see getDarkPixels() and getDarkLikelihoods()
var DARK_TILE = 1000; // meters
var MAX_DARK_TILES = 400;
var DARK_BINS = 64;
var DARK_PRIOR = 100;
var DARK_ROUNDS = 20;
var MIN_DARK_SHARE = 0.01;
// The mask is used if it's at most this many times the size of the DEM's
// shadows, and of their lengthening by the lower sun the mask is made from
// (see lowerSunAltitude()); larger means it has taken in other dark areas,
// e.g. forest
export var MAX_MASK_RATIO = 1.5;
// see getAgreementThreshold()
var MAX_DARK_LIT = 0.8;
// see getDataSpacing()
var SPACING_LAGS = [1, 2, 4, 8, 16, 32, 64];
var SMOOTH_GROWTH = 1.7;
var SPACING_SAMPLES = 1e6;
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
// Without shadows large enough to measure c (e.g. in imagery with pixels of
// tens of meters), c is fitted from the slopes; if fewer than this share of
// the tiles where a band varies with I give a positive c, the ground is
// darker on slopes facing away from the sun than their lighting explains
// (e.g. it's more forested), and TYPICAL_DIFFUSE is used: about the median c
// measured from shadows in NAIP and USGS imagery of western US mountains
var MIN_SLOPE_FIT_SHARE = 0.5;
var TYPICAL_DIFFUSE = [0.1, 0.17, 0.31];
// Without shadows to measure c from (mostly in coarse imagery), the image's
// shading can be stronger than the DEM's lighting at the image's resolution
// shows: a coarse pixel on a shaded slope includes small shadows and facets
// facing away from the sun that the DEM's smoothed slopes miss (and shaded
// slopes are often more forested). Where sunlit ground's direct light is less
// than flat ground's, I / flat is raised to the power K that leaves the
// fewest edges: the one that minimizes the total variation of the corrected
// log luma between neighboring pixels (see fitShadingResponse()), from 1 to
// MAX_RESPONSE, to within RESPONSE_TOLERANCE. Only pairs of pixels of similar
// colors are compared, the RESPONSE_PAIR_SHARE of them whose colors differ
// least (in steps of PAIR_COLOR_STEP, up to MAX_PAIR_COLOR_DIFF), as changes
// in ground cover change colors and changes in lighting mostly don't.
var MAX_RESPONSE = 4;
var RESPONSE_TOLERANCE = 0.02;
var RESPONSE_PAIR_SHARE = 0.5;
var PAIR_COLOR_STEP = 0.0005;
var MAX_PAIR_COLOR_DIFF = 0.5;
// The same DEM can't place that shading within a few pixels, so its gains
// leave a shaded slope's darkest pixels too dark and brighten the lighter
// pixels beside them too much. The lighting is moved onto the image's own
// light and dark pixels with a guided filter (He et al.): in the
// (2 * GUIDE_RADIUS + 1)-pixel square around each pixel, the log of the
// light is fitted as a linear function of the log luma, where they vary
// together; GUIDE_EPSILON is the variance of the log luma that counts as
// noise.
var GUIDE_RADIUS = 6;
var GUIDE_EPSILON = 0.001;
// Classes of ground, by color; a class's own c gets half the weight with this
// many tiles, and classes are blended over CLASS_RADIUS meters
var GROUND_CLASSES = 6;
var CLASS_PRIOR = 20;
var CLASS_LUMA_WEIGHT = 0.5;
var CLASS_PRIOR_PIXELS = 1000;
var CLASS_ROUNDS = 3;
var SHADOW_CLASSES = 8;
var LUMA_WEIGHTS = [0.2126, 0.7152, 0.0722];
var ALTITUDE_TOLERANCE = 0.02;
var MIN_ALTITUDE_SPAN = 10; // degrees
var EDGE_STEP = 2; // cells
var EDGE_FACING = 0.3;
var MIN_EDGE_CELLS = 30;
// see getEdgeAltitude()
var EDGE_ALTITUDE_RANGE = [MIN_ALTITUDE, 70];
var EDGE_Z = 3;
var EDGE_ALTITUDE_STEP = 2;
// A free fit's altitude is measured from the edges of cast shadows on up to
// EDGE_FIT_CELLS cells, as near the DEM's resolution as that allows, where
// shadows have many more edges than at the fit level (whose scores tend to
// favor low suns where albedo varies with the terrain, e.g. forest on slopes
// facing away from the sun). The shadowed cells compared are EDGE_DISTANCE
// meters before the edges (and at least EDGE_STEP cells), to clear the edges'
// blur and any misregistration of the image and the DEM. Measuring takes
// about EDGE_FIT_CASTS casts of the cells.
var EDGE_FIT_CELLS = 4e6;
var EDGE_DISTANCE = 15;
var EDGE_FIT_CASTS = 40;
var LOG_EPSILON = 0.005;
// the sun's position is fitted by correlating log(I + FIT_DIFFUSE) with log
// brightness (plus LOG_EPSILON)
var FIT_DIFFUSE = 0.3;
// sunlit pixels are lit at least this share of flat ground's I (a DEM
// smoothes cliffs into slopes lit at a lower angle)
var LIT_CAP_QUANTILE = 0.98;
var LIT_FLOOR = 0.25;
// meters from the edges of masked shadows within which sunlit ground is lit at
// least as much as its luma shows (see raiseEdgeLighting()): an image and a
// DEM can be misregistered by a few pixels, which leaves the DEM's slopes
// facing away from the sun on sunlit ground next to the shadows
var EDGE_LIGHTING = 40;
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
var COLOR_TILE = 1500;
var MAX_COLOR_TILES = 1000;
var COLOR_LUMA_STEP = Math.LN2 / 2;
var COLOR_LUMA_BINS = 20;
var COLOR_RANGE = 1.5;
var COLOR_BINS = 12;
var COLOR_COVERAGE = 0.95;
var MIN_COLOR_SAMPLES = 100;
var EDGE_RADIUS = 1.8;
// see addSmallShadows()
var SMALL_SHADOW_REF = 6; // DEM cells
var SMALL_SHADOW_CELLS = 48;
var SMALL_SHADOW_NEIGHBORS = 4;
var NEAR_SHADOW_ALTITUDE = 6; // degrees
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
var RANK_BINS = 8;
var MIN_RANK_SAMPLES = 10;
var RANK_PRIOR = 200;
var RANK_MAX_RADIUS = 3;
var RANK_PAIR_DIFF = 0.15; // log luma (see weighRankGains())
var RANK_PAIR_PRIOR = 20;
var CLASS_RADIUS = 2.4;
// meters; the share of the DEM's lighting of sunlit ground that the image
// shows is measured within this distance (see getLightingResponse())
var RESPONSE_RADIUS = 100;
var RESPONSE_SMOOTHING = 20;
// Elevations are smoothed over this many DEM pixels for the slopes that are
// lit, so that the facets of a DEM resampled to a finer grid don't show
var NORMAL_SMOOTHING = 1;
// meters; DEMs are often resampled from coarser ones (e.g. 1/9 arc-second
// DEMs from 10 m data), which leaves steps in their slopes
var MIN_NORMAL_SMOOTHING = 10;
// largest gain applied to a linear value
var MAX_GAIN = 25;
// shadows from their colors (see addSignatureShadows())
var PLAUSIBLE_AZIMUTH = 30; // degrees
var PLAUSIBLE_DROP = 15; // degrees
var PLAUSIBLE_STEP = 10; // degrees
var SIGNATURE_LLR = Math.log(8);
var AREA_SUN_MATCH = 0.6;
var MIN_SUNLIT_SHARE = 0.25;
var MIN_SIGNATURE_PIXELS = 1000;
var SIGNATURE_SAMPLES = 50000;
var SHADOW_COMPONENTS = 6;
var LIT_COMPONENTS = 12;
var KMEANS_ROUNDS = 20;
var MIXTURE_VARIANCE = 0.01;
var SIGNATURE_EPSILON = 1e-3;
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
  var di = byRow ? 1 : w, k0 = byRow ? r.x0 : r.y0, k1 = byRow ? r.x1 : r.y1;
  var tmp, line, k, a, b, j0, f, s, z, i, inRegion;
  for (var m = 0; m < lines; m++) {
    // lines nearest the sun first
    line = lineStep > 0 ? lines - 1 - m : m;
    inRegion = byRow ? line >= r.y0 && line < r.y1 : line >= r.x0 && line < r.x1;
    for (k = 0, i = byRow ? line * w : line; k < n; k++, i += di) {
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
        if (s > z + 0.2 && inRegion && k >= k0 && k < k1) out[i] = 1;
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

var MAX_DECLINATION = 23.44 + 1;

// Whether the sun can be at a position (radians) on some day of the year
export function isPossibleSun(latitude, azimuth, altitude) {
  var lat = latitude * Math.PI / 180;
  var sinDec = Math.sin(lat) * Math.sin(altitude) + Math.cos(lat) * Math.cos(altitude) * Math.cos(azimuth);
  return Math.abs(Math.asin(Math.max(-1, Math.min(1, sinDec)))) <= MAX_DECLINATION * Math.PI / 180;
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
  if (!best) return sun;
  return {azimuth: sun.azimuth, altitude: best.altitude * deg,
    score: scoreSun(level, sun.azimuth, best.altitude * deg)};
}

// @sun's altitude from the edges of cast shadows on @edges (see
// EDGE_FIT_CELLS and getEdgeAltitude()), with the azimuth fitted again at
// that altitude, as the edges are compared in the direction of the azimuth;
// or if the edges don't tell the altitude, refined by refineAltitude()
function fitEdgeAltitude(level, edges, sun) {
  var deg = Math.PI / 180, az = sun.azimuth, fit = null, alt, next, k;
  for (k = 0; k < 2; k++) {
    alt = getEdgeAltitude(edges, az);
    if (alt === null) break;
    next = fitAzimuth(level, az, alt * deg);
    if (!(next.score > -1)) break;
    fit = next;
    if (Math.abs(fit.azimuth - az) < SAME_SUN * deg / 2) break;
    az = fit.azimuth;
  }
  return fit || refineAltitude(level, sun);
}

// The level that shadow edges are measured on (see EDGE_FIT_CELLS)
// @brightness one value per terrain cell (see getFitLevel())
function getEdgeLevel(terrain, brightness, region) {
  var level = getFitLevel(terrain.Z, brightness, terrain.width, terrain.height, terrain.cellWidth,
    terrain.cellHeight, region, EDGE_FIT_CELLS, Infinity);
  level.edgeStep = Math.max(EDGE_STEP, Math.round(EDGE_DISTANCE / Math.sqrt(level.cellW * level.cellH)));
  return level;
}

// The highest altitude (whole degrees from @lo to @hi) at which each cell is
// shadowed by terrain in the direction @azimuth (@hi if higher), or 0
function getHorizonAngles(level, azimuth, lo, hi) {
  var deg = Math.PI / 180, H = new Uint8Array(level.w * level.h), alt, P, i;
  for (alt = Math.min(MAX_ALTITUDE, hi); alt >= lo; alt--) {
    P = castTerrainShadow(level.Z, level.w, level.h, level.cellW, level.cellH,
      {azimuth: azimuth, altitude: alt * deg}, level.region);
    if (level.work) level.work.fit(getRegionCells(level.region));
    for (i = 0; i < P.length; i++) if (P[i] && H[i] === 0) H[i] = alt;
  }
  return H;
}

// How much brighter (mean log brightness) sunlit cells just beyond the edges
// of cast shadows are than the shadowed cells EDGE_STEP cells (or the level's
// edgeStep) before them (toward the sun), with the sun at @altitude. Only
// cells facing the sun are compared, so that the edges are of cast shadows,
// which are sharp, and not of slopes facing away from the sun, which darken
// gradually.
// @H horizon angles (see getHorizonAngles())
// Returns {contrast, count}
function getShadowEdgeContrast(level, H, azimuth, altitude) {
  var r = level.region, w = level.w, LB = getLevelLogBrightness(level), nrm = getLevelNormals(level);
  var a = altitude * Math.PI / 180, sx = Math.sin(azimuth) * Math.cos(a), sy = Math.cos(azimuth) * Math.cos(a);
  var step = level.edgeStep || EDGE_STEP;
  var sz = Math.sin(a), dx = -Math.sin(azimuth) * step, dy = Math.cos(azimuth) * step;
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
export function getEdgeAltitude(level, azimuth) {
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
  var hour, j, s, c, ds, moved;
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
  // pattern search: a step is halved once no move from the best position
  // improves on it
  for (s = 3.75; s >= 0.25; ) {
    moved = false;
    [[-s, 0], [s, 0], [0, -ds], [0, ds]].forEach(function(d) {
      var c = d[0] || d[1] ? candidate(best.hour + d[0], best.declination + d[1]) : null;
      if (c && c.score > best.score) {
        best = c;
        moved = true;
      }
    });
    if (!moved) {
      s /= 2;
      ds /= 2;
    }
  }
  return best;
}

// Mean correlation of I with brightness within the tiles of @level.region
// (weighted by cells); -1 if no tile has both varying
// @tileR optional array for each tile's correlation (NaN if not scored)
function scoreSun(level, azimuth, altitude, tileR) {
  if (level.latitude != null && !isPossibleSun(level.latitude, azimuth, altitude)) {
    if (tileR) tileR.fill(NaN);
    return -1;
  }
  var r = level.region, w = level.w, B = level.B, T = level.tile;
  var tw = Math.ceil((r.x1 - r.x0) / T), th = Math.ceil((r.y1 - r.y0) / T);
  var nrm = getLevelNormals(level), NX = nrm.x, NY = nrm.y, NZ = nrm.z;
  var P = castTerrainShadow(level.Z, w, level.h, level.cellW, level.cellH,
    {azimuth: azimuth, altitude: altitude}, r);
  var sx = Math.sin(azimuth) * Math.cos(altitude), sy = Math.cos(azimuth) * Math.cos(altitude);
  var sz = Math.sin(altitude);
  var acc = new Float64Array(tw * 6), total = 0, wsum = 0;
  var tx, ty, x, y, y1, i, k, a, b, n, cov, va, vb, rr;
  if (level.work) level.work.fit(getRegionCells(r));
  B = getLevelLogBrightness(level);
  for (ty = 0; ty < th; ty++) {
    acc.fill(0);
    y1 = Math.min(r.y1, r.y0 + (ty + 1) * T);
    for (y = r.y0 + ty * T; y < y1; y++) {
      for (x = r.x0; x < r.x1; x++) {
        i = y * w + x;
        b = B[i];
        if (b !== b || NZ[i] !== NZ[i]) continue;
        a = P[i] ? 0 : NX[i] * sx + NY[i] * sy + NZ[i] * sz;
        a = Math.log((a > 0 ? a : 0) + FIT_DIFFUSE);
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

// The grids reduced by an integer factor, to have up to @maxCells cells in the
// region (means, ignoring NaN), with cells no larger than @maxCell meters
// Returns {Z, B, w, h, cellW, cellH, region, factor, tile}: tile is the side
//   of a fit tile, in cells (see FIT_TILES)
export function getFitLevel(Z, B, w, h, cellW, cellH, region, maxCells, maxCell) {
  var cells = (region.x1 - region.x0) * (region.y1 - region.y0);
  var f = Math.min(Math.ceil(Math.sqrt(cells / maxCells)),
    Math.floor(maxCell / Math.max(cellW, cellH)));
  f = Math.max(1, f);
  var tile = Math.max(MIN_FIT_TILE, Math.round(Math.sqrt(cells / (f * f) / FIT_TILES)));
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
    tile: level.tile, region: {x0: region.x0 - x0, y0: region.y0 - y0, x1: region.x1 - x0, y1: region.y1 - y0},
    work: level.work, latitude: level.latitude};
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
  var blocks = getBlockCount(level);
  var margin = Math.ceil(BLOCK_MARGIN / Math.max(level.cellW, level.cellH));
  var suns = [sun], single = {suns: suns, labels: null, tw: tw, th: th};
  var work = level.work, w = path ? FIT_WORK.path : FIT_WORK.free, cells = getRegionCells(r);
  var bx, by, region, sub, fit, out, iter, prev;
  if (blocks < 2) return single;
  for (by = 0; by < blocks; by++) {
    for (bx = 0; bx < blocks; bx++) {
      region = {
        x0: r.x0 + Math.round(tw * bx / blocks) * T, x1: Math.min(r.x1, r.x0 + Math.round(tw * (bx + 1) / blocks) * T),
        y0: r.y0 + Math.round(th * by / blocks) * T, y1: Math.min(r.y1, r.y0 + Math.round(th * (by + 1) / blocks) * T)
      };
      sub = cropLevel(level, region, margin);
      fit = fitRegionSun(sub, sun, path, false);
      if (getPairedZ(getTileScores(sub, fit), getTileScores(sub, sun)) >= REGION_Z &&
          !suns.some(function(s) { return isSameSun(s, fit); })) {
        suns.push(fit);
      }
    }
  }
  if (suns.length == 1) return single;
  if (work) work.expect((w.refits + w.areas) * cells);
  out = compactSuns(suns, labelSuns(level, suns, tw, th), tw, th, true);
  for (iter = 0; iter < MAX_REFITS && out.labels; iter++) {
    suns = out.suns.map(function(s, k) {
      return refitSun(level, out.labels, k, tw, th, margin, s, path, true);
    });
    suns = suns.filter(function(s, k) {
      return k === 0 || !suns.slice(0, k).some(function(s2) { return isSameSun(s, s2); });
    });
    prev = out.labels;
    // once the image is a mosaic, its own sun is just one of the candidates
    out = compactSuns(suns, labelSuns(level, suns, tw, th, 0), tw, th, true);
    if (out.labels && out.suns.length == suns.length && out.labels.every(function(l, t) { return l == prev[t]; })) break;
  }
  if (work) work.expect(out.labels ? w.areas * cells : 0);
  if (out.labels) out = fitAreaSuns(level, out, margin, path);
  if (out.labels) {
    mergeAreaLabels(out.labels, tw, th, out.suns.map(function(s) { return getTileScores(level, s); }));
    out = compactSuns(out.suns, out.labels, tw, th);
  }
  // a lone sun left over may have been fitted on just some of the tiles
  return out.labels ? out : {suns: [sun], labels: null, tw: tw, th: th};
}

// Each tile's score for @sun (see scoreSun()), NaN where not scored
function getTileScores(level, sun) {
  var r = level.region, T = level.tile;
  var arr = new Float32Array(Math.ceil((r.x1 - r.x0) / T) * Math.ceil((r.y1 - r.y0) / T));
  scoreSun(level, sun.azimuth, sun.altitude, arr);
  return arr;
}

// How many standard errors the scores in @ra exceed those in @rb, paired over
// the tiles (indexes in @tiles, or all) that both are scored in; -Infinity
// with fewer than MIN_PAIRED_TILES. Tiles are the samples, not cells, as
// neighboring cells' brightness and lighting aren't independent.
export function getPairedZ(ra, rb, tiles) {
  var count = tiles ? tiles.length : ra.length, n = 0, sum = 0, sum2 = 0, j, t, d, mean, sd;
  for (j = 0; j < count; j++) {
    t = tiles ? tiles[j] : j;
    d = ra[t] - rb[t];
    if (d !== d) continue;
    n++;
    sum += d;
    sum2 += d * d;
  }
  if (n < MIN_PAIRED_TILES) return -Infinity;
  mean = sum / n;
  sd = Math.sqrt(Math.max(1e-12, (sum2 - n * mean * mean) / (n - 1)));
  return mean / (sd / Math.sqrt(n));
}

// An area (4-connected tiles with the same label) whose sun doesn't score
// better in its tiles than the sun of a neighboring area by REGION_Z standard
// errors (see getPairedZ()) takes that area's sun (the one scoring best in
// its tiles, if several), smallest areas first, until no area does
// @tileR each sun's score in each tile (NaN if not scored)
// Modifies and returns @labels
export function mergeAreaLabels(labels, tw, th, tileR) {
  var changed = true, areas, area, k, i, j, t, best, bestMean, m;
  while (changed) {
    changed = false;
    areas = getLabelAreas(labels, tw, th).sort(function(a, b) { return a.length - b.length; });
    for (i = 0; i < areas.length && !changed; i++) {
      area = areas[i];
      k = labels[area[0]];
      best = -1;
      for (j of getNeighborLabels(labels, tw, area)) {
        if (getPairedZ(tileR[k], tileR[j], area) >= REGION_Z) continue;
        m = getMeanScore(tileR[j], area);
        if (best < 0 || m > bestMean) {
          best = j;
          bestMean = m;
        }
      }
      if (best >= 0) {
        for (t of area) labels[t] = best;
        changed = true;
      }
    }
  }
  return labels;
}

// Labels of the tiles 4-connected to @area other than its own
function getNeighborLabels(labels, tw, area) {
  var own = labels[area[0]], out = [], t, u;
  for (t of area) {
    for (u of [t % tw > 0 ? t - 1 : -1, t % tw < tw - 1 ? t + 1 : -1, t - tw, t + tw]) {
      if (u >= 0 && u < labels.length && labels[u] != own && !out.includes(labels[u])) out.push(labels[u]);
    }
  }
  return out;
}

function getMeanScore(arr, tiles) {
  var sum = 0, n = 0, t;
  for (t of tiles) {
    if (arr[t] !== arr[t]) continue;
    sum += arr[t];
    n++;
  }
  return n > 0 ? sum / n : -Infinity;
}

// The number of blocks on each side of the grid that a mosaic's suns are
// first fitted in (see MAX_BLOCKS); none if fewer than 2
function getBlockCount(level) {
  var r = level.region, T = level.tile;
  var tw = Math.ceil((r.x1 - r.x0) / T), th = Math.ceil((r.y1 - r.y0) / T);
  return Math.min(MAX_BLOCKS, Math.floor(Math.sqrt(tw * th / BLOCK_TILES)));
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
    if (k < 0) {
      k = suns.length;
      suns.push(sun);
    }
    area.forEach(function(t) { labels[t] = k; });
  });
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

// Removes suns that no tile has (but the first, with @keepFirst)
function compactSuns(suns, labels, tw, th, keepFirst) {
  var used = suns.map(function(s, k) { return keepFirst && k === 0 || labels.includes(k); });
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
// Returns {I, direct, flat, near}: Float32Arrays of I, of I without cast
//   shadows, and of I on flat ground (sine of the sun's altitude), NaN
//   outside @region and where I is unknown; and a Uint8Array with 1 for cells
//   in the shadows of suns NEAR_SHADOW_ALTITUDE degrees lower
function getCellLighting(terrain, region, demPixelSize, regions, level) {
  var w = terrain.width, h = terrain.height, suns = regions.suns;
  var cell = Math.sqrt(terrain.cellWidth * terrain.cellHeight);
  var rs = Math.round(Math.max(NORMAL_SMOOTHING * demPixelSize, MIN_NORMAL_SMOOTHING) / cell);
  var nrm = getNormals(rs > 0 ? boxMeanValid(boxMeanValid(terrain.Z, w, h, rs), w, h, rs) : terrain.Z, w, h,
    terrain.cellWidth, terrain.cellHeight);
  var shadows = suns.map(function(sun) {
    return castTerrainShadow(terrain.Z, w, h, terrain.cellWidth, terrain.cellHeight, sun, region);
  });
  var lowered = suns.map(function(sun) {
    var alt = Math.max(MIN_ALTITUDE * Math.PI / 180, sun.altitude - NEAR_SHADOW_ALTITUDE * Math.PI / 180);
    return castTerrainShadow(terrain.Z, w, h, terrain.cellWidth, terrain.cellHeight,
      {azimuth: sun.azimuth, altitude: alt}, region);
  });
  var near = new Uint8Array(w * h), inNear;
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
      inNear = 1;
      for (k = 0; k < suns.length; k++) {
        if (weights[k] === 0) continue;
        v = vecs[k];
        s = nrm.x[i] * v[0] + nrm.y[i] * v[1] + nrm.z[i] * v[2];
        if (s < 0) s = 0;
        dsum += weights[k] * s;
        sum += shadows[k][i] ? 0 : weights[k] * s;
        fsum += weights[k] * v[2];
        inNear &= lowered[k][i];
      }
      I[i] = sum;
      direct[i] = dsum;
      flat[i] = fsum;
      near[i] = inNear;
    }
  }
  return {I: I, direct: direct, flat: flat, near: near};
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
    logY[i] = Math.log(getLinearLuma(lin, i) + 1e-4);
  }
  near = boxMean(isShadow, W, H, band, isShadow);
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
  mI = boxMean(litI, W, H, r, litI);
  for (i = 0; i < N; i++) {
    lit[i] *= logY[i];
    shade[i] *= logY[i];
  }
  mLit = boxMean(lit, W, H, r, lit);
  mShade = boxMean(shade, W, H, r, shade);
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

// @image {samples, bands, width, height, nodata}: uint8 RGB or RGBA; nodata
//   is optional
// @terrain {Z, width, height, factor, x0, y0, cellWidth, cellHeight, latitude}:
//   elevations in meters on a grid aligned with the image; cell
//   (x0 + floor(x / factor), y0 + floor(y / factor)) contains pixel (x, y);
//   latitude (optional) excludes sun positions that never occur there
// @nir optional near-infrared value of each pixel
// @pixelSize ground size of a pixel, in meters
// @demPixelSize ground size of the DEM's own pixels, in meters (terrain cells
//   larger than that are the DEM's resolution instead)
// @path optional {latitude, declination}, to fit the sun along its path on
//   the image's date (see fitSunPosition)
// Returns {samples, sun, suns, diffuse, typicalDiffuse, response, shadowGains, shadowShare, failure}:
//   samples is null if the image couldn't be corrected; suns are the sun
//   positions of a mosaic's regions (with the image's first), each with the
//   share of the image it lights; diffuse is c of each band (typicalDiffuse
//   is true if it's TYPICAL_DIFFUSE, not measured); response is the power of
//   the direct light on shaded slopes, if it was fitted (see MAX_RESPONSE);
//   shadowGains are
//   the gains of shadows on flat ground, as they apply to 8-bit values;
//   failure is 'empty' (no pixels have data; sun is null), 'fit' (no sun
//   position matches well enough), 'altitude' (the
//   best match is at MIN_ALTITUDE), 'diffuse' (c couldn't be fitted) or
//   'color' (shadows aren't bluer than sunlit ground)
// @progress optional function receiving the share of the work done (0 to 1)
//   as it increases (see REST_WORK)
// @options optional {balancedThreshold, imageShadows, despeckle} (see
//   getAgreementThreshold(), getPixelShadows() and addSmallShadows())
export function deshadowImage(image, terrain, nir, pixelSize, demPixelSize, path, progress, options) {
  var W = image.width, H = image.height, N = W * H;
  var work = getWorkTracker(progress || function() {}, N);
  var valid = getValidPixels(image);
  var lin = getLinearImage(image);
  var region = getTerrainRegion(terrain, W, H);
  demPixelSize = Math.max(demPixelSize, Math.sqrt(terrain.cellWidth * terrain.cellHeight));
  var cells = getPixelCells(terrain, W, H);
  var result = {samples: null, sun: null, suns: null, diffuse: null, shadowGains: null,
    shadowShare: 0, failure: null};
  if (valid.indexOf(1) == -1) {
    result.failure = 'empty';
    return result;
  }
  var brightness = getCellMeans(getLinearLumas(lin, N), W, H, terrain, valid);
  var level = getFitLevel(terrain.Z, brightness, terrain.width, terrain.height, terrain.cellWidth,
    terrain.cellHeight, region, FIT_CELLS, MAX_FIT_CELL);
  var coarse = path ? null : getFitLevel(level.Z, level.B, level.w, level.h, level.cellW, level.cellH,
    level.region, COARSE_FIT_CELLS, MAX_COARSE_FIT_CELL);
  var edges = path ? null : getEdgeLevel(terrain, brightness, region);
  level.work = work;
  level.latitude = terrain.latitude;
  if (coarse) {
    coarse.work = work;
    coarse.latitude = terrain.latitude;
  }
  if (edges) edges.work = work;
  work.expect(getFitWork(level, coarse, path) + (edges ? EDGE_FIT_CASTS * getRegionCells(edges.region) : 0));
  work.rest(PROGRESS.setup);
  var sun = path ? fitSunPath(level, path) : fitFreeSun(level, coarse, null);
  if (!path && sun.score > -1) sun = fitEdgeAltitude(level, edges, sun);
  var regions, light, tile, margin, all, classes, ratios, litRatios, pixelI, gains, inShadow, nValid, i;
  var byShadows = true;
  var flat, direct, hardI, predicted, shadows, refined;
  result.sun = sun;
  if (!(sun.score >= MIN_SUN_FIT)) {
    result.failure = 'fit';
    return result;
  }
  // a fit at the lowest altitude has usually matched dark ground on slopes
  // facing away from the sun (e.g. forest in valleys), not shadows
  if (sun.altitude * 180 / Math.PI < MIN_ALTITUDE + 0.5) {
    result.failure = 'altitude';
    return result;
  }
  regions = fitRegionSuns(level, sun, path);
  work.expect(0);
  light = getCellLighting(terrain, region, demPixelSize, regions, level);
  result.suns = getSunShares(regions, level, light, cells, terrain.width, valid, N);
  work.rest(PROGRESS.lighting);
  tile = Math.max(MIN_C_TILE, Math.round(C_TILE / pixelSize), Math.ceil(Math.sqrt(N / MAX_C_TILES)));
  margin = Math.max(1, Math.round(SHADOW_MARGIN * Math.max(demPixelSize, pixelSize) / pixelSize));
  flat = getPixelValues(light.flat, cells, Float32Array);
  direct = getPixelValues(light.direct, cells, Float32Array);
  hardI = getPixelValues(light.I, cells, Float32Array);
  for (i = 0, predicted = new Uint8Array(N); i < N; i++) predicted[i] = hardI[i] === 0 ? 1 : 0;
  shadows = getPixelShadows(image, nir, valid, predicted, getPixelValues(light.near, cells, Uint8Array),
    cells, terrain, region, regions,
    W, H, pixelSize, demPixelSize, work.rest, !!(options && options.balancedThreshold),
    options && options.imageShadows, !!(options && options.despeckle));
  work.rest(PROGRESS.shadows);
  result.masked = shadows.masked;
  result.maskRatio = shadows.ratio;
  if (shadows.masked) {
    for (i = 0; i < N; i++) hardI[i] = (1 - shadows.shadow[i]) * direct[i];
  }
  all = fitShadowRatios(image, valid, hardI, flat, W, H, null, 1, tile, margin)[0];
  if (!all.c.every(function(c) { return c > 0; })) {
    all = fitDiffuseRatios(lin, valid, hardI, W, H, null, 1, tile)[0];
    byShadows = false;
    if (slopeFitIsConfounded(all)) {
      all = {c: TYPICAL_DIFFUSE.concat(), tiles: [0, 0, 0]};
      result.typicalDiffuse = true;
    }
  }
  work.rest(PROGRESS.ratios);
  result.diffuse = all.c;
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
  if (byShadows) {
    classes = fitGroundClasses(lin, valid, hardI, flat, all.c, W, H, margin);
    ratios = classes.ratios;
    litRatios = fitSlopeRatios(lin, valid, hardI, W, H, classes.labels, ratios.length, tile, margin)
      .map(function(o) { return blendDiffuseRatios(o, {c: getNeutralRatios(all.c)}); });
  } else {
    classes = {labels: new Uint8Array(N)};
    ratios = [all.c];
    litRatios = ratios;
    if (!shadows.masked) {
      result.response = fitShadingResponse(lin, valid, hardI, flat, all.c, W, H);
    }
  }
  work.rest(PROGRESS.classes);
  if (shadows.masked) {
    var relit = relightMaskedImage(image, lin, valid, classes.labels, ratios, litRatios, flat, direct, hardI,
      shadows, W, H, pixelSize, margin, work);
    if (relit && relit.samples) {
      result.samples = relit.samples;
      result.shadowGains = relit.gains;
      result.shadowShare = shadows.count / N;
      work.rest(1);
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
  if (result.response) {
    refined = refineLighting(lin, valid, pixelI, flat, all.c, result.response, W, H);
    gains = getPixelGains(lin, classes.labels, ratios, litRatios, flat, refined, refined, valid, W, H,
      pixelSize);
  } else {
    gains = getPixelGains(lin, classes.labels, ratios, litRatios, flat, direct, pixelI, valid, W, H,
      pixelSize);
  }
  work.rest(PROGRESS.sunlit);
  limitBrightness(lin, gains, valid, getLitCap(lin, valid, pixelI, flat, null));
  rectifyColors(lin, gains, valid, hardI, pixelI, flat, W, H, pixelSize, margin);
  for (i = 0, inShadow = 0, nValid = 0; i < N; i++) {
    if (!valid[i]) continue;
    nValid++;
    if (pixelI[i] < flat[i] * 0.5) inShadow++;
  }
  result.shadowShare = inShadow / Math.max(1, nValid);
  result.samples = writeCorrectedSamples(image, lin, gains, valid);
  work.rest(1);
  return result;
}

// deshadowImage()'s progress is measured in work, which is roughly time: a
// unit is a cell scored or cast in fitting the sun's position, and the other
// stages take REST_WORK units per pixel, of which PROGRESS is the share done
// at the end of each stage (the setup is before the fit)
var REST_WORK = 170;
var PROGRESS = {setup: 0.01, lighting: 0.05, mask: 0.12, casts: 0.17, shadows: 0.35, ratios: 0.36,
  classes: 0.58, sunlit: 0.74, relit: 0.91};
// The work of fitting the sun, in units per cell of the fit level, along its
// path (path) or anywhere (free, where each cell of the coarse level is also
// scored once per position of fitFreeSun()'s grid, FREE_SEARCH_FITS): the
// image's fit, and with blocks (see fitRegionSuns()), the blocks' fits, the
// refits and the fits of a mosaic's areas. An image with blocks is expected
// to be a mosaic, which is most of the work, until the blocks show it isn't.
var FIT_WORK = {
  path: {fit: 30, blocks: 37, refits: 410, areas: 45},
  free: {fit: 110, blocks: 42, refits: 720, areas: 105}
};
var FREE_SEARCH_FITS = 36 * 8;
var PROGRESS_STEP = 0.005;

// Reports the share of the work done to @progress, in steps of at least
// PROGRESS_STEP
// @N pixels in the image
// Returns {fit, expect, rest}: functions receiving the cells just scored or
//   cast in fitting the sun, the fitting work still expected, and the share
//   of the other stages done
function getWorkTracker(progress, N) {
  var rest = N * REST_WORK, fit = 0, fitLeft = 0, restShare = 0, reported = 0;
  function report() {
    var share = (fit + restShare * rest) / (fit + fitLeft + rest);
    if (share >= reported + PROGRESS_STEP || share == 1 && reported < 1) {
      reported = share;
      progress(share);
    }
  }
  return {
    fit: function(cells) {
      fit += cells;
      fitLeft = Math.max(0, fitLeft - cells);
      report();
    },
    expect: function(cells) {
      fitLeft = cells;
      report();
    },
    rest: function(share) {
      restShare = share;
      report();
    }
  };
}

// The expected work of fitting the sun (see FIT_WORK)
// @coarse level of the first search of a free fit
function getFitWork(level, coarse, path) {
  var w = path ? FIT_WORK.path : FIT_WORK.free, cells = getRegionCells(level.region);
  var work = w.fit * cells + (coarse ? FREE_SEARCH_FITS * getRegionCells(coarse.region) : 0);
  if (getBlockCount(level) > 1) work += (w.blocks + w.refits + w.areas) * cells;
  return work;
}

function getRegionCells(r) {
  return (r.x1 - r.x0) * (r.y1 - r.y0);
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
    pixelSize, margin, work) {
  var N = W * H, lit, relit;
  lit = Object.assign({}, image, {samples: correctSunlitPixels(image, lin, valid, labels, ratios, litRatios,
    flat, direct, shadows.mask.hard, W, H, pixelSize, Math.max(toPixels(EDGE_LIGHTING, pixelSize), margin * 2))});
  work.rest(PROGRESS.sunlit);
  relit = relightShadows(lit, getLuma(lit.samples, lit.bands, N), valid, shadows.mask, pixelSize, shadows.sun);
  work.rest(PROGRESS.relit);
  if (relit && relit.samples) {
    relit.samples = rectifySamples(image, lin, relit.samples, valid, I, flat, pixelSize, margin);
  }
  return relit;
}

// A copy of @image's samples with the pixels outside the mask @hard corrected
// for their lighting (see getPixelGains())
// @edge pixels from the mask's edges within which the image's lumas can raise
//   the DEM's lighting (see raiseEdgeLighting())
function correctSunlitPixels(image, lin, valid, labels, ratios, litRatios, flat, direct, hard, W, H, pixelSize,
    edge) {
  var N = W * H, litI = new Float32Array(N), i, b, gains;
  // ground outside the mask is sunlit, even where the DEM faces away from the sun
  for (i = 0; i < N; i++) litI[i] = Math.max(direct[i], LIT_FLOOR * flat[i]);
  raiseEdgeLighting(lin, valid, hard, litI, W, H, edge);
  gains = getPixelGains(lin, labels, ratios, litRatios, flat, litI, litI, valid, W, H, pixelSize);
  for (i = 0; i < N; i++) {
    if (hard[i]) for (b = 0; b < 3; b++) gains[b][i] = NaN;
  }
  limitBrightness(lin, gains, valid, getLitCap(lin, valid, direct, flat, hard));
  return writeCorrectedSamples(image, lin, gains, valid);
}

// Raises @litI of sunlit pixels within @r pixels of the mask @hard to the I
// that their lumas show, Y = Y_lit (I + c) / (I_lit + c), where Y_lit and
// I_lit are the mean luma and I of the sunlit pixels around them (beyond @r
// pixels from the mask) and Y_lit c / (I_lit + c) is the mean luma of the
// shadowed pixels around them (inside the mask, away from its edges), within
// SHADOW_REFERENCE times @r pixels, if those differ by MIN_SHADOW_CONTRAST
// (log luma). A pixel darker than that (e.g. of darker ground, or of a shadow
// the mask has missed) keeps the DEM's I.
export function raiseEdgeLighting(lin, valid, hard, litI, W, H, r) {
  var N = W * H, near = maskMean(hard, W, H, r), core = maskMean(hard, W, H, 1);
  var wLit = new Float32Array(N), yLit = new Float32Array(N), iLit = new Float32Array(N);
  var wShade = new Float32Array(N), yShade = new Float32Array(N);
  var i, y, yl, ys, s;
  for (i = 0; i < N; i++) {
    if (!valid[i]) continue;
    y = getLinearLuma(lin, i);
    if (near[i] < 0.001 && litI[i] === litI[i]) {
      wLit[i] = 1;
      yLit[i] = y;
      iLit[i] = litI[i];
    } else if (core[i] > 0.999) {
      wShade[i] = 1;
      yShade[i] = y;
    }
  }
  [wLit, yLit, iLit, wShade, yShade].forEach(function(arr) {
    boxMean(arr, W, H, r * SHADOW_REFERENCE, arr);
  });
  for (i = 0; i < N; i++) {
    if (!valid[i] || hard[i] || !(near[i] >= 0.001) || litI[i] !== litI[i] ||
        !(wLit[i] > 0.01 && wShade[i] > 0.01)) continue;
    yl = yLit[i] / wLit[i];
    ys = yShade[i] / wShade[i];
    if (!(Math.log(yl / ys) >= MIN_SHADOW_CONTRAST)) continue;
    s = Math.max(0, Math.min(1, (yl - getLinearLuma(lin, i)) / (yl - ys)));
    litI[i] = Math.max(litI[i], (1 - s) * iLit[i] / wLit[i]);
  }
}

// @samples corrected copy of @image's samples, kept within the colors of
// sunlit ground (see rectifyColors())
// @I I of each pixel
function rectifySamples(image, lin, samples, valid, I, flat, pixelSize, margin) {
  var W = image.width, H = image.height, N = W * H, bands = image.bands, src = image.samples;
  var decode = getDecodeTable(), encode = getEncodeTable(), scale = encode.length - 1;
  var gains = [0, 1, 2].map(function() { return new Float32Array(N); });
  var i, b, v, changed;
  // the gain from @image's sample j to @samples', as a Float32Array keeps it
  function getSampleGain(j) {
    var o = decode[src[j]];
    return samples[j] != src[j] && o > 0 ? Math.fround(decode[samples[j]] / o) : 1;
  }
  for (i = 0; i < N; i++) {
    for (b = 0; b < 3; b++) gains[b][i] = getSampleGain(i * bands + b);
  }
  rectifyColors(lin, gains, valid, I, I, flat, W, H, pixelSize, margin);
  for (i = 0; i < N; i++) {
    for (b = 0, changed = false; b < 3; b++) {
      if (gains[b][i] !== getSampleGain(i * bands + b)) changed = true;
    }
    if (!changed) continue;
    for (b = 0; b < 3; b++) {
      v = decode[src[i * bands + b]] * gains[b][i];
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
    y = getLinearLuma(lin, i);
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
function limitBrightness(lin, gains, valid, cap) {
  var N = gains[0].length, src = lin.samples, bands = lin.bands, decode = lin.decode;
  var i, j, b, y, yg, t, g;
  for (i = 0; i < N; i++) {
    if (!valid[i] || !(gains[0][i] > 1 || gains[1][i] > 1 || gains[2][i] > 1)) continue;
    y = getLinearLuma(lin, i);
    j = i * bands;
    yg = 0.2126 * applyGain(decode[src[j]], gains[0][i]) + 0.7152 * applyGain(decode[src[j + 1]], gains[1][i]) +
      0.0722 * applyGain(decode[src[j + 2]], gains[2][i]);
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
function rectifyColors(lin, gains, valid, hardI, pixelI, flat, W, H, pixelSize, margin) {
  var N = W * H, nc = COLOR_BINS * 2, cells = nc * nc;
  var size = COLOR_LUMA_BINS * cells, step = COLOR_RANGE / COLOR_BINS, LB = COLOR_LUMA_BINS;
  var T = Math.max(toPixels(COLOR_TILE, pixelSize), Math.ceil(Math.sqrt(N / MAX_COLOR_TILES)));
  var tw = Math.ceil(W / T), th = Math.ceil(H / T);
  var hist = new Uint32Array(tw * th * size), sum = new Float64Array(size);
  var local = makeEnvelope(), whole = makeEnvelope();
  var counts = new Float64Array(cells), shadow = new Float32Array(N), near, out = [0, 0, 0], f = [0, 0, 0];
  var src = lin.samples, bands = lin.bands, decode = lin.decode;
  var i, j, b, x, y, tx, ty, l, k, o, y0, y1, cr, cb, u, v, sc, env, x0, x1;

  function getLinearY(i) {
    var j = i * bands;
    return LUMA_WEIGHTS[0] * decode[src[j]] + LUMA_WEIGHTS[1] * decode[src[j + 1]] +
      LUMA_WEIGHTS[2] * decode[src[j + 2]];
  }

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
    for (b = 0; b < 3; b++) out[b] = applyGain(decode[src[i * bands + b]], gains[b][i]);
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
  near = boxMean(shadow, W, H, margin, shadow);
  for (i = 0; i < N; i++) {
    if (!valid[i] || !(hardI[i] > 0) || near[i] > 0.001 || !(pixelI[i] >= LIT_SHARE * flat[i])) continue;
    y0 = getLinearY(i);
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
          y0 = getLinearY(i);
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
            o = decode[src[i * bands + b]];
            if (o > 0) gains[b][i] = Math.min(MAX_GAIN, f[b] * sc / o);
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
// in tiles of @tile pixels: v_lit / v_shadow = (I_lit + c) / c, from medians
// of pixels at least @margin pixels inside shadows (I = 0) and inside sunlit
// ground lit like flat ground (I within FLAT_RANGE of it)
// @I, @flat I and I of flat ground, of each pixel
// @labels optional class of each pixel (0 to @K - 1)
// Returns an array of {c, tiles} for each class (see fitDiffuseRatios())
export function fitShadowRatios(image, valid, I, flat, W, H, labels, K, tile, margin) {
  var tiles = getTileMedians(image, valid, I, flat, W, H, labels, K, tile, margin);
  var nt = tiles.length / K, out = [], ratios, k, t, b, m, med;
  for (k = 0; k < K; k++) {
    ratios = [[], [], []];
    for (t = 0; t < nt; t++) {
      m = tiles[k * nt + t];
      if (!m) continue;
      for (b = 0; b < 3; b++) {
        med = m.shadow[b] > 0 ? m.lit[b] / m.shadow[b] : 0;
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

// Medians (linear) of each band in each tile of each class, of shadowed and
// sunlit pixels (see fitShadowRatios())
// Returns an array (K x tiles) of {shadow, lit, I} (null for tiles with fewer
//   than MIN_GROUP_PIXELS of either): I is the mean I of the sunlit pixels
function getTileMedians(image, valid, I, flat, W, H, labels, K, tile, margin) {
  var N = W * H, src = image.samples, bands = image.bands, decode = getDecodeTable();
  var tw = Math.ceil(W / tile), th = Math.ceil(H / tile), nt = tw * th;
  var inShadow = new Float32Array(N), near, hist, isum, x, y, i, g, o, b, k, n, nl, a, out = [];
  for (i = 0; i < N; i++) inShadow[i] = I[i] === 0 ? 1 : 0;
  near = boxMean(inShadow, W, H, margin, inShadow);
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
      I: isum[k] / nl
    });
  }
  return out;
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

// I of each pixel, with the light (getResponseLighting() + c) / (flat + c)
// moved onto the pixels whose luma it explains (see GUIDE_RADIUS)
// @I I of each pixel
// @c c of each band
// @K see MAX_RESPONSE
function refineLighting(lin, valid, I, flat, c, K, W, H) {
  var N = W * H, r = GUIDE_RADIUS, cy = LUMA_WEIGHTS[0] * c[0] + LUMA_WEIGHTS[1] * c[1] + LUMA_WEIGHTS[2] * c[2];
  var ok = new Float32Array(N), G = new Float32Array(N), P = new Float32Array(N), tmp = new Float32Array(N);
  var out = I.slice(), count, mG, mP, A, B, i, v, a;
  for (i = 0; i < N; i++) {
    if (!(valid[i] && I[i] === I[i] && flat[i] > 0)) continue;
    ok[i] = 1;
    G[i] = Math.log(getLinearLuma(lin, i) + LOG_EPSILON);
    P[i] = Math.log((getResponseLighting(I[i], flat[i], K) + cy) / (flat[i] + cy));
  }
  count = boxMean(ok, W, H, r);
  // means of the ok pixels around each pixel (0 if there are none)
  function mean(src, dest) {
    dest = boxMean(src, W, H, r, dest);
    for (var j = 0; j < N; j++) dest[j] = count[j] > 0 ? dest[j] / count[j] : 0;
    return dest;
  }
  mG = mean(G);
  mP = mean(P);
  for (i = 0; i < N; i++) tmp[i] = G[i] * G[i];
  A = mean(tmp);
  for (i = 0; i < N; i++) tmp[i] = G[i] * P[i];
  B = mean(tmp, tmp);
  // each square's fit is written over its means of G * G and G * P
  for (i = 0; i < N; i++) {
    v = A[i] - mG[i] * mG[i];
    a = ok[i] ? Math.max(0, (B[i] - mG[i] * mP[i]) / (v + GUIDE_EPSILON)) : 0;
    A[i] = a;
    B[i] = ok[i] ? mP[i] - a * mG[i] : 0;
  }
  mean(A, A);
  mean(B, B);
  for (i = 0; i < N; i++) {
    if (ok[i]) out[i] = Math.max(0, (flat[i] + cy) * Math.exp(A[i] * G[i] + B[i]) - cy);
  }
  return out;
}

// I with sunlit ground's direct light relative to flat ground's raised to
// the power @K (see MAX_RESPONSE) where it's less than flat ground's
function getResponseLighting(I, flat, K) {
  return K == 1 || !(I > 0) || I >= flat ? I : flat * Math.pow(I / flat, K);
}

// The power K of the direct light (see MAX_RESPONSE) that minimizes the total
// variation of the log luma corrected by (getResponseLighting() + c) / (flat
// + c) between pixels and their neighbors to the right and below, of the
// pairs of similar colors (see RESPONSE_PAIR_SHARE) (searched as though the
// total variation had one minimum)
// @c c of each band
export function fitShadingResponse(lin, valid, I, flat, c, W, H) {
  var N = W * H, L = new Float32Array(N), E = new Float32Array(N), ok = new Uint8Array(N), pairs;
  var cy = LUMA_WEIGHTS[0] * c[0] + LUMA_WEIGHTS[1] * c[1] + LUMA_WEIGHTS[2] * c[2];
  var phi = (Math.sqrt(5) - 1) / 2, a = 1, b = MAX_RESPONSE, i, x1, x2, f1, f2;
  for (i = 0; i < N; i++) {
    if (!(valid[i] && I[i] === I[i] && flat[i] > 0)) continue;
    ok[i] = 1;
    L[i] = Math.log(getLinearLuma(lin, i) + LOG_EPSILON);
  }
  pairs = getSimilarColorPairs(lin, ok, W, H);
  function variation(K) {
    var sum = 0, n = 0, i, p;
    for (i = 0; i < N; i++) {
      if (ok[i]) E[i] = L[i] - Math.log((getResponseLighting(I[i], flat[i], K) + cy) / (flat[i] + cy));
    }
    for (i = 0; i < N; i++) {
      p = pairs[i];
      if (p & 1) {
        sum += Math.abs(E[i + 1] - E[i]);
        n++;
      }
      if (p & 2) {
        sum += Math.abs(E[i + W] - E[i]);
        n++;
      }
    }
    return n > 0 ? sum / n : 0;
  }
  x1 = b - phi * (b - a);
  x2 = a + phi * (b - a);
  f1 = variation(x1);
  f2 = variation(x2);
  while (b - a > RESPONSE_TOLERANCE) {
    if (f1 <= f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = b - phi * (b - a);
      f1 = variation(x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = a + phi * (b - a);
      f2 = variation(x2);
    }
  }
  return b - 1 > RESPONSE_TOLERANCE * 2 ? (a + b) / 2 : 1;
}

// The pairs of @ok pixels and their neighbors to the right (1) and below (2)
// whose colors differ least (RESPONSE_PAIR_SHARE of them, by the larger
// difference of their log red/green and blue/green ratios)
// Returns a Uint8Array of the pairs of each pixel
function getSimilarColorPairs(lin, ok, W, H) {
  var N = W * H, R = new Float32Array(N), B = new Float32Array(N), pairs = new Uint8Array(N);
  var src = lin.samples, bands = lin.bands, decode = lin.decode;
  var bins = Math.round(MAX_PAIR_COLOR_DIFF / PAIR_COLOR_STEP), hist = new Float64Array(bins + 1);
  var n = 0, sum = 0, x, y, i, j, g, k, max;
  for (i = 0; i < N; i++) {
    if (!ok[i]) continue;
    j = i * bands;
    g = decode[src[j + 1]] + LOG_EPSILON;
    R[i] = Math.log((decode[src[j]] + LOG_EPSILON) / g);
    B[i] = Math.log((decode[src[j + 2]] + LOG_EPSILON) / g);
  }
  function diff(i, j) {
    return Math.max(Math.abs(R[i] - R[j]), Math.abs(B[i] - B[j]));
  }
  function bin(d) {
    return Math.min(bins, Math.floor(d / PAIR_COLOR_STEP));
  }
  for (y = 0; y < H; y++) {
    for (x = 0; x < W; x++) {
      i = y * W + x;
      if (!ok[i]) continue;
      if (x + 1 < W && ok[i + 1]) {
        hist[bin(diff(i, i + 1))]++;
        n++;
      }
      if (y + 1 < H && ok[i + W]) {
        hist[bin(diff(i, i + W))]++;
        n++;
      }
    }
  }
  for (k = 0; k < bins; k++) {
    sum += hist[k];
    if (sum >= n * RESPONSE_PAIR_SHARE) break;
  }
  max = (k + 1) * PAIR_COLOR_STEP;
  for (y = 0; y < H; y++) {
    for (x = 0; x < W; x++) {
      i = y * W + x;
      if (!ok[i]) continue;
      if (x + 1 < W && ok[i + 1] && diff(i, i + 1) < max) pairs[i] |= 1;
      if (y + 1 < H && ok[i + W] && diff(i, i + W) < max) pairs[i] |= 2;
    }
  }
  return pairs;
}

// Whether a fit of c from the slopes (see fitDiffuseRatios()) has bands that
// vary with I in some tiles, but give a positive c in too few of them (see
// MIN_SLOPE_FIT_SHARE)
export function slopeFitIsConfounded(fit) {
  return fit.correlated.some(function(n) { return n > 0; }) &&
    fit.correlated.some(function(n, b) { return !(fit.tiles[b] >= n * MIN_SLOPE_FIT_SHARE && fit.tiles[b] > 0); });
}

// c of each band for each class, from regressions of linear values on I in
// tiles of @tile pixels
// @I I of each pixel
// @labels optional class of each pixel (0 to @K - 1)
// Returns an array of {c, tiles, correlated} for each class: c and the number
//   of tiles it was fitted in, for each band (c is NaN with no tiles), and the
//   number of tiles where the band varies with I (including those with c <= 0)
export function fitDiffuseRatios(lin, valid, I, W, H, labels, K, tile) {
  var tw = Math.ceil(W / tile), th = Math.ceil(H / tile), nt = tw * th, S = 12;
  var acc = new Float64Array(K * nt * S), src = lin.samples, bands = lin.bands, decode = lin.decode;
  var x, y, i, a, o, b, v, k, t, n, mx, va, my, vy, cov, slope, icpt, ratios, correlated, out = [];
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
        v = decode[src[i * bands + b]];
        acc[o + 3 + b] += v;
        acc[o + 6 + b] += v * v;
        acc[o + 9 + b] += a * v;
      }
    }
  }
  for (k = 0; k < K; k++) {
    ratios = [[], [], []];
    correlated = [0, 0, 0];
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
        if (rr < MIN_C_FIT) continue;
        correlated[b]++;
        slope = cov / va;
        icpt = my - slope * mx;
        if (icpt > 0) ratios[b].push(icpt / slope);
      }
    }
    out.push({
      c: ratios.map(function(arr) { return arr.length > 0 ? getMedian(arr) : NaN; }),
      tiles: ratios.map(function(arr) { return arr.length; }),
      correlated: correlated,
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
  near = boxMean(inShadow, W, H, margin, inShadow);
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
// Returns {labels, ratios}: ratios has c of each class
export function fitGroundClasses(lin, valid, I, flat, all, W, H, margin) {
  var N = W * H, src = lin.samples, bands = lin.bands, decode = lin.decode;
  var group = getRatioGroups(valid, I, flat, W, H, margin);
  var labels = new Uint8Array(N), step = Math.max(1, Math.floor(N / 20000));
  var samples = [], f = new Float64Array(3), centers, K, m, ratios, round, i, k, b, hist, counts;
  // logs of the linear values of 8-bit values
  var logTable = new Float64Array(256);
  for (i = 0; i < 256; i++) logTable[i] = Math.log(Math.max(0, decode[i]) + 1e-4);
  function logColor(i, out) {
    for (var b = 0; b < 3; b++) out[b] = logTable[src[i * bands + b]];
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
        var sh = decode[getHistogramMedian(hist, (k * 6 + b) * 256, n)];
        var ratio = sh > 0 ? decode[getHistogramMedian(hist, (k * 6 + 3 + b) * 256, nl)] / sh : 0;
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
  var samples = getMaskSamples(L, valid, mask, W, H, pixelSize);
  var edge = samples.edge, gap = samples.gap, litT = samples.litT;
  var gains = measureGains(src, bands, L, valid, gap, litT, W, H, pixelSize);
  if (!gains) return null;
  if (gains[0] < gains[2] * MIN_RED_BLUE_GAIN) return {samples: null, gains: gains};
  var imageCap = getBrightnessCap(L, valid, edge, mask);
  var maxDist = Math.max(8, toPixels(BLOCK_SIZE, pixelSize));
  var near = maskMean(hard, W, H, maxDist);
  var pairs = findEdgePairs(valid, hard, edge, gap, near, W, H, maxDist, sun);
  var classes = measureClassGains(src, bands, L, valid, hard, edge, pairs, W, H, gains, pixelSize);
  var bare = getBareShare(src, bands, valid, hard, gap, near, W, H, pixelSize);
  var bareGains = measureBareGains(src, bands, pairs, classes.cls, classes.lo.length, W, H, gains, pixelSize);
  var bareLo = getBareShadowLightness(L, valid, edge, hard, classes, bare);
  var rg = measureRankGains(src, bands, L, valid, hard, edge, gap, near, litT, W, H, pixelSize);
  weighRankGains(rg, pairs, L, W);
  gap = near = null;
  var cls = classes.cls, alpha = new Float32Array(N), wt = new Float32Array(N);
  var logG = [0, 1, 2].map(function() { return new Float32Array(N); });
  var relit, i, k, s, b, x, y, la, a, g, cap, f;
  for (i = 0; i < N; i++) {
    s = cls[i];
    if (s < 0) continue;
    x = i % W;
    y = Math.floor(i / W);
    b = bare[i];
    for (k = 0, g = 0; k < 3; k++) {
      logG[k][i] = getTileLogGain(classes, s, x, y, k);
      if (b > 0) logG[k][i] = (1 - b) * logG[k][i] + b * getTileLogGain(bareGains, s, x, y, k);
      g += [0.299, 0.587, 0.114][k] * logG[k][i];
    }
    // the lightness of partly shadowed pixels is between the shadows' and
    // the shadows' brightened by the gains of their ground there
    g = Math.exp(g);
    la = getLightnessAlpha(L[i], classes.lo[s], Math.max(classes.lo[s] + 1, classes.lo[s] * g));
    if (b > 0) la = (1 - b) * la + b * getLightnessAlpha(L[i], bareLo[s], Math.max(bareLo[s] + 1, bareLo[s] * g));
    if (mask.dem && mask.dem[i]) alpha[i] = 1;
    else if (edge[i] > 0 && edge[i] < 1) alpha[i] = la;
    else if (hard[i]) alpha[i] = Math.min(1, la * 1.5);
    // sunlit ground next to the shadows can look like other ground in shadow
    if (!hard[i] && mask.posterior && mask.posterior[i] < alpha[i]) alpha[i] = mask.posterior[i];
    wt[i] = 1;
  }
  // gains are smoothed, as neighboring pixels can be in different classes
  var r = toPixels(CHROMA_RADIUS, pixelSize), mw = boxMean(wt, W, H, r, wt);
  logG.forEach(function(arr) { boxMean(arr, W, H, r, arr); });
  applyRankGains(logG, mw, rg, L, cls, bare, W, H);
  if (mask.small) applySmallShadowGains(logG, mw, alpha, mask.small);
  // the relit values are written over the log gains
  relit = logG;
  for (i = 0; i < N; i++) {
    a = alpha[i];
    for (k = 0; k < 3; k++) {
      g = src[i * bands + k];
      relit[k][i] = a < 0.01 ? g : Math.min(255, g / (1 - a + a / Math.exp(relit[k][i] / mw[i])));
    }
    if (a < 0.01) continue;
    cap = Math.min(imageCap, classes.cap[cls[i]]);
    if (bare[i] > 0) cap = (1 - bare[i]) * cap + bare[i] * imageCap;
    if (mask.small && mask.small.pixels[i]) cap = imageCap;
    y = 0.299 * relit[0][i] + 0.587 * relit[1][i] + 0.114 * relit[2][i];
    if (y > cap && y > L[i]) {
      f = Math.max(L[i], cap) / y;
      for (k = 0; k < 3; k++) relit[k][i] *= f;
    }
  }
  compressContrast(relit, alpha, W, H, toPixels(CONTRAST_RADIUS, pixelSize));
  return {
    samples: writeRelitSamples(src, bands, relit, alpha, edge, valid, W, H, pixelSize),
    gains: gains
  };
}

// Sets the gains (@logG, sums of log gains over @mw pixels) of the shadows
// added by addSmallShadows() to their own, and their @alpha to 1
// @small mask.small (see addSmallShadows())
function applySmallShadowGains(logG, mw, alpha, small) {
  for (var i = 0, j = 0, k; i < alpha.length; i++) {
    if (!small.pixels[i]) continue;
    if (mw[i] > 0) {
      alpha[i] = 1;
      for (k = 0; k < 3; k++) logG[k][i] = Math.log(small.gains[j + k]) * mw[i];
    }
    j += 3;
  }
}

// Returns {edge, gap, litT}: edge is the share of the mask's shadow pixels
//   within EDGE_RADIUS of each pixel; gap is the same with shadow samples
//   (gap > 0.999) and sunlit samples (gap 0, and luma above litT) at least two
//   pixels from the edges
function getMaskSamples(L, valid, mask, W, H, pixelSize) {
  var hard = mask.hard, edgeR = toPixels(EDGE_RADIUS, pixelSize);
  var edge = maskMean(hard, W, H, edgeR);
  // in resampled imagery (e.g. map tiles), pixels next to an edge are partly
  // shadowed
  var gap = edgeR >= 2 ? edge : maskMean(hard, W, H, 2);
  // pixels that may be shadowed are neither sunlit nor shadow samples
  if (mask.uncertain) gap = excludeUncertain(gap, mask.uncertain);
  // shadows the mask has missed, and partly lit pixels, aren't sunlit
  var litT = Math.max(mask.threshold, getLitThreshold(L, valid, gap, mask.near));
  return {edge: edge, gap: gap, litT: litT};
}

// Adds to the mask shadows too small for it (and for the DEM to cast
// reliably), e.g. of ledges a few meters high in imagery of several meters per
// pixel: pixels in the shadows of suns NEAR_SHADOW_ALTITUDE degrees lower
// (@nearShadows; a DEM smoother than the terrain casts shorter shadows, and
// not those of features about its cell size) that are at least half shadowed,
// by their luma, the mean luma of the sunlit pixels within SMALL_SHADOW_REF
// DEM cells and the luma gain of the image's shadows. (Their color doesn't
// tell them: small shadows can be lit by sunlit ground around them, e.g. red
// rock, more than by the sky.) Connected areas of those pixels larger than
// SMALL_SHADOW_CELLS DEM cells are left out, as more likely darker ground.
// With @despeckle, small areas of those pixels outside the lower suns'
// shadows are added too: small shadows the DEM doesn't cast at all are then
// relit, along with small dark trees and water.
// The shadows of the mask that small, with those added, are relit to the
// luma of that sunlit ground, in the color of the sunlit ground nearest them
// (see relightShadows()): they are too small for their own color to be worth
// keeping, and gains for the whole image leave those that are bluer (deeper,
// lit more by the sky) grayish.
// Sets mask.small to {pixels, gains}: pixels is 1 for the pixels of the small
//   shadows and 2 for the pixels around them (0 for others); gains are each
//   of those pixels' gains (three, in order of their indexes)
// Returns the number of pixels added
export function addSmallShadows(mask, image, valid, nearShadows, W, H, pixelSize, demPixelSize, despeckle) {
  var N = W * H, src = image.samples, bands = image.bands, hard = mask.hard;
  var L = getLuma(src, bands, N), samples = getMaskSamples(L, valid, mask, W, H, pixelSize);
  var gains = measureGains(src, bands, L, valid, samples.gap, samples.litT, W, H, pixelSize);
  if (!gains) return 0;
  var g = Math.exp(0.299 * Math.log(gains[0]) + 0.587 * Math.log(gains[1]) + 0.114 * Math.log(gains[2]));
  if (!(g > 1)) return 0;
  var w = new Float32Array(N), ref = [0, 1, 2].map(function() { return new Float32Array(N); });
  var cell = Math.max(demPixelSize, pixelSize) / pixelSize;
  var ratio = new Float32Array(N), r = Math.max(1, Math.round(SMALL_SHADOW_REF * cell)), i, k, n, lr;
  for (i = 0; i < N; i++) {
    if (!valid[i] || hard[i] || !(L[i] > samples.litT)) continue;
    w[i] = 1;
    for (k = 0; k < 3; k++) ref[k][i] = src[i * bands + k];
  }
  boxMean(w, W, H, r, w);
  ref.forEach(function(arr) { boxMean(arr, W, H, r, arr); });
  for (i = 0; i < N; i++) {
    if (!valid[i] || hard[i] || !(despeckle || nearShadows[i]) || !(w[i] > 0.25)) continue;
    lr = (0.299 * ref[0][i] + 0.587 * ref[1][i] + 0.114 * ref[2][i]) / w[i];
    if ((1 - L[i] / lr) / (1 - 1 / g) >= 0.5) ratio[i] = lr / Math.max(1, L[i]);
  }
  var maxSize = SMALL_SHADOW_CELLS * cell * cell, sizes = getAreaSizes(ratio, W, H), nearSizes = sizes;
  var all = new Uint8Array(N), small = new Uint8Array(N), large = new Uint8Array(N);
  if (despeckle) {
    // those in the lower suns' shadows are added as they would be without
    // @despeckle, also where they are part of larger areas
    for (i = 0; i < N; i++) all[i] = ratio[i] > 0 && nearShadows[i] ? 1 : 0;
    nearSizes = getAreaSizes(all, W, H);
  }
  for (i = 0, n = 0; i < N; i++) {
    if (sizes[i] > maxSize && !(nearShadows[i] && nearSizes[i] > 0 && nearSizes[i] <= maxSize)) ratio[i] = 0;
    if (ratio[i] > 0) n++;
    all[i] = hard[i] || ratio[i] > 0 ? 1 : 0;
  }
  // small shadows already in the mask are relit like those added, and the
  // pixels added next to larger ones like those
  sizes = getAreaSizes(all, W, H);
  var pixels = new Uint8Array(N), m = 0, near, edge, edgeR = toPixels(EDGE_RADIUS, pixelSize), j;
  for (i = 0; i < N; i++) {
    if (!all[i]) continue;
    hard[i] = 1;
    lr = (0.299 * ref[0][i] + 0.587 * ref[1][i] + 0.114 * ref[2][i]) / w[i];
    if (sizes[i] > maxSize || !(w[i] > 0.25) || !(lr > L[i])) {
      large[i] = 1;
    } else {
      small[i] = pixels[i] = 1;
      m++;
    }
  }
  mask.count += n;
  if (m === 0) return n;
  // the partly shadowed pixels around them (away from larger shadows); those
  // as light as the ground around them are kept
  near = maskMean(small, W, H, edgeR);
  edge = maskMean(large, W, H, edgeR);
  for (i = 0; i < N; i++) {
    if (all[i] || !(near[i] > 0) || edge[i] > 0 || !valid[i] || !(w[i] > 0.25)) continue;
    pixels[i] = 2;
    m++;
  }
  // their color is that of the nearest sunlit ground, which is more likely
  // the same ground than all the ground within SMALL_SHADOW_REF
  var lit = new Uint8Array(N), color = [0, 0, 0], lc;
  for (i = 0; i < N; i++) lit[i] = valid[i] && !all[i] && pixels[i] != 2 && L[i] > samples.litT ? 1 : 0;
  gains = new Float32Array(m * 3).fill(1);
  for (i = 0, j = 0; i < N; i++) {
    if (!pixels[i]) continue;
    lr = (0.299 * ref[0][i] + 0.587 * ref[1][i] + 0.114 * ref[2][i]) / w[i];
    if (pixels[i] == 1 || lr > L[i]) {
      if (getNearbyColor(src, bands, lit, W, H, i, r, color) > 0) {
        lc = 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2];
      } else {
        for (k = 0; k < 3; k++) color[k] = ref[k][i] / w[i];
        lc = lr;
      }
      for (k = 0; k < 3; k++) gains[j + k] = Math.max(1, color[k] * lr / Math.max(1, lc)) / Math.max(1, src[i * bands + k]);
    }
    j += 3;
  }
  mask.small = {pixels: pixels, gains: gains};
  return n;
}

// The mean color of the @lit pixels in the smallest square around pixel @i
// (radius 2, 4, 8... up to @maxR) with at least SMALL_SHADOW_NEIGHBORS of them
// Returns their number (0 if there are too few within @maxR), and sets @out
function getNearbyColor(src, bands, lit, W, H, i, maxR, out) {
  var x0 = i % W, y0 = Math.floor(i / W), r, x, y, j, n, k;
  for (r = 2; ; r = Math.min(maxR, r * 2)) {
    out[0] = out[1] = out[2] = 0;
    n = 0;
    for (y = Math.max(0, y0 - r); y <= Math.min(H - 1, y0 + r); y++) {
      for (x = Math.max(0, x0 - r); x <= Math.min(W - 1, x0 + r); x++) {
        j = y * W + x;
        if (!lit[j]) continue;
        for (k = 0; k < 3; k++) out[k] += src[j * bands + k];
        n++;
      }
    }
    if (n >= SMALL_SHADOW_NEIGHBORS || r >= maxR) break;
  }
  if (n < SMALL_SHADOW_NEIGHBORS) return 0;
  for (k = 0; k < 3; k++) out[k] /= n;
  return n;
}

// The size (pixels) of the connected area (4-connected) of @mask that each
// pixel is in, or 0
export function getAreaSizes(mask, W, H) {
  var N = W * H, seen = new Uint8Array(N), queue = new Int32Array(N), sizes = new Int32Array(N);
  var i, j, x, head, tail, k;
  for (i = 0; i < N; i++) {
    if (!mask[i] || seen[i]) continue;
    head = tail = 0;
    seen[i] = 1;
    queue[tail++] = i;
    while (head < tail) {
      j = queue[head++];
      x = j % W;
      if (x > 0 && mask[j - 1] && !seen[j - 1]) { seen[j - 1] = 1; queue[tail++] = j - 1; }
      if (x < W - 1 && mask[j + 1] && !seen[j + 1]) { seen[j + 1] = 1; queue[tail++] = j + 1; }
      if (j >= W && mask[j - W] && !seen[j - W]) { seen[j - W] = 1; queue[tail++] = j - W; }
      if (j < N - W && mask[j + W] && !seen[j + W]) { seen[j + W] = 1; queue[tail++] = j + W; }
    }
    for (k = 0; k < tail; k++) sizes[queue[k]] = tail;
  }
  return sizes;
}

// A copy of @gap (share of shadow pixels nearby: 0 for sunlit samples, 1 for
// shadow samples) with @uncertain pixels set between
export function excludeUncertain(gap, uncertain) {
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
function findEdgePairs(valid, hard, edge, gap, near, W, H, maxDist, sun) {
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
// class's (see getLocalGains())
// Returns {cls, lo, cap, tileLog, tileSize, tw, th}: cls is the class of
//   each shadowed or partly shadowed pixel (or -1); lo is the median luma of
//   each class's shadows; cap is the 90th
//   percentile luma of the class's sunlit pixels; tileLog has the log gains
//   of each class in each tile (tw x th tiles of tileSize pixels)
function measureClassGains(src, bands, L, valid, hard, edge, pairs, W, H, gains, pixelSize) {
  var N = W * H, feat = new Float64Array(3), samples = [], ncore = 0;
  var i, j, k, s, p, n, w, g, lv, sv, stride;
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
  var out = {cls: cls, lo: new Float32Array(K), cap: new Float32Array(K)};
  var litL = groupValues(classOf, K, function(p) { return L[pairs.lit[p]]; });
  var shL = groupValues(classOf, K, function(p) { return L[pairs.shadow[p]]; });
  for (s = 0; s < K; s++) {
    n = litL.start[s + 1] - litL.start[s];
    out.lo[s] = n > 0 ? groupMedian(shL, s) : Math.exp(centers[s][2] / CLASS_LUMA_WEIGHT) - 1;
    out.cap[s] = n >= CLASS_CAP_PAIRS ? sortedQuantile(litL.values.subarray(litL.start[s], litL.start[s + 1]), 0.9) : 255;
  }
  var tileSize = Math.max(8, Math.round(CLASS_TILE / pixelSize));
  var tw = Math.ceil(W / tileSize), th = Math.ceil(H / tileSize);
  var classLog = new Float64Array(K * 3);
  for (k = 0; k < K * 3; k++) classLog[k] = Math.log(classGains[k]);
  var tileLog = getLocalGains(src, bands, pairs, classOf, K, W, tileSize, tw, th, classLog, TILE_PRIOR);
  out.tileLog = tileLog;
  out.tileSize = tileSize;
  out.tw = tw;
  out.th = th;
  return out;
}

// Log gains of each class of shadowed ground in each tile, from the @pairs of
// the class (by @classOf) in the tile (ratios of medians), blended with those
// of the tile and the tiles around it (with TILE_PRIOR pairs' weight), which
// are blended with @classLog: gains vary with the ground across the image
// (e.g. shadowed forest is paired with forest in a forest and with gravel
// next to it)
// @tilePrior pairs' weight of a tile's neighborhood
// Returns a Float32Array of K x tw x th x 3 log gains
function getLocalGains(src, bands, pairs, classOf, K, W, tileSize, tw, th, classLog, tilePrior) {
  var nt = tw * th, np = pairs.lit.length, keys = new Int32Array(np);
  var out = new Float32Array(K * nt * 3), p, k, s, t, tx, ty, sx, sy, u, j, m, mn, g, gn, w, lv, sv, nb, base;
  for (p = 0; p < np; p++) {
    keys[p] = classOf[p] < 0 ? -1 : classOf[p] * nt + getTileIndex(pairs.shadow[p], W, tileSize, tw);
  }
  var groups = groupIndexes(keys, K * nt), lit = [], sh = [];
  for (k = 0; k < 3; k++) {
    for (s = 0; s < K; s++) {
      for (t = 0; t < nt; t++) {
        tx = t % tw;
        ty = Math.floor(t / tw);
        lit.length = sh.length = 0;
        for (sy = Math.max(0, ty - 1); sy <= Math.min(th - 1, ty + 1); sy++) {
          for (sx = Math.max(0, tx - 1); sx <= Math.min(tw - 1, tx + 1); sx++) {
            u = s * nt + sy * tw + sx;
            for (j = groups.start[u]; j < groups.start[u + 1]; j++) {
              lit.push(src[pairs.lit[groups.values[j]] * bands + k]);
              sh.push(src[pairs.shadow[groups.values[j]] * bands + k]);
            }
          }
        }
        mn = lit.length;
        gn = mn > 0 ? Math.log(Math.max(1, getMedian(lit) / Math.max(1, getMedian(sh)))) : 0;
        w = mn / (mn + TILE_PRIOR);
        nb = w * gn + (1 - w) * classLog[s * 3 + k];
        base = s * nt + t;
        m = groups.start[base + 1] - groups.start[base];
        if (m > 0) {
          lit.length = sh.length = 0;
          for (j = groups.start[base]; j < groups.start[base + 1]; j++) {
            lit.push(src[pairs.lit[groups.values[j]] * bands + k]);
            sh.push(src[pairs.shadow[groups.values[j]] * bands + k]);
          }
          g = Math.log(Math.max(1, getMedian(lit) / Math.max(1, getMedian(sh))));
        } else {
          g = 0;
        }
        w = m / (m + tilePrior);
        out[base * 3 + k] = w * g + (1 - w) * nb;
      }
    }
  }
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

// Shadow luma of each class of shadowed ground (see measureClassGains()) where
// it isn't vegetation: the median of the class's shadows' cores where @bare
// is at least 0.5, or with fewer than MIN_COLOR_SAMPLES of those, the class's
// lo. (Classes differ in lightness: shadowed snow is several times as light
// as shadowed rock, and would look sunlit next to the lightness of all the
// shadows.)
export function getBareShadowLightness(L, valid, edge, hard, classes, bare) {
  var K = classes.lo.length, cls = classes.cls, out = new Float32Array(K), i, s, groups;
  var key = new Int32Array(L.length).fill(-1);
  for (i = 0; i < L.length; i++) {
    if (valid[i] && hard[i] && edge[i] > 0.999 && bare[i] >= 0.5) key[i] = cls[i];
  }
  groups = groupValues(key, K, function(i) { return L[i]; });
  for (s = 0; s < K; s++) {
    out[s] = groups.start[s + 1] - groups.start[s] >= MIN_COLOR_SAMPLES ? groupMedian(groups, s) : classes.lo[s];
  }
  return out;
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
export function fillEmptyCells(grid, gw, gh, fallback) {
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
  var group = new Int32Array(N).fill(-1), sh, lit, i;
  for (i = 0; i < N; i++) {
    if (valid[i] && hard[i] && edge[i] > 0.999) group[i] = getTileIndex(i, W, tileSize, tw);
  }
  sh = groupIndexes(group, nt);
  group.fill(-1);
  for (i = 0; i < N; i++) {
    if (valid[i] && !hard[i] && gap[i] === 0 && ring[i] > 0 && L[i] > litT) group[i] = getTileIndex(i, W, tileSize, tw);
  }
  lit = groupIndexes(group, nt);
  group = null;
  var out = {centers: new Float32Array(nt * B), logs: new Float32Array(nt * B * 3),
    weights: new Float32Array(nt), litMedians: new Float32Array(nt), tileSize: tileSize, tw: tw, th: th};
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
    return sortByValue(ids, L);
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
    if (m < B * MIN_RANK_SAMPLES) continue;
    s = gather(sh, tx, ty, r);
    l = gather(lit, tx, ty, r);
    out.weights[t] = m / (m + RANK_PRIOR);
    out.litMedians[t] = L[l[Math.floor(nl / 2)]];
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

// Lowers the weights of the rank gains of tiles where the sunlit ground they
// match the shadows with is brighter than the sunlit ground next to the
// shadows (the sunlit pixels of the @pairs, mostly the same ground as the
// shadows): the shadows are then of darker ground than the ground around
// them, which isn't vegetation by its color but can still be of different
// kinds (e.g. forest and gravel, in imagery with little color). The median
// luma of the pairs in each tile and the tiles around it is compared with the
// median of the tile's sunlit samples (log ratio), and the weights are scaled
// by how little brighter those are, with RANK_PAIR_PRIOR pairs of no
// difference.
function weighRankGains(rg, pairs, L, W) {
  var T = rg.tileSize, tw = rg.tw, th = rg.th, nt = tw * th;
  var lit = [], p, i, t, x, y, tx, ty, n, d;
  for (t = 0; t < nt; t++) lit.push([]);
  for (p = 0; p < pairs.lit.length; p++) {
    i = pairs.shadow[p];
    x = Math.floor((i % W) / T);
    y = Math.floor(Math.floor(i / W) / T);
    for (ty = Math.max(0, y - 1); ty <= Math.min(th - 1, y + 1); ty++) {
      for (tx = Math.max(0, x - 1); tx <= Math.min(tw - 1, x + 1); tx++) {
        if (rg.weights[ty * tw + tx] > 0) lit[ty * tw + tx].push(L[pairs.lit[p]]);
      }
    }
  }
  for (t = 0; t < nt; t++) {
    n = lit[t].length;
    if (n === 0) continue;
    d = Math.max(0, Math.log((rg.litMedians[t] + 1) / (getMedian(lit[t]) + 1))) / RANK_PAIR_DIFF;
    rg.weights[t] *= (n * Math.exp(-d * d) + RANK_PAIR_PRIOR) / (n + RANK_PAIR_PRIOR);
  }
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

// @ids in order of their @values (a Float32Array of values >= 0), keeping the
// order of equal values: non-negative floats are in the order of their bits,
// which are sorted with the ids' positions as one number
function sortByValue(ids, values) {
  var n = ids.length, P = 4194304, keys, bits, out, i;
  if (n >= P || !(values instanceof Float32Array)) return ids.sort(function(a, b) { return values[a] - values[b]; });
  bits = new Uint32Array(values.buffer, values.byteOffset, values.length);
  keys = new Float64Array(n);
  for (i = 0; i < n; i++) keys[i] = bits[ids[i]] * P + i;
  keys.sort();
  out = new Int32Array(n);
  for (i = 0; i < n; i++) out[i] = ids[keys[i] % P];
  return out;
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

// Gains of the ground that isn't vegetation, for each class of shadowed
// ground (see measureClassGains()) in each tile, from the @pairs whose sunlit
// pixel isn't vegetation: ground that isn't vegetation by its color can still
// be of different kinds (e.g. gravel and forest in imagery with little
// color). A class's gains are blended with the image's @gains, and a tile's
// with its class's (see getLocalGains()).
// @cls class of each pixel (see measureClassGains()), of @K classes
// Returns {tileLog, tileSize, tw, th}, as from measureClassGains()
function measureBareGains(src, bands, pairs, cls, K, W, H, gains, pixelSize) {
  var tileSize = Math.max(8, Math.round(CLASS_TILE / pixelSize));
  var tw = Math.ceil(W / tileSize), th = Math.ceil(H / tileSize);
  var np = pairs.lit.length, classOf = new Int32Array(np), classLog = new Float64Array(K * 3);
  var p, k, s, m, g, w, lv, sv;
  for (p = 0; p < np; p++) {
    classOf[p] = isVegetation(src, bands, pairs.lit[p]) ? -1 : cls[pairs.shadow[p]];
  }
  for (k = 0; k < 3; k++) {
    lv = groupValues(classOf, K, function(p) { return src[pairs.lit[p] * bands + k]; });
    sv = groupValues(classOf, K, function(p) { return src[pairs.shadow[p] * bands + k]; });
    for (s = 0; s < K; s++) {
      m = lv.start[s + 1] - lv.start[s];
      g = m > 0 ? Math.max(1, groupMedian(lv, s) / Math.max(1, groupMedian(sv, s))) : gains[k];
      w = m / (m + CLASS_PRIOR);
      classLog[s * 3 + k] = w * Math.log(g) + (1 - w) * Math.log(gains[k]);
    }
  }
  return {tileLog: getLocalGains(src, bands, pairs, classOf, K, W, tileSize, tw, th, classLog, BARE_TILE_PRIOR),
    tileSize: tileSize, tw: tw, th: th};
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
  var mY = boxMean(wY, W, H, r, wY), mA = boxMean(alpha, W, H, r);
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
function writeRelitSamples(src, bands, relit, alpha, edge, valid, W, H, pixelSize) {
  var N = W * H, r = toPixels(CHROMA_RADIUS, pixelSize), out = src.slice();
  var Y = new Float32Array(N), wsum = boxMean(alpha, W, H, r), t = new Float32Array(N);
  var blurred = new Float32Array(N), i, k, a, c, v;
  for (i = 0; i < N; i++) Y[i] = 0.299 * relit[0][i] + 0.587 * relit[1][i] + 0.114 * relit[2][i];
  for (k = 0; k < 3; k++) {
    for (i = 0; i < N; i++) t[i] = alpha[i] * relit[k][i] / (Y[i] + 1);
    boxMean(t, W, H, r, t);
    for (i = 0; i < N; i++) {
      a = alpha[i];
      c = wsum[i] > 0.01 ? Math.min(255, (Y[i] + 1) * t[i] / wsum[i]) : relit[k][i];
      t[i] = relit[k][i] * (1 - a) + c * a;
    }
    boxMean(t, W, H, toPixels(EDGE_BLUR_RADIUS, pixelSize), blurred);
    for (i = 0; i < N; i++) {
      if (!valid[i]) continue;
      v = edge[i] > 0 && edge[i] < 1 ? blurred[i] : t[i];
      if (alpha[i] > 0 || v != src[i * bands + k]) out[i * bands + k] = Math.round(v);
    }
  }
  return out;
}

// boxMean() of a mask's values
function maskMean(mask, W, H, r) {
  var out = Float32Array.from(mask);
  return boxMean(out, W, H, r, out);
}

// Pixels for measuring c: 0 for those at least @margin pixels inside shadows,
// 1 for those at least @margin pixels outside them and lit within FLAT_RANGE
// of flat ground, -1 for others
function getRatioGroups(valid, I, flat, W, H, margin) {
  var N = W * H, inShadow = new Float32Array(N), group = new Int8Array(N).fill(-1), near, i, a;
  for (i = 0; i < N; i++) inShadow[i] = I[i] === 0 ? 1 : 0;
  near = boxMean(inShadow, W, H, margin, inShadow);
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
  var logL = getClassLogRatios(litRatios, labels, W, H, r), logC, i, d, p, k;
  for (i = 0; i < N; i++) {
    p = pixelI[i];
    d = Math.max(p, direct[i] > 0 ? direct[i] : LIT_FLOOR * flat[i]);
    litI[i] = d;
    share[i] = d > 0 ? 1 - p / d : 1;
  }
  k = getLightingResponse(lin, valid, litI, share, flat, logL, W, H, pixelSize);
  logC = litRatios == ratios ? logL : getClassLogRatios(ratios, labels, W, H, r);
  // each band's gains are written over its log c
  return [0, 1, 2].map(function(b) {
    var out = logC[b], c, cl, s, g, R;
    for (i = 0; i < N; i++) {
      p = pixelI[i];
      if (!valid[i] || p !== p) {
        out[i] = NaN;
        continue;
      }
      c = Math.exp(logC[b][i]);
      cl = Math.exp(logL[b][i]);
      s = share[i];
      R = Math.pow((litI[i] + cl) / (flat[i] + cl), k[i]);
      g = 1 / ((1 - s) * R + s * c / (flat[i] + c));
      out[i] = g < MAX_GAIN ? g : MAX_GAIN;
    }
    return out;
  });
}

// Log of each band of the c of each pixel's class, blended over @r pixels
function getClassLogRatios(ratios, labels, W, H, r) {
  return [0, 1, 2].map(function(b) {
    var out = new Float32Array(W * H);
    for (var i = 0; i < out.length; i++) out[i] = Math.log(ratios[labels[i]][b]);
    return boxMean(out, W, H, r, out);
  });
}

// Share k of the DEM's lighting of sunlit ground that the image shows, around
// each pixel (within RESPONSE_RADIUS): the slope of the log luma of sunlit
// pixels against the log of their predicted lighting, R = (I + c) / (flat +
// c), both averaged over RESPONSE_SMOOTHING (a DEM's finest slopes, e.g. of
// the ground under forest, aren't the image's, and would pull the slope
// toward 0), blended with 1 (the DEM's lighting, where it varies too little to
// measure) by the variance (robust) of the log luma of sunlit ground with
// little variation in R (k is 1 everywhere with too little such ground to
// measure it); between 0 and 1. Where the DEM's slopes don't match the
// image's (e.g. at the rims of cliffs, which it smoothes and may misplace),
// sunlit ground isn't lit the way the DEM has it.
// @I, @share I of each pixel if it were sunlit, and its share of shadow
// @logL log c of sunlit ground of each pixel, for each band
function getLightingResponse(lin, valid, I, share, flat, logL, W, H, pixelSize) {
  var N = W * H, r = toPixels(RESPONSE_RADIUS, pixelSize), rs = toPixels(RESPONSE_SMOOTHING, pixelSize);
  var w = new Float32Array(N), x = new Float32Array(N), y = new Float32Array(N), xx, xy, sw, sx, sy;
  var n = (2 * r + 1) * (2 * r + 1) / ((2 * rs + 1) * (2 * rs + 1));
  var cy = new Float32Array(N), flatY = [], sigma2, lambda, i, b, m, mw, mx, my, cov, vx, k;
  for (i = 0; i < N; i++) {
    for (b = 0, cy[i] = 0; b < 3; b++) cy[i] += LUMA_WEIGHTS[b] * Math.exp(logL[b][i]);
  }
  for (i = 0; i < N; i++) {
    if (!valid[i] || !(share[i] < 0.01) || !(I[i] > 0)) continue;
    w[i] = 1;
    x[i] = Math.log((I[i] + cy[i]) / (flat[i] + cy[i]));
    y[i] = Math.log(getLinearLuma(lin, i) + 1e-4);
  }
  cy = null;
  sw = boxMean(w, W, H, rs);
  sx = boxMean(x, W, H, rs, x);
  sy = boxMean(y, W, H, rs, y);
  for (i = 0; i < N; i++) {
    w[i] = w[i] && sw[i] > 0.5 ? 1 : 0;
    x[i] = w[i] ? sx[i] / sw[i] : 0;
    y[i] = w[i] ? sy[i] / sw[i] : 0;
    if (w[i] && Math.abs(x[i]) < 0.05 && i % 7 === 0) flatY.push(y[i]);
  }
  sw = sx = sy = null;
  if (flatY.length < 100) return w.fill(1);
  m = getMedian(flatY);
  sigma2 = Math.pow(1.4826 * getMedian(flatY.map(function(v) { return Math.abs(v - m); })), 2);
  xx = new Float32Array(N);
  xy = new Float32Array(N);
  for (i = 0; i < N; i++) {
    xx[i] = x[i] * x[i];
    xy[i] = x[i] * y[i];
  }
  mw = boxMean(w, W, H, r, w);
  mx = boxMean(x, W, H, r, x);
  my = boxMean(y, W, H, r, y);
  xx = boxMean(xx, W, H, r, xx);
  xy = boxMean(xy, W, H, r, xy);
  // k is written over xx
  k = xx;
  for (i = 0; i < N; i++) {
    if (!(mw[i] > 0)) {
      k[i] = 1;
      continue;
    }
    // the means of weighted pixels in the window
    vx = xx[i] / mw[i] - Math.pow(mx[i] / mw[i], 2);
    cov = xy[i] / mw[i] - mx[i] / mw[i] * my[i] / mw[i];
    lambda = sigma2 / (mw[i] * n);
    k[i] = Math.max(0, Math.min(1, (cov + lambda) / (vx + lambda)));
  }
  return k;
}

function writeCorrectedSamples(image, lin, gains, valid) {
  var src = image.samples, bands = image.bands, N = image.width * image.height;
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
      v = applyGain(lin.decode[src[i * bands + b]], g);
      out[i * bands + b] = v >= 1 ? 255 : encode[Math.round(Math.sqrt(v) * scale)];
    }
  }
  return out;
}

// A linear value @v brightened by gain @g (unchanged if @g is NaN)
function applyGain(v, g) {
  return g === g ? v * g : v;
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

// Linear values of an image's 8-bit samples, read through a table (band b of
// pixel i is decode[samples[i * bands + b]]) rather than kept in arrays of
// their own
function getLinearImage(image) {
  return {samples: image.samples, bands: image.bands, decode: getDecodeTable()};
}

function getLinearLuma(lin, i) {
  var s = lin.samples, d = lin.decode, j = i * lin.bands;
  return 0.2126 * d[s[j]] + 0.7152 * d[s[j + 1]] + 0.0722 * d[s[j + 2]];
}

function getLinearLumas(lin, N) {
  var Y = new Float32Array(N);
  for (var i = 0; i < N; i++) Y[i] = getLinearLuma(lin, i);
  return Y;
}

// Pixels that are transparent, nodata in all three colors, or black (e.g. a
// collar without nodata) are left out: black has no brightness to measure,
// and can't be brightened
function getValidPixels(image) {
  var n = image.width * image.height, valid = new Uint8Array(n), s = image.samples, nb = image.bands;
  var nodata = image.nodata == null ? 0 : image.nodata, i, j;
  for (i = 0, j = 0; i < n; i++, j += nb) {
    if (nb == 4 && s[j + 3] === 0) continue;
    if (s[j] === s[j + 1] && s[j] === s[j + 2] && (s[j] === 0 || s[j] === nodata)) continue;
    valid[i] = 1;
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
// @balanced see getAgreementThreshold()
// @imageShadows optional 'on' to use the mask whatever its size (see
//   MAX_MASK_RATIO), or 'off' to use the DEM's shadows
// @despeckle see addSmallShadows()
// Returns {shadow, masked, count, ratio, mask, sun}: masked is true if the
//   shadows are from the mask (see getShadowMask()), cast by @sun; ratio is
//   the mask's size over the DEM's shadows'
function getPixelShadows(image, nir, valid, predicted, nearShadows, cells, terrain, region, regions,
    W, H, pixelSize, demPixelSize, progress, balanced, imageShadows, despeckle) {
  var N = W * H, L = getLuma(image.samples, image.bands, N);
  var band = Math.max(MIN_BAND, demPixelSize * BAND_DEM_PIXELS);
  var shadow = new Float32Array(N), stretch = 1, mask, n, i, maskSun, dark, lowered;
  for (i = 0, n = 0; i < N; i++) if (predicted[i] && valid[i]) n++;
  if (imageShadows == 'off') {
    for (i = 0; i < N; i++) shadow[i] = predicted[i];
    progress(PROGRESS.mask);
    return {shadow: shadow, masked: false, count: n, ratio: 0};
  }
  if (regions.suns.length == 1 && n > 0) {
    dark = thresholdPixels(L, valid, getShadowMidpoint(L, valid, predicted));
    maskSun = lowerSunAltitude(terrain.Z, getCellMeans(dark, W, H, terrain, valid),
      terrain.width, terrain.height, terrain.cellWidth, terrain.cellHeight, region, regions.suns[0]);
    lowered = getPixelValues(castTerrainShadow(terrain.Z, terrain.width, terrain.height,
      terrain.cellWidth, terrain.cellHeight, maskSun, region), cells, Uint8Array);
    stretch = Math.tan(regions.suns[0].altitude) / Math.tan(maskSun.altitude);
  }
  mask = n > 0 ? getShadowMask(L, nir, valid, lowered || predicted, W, H, pixelSize, band, predicted,
    balanced) : null;
  progress(PROGRESS.mask);
  if (mask && mask.count > 0 && (imageShadows == 'on' || mask.count <= n * MAX_MASK_RATIO * stretch)) {
    addDemShadows(mask, predicted, valid, W, H);
    addSignatureShadows(mask, image, valid, predicted, cells, terrain, region, regions.suns, W, H,
      band / pixelSize, progress);
    addSmallShadows(mask, image, valid, nearShadows, W, H, pixelSize, demPixelSize, despeckle);
    for (i = 0; i < N; i++) shadow[i] = mask.hard[i];
    return {shadow: shadow, masked: true, count: mask.count, ratio: mask.count / n, mask: mask,
      sun: maskSun || regions.suns[0]};
  }
  for (i = 0; i < N; i++) shadow[i] = predicted[i];
  return {shadow: shadow, masked: false, count: n, ratio: mask ? mask.count / Math.max(1, n) : 0};
}

// Adds shadows that the DEM's shadows at the fitted sun don't explain (e.g. in
// parts of an image taken at a lower sun), from how shadows look in the
// image. Each pixel's log luma and log blue/red and green/red ratios are
// scored by mixtures of Gaussians fitted to shadows where the mask and the
// DEM agree and to ground that no plausible sun shadows (see
// getPlausibleShadows()). Connected areas of pixels that are more likely
// shadow than sunlit, and that a plausible sun shadows, are added if their
// mean log likelihood ratio is at least SIGNATURE_LLR (a pixel's color alone
// is weak evidence, especially at edges and in small shadows) and a single
// plausible sun explains them (see matchAreaSuns()). Nothing is added unless
// the sunlit samples are at least MIN_SUNLIT_SHARE of the image: in steep
// terrain, where a plausible sun shadows most of the ground, they leave out
// kinds of sunlit ground (e.g. forest on slopes facing away from the sun),
// which can then look like shadow.
// @bandPx distance (pixels) around the DEM's shadows that the mask searches
// @progress optional function receiving the share done of the stages after
//   the sun's fit (see PROGRESS)
// Returns the number of pixels added
export function addSignatureShadows(mask, image, valid, predicted, cells, terrain, region, suns, W, H, bandPx,
    progress) {
  var N = W * H, hard = mask.hard, d = 3, shadows = getShadowCache(terrain, region);
  var plausible = getPixelValues(getPlausibleShadows(terrain, region, suns, shadows), cells, Uint8Array);
  if (progress) progress(PROGRESS.casts);
  var agreed = new Float32Array(N), pred = new Float32Array(N), inMask = new Float32Array(N);
  var shadowIdx = [], litIdx = [], nValid = 0, added = 0, core, near, nearMask, features, F, S, L, llr, cand;
  var areas, i;
  for (i = 0; i < N; i++) {
    agreed[i] = hard[i] && predicted[i] && !(mask.dem && mask.dem[i]) ? 1 : 0;
    pred[i] = predicted[i] ? 1 : 0;
    inMask[i] = hard[i] ? 1 : 0;
  }
  core = boxMean(agreed, W, H, 1, agreed);
  near = boxMean(pred, W, H, Math.max(1, Math.round(bandPx)), pred);
  nearMask = boxMean(inMask, W, H, 2, inMask);
  for (i = 0; i < N; i++) {
    if (!valid[i]) continue;
    nValid++;
    if (core[i] > 0.999) shadowIdx.push(i);
    else if (near[i] === 0 && nearMask[i] === 0 && !plausible[i]) litIdx.push(i);
  }
  core = near = nearMask = null;
  if (shadowIdx.length < MIN_SIGNATURE_PIXELS || litIdx.length < MIN_SIGNATURE_PIXELS ||
      litIdx.length < nValid * MIN_SUNLIT_SHARE) return 0;
  features = getSignatureFeatures(image, [shadowIdx, litIdx]);
  S = fitSignature(features, shadowIdx, SHADOW_COMPONENTS);
  L = fitSignature(features, litIdx, LIT_COMPONENTS);
  if (S.length === 0 || L.length === 0) return 0;
  S = getMixtureScorer(S, d);
  L = getMixtureScorer(L, d);
  llr = new Float32Array(N);
  cand = new Uint8Array(N);
  // a pixel's features are from its color
  var src = image.samples, bands = image.bands, byColor = new Map(), key, v;
  F = new Float32Array(d);
  for (i = 0; i < N; i++) {
    if (!valid[i] || hard[i] || !plausible[i]) continue;
    key = src[i * bands] << 16 | src[i * bands + 1] << 8 | src[i * bands + 2];
    v = byColor.get(key);
    if (v === undefined) {
      features(i, F, 0);
      v = S(F, 0) - L(F, 0);
      byColor.set(key, v);
    }
    llr[i] = v;
    if (llr[i] > 0) cand[i] = 1;
  }
  areas = getCandidateAreas(cand, llr, W, H);
  matchAreaSuns(areas, hard, cells, terrain, region, suns, W, H,
    Math.max(1, Math.round(bandPx * SHADOW_REFERENCE)), shadows);
  areas.forEach(function(a) {
    if (!a.explained) return;
    for (var k = 0; k < a.pixels.length; k++) hard[a.pixels[k]] = 1;
    added += a.pixels.length;
  });
  return added;
}

// 8-connected areas of @cand whose mean @llr is at least SIGNATURE_LLR
// Returns [{pixels, x0, y0, x1, y1}]
function getCandidateAreas(cand, llr, W, H) {
  var N = W * H, seen = new Uint8Array(N), queue = new Int32Array(N), areas = [];
  var i, j, k, n, x, y, dx, dy, X, Y, sum, x0, y0, x1, y1;
  for (i = 0; i < N; i++) {
    if (!cand[i] || seen[i]) continue;
    seen[i] = 1;
    queue[0] = i;
    x0 = y0 = Infinity;
    x1 = y1 = -1;
    for (n = 1, k = 0, sum = 0; k < n; k++) {
      j = queue[k];
      sum += llr[j];
      x = j % W;
      y = (j - x) / W;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (dy = -1; dy <= 1; dy++) {
        for (dx = -1; dx <= 1; dx++) {
          X = x + dx;
          Y = y + dy;
          if (X < 0 || Y < 0 || X >= W || Y >= H || !cand[Y * W + X] || seen[Y * W + X]) continue;
          seen[Y * W + X] = 1;
          queue[n++] = Y * W + X;
        }
      }
    }
    if (sum / n >= SIGNATURE_LLR) {
      areas.push({pixels: queue.slice(0, n), x0: x0, y0: y0, x1: x1 + 1, y1: y1 + 1});
    }
  }
  return areas;
}

// Sets each area's explained to true if a single plausible sun (see
// getPlausibleShadows()) explains it: if the smaller of the share of the area
// in that sun's shadows and the share of that sun's shadows around the area
// (within @margin pixels) that are in the area or in @mask is at least
// AREA_SUN_MATCH; a sun that shadows dark ground (e.g. a lake in a deep
// valley) also shadows the ground around it, which isn't. Other candidate
// areas don't count, or dark ground that's all around (e.g. forest) would
// explain itself.
// @shadows see getShadowCache()
function matchAreaSuns(areas, mask, cells, terrain, region, suns, W, H, margin, shadows) {
  var w = terrain.width, h = terrain.height, deg = Math.PI / 180;
  var shade = new Uint8Array(w * h), areaId = new Int32Array(W * H).fill(-1);
  var left = areas.length;
  areas.forEach(function(a, id) {
    a.explained = false;
    for (var k = 0; k < a.pixels.length; k++) areaId[a.pixels[k]] = id;
  });
  if (areas.length === 0) return;
  // the cells of the areas and around them
  var used = new Uint8Array(w * h), list = [];
  areas.forEach(function(a) {
    var x, y, c;
    for (y = Math.max(0, a.y0 - margin); y < Math.min(H, a.y1 + margin); y++) {
      for (x = Math.max(0, a.x0 - margin); x < Math.min(W, a.x1 + margin); x++) {
        c = cells[y * W + x];
        if (!used[c]) list.push(c);
        used[c] = 1;
      }
    }
  });
  used = Int32Array.from(list);
  list = null;
  suns.forEach(function(s) {
    var da, drop, az, alt, S, j, c;
    for (da = -PLAUSIBLE_AZIMUTH; da <= PLAUSIBLE_AZIMUTH; da += PLAUSIBLE_STEP) {
      for (drop = 0; drop <= PLAUSIBLE_DROP && left > 0; drop += PLAUSIBLE_STEP / 2) {
        az = s.azimuth + da * deg;
        alt = Math.max(MIN_ALTITUDE * deg, s.altitude - drop * deg);
        S = shadows.get(az, alt, used);
        for (j = 0; j < used.length; j++) {
          c = used[j];
          shade[c] = S[c];
        }
        areas.forEach(function(a, id) {
          var inside = 0, n = 0, dark = 0, k, x, y, i;
          if (a.explained) return;
          for (k = 0; k < a.pixels.length; k++) inside += shade[cells[a.pixels[k]]];
          if (inside / a.pixels.length < AREA_SUN_MATCH) return;
          for (y = Math.max(0, a.y0 - margin); y < Math.min(H, a.y1 + margin); y++) {
            for (x = Math.max(0, a.x0 - margin); x < Math.min(W, a.x1 + margin); x++) {
              i = y * W + x;
              if (!shade[cells[i]]) continue;
              n++;
              if (mask[i] || areaId[i] === id) dark++;
            }
          }
          if (n > 0 && dark / n >= AREA_SUN_MATCH) {
            a.explained = true;
            left--;
          }
        });
      }
    }
  });
}

// Shadows of @terrain's cells (cast, or facing away) at suns, kept for suns
// asked for again
// get(azimuth, altitude, cells) returns a Uint8Array with 1 for shadowed
//   cells, of all cells, or (optional) of only those in @cells
function getShadowCache(terrain, region) {
  var w = terrain.width, h = terrain.height, nrm = getNormals(terrain.Z, w, h, terrain.cellWidth, terrain.cellHeight);
  var kept = {};
  return {get: function(az, alt, cells) {
    var key = az + ',' + alt, out = kept[key], P, vx, vy, vz, j, c, n;
    if (out) return out;
    P = castTerrainShadow(terrain.Z, w, h, terrain.cellWidth, terrain.cellHeight, {azimuth: az, altitude: alt}, region);
    vx = Math.sin(az) * Math.cos(alt);
    vy = Math.cos(az) * Math.cos(alt);
    vz = Math.sin(alt);
    n = cells ? cells.length : P.length;
    for (j = 0; j < n; j++) {
      c = cells ? cells[j] : j;
      P[c] = P[c] || nrm.x[c] * vx + nrm.y[c] * vy + nrm.z[c] * vz <= 0 ? 1 : 0;
    }
    if (!cells) kept[key] = P;
    return P;
  }};
}

// Terrain cells that a plausible sun shadows (cast shadow, or facing away):
// one whose azimuth is within PLAUSIBLE_AZIMUTH degrees of one of @suns', and
// whose altitude is up to PLAUSIBLE_DROP degrees lower (at the same azimuth,
// a higher sun shadows only part of what a lower one does)
export function getPlausibleShadows(terrain, region, suns, shadows) {
  var deg = Math.PI / 180, out = new Uint8Array(terrain.width * terrain.height);
  shadows = shadows || getShadowCache(terrain, region);
  suns.forEach(function(s) {
    var alt = Math.max(MIN_ALTITUDE * deg, s.altitude - PLAUSIBLE_DROP * deg), da, P, i;
    for (da = -PLAUSIBLE_AZIMUTH; da <= PLAUSIBLE_AZIMUTH; da += PLAUSIBLE_STEP) {
      P = shadows.get(s.azimuth + da * deg, alt);
      for (i = 0; i < out.length; i++) if (P[i]) out[i] = 1;
    }
  });
  return out;
}

// Log luma, log blue/red and log green/red of a pixel (linear values),
// standardized over the pixels in @sets (arrays of pixel ids); d = 3 values
// Returns a function of (i, out, row) that writes pixel i's values to row
//   @row of Float32Array @out
function getSignatureFeatures(image, sets) {
  var src = image.samples, bands = image.bands, decode = getDecodeTable();
  var mean = [0, 0, 0], sq = [0, 0, 0], sd = [0, 0, 0], f = new Float32Array(3), n = 0, k, v;
  function write(i, out, o) {
    var j = i * bands, r = decode[src[j]] + SIGNATURE_EPSILON;
    var g = decode[src[j + 1]] + SIGNATURE_EPSILON, b = decode[src[j + 2]] + SIGNATURE_EPSILON;
    out[o] = Math.log(0.2126 * r + 0.7152 * g + 0.0722 * b);
    out[o + 1] = Math.log(b / r);
    out[o + 2] = Math.log(g / r);
  }
  sets.forEach(function(idx) {
    for (var i = 0; i < idx.length; i++) {
      write(idx[i], f, 0);
      for (k = 0; k < 3; k++) {
        v = f[k];
        mean[k] += v;
        sq[k] += v * v;
      }
    }
    n += idx.length;
  });
  for (k = 0; k < 3; k++) {
    mean[k] /= n;
    sd[k] = Math.sqrt(Math.max(1e-12, sq[k] / n - mean[k] * mean[k]));
  }
  return function(i, out, row) {
    var o = row * 3;
    write(i, out, o);
    for (var k = 0; k < 3; k++) out[o + k] = (out[o + k] - mean[k]) / sd[k];
  };
}

// fitGaussianMixture() of the features (see getSignatureFeatures()) of the
// pixels in @idx, computed for the pixels it samples
function fitSignature(features, idx, K) {
  var ids = getMixtureSample(idx), X = new Float32Array(ids.length * 3), rows = new Int32Array(ids.length);
  for (var j = 0; j < ids.length; j++) {
    features(ids[j], X, j);
    rows[j] = j;
  }
  return fitGaussianMixture(X, 3, rows, K);
}

// Up to SIGNATURE_SAMPLES of @idx, evenly spaced
function getMixtureSample(idx) {
  var n = Math.min(idx.length, SIGNATURE_SAMPLES), step = idx.length / n, out = new Int32Array(n);
  for (var j = 0; j < n; j++) out[j] = idx[Math.floor(j * step)];
  return out;
}

// Gaussian mixture from k-means clusters of up to SIGNATURE_SAMPLES of the
// rows of @X (@d values each) in @idx (deterministic)
// Returns [{mean, chol, c}]: chol is the Cholesky factor of the covariance;
//   c is the log of the weight and normalizing constant
export function fitGaussianMixture(X, d, idx, K) {
  var S = getMixtureSample(idx), n = S.length, seed = 1;
  var centers = [], asg = new Int32Array(n), dist = new Float64Array(n);
  var j, c, k, a, b, i, best, bestD, v, total, r, sums, counts, out = [];
  function rand() {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  }
  function dist2(i, m) {
    for (var k = 0, s = 0, t; k < d; k++) {
      t = X[i * d + k] - m[k];
      s += t * t;
    }
    return s;
  }
  centers.push(Array.from(X.subarray(S[0] * d, S[0] * d + d)));
  dist.fill(Infinity);
  while (centers.length < Math.min(K, n)) {
    for (j = 0, total = 0; j < n; j++) {
      dist[j] = Math.min(dist[j], dist2(S[j], centers[centers.length - 1]));
      total += dist[j];
    }
    for (j = 0, r = rand() * total; j < n - 1 && r > dist[j]; j++) r -= dist[j];
    centers.push(Array.from(X.subarray(S[j] * d, S[j] * d + d)));
  }
  K = centers.length;
  for (i = 0; i < KMEANS_ROUNDS; i++) {
    sums = new Float64Array(K * d);
    counts = new Float64Array(K);
    for (j = 0; j < n; j++) {
      for (c = 0, best = 0, bestD = Infinity; c < K; c++) {
        v = dist2(S[j], centers[c]);
        if (v < bestD) {
          bestD = v;
          best = c;
        }
      }
      asg[j] = best;
      counts[best]++;
      for (k = 0; k < d; k++) sums[best * d + k] += X[S[j] * d + k];
    }
    for (c = 0; c < K; c++) {
      if (counts[c] > 0) for (k = 0; k < d; k++) centers[c][k] = sums[c * d + k] / counts[c];
    }
  }
  for (c = 0; c < K; c++) {
    var cov = new Float64Array(d * d), m = centers[c], L, logdet, cnt = 0, s;
    for (j = 0; j < n; j++) {
      if (asg[j] != c) continue;
      cnt++;
      for (a = 0; a < d; a++) {
        for (b = 0; b <= a; b++) cov[a * d + b] += (X[S[j] * d + a] - m[a]) * (X[S[j] * d + b] - m[b]);
      }
    }
    if (cnt < 2 * d + 2) continue;
    L = new Float64Array(d * d);
    for (a = 0, logdet = 0; a < d; a++) {
      for (b = 0; b <= a; b++) {
        s = cov[a * d + b] / cnt + (a == b ? MIXTURE_VARIANCE : 0);
        for (k = 0; k < b; k++) s -= L[a * d + k] * L[b * d + k];
        L[a * d + b] = a == b ? Math.sqrt(s) : s / L[b * d + b];
      }
      logdet += 2 * Math.log(L[a * d + a]);
    }
    out.push({mean: m, chol: L, c: Math.log(cnt / n) - 0.5 * (d * Math.log(2 * Math.PI) + logdet)});
  }
  return out;
}

// Returns a function of (@X, i) giving the log density of row i of @X (@d
// values each) under @mixture (see fitGaussianMixture())
export function getMixtureScorer(mixture, d) {
  var lp = new Float64Array(mixture.length), z = new Float64Array(d);
  return function(X, i) {
    var max = -Infinity, sum = 0, g, a, k, s, q, m;
    for (m = 0; m < mixture.length; m++) {
      g = mixture[m];
      for (a = 0, q = 0; a < d; a++) {
        s = X[i * d + a] - g.mean[a];
        for (k = 0; k < a; k++) s -= g.chol[a * d + k] * z[k];
        z[a] = s / g.chol[a * d + a];
        q += z[a] * z[a];
      }
      lp[m] = g.c - 0.5 * q;
      if (lp[m] > max) max = lp[m];
    }
    for (m = 0; m < mixture.length; m++) sum += Math.exp(lp[m] - max);
    return max + Math.log(sum);
  };
}

// Adds the DEM's shadows to the mask, except near their edges, which may be a
// few pixels off: shadowed ground that's bright when lit (e.g. snow) can be
// brighter than the mask's threshold. The edges are taken to be as wide as
// the depth inside the DEM's shadows at which the mask's share of them stops
// rising (comes within DEM_EDGE_AGREEMENT of the share deeper inside), and
// the shadows are added only if most of them deeper inside are in the mask.
// Sets mask.dem to 1 for the added pixels, and mask.uncertain to 1 for those
// near the edges that aren't in the mask (they're often shadowed)
export function addDemShadows(mask, predicted, valid, W, H) {
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
      if (n > 0 && sum / n < 0.5) break;
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
// @fitted optional: 1 for pixels in the DEM's shadows at the fitted sun, if
//   @predicted are at a lower sun
// @balanced optional, see getAgreementThreshold()
// Returns {hard, near, threshold, count, posterior}: hard is 1 for shadow
//   pixels; near is 1 for pixels near the DEM's shadows; posterior is the
//   probability that each of those is shadowed (see getDarkPixels())
export function getShadowMask(L, nir, valid, predicted, W, H, pixelSize, band, fitted, balanced) {
  var N = W * H, i;
  var px = getDarkPixels(L, nir, valid, predicted, fitted || predicted, W, H, pixelSize, band, balanced);
  var inc = px.near, T = px.threshold, dark = px.dark, darkBoth = px.darkBoth;
  var r = Math.round(MAJORITY_RADIUS / pixelSize);
  var maj = r > 0 ? boxMean(dark, W, H, r) : dark;
  var majBoth = darkBoth == dark ? maj : r > 0 ? boxMean(darkBoth, W, H, r) : darkBoth;
  var hard = new Uint8Array(N);
  var regionR = toPixels(REGION_RADIUS, pixelSize);
  // in coarse imagery a window of whole pixels is wider than REGION_RADIUS
  // (3 pixels of 8m, for 1.2 pixels), and would leave out shadows a few
  // pixels wide: it needs the share of itself that the window would have
  var regionShare = REGION_SHARE * Math.min(1, (2 * REGION_RADIUS / pixelSize + 1) / (2 * regionR + 1));
  var share, region, dist, grow, count = 0;
  region = new Uint8Array(N);
  for (i = 0; i < N; i++) majBoth[i] = majBoth[i] > 0.5 ? 1 : 0;
  share = boxMean(majBoth, W, H, regionR);
  for (i = 0; i < N; i++) region[i] = share[i] > regionShare ? 1 : 0;
  share = majBoth = darkBoth = null;
  dist = chamferDistance(region, W, H);
  // the window test pulls a straight edge in by about this many pixels
  grow = Math.max(0, Math.ceil(regionR * (2 * regionShare - 1))) + 1;
  for (i = 0; i < N; i++) hard[i] = maj[i] > 0.5 && dist[i] <= grow * 3 ? 1 : 0;
  dist = maj = null;
  removeUnmatchedAreas(hard, predicted, W, H, SMALL_AREA / (pixelSize * pixelSize));
  for (i = 0; i < N; i++) count += hard[i];
  return {hard: hard, near: inc, threshold: T, count: count, posterior: px.posterior};
}

// Pixels near the DEM's shadows that are more likely shadowed than sunlit,
// by their luma (see getDarkLikelihoods()) and the share of shadow in their
// zone: in the DEM's shadows at the fitted sun (@fitted), only in those at
// the lower sun (@predicted), and near those. The shares are fitted to the
// pixels of each zone (expectation-maximization), so that where luma tells
// shadow from sunlit ground (e.g. rock) the mask follows the image, and where
// it doesn't (e.g. forest, in coarse imagery) it follows the DEM. Dark pixels
// are also darker than the luma that best reproduces the DEM's shadows
// (see getAgreementThreshold()): shadows lit by light reflected from sunlit
// ground around them (e.g. snow) aren't relit like shadows lit by the sky.
// Returns {near, threshold, dark, darkBoth, posterior}: near is 1 for valid
//   pixels near the DEM's shadows; threshold is that luma; dark is 1 for dark
//   pixels; darkBoth for those also dark in near-infrared (or dark, without
//   it); posterior is the probability that each pixel near the DEM's shadows
//   is shadowed, by its luma and zone (NaN for other pixels)
function getDarkPixels(L, nir, valid, predicted, fitted, W, H, pixelSize, band, balanced) {
  var N = W * H, bandPx = toPixels(band, pixelSize), i;
  var near = maskMean(predicted, W, H, bandPx);
  var inc = new Uint8Array(N), zone = new Int8Array(N).fill(-1);
  for (i = 0; i < N; i++) {
    inc[i] = valid[i] && near[i] > 0.01 ? 1 : 0;
    if (inc[i]) zone[i] = fitted[i] ? 0 : predicted[i] ? 1 : 2;
  }
  var llr = getDarkLikelihoods(L, valid, fitted, near, W, H, pixelSize, bandPx);
  near = null;
  var share = [0.5, 0.5, 0.5], odds = [], sum, z, k, j, f, post, dark = new Float32Array(N);
  // each zone's pixels' likelihood ratios, as 1 / ratio
  for (z = 0; z < 3; z++) odds.push([]);
  for (i = 0; i < N; i++) if (zone[i] >= 0) odds[zone[i]].push(Math.exp(-llr[i]));
  odds = odds.map(function(arr) { return Float64Array.from(arr); });
  for (k = 0; k < DARK_ROUNDS; k++) {
    for (z = 0; z < 3; z++) {
      f = (1 - share[z]) / share[z];
      for (j = 0, sum = 0; j < odds[z].length; j++) sum += 1 / (1 + odds[z][j] * f);
      share[z] = odds[z].length > 0 ? Math.max(MIN_DARK_SHARE, Math.min(1 - MIN_DARK_SHARE, sum / odds[z].length)) : 0.5;
    }
  }
  var T = getAgreementThreshold(L, predicted, inc, balanced);
  var posterior = new Float32Array(N).fill(NaN);
  for (i = 0; i < N; i++) {
    z = zone[i];
    if (z < 0) continue;
    post = llr[i] + logit(share[z]);
    dark[i] = post > 0 && L[i] < T ? 1 : 0;
    posterior[i] = 1 / (1 + Math.exp(-post));
  }
  return {near: inc, threshold: T, dark: dark, posterior: posterior,
    darkBoth: nir ? getNirDark(dark, nir, predicted) : dark};
}

function logit(p) {
  return Math.log(p / (1 - p));
}

// Log likelihood ratio of each pixel's luma in shadow and in sun, from
// histograms of log luma in tiles of DARK_TILE meters (with the tiles around
// them), of pixels inside the DEM's shadows at @fitted (away from their
// edges) and of pixels beyond the band of @bandPx pixels around the DEM's
// shadows (within twice that), each blended with the image's histogram
// (DARK_PRIOR pixels' worth) and interpolated between the tiles' centers
// @near share of the DEM's shadows within @bandPx of each pixel
// Returns a Float32Array, 0 for pixels that aren't near the DEM's shadows
function getDarkLikelihoods(L, valid, fitted, near, W, H, pixelSize, bandPx) {
  var N = W * H, B = DARK_BINS, scale = B / Math.log(256);
  var T = Math.max(toPixels(DARK_TILE, pixelSize), Math.ceil(Math.sqrt(N / MAX_DARK_TILES)));
  var tw = Math.ceil(W / T), th = Math.ceil(H / T), nt = tw * th;
  var core = maskMean(fitted, W, H, 1);
  var wide = boxMean(near, W, H, bandPx);
  var hist = [new Float64Array(nt * B), new Float64Array(nt * B)];
  var all = [new Float64Array(B), new Float64Array(B)];
  var table = new Float32Array(nt * B), bin = new Uint8Array(N);
  var out = new Float32Array(N), i, g, t, b, x, y, tx, ty, k, sx, sy, n, p, q;
  for (i = 0; i < N; i++) {
    bin[i] = Math.min(B - 1, Math.floor(Math.log(L[i] + 1) * scale));
    if (!valid[i]) continue;
    if (core[i] > 0.999) g = 0;
    else if (near[i] <= 0.01 && wide[i] > 0.01) g = 1;
    else continue;
    t = Math.floor(Math.floor(i / W) / T) * tw + Math.floor((i % W) / T);
    hist[g][t * B + bin[i]]++;
    all[g][bin[i]]++;
  }
  core = wide = null;
  var dens = [new Float64Array(B), new Float64Array(B)], pooled = new Float64Array(B), tot;
  for (g = 0; g < 2; g++) {
    for (b = 0, tot = 0; b < B; b++) tot += all[g][b];
    for (b = 0; b < B; b++) all[g][b] = tot > 0 ? all[g][b] / tot : 1 / B;
  }
  for (ty = 0; ty < th; ty++) {
    for (tx = 0; tx < tw; tx++) {
      for (g = 0; g < 2; g++) {
        pooled.fill(0);
        for (sy = Math.max(0, ty - 1); sy <= Math.min(th - 1, ty + 1); sy++) {
          for (sx = Math.max(0, tx - 1); sx <= Math.min(tw - 1, tx + 1); sx++) {
            for (b = 0; b < B; b++) pooled[b] += hist[g][(sy * tw + sx) * B + b];
          }
        }
        for (b = 0, n = 0; b < B; b++) n += pooled[b];
        for (b = 0; b < B; b++) {
          // smoothed over neighboring bins
          for (k = -2, p = 0, q = 0; k <= 2; k++) {
            if (b + k < 0 || b + k >= B) continue;
            p += (3 - Math.abs(k)) * (pooled[b + k] + DARK_PRIOR * all[g][b + k]);
            q += 3 - Math.abs(k);
          }
          dens[g][b] = p / q / (n + DARK_PRIOR) + 1e-9;
        }
      }
      for (b = 0; b < B; b++) table[(ty * tw + tx) * B + b] = Math.log(dens[0][b] / dens[1][b]);
    }
  }
  var fx, fy, x0, y0, x1, y1, ax, ay;
  for (i = 0; i < N; i++) {
    if (!(near[i] > 0.01) || !valid[i]) continue;
    x = i % W;
    y = Math.floor(i / W);
    fx = Math.max(0, Math.min(tw - 1, x / T - 0.5));
    fy = Math.max(0, Math.min(th - 1, y / T - 0.5));
    x0 = Math.floor(fx);
    y0 = Math.floor(fy);
    x1 = Math.min(tw - 1, x0 + 1);
    y1 = Math.min(th - 1, y0 + 1);
    ax = fx - x0;
    ay = fy - y0;
    b = bin[i];
    out[i] = (table[(y0 * tw + x0) * B + b] * (1 - ax) + table[(y0 * tw + x1) * B + b] * ax) * (1 - ay) +
      (table[(y1 * tw + x0) * B + b] * (1 - ax) + table[(y1 * tw + x1) * B + b] * ax) * ay;
  }
  return out;
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

// The luma threshold that best reproduces the DEM's shadows near them: with
// the fewest pixels misclassified, or with @balanced, the smallest sum of the
// shares of shadowed and of sunlit pixels misclassified. Counts favor the
// larger group; in soft imagery, where pixels at the shadows' edges are
// mixed, they can put nearly all of the pixels in shadow, so the balanced
// threshold is used if the counted one would darken more than MAX_DARK_LIT
// of the sunlit pixels.
export function getAgreementThreshold(L, predicted, include, balanced) {
  var hIn = new Float64Array(256), hOut = new Float64Array(256), nIn = 0, nOut = 0;
  var counted, i, v;
  for (i = 0; i < L.length; i++) {
    if (!include[i]) continue;
    v = Math.min(255, Math.round(L[i]));
    if (predicted[i]) {
      hIn[v]++;
      nIn++;
    } else {
      hOut[v]++;
      nOut++;
    }
  }
  function threshold(wIn, wOut) {
    var best = Infinity, t = 0, missIn = nIn, falseOut = 0, dark = 0, err;
    for (v = 0; v < 256; v++) {
      missIn -= hIn[v];
      falseOut += hOut[v];
      err = missIn * wIn + falseOut * wOut;
      if (err < best) {
        best = err;
        t = v;
        dark = falseOut;
      }
    }
    return {t: t + 0.5, darkLit: nOut > 0 ? dark / nOut : 0};
  }
  counted = balanced ? null : threshold(1, 1);
  if (counted && counted.darkLit <= MAX_DARK_LIT) return counted.t;
  return threshold(1 / Math.max(1, nIn), 1 / Math.max(1, nOut)).t;
}

// The spacing, in cells, of the data that a grid's first band was
// interpolated from (e.g. elevation fetched at a finer resolution than its
// source's); 1 if the grid has detail at its own cells. Second differences of
// a smooth (interpolated) surface grow as the square of their lag, and those
// of terrain with detail more slowly: the spacing is where the growth from
// lag k to 2k falls below SMOOTH_GROWTH, as a power of 2, interpolated
// between the lags.
// @grid {samples, bands, width, height, nodata}
export function getDataSpacing(grid) {
  var e = SPACING_LAGS.map(function(k) { return getMeanSecondDifference(grid, k); });
  var prev = 2, g, j;
  for (j = 0; j < e.length - 1; j++) {
    if (!(e[j] > 0 && e[j + 1] > 0)) return 1;
    g = Math.log2(e[j + 1] / e[j]);
    if (g < SMOOTH_GROWTH) {
      return j === 0 ? 1 : Math.pow(2, j + (prev - SMOOTH_GROWTH) / (prev - g));
    }
    prev = g;
  }
  return SPACING_LAGS[SPACING_LAGS.length - 1];
}

// Mean absolute second difference at @lag along rows and columns, sampling
// up to about SPACING_SAMPLES values in each direction
function getMeanSecondDifference(grid, lag) {
  var w = grid.width, h = grid.height, Z = grid.samples, nb = grid.bands, nodata = grid.nodata;
  var step = Math.max(1, Math.round(Math.sqrt(w * h / SPACING_SAMPLES)));
  var sum = 0, n = 0, x, y;
  function add(i, d) {
    var a = Z[(i - d) * nb], b = Z[i * nb], c = Z[(i + d) * nb];
    if (a === nodata || b === nodata || c === nodata) return;
    a = Math.abs(a + c - 2 * b);
    if (a === a) {
      sum += a;
      n++;
    }
  }
  for (y = 0; y < h; y += step) {
    for (x = lag; x < w - lag; x++) add(y * w + x, lag);
  }
  for (x = 0; x < w; x += step) {
    for (y = lag; y < h - lag; y++) add(y * w + x, lag * w);
  }
  return n > 0 ? sum / n : 0;
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
// @out optional Float32Array for the means, which may be @src
export function boxMean(src, w, h, r, out) {
  var row = new Float32Array(w), x, y, s, o;
  out = out || new Float32Array(w * h);
  // means of rows, written over @out a row at a time
  for (y = 0; y < h; y++) {
    o = y * w;
    s = 0;
    for (x = 0; x <= r && x < w; x++) s += src[o + x];
    for (x = 0; x < w; x++) {
      row[x] = s / (Math.min(x + r, w - 1) - Math.max(x - r, 0) + 1);
      if (x + r + 1 < w) s += src[o + x + r + 1];
      if (x - r >= 0) s -= src[o + x - r];
    }
    out.set(row, o);
  }
  // column sums, a row at a time (in order in memory); the rows' means that
  // are written over are kept in @ring until they leave the window
  var col = new Float64Array(w), rows = Math.min(r + 1, h), ring = new Float32Array(rows * w);
  var n, a, b, v;
  for (y = 0; y <= r && y < h; y++) {
    for (x = 0, o = y * w; x < w; x++) col[x] += out[o + x];
  }
  for (y = 0; y < h; y++) {
    n = Math.min(y + r, h - 1) - Math.max(y - r, 0) + 1;
    o = y * w;
    a = y + r + 1 < h ? (y + r + 1) * w : -1;
    b = y - r >= 0 ? (y - r) % rows * w : -1;
    ring.set(out.subarray(o, o + w), y % rows * w);
    for (x = 0; x < w; x++) {
      v = col[x] / n;
      if (a >= 0) col[x] += out[a + x];
      if (b >= 0) col[x] -= ring[b + x];
      out[o + x] = v;
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
  out = boxMean(vals, w, h, r, vals);
  wsum = boxMean(wts, w, h, r, wts);
  for (i = 0; i < src.length; i++) out[i] = src[i] === src[i] ? out[i] / wsum[i] : NaN;
  return out;
}

function getMedian(arr) {
  var sorted = Float64Array.from(arr).sort();
  return sorted[Math.floor(sorted.length / 2)];
}
