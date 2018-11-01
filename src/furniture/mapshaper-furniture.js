/* @require mapshaper-common mapshaper-dataset-utils svg-common */


// @lyr a layer in a dataset
internal.layerHasFurniture = function(lyr) {
  var type = internal.getFurnitureLayerType(lyr);
  return !!type && (type in SVG.furnitureRenderers);
};

// @mapLayer a map layer object
internal.isFurnitureLayer = function(mapLayer) {
  return !!mapLayer.furniture;
};


// @lyr dataset layer
internal.getFurnitureLayerType = function(lyr) {
  var rec = lyr.data && lyr.data.getReadOnlyRecordAt(0);
  return rec && rec.type || null;
};

internal.getFurnitureLayerData = function(lyr) {
  return lyr.data && lyr.data.getReadOnlyRecordAt(0);
};

SVG.importFurniture = function(d, frame) {
  var renderer = SVG.furnitureRenderers[d.type];
  if (!renderer) {
    stop('Missing renderer for', d.type, 'element');
  }
  return renderer(d, frame) || [];
};
