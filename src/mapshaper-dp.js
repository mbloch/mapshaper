/* @requires arrayutils, mapshaper-common, mapshaper-geom */

var DouglasPeucker = {};

DouglasPeucker.simplifyArcs = function(arcs, opts) {
  return MapShaper.simplifyArcs(arcs, DouglasPeucker.calcArcData, opts);
}

DouglasPeucker.metricSq3D = function(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var ab2 = distanceSq3D(ax, ay, az, bx, by, bz),
      ac2 = distanceSq3D(ax, ay, az, cx, cy, cz),
      bc2 = distanceSq3D(bx, by, bz, cx, cy, cz);
  return triangleHeightSq(ab2, bc2, ac2);
};

DouglasPeucker.metricSq = function(ax, ay, bx, by, cx, cy) {
  var ab2 = distanceSq(ax, ay, bx, by),
      ac2 = distanceSq(ax, ay, cx, cy),
      bc2 = distanceSq(bx, by, cx, cy);
  return triangleHeightSq(ab2, bc2, ac2);
};

DouglasPeucker.calcArcData = function(xx, yy, zz, len) {
  var len = len || xx.length, // kludge: 3D data gets passed in buffers, so need len parameter.
      useZ = !!zz;

  var dpArr = new Array(len); // new Float64Array(len);
  Utils.initializeArray(dpArr, 0);

  dpArr[0] = dpArr[len-1] = Infinity;

  if (len > 2) {
    procSegment(0, len-1, 1, Number.MAX_VALUE);
  }

  function procSegment(startIdx, endIdx, depth, lastDistance) {
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
      if (useZ) {
        thisDistance = DouglasPeucker.metricSq3D(ax, ay, az, xx[i], yy[i], zz[i], cx, cy, cz);
      } else {
        thisDistance = DouglasPeucker.metricSq(ax, ay, xx[i], yy[i], cx, cy);
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
      // case -- arc is an island polygon
      if (ax == cx && ay == cy) {
        maxDistance = lval > rval ? lval : rval;
      }
    }

    var dist = Math.sqrt(maxDistance);

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

  return dpArr;
};
