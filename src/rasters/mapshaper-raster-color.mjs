import { getOklchInterpolator, oklabToOklch, oklchToRgb, rgbToOklab } from '../color/oklab';
import { parseColor } from '../color/color-utils';
import { error } from '../utils/mapshaper-logging';

// Pixel operations for -tone and -hillshade. Colors are adjusted in OKLab
// (https://bottosson.github.io/posts/oklab/); see
// docs/development/raster-tone-tint.md

var SEGMENT_SIZE = 256; // hillshade color ramp entries between two colors
var ENCODE_SIZE = 65536; // linear-to-sRGB table entries; fine enough to round-trip dark values exactly
var TONE_TABLE_STEPS = 51; // lattice intervals per channel in getToneColorTable() (divides 255)
var LIGHTNESS_STEPS = 4096; // lightness curve table intervals, interpolated linearly
var CONTRAST_CENTER_MIN = 0.25;
var CONTRAST_CENTER_MAX = 0.75;
// Default hue-pivot=: OKLCH yellow-tan (ochre). Pure yellow (about 110°)
// would shift tan rock and dry grass toward yellow-green.
export var DEFAULT_HUE_PIVOT_DEGREES = 85;
var DEFAULT_HUE_PIVOT = DEFAULT_HUE_PIVOT_DEGREES * Math.PI / 180;
var HUE_SHIFT_MIN_CHROMA = 0.005;
var HUE_SHIFT_FULL_CHROMA = 0.03;
var GAMUT_STEPS = 12; // bisection steps when reducing chroma to fit the gamut
// blendShadingPixels() depthChroma: hues of colors below DEPTH_FULL_CHROMA
// are less reliable, and get less of it, none below DEPTH_MIN_CHROMA
var DEPTH_MIN_CHROMA = 0.005;
var DEPTH_FULL_CHROMA = 0.02;
// depthChroma fades in until a shadow has removed this share of a color's
// lightness, so that faint shadows match unshaded ground
var DEFAULT_DEPTH_FADE = 0.4;
var DEFAULT_EVENNESS_LIGHTNESS = 0.8;

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
// image. Chroma is multiplied by opts.saturation. opts.pivots are the
// image's [lo, hi, median] lightness: between lo and hi, lightness follows a
// gamma curve (opts.gamma above 1 lightens midtones); then opts.contrast
// spreads or flattens lightness around the median (see applyContrast()),
// and opts.lightness (0-2) darkens or lightens it, keeping its contrast
// (see applyLightness()), all without clipping. Colors that end up outside the sRGB
// gamut lose chroma until they fit, at the same lightness and hue. Hues move
// toward opts.huePivot (degrees) by opts.hueShift (see getHueShiftRotation()).
// @samples interleaved uint8 samples with @bands (3 or 4) per pixel; alpha
//   is copied
// @out optional array of the same layout to write to (e.g. a canvas's pixels)
// Returns @out, or a new Uint8Array
export function toneRgbPixels(samples, bands, opts, out) {
  var sat = opts.saturation;
  var hueShift = opts.hueShift || 0;
  var pivot = opts.huePivot == null ? DEFAULT_HUE_PIVOT : opts.huePivot * Math.PI / 180;
  var theta, cosT, sinT, A0;
  var pivots = opts.pivots || [0, 1];
  var contrast = opts.contrast == null ? 1 : opts.contrast;
  var curve = getLightnessCurve(opts.lightness, opts.gamma > 0 ? opts.gamma : 1, contrast, pivots);
  var curveMax = LIGHTNESS_STEPS - 1e-9;
  var rgb = [0, 0, 0];
  var i, j, r, g, b, l, m, s, L, A, B;
  out = out || new Uint8Array(samples.length);
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

// Applies shading to an RGB or RGBA image (see docs/development/raster-blend.md)
// @amounts one signed amount per pixel: below 0, the opacity of opts.shadow
//   stacked on the pixel; above 0, the opacity of opts.highlight
// The result has the lightness of the stacked pixel. Its OKLab a and b move
// from the stacked pixel's toward the image's by opts.shadowChroma or
// opts.highlightChroma: 0 is plain stacking, 1 keeps the image's color.
// Above 1, they move on past the image's, away from the image stacked with a
// gray of the shading color's lightness, so that a colored shadow or
// highlight makes the image's own color more vivid rather than pushing it
// toward the opposite hue.
// opts:
//   shadow, highlight  {r, g, b} bytes
//   shadowChroma, highlightChroma  0 or more
//   clip  keep the image's alpha (see below)
//   depthChroma, depthFade, evenness, evennessLightness  off unless
//     depthChroma or evenness is given (-blend gives them; see
//     docs/development/raster-blend.md):
//     shadowChroma times depthChroma of OKLCH chroma is added to a shadow in
//     the image's hue per unit of lightness the shadow takes away (less on
//     near-grays, and less until the shadow has taken away the share
//     depthFade (default 0.4) of the image's lightness);
//     evenness (0-1) moves the lightness change of shadows and highlights
//     from stacking's toward the change stacking makes on a color of
//     lightness evennessLightness (default 0.8), so that lighter colors get
//     fainter shadows and stronger highlights, and darker colors the
//     opposite (see getEvenLightness())
// Where the image is partly or fully transparent, the shading is stacked on
// nothing, so the output alpha can exceed the image's; with opts.clip, the
// shading is clipped to the image instead: the output has the color of the
// shaded pixel made opaque, and the image's alpha.
// @out optional array of @samples' layout to write to (e.g. a canvas's pixels)
// Returns @out, or a new Uint8Array
export function blendShadingPixels(samples, bands, amounts, opts, out) {
  var shadow = opts.shadow, highlight = opts.highlight;
  var depth = opts.depthChroma || 0;
  var depthFade = opts.depthFade >= 0 ? opts.depthFade : DEFAULT_DEPTH_FADE;
  var evenness = opts.evenness || 0;
  // away from 0 and 1, where shadows or highlights would vanish
  var evenL = opts.evennessLightness > 0 ?
    Math.max(0.05, Math.min(0.95, opts.evennessLightness)) : DEFAULT_EVENNESS_LIGHTNESS;
  var rgb = [0, 0, 0];
  var lab = [0, 0, 0];
  var i, k, a, ta, oa, K, G, q, r, g, b, sr, sg, sb, A, B, w;
  var shade, even, deep, L, Li, Ai, Bi, C, f;
  out = out || new Uint8Array(samples.length);
  initTables();
  // the grays for chroma above 1, or null for a shading color that is gray
  var shadowGray = getChromaGray(shadow, lab, rgb);
  var highlightGray = getChromaGray(highlight, lab, rgb);
  for (i = 0, k = 0; i < samples.length; i += bands, k++) {
    a = amounts[k];
    r = samples[i];
    g = samples[i + 1];
    b = samples[i + 2];
    ta = bands > 3 ? samples[i + 3] / 255 : 1;
    if (a === 0 || a !== a) {
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      if (bands > 3) out[i + 3] = samples[i + 3];
      continue;
    }
    shade = a < 0;
    K = shade ? shadow : highlight;
    G = shade ? shadowGray : highlightGray;
    q = shade ? opts.shadowChroma : opts.highlightChroma;
    a = shade ? (a < -1 ? 1 : -a) : (a > 1 ? 1 : a);
    even = evenness > 0;
    deep = shade && depth > 0 && q > 0;
    sr = r + (K.r - r) * a;
    sg = g + (K.g - g) * a;
    sb = b + (K.b - b) * a;
    if ((q !== 0 || even || deep) && ta > 0) {
      srgbToOklab(r, g, b, lab);
      Li = lab[0];
      Ai = lab[1];
      Bi = lab[2];
      if (q > 1 && G) {
        srgbToOklab(Math.round(r + (G - r) * a), Math.round(g + (G - g) * a), Math.round(b + (G - b) * a), lab);
        A = Ai + (Ai - lab[1]) * (q - 1);
        B = Bi + (Bi - lab[2]) * (q - 1);
      }
      srgbToOklab(Math.round(sr), Math.round(sg), Math.round(sb), lab);
      L = lab[0];
      if (!(q > 1 && G)) {
        A = lab[1] + (Ai - lab[1]) * q;
        B = lab[2] + (Bi - lab[2]) * q;
      }
      if (even) {
        L = shade ? getEvenLightness(Li, L, evenness, evenL) :
          1 - getEvenLightness(1 - Li, 1 - L, evenness, 1 - evenL);
      }
      if (deep) {
        C = Math.sqrt(Ai * Ai + Bi * Bi);
        f = (C - DEPTH_MIN_CHROMA) / (DEPTH_FULL_CHROMA - DEPTH_MIN_CHROMA);
        f = f < 0 ? 0 : f > 1 ? 1 : f;
        if (f > 0 && Li > L) {
          f *= q * depth * (Li - L) * getDepthFade((Li - L) / Li, depthFade) / C;
          A += Ai * f;
          B += Bi * f;
        }
      }
      if (!oklabToLinear(L, A, B, rgb)) {
        fitChroma(L, A, B, rgb);
      }
      sr = encodeChannel(rgb[0]);
      sg = encodeChannel(rgb[1]);
      sb = encodeChannel(rgb[2]);
    }
    if (ta == 1 || opts.clip) {
      out[i] = Math.round(sr);
      out[i + 1] = Math.round(sg);
      out[i + 2] = Math.round(sb);
      if (bands > 3) out[i + 3] = samples[i + 3];
      continue;
    }
    // the blended image over the shading alone (with chroma 0, the same as
    // the shading stacked on the partly transparent image)
    oa = ta + (1 - ta) * a;
    w = ta / oa;
    sr = sr * w + K.r * (1 - w);
    sg = sg * w + K.g * (1 - w);
    sb = sb * w + K.b * (1 - w);
    out[i] = Math.round(sr);
    out[i + 1] = Math.round(sg);
    out[i + 2] = Math.round(sb);
    out[i + 3] = Math.round(oa * 255);
  }
  return out;
}

// A shadow's lightness with evenness @t (0-1). Stacking multiplies the
// image's lightness @L by m (@Ls / @L); at 1, the image's lightness is
// multiplied by m raised to the power @Lref / @L, which for faint shadows
// takes away about what stacking takes from lightness @Lref, and never goes
// below 0. Highlights use it on the distance from white (1 - lightness),
// which stacking white multiplies in roughly the same way.
function getEvenLightness(L, Ls, t, Lref) {
  if (!(L > 0) || !(Ls < L)) return Ls;
  return L * Math.pow(Ls / L, Math.pow(Lref / L, t));
}

// Rises quickly from 0 and levels off toward 1 as @share (of lightness
// removed) grows, reaching 0.95 at @fade; the added chroma, which is this
// times the lightness removed, still starts flat
function getDepthFade(share, fade) {
  return fade > 0 ? 1 - Math.exp(-3 * share / fade) : 1;
}

// The sRGB channel value of the gray with the OKLab lightness of @color
// {r, g, b}, or null if @color is gray already
// @lab, @rgb scratch arrays
function getChromaGray(color, lab, rgb) {
  if (color.r == color.g && color.g == color.b) return null;
  srgbToOklab(color.r, color.g, color.b, lab);
  oklabToLinear(lab[0], 0, 0, rgb);
  return encodeChannel(rgb[0]);
}

// The shading as an RGBA overlay that, stacked on the image (in sRGB, as
// browsers and resvg composite), gives the image blended with the shading
// @samples RGBA image
// @blended blendShadingPixels() output for @samples with opts.clip, which
//   gives each pixel the blended color it would have if it were opaque
// @amounts, opts  as given to blendShadingPixels()
// On an opaque image pixel the overlay has the least alpha that gives the
// blended color exactly. A partly transparent pixel (such as one on the
// edge of a polygon, or on the seam between two) gets that overlay over the
// part the image covers; over the rest, what is under it is unknown, so it
// gets the shading color at the amount's opacity, as in plain stacking --
// or nothing with opts.clip, so that the shading is clipped to the image.
// @out optional array of @samples' length to write to
// Returns @out, or a new Uint8Array of RGBA pixels
export function getShadingOverlayPixels(samples, blended, amounts, opts, out) {
  var color = [0, 0, 0];
  var i, k, a, K, c, t, r, need, alpha, a8, ta, au, oa;
  if (out) {
    out.fill(0);
  } else {
    out = new Uint8Array(samples.length);
  }
  for (i = 0, k = 0; i < samples.length; i += 4, k++) {
    a = amounts[k];
    if (a === 0 || a !== a) continue;
    ta = samples[i + 3] / 255;
    alpha = 0;
    for (c = 0; c < 3 && ta > 0; c++) {
      t = samples[i + c];
      r = blended[i + c];
      need = r > t ? (r - t) / (255 - t) : r < t ? (t - r) / t : 0;
      if (need > alpha) alpha = need;
    }
    if (alpha > 0) {
      a8 = Math.ceil(alpha * 255 - 1e-9);
      alpha = a8 / 255;
      for (c = 0; c < 3; c++) {
        t = samples[i + c];
        color[c] = Math.max(0, Math.min(255, Math.round(t + (blended[i + c] - t) / alpha)));
      }
    }
    if (ta == 1) {
      if (alpha === 0) continue;
      out[i] = color[0];
      out[i + 1] = color[1];
      out[i + 2] = color[2];
      out[i + 3] = a8;
      continue;
    }
    K = a < 0 ? opts.shadow : opts.highlight;
    au = opts.clip ? 0 : Math.min(1, Math.abs(a));
    oa = ta * alpha + (1 - ta) * au;
    if (oa === 0) continue;
    out[i] = Math.round((ta * alpha * color[0] + (1 - ta) * au * K.r) / oa);
    out[i + 1] = Math.round((ta * alpha * color[1] + (1 - ta) * au * K.g) / oa);
    out[i + 2] = Math.round((ta * alpha * color[2] + (1 - ta) * au * K.b) / oa);
    out[i + 3] = Math.round(oa * 255);
  }
  return out;
}

// Hue rotation (radians) for hue-shift=: hues move toward @pivot (radians) by
// @shift times half their distance from it, fading out toward the opposite
// hue and for near-gray colors (whose hue is unstable). From -1 to 1, the
// rotation never passes the pivot and hues keep their order; below about
// -1.2, hues pushed away from the pivot would cross near the opposite hue.
function getHueShiftRotation(A, B, shift, pivot) {
  var C = Math.sqrt(A * A + B * B);
  var weight, delta;
  if (C <= HUE_SHIFT_MIN_CHROMA) return 0;
  weight = C >= HUE_SHIFT_FULL_CHROMA ? 1 : (C - HUE_SHIFT_MIN_CHROMA) / (HUE_SHIFT_FULL_CHROMA - HUE_SHIFT_MIN_CHROMA);
  delta = pivot - Math.atan2(B, A);
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  return 0.5 * shift * weight * delta * Math.cos(delta / 2);
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

// Gamma, then contrast, then lightness= (see toneRgbPixels())
function getLightnessCurve(lightness, gamma, contrast, pivots) {
  var lo = pivots[0], hi = pivots[1], span = hi - lo;
  var center = getContrastCenter(pivots);
  var curve = new Float64Array(LIGHTNESS_STEPS + 1);
  var i, L;
  function applyGamma(L) {
    return gamma != 1 && span > 0 && L > lo && L < hi ?
      lo + span * Math.pow((L - lo) / span, 1 / gamma) : L;
  }
  // contrast= leaves the center where it is
  var knee = applyGamma(center);
  for (i = 0; i <= LIGHTNESS_STEPS; i++) {
    L = applyGamma(i / LIGHTNESS_STEPS);
    if (contrast != 1) L = applyContrast(L, contrast, center);
    if (lightness != 1) L = applyLightness(L, lightness, knee);
    curve[i] = L;
  }
  return curve;
}

// Lightness @L after lightness= @k, which moves the median @m toward white by
// k - 1 of the way (above 1) or toward black by 1 - k (below 1), keeping the
// image's contrast. Lightening, everything at or below @m moves up by the
// same amount, and above @m the curve leaves @m at a slope of 1 and bends to
// end at white (k u / (1 + (k - 1) u), as in applyContrast()), so the lights
// are compressed rather than clipped. Darkening is the mirror image. At 2 and
// 0, the median reaches white or black.
export function applyLightness(L, k, m) {
  var m2, room, room2, u;
  if (k > 1) {
    m2 = m + (k - 1) * (1 - m);
    if (L <= m) return L + m2 - m;
    room = 1 - m;
    room2 = 1 - m2;
  } else {
    m2 = m * k;
    if (L >= m) return L - (m - m2);
    room = m;
    room2 = m2;
  }
  if (room2 <= 0) return k > 1 ? 1 : 0;
  u = k > 1 ? (L - m) / room : (m - L) / room;
  // distance from m2 is room u / (1 + (r - 1) u), r = room / room2, which
  // has slope 1 at m2 and covers room2 at u = 1
  u = room * u / (1 + (room / room2 - 1) * u);
  return k > 1 ? m2 + u : m2 - u;
}

// The lightness contrast= centers on: the image's median lightness, kept
// away from black and white so that a mostly dark or mostly snowy image
// still has room on both sides for its midtones to spread
// @pivots [lo, hi, median], from getImageLightnessPercentiles()
export function getContrastCenter(pivots) {
  var median = pivots && pivots.length > 2 ? pivots[2] : 0.5;
  return Math.max(CONTRAST_CENTER_MIN, Math.min(CONTRAST_CENTER_MAX, median));
}

// Lightness @L after contrast @k around @center. Below 1, every lightness
// moves toward the center in proportion (black and white too, so that dark
// and light pixels are not left behind as specks); 0 is flat. Above 1, the
// slope at the center is @k, and each side bends toward black or white
// (k u / (1 + (k - 1) u) of the distance), so midtones spread by about @k
// for any image, and the extremes are compressed rather than clipped.
export function applyContrast(L, k, center) {
  var u;
  if (k <= 1) return center + (L - center) * k;
  if (L >= center) {
    u = (L - center) / (1 - center);
    return center + (1 - center) * k * u / (1 + (k - 1) * u);
  }
  u = (center - L) / center;
  return center - center * k * u / (1 + (k - 1) * u);
}

// A 3D lookup table of toneRgbPixels() results for a lattice of RGB colors,
// for applying the same settings to many pixels quickly (e.g. a GUI preview).
// Lattice colors are whole bytes, so the number of steps divides 255.
// @steps optional lattice intervals per channel (default TONE_TABLE_STEPS);
//   17 is about 25 times faster to build, but less accurate where colors
//   are pushed outside the gamut
// Returns {size, data}, where data has size^3 RGB triplets, blue varying fastest
export function getToneColorTable(opts, steps) {
  var size, step;
  steps = steps || TONE_TABLE_STEPS;
  if (255 % steps !== 0) error('Tone table steps should divide 255');
  size = steps + 1;
  step = 255 / steps;
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
    if (bands == 1) {
      getOklchLightnessChroma(samples[j], samples[j], samples[j], lc);
    } else {
      getOklchLightnessChroma(samples[j], samples[j + 1], samples[j + 2], lc);
    }
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

// The colors of opaque shaded relief: a ramp from the shadow color (tone -1,
// full shadow) through the base color (tone 0, flat ground) to the highlight
// color (tone 1, the brightest slope), interpolated in OKLCH.
// @stops from getHillshadeRampColors()
// Returns {r, g, b, steps}: tone t is at index Math.round((t + 1) * steps)
export function getHillshadeColorRamp(stops) {
  var steps = SEGMENT_SIZE;
  var r = new Uint8Array(steps * 2 + 1), g = new Uint8Array(steps * 2 + 1), b = new Uint8Array(steps * 2 + 1);
  var toBase = getOklchInterpolator(formatRgb(stops.shadow), formatRgb(stops.base));
  var toHighlight = getOklchInterpolator(formatRgb(stops.base), formatRgb(stops.highlight));
  var i, rgb;
  for (i = 0; i <= steps * 2; i++) {
    rgb = parseColor(i <= steps ? toBase(i / steps).color : toHighlight(i / steps - 1).color);
    r[i] = rgb.r;
    g[i] = rgb.g;
    b[i] = rgb.b;
  }
  return {r: r, g: g, b: b, steps: steps};
}

// Where the base color is on the ramp from the shadow color to the
// highlight color, when it is derived from them. A slope tilted a little
// toward the light then gets as much lighter as one tilted away gets darker:
// the brightest slope was 1.25 times as bright as flat ground under the
// former default lights (1.21 under the current ones), so highlight tones
// are scaled four times as much as shadow tones, and the shadow half of the
// ramp gets four times the lightness range. (The weight is fixed rather than
// following 1 / getHillshadeMaxShade() so that altitude= and lighting= don't
// change the colors.)
var HILLSHADE_BASE_WEIGHT = 0.8;
// The default colors: the shadow color that #dfdfdf gets, with a darker base
// for more highlight headroom (75% of the way to white)
var DEFAULT_HILLSHADE_SHADOW = {r: 104, g: 104, b: 104};
var DEFAULT_HILLSHADE_BASE = {r: 215, g: 215, b: 215};
var DEFAULT_HILLSHADE_HIGHLIGHT = {r: 255, g: 255, b: 255};

// The three colors of opaque shading. The highlight color defaults to white.
// A missing base color is HILLSHADE_BASE_WEIGHT of the way from the shadow
// color to the highlight color, or #d7d7d7 if the shadow color is missing
// too. A missing shadow color is derived from the base color (see
// getHillshadeShadowColor()), or #686868 if all three are missing.
// @shadow, @base, @highlight {r, g, b} or null
// Returns {shadow, base, highlight}, as {r, g, b} objects
export function getHillshadeRampColors(shadow, base, highlight) {
  var light = toRgb(highlight || DEFAULT_HILLSHADE_HIGHLIGHT);
  var mid = base ? toRgb(base) : shadow ?
    parseColor(getOklchInterpolator(formatRgb(shadow), formatRgb(light))(HILLSHADE_BASE_WEIGHT).color) :
    toRgb(DEFAULT_HILLSHADE_BASE);
  var dark = shadow ? toRgb(shadow) : !base && !highlight ? toRgb(DEFAULT_HILLSHADE_SHADOW) :
    getHillshadeShadowColor(mid, 1);
  return {shadow: dark, base: mid, highlight: light};
}

// The shadow color of opaque shading derived from the base color: the base's
// hue and chroma (as much as the gamut has room for), and a lightness from
// getDerivedShadowLightness(). (Extrapolating hue and chroma from the base and
// highlight colors as well would multiply small differences between them into
// a strong, unrelated color.)
// With a chosen shadow color, a strength up to 1 fades from the base color to
// it, and a strength above 1 darkens it by as much again as it is darker than
// the base, keeping its hue and chroma. A chosen color equal to the derived
// one gives the derived colors at every strength.
// @base {r, g, b}
// @strength 0 (flat: the base color) to 2; 1 is the default shadow
// @color {r, g, b} or null, a chosen shadow color
export function getHillshadeShadowColor(base, strength, color) {
  var lch = oklabToOklch(rgbToOklab(base));
  var ratio = getDefaultShadowRatio();
  var l, step;
  if (!color) {
    l = lch.l - strength * (lch.l - getDerivedShadowLightness(lch.l));
    return toRgb(oklchToRgb({l: Math.max(0, l), c: lch.c, h: lch.h}));
  }
  if (strength <= 1) {
    return mixOklab(base, color, Math.max(0, strength));
  }
  lch = oklabToOklch(rgbToOklab(color));
  step = rgbToOklab(base).l - lch.l;
  // a chosen color no darker than the base is darkened as a derived color of
  // its lightness would be
  if (!(step > 0)) step = lch.l * (1 - ratio) / ratio;
  l = lch.l - (strength - 1) * step;
  return toRgb(oklchToRgb({l: Math.max(0, l), c: lch.c, h: lch.h}));
}

// Lightness of the derived shadow color of a base color of lightness @l. A
// base as light as the default base color or darker gets a shadow in the same
// ratio to it as the default colors have, so that shading has the same
// contrast whatever the base color. A lighter base would then sit higher and
// higher on the ramp to white, leaving little room for highlights, so it gets
// a shadow that keeps it where the default base is on the ramp (75% of the
// way from the shadow to white). The two meet at the default base color.
function getDerivedShadowLightness(l) {
  var pos = getDefaultBasePosition();
  return Math.max(l * getDefaultShadowRatio(), (l - pos) / (1 - pos));
}

// The highlight color of opaque shading derived from the base color: the
// base's hue, toward white; or with a chosen highlight color, toward it
// @base {r, g, b}
// @strength 0 (flat: the base color) to 1 (white or the chosen color, the
//   default)
// @color {r, g, b} or null
export function getHillshadeHighlightColor(base, strength, color) {
  return mixOklab(base, color || {r: 255, g: 255, b: 255}, Math.max(0, Math.min(1, strength)));
}

// The colors -blend stacks for an opaque hillshade: black and white, tinted
// by how the hillshade's shadow and highlight colors differ from the plain
// ones of the same lightness (the base's hue and chroma, darker; the base
// faded toward white), so that auto and gray colors blend black and white,
// and a bluish shadow color blends bluish shadows. A tint is the color
// difference as stacking would make it at the opacity of the deepest shadow
// or brightest highlight, clipped to the 0-255 range (shifting it back into
// range instead would lighten shadows and darken highlights).
// @stops {shadow, base, highlight} {r, g, b}
// @maxShadow, @maxHighlight the opacities the darkest and lightest tones
//   blend at (see decodeOpaqueHillshadeShading())
// Returns {shadow, highlight}, as {r, g, b} bytes
export function getOpaqueHillshadeStackingColors(stops, maxShadow, maxHighlight) {
  var base = oklabToOklch(rgbToOklab(stops.base));
  var plainShadow = toRgb(oklchToRgb({l: rgbToOklab(stops.shadow).l, c: base.c, h: base.h}));
  var t = base.l < 1 ? (rgbToOklab(stops.highlight).l - base.l) / (1 - base.l) : 1;
  var plainHighlight = mixOklab(stops.base, {r: 255, g: 255, b: 255}, Math.max(0, Math.min(1, t)));
  return {
    shadow: getStackingTint(stops.shadow, plainShadow, maxShadow, 0),
    highlight: getStackingTint(stops.highlight, plainHighlight, maxHighlight, 255)
  };
}

// @plain the color @color would be without a tint
// @start 0 (black) or 255 (white), the color tinted
function getStackingTint(color, plain, opacity, start) {
  var d = [color.r - plain.r, color.g - plain.g, color.b - plain.b];
  // within rounding of the plain color
  if (d.every(function(v) { return Math.abs(v) <= 2; })) {
    return {r: start, g: start, b: start};
  }
  d = d.map(function(v) { return Math.round(Math.max(0, Math.min(255, start + v / opacity))); });
  return {r: d[0], g: d[1], b: d[2]};
}

// @t 0 (@a) to 1 (@b), in Oklab
function mixOklab(a, b, t) {
  var p = rgbToOklab(a), q = rgbToOklab(b);
  var lab = {l: p.l + t * (q.l - p.l), a: p.a + t * (q.a - p.a), b: p.b + t * (q.b - p.b)};
  return toRgb(oklchToRgb(oklabToOklch(lab)));
}

// The inverses of getHillshadeShadowColor() and getHillshadeHighlightColor(),
// for showing the strengths of given colors (approximately, if their hue isn't
// the base's)
export function getHillshadeShadowStrength(base, shadow) {
  var b = rgbToOklab(base).l;
  var range = b - getDerivedShadowLightness(b);
  if (!(range > 0)) return 1;
  return (b - rgbToOklab(shadow).l) / range;
}

export function getHillshadeHighlightStrength(base, highlight) {
  var b = rgbToOklab(base).l;
  return b < 1 ? (rgbToOklab(highlight).l - b) / (1 - b) : 1;
}

// lightness of the default shadow color as a share of the default base color's
function getDefaultShadowRatio() {
  return rgbToOklab(DEFAULT_HILLSHADE_SHADOW).l / rgbToOklab(DEFAULT_HILLSHADE_BASE).l;
}

// where the default base color is on the ramp from the default shadow color
// to white, as a share of lightness
function getDefaultBasePosition() {
  var s = rgbToOklab(DEFAULT_HILLSHADE_SHADOW).l;
  return (rgbToOklab(DEFAULT_HILLSHADE_BASE).l - s) / (1 - s);
}

// Where the base color is on the ramp from the shadow color to the highlight
// color, as a share of their difference in lightness (0.5 if they don't differ)
// @stops from getHillshadeRampColors()
export function getHillshadeBasePosition(stops) {
  var dark = rgbToOklab(stops.shadow).l;
  var range = rgbToOklab(stops.highlight).l - dark;
  return range > 0 ? (rgbToOklab(stops.base).l - dark) / range : 0.5;
}

function toRgb(o) {
  return {r: Math.round(o.r), g: Math.round(o.g), b: Math.round(o.b)};
}

function formatRgb(o) {
  return 'rgb(' + Math.round(o.r) + ',' + Math.round(o.g) + ',' + Math.round(o.b) + ')';
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
