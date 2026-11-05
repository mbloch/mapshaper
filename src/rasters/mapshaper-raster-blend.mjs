import { parseColor } from '../color/color-utils';
import { getOklchLightnessChroma } from './mapshaper-raster-color';
import { getRasterGrid, renderRasterPreview } from './mapshaper-raster-utils';
import { stop } from '../utils/mapshaper-logging';

// Reading a hillshade as shading amounts for -blend
// (see docs/development/raster-blend.md)

var BLACK = {r: 0, g: 0, b: 0};
var WHITE = {r: 255, g: 255, b: 255};

// Returns {amounts, width, height, bbox, shadow, highlight}: one signed amount
// per pixel (below 0, the opacity of the shadow color stacked on flat ground;
// above 0, the opacity of the highlight color), and the two colors
export function getShadingAmounts(raster) {
  var grid = getRasterGrid(raster);
  var params = raster.derivation || {};
  var pixels, amounts, colors;
  if (params.type != 'hillshade') {
    stop('source= should name a hillshade made by -hillshade');
  }
  pixels = getRgbaPixels(raster);
  if (params.style == 'opaque') {
    amounts = decodeOpaqueShading(pixels, readColor(params.base_color, 'base color'));
    colors = {shadow: BLACK, highlight: WHITE};
  } else {
    colors = {
      shadow: readColor(params.shadow_color) || BLACK,
      highlight: readColor(params.highlight_color) || WHITE
    };
    amounts = decodeShadowStyleShading(pixels, colors.shadow, colors.highlight);
  }
  return {
    amounts: amounts,
    width: grid.width,
    height: grid.height,
    bbox: grid.bbox,
    shadow: colors.shadow,
    highlight: colors.highlight
  };
}

function getRgbaPixels(raster) {
  var grid = getRasterGrid(raster);
  if (grid.bands == 4 && (grid.samples instanceof Uint8Array || grid.samples instanceof Uint8ClampedArray)) {
    return grid.samples;
  }
  return renderRasterPreview(grid, raster.view && raster.view.recipe, grid.width, grid.height).pixels;
}

function readColor(str, name) {
  var color = str ? parseColor(str) : null;
  if (!color && name) stop('The hillshade has no ' + name);
  return color;
}

// A pixel's alpha is the amount; the color it is closer to says whether it
// is a shadow or a highlight
export function decodeShadowStyleShading(pixels, shadow, highlight) {
  var n = pixels.length / 4;
  var amounts = new Float32Array(n);
  var i, j, a, ds, dh;
  for (i = 0, j = 0; i < n; i++, j += 4) {
    a = pixels[j + 3];
    if (a === 0) continue;
    ds = colorDistance(pixels, j, shadow);
    dh = colorDistance(pixels, j, highlight);
    amounts[i] = dh < ds ? a / 255 : -a / 255;
  }
  return amounts;
}

function colorDistance(pixels, j, c) {
  var dr = pixels[j] - c.r, dg = pixels[j + 1] - c.g, db = pixels[j + 2] - c.b;
  return dr * dr + dg * dg + db * db;
}

// The opacity of a black (or white) overlay that takes @base to the pixel's
// lightness; exact for a gray ramp
export function decodeOpaqueShading(pixels, base) {
  var n = pixels.length / 4;
  var amounts = new Float32Array(n);
  var cache = new Map();
  var gb = getGrayValue(base.r, base.g, base.b);
  var i, j, key, a, gp;
  for (i = 0, j = 0; i < n; i++, j += 4) {
    if (pixels[j + 3] === 0) continue;
    key = pixels[j] << 16 | pixels[j + 1] << 8 | pixels[j + 2];
    a = cache.get(key);
    if (a === undefined) {
      gp = getGrayValue(pixels[j], pixels[j + 1], pixels[j + 2]);
      a = gp < gb ? gp / gb - 1 : gb < 1 ? (gp - gb) / (1 - gb) : 0;
      cache.set(key, a);
    }
    amounts[i] = a;
  }
  return amounts;
}

// The sRGB value (0-1) of the gray with a color's OKLab lightness
function getGrayValue(r, g, b) {
  var lc = [0, 0];
  var y;
  getOklchLightnessChroma(r, g, b, lc);
  y = lc[0] * lc[0] * lc[0];
  return y <= 0.0031308 ? 12.92 * y : 1.055 * Math.pow(y, 1 / 2.4) - 0.055;
}

// Bilinear resampling of shading amounts onto a north-up grid; zero outside
// the shading's extent
// @shading from getShadingAmounts()
// Returns a Float32Array with one amount per pixel of @grid
export function resampleShadingAmounts(shading, grid) {
  var sw = shading.width, sh = shading.height, sb = shading.bbox;
  var w = grid.width, h = grid.height, b = grid.bbox;
  var src = shading.amounts;
  var out, cols, rows, x, y, k, r0, r1, wy;
  if (w == sw && h == sh && bboxesMatch(b, sb, (sb[2] - sb[0]) / sw * 1e-3)) {
    return src;
  }
  out = new Float32Array(w * h);
  cols = getSamplePositions(w, b[0], b[2], sw, sb[0], sb[2], false);
  rows = getSamplePositions(h, b[1], b[3], sh, sb[1], sb[3], true);
  for (y = 0; y < h; y++) {
    if (rows.i0[y] < 0) continue;
    r0 = rows.i0[y] * sw;
    r1 = rows.i1[y] * sw;
    wy = rows.f[y];
    for (x = 0; x < w; x++) {
      if (cols.i0[x] < 0) continue;
      k = cols.f[x];
      out[y * w + x] =
        (src[r0 + cols.i0[x]] * (1 - k) + src[r0 + cols.i1[x]] * k) * (1 - wy) +
        (src[r1 + cols.i0[x]] * (1 - k) + src[r1 + cols.i1[x]] * k) * wy;
    }
  }
  return out;
}

// For each of @n destination pixels between @min and @max, the two nearest
// source pixel centers (i0, i1; -1 outside the source) and the weight of i1.
// Rows run from max to min.
function getSamplePositions(n, min, max, srcN, srcMin, srcMax, flip) {
  var i0 = new Int32Array(n), i1 = new Int32Array(n), f = new Float32Array(n);
  var step = (max - min) / n, srcStep = (srcMax - srcMin) / srcN;
  var i, c, p;
  for (i = 0; i < n; i++) {
    c = flip ? max - (i + 0.5) * step : min + (i + 0.5) * step;
    p = (flip ? srcMax - c : c - srcMin) / srcStep - 0.5;
    if (p < -0.5 || p > srcN - 0.5) {
      i0[i] = -1;
      continue;
    }
    p = Math.max(0, Math.min(srcN - 1, p));
    i0[i] = Math.floor(p);
    i1[i] = Math.min(srcN - 1, i0[i] + 1);
    f[i] = p - i0[i];
  }
  return {i0: i0, i1: i1, f: f};
}

function bboxesMatch(a, b, tolerance) {
  for (var i = 0; i < 4; i++) {
    if (Math.abs(a[i] - b[i]) > tolerance) return false;
  }
  return true;
}
