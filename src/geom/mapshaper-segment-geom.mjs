
import { getHighPrecisionSnapInterval } from '../paths/mapshaper-snapping';
import { debug } from '../utils/mapshaper-logging';
import { distance2D, distanceSq, pointSegDistSq2 } from '../geom/mapshaper-basic-geom';
import { fromScaledStr, toScaledStr, findBigIntScaleFactor } from '../geom/mapshaper-bigint-utils';
//import { findCrossIntersection_big } from '../geom/mapshaper-segment-geom-big';

// Find the intersection between two 2D segments
// Returns 0, 1 or 2 [x, y] locations as null, [x, y], or [x1, y1, x2, y2]
// Special cases:
// Endpoint-to-endpoint touches are not treated as intersections.
// If the segments touch at a T-intersection, it is treated as an intersection.
// If the segments are collinear and partially overlapping, each subsumed endpoint
//    is counted as an intersection (there will be either one or two)
//
export function segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy, epsArg) {
  // Use a small tolerance interval, so collinear segments and T-intersections
  // are detected (floating point rounding often causes exact functions to fail)
  var eps = epsArg > 0 ? epsArg :
      getHighPrecisionSnapInterval([ax, ay, bx, by, cx, cy, dx, dy]);
  var epsSq = eps * eps;
  var touches, cross;

  // Detect 0, 1 or 2 'touch' intersections, where a vertex of one segment
  // is very close to the other segment's linear portion.
  // One touch indicates either a T-intersection or two overlapping collinear
  // segments that share an endpoint. Two touches indicates overlapping
  // collinear segments that do not share an endpoint.
  touches = findPointSegTouches(epsSq, ax, ay, bx, by, cx, cy, dx, dy);
  // Ignore endpoint-only intersections
  if (!touches && testEndpointHit(epsSq, ax, ay, bx, by, cx, cy, dx, dy)) {
    return null;
  }
  // Detect cross intersection
  // (TODO: consider cross intersections that are also endpoint hits)
  if (!touches) {
    cross = findCrossIntersection(ax, ay, bx, by, cx, cy, dx, dy, eps);
  }
  return touches || cross || null;
}

function findCrossIntersection(ax, ay, bx, by, cx, cy, dx, dy, eps) {
  var p;
  // The normal-precision hit function works for all inputs when eps > 0 because
  // the geometries that cause the ordinary function fails are detected as
  // 'touches' or endpoint hits (at least this was true in all the real-world
  // data samples that were tested).
  //
  if (eps > 0 && !segmentHit_fast(ax, ay, bx, by, cx, cy, dx, dy)) {
    return null;
  } else if (eps === 0 && !segmentHit_robust(ax, ay, bx, by, cx, cy, dx, dy)) {
    return null;
  }

  // in a typical layer with many intersections along shared polygon boundaries,
  // robust is preferred in most (>90%) segment intersections in order to keep
  // the positional error within a small interval (e.g. 50% of eps)
  //
  if (useRobustCross(ax, ay, bx, by, cx, cy, dx, dy)) {
    p = findCrossIntersection_robust(ax, ay, bx, by, cx, cy, dx, dy);
    // var p2 = findCrossIntersection_big(ax, ay, bx, by, cx, cy, dx, dy);
    // var dx = p[0] - p2[0];
    // var dy = p[1] - p2[1];
    // if (dx != 0 || dy != 0) {
    //   console.log(dx, dy)
    // }
  } else {
    p = findCrossIntersection_fast(ax, ay, bx, by, cx, cy, dx, dy);
  }
  if (!p) return null;

  // Snap p to a vertex if very close to one
  // This avoids tiny segments caused by T-intersection overshoots and prevents
  //   pathfinder errors related to f-p rounding.
  // (NOTE: this may no longer be needed, since T-intersections are now detected
  // first)
  if (eps > 0) {
    snapIntersectionPoint(p, ax, ay, bx, by, cx, cy, dx, dy, eps);
  }
  // Clamp point to x range and y range of both segments
  // (This may occur due to fp rounding, if one segment is vertical or horizontal)
  clampIntersectionPoint(p, ax, ay, bx, by, cx, cy, dx, dy);
  return p;
}

function findCrossIntersection_fast(ax, ay, bx, by, cx, cy, dx, dy) {
  var den = determinant2D(bx - ax, by - ay, dx - cx, dy - cy);
  var m = orient2D(cx, cy, dx, dy, ax, ay) / den;
  var p = [ax + m * (bx - ax), ay + m * (by - ay)];
  if (Math.abs(den) < 1e-25) {
    // changed from 1e-18 to 1e-25 (see geom ex1)
    // assume that collinear and near-collinear segment intersections have been
    // accounted for already.
    // TODO: is this really true?
    return null;
  }
  return p;
}

// this function, using BigInt, is 3-4x faster than the version using big.js
export function findCrossIntersection_robust(ax, ay, bx, by, cx, cy, dx, dy) {
  var d = findBigIntScaleFactor(ax, ay, bx, by, cx, cy, dx, dy);
  var d2 = 16; // scale numerator of integer division by this many decimal digits
  var k_bi = 10000000000000000n; // matches d2
  var ax_bi = BigInt(toScaledStr(ax, d));
  var ay_bi = BigInt(toScaledStr(ay, d));
  var bx_bi = BigInt(toScaledStr(bx, d));
  var by_bi = BigInt(toScaledStr(by, d));
  var cx_bi = BigInt(toScaledStr(cx, d));
  var cy_bi = BigInt(toScaledStr(cy, d));
  var dx_bi = BigInt(toScaledStr(dx, d));
  var dy_bi = BigInt(toScaledStr(dy, d));
  var den = determinant2D(bx_bi - ax_bi, by_bi - ay_bi, dx_bi - cx_bi, dy_bi - cy_bi);
  if (den === 0n) {
    debug('DIV0 error - should have been identified as collinear "touch" intersection.');
    return null;
  }
  var num = orient2D(cx_bi, cy_bi, dx_bi, dy_bi, ax_bi, ay_bi) * k_bi;
  var m_bi = num / den;
  var x_bi = ax_bi * k_bi + m_bi * (bx_bi - ax_bi);
  var y_bi = ay_bi * k_bi + m_bi * (by_bi - ay_bi);
  var x = fromScaledStr(x_bi.toString(), d + d2);
  var y = fromScaledStr(y_bi.toString(), d + d2);
  return [x, y];
}

function useRobustCross(ax, ay, bx, by, cx, cy, dx, dy) {
  // angle and seg length ratio thresholds were found by comparing
  // fast and robust outputs on sample data
  if (innerAngle(ax, ay, bx, by, cx, cy, dx, dy) < 0.1) return true;
  var len1 = distance2D(ax, ay, bx, by);
  var len2 = distance2D(cx, cy, dx, dy);
  var ratio = len1 < len2 ? len1 / len2 : len2 / len1 || 0;
  if (ratio < 0.001) return true;
  return false;
}

// Returns smaller of two angles between two segments (unsigned)
function innerAngle(ax, ay, bx, by, cx, cy, dx, dy) {
  var v1x = bx - ax;
  var v1y = by - ay;
  var v2x = dx - cx;
  var v2y = dy - cy;
  var dot = v1x * v2x + v1y * v2y;
  var mag1Sq = v1x * v1x + v1y * v1y;
  var mag2Sq = v2x * v2x + v2y * v2y;
  if (mag1Sq === 0 || mag2Sq === 0) {
    return 0;
  }
  var cosTheta = dot / Math.sqrt(mag1Sq * mag2Sq);
  var theta;
  if (cosTheta > 1 - 1e-14) {
    theta = 0;
  } else if (cosTheta < -1 + 1e-14) {
    theta = Math.PI;
  } else {
    theta = Math.acos(cosTheta);
  }
  if (theta >= Math.PI / 2) {
    theta = Math.PI - theta;
  }
  return theta;
}

function testEndpointHit(epsSq, ax, ay, bx, by, cx, cy, dx, dy) {
  return distanceSq(ax, ay, cx, cy) <= epsSq ||
    distanceSq(ax, ay, dx, dy) <= epsSq ||
    distanceSq(bx, by, cx, cy) <= epsSq ||
    distanceSq(bx, by, dx, dy) <= epsSq;
}

function findPointSegTouches(epsSq, ax, ay, bx, by, cx, cy, dx, dy) {
  var touches = [];
  collectPointSegTouch(touches, epsSq, ax, ay, cx, cy, dx, dy);
  collectPointSegTouch(touches, epsSq, bx, by, cx, cy, dx, dy);
  collectPointSegTouch(touches, epsSq, cx, cy, ax, ay, bx, by);
  collectPointSegTouch(touches, epsSq, dx, dy, ax, ay, bx, by);
  if (touches.length === 0) return null;
  if (touches.length > 4) {
    // console.log('XX', touches.length)
    // console.log('Seg 1', getSegFeature(ax, ay, bx, by, true))
    // console.log('Seg 2', getSegFeature(cx, cy, dx, dy, false))
    // Geometrically, more than two touch intersections can not occur.
    // Is it possible that fp rounding or a bug might result in >2 touches?
    debug('Intersection detection error');
  }
  return touches;
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
  // console.log("Dist:", Math.sqrt(pab), "eps:", Math.sqrt(epsSq), "p:", px, py)
  arr.push(px, py); // T intersection at P and AB
}

// Used by mapshaper-undershoots.js
// TODO: make more robust, make sure result is compatible with segmentIntersection()
// (rounding errors currently must be handled downstream)
export function findClosestPointOnSeg(px, py, ax, ay, bx, by, snapArg) {
  var dx = bx - ax,
      dy = by - ay,
      dotp = (px - ax) * dx + (py - ay) * dy,
      abSq = dx * dx + dy * dy,
      k = abSq === 0 ? -1 : dotp / abSq,
      eps = snapArg >= 0 ? snapArg : 0.1, // 1e-6, // snap to endpoint
      p;
  if (k <= eps) {
    p = [ax, ay];
  } else if (k >= 1 - eps) {
    p = [bx, by];
  } else {
    p = [ax + k * dx, ay + k * dy];
  }
  return p;
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

function clampIntersectionPoint(p, ax, ay, bx, by, cx, cy, dx, dy) {
  // Handle intersection points that fall outside the x-y range of either
  // segment by snapping to nearest endpoint coordinate. Out-of-range
  // intersection points can be caused by floating point rounding errors
  // when a segment is vertical or horizontal. This has caused problems when
  // repeatedly applying bbox clipping along the same segment
  var x = p[0],
      y = p[1],
      s1out = false,
      s2out = false;

  // assumes that segment ranges intersect
  if (outsideRange(x, ax, bx)) {
    x = clampToClosestEndpoint(x, ax, bx);
    s1out = true;
  }
  if (outsideRange(x, cx, dx)) {
    x = clampToClosestEndpoint(x, cx, dx);
    s2out = true;
  }
  if (outsideRange(y, ay, by)) {
    y = clampToClosestEndpoint(y, ay, by);
    s1out = true;
  }
  if (outsideRange(y, cy, dy)) {
    y = clampToClosestEndpoint(y, cy, dy);
    s2out = true;
  }
  if ((s1out || s2out)) {
    debug('Clamping a segment intersection point');
    // console.log("angle:", innerAngle(ax, ay, bx, by, cx, cy, dx, dy))
    // console.log('Feature 1', getSegFeature(ax, ay, bx, by, s1out));
    // console.log('Feature 2', getSegFeature(cx, cy, dx, dy, s2out));
    // console.log('Point:', JSON.stringify({
    //   type: 'Feature',
    //   properties: {fill: 'red'},
    //   geometry: {type: 'Point', coordinates: [p[0], p[1]]}
    // }));
  }
  p[0] = x;
  p[1] = y;
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

function clampToClosestEndpoint(a, b, c) {
  var lim = Math.abs(a - b) < Math.abs(a - c) ? b : c;
  var interval = Math.abs(a - lim);
  if (interval > 1e-15) {
    debug("[clampToClosestEndpoint()] large clamping interval:", interval);
  }
  return lim;
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
  return determinant2D(ax - cx, ay - cy, bx - cx, by - cy);
}

export function orient2D_robust(ax, ay, bx, by, cx, cy) {
  var d = findBigIntScaleFactor(ax, ay, bx, by, cx, cy);
  var ax_bi = BigInt(toScaledStr(ax, d));
  var ay_bi = BigInt(toScaledStr(ay, d));
  var bx_bi = BigInt(toScaledStr(bx, d));
  var by_bi = BigInt(toScaledStr(by, d));
  var cx_bi = BigInt(toScaledStr(cx, d));
  var cy_bi = BigInt(toScaledStr(cy, d));
  var o2d_bi = orient2D(ax_bi, ay_bi, bx_bi, by_bi, cx_bi, cy_bi);
  return fromScaledStr(o2d_bi.toString(), d);
}

function segmentHit_robust(ax, ay, bx, by, cx, cy, dx, dy) {
  var d = findBigIntScaleFactor(ax, ay, bx, by, cx, cy, dx, dy);
  var ax_bi = BigInt(toScaledStr(ax, d));
  var ay_bi = BigInt(toScaledStr(ay, d));
  var bx_bi = BigInt(toScaledStr(bx, d));
  var by_bi = BigInt(toScaledStr(by, d));
  var cx_bi = BigInt(toScaledStr(cx, d));
  var cy_bi = BigInt(toScaledStr(cy, d));
  var dx_bi = BigInt(toScaledStr(dx, d));
  var dy_bi = BigInt(toScaledStr(dy, d));
  return segmentHit_fast(ax_bi, ay_bi, bx_bi, by_bi, cx_bi, cy_bi, dx_bi, dy_bi);
}

// Source: Sedgewick, _Algorithms in C_
// (Other functions were tried that were more sensitive to floating point errors
//  than this function)
export function segmentHit_fast(ax, ay, bx, by, cx, cy, dx, dy) {
  return orient2D(ax, ay, bx, by, cx, cy) *
      orient2D(ax, ay, bx, by, dx, dy) <= 0 &&
      orient2D(cx, cy, dx, dy, ax, ay) *
      orient2D(cx, cy, dx, dy, bx, by) <= 0;
}

// Useful for determining if a segment that intersects another segment is
// entering or leaving an enclosed buffer area
// returns -1 if angle of p1p2 -> p3p4 is counter-clockwise (left turn)
// returns 1 if angle is clockwise
// return 0 if segments are collinear
export function segmentTurn(p1, p2, p3, p4) {
  var ax = p1[0],
      ay = p1[1],
      bx = p2[0],
      by = p2[1],
      // shift p3p4 segment to start at p2
      dx = bx - p3[0],
      dy = by - p3[1],
      cx = p4[0] + dx,
      cy = p4[1] + dy,
      orientation = orient2D(ax, ay, bx, by, cx, cy);
    if (!orientation) return 0;
    return orientation < 0 ? 1 : -1;
}
