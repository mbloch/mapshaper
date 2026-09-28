import { stop } from '../utils/mapshaper-logging';
import { renderScalebar } from '../commands/mapshaper-scalebar';
// import { renderFrame } from '../commands/mapshaper-frame';
import { isProjectedCRS } from '../crs/mapshaper-projections';
import { getFurnitureLayerType, getFurnitureLayerData, layerIsFurniture } from '../furniture/mapshaper-furniture-utils';

// Re-export accessors for back-compat with consumers that still expect
// to find them on this module (and to expose them via internal.*).
export { getFurnitureLayerType, getFurnitureLayerData, layerIsFurniture };

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
  var problem;
  if (!renderer) {
    stop('Missing renderer for', d.type, 'element');
  }
  problem = getFurnitureFrameProblem(frame);
  if (problem) {
    stop(`Unable to render ${d.type} (${problem})`);
  }
  return renderer(d, frame) || [];
}

// Returns a reason why furniture can't be drawn in a frame, or null
export function getFurnitureFrameProblem(frame) {
  if (!frame) return 'missing map frame';
  if (!frame.crs) return 'unknown map projection';
  if (!isProjectedCRS(frame.crs)) return 'map is unprojected';
  return null;
}
