// for testing only

import { getHighPrecisionSnapInterval } from '../paths/mapshaper-snapping';
import { debug } from '../utils/mapshaper-logging';
import { distance2D, distanceSq, pointSegDistSq2 } from '../geom/mapshaper-basic-geom';
import { orient2d as orient2d_robust } from 'robust-predicates';

export function segmentIntersection2(ax, ay, bx, by, cx, cy, dx, dy, epsArg) {
  // var x = -ax;
  // var y = -ay;
  // ax = 0;
  // ay = 0;
  // bx += x;
  // by += y;
  // cx += x;
  // cy += y;
  // dx += x;
  // dy += y;
  // Use a small tolerance interval, so collinear segments and T-intersections
  // are detected (floating point rounding often causes exact functions to fail)
  var eps = epsArg >= 0 ? epsArg :
      getHighPrecisionSnapInterval([ax, ay, bx, by, cx, cy, dx, dy]);
  var epsSq = eps * eps;
  var touches, cross, coords;
  // Detect 0, 1 or 2 'touch' intersections, where a vertex of one segment
  // is very close to the other segment's linear portion.
  // One touch indicates either a T-intersection or two overlapping collinear
  // segments that share an endpoint. Two touches indicates overlapping
  // collinear segments that do not share an endpoint.
  touches = findPointSegTouches(epsSq, ax, ay, bx, by, cx, cy, dx, dy);
  // if (touches) return touches;
  // Ignore endpoint-only intersections
  console.log('touches:', touches);
  console.log('endpoint:', testEndpointHit(epsSq, ax, ay, bx, by, cx, cy, dx, dy));
  if (!touches && testEndpointHit(epsSq, ax, ay, bx, by, cx, cy, dx, dy)) {
    return null;
  }
  // Detect cross intersection
  cross = findCrossIntersection(ax, ay, bx, by, cx, cy, dx, dy, eps);
  console.log('cross:', cross);
  // if (cross && touches) {
  //   // Removed this call -- using multiple snap/cut passes seems more
  //   // effective for repairing real-world datasets.
  //   // return reconcileCrossAndTouches(cross, touches, eps);
  // }
  coords = touches || cross || null;
  // if (coords) {
  //   shiftBack(coords, -x, -y);
  //   return coords;
  // }
  return null;
}

function shiftBack(coords, dx, dy) {
  coords[0] += dx;
  coords[1] += dy;
  if (coords.length > 2) {
    coords[2] += dx;
    coords[3] += dy;
  }
}


function findPointSegTouches(epsSq, ax, ay, bx, by, cx, cy, dx, dy) {
  var touches = [];
  collectPointSegTouch(touches, epsSq, ax, ay, cx, cy, dx, dy);
  collectPointSegTouch(touches, epsSq, bx, by, cx, cy, dx, dy);
  collectPointSegTouch(touches, epsSq, cx, cy, ax, ay, bx, by);
  collectPointSegTouch(touches, epsSq, dx, dy, ax, ay, bx, by);
  if (touches.length === 0) return null;
  if (touches.length > 4) {
    // Geometrically, more than two touch intersections can not occur.
    // Is it possible that fp rounding or a bug might result in >2 touches?
    debug('Intersection detection error');
  }
  return touches;
}

function testEndpointHit(epsSq, ax, ay, bx, by, cx, cy, dx, dy) {
  return distanceSq(ax, ay, cx, cy) <= epsSq || distanceSq(ax, ay, dx, dy) <= epsSq ||
    distanceSq(bx, by, cx, cy) <= epsSq || distanceSq(bx, by, dx, dy) <= epsSq;
}

// Find the intersection point of two segments that cross each other,
// or return null if the segments do not cross.
// Assumes endpoint intersections have already been detected
function findCrossIntersection(ax, ay, bx, by, cx, cy, dx, dy, eps) {
  console.log('[findCrossIntersection()] segment hit?', segmentHit(ax, ay, bx, by, cx, cy, dx, dy), ax, ay);
  if (!segmentHit(ax, ay, bx, by, cx, cy, dx, dy)) return null;
  var den = determinant2D(bx - ax, by - ay, dx - cx, dy - cy);
  var o2d = orient2D(cx, cy, dx, dy, ax, ay);
  var m = o2d / den;
  var p = [ax + m * (bx - ax), ay + m * (by - ay)];
  console.log("den:", den, 'p:', p);

  // the original check is faulty (see geometry ex1)
  // TODO: improve
  // if (Math.abs(den) < 1e-18) {
  if (Math.abs(den) < 1e-25) {
    // assume that collinear and near-collinear segment intersections have been
    // accounted for already.
    // TODO: is this a valid assumption?
    return null;
  }

  // Clamp point to x range and y range of both segments
  // (This may occur due to fp rounding, if one segment is vertical or horizontal)
  clampIntersectionPoint(p, ax, ay, bx, by, cx, cy, dx, dy);

  // Snap p to a vertex if very close to one
  // This avoids tiny segments caused by T-intersection overshoots and prevents
  //   pathfinder errors related to f-p rounding.
  // (NOTE: this may no longer be needed, since T-intersections are now detected
  // first)
  if (eps > 0) {
    snapIntersectionPoint(p, ax, ay, bx, by, cx, cy, dx, dy, eps);
  }
  return p;
}


function clampIntersectionPoint(p, ax, ay, bx, by, cx, cy, dx, dy) {
  // Handle intersection points that fall outside the x-y range of either
  // segment by snapping to nearest endpoint coordinate. Out-of-range
  // intersection points can be caused by floating point rounding errors
  // when a segment is vertical or horizontal. This has caused problems when
  // repeatedly applying bbox clipping along the same segment
  var x = p[0],
      y = p[1];
  // assumes that segment ranges intersect
  x = clampToCloseRange(x, ax, bx);
  x = clampToCloseRange(x, cx, dx);
  y = clampToCloseRange(y, ay, by);
  y = clampToCloseRange(y, cy, dy);
  p[0] = x;
  p[1] = y;
}

function clampToCloseRange(a, b, c) {
  var lim;
  if (outsideRange(a, b, c)) {
    lim = Math.abs(a - b) < Math.abs(a - c) ? b : c;
    if (Math.abs(a - lim) > 1e-15) {
      debug("[clampToCloseRange()] large clamping interval", a, b, c);
    }
    a = lim;
  }
  return a;
}

// a: coordinate of point
// b: endpoint coordinate of segment
// c: other endpoint of segment
function outsideRange(a, b, c) {
  var out;
  if (b < c) {
    out = a < b || a > c;
  } else if (b > c) {
    out = a > b || a < c;
  } else {
    out = a != b;
  }
  return out;
}

function snapIfCloser(p, minDist, x, y, x2, y2) {
  var dist = distance2D(x, y, x2, y2);
  if (dist < minDist) {
    minDist = dist;
    p[0] = x2;
    p[1] = y2;
  }
  return minDist;
}

function snapIntersectionPoint(p, ax, ay, bx, by, cx, cy, dx, dy, eps) {
  var x = p[0],
      y = p[1],
      snapDist = eps;
  snapDist = snapIfCloser(p, snapDist, x, y, ax, ay);
  snapDist = snapIfCloser(p, snapDist, x, y, bx, by);
  snapDist = snapIfCloser(p, snapDist, x, y, cx, cy);
  snapDist = snapIfCloser(p, snapDist, x, y, dx, dy);
}

function collectPointSegTouch(arr, epsSq, px, py, ax, ay, bx, by) {
  // The original point-seg distance function caused errors in test data.
  // (probably because of large rounding errors with some inputs).
  // var pab = pointSegDistSq(px, py, ax, ay, bx, by);
  var pab = pointSegDistSq2(px, py, ax, ay, bx, by);
  if (pab > epsSq) return; // point is too far from segment to touch
  var pa = distanceSq(ax, ay, px, py);
  var pb = distanceSq(bx, by, px, py);
  if (pa <= epsSq || pb <= epsSq) return; // ignore endpoint hits
  arr.push(px, py); // T intersection at P and AB
}

// Determinant of matrix
//  | a  b |
//  | c  d |
function determinant2D(a, b, c, d) {
  return a * d - b * c;
}

// returns a positive value if the points a, b, and c are arranged in
// counterclockwise order, a negative value if the points are in clockwise
// order, and zero if the points are collinear.
// Source: Jonathan Shewchuk http://www.cs.berkeley.edu/~jrs/meshpapers/robnotes.pdf
export function orient2D(ax, ay, bx, by, cx, cy) {
  var retn = determinant2D(ax - cx, ay - cy, bx - cx, by - cy);
  var v2 = -orient2d_robust(ax, ay, bx, by, cx, cy);
  console.log("v1:", retn);
  console.log("v2:", v2);
  return retn;
}

// Source: Sedgewick, _Algorithms in C_
// (Other functions were tried that were more sensitive to floating point errors
//  than this function)
export function segmentHit(ax, ay, bx, by, cx, cy, dx, dy) {
  return orient2D(ax, ay, bx, by, cx, cy) *
      orient2D(ax, ay, bx, by, dx, dy) <= 0 &&
      orient2D(cx, cy, dx, dy, ax, ay) *
      orient2D(cx, cy, dx, dy, bx, by) <= 0;
}

