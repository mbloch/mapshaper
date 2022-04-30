import { internal, stop } from './gui-core';
import { El } from './gui-el';

function getSvgFurnitureTransform(ext) {
  var scale = ext.getSymbolScale();
  var frame = ext.getFrame();
  var p = ext.translateCoords(frame.bbox[0], frame.bbox[3]);
  return internal.svg.getTransform(p, scale);
}

export function repositionFurniture(container, layer, ext) {
  var g = El.findAll('.mapshaper-svg-furniture', container)[0];
  g.setAttribute('transform', getSvgFurnitureTransform(ext));
}

export function renderFurniture(lyr, ext) {
  var frame = ext.getFrame(); // frame should be set if we're rendering a furniture layer
  var obj = internal.getEmptyLayerForSVG(lyr, {});
  if (!frame) {
    stop('Missing map frame data');
  }
  obj.properties.transform = getSvgFurnitureTransform(ext);
  obj.properties.class = 'mapshaper-svg-furniture';
  obj.children = internal.importFurniture(internal.getFrameLayerData(lyr), frame);
  return internal.svg.stringify(obj);
}
