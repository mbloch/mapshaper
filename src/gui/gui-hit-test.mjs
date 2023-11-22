import { getShapeHitTest } from './gui-shape-hit';
import { getSvgHitTest } from './gui-svg-hit';
import { internal, utils } from './gui-core';

export function getPointerHitTest(mapLayer, ext, interactionMode) {
  var shapeTest, targetLayer;
  if (!mapLayer || !internal.layerHasGeometry(mapLayer.layer)) {
    return function() {return {ids: []};};
  }
  shapeTest = getShapeHitTest(mapLayer, ext, interactionMode);

  // e: pointer event
  return function(e) {
    var p = ext.translatePixelCoords(e.x, e.y);
    // update SVG hit test on each test, in case SVG layer has been redrawn
    // and the symbol container has changed
    var svgTest = getSvgHitTest(mapLayer);
    var data = shapeTest(p[0], p[1]) || {ids:[]};
    var svgData = svgTest(e); // null or a data object
    if (svgData) { // mouse is over an SVG symbol
      utils.extend(data, svgData);
      // placing symbol id in front of any other hits
      data.ids = utils.uniq([svgData.targetId].concat(data.ids));
    }
    data.id = data.ids.length > 0 ? data.ids[0] : -1;
    return data;
  };
}
