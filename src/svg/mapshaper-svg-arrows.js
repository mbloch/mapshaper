
import { symbolBuilders } from '../svg/svg-common';
import { rotateSymbolCoords } from '../svg/mapshaper-symbol-utils';
import { addBezierArcControlPoints } from '../svg/svg-path-utils';

symbolBuilders.arrow = function(d) {
  var len = 'length' in d ? d.length : 10;
  var stroke = d.stroke || 'magenta';
  var strokeWidth = 'stroke-width' in d ? d['stroke-width'] : 1;
  var coords = getStrokeArrowCoords(len);
  var curve = d.curve || 0;
  var obj = {
    type: 'polyline',
    coordinates: coords,
    stroke: stroke,
    'stroke-width': strokeWidth
  };

  if (d.rotation) {
    rotateSymbolCoords(coords, d.rotation);
  }

  if (curve && coords[0].length == 2) { // curve arrow stem
    curve = adjustArrowCurve(coords[0], curve);
    addBezierArcControlPoints(coords[0][0], coords[0][1], curve);
  }

  if (d.effect == "fade") {
    // TODO
  }
  return obj;
};

function adjustArrowCurve(stem, curve) {
  var dx = stem[1][0] - stem[0][0];
  return dx < 0 ? -curve : curve;
}

function getStrokeArrowCoords(len) {
  var stalk = [[0, 0], [0, -len]];
  return [stalk];
}

function getFilledArrowCoords(d) {
  // TODO
}
