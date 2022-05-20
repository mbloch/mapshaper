import { Bounds } from '../geom/mapshaper-bounds';
import { pointSegDistSq2, greatCircleDistance, distance2D } from '../geom/mapshaper-basic-geom';
import { stop, error } from '../utils/mapshaper-logging';

export function pathIsClosed(ids, arcs) {
  var firstArc = ids[0];
  var lastArc = ids[ids.length - 1];
  var p1 = arcs.getVertex(firstArc, 0);
  var p2 = arcs.getVertex(lastArc, -1);
  var closed = p1.x === p2.x && p1.y === p2.y;
  return closed;
}

export function getPointToPathDistance(px, py, ids, arcs) {
  return getPointToPathInfo(px, py, ids, arcs).distance;
}

export function getPointToPathInfo(px, py, ids, arcs) {
  var iter = arcs.getShapeIter(ids);
  var pPathSq = Infinity;
  var arcId;
  var ax, ay, bx, by, axmin, aymin, bxmin, bymin, pabSq;
  if (iter.hasNext()) {
    ax = axmin = bxmin = iter.x;
    ay = aymin = bymin = iter.y;
  }
  while (iter.hasNext()) {
    bx = iter.x;
    by = iter.y;
    pabSq = pointSegDistSq2(px, py, ax, ay, bx, by);
    if (pabSq < pPathSq) {
      pPathSq = pabSq;
      arcId = iter._ids[iter._i]; // kludge
      axmin = ax;
      aymin = ay;
      bxmin = bx;
      bymin = by;
    }
    ax = bx;
    ay = by;
  }
  if (pPathSq == Infinity) return {distance: Infinity};
  return {
    segment: [[axmin, aymin], [bxmin, bymin]],
    distance: Math.sqrt(pPathSq),
    arcId: arcId
  };
}


// Return unsigned distance of a point to the nearest point on a polygon or polyline path
//
export function getPointToShapeDistance(x, y, shp, arcs) {
  var info = getPointToShapeInfo(x, y, shp, arcs);
  return info ? info.distance : Infinity;
}

export function getPointToShapeInfo(x, y, shp, arcs) {
  return (shp || []).reduce(function(memo, ids) {
    var pathInfo = getPointToPathInfo(x, y, ids, arcs);
    if (!memo || pathInfo.distance < memo.distance) return pathInfo;
    return memo;
  }, null) || {
    distance: Infinity,
    arcId: -1,
    segment: null
  };
}

// @ids array of arc ids
// @arcs ArcCollection
export function getAvgPathXY(ids, arcs) {
  var iter = arcs.getShapeIter(ids);
  if (!iter.hasNext()) return null;
  var x0 = iter.x,
      y0 = iter.y,
      count = 0,
      sumX = 0,
      sumY = 0;
  while (iter.hasNext()) {
    count++;
    sumX += iter.x;
    sumY += iter.y;
  }
  if (count === 0 || iter.x !== x0 || iter.y !== y0) {
    sumX += x0;
    sumY += y0;
    count++;
  }
  return {
    x: sumX / count,
    y: sumY / count
  };
}

// Return path with the largest (area) bounding box
// @shp array of array of arc ids
// @arcs ArcCollection
export function getMaxPath(shp, arcs) {
  var maxArea = 0;
  return (shp || []).reduce(function(maxPath, path) {
    var bbArea = arcs.getSimpleShapeBounds(path).area();
    if (bbArea > maxArea) {
      maxArea = bbArea;
      maxPath = path;
    }
    return maxPath;
  }, null);
}

export function countVerticesInPath(ids, arcs) {
  var iter = arcs.getShapeIter(ids),
      count = 0;
  while (iter.hasNext()) count++;
  return count;
}

export function getPathBounds(points) {
  var bounds = new Bounds();
  for (var i=0, n=points.length; i<n; i++) {
    bounds.mergePoint(points[i][0], points[i][1]);
  }
  return bounds;
}

export var calcPathLen;
calcPathLen = (function() {
  var len, calcLen;
  function addSegLen(i, j, xx, yy) {
    len += calcLen(xx[i], yy[i], xx[j], yy[j]);
  }
  // @spherical (optional bool) calculate great circle length in meters
  return function(path, arcs, spherical) {
    if (spherical && arcs.isPlanar()) {
      error("Expected lat-long coordinates");
    }
    calcLen = spherical ? greatCircleDistance : distance2D;
    len = 0;
    for (var i=0, n=path.length; i<n; i++) {
      arcs.forEachArcSegment(path[i], addSegLen);
    }
    return len;
  };
}());
