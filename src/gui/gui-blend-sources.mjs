import { internal } from './gui-core';

// The layers the blend panel offers as the hillshade to blend with @target:
// hillshades (see rasterLooksLikeHillshade()) in the same frame as the target
// (or unframed, like an unframed target), with layers made by -hillshade
// first. Hillshades that -blend would stop on are left out: rotated grids,
// and layers in a projection other than the target's.
// Returns [{layer, dataset}]
export function getBlendSourceLayers(model, target) {
  var o = findLayer(model, target);
  var frame;
  if (!o) return [];
  frame = getFrameDataset(model, o.dataset);
  var layers = model.getLayers().filter(function(src) {
    return src.layer != target && layerIsHillshade(src.layer) &&
      getFrameDataset(model, src.dataset) == frame &&
      blendCrsIsCompatible(o.dataset, src.dataset);
  });
  return layers.filter(isMadeByHillshade).concat(layers.filter(function(src) {
    return !isMadeByHillshade(src);
  }));
}

// Whether the blend panel has something to do on @lyr: a raster that -blend
// can blend a hillshade with (not a hillshade itself), with a hillshade to
// blend
export function blendIsAvailable(model, lyr) {
  var grid = lyr && internal.layerHasRaster(lyr) ? internal.getRasterGrid(lyr.raster) : null;
  if (!grid || !grid.bbox || internal.rasterGridIsRotated(grid)) return false;
  if (internal.rasterLooksLikeHillshade(lyr.raster)) return false;
  return getBlendSourceLayers(model, lyr).length > 0;
}

function isMadeByHillshade(o) {
  var params = o.layer.raster.derivation;
  return !!params && params.type == 'hillshade';
}

function findLayer(model, lyr) {
  return model.getLayers().find(function(o) {
    return o.layer == lyr;
  }) || null;
}

// The frame's dataset, or null for an unframed dataset
function getFrameDataset(model, dataset) {
  var frame = internal.getFrameForDataset(model, dataset);
  return frame ? frame.dataset : null;
}

function layerIsHillshade(lyr) {
  var grid;
  if (!internal.layerHasRaster(lyr)) return false;
  grid = internal.getRasterGrid(lyr.raster);
  return !!grid && !internal.rasterGridIsRotated(grid) &&
    internal.rasterLooksLikeHillshade(lyr.raster);
}

// As requireOverlaySourceCRS(), which -blend calls, but without stopping
function blendCrsIsCompatible(targetDataset, sourceDataset) {
  var P = internal.getDatasetCRS(targetDataset);
  var Q = internal.getDatasetCRS(sourceDataset);
  if (!P || !Q) return true;
  if (internal.isLatLngCRS(P) != internal.isLatLngCRS(Q)) return false;
  return internal.isLatLngCRS(P) || !internal.crsTransformsDiffer(P, Q);
}
