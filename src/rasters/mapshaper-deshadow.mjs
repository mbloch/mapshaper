// Brightens terrain shadows in aerial imagery, using a DEM to tell the shadows
// of cliffs and ridges from other dark areas (see -deshadow).
//
// 1. The sun's azimuth and altitude are fitted by matching the shadows the DEM
//    casts to the image's dark areas; with the image's date (or range of
//    dates), only positions on the sun's path those days are tried.
// 2. The shadow mask is made of dark pixels near the DEM's shadows (cast from
//    as far below the fitted sun as they stay mostly dark, since a coarse DEM
//    casts shorter shadows than the terrain does), in areas
//    where most of a ~10 m window is dark (tree shadows never are). With a
//    near-infrared band, the window counts only pixels that are dark in both
//    (sunlit tree canopy is dark in visible light but bright in near-infrared).
// 3. Each channel is multiplied by the ratio of sunlit to shadowed values,
//    measured across the shadows' edges for each class of shadowed ground
//    (by color), in tiles. Shadows darken forest much less than rock or snow
//    (sunlit forest is partly shadowed by its own trees), and a class's
//    shadows are kept below the lightness of its sunlit ground. Where little
//    of the sunlit ground nearby is vegetation, shadows get the ratios of the
//    bare ground nearby, which shadow classes don't tell apart from forest.

// Sizes in meters on the ground, converted to pixels for each image
var MAJORITY_RADIUS = 1.2;
var REGION_RADIUS = 4.8;
var REGION_SHARE = 0.7;
var EDGE_RADIUS = 1.8;
var BLOCK_SIZE = 18;
var CHROMA_RADIUS = 1.8;
var CONTRAST_RADIUS = 3.6;
var EDGE_BLUR_RADIUS = 1.2;
var SMALL_AREA = 1100; // square meters
var MIN_BAND = 24; // search distance around the DEM's shadows
// shares of the image's darkest areas that the sun's position is fitted to;
// the best match is kept (shadows can be 1% of a desert scene, where the
// next-darkest areas are sunlit slopes, or 10% of a mountain scene)
var DARK_SHARES = [0.03, 0.06, 0.15];
// rounds of refitting the sun to pixels as dark as the fitted shadows
var FIT_ROUNDS = 4;
// lowest sun altitude fitted, in degrees (NAIP is flown with the sun at least
// 30 degrees high)
export var MIN_ALTITUDE = 25;
// The mask can be at most this many times the size of the DEM's shadows;
// larger means it has taken in other dark areas, e.g. forest
export var MAX_MASK_RATIO = 1.5;
// Shadows are lit by blue skylight, so they need more red gain than blue;
// dark areas that don't are probably something else, e.g. forest beside
// grass (shadows measured: 1.8-2.0 times; forest 0.95)
export var MIN_RED_BLUE_GAIN = 1.25;

// A shadow area's share of pixels inside the DEM's shadows, to be kept
var MIN_OVERLAP = 0.2;
var MIN_SMALL_OVERLAP = 0.5;
// near-infrared threshold, as a multiple of the median in the DEM's shadows
var NIR_FACTOR = 1.6;
// ... and at most this share of the image's median near-infrared (terrain
// shadows are about 0.12, sunlit forest 0.3 or more)
var MAX_NIR_SHARE = 0.25;
// ... and for fitting the sun along its path, where most shadows will do
var FIT_NIR_SHARE = 0.5;
// Skylight gives sky-facing tree crowns more light than the understory, a
// contrast that sunlit areas don't have, so bright outliers in brightened
// shadows are pulled toward the local level
var CONTRAST_BRIGHT = 0.35;
var CONTRAST_DARK = 0.85;
// Classes of shadowed ground, by color (in shadow, which is lit by the sky,
// colors differ less than lightness does)
var SHADOW_CLASSES = 8;
var CLASS_LUMA_WEIGHT = 0.5;
// A class's own gains get half the weight with this many pairs of samples,
// and its sunlit pairs cap its brightened shadows with at least this many
var CLASS_PRIOR = 20;
var CLASS_CAP_PAIRS = 50;
// ... and are measured in tiles this size (meters), where they get half the
// weight with this many pairs
var CLASS_TILE = 500;
var TILE_PRIOR = 30;
// Vegetation is sunlit ground with green this many times red (and more than
// blue). Where less
// than VEG_SHARE_FULL of the sunlit ground within about 1.5 VEG_CELL (meters)
// is vegetation, shadows get some of the gains of the bare ground nearby,
// which get half the weight in a tile with this many pairs
var VEG_RATIO = 1.15;
var VEG_SHARE_FULL = 0.1;
var VEG_CELL = 100;
var BARE_TILE_PRIOR = 10;

export var MIN_SUN_FIT = 0.1;
// declinations searched in a range of dates, at most this far apart (degrees)
var DECLINATION_STEP = 2;
// Largest cells (meters) to fit the sun on; on coarser grids, cliffs are
// smoothed away along with the shadows they cast
var MAX_FIT_CELL = 30;
// A DEM resampled from cells larger than the terrain grid's is smooth between
// them: its curvature over one cell is less than this many times its
// curvature over COARSE_LAG cells, along rows or columns (measured: 3-10 m
// DEMs on 1.6-3.4 m grids, 1.15-1.3 along one or the other; DEMs on their own
// grids, or 1 m lidar on a 3.4 m grid, 2-4.3)
var COARSE_DETAIL = 1.6;
var COARSE_LAG = 4;

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

// Fits the sun position that best matches the terrain's shadows to dark
// areas, by correlating shadows with darkness. Aerial imagery is flown with
// the sun at least MIN_ALTITUDE high; lower suns can match other dark areas
// on slopes facing away from the sun, such as forests on north-facing slopes.
// @darkness one value per cell, higher for darker; NaN to ignore a cell
// @region {x0, y0, x1, y1}: the cells that have darkness values
// @start optional sun position to refine, instead of searching all positions
// @path optional {latitude, declination} or {latitude, declinations: [min,
//   max]} (degrees): the sun is searched along its path on the image's date
//   (or dates), instead of at all positions (@start is ignored)
// Returns {azimuth, altitude, score} (radians; score is a correlation, -1 to
//   1); with @path, also {hour, declination} in degrees
export function fitSunPosition(Z, darkness, w, h, cellW, cellH, region, start, path) {
  if (path) return fitSunPath(Z, darkness, w, h, cellW, cellH, region, path);
  var fine = downsampleLevel(Z, darkness, w, h, cellW, cellH, region, 120000);
  var deg = Math.PI / 180;
  var best = {score: -2};
  var coarse, az, alt, s, moved, cand, i, sc;
  if (start) {
    best = {azimuth: start.azimuth / deg, altitude: start.altitude / deg};
  } else {
    coarse = downsampleLevel(Z, darkness, w, h, cellW, cellH, region, 25000);
    for (az = 0; az < 360; az += 10) {
      for (alt = MIN_ALTITUDE; alt <= 85; alt += 10) {
        sc = scoreSun(coarse, az * deg, alt * deg);
        if (sc > best.score) best = {azimuth: az, altitude: alt, score: sc};
      }
    }
    if (best.score <= -1) return {azimuth: 0, altitude: 0, score: -1};
  }
  best.score = scoreSun(fine, best.azimuth * deg, best.altitude * deg);
  // pattern search, from a step of half the grid spacing
  for (s = 5; s >= 0.5; ) {
    moved = false;
    cand = [[s, 0], [-s, 0], [0, s], [0, -s]];
    for (i = 0; i < 4; i++) {
      az = best.azimuth + cand[i][0];
      alt = Math.max(MIN_ALTITUDE, Math.min(88, best.altitude + cand[i][1]));
      sc = scoreSun(fine, az * deg, alt * deg);
      if (sc > best.score) {
        best = {azimuth: (az + 360) % 360, altitude: alt, score: sc};
        moved = true;
      }
    }
    if (!moved) s /= 2;
  }
  return {azimuth: best.azimuth * deg, altitude: best.altitude * deg, score: best.score};
}

// The time of day (hour angle), and the declination within the range of
// @path.declinations, whose sun position best matches; hours are searched
// every half hour and refined to about a minute
function fitSunPath(Z, darkness, w, h, cellW, cellH, region, path) {
  var deg = Math.PI / 180;
  var level = downsampleLevel(Z, darkness, w, h, cellW, cellH, region, 120000);
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

// The lowest altitude, from @sun's down to MIN_ALTITUDE, at which each
// degree lower adds shadows (in @sun's direction) that are mostly dark
// @darkness one value per cell, from 0 (lit) to 1 (dark); NaN to ignore
// Returns {azimuth, altitude}
export function lowerSunAltitude(Z, darkness, w, h, cellW, cellH, region, sun) {
  var level = downsampleLevel(Z, darkness, w, h, cellW, cellH, region, 120000);
  var deg = Math.PI / 180, D = level.darkness;
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

function scoreSun(level, azimuth, altitude) {
  var P = castTerrainShadow(level.Z, level.w, level.h, level.cellW, level.cellH,
    {azimuth: azimuth, altitude: altitude}, level.region);
  var r = level.region, D = level.darkness, w = level.w;
  var n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  var x, y, i, a, b, cov, va, vb;
  for (y = r.y0; y < r.y1; y++) {
    for (x = r.x0; x < r.x1; x++) {
      i = y * w + x;
      b = D[i];
      if (b !== b) continue;
      a = P[i];
      n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
    }
  }
  if (n < 2) return -1;
  cov = sab / n - sa / n * sb / n;
  va = saa / n - (sa / n) * (sa / n);
  vb = sbb / n - (sb / n) * (sb / n);
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : -1;
}

// A copy of the grids reduced by an integer factor, to have up to
// @maxCells cells in the region (means, ignoring NaN), but with cells no
// larger than MAX_FIT_CELL
function downsampleLevel(Z, D, w, h, cellW, cellH, region, maxCells) {
  var cells = (region.x1 - region.x0) * (region.y1 - region.y0);
  var f = Math.min(Math.ceil(Math.sqrt(cells / maxCells)),
    Math.floor(MAX_FIT_CELL / Math.max(cellW, cellH)));
  f = Math.max(1, f);
  if (f == 1) return {Z: Z, darkness: D, w: w, h: h, cellW: cellW, cellH: cellH, region: region};
  return {
    Z: downsampleMeans(Z, w, h, f),
    darkness: downsampleMeans(D, w, h, f),
    w: Math.ceil(w / f),
    h: Math.ceil(h / f),
    cellW: cellW * f,
    cellH: cellH * f,
    region: {x0: Math.floor(region.x0 / f), y0: Math.floor(region.y0 / f),
      x1: Math.ceil(region.x1 / f), y1: Math.ceil(region.y1 / f)}
  };
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

// True if the terrain's elevations are smooth at the scale of its cells, as
// when a DEM has been resampled from larger cells (see COARSE_DETAIL). Rows or
// columns are tested separately, as a DEM reprojected by nearest neighbor
// has steps between duplicated rows (or columns) that aren't detail.
export function isCoarseTerrain(terrain) {
  return [1, terrain.width].some(function(step) {
    var flat = getMeanCurvature(terrain.Z, terrain.width, terrain.height, step, COARSE_LAG);
    return flat > 0 && getMeanCurvature(terrain.Z, terrain.width, terrain.height, step, 1) < flat * COARSE_DETAIL;
  });
}

// Mean absolute second difference of elevations at a lag of @d cells along
// rows (@step 1) or columns (@step w), over d squared (constant for smooth
// surfaces)
function getMeanCurvature(Z, w, h, step, d) {
  var sum = 0, n = 0, x, y, i, a;
  var dx = step == 1 ? d : 0, dy = step == 1 ? 0 : d;
  for (y = dy; y < h - dy; y++) {
    for (x = dx; x < w - dx; x++) {
      i = y * w + x;
      a = Z[i - d * step] + Z[i + d * step] - 2 * Z[i];
      if (a !== a) continue;
      sum += Math.abs(a);
      n++;
    }
  }
  return n > 0 ? sum / n / (d * d) : 0;
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
// Returns {samples, sun, lowSun, shadowShare, maskRatio, gains, coarseDem};
//   samples is null if the sun couldn't be fitted, the mask is more than
//   MAX_MASK_RATIO times the DEM's shadows, or no shadow edges could be
//   measured; coarseDem is true if the DEM is less detailed than the terrain
//   grid (see isCoarseTerrain)
export function deshadowImage(image, terrain, nir, pixelSize, demPixelSize, path) {
  var W = image.width, H = image.height, N = W * H;
  var valid = getValidPixels(image);
  var L = getLuma(image.samples, image.bands, N);
  var region = getTerrainRegion(terrain, W, H);
  var band = Math.max(MIN_BAND, demPixelSize * 2.4);
  var result = {samples: null, sun: null, shadowShare: 0, gains: null, coarseDem: isCoarseTerrain(terrain)};
  var sun, maskSun, prev, shadow, dark, mask, relit, i;
  function fit(darkness, start) {
    return fitSunPosition(terrain.Z, darkness, terrain.width, terrain.height,
      terrain.cellWidth, terrain.cellHeight, region, start, path);
  }
  function fitDarkest(getDarkness) {
    return DARK_SHARES.reduce(function(best, share) {
      var sun = fit(getDarkness(share), null);
      return best && best.score >= sun.score ? best : sun;
    }, null);
  }
  function predict(sun) {
    return getPixelShadow(castTerrainShadow(terrain.Z, terrain.width, terrain.height,
      terrain.cellWidth, terrain.cellHeight, sun, region), terrain, W, H);
  }
  if (path) {
    sun = fitDarkest(function(share) {
      return nir ? getCellNirDarkness(L, nir, valid, W, H, terrain, share) :
        getCellDarkness(L, valid, W, H, terrain, share);
    });
  } else {
    // The first fit is to the darkest areas, which can include dark ground
    // and forest; later fits are to pixels as dark as the fitted shadows. The
    // fitted altitude is lower than the sun's when the DEM is coarser than
    // the image, which matches more of the image's shadows.
    sun = fitDarkest(function(share) {
      return getCellDarkness(L, valid, W, H, terrain, share);
    });
    for (i = 0; i < FIT_ROUNDS && sun.score >= MIN_SUN_FIT; i++) {
      dark = getDarkPixels(L, null, valid, predict(sun), W, H, pixelSize, band);
      prev = sun;
      sun = fit(getCellShares(dark.dark, W, H, terrain), prev);
      if (!(sun.score >= MIN_SUN_FIT)) {
        sun = prev;
        break;
      }
      if (sun.azimuth == prev.azimuth && sun.altitude == prev.altitude) break;
    }
  }
  result.sun = sun;
  // a fit at the lowest altitude searched has usually matched dark slopes
  // facing away from the sun, not shadows
  result.lowSun = sun.altitude * 180 / Math.PI < MIN_ALTITUDE + 0.5;
  if (!(sun.score >= MIN_SUN_FIT) || result.lowSun) return result;
  // With a DEM coarser than the image (e.g. 10 m), cliffs are smoothed into
  // slopes that cast only part of their shadows, so the mask is made from
  // shadows cast from lower, as far as they stay mostly dark
  shadow = predict(sun);
  dark = thresholdPixels(L, valid, getShadowMidpoint(L, valid, shadow));
  maskSun = lowerSunAltitude(terrain.Z, getCellShares(dark, W, H, terrain, valid),
    terrain.width, terrain.height, terrain.cellWidth, terrain.cellHeight, region, sun);
  dark = null;
  mask = getShadowMask(L, nir, valid, predict(maskSun), W, H, pixelSize, band);
  result.shadowShare = mask.count / N;
  result.maskRatio = mask.count / Math.max(1, countValid(shadow, valid));
  shadow = null;
  if (mask.count === 0 || result.maskRatio > MAX_MASK_RATIO) return result;
  relit = relightShadows(image, L, valid, mask, pixelSize, maskSun);
  if (relit) {
    result.samples = relit.samples;
    result.gains = relit.gains;
  }
  return result;
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

function countValid(arr, valid) {
  var n = 0;
  for (var i = 0; i < arr.length; i++) if (arr[i] && valid[i]) n++;
  return n;
}

function getValidPixels(image) {
  var n = image.width * image.height, valid = new Uint8Array(n).fill(1), i;
  if (image.bands == 4) {
    for (i = 0; i < n; i++) valid[i] = image.samples[i * 4 + 3] > 0 ? 1 : 0;
  }
  return valid;
}

export function getLuma(samples, bands, n) {
  var L = new Float32Array(n), i, j;
  for (i = 0, j = 0; i < n; i++, j += bands) {
    L[i] = 0.299 * samples[j] + 0.587 * samples[j + 1] + 0.114 * samples[j + 2];
  }
  return L;
}

function getTerrainRegion(terrain, W, H) {
  return {x0: terrain.x0, y0: terrain.y0,
    x1: terrain.x0 + Math.ceil(W / terrain.factor),
    y1: terrain.y0 + Math.ceil(H / terrain.factor)};
}

// Share of each terrain cell's pixels that are in the darkest @share of the
// image; NaN outside the image. Correlating shadows with luma itself favors a
// low sun: its long shadows cover low ground, which is often darker anyway
// (e.g. vegetated valleys). Pixels, not cell means, are thresholded, so that
// shadows narrower than a cell count.
function getCellDarkness(L, valid, W, H, terrain, share) {
  var N = W * H, lumas = [], dark = new Float32Array(N), t, i;
  for (i = 0; i < N; i += 7) if (valid[i]) lumas.push(L[i]);
  if (lumas.length > 0) {
    t = getQuantile(lumas, share);
    for (i = 0; i < N; i++) dark[i] = L[i] <= t ? 1 : 0;
  }
  return getCellShares(dark, W, H, terrain, valid);
}

// Share of each terrain cell's pixels that are in the darkest @share of the
// image and dark in near-infrared (unlike sunlit vegetation)
function getCellNirDarkness(L, nir, valid, W, H, terrain, share) {
  var N = W * H, lumas = [], nirs = [], dark = new Float32Array(N), t, tn, i;
  for (i = 0; i < N; i += 7) {
    if (!valid[i] || nir[i] !== nir[i]) continue;
    lumas.push(L[i]);
    nirs.push(nir[i]);
  }
  if (lumas.length === 0) return getCellShares(dark, W, H, terrain, valid);
  t = getQuantile(lumas, share);
  tn = getMedian(nirs) * FIT_NIR_SHARE;
  for (i = 0; i < N; i++) dark[i] = L[i] <= t && nir[i] < tn ? 1 : 0;
  return getCellShares(dark, W, H, terrain, valid);
}

// Mean of each terrain cell's pixel values; NaN outside the image
// @valid optional: pixels to include
function getCellShares(values, W, H, terrain, valid) {
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

function getPixelShadow(cells, terrain, W, H) {
  var out = new Uint8Array(W * H), tw = terrain.width, f = terrain.factor, x, y, row;
  for (y = 0; y < H; y++) {
    row = (terrain.y0 + Math.floor(y / f)) * tw + terrain.x0;
    for (x = 0; x < W; x++) out[y * W + x] = cells[row + Math.floor(x / f)];
  }
  return out;
}

function toPixels(meters, pixelSize) {
  return Math.max(1, Math.round(meters / pixelSize));
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
  return {hard: hard, near: inc, threshold: T, count: count};
}

// Pixels near the DEM's shadows that are as dark as them
// Returns {near, threshold, dark, darkBoth}: near is 1 for valid pixels near
//   the DEM's shadows; dark is 1 for those darker than the luma threshold;
//   darkBoth for those also dark in near-infrared (or dark, without it)
function getDarkPixels(L, nir, valid, predicted, W, H, pixelSize, band) {
  var N = W * H, i;
  var near = boxMean(toFloat(predicted), W, H, toPixels(band, pixelSize));
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

// Values of the items in each group, grouped (counting sort)
// @group group of each item, or -1
// Returns {values, start}: group c's values are values[start[c]] to values[start[c + 1] - 1]
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
// nearby. A class's shadows are kept below the lightness of its sunlit ground.
// Returns {samples, gains}, or null if there are no edges to measure
function relightShadows(image, L, valid, mask, pixelSize, sun) {
  var W = image.width, H = image.height, N = W * H, bands = image.bands;
  var src = image.samples, hard = mask.hard;
  var edge = boxMean(toFloat(hard), W, H, toPixels(EDGE_RADIUS, pixelSize));
  // samples at least two pixels from the edges: in resampled imagery (e.g.
  // map tiles), pixels next to an edge are partly shadowed
  var edgeR = toPixels(EDGE_RADIUS, pixelSize);
  var gap = edgeR >= 2 ? edge : boxMean(toFloat(hard), W, H, 2);
  // shadows the mask has missed, and partly lit pixels, aren't sunlit
  var litT = Math.max(mask.threshold, getLitThreshold(L, valid, gap, mask.near));
  var gains = measureGains(src, bands, L, valid, gap, litT, W, H, pixelSize);
  if (!gains) return null;
  if (gains[0] < gains[2] * MIN_RED_BLUE_GAIN) return {samples: null, gains: gains};
  var imageCap = getBrightnessCap(L, valid, edge, mask);
  var maxDist = Math.max(8, toPixels(BLOCK_SIZE, pixelSize));
  var near = boxMean(toFloat(hard), W, H, maxDist);
  var pairs = findEdgePairs(valid, hard, edge, gap, near, W, H, maxDist, sun);
  var classes = measureClassGains(src, bands, L, valid, hard, edge, pairs, W, H, gains, pixelSize);
  var bare = getBareShare(src, bands, valid, hard, gap, near, W, H, pixelSize);
  var bareGains = measureBareGains(src, bands, pairs, W, H, gains, pixelSize);
  var range = getShadowLightnessRange(L, valid, edge, hard, gains);
  var cls = classes.cls, alpha = new Float32Array(N), wt = new Float32Array(N);
  var logG = [0, 1, 2].map(function() { return new Float32Array(N); });
  var relit, i, k, s, b, x, y, la, a, g, cap, f;
  near = null;
  for (i = 0; i < N; i++) {
    s = cls[i];
    if (s < 0) continue;
    x = i % W;
    y = Math.floor(i / W);
    b = bare[i];
    la = getLightnessAlpha(L[i], classes.lo[s], classes.hi[s]);
    if (b > 0) la = (1 - b) * la + b * getLightnessAlpha(L[i], range[0], range[1]);
    if (edge[i] > 0 && edge[i] < 1) alpha[i] = la;
    else if (hard[i]) alpha[i] = Math.min(1, la * 1.5);
    wt[i] = 1;
    for (k = 0; k < 3; k++) {
      logG[k][i] = getTileLogGain(classes, s, x, y, k);
      if (b > 0) logG[k][i] = (1 - b) * logG[k][i] + b * getTileLogGain(bareGains, 0, x, y, k);
    }
  }
  // gains are smoothed, as neighboring pixels can be in different classes
  var r = toPixels(CHROMA_RADIUS, pixelSize), mw = boxMean(wt, W, H, r);
  logG = logG.map(function(arr) { return boxMean(arr, W, H, r); });
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
  compressContrast(relit, alpha, W, H, toPixels(CONTRAST_RADIUS, pixelSize));
  return {
    samples: writeRelitSamples(src, bands, relit, alpha, edge, W, H, pixelSize),
    gains: gains
  };
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

// k-means, from centers picked farthest from the previous ones (so that
// uncommon colors get a class), starting with the median lightness
function kMeans(samples, K) {
  if (samples.length === 0) return [];
  var sorted = samples.slice().sort(function(a, b) { return a[2] - b[2]; });
  var centers = [sorted[sorted.length >> 1].slice()], sums, counts, iter, i, c, m, k;
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
    sums = centers.map(function() { return [0, 0, 0]; });
    counts = new Uint32Array(K);
    for (i = 0; i < samples.length; i++) {
      c = nearestCenter(centers, samples[i]);
      counts[c]++;
      for (k = 0; k < 3; k++) sums[c][k] += samples[i][k];
    }
    for (c = 0; c < K; c++) {
      if (counts[c] === 0) continue;
      for (k = 0; k < 3; k++) centers[c][k] = sums[c][k] / counts[c];
    }
  }
  m = centers;
  return m;
}

function sqDist(a, b) {
  var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
  return x * x + y * y + z * z;
}

function nearestCenter(centers, f) {
  var best = 0, bestD = Infinity, c, d, a, b, e;
  for (c = 0; c < centers.length; c++) {
    a = f[0] - centers[c][0];
    b = f[1] - centers[c][1];
    e = f[2] - centers[c][2];
    d = a * a + b * b + e * e;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
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
      share[gy * gw + gx] = t > 0 ? Math.max(0, 1 - a / t / VEG_SHARE_FULL) : 0;
    }
  }
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

// Green well above red, and above blue (snow and ice in light shade, and
// water, can be green well above red)
function isVegetation(src, bands, i) {
  var g = src[i * bands + 1] + 1;
  return g > (src[i * bands] + 1) * VEG_RATIO && g > src[i * bands + 2] + 1;
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

function getMedian(arr) {
  return getQuantile(arr, 0.5);
}

// The value at quantile @q (0-1)
function getQuantile(arr, q) {
  var sorted = arr.slice().sort(function(a, b) { return a - b; });
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}
