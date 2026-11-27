import { cropRasterWindow, getRasterWindow } from './gui-raster-window';

// Recolored copies of raster previews, for the tone and blend panels. Settings
// change many times a second while a slider is dragged, so a panel's preview
// keeps its canvases (and their pixel buffers) from one setting to the next.
// While a slider is dragged, the map keeps the last recoloring of the whole
// preview, and recolors only the part in view, at full resolution, with the
// newer settings (as the hillshade panel does).
var INSET_MAX_PIXELS = 1e6;

// @state {version, exact, buffers: WeakMap}, a panel's preview of a layer;
//   version changes with the settings, and exact is false while a slider is
//   being dragged
// @recolor function(pixels, out, win): writes the recolored RGBA @pixels of
//   @preview to @out; @win is the window of the preview they come from (see
//   getRasterWindow()), or null for the whole preview
// Returns {canvas, width, height}: the whole preview, recolored with the
//   settings of the last time a slider was let go of
export function getRecoloredPreview(state, preview, recolor) {
  var buffers = getBuffers(state, preview);
  var full = buffers.full;
  if (buffers.version != state.version && (state.exact || buffers.version < 0)) {
    recolor(preview.pixels, full.imageData.data, null);
    full.ctx.putImageData(full.imageData, 0, 0);
    buffers.version = state.version;
  }
  return full.image;
}

// The part of @preview (which covers @bbox) in @view, recolored with newer
// settings than getRecoloredPreview()'s, while a slider is dragged
// Returns {image, bbox, framed}, image being {canvas, width, height} and
//   framed if it doesn't cover the view, or null if there is nothing newer
export function getRecoloredInset(state, preview, bbox, view, recolor) {
  var buffers = getBuffers(state, preview);
  var inset = buffers.inset;
  var win, key, w, h;
  if (state.exact || buffers.version < 0 || buffers.version == state.version) return null;
  win = getRasterWindow(preview.width, preview.height, bbox, view, INSET_MAX_PIXELS);
  if (!win) return null;
  key = [win.x0, win.y0, win.x1, win.y1].join(',');
  if (inset && inset.version == state.version && inset.key == key) return inset.result;
  w = win.x1 - win.x0;
  h = win.y1 - win.y0;
  if (!inset || inset.width != w || inset.height != h) {
    inset = buffers.inset = makePreviewTarget({width: w, height: h});
    inset.width = w;
    inset.height = h;
    inset.pixels = new Uint8ClampedArray(w * h * 4);
  }
  cropRasterWindow(preview.pixels, preview.width, 4, win, inset.pixels);
  recolor(inset.pixels, inset.imageData.data, win);
  inset.ctx.putImageData(inset.imageData, 0, 0);
  inset.version = state.version;
  inset.key = key;
  inset.result = {image: inset.image, bbox: win.bbox, framed: win.framed};
  return inset.result;
}

function getBuffers(state, preview) {
  var buffers = state.buffers.get(preview);
  if (!buffers) {
    buffers = {version: -1, full: makePreviewTarget(preview), inset: null};
    state.buffers.set(preview, buffers);
  }
  return buffers;
}

// A canvas to draw a recolored copy of @src on
// Returns {ctx, imageData, image}, image being {canvas, width, height}
function makePreviewTarget(src) {
  var canvas = document.createElement('canvas');
  var ctx;
  canvas.width = src.width;
  canvas.height = src.height;
  ctx = canvas.getContext('2d');
  return {
    ctx: ctx,
    imageData: ctx.createImageData(src.width, src.height),
    image: {canvas: canvas, width: src.width, height: src.height}
  };
}
