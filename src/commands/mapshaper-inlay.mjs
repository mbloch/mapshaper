import cmd from '../mapshaper-cmd';
import { mergeLayersForOverlay } from '../clipping/mapshaper-overlay-utils';
import { requirePolygonLayer, copyLayer } from '../dataset/mapshaper-layer-utils';

// TODO: make sure that the inlay shapes and data are not shared
cmd.inlay = function(targetLayers, src, targetDataset, opts) {
  var mergedDataset = mergeLayersForOverlay(targetLayers, targetDataset, src, opts);
  var inlayLyr = mergedDataset.layers[mergedDataset.layers.length - 1];
  requirePolygonLayer(inlayLyr);
  targetLayers.forEach(requirePolygonLayer);
  var eraseSrc = {layer: copyLayer(inlayLyr), dataset: mergedDataset};
  var erasedLayers = cmd.eraseLayers(targetLayers, eraseSrc, mergedDataset, opts);
  var outputLayers = erasedLayers.map(function(lyr0) {
    // similar to applyCommandToLayerSelection() (mapshaper-command-utils.js)
    var lyr1 = copyLayer(inlayLyr);
    var lyr2 = cmd.mergeLayers([lyr0, lyr1], {force: true})[0];
    lyr2.name = lyr0.name;
    return lyr2;
  });
  targetDataset.arcs = mergedDataset.arcs;
  return outputLayers;
};
