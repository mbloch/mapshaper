import { blurFloatChannel, getBlurReach } from './mapshaper-box-blur';

// Shaded relief from an elevation grid, and the terrain generalization that
// goes with it. Everything here works on plain typed arrays, one value per
// pixel, so it can be tested directly and run in workers (see
// mapshaper-hillshade-stages.mjs).
//
// @valid  optional Uint8Array, 0 for pixels without an elevation; null when
//   every pixel is valid

export var DEFAULT_AZIMUTH = 315;
export var DEFAULT_ALTITUDE = 45;
export var DEFAULT_MAX_OPACITY = 0.55;
export var DEFAULT_GAMMA = 0.75;
export var DEFAULT_HIGHLIGHT_RATIO = 1;

// Relative azimuths and weights of the default light blend: a main light,
// plus fainter lights on either side of it.
var MULTI_LIGHTS = [[-90, 0.15], [-45, 0.2], [0, 0.45], [45, 0.2]];

var RIDGE_WEIGHT = 0.5;
var VALLEY_WEIGHT = 0.3;

export function getHillshadeLights(azimuth, altitude, singleLight) {
  var az = azimuth == null ? DEFAULT_AZIMUTH : azimuth;
  var alt = altitude == null ? DEFAULT_ALTITUDE : altitude;
  if (singleLight) return [{azimuth: az, altitude: alt, weight: 1}];
  return MULTI_LIGHTS.map(function(o) {
    return {azimuth: az + o[0], altitude: alt, weight: o[1]};
  });
}

// Relief flattens out as pixels grow, so small-scale maps need more vertical
// exaggeration to read: none at 50 m per pixel, about 4.5 at 1 km.
export function getAutoExaggeration(metersPerPixel) {
  if (!(metersPerPixel > 0)) return 1;
  return Math.max(1, Math.min(10, Math.sqrt(metersPerPixel / 50)));
}

// Returns brightness values, scaled so that flat ground is 1, lit slopes are
// brighter and shaded slopes darker (0 is fully shaded).
// @elev Float32Array of elevations
// @cellWidths, @cellHeights per-row ground size of a pixel, in elevation units
// @lights from getHillshadeLights()
// @azimuthOffsets optional Float32Array, per-pixel rotation of every light, in
//   radians clockwise (see computeLightAdjustment())
export function computeHillshade(elev, valid, width, height, cellWidths, cellHeights, lights, exaggeration, azimuthOffsets) {
  var out = new Float32Array(width * height);
  var zf = exaggeration > 0 ? exaggeration : 1;
  var flat = 0;
  var prepared = lights.map(function(light) {
    var zenith = (90 - light.altitude) * Math.PI / 180;
    // mathematical angle of the direction the light comes from
    var az = (360 - light.azimuth + 90) * Math.PI / 180;
    flat += light.weight * Math.cos(zenith);
    return {
      cosZ: Math.cos(zenith) * light.weight,
      sinZ: Math.sin(zenith) * light.weight,
      cosAz: Math.cos(az),
      sinAz: Math.sin(az)
    };
  });
  var n = prepared.length;
  var y, x, i, ym, yp, xm, xp, c, a, b, cc, d, f, g, h, k;
  var dzdx, dzdy, slope2, cosSlope, sinSlope, aspectCos, aspectSin, mag, sum, p, j;
  var cd, sd, rc;
  for (y = 0; y < height; y++) {
    ym = (y > 0 ? y - 1 : 0) * width;
    yp = (y < height - 1 ? y + 1 : y) * width;
    var row = y * width;
    var sx = 8 * cellWidths[y] / zf;
    var sy = 8 * cellHeights[y] / zf;
    for (x = 0; x < width; x++) {
      i = row + x;
      if (valid && !valid[i]) continue;
      xm = x > 0 ? x - 1 : 0;
      xp = x < width - 1 ? x + 1 : x;
      c = elev[i];
      a = neighbor(ym + xm);
      b = neighbor(ym + x);
      cc = neighbor(ym + xp);
      d = neighbor(row + xm);
      f = neighbor(row + xp);
      g = neighbor(yp + xm);
      h = neighbor(yp + x);
      k = neighbor(yp + xp);
      // Horn's method; y increases downward (south) in the grid
      dzdx = ((cc + 2 * f + k) - (a + 2 * d + g)) / sx;
      dzdy = ((g + 2 * h + k) - (a + 2 * b + cc)) / sy;
      slope2 = dzdx * dzdx + dzdy * dzdy;
      cosSlope = 1 / Math.sqrt(1 + slope2);
      sinSlope = Math.sqrt(slope2) * cosSlope;
      mag = Math.sqrt(slope2);
      // aspect = atan2(dzdy, -dzdx), used through its cosine and sine
      aspectCos = mag > 0 ? -dzdx / mag : 0;
      aspectSin = mag > 0 ? dzdy / mag : 0;
      sum = 0;
      if (azimuthOffsets) {
        // a clockwise rotation lowers the mathematical angle of each light
        cd = Math.cos(azimuthOffsets[i]);
        sd = Math.sin(azimuthOffsets[i]);
        rc = aspectCos * cd - aspectSin * sd;
        aspectSin = aspectSin * cd + aspectCos * sd;
        aspectCos = rc;
      }
      for (j = 0; j < n; j++) {
        p = prepared[j];
        // cos(az - aspect) = cos(az)cos(aspect) + sin(az)sin(aspect)
        var v = p.cosZ * cosSlope + p.sinZ * sinSlope * (p.cosAz * aspectCos + p.sinAz * aspectSin);
        if (v > 0) sum += v;
      }
      out[i] = flat > 0 ? sum / flat : 0;
    }
  }
  return out;

  function neighbor(id) {
    return valid && !valid[id] ? c : elev[id];
  }
}

// Writes shading as RGBA bytes. Invalid pixels are transparent.
// See getHillshadeTones() for @style and @opts, writeHillshadeRgba() for @colors.
export function renderHillshadeRgba(shade, valid, style, opts, colors) {
  return writeHillshadeRgba(getHillshadeTones(shade, valid, style, opts), valid, style, colors);
}

// Default opacities of the styles: transparent shadows stay translucent, so
// the map shows through; opaque shading runs from black to white.
export function getDefaultMaxOpacity(style) {
  return style == 'opaque' ? 1 : DEFAULT_MAX_OPACITY;
}

export function getDefaultHighlightRatio() {
  return DEFAULT_HIGHLIGHT_RATIO;
}

// Applies the tone curve to shading. Tones are signed opacities: negative for
// shadows, positive for highlights, 0 on flat ground. They follow a power
// curve: tone = t ^ gamma, where t is 0 on flat ground and 1 in full shadow
// (or, for highlights, on a slope facing the light). Gamma below 1
// strengthens faint shading and eases off the extremes.
// @style 'shadow' or 'opaque'; sets the default opacities
// @opts.maxOpacity 0-1, opacity of the darkest shadows
// @opts.highlightRatio opacity of the brightest highlights, as a fraction of
//   maxOpacity; the result is capped at 1
// @opts.gamma exponent of the tone curve
// @opts.flatBrightness brightness of flat ground relative to a slope facing
//   the light: the sine of the light's altitude
export function getHillshadeTones(shade, valid, style, opts) {
  var o = opts || {};
  var n = shade.length;
  var tones = new Float32Array(n);
  var maxOpacity = o.maxOpacity >= 0 ? Math.min(1, o.maxOpacity) : getDefaultMaxOpacity(style);
  var ratio = o.highlightRatio >= 0 ? o.highlightRatio : getDefaultHighlightRatio(style);
  var maxHighlight = Math.min(1, maxOpacity * ratio);
  var gamma = o.gamma > 0 ? o.gamma : DEFAULT_GAMMA;
  var flatValue = o.flatBrightness > 0 ? Math.min(1, o.flatBrightness) : 1;
  // shade of a slope facing the light (flat ground is 1)
  var litRange = flatValue < 1 ? 1 / flatValue - 1 : 0;
  var curve = getToneCurve(gamma);
  var i, s;
  for (i = 0; i < n; i++) {
    if (valid && !valid[i]) continue;
    s = shade[i];
    if (s < 1) {
      tones[i] = -curve(1 - s) * maxOpacity;
    } else if (s > 1 && litRange > 0) {
      tones[i] = curve((s - 1) / litRange) * maxHighlight;
    }
  }
  return tones;
}

// @tones from getHillshadeTones(), clamped to the 0-1 range of opacity
// @style 'shadow': shadows and highlights with alpha; flat ground is clear
//        'opaque': shadows and highlights blended over @colors.base
// @colors optional {shadow, highlight, base} colors, as {r, g, b, a} objects
//   from parseColor(). Defaults are black, white and the gray of
//   getDefaultBaseColor(). The alpha of the shadow and highlight colors scales
//   the opacity of their tones; the base color's alpha is ignored.
export function writeHillshadeRgba(tones, valid, style, colors) {
  var n = tones.length;
  var out = new Uint8Array(n * 4);
  var dark = getToneColor(colors && colors.shadow, 0);
  var light = getToneColor(colors && colors.highlight, 255);
  var opaque = style == 'opaque';
  var base = opaque ? colors && colors.base || getDefaultBaseColor() : null;
  var i, j, t, c, a;
  for (i = 0, j = 0; i < n; i++, j += 4) {
    if (valid && !valid[i]) continue;
    t = tones[i];
    c = t < 0 ? dark : light;
    a = clamp01(t < 0 ? -t : t) * c.a;
    if (opaque) {
      out[j] = Math.round(base.r + (c.r - base.r) * a);
      out[j + 1] = Math.round(base.g + (c.g - base.g) * a);
      out[j + 2] = Math.round(base.b + (c.b - base.b) * a);
      out[j + 3] = 255;
    } else if (t !== 0) {
      out[j] = c.r;
      out[j + 1] = c.g;
      out[j + 2] = c.b;
      out[j + 3] = Math.round(a * 255);
    }
  }
  return out;
}

// #b4b4b4: flat ground in a conventional Lambertian hillshade with the sun at
// 45 degrees (sin(45) * 255). Constant, so altitude= changes the relief but
// not the overall tone of the map.
export function getDefaultBaseColor() {
  return {r: 180, g: 180, b: 180, a: 1};
}

function getToneColor(color, defaultValue) {
  if (!color) return {r: defaultValue, g: defaultValue, b: defaultValue, a: 1};
  return {
    r: Math.round(color.r),
    g: Math.round(color.g),
    b: Math.round(color.b),
    a: color.a >= 0 ? color.a : 1
  };
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Returns a function mapping 0-1 to 0-1. The curve is tabulated because
// Math.pow() for every pixel is slow.
function getToneCurve(gamma) {
  var steps = 1024;
  var table = new Float32Array(steps + 1);
  for (var i = 0; i <= steps; i++) {
    table[i] = Math.pow(i / steps, gamma);
  }
  return function(d) {
    var x = (d > 1 ? 1 : d) * steps;
    var i = Math.floor(x);
    return i >= steps ? table[steps] : table[i] + (table[i + 1] - table[i]) * (x - i);
  };
}

// Raises elevations below @min to @min, in place. Returns a mask of the
// raised pixels, or null if none were raised.
export function raiseLowElevations(elev, valid, min) {
  var raised = null;
  for (var i = 0; i < elev.length; i++) {
    if (valid && !valid[i] || elev[i] >= min) continue;
    if (!raised) raised = new Uint8Array(elev.length);
    raised[i] = 1;
    elev[i] = min;
  }
  return raised;
}

// After smoothing: resets pixels that were at @min before smoothing (smoothing
// spreads land into them, which would shade a flat sea). Other pixels may
// sink at most halfway to @min, so the coastline stays put: FPS can carry a
// coastal slope down past sea level, and clamping those pixels to @min made
// the sea spread over low-lying land.
// @before elevations before smoothing, after raiseLowElevations()
export function restoreLowElevations(elev, before, valid, min) {
  var b;
  for (var i = 0; i < elev.length; i++) {
    if (valid && !valid[i]) continue;
    b = before[i];
    elev[i] = b <= min ? min : Math.max(elev[i], min + (b - min) / 2);
  }
}

// Terrain generalization after Terrain Sculptor (Leonowicz, Jenny & Hurni
// 2010): a low-pass filter removes small landforms, then ridges and valleys
// that are large compared with the filter are restored by blending toward
// local maximum and minimum surfaces, according to curvature measured at a
// broader scale.
// @sigma strength, as the standard deviation in pixels of the low-pass filter
export function generalizeTerrain(elev, valid, width, height, sigma) {
  var weights = valid ? toWeights(valid) : null;
  var rankRadius = Math.max(1, Math.round(sigma * 0.6));
  var low = blurFloatChannel(Float32Array.from(elev), weights, width, height, sigma);
  var broad = blurFloatChannel(Float32Array.from(elev), weights, width, height, sigma * 2.5);
  var hi = blurFloatChannel(rankFilter(elev, valid, width, height, rankRadius, true), weights, width, height, sigma);
  var lo = blurFloatChannel(rankFilter(elev, valid, width, height, rankRadius, false), weights, width, height, sigma);
  var curv = new Float32Array(width * height);
  var out = new Float32Array(width * height);
  var total = 0, count = 0;
  var x, y, i, scale, t;
  for (y = 1; y < height - 1; y++) {
    for (x = 1; x < width - 1; x++) {
      i = y * width + x;
      if (valid && !valid[i]) continue;
      curv[i] = broad[i - 1] + broad[i + 1] + broad[i - width] + broad[i + width] - 4 * broad[i];
      total += Math.abs(curv[i]);
      count++;
    }
  }
  scale = count > 0 ? total / count * 2 : 0;
  for (i = 0; i < out.length; i++) {
    if (valid && !valid[i]) {
      out[i] = elev[i];
      continue;
    }
    t = scale > 0 ? Math.max(-1, Math.min(1, curv[i] / scale)) : 0;
    out[i] = t < 0 ?
      low[i] - t * RIDGE_WEIGHT * (hi[i] - low[i]) :
      low[i] - t * VALLEY_WEIGHT * (low[i] - lo[i]);
  }
  return out;
}

// Separable maximum or minimum filter over a square window, ignoring invalid
// pixels. A pixel with no valid pixel in its window keeps its own value.
export function rankFilter(src, valid, width, height, radius, isMax) {
  var tmp = new Float32Array(width * height);
  var tmpValid = valid ? new Uint8Array(width * height) : null;
  var out = new Float32Array(width * height);
  var x, y, i, j, row, v, found, best;
  for (y = 0; y < height; y++) {
    row = y * width;
    for (x = 0; x < width; x++) {
      found = false;
      best = 0;
      for (j = Math.max(0, x - radius); j <= Math.min(width - 1, x + radius); j++) {
        if (valid && !valid[row + j]) continue;
        v = src[row + j];
        if (!found || (isMax ? v > best : v < best)) best = v;
        found = true;
      }
      tmp[row + x] = found ? best : src[row + x];
      if (tmpValid) tmpValid[row + x] = found ? 1 : 0;
    }
  }
  for (x = 0; x < width; x++) {
    for (y = 0; y < height; y++) {
      found = false;
      best = 0;
      for (j = Math.max(0, y - radius); j <= Math.min(height - 1, y + radius); j++) {
        i = j * width + x;
        if (tmpValid && !tmpValid[i]) continue;
        v = tmp[i];
        if (!found || (isMax ? v > best : v < best)) best = v;
        found = true;
      }
      out[y * width + x] = found ? best : tmp[y * width + x];
    }
  }
  return out;
}

// Local adjustment of the light direction, after the Swiss manual technique:
// the light turns toward the perpendicular of the dominant landform
// orientation, so that ridges and valleys of any orientation get one lit
// and one shaded side. A fixed light leaves features parallel to it flat.
//
// The dominant orientation is the main axis of the structure tensor (the
// averaged outer product of the gradient), which treats the opposite-facing
// flanks of a ridge as the same axis. Adjustment is scaled by the tensor's
// coherence, so it fades out where there is no consistent orientation.
//
// @azimuth main light azimuth, in degrees
// @maxAdjust largest rotation, in degrees (up to 60)
// @sigma scale of the landforms that set the orientation, in pixels
// Returns a Float32Array of clockwise rotations, in radians
export function computeLightAdjustment(elev, valid, width, height, azimuth, maxAdjust, sigma) {
  var n = width * height;
  var weights = valid ? toWeights(valid) : null;
  var jxx = new Float32Array(n), jxy = new Float32Array(n), jyy = new Float32Array(n);
  var out = new Float32Array(n);
  var max = Math.min(60, Math.max(0, maxAdjust));
  var x, y, i, gx, gy, a, b, c, axis, delta, mag, coherence, f;
  for (y = 0; y < height; y++) {
    for (x = 0; x < width; x++) {
      i = y * width + x;
      if (valid && !valid[i]) continue;
      // central differences, in pixel units (only the direction matters);
      // gy points north
      gx = elevAt(elev, valid, width, height, x + 1, y, elev[i]) - elevAt(elev, valid, width, height, x - 1, y, elev[i]);
      gy = elevAt(elev, valid, width, height, x, y - 1, elev[i]) - elevAt(elev, valid, width, height, x, y + 1, elev[i]);
      jxx[i] = gx * gx;
      jxy[i] = gx * gy;
      jyy[i] = gy * gy;
    }
  }
  blurFloatChannel(jxx, weights, width, height, sigma);
  blurFloatChannel(jxy, weights, width, height, sigma);
  blurFloatChannel(jyy, weights, width, height, sigma);
  for (i = 0; i < n; i++) {
    if (valid && !valid[i]) continue;
    a = jxx[i];
    b = jxy[i];
    c = jyy[i];
    if (!(a + c > 0)) continue;
    mag = Math.sqrt((a - c) * (a - c) + 4 * b * b);
    coherence = mag / (a + c);
    // compass azimuth of the dominant gradient axis
    axis = 90 - 0.5 * Math.atan2(2 * b, a - c) * 180 / Math.PI;
    delta = ((axis - azimuth) % 180 + 270) % 180 - 90; // -90 to 90
    // Full adjustment up to @max, falling to 0 at 90 degrees, where the two
    // possible directions of rotation meet (otherwise the light would flip
    // between them)
    f = Math.min(Math.abs(delta), max * (90 - Math.abs(delta)) / (90 - max));
    out[i] = (delta < 0 ? -f : f) * coherence * Math.PI / 180;
  }
  return out;
}

// How far, in pixels, values travel in computeLightAdjustment(): the
// gradient's differences, then the blur of the structure tensor (see
// getFpsReach() for how reach is used)
export function getLightAdjustmentReach(sigma) {
  return 1 + getBlurReach(sigma);
}

function elevAt(elev, valid, width, height, x, y, fallback) {
  var i;
  if (x < 0 || y < 0 || x >= width || y >= height) return fallback;
  i = y * width + x;
  return valid && !valid[i] ? fallback : elev[i];
}

// Ambient light that varies with how open the terrain is to the sky: lower
// in valleys and hollows, higher on ridges and summits, regardless of the
// light direction. Approximates the sky-view factor by finding the highest
// horizon angle in 8 directions, out to @radius pixels.
// @cellWidths, @cellHeights per-row ground size of a pixel, in elevation units
// Returns brightness values on the same scale as computeHillshade(): flat
// open ground is 1
export function computeOpenness(elev, valid, width, height, cellWidths, cellHeights, exaggeration, radius) {
  var n = width * height;
  var out = new Float32Array(n);
  var zf = exaggeration > 0 ? exaggeration : 1;
  var steps = getOpennessSteps(radius);
  var dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  var x, y, i, d, s, k, xx, yy, j, z0, maxTan, t, dist, sum, cw, ch, unit;
  for (y = 0; y < height; y++) {
    cw = cellWidths[y];
    ch = cellHeights[y];
    for (x = 0; x < width; x++) {
      i = y * width + x;
      if (valid && !valid[i]) continue;
      z0 = elev[i];
      sum = 0;
      for (d = 0; d < 8; d++) {
        unit = Math.sqrt(dirs[d][0] * dirs[d][0] * cw * cw + dirs[d][1] * dirs[d][1] * ch * ch);
        maxTan = -Infinity;
        for (s = 0; s < steps.length; s++) {
          k = steps[s];
          xx = x + dirs[d][0] * k;
          yy = y + dirs[d][1] * k;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) break;
          j = yy * width + xx;
          if (valid && !valid[j]) break;
          dist = k * unit;
          t = (elev[j] - z0) * zf / dist;
          if (t > maxTan) maxTan = t;
        }
        // sine of the horizon angle; a ridge's horizon is below horizontal
        sum += maxTan > -Infinity ? maxTan / Math.sqrt(1 + maxTan * maxTan) : 0;
      }
      out[i] = 1 - sum / 8;
    }
  }
  return out;
}

// How far, in pixels, computeOpenness() looks
export function getOpennessReach(radius) {
  var steps = getOpennessSteps(radius);
  return steps.length > 0 ? steps[steps.length - 1] : 0;
}

// Distances to sample along each direction: every pixel nearby, then
// increasingly sparse
function getOpennessSteps(radius) {
  var steps = [];
  var k = 1;
  while (k <= radius) {
    steps.push(k);
    k = k < 4 ? k + 1 : Math.ceil(k * 1.4);
  }
  return steps;
}

// Darkens directional shading where the sky is hidden: @weight 0 is
// directional only, 1 scales shading by openness. Openness is 1 on flat ground
// and on planar slopes, so these keep their shading; valleys darken and
// ridges brighten. Blending the two additively instead would halve
// directional contrast everywhere, including highlights.
export function blendAmbientLight(shade, openness, valid, weight) {
  for (var i = 0; i < shade.length; i++) {
    if (valid && !valid[i]) continue;
    shade[i] *= 1 - weight * (1 - openness[i]);
  }
  return shade;
}

// Aerial perspective, as in Swiss manual relief shading: contrast falls with
// elevation, so lowland texture recedes and mountains stand out.
// @strength 0-1; at 1 the lowest terrain gets no shading at all
// Elevations are normalized between the 2nd and 98th percentiles.
// Unsharp mask of tones from getHillshadeTones(), in place:
// tone += amount * (tone - blurred tone). Differences smaller than @threshold
// (in tone units) are ignored, and larger ones reduced by it (a soft
// threshold), so faint texture can be left alone. Areas of constant tone are
// unchanged, so flat ground stays transparent in the shadow style.
export function sharpenTones(tones, valid, width, height, amount, sigma, threshold) {
  var blurred = Float32Array.from(tones);
  var t = threshold > 0 ? threshold : 0;
  var i, d;
  blurFloatChannel(blurred, valid, width, height, sigma);
  for (i = 0; i < tones.length; i++) {
    // flat ground (e.g. sea, with min-elevation=) would get halos along coasts
    if (valid && !valid[i] || tones[i] === 0) continue;
    d = tones[i] - blurred[i];
    if (d > t) d -= t;
    else if (d < -t) d += t;
    else continue;
    tones[i] += amount * d;
  }
}

// @range optional [low, high] elevations from getAerialRange(), for applying
//   this to part of a grid
export function applyAerialPerspective(shade, elev, valid, strength, range) {
  range = range || getAerialRange(elev, valid);
  var span = range[1] - range[0];
  var i, t;
  if (!(span > 0)) return shade;
  for (i = 0; i < shade.length; i++) {
    if (valid && !valid[i]) continue;
    t = Math.max(0, Math.min(1, (elev[i] - range[0]) / span));
    shade[i] = 1 + (shade[i] - 1) * (1 - strength * (1 - t));
  }
  return shade;
}

// The elevations that applyAerialPerspective() normalizes between
export function getAerialRange(elev, valid) {
  return getElevationPercentiles(elev, valid, 0.02, 0.98);
}

// Texture shading (Leland Brown 2010): a fractional Laplacian of the
// elevations, positive on ridges and negative in drainages at every scale.
// Brown filters in the frequency domain (spectrum times |k|^alpha); this
// approximates it as a sum of differences of Gaussians, using
// |k|^a = C * integral (1 - exp(-t k^2)) t^(-1-a/2) dt, sampled at
// half-octave scales up to @maxSigma pixels. Brown's unbounded scales make
// plains ringed by mountains read as giant drainages.
// Elevation differences are divided by the pixel size, like a slope, so the
// result does not depend on the extent or (with automatic exaggeration) the
// zoom level.
// @cellSizes ground size of a pixel in each row
export function computeTextureShading(elev, valid, width, height, cellSizes, exaggeration, alpha, maxSigma) {
  var n = width * height;
  var out = new Float32Array(n);
  var blurred = new Float32Array(n);
  var weights = valid ? toWeights(valid) : null;
  var sigma, w, x, y, i, k;
  for (sigma = TEXTURE_MIN_SCALE; sigma <= maxSigma; sigma *= Math.SQRT2) {
    blurred.set(elev);
    blurFloatChannel(blurred, weights, width, height, sigma);
    w = Math.pow(sigma, -alpha) * TEXTURE_SCALE * exaggeration;
    for (y = 0, i = 0; y < height; y++) {
      k = w / cellSizes[y];
      for (x = 0; x < width; x++, i++) {
        out[i] += (elev[i] - blurred[i]) * k;
      }
    }
  }
  return out;
}

// How far, in pixels, values travel in computeTextureShading(): the reach of
// its widest blur
export function getTextureShadingReach(maxSigma) {
  var reach = 0;
  for (var sigma = TEXTURE_MIN_SCALE; sigma <= maxSigma; sigma *= Math.SQRT2) {
    reach = Math.max(reach, getBlurReach(sigma));
  }
  return reach;
}

var TEXTURE_MIN_SCALE = 0.7;
// brings typical relief (France at zoom 7) to about 1 at the 98th percentile
var TEXTURE_SCALE = 0.125;

// Darkens drainages and lightens ridges, as shadow and highlight layers of up
// to @opacity and @highlightOpacity over the hillshade's signed tones. Over a
// tone of the same sign this is exact compositing; over the opposite tone it
// cancels that tone first.
export function applyTextureTones(tones, texture, valid, opacity, highlightOpacity) {
  var a, t, i;
  for (i = 0; i < tones.length; i++) {
    if (valid && !valid[i] || texture[i] === 0) continue;
    t = tones[i];
    if (texture[i] < 0) {
      a = opacity * -Math.tanh(texture[i]);
      tones[i] = t - a * (1 + Math.min(t, 0));
    } else if (highlightOpacity > 0) {
      a = highlightOpacity * Math.tanh(texture[i]);
      tones[i] = t + a * (1 - Math.max(t, 0));
    }
  }
  return tones;
}

function getElevationPercentiles(elev, valid, lo, hi) {
  var stride = Math.max(1, Math.floor(elev.length / 100000));
  var values = [];
  for (var i = 0; i < elev.length; i += stride) {
    if (valid && !valid[i]) continue;
    values.push(elev[i]);
  }
  if (values.length === 0) return [0, 0];
  values.sort(function(a, b) { return a - b; });
  return [values[Math.floor(lo * (values.length - 1))], values[Math.floor(hi * (values.length - 1))]];
}

function toWeights(valid) {
  var weights = new Float32Array(valid.length);
  for (var i = 0; i < valid.length; i++) weights[i] = valid[i] ? 1 : 0;
  return weights;
}
