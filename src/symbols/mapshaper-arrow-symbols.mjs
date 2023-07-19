
import { rotateCoords, flipY, scaleAndShiftCoords } from './mapshaper-symbol-utils';
import { stop } from '../utils/mapshaper-logging';

export function getStickArrowCoords(d) {
  return getArrowCoords(d, 'stick');
}

export function getFilledArrowCoords(d) {
  return getArrowCoords(d, 'standard');
}

export function getArrowCoords(d, style) {
  var stickArrow = style == 'stick',
      // direction = d.rotation || d.direction || 0,
      direction = d.direction || 0, // rotation is an independent parameter
      stemTaper = d['stem-taper'] || 0,
      curvature = d['stem-curve'] || 0,
      size = calcArrowSize(d, stickArrow);
  if (!size) return null;
  var stemLen = size.stemLen,
      headLen = size.headLen,
      headDx = size.headWidth / 2,
      stemDx = size.stemWidth / 2,
      baseDx = stemDx * (1 - stemTaper),
      coords, dx, dy;

  if (curvature) {
    // make curved stem
    if (direction > 0) curvature = -curvature;
    var theta = Math.abs(curvature) / 180 * Math.PI;
    var sign = curvature > 0 ? 1 : -1;
    var ax = baseDx * Math.cos(theta); // rotate arrow base
    var ay = baseDx * Math.sin(theta) * -sign;
    dx = stemLen * Math.sin(theta / 2) * sign;
    dy = stemLen * Math.cos(theta / 2);

    if (stickArrow) {
      coords = getCurvedStemCoords(-ax, -ay, dx, dy);
    } else {
      var leftStem = getCurvedStemCoords(-ax, -ay, -stemDx + dx, dy);
      var rightStem = getCurvedStemCoords(ax, ay, stemDx + dx, dy);
      coords = leftStem.concat(rightStem.reverse());
    }

  } else {
    // make straight stem
    dx = 0;
    dy = stemLen;
    if (stickArrow) {
      coords = [[0, 0], [0, stemLen]];
    } else {
      coords = [[-baseDx, 0], [baseDx, 0]];
    }
  }

  if (stickArrow) {
    // make stick arrow
    coords = [coords]; // MultiLineString coords
    if (headLen > 0) {
      coords.push([[-headDx + dx, stemLen - headLen], [dx, stemLen], [headDx + dx, stemLen - headLen]]);
    }
  } else {
    // make filled arrow
    // coordinates go counter clockwise, starting from the leftmost head coordinate
    coords.push([stemDx + dx, dy]);
    if (headLen > 0) {
      coords.push([headDx + dx, dy], [dx, headLen + dy], [-headDx + dx, dy]);
    }
    coords.push([-stemDx + dx, dy], coords[0].concat()); // close path
    coords = [coords]; // Polygon coords
  }

  if (d.anchor == 'end') {
    scaleAndShiftCoords(coords, 1, [-dx, -dy - headLen]);
  } else if (d.anchor == 'middle') {
    // shift midpoint away from the head a bit for a more balanced placement
    // scaleAndShiftCoords(coords, 1, [-dx/2, (-dy - headLen)/2]);
    scaleAndShiftCoords(coords, 1, [-dx * 0.5, -dy * 0.5 - headLen * 0.25]);
  }

  rotateCoords(coords, direction);
  if (d.flipped) {
    flipY(coords);
  }
  return coords;
}

// function calcStraightArrowCoords(stemLen, headLen, stemDx, headDx, baseDx) {
//   return [[baseDx, 0], [stemDx, stemLen], [headDx, stemLen], [0, stemLen + headLen],
//         [-headDx, stemLen], [-stemDx, stemLen], [-baseDx, 0], [baseDx, 0]];
// }

function calcArrowSize(d, stickArrow) {
  // don't display arrows with negative length
  var totalLen = Math.max(d.radius || d.length || d.r || 0, 0),
      scale = 1,
      o = initArrowSize(d); // calc several parameters
  if (totalLen >= 0) {
    scale = calcScale(totalLen, o.headLen, d);
    o.stemWidth *= scale;
    o.headWidth *= scale;
    o.headLen *= scale;
    o.stemLen = stickArrow ? totalLen : totalLen - o.headLen;
  }

  if (o.headWidth < o.stemWidth && o.headWidth > 0) {
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
  return scale || 0;
}

export function initArrowSize(d) {
  var sizeRatio = getHeadSizeRatio(d['head-angle'] || 40); // length to width
  var o = {
    stemWidth: d['stem-width'] || 2,
    stemLen: d['stem-length'] || 0,
    headWidth: d['head-width'],
    headLen: d['head-length']
  };
  if (o.headWidth === 0) {
    o.headLen = 0;
  } else if (o.headWidth > 0 === false) {
    if (o.headLen > 0) {
      o.headWidth = o.headLen / sizeRatio;
    } else if (o.headLen === 0) {
      o.headWidth = 0;
    } else {
      o.headWidth = o.stemWidth * 3; // assumes stemWidth has been set
    }
  }
  if (o.headLen >= 0 === false) {
    o.headLen = o.headWidth * sizeRatio;
  }
  return o;
}


// Returns ratio of head length to head width
function getHeadSizeRatio(headAngle) {
  return 1 / Math.tan(Math.PI * headAngle / 180 / 2) / 2;
}


// ax, ay: point on the base
// bx, by: point on the stem
function getCurvedStemCoords(ax, ay, bx, by) {
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
