import geom from '../geom/mapshaper-geom';
import { findNearestVertex } from '../paths/mapshaper-vertex-utils';
import { calcPathLen } from '../geom/mapshaper-path-geom';
import { distance2D } from '../geom/mapshaper-basic-geom';
import { error, stop } from '../utils/mapshaper-logging';
import { forEachSegmentInPath } from '../paths/mapshaper-path-utils';

// Returns x,y coordinates of the point that is at the midpoint of each polyline feature
// Uses 2d cartesian geometry
// TODO: optionally use spherical geometry
export function polylineToMidpoints(shp, arcs, opts) {
  if (!shp) return null;
  var points = shp.map(function(path) {
    return findPathMidpoint(path, arcs, false);
  });
  return points;
}

function findPathMidpoint(path, arcs, useNearestVertex) {
  var halfLen = calcPathLen(path, arcs, false) / 2;
  var partialLen = 0;
  var done = false;
  var p;
  forEachSegmentInPath(path, arcs, function(i, j, xx, yy) {
    var a = xx[i],
        b = yy[i],
        c = xx[j],
        d = yy[j];
    if (p) return;
    if (halfLen > 0 === false) {
      return [a, b];
    }
    var segLen = distance2D(a, b, c, d);
    var k;
    if (partialLen + segLen >= halfLen) {
      k = (halfLen - partialLen) / segLen;
      if (useNearestVertex) {
        k = k < 0.5 ? 0 : 1;
      }
      // p = [a + k * (c - a), b + k * (d - b)];
      p = [(1 - k) * a + k * c, (1 - k) * b + k * d];
    }
    partialLen += segLen;
  });
  if (!p) {
    error('Geometry error');
  }
  return p;
}

// Returns x,y coordinates of the vertex that is closest to the bbox center point
//   (uses part with the largest-area bbox in )
// TODO: explore other methods for replacing a polyline with a point.
export function polylineToPoint(shp, arcs, opts) {
  var spherical = !arcs.isPlanar();
  var part = !shp ? null : (shp.length == 1 ? shp[0] : findLongestPolylinePart(shp, arcs, spherical));
  if (!part) return null;
  var bbox = arcs.getSimpleShapeBounds(part);
  var p = findNearestVertex(bbox.centerX(), bbox.centerY(), [part], arcs, spherical);
  return p;
}

function findLongestPolylinePart(shp, arcs, spherical) {
  var maxLen = 0;
  var maxPart = null;
  shp.forEach(function(path) {
    var len = geom.calcPathLen(path, arcs, spherical);
    if (len > maxLen) {
      maxLen = len;
      maxPart = path;
    }
  });
  return maxPart;
}
