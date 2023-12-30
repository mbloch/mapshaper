import { stop } from '../utils/mapshaper-logging';
import { renderScalebar } from '../commands/mapshaper-scalebar';
import { renderFrame } from '../commands/mapshaper-frame';
import { isProjectedCRS } from '../crs/mapshaper-projections';

var furnitureRenderers = {
  scalebar: renderScalebar,
  frame: renderFrame
};

// @lyr a layer in a dataset
export function layerHasFurniture(lyr) {
  var type = getFurnitureLayerType(lyr);
  return !!type && (type in furnitureRenderers);
}

export function isFurnitureLayer(lyr) {
  // return !!mapLayer.furniture;
  return layerHasFurniture(lyr);
}

// @lyr dataset layer
export function getFurnitureLayerType(lyr) {
  var rec = lyr.data && lyr.data.getReadOnlyRecordAt(0);
  return rec && rec.type || null;
}

export function getFurnitureLayerData(lyr) {
  return lyr.data && lyr.data.getReadOnlyRecordAt(0);
}

export function renderFurnitureLayer(lyr, frame) {
  var d = getFurnitureLayerData(lyr);
  var renderer = furnitureRenderers[d.type];
  if (!renderer) {
    stop('Missing renderer for', d.type, 'element');
  }
  if (!frame.crs) {
    stop(`Unable to render ${d.type} (unknown map projection)`);
  }
  if (!isProjectedCRS(frame.crs)) {
    stop(`Unable to render ${d.type} (map is unprojected)`);
  }
  return renderer(d, frame) || [];
}
