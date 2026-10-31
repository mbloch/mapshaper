import { getOklchInterpolator } from '../color/oklab';
import { parseColor } from '../color/color-utils';

// Pixel operations for -tone and -tint. Colors are adjusted in OKLab
// (https://bottosson.github.io/posts/oklab/); see
// docs/development/raster-tone-tint.md

var SEGMENT_SIZE = 256; // color ramp table entries between two breaks
var ENCODE_SIZE = 65536; // linear-to-sRGB table entries; fine enough to round-trip dark values exactly
var LIGHTNESS_STEPS = 4096; // lightness curve table intervals, interpolated linearly
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

// Adjusts the OKLCH lightness and chroma of each pixel of an RGB or RGBA
// image, keeping hue. Chroma is multiplied by opts.saturation. Lightness is
// raised to 1 / opts.gamma (above 1 lightens midtones), then moves toward
// black by 1 - opts.lightness (below 1) or toward white by
// opts.lightness - 1 (above 1, up to 2), so light colors never clip. Colors
// that end up outside the sRGB gamut lose chroma until they fit, at the same
// lightness and hue.
// @samples interleaved uint8 samples with @bands (3 or 4) per pixel; alpha
//   is copied
// Returns a new array of the same layout
export function toneRgbPixels(samples, bands, opts) {
  var sat = opts.saturation;
  var curve = getLightnessCurve(opts.lightness, opts.gamma > 0 ? opts.gamma : 1);
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

function getLightnessCurve(lightness, gamma) {
  var lighten = Math.max(0, lightness - 1);
  var scale = Math.min(1, lightness);
  var curve = new Float64Array(LIGHTNESS_STEPS + 1);
  var i, L;
  for (i = 0; i <= LIGHTNESS_STEPS; i++) {
    L = Math.pow(i / LIGHTNESS_STEPS, 1 / gamma);
    curve[i] = L * scale + (1 - L) * lighten;
  }
  return curve;
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
