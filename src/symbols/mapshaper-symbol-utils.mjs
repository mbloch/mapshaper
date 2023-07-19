import { getAffineTransform } from '../commands/mapshaper-affine';
import utils from '../utils/mapshaper-utils';
import { getRoundingFunction } from '../geom/mapshaper-rounding';

var roundCoord = getRoundingFunction(0.01);

export function getSymbolFillColor(d) {
  return d.fill || 'magenta';
}

export function getSymbolStrokeColor(d) {
  return d.stroke || d.fill || 'magenta';
}

export function applySymbolStyles(sym, d) {
  if (sym.type == 'polyline') {
    sym.stroke = getSymbolStrokeColor(d);
  } else {
    sym.fill = getSymbolFillColor(d);
  }
  if (d.opacity) {
    sym.opacity = d.opacity;
  }
  return sym;
}

export function getSymbolRadius(d) {
  if (d.radius === 0 || d.length === 0 || d.r === 0) return 0;
  return d.radius || d.length || d.r || 5; // use a default value
}

export function forEachSymbolCoord(coords, cb) {
  var isPoint = coords && utils.isNumber(coords[0]);
  var isNested = !isPoint && coords && Array.isArray(coords[0]);
  if (isPoint) return cb(coords);
  for (var i=0; i<coords.length; i++) {
    if (isNested) forEachSymbolCoord(coords[i], cb);
  }
}

export function flipY(coords) {
  forEachSymbolCoord(coords, function(p) {
    p[1] = -p[1];
  });
}

export function scaleAndShiftCoords(coords, scale, shift) {
  forEachSymbolCoord(coords, function(xy) {
    xy[0] = xy[0] * scale + shift[0];
    xy[1] = xy[1] * scale + shift[1];
  });
}

export function roundCoordsForSVG(coords) {
  forEachSymbolCoord(coords, function(p) {
    p[0] = roundCoord(p[0]);
    p[1] = roundCoord(p[1]);
  });
}

export function rotateCoords(coords, rotation) {
  if (!rotation) return;
  var f = getAffineTransform(rotation, 1, [0, 0], [0, 0]);
  forEachSymbolCoord(coords, function(p) {
    var p2 = f(p[0], p[1]);
    p[0] = p2[0];
    p[1] = p2[1];
  });
}

export function findArcCenter(p1, p2, degrees) {
  var p3 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], // midpoint betw. p1, p2
      tan = 1 / Math.tan(degrees / 180 * Math.PI / 2),
      cp = getAffineTransform(90, tan, [0, 0], p3)(p2[0], p2[1]);
  return cp;
}

// export function addBezierArcControlPoints(p1, p2, degrees) {
export function addBezierArcControlPoints(points, degrees) {
  // source: https://stackoverflow.com/questions/734076/how-to-best-approximate-a-geometrical-arc-with-a-bezier-curve
  var p2 = points.pop(),
      p1 = points.pop(),
      cp = findArcCenter(p1, p2, degrees),
      xc = cp[0],
      yc = cp[1],
      ax = p1[0] - xc,
      ay = p1[1] - yc,
      bx = p2[0] - xc,
      by = p2[1] - yc,
      q1 = ax * ax + ay * ay,
      q2 = q1 + ax * bx + ay * by,
      k2 = 4/3 * (Math.sqrt(2 * q1 * q2) - q2) / (ax * by - ay * bx);

  points.push(p1);
  points.push([xc + ax - k2 * ay, yc + ay + k2 * ax, 'C']);
  points.push([xc + bx + k2 * by, yc + by - k2 * bx, 'C']);
  points.push(p2);
}
