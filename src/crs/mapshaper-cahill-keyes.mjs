/*
 * Cahill-Keyes 12-zone forward transform.
 *
 * Implemented in Perl by Mary Jo Graça (2011), ported to D3.js by
 * Enrico Spinielli (2013), and adapted here from d3-geo-polygon.
 *
 * Copyright 2017-2024 Mike Bostock
 * ISC License: https://github.com/d3/d3-geo-polygon/blob/main/LICENSE
 */

var D2R = Math.PI / 180;
var R2D = 180 / Math.PI;

export function createCahillKeyesRaw(mg) {
  return createCahillKeyesTransform(mg, false);
}

function createCahillKeyesTransform(mg, faceOnly) {
  var CK = {lengthMG: mg || 10000};
  init();

  return function(lambda, phi) {
    if (faceOnly) {
      var lon = lambda * R2D;
      var side = lon < 0 ? -1 : lon > 0 ? 1 : 0;
      var local = mp2xy(Math.abs(lon), Math.abs(phi * R2D));
      return [local[0], side * local[1]];
    }
    var res = ll2mp(lambda * R2D, phi * R2D);
    var xy = mp2xy(res[0], res[1]);
    var p = [xy[0], res[2] * xy[1]];
    return mj2g(p, res[3]);
  };

  function init() {
    var k = Math.sqrt(3);
    var pointN, lengthMB, lengthMN, lengthNG, pointU;
    var p73a, lF, lT, lM, l, pointV;
    CK.lengthMA = 0.094 * CK.lengthMG;
    CK.lengthParallel0to73At0 = CK.lengthMG / 100;
    CK.lengthParallel73to90At0 =
      (CK.lengthMG - CK.lengthMA - CK.lengthParallel0to73At0 * 73) / 17;
    CK.sin60 = k / 2;
    CK.cos60 = 0.5;
    CK.pointM = [0, 0];
    CK.pointG = [CK.lengthMG, 0];
    pointN = [CK.lengthMG, CK.lengthMG * Math.tan(30 * D2R)];
    CK.pointA = [CK.lengthMA, 0];
    CK.pointB = lineIntersection(CK.pointM, 30, CK.pointA, 45);
    CK.lengthAG = distance(CK.pointA, CK.pointG);
    CK.lengthAB = distance(CK.pointA, CK.pointB);
    lengthMB = distance(CK.pointM, CK.pointB);
    lengthMN = distance(CK.pointM, pointN);
    lengthNG = distance(pointN, CK.pointG);
    CK.pointD = interpolate(lengthMB, lengthMN, pointN, CK.pointM);
    CK.pointF = [CK.lengthMG, lengthNG - lengthMB];
    CK.pointE = [
      pointN[0] - CK.lengthMA * Math.sin(30 * D2R),
      pointN[1] - CK.lengthMA * Math.cos(30 * D2R)
    ];
    CK.lengthGF = distance(CK.pointG, CK.pointF);
    CK.lengthBD = distance(CK.pointB, CK.pointD);
    CK.lengthGFE = CK.lengthGF + CK.lengthAB;
    CK.deltaMEq = CK.lengthGFE / 45;
    CK.lengthAP75 = 15 * CK.lengthParallel73to90At0;
    CK.lengthAP73 = CK.lengthMG - CK.lengthMA -
      CK.lengthParallel0to73At0 * 73;
    pointU = [
      CK.pointA[0] + CK.lengthAP73 * Math.cos(30 * D2R),
      CK.pointA[1] + CK.lengthAP73 * Math.sin(30 * D2R)
    ];
    CK.pointT = lineIntersection(pointU, -60, CK.pointB, 30);

    p73a = parallel73(29);
    lF = p73a.lengthParallel73;
    lT = lengthTorridSegment(29);
    lM = lengthMiddleSegment(29);
    l = 15 * (lT + lM + lF) / 73 - lT;
    pointV = interpolate(l, lM, jointT(29), jointF(29));
    CK.pointC = [0, 0];
    CK.pointC[1] = (
      pointV[0] * pointV[0] + pointV[1] * pointV[1] -
      CK.pointD[0] * CK.pointD[0] - CK.pointD[1] * CK.pointD[1]
    ) / (
      2 * (k * pointV[0] + pointV[1] -
        k * CK.pointD[0] - CK.pointD[1])
    );
    CK.pointC[0] = k * CK.pointC[1];
    CK.radius = distance(CK.pointC, CK.pointD);
  }

  function ll2mp(lon, lat) {
    var south = [0, 6, 7, 8, 5];
    var octant = truncate((lon + 180) / 90 + 1);
    var meridian = (lon + 720) % 90 - 45;
    var side = meridian < 0 ? -1 : meridian > 0 ? 1 : 0;
    meridian = Math.abs(meridian);
    if (octant === 5) octant = 1;
    if (lat < 0) octant = south[octant];
    return [meridian, Math.abs(lat), side, octant];
  }

  function mp2xy(m, p) {
    if (m === 0) return p >= 75 ? zoneA(m, p) : zoneB(m, p);
    if (p >= 75) return zoneC(m, p);
    if (p === 0) return zoneD(m, p);
    if (p >= 73 && m <= 30) return zoneE(m, p);
    if (m === 45) {
      return p <= 15 ? zoneF(m, p) :
        p <= 73 ? zoneG(m, p) : zoneH(m, p);
    }
    if (m <= 29) return zoneI(m, p);
    if (p >= 73) return zoneJ(m, p);
    var lT = lengthTorridSegment(m);
    var hit = circleLineIntersection(
      CK.pointC, CK.radius, jointT(m), jointF(m)
    );
    var l15;
    if (hit[0]) {
      l15 = lT + distance(jointT(m), hit[1]);
    } else {
      hit = circleLineIntersection(
        CK.pointC, CK.radius, jointE(m), jointT(m)
      );
      l15 = lT - distance(jointT(m), hit[1]);
    }
    return p <= 15 ? zoneK(m, p, l15) : zoneL(m, p, l15);
  }

  function zoneA(m, p) {
    return [CK.pointA[0] + (90 - p) * 104, 0];
  }

  function zoneB(m, p) {
    return [CK.pointG[0] - p * 100, 0];
  }

  function zoneC(m, p) {
    return radialPoint(CK.pointA, 104 * (90 - p), m);
  }

  function zoneD(m) {
    return equator(m);
  }

  function zoneE(m, p) {
    return radialPoint(CK.pointA, 1560 + (75 - p) * 100, m);
  }

  function zoneF(m, p) {
    return interpolate(p, 15, CK.pointE, CK.pointD);
  }

  function zoneG(m, p) {
    return interpolate(p - 15, 58, CK.pointD, CK.pointT);
  }

  function zoneH(m, p) {
    var p75 = parallel75(45);
    var p73 = parallel73(m).parallel73;
    var lF = distance(CK.pointT, CK.pointB);
    var lF75 = distance(CK.pointB, p75);
    var l = (75 - p) * (lF75 + lF) / 2;
    return l <= lF75 ?
      interpolate(l, lF75, p75, CK.pointB) :
      interpolate(l - lF75, lF, CK.pointB, p73);
  }

  function zoneI(m, p) {
    var p73a = parallel73(m);
    var lT = lengthTorridSegment(m);
    var lM = lengthMiddleSegment(m);
    var l = p * (lT + lM + p73a.lengthParallel73) / 73;
    if (l <= lT) return interpolate(l, lT, jointE(m), jointT(m));
    if (l <= lT + lM) {
      return interpolate(l - lT, lM, jointT(m), jointF(m));
    }
    return interpolate(
      l - lT - lM,
      p73a.lengthParallel73,
      jointF(m),
      p73a.parallel73
    );
  }

  function zoneJ(m, p) {
    var p75 = parallel75(m);
    var p73a = parallel73(m);
    var lF75 = distance(jointF(m), p75);
    var l = (75 - p) * (lF75 - p73a.lengthParallel73) / 2;
    return l <= lF75 ?
      interpolate(l, lF75, p75, jointF(m)) :
      interpolate(
        l - lF75,
        -p73a.lengthParallel73,
        jointF(m),
        p73a.parallel73
      );
  }

  function zoneK(m, p, l15) {
    var l = p * l15 / 15;
    var lT = lengthTorridSegment(m);
    var lM = lengthMiddleSegment(m);
    return l <= lT ?
      interpolate(l, lT, jointE(m), jointT(m)) :
      interpolate(l - lT, lM, jointT(m), jointF(m));
  }

  function zoneL(m, p, l15) {
    var p73a = parallel73(m);
    var lT = lengthTorridSegment(m);
    var lM = lengthMiddleSegment(m);
    var lF = p73a.lengthParallel73;
    var l = l15 + (p - 15) * (lT + lM + lF - l15) / 58;
    if (l <= lT) return interpolate(l, lT, jointE(m), jointF(m));
    if (l <= lT + lM) {
      return interpolate(l - lT, lM, jointT(m), jointF(m));
    }
    return interpolate(
      l - lT - lM, lF, jointF(m), p73a.parallel73
    );
  }

  function equator(m) {
    var l = CK.deltaMEq * m;
    return l <= CK.lengthGF ?
      [CK.pointG[0], l] :
      interpolate(l - CK.lengthGF, CK.lengthAB, CK.pointF, CK.pointE);
  }

  function jointE(m) {
    return equator(m);
  }

  function jointT(m) {
    return lineIntersection(CK.pointM, 2 * m / 3, jointE(m), m / 3);
  }

  function jointF(m) {
    if (m === 0) return [CK.pointA[0] + CK.lengthAB, 0];
    return lineIntersection(CK.pointA, m, CK.pointM, 2 * m / 3);
  }

  function lengthTorridSegment(m) {
    return distance(jointE(m), jointT(m));
  }

  function lengthMiddleSegment(m) {
    return distance(jointT(m), jointF(m));
  }

  function parallel73(m) {
    var p73, lF, xy;
    var jF = jointF(m);
    if (m <= 30) {
      p73 = radialPoint(CK.pointA, CK.lengthAP73, m);
      lF = distance(jF, p73);
    } else {
      p73 = lineIntersection(CK.pointT, -60, jF, m);
      lF = distance(jF, p73);
      if (m > 44) {
        xy = lineIntersection(CK.pointT, -60, jF, 2 * m / 3);
        if (xy[0] > p73[0]) {
          p73 = xy;
          lF = -distance(jF, p73);
        }
      }
    }
    return {parallel73: p73, lengthParallel73: lF};
  }

  function parallel75(m) {
    return radialPoint(CK.pointA, CK.lengthAP75, m);
  }

  function mj2g(xy, octant) {
    var out;
    if (octant === 0) {
      out = rotate(xy, -60);
    } else if (octant === 1) {
      out = rotate(xy, -120);
      out[0] -= CK.lengthMG;
    } else if (octant === 2) {
      out = rotate(xy, -60);
      out[0] -= CK.lengthMG;
    } else if (octant === 3) {
      out = rotate(xy, -120);
      out[0] += CK.lengthMG;
    } else if (octant === 4) {
      out = rotate(xy, -60);
      out[0] += CK.lengthMG;
    } else if (octant === 5) {
      out = rotate([2 * CK.lengthMG - xy[0], xy[1]], -60);
      out[0] += CK.lengthMG;
    } else if (octant === 6) {
      out = rotate([2 * CK.lengthMG - xy[0], xy[1]], -120);
      out[0] -= CK.lengthMG;
    } else if (octant === 7) {
      out = rotate([2 * CK.lengthMG - xy[0], xy[1]], -60);
      out[0] -= CK.lengthMG;
    } else if (octant === 8) {
      out = rotate([2 * CK.lengthMG - xy[0], xy[1]], -120);
      out[0] += CK.lengthMG;
    }
    return out;
  }

  function radialPoint(origin, length, angle) {
    return [
      origin[0] + length * Math.cos(angle * D2R),
      origin[1] + length * Math.sin(angle * D2R)
    ];
  }

  function rotate(xy, angle) {
    if (angle === -60) {
      return [
        xy[0] * CK.cos60 + xy[1] * CK.sin60,
        -xy[0] * CK.sin60 + xy[1] * CK.cos60
      ];
    }
    if (angle === -120) {
      return [
        -xy[0] * CK.cos60 + xy[1] * CK.sin60,
        -xy[0] * CK.sin60 - xy[1] * CK.cos60
      ];
    }
    var cos = Math.cos(angle * D2R);
    var sin = Math.sin(angle * D2R);
    return [xy[0] * cos - xy[1] * sin, xy[0] * sin + xy[1] * cos];
  }
}

export function createCahillKeyesFaceRaw(mg) {
  return createCahillKeyesTransform(mg, true);
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function interpolate(length, total, start, end) {
  return [
    start[0] + (end[0] - start[0]) * length / total,
    start[1] + (end[1] - start[1]) * length / total
  ];
}

function lineIntersection(p1, slope1, p2, slope2) {
  var m1 = Math.tan(slope1 * D2R);
  var m2 = Math.tan(slope2 * D2R);
  var x = (m1 * p1[0] - m2 * p2[0] - p1[1] + p2[1]) / (m1 - m2);
  return [x, m1 * (x - p1[0]) + p1[1]];
}

function circleLineIntersection(center, radius, p1, p2) {
  var dx = p2[0] - p1[0];
  var dy = p2[1] - p1[1];
  var fx = p1[0] - center[0];
  var fy = p1[1] - center[1];
  var a = dx * dx + dy * dy;
  var b = 2 * (dx * fx + dy * fy);
  var c = fx * fx + fy * fy - radius * radius;
  var d = b * b - 4 * a * c;
  if (a === 0 || d < 0) return [0, [0, 0]];
  var root = Math.sqrt(d);
  var u1 = (-b + root) / (2 * a);
  var u2 = (-b - root) / (2 * a);
  var u = u1 >= 0 && u1 <= 1 ? u1 :
    u2 >= 0 && u2 <= 1 ? u2 : null;
  return u === null ? [0, [0, 0]] :
    [1, [p1[0] + u * dx, p1[1] + u * dy]];
}

function truncate(n) {
  return n > 0 ? Math.floor(n) : Math.ceil(n);
}
