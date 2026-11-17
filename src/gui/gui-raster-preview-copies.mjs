import { getShrinkFactor, shrinkRgbaPixels } from './gui-raster-shrink';

// Recolored copies of raster previews, for the tone and blend panels. Settings
// change many times a second while a slider is dragged, so a panel's preview
// keeps its canvases (and their pixel buffers) from one setting to the next,
// and a large preview is recolored at a reduced size until the slider is let
// go of.
var DRAG_MAX_PIXELS = 1e6;
var shrunkPreviews = new WeakMap(); // preview -> reduced copy, made once

// Returns @preview, or a reduced copy of it if it is large
export function getDragPreview(preview) {
  var k, copy = shrunkPreviews.get(preview);
  if (copy) return copy;
  k = getShrinkFactor(preview.width, preview.height, DRAG_MAX_PIXELS);
  copy = k > 1 ? shrinkRgbaPixels(preview.pixels, preview.width, preview.height, k) : preview;
  shrunkPreviews.set(preview, copy);
  return copy;
}

// A canvas to draw a recolored copy of @src on
// @src a preview or a reduced copy
// Returns {ctx, imageData, image}, image being {canvas, width, height}, the
// part of the canvas that covers the preview
export function makePreviewTarget(src) {
  var canvas = document.createElement('canvas');
  var ctx;
  canvas.width = src.width;
  canvas.height = src.height;
  ctx = canvas.getContext('2d');
  return {
    ctx: ctx,
    imageData: ctx.createImageData(src.width, src.height),
    image: {
      canvas: canvas,
      width: src.coverWidth || src.width,
      height: src.coverHeight || src.height
    }
  };
}
