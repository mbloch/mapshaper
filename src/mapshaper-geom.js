/* @requires mapshaper-common */

function distance3D(ax, ay, az, bx, by, bz) {
  var dx = ax - bx,
    dy = ay - by,
    dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function distanceSq(ax, ay, bx, by) {
  var dx = ax - bx,
      dy = ay - by;
  return dx * dx + dy * dy;
}

function distance2D(ax, ay, bx, by) {
  var dx = ax - bx,
      dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function distanceSq3D(ax, ay, az, bx, by, bz) {
  var dx = ax - bx,
      dy = ay - by,
      dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

function getRoundingFunction(inc) {
  if (!Utils.isNumber(inc) || inc === 0) {
    error("Rounding increment must be a non-zero number.");
  }
  var inv = 1 / inc;
  if (inv > 1) inv = Math.round(inv);
  return function(x) {
    // Need a rounding function that doesn't show rounding error after stringify()
    return Math.round(x * inv) / inv; // candidate
    //return Math.round(x / inc) / inv; // candidate
    //return Math.round(x / inc) * inc;
    //return Math.round(x * inv) * inc;
  };
}

// Detect intersections between two 2D segments.
// Return intersection as [x, y] array or false if segments do not cross or touch.
//
function segmentIntersection(s1p1x, s1p1y, s1p2x, s1p2y, s2p1x, s2p1y, s2p2x, s2p2y) {
  // Test collision (c.f. Sedgewick, _Algorithms in C_)
  // (Tried some other functions that might fail due to rounding errors)

  var hit = ccw(s1p1x, s1p1y, s1p2x, s1p2y, s2p1x, s2p1y) *
      ccw(s1p1x, s1p1y, s1p2x, s1p2y, s2p2x, s2p2y) <= 0 &&
      ccw(s2p1x, s2p1y, s2p2x, s2p2y, s1p1x, s1p1y) *
      ccw(s2p1x, s2p1y, s2p2x, s2p2y, s1p2x, s1p2y) <= 0;

  if (hit) {
    // Find x, y intersection
    var s1dx = s1p2x - s1p1x;
    var s1dy = s1p2y - s1p1y;
    var s2dx = s2p2x - s2p1x;
    var s2dy = s2p2y - s2p1y;
    var den = -s2dx * s1dy + s1dx * s2dy;
    if (den === 0) return false; // colinear -- treating as no intersection

    // Collision detected
    var m = (s2dx * (s1p1y - s2p1y) - s2dy * (s1p1x - s2p1x)) / den;
    var x = s1p1x + m * s1dx;
    var y = s1p1y + m * s1dy;
    return [x, y];
  }
  return false;
}


function ccw(x0, y0, x1, y1, x2, y2) {
  var dx1 = x1 - x0,
      dy1 = y1 - y0,
      dx2 = x2 - x0,
      dy2 = y2 - y0;
  if (dx1 * dy2 > dy1 * dx2) return 1;
  if (dx1 * dy2 < dy1 * dx2) return -1;
  if (dx1 * dx2 < 0 || dy1 * dy2 < 0) return -1;
  if (dx1 * dx1 + dy1 * dy1 < dx2 * dx2 + dy2 * dy2) return 1;
  return 0;
}

// atan2() makes this function fairly slow, replaced by ~2x faster formula
//
/*
function innerAngle_slow(ax, ay, bx, by, cx, cy) {
  var a1 = Math.atan2(ay - by, ax - bx),
      a2 = Math.atan2(cy - by, cx - bx),
      a3 = Math.abs(a1 - a2);
      a3 = a2 - a1
  if (a3 > Math.PI) {
    a3 = 2 * Math.PI - a3;
  }
  return a3;
}
*/

// TODO: make this safe for small angles
//
function innerAngle(ax, ay, bx, by, cx, cy) {
  var ab = distance2D(ax, ay, bx, by),
      bc = distance2D(bx, by, cx, cy),
      theta, dotp;
  if (ab === 0 || bc === 0) {
    theta = 0;
  } else {
    dotp = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by)) / ab * bc;
    if (dotp >= 1) {
      theta = 0;
    } else if (dotp <= -1) {
      theta = Math.PI;
    } else {
      theta = Math.acos(dotp); // consider using other formula at small dp
    }
  }
  return theta;
}

function innerAngle3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var ab = distance3D(ax, ay, az, bx, by, bz),
      bc = distance3D(bx, by, bz, cx, cy, cz),
      theta, dotp;
  if (ab === 0 || bc === 0) {
    theta = 0;
  } else {
    dotp = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by) + (az - bz) * (cz - bz)) / (ab * bc);
    if (dotp >= 1) {
      theta = 0;
    } else if (dotp <= -1) {
      theta = Math.PI;
    } else {
      theta = Math.acos(dotp); // consider using other formula at small dp
    }
  }
  return theta;
}


function triangleArea(ax, ay, bx, by, cx, cy) {
  var area = Math.abs(((ay - cy) * (bx - cx) + (by - cy) * (cx - ax)) / 2);
  return area;
}


function detSq(ax, ay, bx, by, cx, cy) {
  var det = ax * by - ax * cy + bx * cy - bx * ay + cx * ay - cx * by;
  return det * det;
}

function dotProduct(ax, ay, bx, by, cx, cy) {
  var ab = distance2D(ax, ay, bx, by),
      bc = distance2D(bx, by, cx, cy),
      den = ab * bc,
      dotp = 0;
  if (den > 0) {
    dotp = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by)) / den;
    if (dotp > 1) dotp = 1;
    else if (dotp < 0) dotp = 0;
  }
  return dotp;
}

function dotProduct3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var ab = distance3D(ax, ay, az, bx, by, bz),
      bc = distance3D(bx, by, bz, cx, cy, cz),
      dotp = 0;
  if (ab > 0 && bc > 0) {
    dotp = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by) + (az - bz) * (cz - bz)) / (ab * bc);
    if (dotp > 1) dotp = 1;
    else if (dotp < 0) dotp = 0;
  }
  return dotp;
}


function triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var area = 0.5 * Math.sqrt(detSq(ax, ay, bx, by, cx, cy) +
    detSq(ax, az, bx, bz, cx, cz) + detSq(ay, az, by, bz, cy, cz));
  return area;
}

// Given point B and segment AC, return the distSq from B to the nearest
// point on AC
// Receive the distSq of segments AB, BC, AC
//
function pointSegDistSq(ab2, bc2, ac2) {
  var dist2;
  if (ac2 === 0) {
    dist2 = ab2;
  } else if (ab2 >= bc2 + ac2) {
    dist2 = bc2;
  } else if (bc2 >= ab2 + ac2) {
    dist2 = ab2;
  } else {
    var dval = (ab2 + ac2 - bc2);
    dist2 = ab2 -  dval * dval / ac2  * 0.25;
  }
  if (dist2 < 0) {
    dist2 = 0;
  }
  return dist2;
}

MapShaper.calcArcBounds = function(xx, yy, start, len) {
  var xmin = Infinity,
      ymin = Infinity,
      xmax = -Infinity,
      ymax = -Infinity,
      i = start | 0,
      n = isNaN(len) ? xx.length - i : len + i,
      x, y;
  for (; i<n; i++) {
    x = xx[i];
    y = yy[i];
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }
  if (xmin > xmax || ymin > ymax) error("#calcArcBounds() null bounds");
  return [xmin, ymin, xmax, ymax];
};

function msSignedRingArea(xx, yy, start, len) {
  var sum = 0,
      i = start | 0,
      end = i + (len ? len | 0 : xx.length - i) - 1;

  if (i < 0 || end >= xx.length) {
    error("Out-of-bounds array index");
  }
  for (; i < end; i++) {
    sum += xx[i+1] * yy[i] - xx[i] * yy[i+1];
  }
  return sum / 2;
}

MapShaper.reversePathCoords = function(arr, start, len) {
  var i = start,
      j = start + len - 1,
      tmp;
  while (i < j) {
    tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    i++;
    j--;
  }
};

// merge B into A
function mergeBounds(a, b) {
  if (b[0] < a[0]) a[0] = b[0];
  if (b[1] < a[1]) a[1] = b[1];
  if (b[2] > a[2]) a[2] = b[2];
  if (b[3] > a[3]) a[3] = b[3];
}

function containsBounds(a, b) {
  return a[0] <= b[0] && a[2] >= b[2] && a[1] <= b[1] && a[3] >= b[3];
}

function boundsArea(b) {
  return (b[2] - b[0]) * (b[3] - b[1]);
}

function probablyDecimalDegreeBounds(b) {
  return containsBounds([-200, -91, 200, 90], b);
}

// export functions so they can be tested
MapShaper.geom = {
  getRoundingFunction: getRoundingFunction,
  segmentIntersection: segmentIntersection,
  distance3D: distance3D,
  innerAngle: innerAngle,
  innerAngle3D: innerAngle3D,
  triangleArea: triangleArea,
  triangleArea3D: triangleArea3D,
  msSignedRingArea: msSignedRingArea,
  probablyDecimalDegreeBounds: probablyDecimalDegreeBounds
};
