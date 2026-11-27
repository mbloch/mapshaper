import { internal } from './gui-core';
import { getRecoloredInset, getRecoloredPreview } from './gui-raster-preview-copies';

// Tone settings being previewed on a raster layer, while the tone panel is
// open. The raster's data is not changed: the map draws a toned copy of
// whichever preview of the raster it is drawing.
var DRAG_TABLE_STEPS = 17; // a coarse lookup table, as it is rebuilt for every setting
var tonePreviews = new WeakMap();

// @opts toneRgbPixels() options, or null to leave the colors alone
// @opacity 0-1, multiplies the alpha of each pixel when the preview is drawn
// @exact tone the whole preview as -tone does; while a slider is being
//   dragged, only the part in view is toned (see getRecoloredInset()), with
//   a lookup table, which is a few times faster and close but not exact at
//   the edge of the gamut
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

// Returns {canvas, width, height}
export function getTonedRasterCanvas(preview, tone) {
  return getRecoloredPreview(tone, preview, getToner(tone));
}

// Returns {image, bbox, framed}, or null (see getRecoloredInset())
export function getTonedRasterInset(preview, bbox, view, tone) {
  return getRecoloredInset(tone, preview, bbox, view, getToner(tone));
}

function getToner(tone) {
  return function(pixels, out) {
    if (tone.table) {
      internal.applyToneColorTable(tone.table, pixels, out);
    } else {
      internal.toneRgbPixels(pixels, 4, tone.opts, out);
    }
  };
}
