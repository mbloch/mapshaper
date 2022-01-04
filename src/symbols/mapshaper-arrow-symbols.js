
import { addBezierArcControlPoints, rotateCoords, flipY } from './mapshaper-symbol-utils';
import { stop } from '../utils/mapshaper-logging';

// export function getStickArrowCoords(d, totalLen) {
//   var minStemRatio = getMinStemRatio(d);
//   var headAngle = d['arrow-head-angle'] || 90;
//   var curve = d['arrow-stem-curve'] || 0;
//   var unscaledHeadWidth = d['arrow-head-width'] || 9;
//   var unscaledHeadLen = getHeadLength(unscaledHeadWidth, headAngle);
//   var scale = getScale(totalLen, unscaledHeadLen, minStemRatio);
//   var headWidth = unscaledHeadWidth * scale;
//   var headLen = unscaledHeadLen * scale;
//   var tip = getStickArrowTip(totalLen, curve);
//   var stem = [[0, 0], tip.concat()];
//   if (curve) {
//     addBezierArcControlPoints(stem, curve);
//   }
//   if (!headLen) return [stem];
//   var head = [addPoints([-headWidth / 2, -headLen], tip), tip.concat(), addPoints([headWidth / 2, -headLen], tip)];

//   rotateCoords(stem, d.rotation);
//   rotateCoords(head, d.rotation);
//   return [stem, head];
// }

// function getStickArrowTip(totalLen, curve) {
//   // curve/2 intersects the arrowhead at 90deg (trigonometry)
//   var theta = Math.abs(curve/2) / 180 * Math.PI;
//   var dx = totalLen * Math.sin(theta) * (curve > 0 ? -1 : 1);
//   var dy = totalLen * Math.cos(theta);
//   return [dx, dy];
// }

// function addPoints(a, b) {
//   return [a[0] + b[0], a[1] + b[1]];
// }

export function getFilledArrowCoords(d) {
  var direction = d.rotation || d.direction || 0,
      stemTaper = d['stem-taper'] || 0,
      stemCurve = d['stem-curve'] || 0,
      size = calcArrowSize(d);

  if (!size) return null;

  var headDx = size.headWidth / 2,
      stemDx = size.stemWidth / 2,
      baseDx = stemDx * (1 - stemTaper),
      coords;

  if (!stemCurve || Math.abs(stemCurve) > 90) {
    coords = calcStraightArrowCoords(size.stemLen, size.headLen, stemDx, headDx, baseDx);
  } else {
    if (direction > 0) stemCurve = -stemCurve;
    coords = getCurvedArrowCoords(size.stemLen, size.headLen, stemCurve, stemDx, headDx, baseDx);
  }

  rotateCoords(coords, direction);
  if (d.flipped) {
    flipY(coords);
  }
  return [coords];
}

function calcStraightArrowCoords(stemLen, headLen, stemDx, headDx, baseDx) {
  return [[baseDx, 0], [stemDx, stemLen], [headDx, stemLen], [0, stemLen + headLen],
        [-headDx, stemLen], [-stemDx, stemLen], [-baseDx, 0], [baseDx, 0]];
}

function calcArrowSize(d) {
  var totalLen = d.radius || d.length || d.r || 0,
      scale = 1,
      o = initArrowSize(d); // calc several parameters

  if (totalLen > 0) {
    scale = calcScale(totalLen, o.headLen, d);
    o.stemWidth *= scale;
    o.headWidth *= scale;
    o.headLen *= scale;
    o.stemLen = totalLen - o.headLen;
  }

  if (o.headWidth < o.stemWidth) {
    stop('Arrow head must be at least as wide as the stem.');
  }
  return o;
}

function calcScale(totalLen, headLen, d) {
  var minStemRatio = d['min-stem-ratio'] >= 0 ? d['min-stem-ratio'] : 0;
  var stemLen = d['stem-length'] || 0;
  var maxHeadPct = 1 - minStemRatio;
  var headPct = headLen / totalLen;
  var scale = 1;

  if (headPct > maxHeadPct) {
    scale = maxHeadPct / headPct;
  } else if (stemLen + headLen > totalLen) {
    scale = totalLen / (stemLen + headLen);
  }
  return scale;
}

export function initArrowSize(d) {
  var sizeRatio = getHeadSizeRatio(d['head-angle'] || 40); // length to width
  var o = {
    stemWidth: d['stem-width'] || 2,
    stemLen: d['stem-length'] || 0,
    headWidth: d['head-width'],
    headLen: d['head-length']
  };
  if (!o.headWidth) {
    if (o.headLen) {
      o.headWidth = o.headLen / sizeRatio;
    } else {
      o.headWidth = o.stemWidth * 3; // assumes stemWidth has been set
    }
  }
  if (!o.headLen) {
    o.headLen = o.headWidth * sizeRatio;
  }
  return o;
}


// Returns ratio of head length to head width
function getHeadSizeRatio(headAngle) {
  return 1 / Math.tan(Math.PI * headAngle / 180 / 2) / 2;
}

function getCurvedArrowCoords(stemLen, headLen, curvature, stemDx, headDx, baseDx) {
  // coordinates go counter clockwise, starting from the leftmost head coordinate
  var theta = Math.abs(curvature) / 180 * Math.PI;
  var sign = curvature > 0 ? 1 : -1;
  var dx = stemLen * Math.sin(theta / 2) * sign;
  var dy = stemLen * Math.cos(theta / 2);
  var head = [[stemDx + dx, dy], [headDx + dx, dy],
    [dx, headLen + dy], [-headDx + dx, dy], [-stemDx + dx, dy]];
  var ax = baseDx * Math.cos(theta); // rotate arrow base
  var ay = baseDx * Math.sin(theta) * -sign;
  var leftStem = getCurvedStemCoords(-ax, -ay, -stemDx + dx, dy, theta);
  var rightStem = getCurvedStemCoords(ax, ay, stemDx + dx, dy, theta);
  var stem = leftStem.concat(rightStem.reverse());
  // stem.pop();
  return stem.concat(head);
}

// ax, ay: point on the base
// bx, by: point on the stem
function getCurvedStemCoords(ax, ay, bx, by, theta0) {
  // case: curved side intrudes into head (because stem is too short)
  if (ay > by) {
    return [[ax * by / ay, by]];
  }
  var dx = bx - ax,
      dy = by - ay,
      dy1 = (dy * dy - dx * dx) / (2 * dy),
      dy2 = dy - dy1,
      dx2 = Math.sqrt(dx * dx + dy * dy) / 2,
      theta = Math.PI - Math.asin(dx2 / dy2) * 2,
      degrees = theta * 180 / Math.PI,
      radius = dy2 / Math.tan(theta / 2),
      leftBend = bx > ax,
      sign = leftBend ? 1 : -1,
      points = Math.round(degrees / 5) + 2,
      increment = theta / (points + 1),
      coords = [[bx, by]];

  for (var i=1; i<= points; i++) {
    var phi = i * increment / 2;
    var sinPhi = Math.sin(phi);
    var cosPhi = Math.cos(phi);
    var c = sinPhi * radius * 2;
    var a = sinPhi * c;
    var b = cosPhi * c;
    coords.push([bx - a * sign, by - b]);
  }
  coords.push([ax, ay]);
  return coords;
}
