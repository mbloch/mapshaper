import { internal } from './gui-core';

// Tone settings being previewed on a raster layer, while the tone panel is
// open. The raster's data is not changed: the map draws a toned copy of
// whichever preview of the raster it is drawing.
var tonePreviews = new WeakMap();

// @opts toneRgbPixels() options, or null to leave the colors alone
// @opacity 0-1, multiplies the alpha of each pixel when the preview is drawn
// @exact tone each pixel as -tone does, rather than with a lookup table,
//   which is a few times faster and close but not exact at the edge of the
//   gamut -- good enough while a slider is being dragged
export function setRasterTonePreview(layer, opts, opacity, exact) {
  tonePreviews.set(layer, {
    opts: opts,
    opacity: opacity,
    table: opts && !exact ? internal.getToneColorTable(opts) : null,
    canvases: new WeakMap() // preview -> toned canvas
  });
}

export function clearRasterTonePreview(layer) {
  tonePreviews.delete(layer);
}

export function getRasterTonePreview(layer) {
  return tonePreviews.get(layer) || null;
}

export function getTonedRasterCanvas(preview, tone) {
  var canvas = tone.canvases.get(preview);
  var pixels, ctx;
  if (canvas) return canvas;
  if (tone.table) {
    pixels = internal.applyToneColorTable(tone.table, preview.pixels,
      new Uint8ClampedArray(preview.pixels.length));
  } else {
    pixels = internal.toneRgbPixels(preview.pixels, 4, tone.opts);
    pixels = new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.length);
  }
  canvas = document.createElement('canvas');
  canvas.width = preview.width;
  canvas.height = preview.height;
  ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(pixels, preview.width, preview.height), 0, 0);
  tone.canvases.set(preview, canvas);
  return canvas;
}
