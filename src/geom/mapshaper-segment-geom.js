/* @requires mapshaper-arcs, mapshaper-geom */

geom.segmentIntersection = segmentIntersection;
geom.segmentHit = segmentHit;
geom.lineIntersection = lineIntersection;
geom.orient2D = orient2D;
geom.outsideRange = outsideRange;

// Find the interection between two 2D segments
// Returns 0, 1 or two x, y locations as null, [x, y], or [x1, y1, x2, y2]
// Special cases:
// If the segments touch at an endpoint of both segments, it is not treated as an intersection
// If the segments touch at a T-intersection, it is treated as an intersection
// If the segments are collinear and partially overlapping, each subsumed endpoint
//    is counted as an intersection (there will be one or two)
//
function segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
  var hit = segmentHit(ax, ay, bx, by, cx, cy, dx, dy),
      p = null;
  if (hit) {
    p = crossIntersection(ax, ay, bx, by, cx, cy, dx, dy);
    if (!p) { // collinear if p is null
      p = collinearIntersection(ax, ay, bx, by, cx, cy, dx, dy);
    } else if (endpointHit(ax, ay, bx, by, cx, cy, dx, dy)) {
      p = null; // filter out segments that only intersect at an endpoint
    }
  }
  return p;
}

function lineIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
  var den = determinant2D(bx - ax, by - ay, dx - cx, dy - cy);
  var eps = 1e-18;
  var m, p;
  if (den === 0) return null;
  m = orient2D(cx, cy, dx, dy, ax, ay) / den;
  if (den <= eps && den >= -eps) {
    // tiny denominator = low precision; using one of the endpoints as intersection
    p = findEndpointInRange(ax, ay, bx, by, cx, cy, dx, dy);
    if (!p) {
      trace('[lineIntersection()]');
      geom.debugSegmentIntersection([], ax, ay, bx, by, cx, cy, dx, dy);
    }
  } else {
    p = [ax + m * (bx - ax), ay + m * (by - ay)];
  }
  return p;
}

function findEndpointInRange(ax, ay, bx, by, cx, cy, dx, dy) {
  var p = null;
  if (!outsideRange(ax, cx, dx) && !outsideRange(ay, cy, dy)) {
    p = [ax, ay];
  } else if (!outsideRange(bx, cx, dx) && !outsideRange(by, cy, dy)) {
    p = [bx, by];
  } else if (!outsideRange(cx, ax, bx) && !outsideRange(cy, ay, by)) {
    p = [cx, cy];
  } else if (!outsideRange(dx, ax, bx) && !outsideRange(dy, ay, by)) {
    p = [dx, dy];
  }
  return p;
}

// Get intersection point if segments are non-collinear, else return null
// Assumes that segments have been intersect
function crossIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
  var p = lineIntersection(ax, ay, bx, by, cx, cy, dx, dy);
  var nearest;
  if (p) {
    // Re-order operands so intersection point is closest to a (better precision)
    // Source: Jonathan Shewchuk http://www.cs.berkeley.edu/~jrs/meshpapers/robnotes.pdf
    nearest = nearestPoint(p[0], p[1], ax, ay, bx, by, cx, cy, dx, dy);
    if (nearest == 1) {
      p = lineIntersection(bx, by, ax, ay, cx, cy, dx, dy);
    } else if (nearest == 2) {
      p = lineIntersection(cx, cy, dx, dy, ax, ay, bx, by);
    } else if (nearest == 3) {
      p = lineIntersection(dx, dy, cx, cy, ax, ay, bx, by);
    }
  }
  if (p) {
    clampIntersectionPoint(p, ax, ay, bx, by, cx, cy, dx, dy);
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
  x = geom.clampToCloseRange(x, ax, bx);
  x = geom.clampToCloseRange(x, cx, dx);
  y = geom.clampToCloseRange(y, ay, by);
  y = geom.clampToCloseRange(y, cy, dy);
  p[0] = x;
  p[1] = y;
}

geom.debugSegmentIntersection = function(p, ax, ay, bx, by, cx, cy, dx, dy) {
  trace('[debugSegmentIntersection()]');
  trace('  s1\n  dx:', Math.abs(ax - bx), '\n  dy:', Math.abs(ay - by));
  trace('  s2\n  dx:', Math.abs(cx - dx), '\n  dy:', Math.abs(cy - dy));
  trace('  s1 xx:', ax, bx);
  trace('  s2 xx:', cx, dx);
  trace('  s1 yy:', ay, by);
  trace('  s2 yy:', cy, dy);
  trace('  angle:', geom.signedAngle(ax, ay, bx, by, dx - cx + bx, dy - cy + by));
};

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

geom.clampToCloseRange = function(a, b, c) {
  var lim;
  if (geom.outsideRange(a, b, c)) {
    lim = Math.abs(a - b) < Math.abs(a - c) ? b : c;
    if (Math.abs(a - lim) > 1e-16) {
      trace("[clampToCloseRange()] large clamping interval", a, b, c);
    }
    a = lim;
  }
  return a;
};

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
function orient2D(ax, ay, bx, by, cx, cy) {
  return determinant2D(ax - cx, ay - cy, bx - cx, by - cy);
}

// Source: Sedgewick, _Algorithms in C_
// (Tried various other functions that failed owing to floating point errors)
function segmentHit(ax, ay, bx, by, cx, cy, dx, dy) {
  return orient2D(ax, ay, bx, by, cx, cy) *
      orient2D(ax, ay, bx, by, dx, dy) <= 0 &&
      orient2D(cx, cy, dx, dy, ax, ay) *
      orient2D(cx, cy, dx, dy, bx, by) <= 0;
}

function inside(x, minX, maxX) {
  return x > minX && x < maxX;
}

function sortSeg(x1, y1, x2, y2) {
  return x1 < x2 || x1 == x2 && y1 < y2 ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
}

// Assume segments s1 and s2 are collinear and overlap; find one or two internal endpoints
function collinearIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
  var minX = Math.min(ax, bx, cx, dx),
      maxX = Math.max(ax, bx, cx, dx),
      minY = Math.min(ay, by, cy, dy),
      maxY = Math.max(ay, by, cy, dy),
      useY = maxY - minY > maxX - minX,
      coords = [];

  if (useY ? inside(ay, minY, maxY) : inside(ax, minX, maxX)) {
    coords.push(ax, ay);
  }
  if (useY ? inside(by, minY, maxY) : inside(bx, minX, maxX)) {
    coords.push(bx, by);
  }
  if (useY ? inside(cy, minY, maxY) : inside(cx, minX, maxX)) {
    coords.push(cx, cy);
  }
  if (useY ? inside(dy, minY, maxY) : inside(dx, minX, maxX)) {
    coords.push(dx, dy);
  }
  if (coords.length != 2 && coords.length != 4) {
    coords = null;
    trace("Invalid collinear segment intersection", coords);
  } else if (coords.length == 4 && coords[0] == coords[2] && coords[1] == coords[3]) {
    // segs that meet in the middle don't count
    coords = null;
  }
  return coords;
}

function endpointHit(ax, ay, bx, by, cx, cy, dx, dy) {
  return ax == cx && ay == cy || ax == dx && ay == dy ||
          bx == cx && by == cy || bx == dx && by == dy;
}
