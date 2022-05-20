
import { stop } from '../utils/mapshaper-logging';
export var furnitureRenderers = {};

// @lyr a layer in a dataset
export function layerHasFurniture(lyr) {
  var type = getFurnitureLayerType(lyr);
  return !!type && (type in furnitureRenderers);
}

// @mapLayer a map layer object
export function isFurnitureLayer(mapLayer) {
  return !!mapLayer.furniture;
}

// @lyr dataset layer
export function getFurnitureLayerType(lyr) {
  var rec = lyr.data && lyr.data.getReadOnlyRecordAt(0);
  return rec && rec.type || null;
}

export function getFurnitureLayerData(lyr) {
  return lyr.data && lyr.data.getReadOnlyRecordAt(0);
}

export function importFurniture(d, frame) {
  var renderer = furnitureRenderers[d.type];
  if (!renderer) {
    stop('Missing renderer for', d.type, 'element');
  }
  return renderer(d, frame) || [];
}
