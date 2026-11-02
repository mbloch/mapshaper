// Scaled-down copies of RGBA preview images. Kept free of browser and
// mapshaper dependencies so it can be tested directly.

// The whole-number factor that brings a @width x @height image down to at
// most @maxPixels pixels (1 if it is already small enough)
export function getShrinkFactor(width, height, maxPixels) {
  var k = 1;
  while (Math.ceil(width / k) * Math.ceil(height / k) > maxPixels) k++;
  return k;
}

// Averages each @k x @k block of RGBA @pixels into one pixel; blocks at the
// right and bottom edges may be partial. Colors are weighted by alpha, so
// transparent pixels (e.g. nodata) do not darken the edges of an image.
// Returns {pixels, width, height, coverWidth, coverHeight}, pixels being a
// Uint8ClampedArray. A partial block stands for less than a whole pixel of
// the copy, so the copy covers the original image with coverWidth x
// coverHeight of its pixels (fractional if there are partial blocks).
export function shrinkRgbaPixels(pixels, width, height, k) {
  var w2 = Math.ceil(width / k);
  var h2 = Math.ceil(height / k);
  var out = new Uint8ClampedArray(w2 * h2 * 4);
  var x2, y2, x, y, x1, y1, xmax, ymax, i, o, a, r, g, b, asum, n;
  for (y2 = 0; y2 < h2; y2++) {
    y1 = y2 * k;
    ymax = Math.min(y1 + k, height);
    for (x2 = 0; x2 < w2; x2++) {
      x1 = x2 * k;
      xmax = Math.min(x1 + k, width);
      r = g = b = asum = n = 0;
      for (y = y1; y < ymax; y++) {
        i = (y * width + x1) * 4;
        for (x = x1; x < xmax; x++, i += 4) {
          a = pixels[i + 3];
          r += pixels[i] * a;
          g += pixels[i + 1] * a;
          b += pixels[i + 2] * a;
          asum += a;
          n++;
        }
      }
      o = (y2 * w2 + x2) * 4;
      if (asum > 0) {
        out[o] = r / asum;
        out[o + 1] = g / asum;
        out[o + 2] = b / asum;
        out[o + 3] = asum / n;
      }
    }
  }
  return {pixels: out, width: w2, height: h2, coverWidth: width / k, coverHeight: height / k};
}
