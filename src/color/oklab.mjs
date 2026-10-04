import { parseColor, formatColor } from '../color/color-utils';
import { stop } from '../utils/mapshaper-logging';

// OKLab conversion (Björn Ottosson, https://bottosson.github.io/posts/oklab/)
// RGB objects use 0-255 channels, as returned by parseColor().

export function rgbToOklab(rgb) {
  var r = toLinear(rgb.r / 255),
      g = toLinear(rgb.g / 255),
      b = toLinear(rgb.b / 255);
  var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
      m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
      s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  };
}

// Colors outside the sRGB gamut are clipped per channel.
export function oklabToRgb(lab) {
  var rgb = oklabToLinearRgb(lab);
  return {
    r: fromLinear(rgb.r) * 255,
    g: fromLinear(rgb.g) * 255,
    b: fromLinear(rgb.b) * 255
  };
}

// Returns a function that maps t in [0, 1] to a color string (hex, or rgba()
// if either color is translucent).
export function interpolateOklab(color1, color2) {
  var rgb1 = parseColorOrStop(color1),
      rgb2 = parseColorOrStop(color2);
  var lab1 = rgbToOklab(rgb1),
      lab2 = rgbToOklab(rgb2);
  return function(t) {
    var rgb = oklabToRgb({
      l: lab1.l + (lab2.l - lab1.l) * t,
      a: lab1.a + (lab2.a - lab1.a) * t,
      b: lab1.b + (lab2.b - lab1.b) * t
    });
    rgb.a = rgb1.a + (rgb2.a - rgb1.a) * t;
    return formatColor(rgb);
  };
}

// OKLCH is OKLab in polar form: lightness, chroma (colorfulness) and hue
// angle in degrees.
export function oklabToOklch(lab) {
  var h = Math.atan2(lab.b, lab.a) * 180 / Math.PI;
  return {l: lab.l, c: Math.sqrt(lab.a * lab.a + lab.b * lab.b), h: h < 0 ? h + 360 : h};
}

export function oklchToOklab(lch) {
  var rad = lch.h * Math.PI / 180;
  return {l: lch.l, a: lch.c * Math.cos(rad), b: lch.c * Math.sin(rad)};
}

// Below this chroma a color is treated as a gray, whose hue means nothing.
var ACHROMATIC = 0.002;

// Lightness may move this far (OKLCH L) to make room for chroma ...
var MAX_LIGHTNESS_SHIFT = 0.05;
// ... and no more than this share of the lightness step between tiles, so
// that steps in lightness stay close to even.
var LIGHTNESS_SHIFT_SHARE = 0.2;
// Lightness differences count this many times as much as chroma differences
// when fitting a color to the gamut (see fitLightness()).
var LIGHTNESS_WEIGHT = 2;
// Shifts and chroma losses smaller than this are not reported.
var DEVIATION = 0.003;

// Where the light end of a ramp gains less chroma from vibrance than the
// color next to it (the gamut has little room near white), the step between
// them looks larger than the others. So that color's lightness moves toward
// the light end by this many times the difference in chroma gained. Set by
// eye; see getSecondLightness().
var VIBRANCE_LIGHTNESS = 0.2;

// A user's color with vibrance added to its chroma, as far as the gamut has
// room at its lightness and hue. Grays are left alone, having no hue.
export function getVibrantColor(color, vibrance) {
  return getVibrantTile(color, vibrance).color;
}

// Like getVibrantColor(), but returns {color, l, c, h, ideal, adjusted}, as
// the function from getOklchInterpolator() does. A color is adjusted if the
// gamut didn't have room for all of the vibrance.
export function getVibrantTile(color, vibrance) {
  var rgb = parseColorOrStop(color);
  var lch = oklabToOklch(rgbToOklab(rgb));
  var ideal = {l: lch.l, c: lch.c, h: lch.h};
  var c = lch.c, out;
  if (vibrance > 0 && lch.c >= ACHROMATIC) {
    ideal.c += vibrance;
    c = getVibrantChroma(lch, vibrance);
    out = oklchToRgb({l: lch.l, c: c, h: lch.h});
    out.a = rgb.a;
  }
  return {
    color: formatColor(out || rgb),
    l: lch.l, c: c, h: lch.h,
    ideal: ideal,
    adjusted: ideal.c - c > DEVIATION
  };
}

function getVibrantChroma(lch, vibrance) {
  if (!(vibrance > 0) || lch.c < ACHROMATIC) return lch.c;
  return Math.max(lch.c, Math.min(lch.c + vibrance, getMaxChroma(lch.l, lch.h)));
}

// Returns a function that maps t in [0, 1] to a color string. Lightness,
// chroma and hue are each interpolated on their own, so that equal steps in
// t are equal steps in each of them; hue takes the shorter way around the
// color wheel, unless opts.hue is 'longer'. A gray end takes the hue of the other end, so that a ramp from
// white to blue is blue all the way rather than passing through other hues.
// See getOklchInterpolator() for options, and for colors outside the sRGB
// gamut.
export function interpolateOklch(color1, color2, opts) {
  var interpolate = getOklchInterpolator(color1, color2, opts);
  return function(t) {
    return interpolate(t).color;
  };
}

// Like interpolateOklch(), but the function returns {color, l, c, h, ideal,
// adjusted}: the color, its OKLCH values, the ideal OKLCH values it was
// fitted from ({l, c, h}), and whether fitting changed it noticeably.
//
// opts.vibrance (OKLCH chroma, default 0) raises the chroma of the midtones.
// The sRGB gamut holds little chroma near black and white, so a ramp between
// a dark and a light color has dull midtones when its chroma goes in equal
// steps. The amount is the same at every hue. Ramps between two grays get no
// boost. Vibrance is added to the chroma of every color of the straight
// interpolation. The two end colors get it as far as the gamut has room at
// their lightness, without being marked as adjusted (see getVibrantColor());
// gray ends are left alone. In a classed ramp, the color next to the lighter
// end moves toward it in lightness if it gained more chroma than that end,
// and the others are evenly spaced from it to the darker end (see
// getSecondLightness()).
//
// opts.steps: the number of tiles from one color to the other, if the ramp
// is classed, which limits how far lightness may move (see below).
//
// opts.hue: 'shorter' (default) or 'longer', the way around the color wheel
// that hue takes. A gray end has no hue to go around from, so a ramp with
// one always takes the other end's hue.
//
// A color outside the sRGB gamut keeps its hue. Its lightness may move, up
// to MAX_LIGHTNESS_SHIFT (and a share of the lightness step between tiles),
// to where the gamut has room for more of its chroma, if the chroma gained
// is worth the lightness lost (see fitLightness()). Chroma is then reduced
// to fit.
export function getOklchInterpolator(color1, color2, opts) {
  var rgb1 = parseColorOrStop(color1),
      rgb2 = parseColorOrStop(color2);
  var lch1 = oklabToOklch(rgbToOklab(rgb1)),
      lch2 = oklabToOklch(rgbToOklab(rgb2));
  var vibrance = opts && opts.vibrance || 0;
  var steps = opts && opts.steps;
  var longHue = opts && opts.hue == 'longer' &&
      lch1.c >= ACHROMATIC && lch2.c >= ACHROMATIC;
  var maxShift = MAX_LIGHTNESS_SHIFT;
  var dh, lSecond, vivid1, vivid2;
  if (steps > 0) {
    maxShift = Math.min(maxShift, LIGHTNESS_SHIFT_SHARE * Math.abs(lch2.l - lch1.l) / steps);
  }
  if (lch1.c < ACHROMATIC && lch2.c < ACHROMATIC) vibrance = 0;
  // the ends' chroma with vibrance, before a gray end takes the other's hue
  vivid1 = getVibrantChroma(lch1, vibrance);
  vivid2 = getVibrantChroma(lch2, vibrance);
  if (lch1.c < ACHROMATIC && lch2.c >= ACHROMATIC) lch1.h = lch2.h;
  if (lch2.c < ACHROMATIC && lch1.c >= ACHROMATIC) lch2.h = lch1.h;
  dh = lch2.h - lch1.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  if (longHue) dh = dh > 0 ? dh - 360 : dh + 360;
  if (vibrance > 0 && steps >= 2) {
    lSecond = getSecondLightness(lch1, lch2, dh, vibrance, steps, vivid1, vivid2);
  }
  return function(t) {
    var h = lch1.h + dh * t;
    var ideal = {
      l: lch1.l + (lch2.l - lch1.l) * t,
      c: t <= 0 ? vivid1 : t >= 1 ? vivid2 : lch1.c + (lch2.c - lch1.c) * t,
      h: normalizeHue(h)
    };
    var l = ideal.l, c = ideal.c, rgb;
    if (t > 0 && t < 1) {
      if (lSecond !== undefined) {
        ideal.l = getLightnessFromSecond(t, lch1.l, lch2.l, lSecond, steps);
      }
      ideal.c += vibrance;
      l = fitLightness(ideal.l, ideal.c, ideal.h, maxShift);
      c = Math.min(ideal.c, getMaxChroma(l, ideal.h));
    }
    rgb = oklchToRgb({l: l, c: c, h: ideal.h});
    rgb.a = rgb1.a + (rgb2.a - rgb1.a) * t;
    return {
      color: formatColor(rgb),
      l: l, c: c, h: ideal.h,
      ideal: ideal,
      adjusted: Math.abs(l - ideal.l) > DEVIATION || ideal.c - c > DEVIATION
    };
  };
}

// The lightness of the color next to the lighter end of a classed ramp from
// lch1 to lch2, boosted by vibrance. Each gains chroma as far as the gamut
// has room at its unshifted lightness; where the color gains more than the
// end, it moves toward the end by VIBRANCE_LIGHTNESS times the difference,
// stopping at the end's lightness.
function getSecondLightness(lch1, lch2, dh, vibrance, steps, vivid1, vivid2) {
  var lightFirst = lch1.l >= lch2.l;
  var light = lightFirst ? lch1 : lch2;
  var endGain = (lightFirst ? vivid1 : vivid2) - light.c;
  var t = lightFirst ? 1 / steps : 1 - 1 / steps;
  var l = lch1.l + (lch2.l - lch1.l) * t;
  var c = lch1.c + (lch2.c - lch1.c) * t;
  var h = normalizeHue(lch1.h + dh * t);
  var gain = Math.max(0, Math.min(c + vibrance, getMaxChroma(l, h)) - c);
  var shift = Math.min(VIBRANCE_LIGHTNESS * Math.max(0, gain - endGain), Math.abs(light.l - l));
  return light.l > l ? l + shift : l - shift;
}

// The lightness at t of a classed ramp from lightness l1 to l2 whose color
// next to the lighter end has lightness lSecond; the others are evenly
// spaced from it to the darker end.
function getLightnessFromSecond(t, l1, l2, lSecond, steps) {
  var lightFirst = l1 >= l2;
  var lDark = lightFirst ? l2 : l1;
  var u = lightFirst ? t : 1 - t; // distance from the light end
  var uSecond = 1 / steps;
  if (u <= uSecond) return lSecond;
  return lSecond + (lDark - lSecond) * (u - uSecond) / (1 - uSecond);
}

function normalizeHue(h) {
  return h < 0 ? h + 360 : h >= 360 ? h - 360 : h;
}

// Returns the lightness within maxShift of l that brings a color with ideal
// lightness l and chroma c (at hue h) closest to its ideal, by a color
// difference that weights lightness LIGHTNESS_WEIGHT times as heavily as
// chroma: viewers notice lightness differences more, and even lightness
// steps matter more than even chroma steps.
function fitLightness(l, c, h, maxShift) {
  var n = 20;
  var lo = clamp(l - maxShift, 0, 1), hi = clamp(l + maxShift, 0, 1);
  var best = l, bestCost = getFitCost(l, l, c, h);
  var step = (hi - lo) / n, l2, cost, i, a, b, m1, m2;
  if (bestCost === 0 || !(maxShift > 0)) return l;
  for (i=0; i<=n; i++) {
    l2 = lo + step * i;
    cost = getFitCost(l2, l, c, h);
    if (cost < bestCost) {
      best = l2;
      bestCost = cost;
    }
  }
  // refine between the samples on either side of the best one
  a = Math.max(lo, best - step);
  b = Math.min(hi, best + step);
  for (i=0; i<20; i++) {
    m1 = a + (b - a) / 3;
    m2 = b - (b - a) / 3;
    if (getFitCost(m1, l, c, h) < getFitCost(m2, l, c, h)) {
      b = m2;
    } else {
      a = m1;
    }
  }
  l2 = (a + b) / 2;
  return getFitCost(l2, l, c, h) < bestCost ? l2 : best;
}

function getFitCost(l2, l, c, h) {
  var dl = (l2 - l) * LIGHTNESS_WEIGHT;
  var dc = Math.max(0, c - getMaxChroma(l2, h));
  return dl * dl + dc * dc;
}

function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}

// The most chroma the sRGB gamut has at a lightness and hue
export function getMaxChroma(l, h) {
  return findMaxChroma(l, h, 0.4);
}

// Converts an OKLCH color to sRGB (0-255 channels). A color outside the sRGB
// gamut keeps its hue, then its lightness, and gives up chroma: chroma is
// reduced to the most the gamut has at that hue and lightness.
export function oklchToRgb(lch) {
  var lab = oklchToOklab(lch);
  if (!oklabIsInGamut(lab)) {
    lab = oklchToOklab({l: lch.l, c: findMaxChroma(lch.l, lch.h, lch.c), h: lch.h});
  }
  return oklabToRgb(lab);
}

function findMaxChroma(l, h, maxChroma) {
  var lo = 0, hi = maxChroma, mid;
  for (var i=0; i<24; i++) {
    mid = (lo + hi) / 2;
    if (oklabIsInGamut(oklchToOklab({l: l, c: mid, h: h}))) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export function oklabIsInGamut(lab) {
  var rgb = oklabToLinearRgb(lab);
  var e = 1e-6;
  return rgb.r >= -e && rgb.r <= 1 + e && rgb.g >= -e && rgb.g <= 1 + e &&
    rgb.b >= -e && rgb.b <= 1 + e;
}

function oklabToLinearRgb(lab) {
  var l = cube(lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b),
      m = cube(lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b),
      s = cube(lab.l - 0.0894841775 * lab.a - 1.2914855480 * lab.b);
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  };
}

function parseColorOrStop(color) {
  var rgb = parseColor(color);
  if (!rgb) stop('Unsupported color:', color);
  return rgb;
}

function toLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function fromLinear(c) {
  c = c < 0 ? 0 : c > 1 ? 1 : c;
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function cube(x) {
  return x * x * x;
}
