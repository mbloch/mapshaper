/* @requires mapshaper-shapes, mapshaper-geom */

// Calculations for planar geometry of shapes
// TODO: consider 3D versions of some of these

geom.getShapeArea = function(shp, arcs) {
  var area = Utils.reduce(shp, function(area, ids) {
    var iter = arcs.getShapeIter(ids);
    return area + geom.getPathArea(iter);
  }, 0);
  return area;
};

geom.getPathArea = function(iter) {
  var sum = 0,
      x, y;
  if (iter.hasNext()) {
    x = iter.x;
    y = iter.y;
    while (iter.hasNext()) {
      sum += iter.x * y - x * iter.y;
      x = iter.x;
      y = iter.y;
    }
  }
  return sum / 2;
};

// TODO: remove this
geom.getPathArea2 = function(points) {
  var sum = 0,
      x, y, p;
  for (var i=0, n=points.length; i<n; i++) {
    p = points[i];
    if (i > 0) {
      sum += p[0] * y - x * p[1];
    }
    x = p[0];
    y = p[1];
  }
  return sum / 2;
};

geom.getMaxPath = function(shp, arcs) {
  var maxArea = 0;
  return Utils.reduce(shp, function(maxPath, path) {
    var bbArea = arcs.getSimpleShapeBounds(path).area();
    if (bbArea > maxArea) {
      maxArea = bbArea;
      maxPath = path;
    }
    return maxPath;
  }, null);
};

geom.getAvgPathXY = function(ids, arcs) {
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
};

geom.getPathCentroid = function(ids, arcs) {
  var iter = arcs.getShapeIter(ids),
      sum = 0,
      sumX = 0,
      sumY = 0,
      ax, ay, tmp, area;
  if (!iter.hasNext()) return null;
  ax = iter.x;
  ay = iter.y;
  while (iter.hasNext()) {
    tmp = ax * iter.y - ay * iter.x;
    sum += tmp;
    sumX += tmp * (iter.x + ax);
    sumY += tmp * (iter.y + ay);
    ax = iter.x;
    ay = iter.y;
  }
  area = sum / 2;
  if (area === 0) {
    return geom.getAvgPathXY(ids, arcs);
  } else return {
    x: sumX / (6 * area),
    y: sumY / (6 * area)
  };
};

geom.getShapeCentroid = function(shp, arcs) {
  var maxPath = geom.getMaxPath(shp, arcs);
  return maxPath ? geom.getPathCentroid(maxPath, arcs) : null;
};

// TODO: decide how to handle points on the boundary
geom.testPointInShape = function(x, y, shp, arcs) {
  var intersections = 0;
  Utils.forEach(shp, function(ids) {
    if (arcs.getSimpleShapeBounds(ids).containsPoint(x, y)) {
      if (geom.testPointInRing(x, y, ids, arcs)) {
        intersections++;
      }
    }
  });
  return intersections % 2 == 1;
};

// Get a point suitable for anchoring a label
// Method:
// - find centroid
// - ...
//
geom.getInteriorPoint = function(shp, arcs) {


};

geom.getPointToPathDistance = function(px, py, ids, arcs) {
  var iter = arcs.getShapeIter(ids);
  if (!iter.hasNext()) return Infinity;
  var ax = iter.x,
      ay = iter.y,
      paSq = distanceSq(px, py, ax, ay),
      pPathSq = paSq,
      pbSq, abSq,
      bx, by;

  while (iter.hasNext()) {
    bx = iter.x;
    by = iter.y;
    pbSq = distanceSq(px, py, bx, by);
    abSq = distanceSq(ax, ay, bx, by);
    pPathSq = Math.min(pPathSq, pointSegDistSq(paSq, pbSq, abSq));
    ax = bx;
    ay = by;
    paSq = pbSq;
  }
  return Math.sqrt(pPathSq);
};

geom.getYIntercept = function(x, ax, ay, bx, by) {
  return ay + (x - ax) * (by - ay) / (bx - ax);
};

geom.getXIntercept = function(y, ax, ay, bx, by) {
  return ax + (y - ay) * (bx - ax) / (by - ay);
};

// Return signed distance of a point to a shape
//
geom.getPointToShapeDistance = function(x, y, shp, arcs) {
  var minDist = Utils.reduce(shp, function(minDist, ids) {
    var pathDist = geom.getPointToPathDistance(x, y, ids, arcs);
    return Math.min(minDist, pathDist);
  }, Infinity);
  return minDist;
};

geom.testPointInRing = function(x, y, ids, arcs) {
  var iter = arcs.getShapeIter(ids);
  if (!iter.hasNext()) return false;
  var x0 = iter.x,
      y0 = iter.y,
      ax = x0,
      ay = y0,
      bx, by,
      yInt,
      intersections = 0;

  while (iter.hasNext()) {
    bx = iter.x;
    by = iter.y;
    if (x < ax && x < bx || x > ax && x > bx || y >= ay && y >= by) {
      // no intersection
    } else if (x === ax) {
      if (y === ay) {
        intersections = 0;
        break;
      }
      if (bx < x && y < ay) {
        intersections++;
      }
    } else if (x === bx) {
      if (y === by) {
        intersections = 0;
        break;
      }
      if (ax < x && y < by) {
        intersections++;
      }
    } else if (y < ay && y < by) {
      intersections++;
    } else {
      yInt = geom.getYIntercept(x, ax, ay, bx, by);
      if (yInt > y) {
        intersections++;
      }
    }
    ax = bx;
    ay = by;
  }

  return intersections % 2 == 1;
};
