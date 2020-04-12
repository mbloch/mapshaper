import geom from '../geom/mapshaper-geom';

// Returns x,y coordinates of the vertex that is closest to the bbox center point
//   (uses part with the largest-area bbox in )
// TODO: explore other methods for replacing a polyline with a point.
export function polylineToPoint(shp, arcs, opts) {
  var spherical = !arcs.isPlanar();
  var part = !shp ? null : (shp.length == 1 ? shp[0] : findLongestPolylinePart(shp, arcs, spherical));
  if (!part) return null;
  var bbox = arcs.getSimpleShapeBounds(part);
  var p = findNearestPolylineVertex(bbox.centerX(), bbox.centerY(), part, arcs, spherical);
  return p;
}

function findNearestPolylineVertex(x, y, path, arcs, spherical) {
  var minLen = Infinity,
      minX, minY,
      iter = arcs.getShapeIter(path),
      calcLen = spherical ? geom.greatCircleDistance : geom.distance2D,
      dist;
  while (iter.hasNext()) {
    dist = calcLen(x, y, iter.x, iter.y);
    if (dist < minLen) {
      minLen = dist;
      minX = iter.x;
      minY = iter.y;
    }
  }
  return minLen < Infinity ? {x: minX, y: minY} : null;
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
