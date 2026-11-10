import { parseColor } from '../color/color-utils';
import { blurFloatChannel } from './mapshaper-box-blur';
import { decodeShadowStyleShading } from './mapshaper-raster-blend';
import { writeHillshadeRgba } from './mapshaper-hillshade';
import { getRasterValidityMask } from './mapshaper-raster-grid';

// Unsharp masking of 8-bit images, for -sharpen.
// A transparent (shadow-style) hillshade made by -hillshade is sharpened as
// the signed tones it was written from (see getHillshadeTones()), so
// that a shadow next to a highlight is sharpened as one surface rather than as
// two colors. Other images are sharpened by lightness: the same amount is
// added to each color channel, so hues are not shifted.

// @grid an 8-bit grid with 1, 3 or 4 bands, pixel-interleaved
// @derivation the raster's derivation, if any
// @opts {amount, radius, threshold}: radius is the Gaussian sigma, in pixels;
//   threshold is in 0-1 tone or lightness units
// Returns new samples
export function sharpenImageSamples(grid, derivation, opts) {
  if (isShadowStyleHillshade(grid, derivation)) {
    return sharpenShadowStyleHillshade(grid, derivation, opts);
  }
  return sharpenLightness(grid, opts);
}

export function isShadowStyleHillshade(grid, derivation) {
  return !!derivation && derivation.type == 'hillshade' && derivation.style != 'opaque' &&
    grid.bands == 4;
}

function sharpenShadowStyleHillshade(grid, derivation, opts) {
  var shadow = getToneColor(derivation.shadow_color, 0);
  var highlight = getToneColor(derivation.highlight_color, 255);
  var tones = decodeShadowStyleShading(grid.samples, shadow, highlight);
  var i;
  // writeHillshadeRgba() scales opacity by the alpha of the tone colors
  for (i = 0; i < tones.length; i++) {
    if (tones[i] < 0 && shadow.a > 0) tones[i] /= shadow.a;
    else if (tones[i] > 0 && highlight.a > 0) tones[i] /= highlight.a;
  }
  sharpenTones(tones, null, grid.width, grid.height, opts.amount, opts.radius, opts.threshold);
  return writeHillshadeRgba(tones, null, 'shadow', {shadow: shadow, highlight: highlight});
}

// Unsharp mask of signed hillshade tones, in place:
// tone += amount * (tone - blurred tone). Differences smaller than @threshold
// (in tone units) are ignored, and larger ones reduced by it (a soft
// threshold), so faint texture can be left alone. Areas of constant tone are
// unchanged, so flat ground stays transparent.
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

function getToneColor(str, defaultValue) {
  var c = str ? parseColor(str) : null;
  if (!c) return {r: defaultValue, g: defaultValue, b: defaultValue, a: 1};
  return {r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b), a: c.a >= 0 ? c.a : 1};
}

function sharpenLightness(grid, opts) {
  var bands = grid.bands;
  var n = grid.width * grid.height;
  var src = grid.samples;
  var out = new Uint8Array(src.length);
  var valid = getImageValidity(grid);
  var light = new Float32Array(n);
  var blurred, t = opts.threshold > 0 ? opts.threshold : 0;
  var i, j, k, d, v;
  for (i = 0, j = 0; i < n; i++, j += bands) {
    light[i] = bands == 1 ? src[j] / 255 :
      (0.2126 * src[j] + 0.7152 * src[j + 1] + 0.0722 * src[j + 2]) / 255;
  }
  blurred = Float32Array.from(light);
  blurFloatChannel(blurred, valid, grid.width, grid.height, opts.radius);
  out.set(src);
  for (i = 0, j = 0; i < n; i++, j += bands) {
    if (valid && !valid[i]) continue;
    d = light[i] - blurred[i];
    if (d > t) d -= t;
    else if (d < -t) d += t;
    else continue;
    d *= opts.amount * 255;
    for (k = 0; k < Math.min(bands, 3); k++) {
      v = src[j + k] + d;
      out[j + k] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}

// Pixels to sharpen and to blur: valid pixels that aren't fully transparent
function getImageValidity(grid) {
  var mask = getRasterValidityMask(grid);
  var n = grid.width * grid.height;
  var i;
  if (grid.bands != 4) return mask;
  mask = mask ? Uint8Array.from(mask) : new Uint8Array(n).fill(1);
  for (i = 0; i < n; i++) {
    if (grid.samples[i * 4 + 3] === 0) mask[i] = 0;
  }
  return mask;
}
