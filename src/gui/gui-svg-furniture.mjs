import { internal } from './gui-core';
import { El } from './gui-el';

function getSvgFurnitureTransform(ext) {
  var scale = ext.getSymbolScale();
  var frame = ext.getFrameData();
  var p = ext.translateCoords(frame.bbox[0], frame.bbox[3]);
  return internal.svg.getTransform(p, scale);
}

export function repositionFurniture(container, ext) {
  if (!ext.getFrameData()) return;
  El.findAll('.mapshaper-svg-furniture', container).forEach(function(g) {
    g.setAttribute('transform', getSvgFurnitureTransform(ext));
  });
}

// Returns an SVG string, or '' if the furniture can't be drawn in the current
// frame (e.g. the map is unprojected). The scalebar panel explains why.
export function renderFurniture(lyr, ext) {
  var frame = ext.getFrameData();
  var obj;
  if (internal.getFurnitureFrameProblem(frame)) return '';
  obj = internal.getEmptyLayerForSVG(lyr, {});
  obj.properties.transform = getSvgFurnitureTransform(ext);
  obj.properties.class = 'mapshaper-svg-furniture';
  try {
    obj.children = internal.renderFurnitureLayer(lyr, frame);
  } catch(e) {
    console.error(e);
    return '';
  }
  return internal.svg.stringify(obj);
}
