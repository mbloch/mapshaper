import { internal } from './gui-core';
import { getRecoloredInset, getRecoloredPreview } from './gui-raster-preview-copies';
import { cropRasterWindow } from './gui-raster-window';

// A hillshade blend being previewed on a raster layer, while the blend panel
// is open. Neither layer is changed: the map draws a blended copy of
// whichever preview of the target it is drawing, and leaves out the
// hillshade, whose shading the copy already has. A polygon layer has no
// preview to blend, so it is drawn on a grid of its own (see
// setDrawnBlendPreview()).
var blendPreviews = new WeakMap(); // target layer -> blend
var drawnPreviews = new WeakMap(); // polygon target layer -> blend
var hiddenLayers = new WeakSet(); // hillshades left out of the map

// The grid a polygon layer is drawn on for a preview covers the hillshade,
// with about this many pixels, so that a small hillshade doesn't blur the
// polygons' edges and a large one doesn't slow the panel down
var DRAWING_PIXELS = 4e6;
var MAX_DRAWING_MAGNIFICATION = 4;

// @source the hillshade layer
// @shading its shading amounts, from getShadingAmounts()
// @settings {strength: [shadows, highlights], chroma: [shadows, highlights],
//   shadow, highlight}, the colors being {r, g, b} in place of the
//   hillshade's, or null
// @exact blend the whole preview; while a slider is being dragged, only the
//   part in view is blended (see getRecoloredInset())
export function setRasterBlendPreview(layer, source, shading, settings, exact) {
  var blend = blendPreviews.get(layer);
  if (!blend || blend.shading != shading) {
    if (blend) hiddenLayers.delete(blend.source);
    blend = makeBlendState(source, shading);
    blendPreviews.set(layer, blend);
  }
  hiddenLayers.add(source);
  blend.settings = settings;
  blend.exact = !!exact;
  blend.version++;
}

export function clearRasterBlendPreview(layer) {
  var blend = blendPreviews.get(layer);
  if (!blend) return;
  hiddenLayers.delete(blend.source);
  blendPreviews.delete(layer);
}

export function getRasterBlendPreview(layer) {
  return blendPreviews.get(layer) || null;
}

export function rasterIsHiddenByBlendPreview(layer) {
  return hiddenLayers.has(layer);
}

function makeBlendState(source, shading) {
  return {
    version: 0,
    source: source,
    shading: shading,
    buffers: new WeakMap(), // preview -> blended canvases
    amounts: new WeakMap(), // preview -> shading amounts on its grid
    scratch: {} // pixel count -> working arrays
  };
}

// @bbox the extent of @preview
// Returns {canvas, width, height}
export function getBlendedRasterCanvas(preview, bbox, blend) {
  return getRecoloredPreview(blend, preview, getBlender(blend, preview, bbox, false));
}

// Returns {image, bbox, framed}, or null (see getRecoloredInset())
export function getBlendedRasterInset(preview, bbox, view, blend) {
  return getRecoloredInset(blend, preview, bbox, view, getBlender(blend, preview, bbox, false));
}

// A recolor function for getRecoloredPreview() that blends @src, an image
// covering @bbox; a polygon layer's drawing (@drawn) may become an overlay
function getBlender(blend, src, bbox, drawn) {
  return function(pixels, out, win) {
    var amounts = getShadingOnGrid(blend, src, bbox);
    var scratch = getScratch(blend, pixels.length / 4, drawn);
    var opts = getPixelOptions(blend);
    if (win) amounts = cropRasterWindow(amounts, src.width, 1, win, scratch.amounts);
    internal.scaleShadingAmounts(amounts, blend.settings.strength[0],
      blend.settings.strength[1], scratch.scaled);
    if (drawn && blend.settings.output == 'overlay') {
      internal.blendShadingPixels(pixels, 4, scratch.scaled,
        Object.assign({}, opts, {clip: true}), scratch.blended);
      internal.getShadingOverlayPixels(pixels, scratch.blended, scratch.scaled, opts, out);
    } else {
      internal.blendShadingPixels(pixels, 4, scratch.scaled, opts, out);
    }
  };
}

// The shading resampled onto the grid of @src, which covers @bbox
function getShadingOnGrid(blend, src, bbox) {
  var amounts = blend.amounts.get(src);
  if (!amounts) {
    amounts = internal.resampleShadingAmounts(blend.shading, {
      width: src.width, height: src.height, bbox: bbox
    });
    blend.amounts.set(src, amounts);
  }
  return amounts;
}

// Working arrays for @n pixels, kept for the whole preview and the part in
// view, which alternate while a slider is dragged
function getScratch(blend, n, drawn) {
  var o = blend.scratch[n];
  if (!o) {
    if (Object.keys(blend.scratch).length >= 2) blend.scratch = {};
    o = blend.scratch[n] = {amounts: new Float32Array(n), scaled: new Float32Array(n), blended: null};
  }
  if (drawn && !o.blended) o.blended = new Uint8Array(n * 4);
  return o;
}

// blendShadingPixels() options for a blend's settings
function getPixelOptions(blend) {
  var s = blend.settings;
  return {
    shadow: s.shadow || blend.shading.shadow,
    highlight: s.highlight || blend.shading.highlight,
    shadowChroma: s.chroma[0],
    highlightChroma: s.chroma[1],
    clip: !!s.clip,
    depthChroma: s.depthChroma || 0,
    depthFade: s.depthFade,
    evenness: s.evenness || 0,
    evennessLightness: s.evennessLightness || 0
  };
}

// A polygon layer drawn with its styles over the extent of @source, the
// hillshade, as -blend draws it, on a grid of about DRAWING_PIXELS
// @target {layer, dataset}
// Returns a promise of {pixels, width, height, bbox}
export function drawBlendTarget(model, target, source) {
  var g = internal.getRasterGrid(source.raster);
  var k = Math.min(MAX_DRAWING_MAGNIFICATION, Math.sqrt(DRAWING_PIXELS / (g.width * g.height)));
  var grid = {
    width: Math.max(1, Math.round(g.width * k)),
    height: Math.max(1, Math.round(g.height * k)),
    bbox: g.bbox.concat()
  };
  var scale = internal.getDrawingScale(model, [target], g) * grid.width / g.width;
  return internal.drawLayersOnGrid([target], grid, scale).then(function(pixels) {
    return {pixels: pixels, width: grid.width, height: grid.height, bbox: grid.bbox};
  });
}

// A hillshade blend being previewed on a polygon layer. The map draws it
// directly above the layer and leaves out the hillshade: as an overlay, which
// gives the blended image on the polygons as the map draws them, or as the
// blended image, which covers them.
// @drawing from drawBlendTarget()
// @settings as for setRasterBlendPreview(), plus output, one of BLEND_OUTPUTS,
//   and clip (see -blend's clip option)
export function setDrawnBlendPreview(layer, source, drawing, shading, settings, exact) {
  var blend = drawnPreviews.get(layer);
  if (!blend || blend.drawing != drawing || blend.shading != shading) {
    if (blend) hiddenLayers.delete(blend.source);
    blend = makeBlendState(source, shading);
    blend.drawing = drawing;
    drawnPreviews.set(layer, blend);
  }
  hiddenLayers.add(source);
  blend.settings = settings;
  blend.exact = !!exact;
  blend.version++;
}

export function clearDrawnBlendPreview(layer) {
  var blend = drawnPreviews.get(layer);
  if (!blend) return;
  hiddenLayers.delete(blend.source);
  drawnPreviews.delete(layer);
}

// @view the map's extent, as [xmin, ymin, xmax, ymax]
// Returns {image: {canvas, width, height}, bbox, inset}, inset being the
// part in view with newer settings while a slider is dragged, or null (see
// getRecoloredInset()); or null if @layer has no preview
export function getDrawnBlendImage(layer, view) {
  var blend = drawnPreviews.get(layer);
  var drawing, blender, inset;
  if (!blend) return null;
  drawing = blend.drawing;
  blender = getBlender(blend, drawing, drawing.bbox, true);
  inset = getRecoloredInset(blend, drawing, drawing.bbox, view, blender);
  return {image: getRecoloredPreview(blend, drawing, blender), bbox: drawing.bbox, inset: inset};
}
