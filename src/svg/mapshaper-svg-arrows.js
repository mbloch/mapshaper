/* @require svg-common, mapshaper-symbol-utils, mapshaper-affine */

SVG.symbolBuilders.arrow = function(d) {
  var len = 'length' in d ? d.length : 10;
  var stroke = d.stroke || 'magenta';
  var strokeWidth = 'stroke-width' in d ? d['stroke-width'] : 1;
  var coords = SVG.getStrokeArrowCoords(len);
  if (d.rotation) {
    SVG.rotateSymbolCoords(coords, d.rotation);
  }
  return {
    type: 'polyline',
    coordinates: coords,
    stroke: stroke,
    'stroke-width': strokeWidth
  };
};

SVG.getStrokeArrowCoords = function(len) {
  var stalk = [[0, 0], [0, -len]];
  return [stalk];
};

SVG.getFilledArrowCoords = function(d) {
  // TODO
};
