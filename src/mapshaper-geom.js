/* requires mapshaper-common */

function distance(ax, ay, bx, by) {
  var dx = ax - bx,
      dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}


function distance3D(ax, ay, az, bx, by, bz) {
  var dx = ax - bx,
      dy = ay - by,
      dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}


// Calc angle in radians given three coordinates with (bx,by) at the vertex.
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

function innerAngle(ax, ay, bx, by, cx, cy) {
  var ab = Point.distance(ax, ay, bx, by),
      bc = Point.distance(bx, by, cx, cy),
      den = ab * bc,
      dp = den == 0 ? Math.PI : 
        ((ax - bx) * (cx - bx) + (ay - by) * (cy - by)) / (ab * bc),
      theta = dp >= 1 ? 0 : (dp <= -1 ? Math.PI : Math.acos(dp)); // handle rounding error.
  return theta;
}


function innerAngle3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var ab = distance3D(ax, ay, az, bx, by, bz);
  var bc = distance3D(bx, by, bz, cx, cy, cz);
  var dp = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by) + (az - bz) * (cz - bz)) / (ab * bc),
      theta = dp >= 1 ? 0 : Math.acos(dp);
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


function triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var area = 0.5 * Math.sqrt(detSq(ax, ay, bx, by, cx, cy) + 
    detSq(ax, az, bx, bz, cx, cz) + detSq(ay, az, by, bz, cy, cz));
  return area;
}


function bendAngle(ax, ay, bx, by, cx, cy) {
  var theta = innerAngle(ax, ay, bx, by, cx, cy),
      cp = ((bx - ax) * (cy - by) - (by - ay) * (cx - bx)),
      bend = cp === 0 ? 0: cp < 0 ? Math.PI - theta : theta - Math.PI;

  if (bend > Math.PI) {
    bend = bend - 2 * Math.PI;
  } else if (bend < -Math.PI) {
    bend = 2 * Math.PI + bend;
  }
  return bend;
}


function msRingArea(xx, yy, start, len) {
  var sum = 0;
  for (var i=start, lim=start+len-1; i<lim; i++) {
    sum += xx[i] * yy[i+1] - xx[i+1] * yy[i];
  }
  return Math.abs(sum / 2);
}


// Returns 1 if ring is CW, -1 if CCW, 0 if invalid shape
// TODO: handle non-rings
// TODO: handle case where segment doubles back...
//
function msRingDirection(xx, yy, startId, len) {
  var endId = startId + len - 1;
  if (startId < 0 || endId >= xx.length || len < 1)
    throw new Error("[msRingIsCW()] Index out-of-bounds");

  var angleSum = 0, points = 0,
    ax, ay, bx, by, cx, cy, x2, y2;

  for (var i=startId; i<=endId; i++) {
    ax = xx[i];
    ay = yy[i];
    if (ax === bx && ay === by) {
      continue;
    }
    points++;
    if (points >= 3) {
      angleSum += bendAngle(cx, cy, bx, by, ax, ay);
    }
    else if (points == 2) {
      x2 = ax; // remember wrap-around point
      y2 = ay;    
    }
    cx = bx;
    cy = by;
    bx = ax;
    by = ay;
  }
  if (points <= 3 || angleSum == 0) { 
    return 0;
  }
  // TODO handle edge case -- wraparound point same as bx, by
  angleSum += bendAngle(cx, cy, bx, by, x2, y2);  // wraparound
  return angleSum > 0 ? 1 : -1;  // angleSum should ~= 2π or -2π
}


// export functions so they can be tested
MapShaper.geom = {
  distance: distance,
  distance3D: distance3D,
  innerAngle: innerAngle,
  innerAngle3D: innerAngle3D,
  triangleArea: triangleArea,
  triangleArea3D: triangleArea3D,
  bendAngle: bendAngle,
  msRingArea: msRingArea,
  msRingDirection: msRingDirection
};