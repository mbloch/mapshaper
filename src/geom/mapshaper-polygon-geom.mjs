
import { error } from '../utils/mapshaper-logging';
import { forEachSegmentInPath } from '../paths/mapshaper-path-utils';
import { calcPathLen } from '../geom/mapshaper-path-geom';
import { WGS84 } from '../geom/mapshaper-geom-constants';
import { testSegmentBoundsIntersection } from '../geom/mapshaper-bounds-geom';

// A compactness measure designed for testing electoral districts for gerrymandering.
// Returns value in [0-1] range. 1 = perfect circle, 0 = collapsed polygon
export function calcPolsbyPopperCompactness(area, perimeter) {
  if (perimeter <= 0) return 0;
  return Math.abs(area) * Math.PI * 4 / (perimeter * perimeter);
}

// Larger values (less severe penalty) than Polsby Popper
export function calcSchwartzbergCompactness(area, perimeter) {
  if (perimeter <= 0) return 0;
  return 2 * Math.PI * Math.sqrt(Math.abs(area) / Math.PI) / perimeter;
}

// Returns: 1 if CW, -1 if CCW, 0 if collapsed
export function getPathWinding(ids, arcs) {
  var area = getPathArea(ids, arcs);
  return area > 0 && 1 || area < 0 && -1 || 0;
}

export function getShapeArea(shp, arcs) {
  // return (arcs.isPlanar() ? geom.getPlanarShapeArea : geom.getSphericalShapeArea)(shp, arcs);
  return (shp || []).reduce(function(area, ids) {
    return area + getPathArea(ids, arcs);
  }, 0);
}

export function getPlanarShapeArea(shp, arcs) {
  return (shp || []).reduce(function(area, ids) {
    return area + getPlanarPathArea(ids, arcs);
  }, 0);
}

export function getSphericalShapeArea(shp, arcs, R) {
  if (arcs.isPlanar()) {
    error("[getSphericalShapeArea()] Function requires decimal degree coordinates");
  }
  return (shp || []).reduce(function(area, ids) {
    return area + getSphericalPathArea(ids, arcs, R);
  }, 0);
}

// export function getEllipsoidalShapeArea(shp, arcs, crs) {
//   return (shp || []).reduce(function(area, ids) {
//     return area + getEllipsoidalPathArea(ids, arcs, crs);
//   }, 0);
// }

// test if a rectangle is completely enclosed in a planar polygon
export function testBoundsInPolygon(bounds, shp, arcs) {
  if (!shp || !testPointInPolygon(bounds.xmin, bounds.ymin, shp, arcs)) return false;
  var isIn = true;
  shp.forEach(function(ids) {
    forEachSegmentInPath(ids, arcs, function(a, b, xx, yy) {
      isIn = isIn && !testSegmentBoundsIntersection([xx[a], yy[a]], [xx[b], yy[b]], bounds);
    });
  });
  return isIn;
}

// Return true if point is inside or on boundary of a shape
//
export function testPointInPolygon(x, y, shp, arcs) {
  var isIn = false,
      isOn = false;
  if (!shp) return false;
  shp.forEach(function(ids) {
    var inRing = testPointInRing(x, y, ids, arcs);
    if (inRing == 1) {
      isIn = !isIn;
    } else if (inRing == -1) {
      isOn = true;
    }
  });
  return isOn || isIn;
}

function getYIntercept(x, ax, ay, bx, by) {
  return ay + (x - ax) * (by - ay) / (bx - ax);
}

function getXIntercept(y, ax, ay, bx, by) {
  return ax + (y - ay) * (bx - ax) / (by - ay);
}



// Test if point (x, y) is inside, outside or on the boundary of a polygon ring
// Return 0: outside; 1: inside; -1: on boundary
//
export function testPointInRing(x, y, ids, arcs) {
  /*
  // arcs.getSimpleShapeBounds() doesn't apply simplification, can't use here
  //// wait, why not? simplifcation shoudn't expand bounds, so this test makes sense
  if (!arcs.getSimpleShapeBounds(ids).containsPoint(x, y)) {
    return false;
  }
  */
  var isIn = false,
      isOn = false;
  forEachSegmentInPath(ids, arcs, function(a, b, xx, yy) {
    var result = testRayIntersection(x, y, xx[a], yy[a], xx[b], yy[b]);
    if (result == 1) {
      isIn = !isIn;
    } else if (isNaN(result)) {
      isOn = true;
    }
  });
  return isOn ? -1 : (isIn ? 1 : 0);
}

// test if a vertical ray originating at (x, y) intersects a segment
// returns 1 if intersection, 0 if no intersection, NaN if point touches segment
// (Special rules apply to endpoint intersections, to support point-in-polygon testing.)
export function testRayIntersection(x, y, ax, ay, bx, by) {
  var val = getRayIntersection(x, y, ax, ay, bx, by);
  if (val != val) {
    return NaN;
  }
  return val == -Infinity ? 0 : 1;
}

export function getRayIntersection(x, y, ax, ay, bx, by) {
  var hit = -Infinity, // default: no hit
      yInt;

  // case: p is entirely above, left or right of segment
  if (x < ax && x < bx || x > ax && x > bx || y > ay && y > by) {
      // no intersection
  }
  // case: px aligned with a segment vertex
  else if (x === ax || x === bx) {
    // case: vertical segment or collapsed segment
    if (x === ax && x === bx) {
      // p is on segment
      if (y == ay || y == by || y > ay != y > by) {
        hit = NaN;
      }
      // else: no hit
    }
    // case: px equal to ax (only)
    else if (x === ax) {
      if (y === ay) {
        hit = NaN;
      } else if (bx < ax && y < ay) {
        // only score hit if px aligned to rightmost endpoint
        hit = ay;
      }
    }
    // case: px equal to bx (only)
    else {
      if (y === by) {
        hit = NaN;
      } else if (ax < bx && y < by) {
        // only score hit if px aligned to rightmost endpoint
        hit = by;
      }
    }
  // case: px is between endpoints
  } else {
    yInt = getYIntercept(x, ax, ay, bx, by);
    if (yInt > y) {
      hit = yInt;
    } else if (yInt == y) {
      hit = NaN;
    }
  }
  return hit;
}

export function getPathArea(ids, arcs) {
  return (arcs.isPlanar() ? getPlanarPathArea : getSphericalPathArea)(ids, arcs);
}

export function getSphericalPathArea(ids, arcs, R) {
  var iter = arcs.getShapeIter(ids);
  return getSphericalPathArea2(iter, R);
}

export function getSphericalPathArea2(iter, R) {
  var sum = 0,
      started = false,
      deg2rad = Math.PI / 180,
      x, y, xp, yp;
  R = R || WGS84.SEMIMAJOR_AXIS;
  while (iter.hasNext()) {
    x = iter.x * deg2rad;
    y = Math.sin(iter.y * deg2rad);
    if (started) {
      sum += (x - xp) * (2 + y + yp);
    } else {
      started = true;
    }
    xp = x;
    yp = y;
  }
  return sum / 2 * R * R;
}

// Get path area from an array of [x, y] points
// TODO: consider removing duplication with getPathArea(), e.g. by
//   wrapping points in an iterator.
//
export function getPlanarPathArea2(points) {
  var sum = 0,
      ax, ay, bx, by, dx, dy, p;
  for (var i=0, n=points.length; i<n; i++) {
    p = points[i];
    if (i === 0) {
      ax = 0;
      ay = 0;
      dx = -p[0];
      dy = -p[1];
    } else {
      ax = p[0] + dx;
      ay = p[1] + dy;
      sum += ax * by - bx * ay;
    }
    bx = ax;
    by = ay;
  }
  return sum / 2;
}

export function getPlanarPathArea(ids, arcs) {
  var iter = arcs.getShapeIter(ids),
      sum = 0,
      ax, ay, bx, by, dx, dy;
  if (iter.hasNext()) {
    ax = 0;
    ay = 0;
    dx = -iter.x;
    dy = -iter.y;
    while (iter.hasNext()) {
      bx = ax;
      by = ay;
      ax = iter.x + dx;
      ay = iter.y + dy;
      sum += ax * by - bx * ay;
    }
  }
  return sum / 2;
}

export function getPathPerimeter(ids, arcs) {
  return (arcs.isPlanar() ? getPlanarPathPerimeter : getSphericalPathPerimeter)(ids, arcs);
}

export function getShapePerimeter(shp, arcs) {
  return (shp || []).reduce(function(len, ids) {
    return len + getPathPerimeter(ids, arcs);
  }, 0);
}

export function getSphericalShapePerimeter(shp, arcs) {
  if (arcs.isPlanar()) {
    error("[getSphericalShapePerimeter()] Function requires decimal degree coordinates");
  }
  return (shp || []).reduce(function(len, ids) {
    return len + getSphericalPathPerimeter(ids, arcs);
  }, 0);
}

export function getPlanarPathPerimeter(ids, arcs) {
  return calcPathLen(ids, arcs, false);
}

export function getSphericalPathPerimeter(ids, arcs) {
  return calcPathLen(ids, arcs, true);
}
