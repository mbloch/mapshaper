import { internal } from './gui-core';
import { getDragPreview, makePreviewTarget } from './gui-raster-preview-copies';
import { getShrunkBBox } from './gui-raster-shrink';

// A hillshade blend being previewed on a raster layer, while the blend panel
// is open. Neither layer is changed: the map draws a blended copy of
// whichever preview of the target it is drawing, and leaves out the
// hillshade, whose shading the copy already has.
var blendPreviews = new WeakMap(); // target layer -> blend
var hiddenLayers = new WeakSet(); // hillshades left out of the map

// @source the hillshade layer
// @shading its shading amounts, from getShadingAmounts()
// @settings {strength: [shadows, highlights], chroma: [shadows, highlights]}
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
    shadow: blend.shading.shadow,
    highlight: blend.shading.highlight,
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
