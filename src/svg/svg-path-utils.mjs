
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

export function stringifyPolygonCoords(coords) {
  var parts = [];
  for (var i=0; i<coords.length; i++) {
    parts.push(stringifyLineStringCoords(coords[i]) + ' Z');
  }
  return parts.length > 0 ? parts.join(' ') : '';
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

