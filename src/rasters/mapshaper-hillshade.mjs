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
export var DEFAULT_HIGHLIGHT_RATIO = 1;
// Where the shadow style's tone curve puts flat ground, as a share of the
// lightness from full shadow to the brightest highlight (see getToneCurves()).
// Fixed, so that highlights= and max-opacity= scale the tones without
// changing the curve's shape.
var SHADOW_STYLE_BASE_POSITION = 2 / 3;
// ambient= darkening per unit of weight, as a share of the max opacity;
// chosen so that the default keeps about the valley shadows of the earlier
// version, which darkened the shading instead of the tones
var AMBIENT_TONE_SCALE = 2;
// How much more ambient= takes from highlights than from shadows and flat
// ground, as if sky light were a larger share of the light. A highlight spans
// less shading per unit of opacity than a shadow, so 1 takes about 2.4 times
// less light from sunlit slopes than from shaded ones; about 2.4 takes the same
// amount, which grays out sunlit valleys.
var AMBIENT_HIGHLIGHT_FACTOR = 1.8;

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
  soft: [[-135, 0.05], [-90, 0.1], [-45, 0.2], [0, 0.3], [45, 0.2], [90, 0.1], [135, 0.05]]
};

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
  return lights ? lights.map(function(o) {
    return {azimuth: az + o[0], altitude: o.length > 2 ? o[2] : alt, weight: o[1]};
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
// The shade of the brightest slope, usually the one facing the blend of
// @lights (flat ground is 1): 1 / sin(altitude) for a single light. A blend
// lights no slope as fully as one light can, so at 45 degrees the default
// lights top out at about 1.21, rather than 1.41. When lights oppose each
// other, a slope turned from the blend can be brighter, because the lights it
// turns away from give no negative light, so the brightest slope is also
// searched for.
export function getHillshadeMaxShade(lights) {
  return Math.max(getBlendedMaxShade(lights), getSearchedMaxShade(lights));
}

// For the shadow style, whose flat ground is clear at any altitude: the share
// of the full highlight that the brightest slope gets. The slopes brighter
// than flat ground are those within about 90 - altitude degrees of the light,
// so a light higher than DEFAULT_ALTITUDE would put the full highlight on a
// small, sharp spot. Scaling it down by that angle keeps the highlights'
// falloff as gradual as at DEFAULT_ALTITUDE.
// @maxShade getHillshadeMaxShade() of the lights
// @refMaxShade the same, with the lights at DEFAULT_ALTITUDE
export function getHillshadeHighlightScale(maxShade, refMaxShade) {
  var angle = Math.acos(1 / Math.max(1, maxShade));
  var ref = Math.acos(1 / Math.max(1, refMaxShade));
  return ref > 0 && angle < ref ? angle / ref : 1;
}

// For the opaque style: the factor that makes a slope's tone a function of
// its angle to the light alone, the same function at every altitude, so that
// the highlights cover the same range of slopes. computeHillshade() divides
// by the light on flat ground; this rescales it to the light on flat ground
// at DEFAULT_ALTITUDE, relative to the brightest slope. So flat ground gets
// the base color at DEFAULT_ALTITUDE, and moves along the ramp from the
// shadow color to the highlight color as the light rises: a high light
// lights flat ground nearly as well as the slope facing it.
// Use with the tone curve of @refMaxShade.
// @maxShade getHillshadeMaxShade() of the lights
// @refMaxShade the same, with the lights at DEFAULT_ALTITUDE
export function getOpaqueShadeScale(maxShade, refMaxShade) {
  return maxShade > 0 ? refMaxShade / maxShade : 1;
}

// Searches slopes and aspects in 1 degree steps, then 0.05 degree steps
// around the brightest
function getSearchedMaxShade(lights) {
  var D = Math.PI / 180;
  var flat = 0;
  var prepared = lights.map(function(light) {
    flat += light.weight * Math.sin(light.altitude * D);
    return {
      azimuth: light.azimuth,
      sinAlt: Math.sin(light.altitude * D) * light.weight,
      cosAlt: Math.cos(light.altitude * D) * light.weight
    };
  });
  if (!(flat > 0)) return 1;
  var shade = function(slope, aspect) {
    var cs = Math.cos(slope * D), ss = Math.sin(slope * D);
    var sum = 0, v;
    for (var j = 0; j < prepared.length; j++) {
      v = prepared[j].sinAlt * cs + prepared[j].cosAlt * ss * Math.cos((prepared[j].azimuth - aspect) * D);
      if (v > 0) sum += v;
    }
    return sum / flat;
  };
  var best = {max: 1, slope: 0, aspect: 0};
  var search = function(slope0, slope1, aspect0, aspect1, step) {
    var slope, aspect, v;
    for (slope = Math.max(0, slope0); slope <= Math.min(90, slope1); slope += step) {
      for (aspect = aspect0; aspect <= aspect1; aspect += step) {
        v = shade(slope, aspect);
        if (v > best.max) best = {max: v, slope: slope, aspect: aspect};
      }
    }
  };
  search(0, 90, 0, 359, 1);
  search(best.slope - 1, best.slope + 1, best.aspect - 1, best.aspect + 1, 0.05);
  return best.max;
}

function getBlendedMaxShade(lights) {
  var vec = [0, 0, 0], flat = 0, len, sum = 0;
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

// Opacity of the darkest shadows, as getHillshadeTones() uses it
export function getToneMaxOpacity(style, opts) {
  var o = opts || {};
  if (style == 'opaque') return 1;
  return o.maxOpacity >= 0 ? Math.min(1, o.maxOpacity) : getDefaultMaxOpacity(style);
}

// Applies the tone curve to shading (see getToneCurves()). Tones are signed
// opacities: negative for shadows, positive for highlights, 0 on flat ground.
// @style 'shadow' or 'opaque'; opaque tones run from -1 to 1, the ends of the
//   color ramp, and ignore the opacities
// @opts.maxOpacity 0-1, opacity of the darkest shadows
// @opts.highlightRatio opacity of the brightest highlights, as a fraction of
//   maxOpacity; the result is capped at 1
// @opts.gamma steepness of the tone curve at flat ground
// @opts.maxShade shade of the brightest slope, which gets the full highlight
//   (see getHillshadeMaxShade()); without it there are no highlights
// @opts.highlightScale optional share of the full highlight that the
//   brightest slope gets instead (see getHillshadeHighlightScale())
// @opts.shadeScale optional factor applied to @shade first (see
//   getOpaqueShadeScale())
// @opts.basePosition for the opaque style: where the base color is on the
//   ramp, as a share of its lightness (see getHillshadeBasePosition())
export function getHillshadeTones(shade, valid, style, opts) {
  var o = opts || {};
  var n = shade.length;
  var tones = new Float32Array(n);
  var opaque = style == 'opaque';
  var maxOpacity = getToneMaxOpacity(style, o);
  var ratio = opaque ? 1 : o.highlightRatio >= 0 ? o.highlightRatio : getDefaultHighlightRatio();
  var maxHighlight = Math.min(1, maxOpacity * ratio) * (o.highlightScale >= 0 ? o.highlightScale : 1);
  var gamma = o.gamma > 0 ? o.gamma : DEFAULT_GAMMA;
  var litRange = o.maxShade > 1 ? o.maxShade - 1 : 0;
  var curves = getToneCurves(o.maxShade > 1 ? o.maxShade : 1, gamma,
    opaque ? o.basePosition : SHADOW_STYLE_BASE_POSITION);
  var shadowCurve = curves.shadow;
  var highlightCurve = curves.highlight;
  var shadeScale = o.shadeScale > 0 ? o.shadeScale : 1;
  var i, s;
  for (i = 0; i < n; i++) {
    if (valid && !valid[i]) continue;
    s = shade[i] * shadeScale;
    if (s < 1) {
      tones[i] = -shadowCurve(1 - s) * maxOpacity;
    } else if (s > 1 && litRange > 0) {
      tones[i] = highlightCurve((s - 1) / litRange) * maxHighlight;
    }
  }
  return tones;
}

// The tone curve: lightness is a cubic spline of the angle between a slope and
// the brightest slope, falling from the highlight color at 0 degrees to the
// base color on flat ground to the shadow color at 90 degrees, with flat ends.
// Lightness changes at the same rate on both sides of flat ground, so the edge
// between highlights and shadows is soft, where a curve that starts steeply
// at flat ground concentrates contrast there in a visible ring. That rate is the average rate (the whole lightness range over 90 degrees)
// divided by gamma, so gamma 1 is even, and lower gammas give more contrast to
// gentle slopes. The rate is capped where the spline would stop falling
// steadily.
// @maxShade see getHillshadeMaxShade()
// @basePosition 0-1, lightness of flat ground, as a share of the range from
//   the darkest shadow to the brightest highlight (default 0.8)
// Returns {shadow, highlight}: functions of the inputs of getHillshadeTones()'
//   curves, 1 - shade and (shade - 1) / (maxShade - 1)
function getToneCurves(maxShade, gamma, basePosition) {
  var b = basePosition >= 0 ? Math.min(0.95, Math.max(0.05, basePosition)) : 0.8;
  var flatAngle = Math.acos(1 / maxShade) * 180 / Math.PI;
  var rate = 1 / 90 / gamma;
  if (flatAngle > 0) rate = Math.min(rate, 3 * (1 - b) / flatAngle);
  rate = Math.min(rate, 3 * b / (90 - flatAngle));
  var lightness = function(s) {
    var deg = Math.acos(Math.min(1, s / maxShade)) * 180 / Math.PI;
    if (deg >= 90) return 0;
    return deg < flatAngle ?
      getHermiteValue(deg / flatAngle, 1, 0, b, -rate * flatAngle) :
      getHermiteValue((deg - flatAngle) / (90 - flatAngle), b, -rate * (90 - flatAngle), 0, 0);
  };
  return {
    shadow: getTabulatedCurve(function(d) {
      return Math.max(0, (b - lightness(1 - d)) / b);
    }),
    highlight: getTabulatedCurve(function(t) {
      return Math.max(0, (lightness(1 + t * (maxShade - 1)) - b) / (1 - b));
    })
  };
}

// Cubic Hermite interpolation at @t (0-1) between values @y0 and @y1, with
// slopes @m0 and @m1 per unit of @t
function getHermiteValue(t, y0, m0, y1, m1) {
  var t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
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

// Returns a function mapping 0-1 to 0-1. Curves are tabulated because
// computing them for every pixel is slow.
function getTabulatedCurve(f) {
  var steps = 1024;
  var table = new Float32Array(steps + 1);
  for (var i = 0; i <= steps; i++) {
    table[i] = f(i / steps);
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

// Darkens tones where the sky is hidden, as a shadow layer of opacity
// @weight * AMBIENT_TONE_SCALE * @maxOpacity * (1 - openness). Openness is 1
// on flat ground and on planar slopes, so these are left alone; valleys
// darken, and ridges (openness above 1) lighten. Applied to tones rather than
// to shading, because highlights span a much narrower range of shading than
// shadows: darkening the shading took most of the highlights from sunlit
// slopes in valleys, and darkened shaded slopes much less.
// Over a shadow this is exact compositing. A highlight is reduced
// AMBIENT_HIGHLIGHT_FACTOR times as fast, and any darkening left once it is
// gone becomes a shadow. Ridges are lightened as in applyTextureTones().
export function applyAmbientTones(tones, openness, valid, weight, maxOpacity) {
  var scale = weight * AMBIENT_TONE_SCALE * maxOpacity;
  var h = AMBIENT_HIGHLIGHT_FACTOR;
  var a, t;
  for (var i = 0; i < tones.length; i++) {
    if (valid && !valid[i]) continue;
    a = scale * (1 - openness[i]);
    t = tones[i];
    if (a > 0 && t > 0) {
      tones[i] = t >= a * h ? t - a * h : t / h - a;
    } else if (a > 0) {
      tones[i] = t - a * (1 + t);
    } else {
      tones[i] = t - a * (1 - Math.max(t, 0));
    }
  }
  return tones;
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

// Removes bright lines one pixel wide from signed tones, in place: a
// morphological opening with a 2x2 square (each pixel gets the brightest of
// the darkest values of the four 2x2 squares that contain it). Crest pixels
// otherwise come out brighter than both faces of a ridge, which reads as a
// knife edge: the 3x3 gradient of computeHillshade() blends the faces into a
// slope closer to the brightest one, and ambient= lightens the crest and
// darkens the pixels below it. Features two or more pixels wide and edges
// between light and dark areas are unchanged, and no pixel gets brighter.
// Invalid pixels and pixels outside the grid are ignored.
export function removeThinHighlights(tones, valid, width, height) {
  var n = width * height;
  var lows = new Float32Array(n);
  var x, y, i, v, m;
  for (y = 0; y < height; y++) {
    for (x = 0; x < width; x++) {
      i = y * width + x;
      m = Infinity;
      if (!valid || valid[i]) m = tones[i];
      if (x + 1 < width && (!valid || valid[i + 1]) && tones[i + 1] < m) m = tones[i + 1];
      if (y + 1 < height) {
        if ((!valid || valid[i + width]) && tones[i + width] < m) m = tones[i + width];
        if (x + 1 < width && (!valid || valid[i + width + 1]) && tones[i + width + 1] < m) m = tones[i + width + 1];
      }
      lows[i] = m;
    }
  }
  for (y = 0; y < height; y++) {
    for (x = 0; x < width; x++) {
      i = y * width + x;
      if (valid && !valid[i]) continue;
      m = lows[i];
      if (x > 0 && (v = lows[i - 1]) > m) m = v;
      if (y > 0) {
        if ((v = lows[i - width]) > m) m = v;
        if (x > 0 && (v = lows[i - width - 1]) > m) m = v;
      }
      tones[i] = m;
    }
  }
  return tones;
}

// How far, in pixels, values travel in removeThinHighlights()
export var THIN_HIGHLIGHT_REACH = 1;

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
