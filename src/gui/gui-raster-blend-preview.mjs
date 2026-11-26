import { internal } from './gui-core';
import { getDragPreview, makePreviewTarget } from './gui-raster-preview-copies';
import { getShrunkBBox } from './gui-raster-shrink';

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
// @exact blend the full preview, rather than a reduced copy of a large
//   preview, which is good enough while a slider is being dragged
export function setRasterBlendPreview(layer, source, shading, settings, exact) {
  var blend = blendPreviews.get(layer);
  if (!blend || blend.shading != shading) {
    if (blend) hiddenLayers.delete(blend.source);
    // preview -> amounts on its grid, and blended canvases
    blend = {version: 0, buffers: new WeakMap(), source: source, shading: shading};
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

// @bbox the extent of @preview
// Returns {canvas, width, height}: the canvas may be a reduced copy while a
// slider is being dragged, which covers the preview with the (possibly
// fractional) width and height of its pixels
export function getBlendedRasterCanvas(preview, bbox, blend) {
  var buffers = blend.buffers.get(preview);
  var src, target;
  if (!buffers) {
    buffers = {version: -1, image: null, full: null, reduced: null};
    blend.buffers.set(preview, buffers);
  }
  if (buffers.version == blend.version) return buffers.image;
  src = blend.exact ? preview : getDragPreview(preview);
  if (src == preview) {
    target = buffers.full || (buffers.full = makeBlendTarget(src, bbox, blend.shading));
  } else {
    target = buffers.reduced || (buffers.reduced = makeBlendTarget(src, getShrunkBBox(bbox, src), blend.shading));
  }
  internal.scaleShadingAmounts(target.amounts, blend.settings.strength[0],
    blend.settings.strength[1], target.scaled);
  internal.blendShadingPixels(src.pixels, 4, target.scaled, {
    shadow: blend.settings.shadow || blend.shading.shadow,
    highlight: blend.settings.highlight || blend.shading.highlight,
    shadowChroma: blend.settings.chroma[0],
    highlightChroma: blend.settings.chroma[1]
  }, target.imageData.data);
  target.ctx.putImageData(target.imageData, 0, 0);
  buffers.image = target.image;
  buffers.version = blend.version;
  return target.image;
}

// The shading resampled onto the grid of @src, which covers @bbox
function makeBlendTarget(src, bbox, shading) {
  var target = makePreviewTarget(src);
  target.amounts = internal.resampleShadingAmounts(shading, {
    width: src.width, height: src.height, bbox: bbox
  });
  target.scaled = new Float32Array(target.amounts.length);
  return target;
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
    blend = {version: 0, source: source, drawing: drawing, shading: shading,
      buffers: {version: -1, image: null, full: null, reduced: null}};
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

// Returns {image: {canvas, width, height}, bbox}, or null if @layer has no
// preview
export function getDrawnBlendImage(layer) {
  var blend = drawnPreviews.get(layer);
  var buffers, drawing, src, target, opts;
  if (!blend) return null;
  buffers = blend.buffers;
  drawing = blend.drawing;
  if (buffers.version != blend.version) {
    src = blend.exact ? drawing : getDragPreview(drawing);
    if (src == drawing) {
      target = buffers.full || (buffers.full = makeDrawnBlendTarget(src, drawing.bbox, blend.shading));
    } else {
      target = buffers.reduced || (buffers.reduced =
        makeDrawnBlendTarget(src, getShrunkBBox(drawing.bbox, src), blend.shading));
    }
    opts = {
      shadow: blend.settings.shadow || blend.shading.shadow,
      highlight: blend.settings.highlight || blend.shading.highlight,
      shadowChroma: blend.settings.chroma[0],
      highlightChroma: blend.settings.chroma[1],
      clip: !!blend.settings.clip
    };
    internal.scaleShadingAmounts(target.amounts, blend.settings.strength[0],
      blend.settings.strength[1], target.scaled);
    if (blend.settings.output == 'overlay') {
      internal.blendShadingPixels(src.pixels, 4, target.scaled, opts, target.blended);
      internal.getShadingOverlayPixels(src.pixels, target.blended, target.scaled, opts,
        target.imageData.data);
    } else {
      internal.blendShadingPixels(src.pixels, 4, target.scaled, opts, target.imageData.data);
    }
    target.ctx.putImageData(target.imageData, 0, 0);
    buffers.image = target.image;
    buffers.version = blend.version;
  }
  return {image: buffers.image, bbox: drawing.bbox};
}

function makeDrawnBlendTarget(src, bbox, shading) {
  var target = makeBlendTarget(src, bbox, shading);
  target.blended = new Uint8Array(src.pixels.length);
  return target;
}
