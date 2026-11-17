import { internal } from './gui-core';
import { getDragPreview, makePreviewTarget } from './gui-raster-preview-copies';

// Tone settings being previewed on a raster layer, while the tone panel is
// open. The raster's data is not changed: the map draws a toned copy of
// whichever preview of the raster it is drawing.
var DRAG_TABLE_STEPS = 17; // a coarse lookup table, as it is rebuilt for every setting
var tonePreviews = new WeakMap();

// @opts toneRgbPixels() options, or null to leave the colors alone
// @opacity 0-1, multiplies the alpha of each pixel when the preview is drawn
// @exact tone each pixel of the full preview as -tone does, rather than
//   with a lookup table, which is a few times faster and close but not
//   exact at the edge of the gamut -- good enough while a slider is being
//   dragged, as is a reduced copy of a large preview
export function setRasterTonePreview(layer, opts, opacity, exact) {
  var tone = tonePreviews.get(layer);
  if (!tone) {
    tone = {version: 0, buffers: new WeakMap()}; // preview -> toned canvases
    tonePreviews.set(layer, tone);
  }
  tone.opts = opts;
  tone.opacity = opacity;
  tone.exact = !!exact;
  tone.table = opts && !exact ? internal.getToneColorTable(opts, DRAG_TABLE_STEPS) : null;
  tone.version++;
}

export function clearRasterTonePreview(layer) {
  tonePreviews.delete(layer);
}

export function getRasterTonePreview(layer) {
  return tonePreviews.get(layer) || null;
}

// Returns {canvas, width, height}: the canvas may be a reduced copy while a
// slider is being dragged, which covers the preview with the (possibly
// fractional) width and height of its pixels
export function getTonedRasterCanvas(preview, tone) {
  var buffers = tone.buffers.get(preview);
  var src, target;
  if (!buffers) {
    buffers = {version: -1, image: null, full: null, reduced: null};
    tone.buffers.set(preview, buffers);
  }
  if (buffers.version == tone.version) return buffers.image;
  src = tone.exact ? preview : getDragPreview(preview);
  if (src == preview) {
    target = buffers.full || (buffers.full = makePreviewTarget(src));
  } else {
    target = buffers.reduced || (buffers.reduced = makePreviewTarget(src));
  }
  if (tone.table) {
    internal.applyToneColorTable(tone.table, src.pixels, target.imageData.data);
  } else {
    internal.toneRgbPixels(src.pixels, 4, tone.opts, target.imageData.data);
  }
  target.ctx.putImageData(target.imageData, 0, 0);
  buffers.image = target.image;
  buffers.version = tone.version;
  return target.image;
}
