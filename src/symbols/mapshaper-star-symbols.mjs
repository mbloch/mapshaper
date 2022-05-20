import { getPlanarSegmentEndpoint } from '../geom/mapshaper-geodesic';
import { getSymbolRadius } from './mapshaper-symbol-utils';
import { stop } from '../utils/mapshaper-logging';

export function getStarCoords(d) {
  var radius = getSymbolRadius(d),
      points = d.points || d.sides && d.sides / 2 || 5,
      sides = points * 2,
      minorRadius = getMinorRadius(points) * radius,
      b = d.orientation == 'b' || d.flipped || d.rotated ? 0 : 1,
      coords = [],
      angle, len;

  if (radius > 0 === false) return null;
  if (points < 5) {
    stop(`Invalid number of points for a star (${points})`);
  }
  for (var i=0; i<sides; i++) {
    len = i % 2 == 0 ? minorRadius : radius;
    angle = (i + b) / sides * 360;
    coords.push(getPlanarSegmentEndpoint(0, 0, angle, len));
  }
  coords.push(coords[0].concat());
  return [coords];
}

export function getMinorRadius(points) {
  var innerAngle = 360 / points;
  var pointAngle = getDefaultPointAngle(points);
  var thetaA = Math.PI / 180 * innerAngle / 2;
  var thetaB = Math.PI / 180 * pointAngle / 2;
  var a = Math.tan(thetaB) / (Math.tan(thetaB) + Math.tan(thetaA));
  var c = a / Math.cos(thetaA);
  return c;
}

function getDefaultPointAngle(points) {
  var minSkip = 1;
  var maxSkip = Math.ceil(points / 2) - 2;
  var skip = Math.floor((maxSkip + minSkip) / 2);
  return getPointAngle(points, skip);
}

// skip: number of adjacent points to skip when drawing a segment
function getPointAngle(points, skip) {
  var unitAngle = 360 / points;
  var centerAngle = unitAngle * (skip + 1);
  return 180 - centerAngle;
}
