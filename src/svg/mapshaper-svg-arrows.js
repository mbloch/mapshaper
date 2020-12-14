
import { symbolBuilders } from '../svg/svg-common';
import { addBezierArcControlPoints } from '../svg/svg-path-utils';
import { getAffineTransform } from '../commands/mapshaper-affine';

symbolBuilders.arrow = function(d) {
  var len = 'length' in d ? d.length : 10;
  var filled = 'fill' in d;
  return filled ? getFilledArrow(d, len) : getStickArrow(d, len);
};

function getStickArrow(d, len) {
  return {
    type: 'polyline',
    coordinates: getStickArrowCoords(d, len),
    stroke: d.stroke || 'magenta',
    'stroke-width': 'stroke-width' in d ? d['stroke-width'] : 1
  };
}

function getFilledArrow(d, totalLen) {
  return {
    type: 'polygon',
    coordinates: getFilledArrowCoords(d, totalLen),
    fill: d.fill || 'magenta'
  };
}

function getScale(totalLen, headLen) {
  var maxHeadPct = 0.60;
  var headPct = headLen / totalLen;
  if (headPct > maxHeadPct) {
    return maxHeadPct / headPct;
  }
  return 1;
}

function getStickArrowTip(totalLen, curve) {
  // curve/2 intersects the arrowhead at 90deg (trigonometry)
  var theta = Math.abs(curve/2) / 180 * Math.PI;
  var dx = totalLen * Math.sin(theta) * (curve > 0 ? -1 : 1);
  var dy = totalLen * Math.cos(theta);
  return [dx, dy];
}

function addPoints(a, b) {
  return [a[0] + b[0], a[1] + b[1]];
}

function getStickArrowCoords(d, totalLen) {
  var headAngle = d['arrow-head-angle'] || 90;
  var curve = d['arrow-stem-curve'] || 0;
  var unscaledHeadWidth = d['arrow-head-width'] || 9;
  var unscaledHeadLen = getHeadLength(unscaledHeadWidth, headAngle);
  var scale = getScale(totalLen, unscaledHeadLen); // scale down small arrows
  var headWidth = unscaledHeadWidth * scale;
  var headLen = unscaledHeadLen * scale;
  var tip = getStickArrowTip(totalLen, curve);
  var stem = [[0, 0], tip.concat()];
  if (curve) {
    addBezierArcControlPoints(stem, curve);
  }
  if (!headLen) return [stem];
  var head = [addPoints([-headWidth / 2, -headLen], tip), tip.concat(), addPoints([headWidth / 2, -headLen], tip)];

  rotateSymbolCoords(stem, d.rotation);
  rotateSymbolCoords(head, d.rotation);
  return [stem, head];
}

function getHeadLength(headWidth, headAngle) {
  var headRatio = 1 / Math.tan(Math.PI * headAngle / 180 / 2) / 2; // length-to-width head ratio
  return headWidth * headRatio;
}

function getFilledArrowCoords(d, totalLen) {
  var headAngle = d['arrow-head-angle'] || 40,
      unscaledStemWidth = d['arrow-stem-width'] || 2,
      unscaledHeadWidth = d['arrow-head-width'] || unscaledStemWidth * 3,
      unscaledHeadLen = getHeadLength(unscaledHeadWidth, headAngle),
      scale = getScale(totalLen, unscaledHeadLen), // scale down small arrows
      headWidth = unscaledHeadWidth * scale,
      headLen = unscaledHeadLen * scale,
      stemWidth = unscaledStemWidth * scale,
      stemTaper = d['arrow-stem-taper'] || 0,
      stemLen = totalLen - headLen;

  var headDx = headWidth / 2,
      stemDx = stemWidth / 2,
      baseDx = stemDx * (1 - stemTaper);

  var coords = [[baseDx, 0], [stemDx, stemLen], [headDx, stemLen], [0, stemLen + headLen],
        [-headDx, stemLen], [-stemDx, stemLen], [-baseDx, 0], [baseDx, 0]];

  rotateSymbolCoords(coords, d.rotation);
  return [coords];
}

export function rotateSymbolCoords(coords, rotation) {
  // TODO: consider avoiding re-instantiating function on every call
  var f = getAffineTransform(rotation || 0, 1, [0, 0], [0, 0]);
  coords.forEach(function(p) {
    var p2 = f ? f(p[0], p[1]) : p;
    p[0] = p2[0];
    p[1] = -p2[1]; // flip y-axis (to produce display coords)
  });
}

