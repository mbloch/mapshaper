import { getOklchInterpolator } from '../color/oklab';
import { parseColor } from '../color/color-utils';

// Pixel operations for -tone and -tint. Colors are adjusted in OKLab
// (https://bottosson.github.io/posts/oklab/); see
// docs/development/raster-tone-tint.md

var SEGMENT_SIZE = 256; // color ramp table entries between two breaks
var ENCODE_SIZE = 65536; // linear-to-sRGB table entries; fine enough to round-trip dark values exactly
var TONE_TABLE_STEPS = 51; // lattice intervals per channel in getToneColorTable() (divides 255)
var LIGHTNESS_STEPS = 4096; // lightness curve table intervals, interpolated linearly
// Default hue-pivot=: OKLCH yellow-tan (ochre). Pure yellow (about 110°)
// would shift tan rock and dry grass toward yellow-green.
export var DEFAULT_HUE_PIVOT_DEGREES = 85;
var DEFAULT_HUE_PIVOT = DEFAULT_HUE_PIVOT_DEGREES * Math.PI / 180;
var HUE_SHIFT_MIN_CHROMA = 0.005;
var HUE_SHIFT_FULL_CHROMA = 0.03;
var GAMUT_STEPS = 12; // bisection steps when reducing chroma to fit the gamut

var decodeTable = null; // sRGB byte -> linear
var encodeTable = null; // linear (scaled to ENCODE_SIZE - 1) -> sRGB byte

function initTables() {
  var i, c;
  if (decodeTable) return;
  decodeTable = new Float64Array(256);
  for (i = 0; i < 256; i++) {
    c = i / 255;
    decodeTable[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  encodeTable = new Uint8Array(ENCODE_SIZE);
  for (i = 0; i < ENCODE_SIZE; i++) {
    c = i / (ENCODE_SIZE - 1);
    encodeTable[i] = Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  }
}

function encodeChannel(c) {
  return encodeTable[c <= 0 ? 0 : c >= 1 ? ENCODE_SIZE - 1 : Math.round(c * (ENCODE_SIZE - 1))];
}

// Adjusts the OKLCH lightness, chroma and hue of each pixel of an RGB or RGBA
// image. Chroma is multiplied by opts.saturation. Lightness follows a curve
// through black, the pivot lightnesses opts.pivots [lo, hi], and white:
// opts.contrast moves the pivots (see getContrastPivots()); between them,
// lightness is interpolated linearly, or along a gamma curve (opts.gamma above
// 1 lightens midtones); below and above them, it is scaled into the room
// that is left, so nothing clips. Lightness then moves toward black by
// 1 - opts.lightness (below 1) or toward white by opts.lightness - 1 (above 1,
// up to 2), so light colors never clip. Colors that end up outside the sRGB
// gamut lose chroma until they fit, at the same lightness and hue. Hues move
// toward opts.huePivot (degrees) by opts.hueShift (see getHueShiftRotation()).
// @samples interleaved uint8 samples with @bands (3 or 4) per pixel; alpha
//   is copied
// Returns a new array of the same layout
export function toneRgbPixels(samples, bands, opts) {
  var sat = opts.saturation;
  var hueShift = opts.hueShift || 0;
  var pivot = opts.huePivot == null ? DEFAULT_HUE_PIVOT : opts.huePivot * Math.PI / 180;
  var theta, cosT, sinT, A0;
  var pivots = opts.pivots || [0, 1];
  var contrast = opts.contrast == null ? 1 : opts.contrast;
  var curve = getLightnessCurve(opts.lightness, opts.gamma > 0 ? opts.gamma : 1, pivots,
    getContrastPivots(pivots, contrast));
  var curveMax = LIGHTNESS_STEPS - 1e-9;
  var out = new Uint8Array(samples.length);
  var rgb = [0, 0, 0];
  var i, j, r, g, b, l, m, s, L, A, B;
  initTables();
  for (i = 0; i < samples.length; i += bands) {
    r = decodeTable[samples[i]];
    g = decodeTable[samples[i + 1]];
    b = decodeTable[samples[i + 2]];
    l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    L = (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s) * LIGHTNESS_STEPS;
    L = L <= 0 ? 0 : L >= curveMax ? curveMax : L;
    j = L | 0;
    L = curve[j] + (curve[j + 1] - curve[j]) * (L - j);
    A = (1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s) * sat;
    B = (0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s) * sat;
    if (hueShift !== 0) {
      theta = getHueShiftRotation(A, B, hueShift, pivot);
      if (theta !== 0) {
        cosT = Math.cos(theta);
        sinT = Math.sin(theta);
        A0 = A;
        A = A0 * cosT - B * sinT;
        B = A0 * sinT + B * cosT;
      }
    }
    if (!oklabToLinear(L, A, B, rgb)) {
      fitChroma(L, A, B, rgb);
    }
    out[i] = encodeChannel(rgb[0]);
    out[i + 1] = encodeChannel(rgb[1]);
    out[i + 2] = encodeChannel(rgb[2]);
    if (bands > 3) out[i + 3] = samples[i + 3];
  }
  return out;
}

// Hue rotation (radians) for hue-shift=: hues move toward @pivot (radians) by
// @shift times their distance from it, fading out toward the opposite hue
// and for near-gray colors (whose hue is unstable). The rotation never passes
// the pivot, so hues keep their order for shifts up to 1.
function getHueShiftRotation(A, B, shift, pivot) {
  var C = Math.sqrt(A * A + B * B);
  var weight, delta;
  if (C <= HUE_SHIFT_MIN_CHROMA) return 0;
  weight = C >= HUE_SHIFT_FULL_CHROMA ? 1 : (C - HUE_SHIFT_MIN_CHROMA) / (HUE_SHIFT_FULL_CHROMA - HUE_SHIFT_MIN_CHROMA);
  delta = pivot - Math.atan2(B, A);
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  return shift * weight * delta * Math.cos(delta / 2);
}

// OKLCH hue of a color, in degrees, or null for a gray
export function getOklchHue(r, g, b) {
  var lab = [0, 0, 0];
  var h;
  srgbToOklab(r, g, b, lab);
  if (Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]) < 0.01) return null;
  h = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
  return h < 0 ? h + 360 : h;
}

function getLightnessCurve(lightness, gamma, pivots, contrastPivots) {
  var lighten = Math.max(0, lightness - 1);
  var scale = Math.min(1, lightness);
  var lo = pivots[0], hi = pivots[1], span = hi - lo;
  var lo2 = contrastPivots[0], hi2 = contrastPivots[1];
  var curve = new Float64Array(LIGHTNESS_STEPS + 1);
  var i, L, t;
  for (i = 0; i <= LIGHTNESS_STEPS; i++) {
    L = i / LIGHTNESS_STEPS;
    if (span > 0) {
      if (L <= lo) {
        L = lo > 0 ? L * lo2 / lo : lo2;
      } else if (L >= hi) {
        L = hi < 1 ? hi2 + (L - hi) * (1 - hi2) / (1 - hi) : hi2;
      } else {
        t = (L - lo) / span;
        if (gamma != 1) t = Math.pow(t, 1 / gamma);
        L = lo2 + (hi2 - lo2) * t;
      }
    }
    curve[i] = L * scale + (1 - L) * lighten;
  }
  return curve;
}

// Where contrast= moves the pivot lightnesses [lo, hi]: the range between
// them is multiplied by @contrast, up to the full range from black to white,
// and the room below and above them keeps its ratio. So the lightness that
// divides black to white in that ratio stays fixed, and a contrast change is
// undone by its reciprocal.
export function getContrastPivots(pivots, contrast) {
  var lo = pivots[0], hi = pivots[1];
  var room = lo + (1 - hi);
  var span = Math.min(1, (hi - lo) * contrast);
  var below = room > 0 ? lo / room : 0.5;
  return [(1 - span) * below, 1 - (1 - span) * (1 - below)];
}

// A 3D lookup table of toneRgbPixels() results for a lattice of RGB colors,
// for applying the same settings to many pixels quickly (e.g. a GUI preview).
// Lattice colors are whole bytes, so TONE_TABLE_STEPS divides 255.
// Returns {size, data}, where data has size^3 RGB triplets, blue varying fastest
export function getToneColorTable(opts) {
  var size = TONE_TABLE_STEPS + 1;
  var step = 255 / TONE_TABLE_STEPS;
  var samples = new Uint8Array(size * size * size * 3);
  var i = 0, r, g, b;
  for (r = 0; r < size; r++) {
    for (g = 0; g < size; g++) {
      for (b = 0; b < size; b++) {
        samples[i++] = r * step;
        samples[i++] = g * step;
        samples[i++] = b * step;
      }
    }
  }
  return {size: size, data: toneRgbPixels(samples, 3, opts)};
}

// Applies a table from getToneColorTable() to RGBA pixels, interpolating
// between lattice colors (trilinear); alpha is copied
// @src, @dst arrays of RGBA bytes (may be the same array)
export function applyToneColorTable(table, src, dst) {
  var size = table.size, data = table.data;
  var steps = size - 1;
  var f = steps / 255;
  var sb = 3, sg = size * 3, sr = size * size * 3;
  var i, c, fr, fg, fb, ir, ig, ib, dr, dg, db, k, v00, v01, v10, v11, v0, v1;
  for (i = 0; i < src.length; i += 4) {
    fr = src[i] * f;
    fg = src[i + 1] * f;
    fb = src[i + 2] * f;
    ir = fr < steps ? fr | 0 : steps - 1;
    ig = fg < steps ? fg | 0 : steps - 1;
    ib = fb < steps ? fb | 0 : steps - 1;
    dr = fr - ir;
    dg = fg - ig;
    db = fb - ib;
    k = ir * sr + ig * sg + ib * sb;
    for (c = 0; c < 3; c++) {
      v00 = data[k + c] + (data[k + c + sb] - data[k + c]) * db;
      v01 = data[k + c + sg] + (data[k + c + sg + sb] - data[k + c + sg]) * db;
      v10 = data[k + c + sr] + (data[k + c + sr + sb] - data[k + c + sr]) * db;
      v11 = data[k + c + sr + sg] + (data[k + c + sr + sg + sb] - data[k + c + sr + sg]) * db;
      v0 = v00 + (v01 - v00) * dg;
      v1 = v10 + (v11 - v10) * dg;
      dst[i + c] = Math.round(v0 + (v1 - v0) * dr);
    }
    dst[i + 3] = src[i + 3];
  }
  return dst;
}

// Lightnesses of an RGB or RGBA image at percentiles @pcts (0-100), from a
// sample of at most @maxSamples visible pixels
// @valid optional validity mask; pixels with alpha 0 are also skipped
// Returns an array of values, or null if no pixels are visible
export function getImageLightnessPercentiles(samples, bands, valid, pcts, maxSamples) {
  var n = samples.length / bands;
  var step = Math.max(1, Math.floor(n / maxSamples));
  var values = [];
  var lc = [0, 0];
  var i, j;
  for (i = 0; i < n; i += step) {
    j = i * bands;
    if (valid && !valid[i] || bands == 4 && samples[j + 3] === 0) continue;
    getOklchLightnessChroma(samples[j], samples[j + 1], samples[j + 2], lc);
    values.push(lc[0]);
  }
  if (values.length === 0) return null;
  values = Float64Array.from(values).sort();
  return pcts.map(function(pct) {
    return values[Math.round((values.length - 1) * pct / 100)];
  });
}

// Writes the OKLCH lightness and chroma of an sRGB color (bytes) to @out
export function getOklchLightnessChroma(r, g, b, out) {
  var lab = [0, 0, 0];
  srgbToOklab(r, g, b, lab);
  out[0] = Math.min(1, Math.max(0, lab[0]));
  out[1] = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
}

// Writes the OKLab L, a, b of an sRGB color (bytes) to @out
function srgbToOklab(r, g, b, out) {
  var l, m, s;
  initTables();
  r = decodeTable[r];
  g = decodeTable[g];
  b = decodeTable[b];
  l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  out[0] = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  out[1] = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
}

// Writes linear RGB to @rgb; returns false if the color is outside the gamut
function oklabToLinear(L, A, B, rgb) {
  var l = L + 0.3963377774 * A + 0.2158037573 * B;
  var m = L - 0.1055613458 * A - 0.0638541728 * B;
  var s = L - 0.0894841775 * A - 1.2914855480 * B;
  var r, g, b;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  rgb[0] = r;
  rgb[1] = g;
  rgb[2] = b;
  return r >= -1e-6 && r <= 1 + 1e-6 && g >= -1e-6 && g <= 1 + 1e-6 && b >= -1e-6 && b <= 1 + 1e-6;
}

// Finds the largest fraction of the chroma (A, B) that is in gamut at
// lightness L, and writes that color to @rgb
function fitChroma(L, A, B, rgb) {
  var lo = 0, hi = 1, mid;
  for (var i = 0; i < GAMUT_STEPS; i++) {
    mid = (lo + hi) / 2;
    if (oklabToLinear(L, A * mid, B * mid, rgb)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  oklabToLinear(L, A * lo, B * lo, rgb);
}

// A lookup table for mapping values onto a color ramp, interpolated in OKLCH
// between each pair of colors (as in vector color ramps). Each segment
// between two breaks has its own SEGMENT_SIZE entries, so that a narrow
// segment (e.g. 0 to 10 m in a ramp to 4000 m) is as smooth as a wide one,
// and each break's color is exact.
// @colors CSS colors
// @breaks the value of each color, increasing (equal values are allowed)
// Returns {r, g, b, breaks}: channel tables, indexed by getRampIndex()
export function getColorRampTable(colors, breaks) {
  var n = SEGMENT_SIZE;
  var segments = breaks.length - 1;
  var r = new Uint8Array(segments * n), g = new Uint8Array(segments * n), b = new Uint8Array(segments * n);
  var seg, interpolate, rgb, i, k;
  for (seg = 0; seg < segments; seg++) {
    interpolate = getOklchInterpolator(colors[seg], colors[seg + 1], {steps: n - 1});
    for (i = 0; i < n; i++) {
      rgb = parseColor(interpolate(i / (n - 1)).color);
      k = seg * n + i;
      r[k] = rgb.r;
      g[k] = rgb.g;
      b[k] = rgb.b;
    }
  }
  return {r: r, g: g, b: b, breaks: breaks};
}

// Values below the first break get the first color, values above the last
// break the last color
export function getRampIndex(table, val) {
  var breaks = table.breaks;
  var last = breaks.length - 1;
  var seg = 0;
  if (!(val > breaks[0])) return 0;
  if (val >= breaks[last]) return last * SEGMENT_SIZE - 1;
  while (val >= breaks[seg + 1]) seg++;
  return seg * SEGMENT_SIZE + Math.round((val - breaks[seg]) / (breaks[seg + 1] - breaks[seg]) * (SEGMENT_SIZE - 1));
}

// Applies opacity= and background= to an RGB or RGBA image.
// @background null or {r, g, b}: the image is composited over it, giving an
//   opaque RGB image (transparent pixels take the background color)
// Without a background, alpha is multiplied by @opacity, and the result is
// RGBA if it has any transparency.
// Returns {samples, bands}
export function applyOpacityAndBackground(samples, bands, opacity, background) {
  var n = samples.length / bands;
  var out, i, j, k, a;
  if (background) {
    out = new Uint8Array(n * 3);
    for (i = 0, j = 0, k = 0; i < n; i++, j += bands, k += 3) {
      a = (bands > 3 ? samples[j + 3] / 255 : 1) * opacity;
      out[k] = Math.round(samples[j] * a + background.r * (1 - a));
      out[k + 1] = Math.round(samples[j + 1] * a + background.g * (1 - a));
      out[k + 2] = Math.round(samples[j + 2] * a + background.b * (1 - a));
    }
    return {samples: out, bands: 3};
  }
  if (opacity >= 1) {
    return {samples: samples, bands: bands};
  }
  out = new Uint8Array(n * 4);
  for (i = 0, j = 0, k = 0; i < n; i++, j += bands, k += 4) {
    out[k] = samples[j];
    out[k + 1] = samples[j + 1];
    out[k + 2] = samples[j + 2];
    out[k + 3] = Math.round((bands > 3 ? samples[j + 3] : 255) * opacity);
  }
  return {samples: out, bands: 4};
}
