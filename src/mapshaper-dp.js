/* @requires arrayutils, mapshaper-common */

var DouglasPeucker = {};
var LIMIT_VALUE = Infinity;
var MAX_ERROR = Number.MAX_VALUE;

DouglasPeucker.simplifyArcs = function(arcs, opts) {
  if (opts && opts.spherical) {
    return DouglasPeucker.simplifyArcsSph(arcs);
  }
  var data = Utils.map(arcs, function(arc) {
    return DouglasPeucker.calcArcData(arc[0], arc[1]);
  });
  // trace(">> dp calls / ms:", dpSegCount / ms);
  // trace(">> dp triangles / ms:", dpDistCount / ms);
  return data;
};

DouglasPeucker.simplifyArcsSph = function(arcs) {
  var bufSize = 0,
      xbuf, ybuf, zbuf;

  var data = Utils.map(arcs, function(arc) {
    var arcLen = arc[0].length;
    if (bufSize < arcLen) {
      bufSize = Math.round(arcLen * 1.2);
      xbuf = new Float64Array(bufSize);
      ybuf = new Float64Array(bufSize);
      zbuf = new Float64Array(bufSize);
    }

    DouglasPeucker.calcXYZ(arc[0], arc[1], xbuf, ybuf, zbuf);
    var arr = DouglasPeucker.calcArcData(xbuf, ybuf, zbuf, arcLen);
    //var arr = DouglasPeucker.calcArcData(xbuf.subarray(0, arcLen), ybuf.subarray(0, arcLen), zbuf.subarray(0, arcLen));
    return arr;
  });
  return data;
};

// Convert arrays of lng and lat coords (xsrc, ysrc) into 
// x, y, z coords on the surface of a sphere with radius == 1
//
DouglasPeucker.calcXYZ = function(xsrc, ysrc, xbuf, ybuf, zbuf) {
  var deg2rad = Math.PI / 180;
  for (var i=0, len=xsrc.length; i<len; i++) {
    var theta = xsrc[i] * deg2rad,
        lat = ysrc[i],
        phi = (lat > 0 ? 90 - lat : -90 - lat) * deg2rad;
        sinPhi = Math.sin(phi);

    xbuf[i] = sinPhi * Math.cos(theta);
    ybuf[i] = sinPhi * Math.sin(theta);
    zbuf[i] = Math.cos(phi);
  }
}

DouglasPeucker.getDistanceSq3D = function(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var dist2,
    ab2 = (ax - bx) * (ax - bx) + (ay - by) * (ay - by) + (az - bz) * (az - bz),
    ac2 = (ax - cx) * (ax - cx) + (ay - cy) * (ay - cy) + (az - cz) * (az - cz),
    bc2 = (bx - cx) * (bx - cx) + (by - cy) * (by - cy) + (bz - cz) * (bz - cz);

  if ( ac2 == 0.0 ) {
    dist2 = ab2;
  }
  else if ( ab2 >= bc2 + ac2 ) {
    dist2 = bc2;
  }
  else if ( bc2 >= ab2 + ac2 ) {
    dist2 = ab2;
  }
  else {
    var dval = ( ab2 + ac2 - bc2 );
    dist2 = ab2 -  dval * dval / ac2  * 0.25 ;
  }

  if ( dist2<0.0 ) {
    dist2 = 0.0;
  }

  return dist2;
};

DouglasPeucker.getDistanceSq = function(ax, ay, bx, by, cx, cy) {
  var ab2 = (ax - bx) * (ax - bx) + (ay - by) * (ay - by),
      ac2 = (ax - cx) * (ax - cx) + (ay - cy) * (ay - cy),
      bc2 = (bx - cx) * (bx - cx) + (by - cy) * (by - cy),
      dist2;

  if ( ac2 === 0 ) { // if first and last points are same, avoid div/0
    dist2 = ab2;
  }
  else if ( ab2 >= bc2 + ac2 ) {
    dist2 = bc2;
  }
  else if ( bc2 >= ab2 + ac2 ) {
    dist2 = ab2;
  }
  else {
    var dval = ( ab2 + ac2 - bc2 );
    dist2 = ab2 -  dval * dval / ac2  * 0.25 ;
  }

  if (dist2 < 0) {
    dist2 = 0;
  }

  return dist2;
};


var dpDistCount = 0;
var dpSegCount = 0;
DouglasPeucker.calcArcData = function(xx, yy, zz, len) {
  var len = len || xx.length, // kludge: 3D data gets passed in buffers, so need len parameter.
      useZ = !!zz;
  // assert(len > 1, "Arc length must be 2 or greater");

  var dpArr = new Array(len); // new Float64Array(len);
  Utils.initializeArray(dpArr, 0);

  dpArr[0] = dpArr[len-1] = LIMIT_VALUE;

  if (len > 2) {
    procSegment(0, len-1, 1, MAX_ERROR);
  }

  function procSegment(startIdx, endIdx, depth, lastDistance) {
    dpSegCount++;
    var thisDistance;
    var ax = xx[startIdx],
      ay = yy[startIdx],
      cx = xx[endIdx],
      cy = yy[endIdx],
      az, bz, cz;

    if (useZ) {
      az = zz[startIdx]
      cz = zz[endIdx];
    }

    (startIdx < endIdx) || error("[procSegment()] inverted idx");

    var maxDistance = 0, maxIdx = 0;

    for (var i=startIdx+1; i<endIdx; i++) {
      dpDistCount++;
      if (useZ) {
        thisDistance = DouglasPeucker.getDistanceSq3D(ax, ay, az, xx[i], yy[i], zz[i], cx, cy, cz);
      } else {
        thisDistance = DouglasPeucker.getDistanceSq(ax, ay, xx[i], yy[i], cx, cy);
      }

      if (thisDistance >= maxDistance) {
        maxDistance = thisDistance;
        maxIdx = i;
      }
    }

    if (lastDistance < maxDistance) {
      maxDistance = lastDistance;
    }

    var lval=0, rval=0;
    if (maxIdx - startIdx > 1) {
      lval = procSegment(startIdx, maxIdx, depth+1, maxDistance);
    }
    if (endIdx - maxIdx > 1) {
      rval = procSegment(maxIdx, endIdx, depth+1, maxDistance);
    }

    if (depth == 1) {
      // case: arc is an island polygon
      if (ax == cx && ay == cy) { 
        maxDistance = lval > rval ? lval : rval;
      }
    }

    var dist = Math.sqrt(maxDistance);
    if (useZ) {
      dist = dist * 180 / Math.PI;
    }
    /*
    if ( maxSegmentLen > 0 ) {
      double maxLen2 = maxSegmentLen * maxSegmentLen;
      double acLen2 = (ax-cx)*(ax-cx) + (ay-cy)*(ay-cy);
      if ( maxLen2 < acLen2 ) {
        thresh = MAX_THRESHOLD - 2;  // mb //
      }
    }
    */

    dpArr[maxIdx] = dist;
    return maxDistance;
  }

  // assert(dpArr.length == xx.length, "Length of DouglasPeucker threshold array doesn't match coordinate arrays.");
  // assert(dpArr[0] == LIMIT_VALUE && dpArr[len - 1] == LIMIT_VALUE, "DouglasPeucker endpoint value/s have changed; dp array:", dpArr);

  return dpArr;

};