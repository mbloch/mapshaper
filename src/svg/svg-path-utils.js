
import { getAffineTransform } from '../commands/mapshaper-affine';
import { getRoundingFunction } from '../geom/mapshaper-rounding';

var roundCoord = getRoundingFunction(0.01);

function stringifyVertex(p) {
  return ' ' + roundCoord(p[0]) + ' ' + roundCoord(p[1]);
}

function stringifyCP(p) {
  return ' ' + roundCoord(p[2]) + ' ' + roundCoord(p[3]);
}

function isCubicCtrl(p) {
  return p.length > 2 && p[2] == 'C';
}

export function stringifyLineStringCoords(coords) {
  if (coords.length === 0) return '';
  var d = 'M';
  var fromCurve = false;
  var p, i, n;
  for (i=0, n=coords.length; i<n; i++) {
    p = coords[i];
    if (isCubicCtrl(p)) {
      // TODO: add defensive check
      d += ' C' + stringifyVertex(p) + stringifyVertex(coords[++i]) + stringifyVertex(coords[++i]);
      fromCurve = true;
    } else if (fromCurve) {
      d += ' L' + stringifyVertex(p);
      fromCurve = false;
    } else {
      d += stringifyVertex(p);
    }
  }
  return d;
}

function stringifyBezierArc(coords) {
  var p1 = coords[0],
      p2 = coords[1];
  return 'M' + stringifyVertex(p1) + ' C' + stringifyCP(p1) +
          stringifyCP(p2) + stringifyVertex(p2);
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
