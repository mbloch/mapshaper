/* @require svg-common, mapshaper-symbol-utils, mapshaper-affine, svg-path-utils */

SVG.symbolBuilders.arrow = function(d) {
  var len = 'length' in d ? d.length : 10;
  var stroke = d.stroke || 'magenta';
  var strokeWidth = 'stroke-width' in d ? d['stroke-width'] : 1;
  var coords = SVG.getStrokeArrowCoords(len);
  var curve = d.curve || 0;
  var obj = {
    type: 'polyline',
    coordinates: coords,
    stroke: stroke,
    'stroke-width': strokeWidth
  };

  if (d.rotation) {
    SVG.rotateSymbolCoords(coords, d.rotation);
  }

  if (curve && coords[0].length == 2) { // curve arrow stem
    curve = SVG.adjustArrowCurve(coords[0], curve);
    SVG.addBezierArcControlPoints(coords[0][0], coords[0][1], curve);
  }

  if (d.effect == "fade") {
    // TODO
  }
  return obj;
};

SVG.adjustArrowCurve = function(stem, curve) {
  var dx = stem[1][0] - stem[0][0];
  return dx < 0 ? -curve : curve;
};

SVG.getStrokeArrowCoords = function(len) {
  var stalk = [[0, 0], [0, -len]];
  return [stalk];
};

SVG.getFilledArrowCoords = function(d) {
  // TODO
};
