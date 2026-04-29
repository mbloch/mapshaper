import { stop } from '../utils/mapshaper-logging';
import { renderScalebar } from '../commands/mapshaper-scalebar';
// import { renderFrame } from '../commands/mapshaper-frame';
import { isProjectedCRS } from '../crs/mapshaper-projections';
import { getFurnitureLayerType, getFurnitureLayerData } from '../furniture/mapshaper-furniture-utils';

// Re-export accessors for back-compat with consumers that still expect
// to find them on this module.
export { getFurnitureLayerType, getFurnitureLayerData };

var furnitureRenderers = {
  scalebar: renderScalebar
  // frame: renderFrame
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
