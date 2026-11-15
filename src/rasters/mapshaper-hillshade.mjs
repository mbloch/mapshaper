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
export var DEFAULT_GAMMA = 0.7;
export var DEFAULT_HIGHLIGHT_RATIO = 0.6;

export var DEFAULT_LIGHTING = 'balanced';

// The lights of each lighting= scheme, as [azimuth relative to the main
// light, weight]
var LIGHTING_SCHEMES = {
  // side lights balanced around the main light, so that slopes turned the
  // same amount either way from it get the same light
  balanced: [[-90, 0.1], [-45, 0.2], [0, 0.4], [45, 0.2], [90, 0.1]],
  hard: [[0, 1]],
  // balanced, plus faint lights on slopes facing away from the main light,
  // for more midtones and less contrast
  soft: [[-135, 0.05], [-90, 0.1], [-45, 0.2], [0, 0.3], [45, 0.2], [90, 0.1], [135, 0.05]],
  // GDAL's -multidirectional (after Mark 1992), whose lights are at 225, 270,
  // 315 and 360 degrees; weighted per pixel (see ASPECT_WEIGHTED)
  gdal: [[-90, 1], [-45, 1], [0, 1], [45, 1]]
};

// Schemes whose lights are weighted at each pixel by cos^2 of the angle
// between the light and the direction the slope faces, as in GDAL
var ASPECT_WEIGHTED = {gdal: true};

export function getLightingSchemeNames() {
  return Object.keys(LIGHTING_SCHEMES);
}

// @lighting name of a scheme, or a list of lights for experimenting with:
//   comma-separated azimuth:weight[:altitude] entries, with azimuths relative
//   to the main light and altitude defaulting to @altitude
//   (e.g. -45:0.3,0:0.4,45:0.3)
// Returns null if @lighting is invalid
export function getHillshadeLights(azimuth, altitude, lighting) {
  var az = azimuth == null ? DEFAULT_AZIMUTH : azimuth;
  var alt = altitude == null ? DEFAULT_ALTITUDE : altitude;
  var name = lighting || DEFAULT_LIGHTING;
  var lights = parseLighting(name);
  var aspectWeighted = ASPECT_WEIGHTED[name] === true;
  return lights ? lights.map(function(o) {
    var light = {azimuth: az + o[0], altitude: o.length > 2 ? o[2] : alt, weight: o[1]};
    if (aspectWeighted) light.aspectWeighted = true;
    return light;
  }) : null;
}

function parseLighting(str) {
  var lights;
  if (Object.prototype.hasOwnProperty.call(LIGHTING_SCHEMES, str)) {
    return LIGHTING_SCHEMES[str];
  }
  lights = String(str).split(',').map(function(entry) {
    var parts = entry.split(':');
    var nums = parts.map(function(s) { return s.trim() === '' ? NaN : Number(s); });
    var ok = (parts.length == 2 || parts.length == 3) && nums.every(isFinite) &&
      nums[1] > 0 && (parts.length == 2 || nums[2] >= 0 && nums[2] <= 90);
    return ok ? nums : null;
  });
  return lights.every(Boolean) ? lights : null;
}

// Relief flattens out as pixels grow, so small-scale maps need more vertical
// exaggeration to read: none at 50 m per pixel, about 4.5 at 1 km.
// The shade of the brightest slope, the one facing the blend of @lights
// (flat ground is 1): 1 / sin(altitude) for a single light. A blend lights
// no slope as fully as one light can, so at 45 degrees the default lights
// top out at about 1.21, rather than 1.41.
export function getHillshadeMaxShade(lights) {
  var vec = [0, 0, 0], flat = 0, len, sum = 0;
  if (lights.length > 0 && lights[0].aspectWeighted) {
    return getAspectWeightedMaxShade(lights);
  }
  var dirs = lights.map(function(light) {
    var alt = light.altitude * Math.PI / 180;
    var az = (360 - light.azimuth + 90) * Math.PI / 180;
    var dir = [Math.cos(alt) * Math.cos(az), Math.cos(alt) * Math.sin(az), Math.sin(alt)];
    vec[0] += dir[0] * light.weight;
    vec[1] += dir[1] * light.weight;
    vec[2] += dir[2] * light.weight;
    flat += Math.sin(alt) * light.weight;
    return dir;
  });
  len = Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1] + vec[2] * vec[2]);
  if (!(flat > 0) || !(len > 0)) return 1;
  // a surface does not take negative light from a light behind it
  dirs.forEach(function(dir, i) {
    sum += Math.max(0, (dir[0] * vec[0] + dir[1] * vec[1] + dir[2] * vec[2]) / len) * lights[i].weight;
  });
  return Math.max(1, sum / flat);
}

// Aspect weighting has no closed form for the brightest slope, so this
// searches slopes in 0.5 degree steps and aspects in 1 degree steps
function getAspectWeightedMaxShade(lights) {
  var D = Math.PI / 180;
  var flat = 0, total = 0, max = 1;
  var slope, aspect, cs, ss, sum, wsum, ca, w, v, j;
  lights.forEach(function(light) {
    flat += light.weight * Math.sin(light.altitude * D);
    total += light.weight;
  });
  for (slope = 0.5; slope < 90; slope += 0.5) {
    cs = Math.cos(slope * D);
    ss = Math.sin(slope * D);
    for (aspect = 0; aspect < 360; aspect++) {
      sum = 0;
      wsum = 0;
      for (j = 0; j < lights.length; j++) {
        ca = Math.cos((lights[j].azimuth - aspect) * D);
        w = lights[j].weight * ca * ca;
        v = Math.sin(lights[j].altitude * D) * cs + Math.cos(lights[j].altitude * D) * ss * ca;
        if (v > 0) sum += w * v;
        wsum += w;
      }
      if (wsum > 0) max = Math.max(max, sum / wsum / (flat / total));
    }
  }
  return max;
}

// Rounded to a multiple of 0.25, so that the printed value is easy to read
// and to adjust
export function getAutoExaggeration(metersPerPixel) {
  if (!(metersPerPixel > 0)) return 1;
  return Math.round(Math.max(1, Math.min(10, Math.sqrt(metersPerPixel / 50))) * 4) / 4;
}

// Slope of the median pixel of a DEM fitted with getFittedVerticalScale()
export var FITTED_MEDIAN_SLOPE = 20;
var FIT_SAMPLES = 1e6;

// For a DEM whose values are in no known relation to its pixel size (e.g. one
// saved from an image editor, its values stretched to fill the pixel type's
// range): the factor to multiply its values by so that its median slope is
// FITTED_MEDIAN_SLOPE degrees, or 1 if the DEM is flat. A rougher DEM keeps
// steeper slopes than a smoother one, so the relief still looks like its own.
// @cellWidths, @cellHeights per-row size of a pixel, in any unit
export function getFittedVerticalScale(elev, valid, width, height, cellWidths, cellHeights) {
  var step = Math.max(1, Math.ceil(Math.sqrt(width * height / FIT_SAMPLES)));
  var grads = [];
  var x, y, i, dx, dy, g;
  for (y = 1; y < height - 1; y += step) {
    for (x = 1; x < width - 1; x += step) {
      i = y * width + x;
      if (valid && !(valid[i] && valid[i - 1] && valid[i + 1] && valid[i - width] && valid[i + width])) {
        continue;
      }
      dx = (elev[i + 1] - elev[i - 1]) / (2 * cellWidths[y]);
      dy = (elev[i + width] - elev[i - width]) / (2 * cellHeights[y]);
      g = Math.sqrt(dx * dx + dy * dy);
      if (isFinite(g)) grads.push(g);
    }
  }
  if (grads.length === 0) return 1;
  grads = Float64Array.from(grads).sort();
  // the median of a DEM with large flat areas is 0; a higher percentile still
  // describes its slopes
  g = grads[Math.floor(grads.length / 2)] || grads[Math.floor(grads.length * 0.9)];
  return g > 0 ? Math.tan(FITTED_MEDIAN_SLOPE * Math.PI / 180) / g : 1;
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
  var flat = 0, totalWeight = 0;
  var aspectWeighted = lights.length > 0 && !!lights[0].aspectWeighted;
  var prepared = lights.map(function(light) {
    var zenith = (90 - light.altitude) * Math.PI / 180;
    // mathematical angle of the direction the light comes from
    var az = (360 - light.azimuth + 90) * Math.PI / 180;
    flat += light.weight * Math.cos(zenith);
    totalWeight += light.weight;
    return {
      weight: light.weight,
      cosZ: Math.cos(zenith) * light.weight,
      sinZ: Math.sin(zenith) * light.weight,
      cosAz: Math.cos(az),
      sinAz: Math.sin(az)
    };
  });
  var flatPerWeight = flat / totalWeight;
  var n = prepared.length;
  var y, x, i, ym, yp, xm, xp, c, a, b, cc, d, f, g, h, k;
  var dzdx, dzdy, slope2, cosSlope, sinSlope, aspectCos, aspectSin, mag, sum, p, j;
  var cd, sd, rc, ca, w, wsum;
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
      // on flat ground every light gives the same shade, so the weights
      // don't matter
      if (aspectWeighted && mag > 0) {
        wsum = 0;
        for (j = 0; j < n; j++) {
          p = prepared[j];
          ca = p.cosAz * aspectCos + p.sinAz * aspectSin;
          w = ca * ca;
          // p.cosZ and p.sinZ include the light's weight
          var vw = p.cosZ * cosSlope + p.sinZ * sinSlope * ca;
          if (vw > 0) sum += w * vw;
          wsum += w * p.weight;
        }
        out[i] = wsum > 0 ? sum / wsum / flatPerWeight : 0;
        continue;
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

// Transparent shadows stay translucent, so the map shows through; opaque
// shading runs the full length of its color ramp.
// Hillshades made before the opaque flag record style=opaque instead
export function isOpaqueHillshade(derivation) {
  return !!derivation && (derivation.opaque === true || derivation.style == 'opaque');
}

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
// @style 'shadow' or 'opaque'; opaque tones run from -1 to 1, the ends of the
//   color ramp, and ignore the opacities
// @opts.maxOpacity 0-1, opacity of the darkest shadows
// @opts.highlightRatio opacity of the brightest highlights, as a fraction of
//   maxOpacity; the result is capped at 1
// @opts.gamma exponent of the tone curve
// @opts.maxShade shade of the brightest slope, which gets the full highlight
//   (see getHillshadeMaxShade()); without it there are no highlights
export function getHillshadeTones(shade, valid, style, opts) {
  var o = opts || {};
  var n = shade.length;
  var tones = new Float32Array(n);
  var opaque = style == 'opaque';
  var maxOpacity = opaque ? 1 : o.maxOpacity >= 0 ? Math.min(1, o.maxOpacity) : getDefaultMaxOpacity(style);
  var ratio = opaque ? 1 : o.highlightRatio >= 0 ? o.highlightRatio : getDefaultHighlightRatio();
  var maxHighlight = Math.min(1, maxOpacity * ratio);
  var gamma = o.gamma > 0 ? o.gamma : DEFAULT_GAMMA;
  var litRange = o.maxShade > 1 ? o.maxShade - 1 : 0;
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

// @tones from getHillshadeTones(), clamped to the -1 to 1 range
// @style 'shadow': shadows and highlights with alpha; flat ground is clear
//        'opaque': each tone's color in @colors.ramp
// @colors optional {shadow, highlight, ramp}: for the shadow style, shadow
//   and highlight colors as {r, g, b, a} objects from parseColor() (default
//   black and white), whose alpha scales the opacity of their tones; for the
//   opaque style, the colors of getHillshadeColorRamp() (required).
export function writeHillshadeRgba(tones, valid, style, colors) {
  var n = tones.length;
  var out = new Uint8Array(n * 4);
  var dark = getToneColor(colors && colors.shadow, 0);
  var light = getToneColor(colors && colors.highlight, 255);
  var ramp = style == 'opaque' ? colors.ramp : null;
  var i, j, t, c, a, k;
  for (i = 0, j = 0; i < n; i++, j += 4) {
    if (valid && !valid[i]) continue;
    t = tones[i];
    if (ramp) {
      k = Math.round((1 + (t < -1 ? -1 : t > 1 ? 1 : t)) * ramp.steps);
      out[j] = ramp.r[k];
      out[j + 1] = ramp.g[k];
      out[j + 2] = ramp.b[k];
      out[j + 3] = 255;
    } else if (t !== 0) {
      c = t < 0 ? dark : light;
      a = clamp01(t < 0 ? -t : t) * c.a;
      out[j] = c.r;
      out[j + 1] = c.g;
      out[j + 2] = c.b;
      out[j + 3] = Math.round(a * 255);
    }
  }
  return out;
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
