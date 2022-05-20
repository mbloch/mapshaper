import geom from '../geom/mapshaper-geom';

var DouglasPeucker = {};
export default DouglasPeucker;

DouglasPeucker.metricSq3D = geom.pointSegDistSq3D;
DouglasPeucker.metricSq = geom.pointSegDistSq;

// @dest array to contain point removal thresholds
// @xx, @yy arrays of x, y coords of a path
// @zz (optional) array of z coords for spherical simplification
//
DouglasPeucker.calcArcData = function(dest, xx, yy, zz) {
  var len = dest.length,
      useZ = !!zz;

  dest[0] = dest[len-1] = Infinity;
  if (len > 2) {
    procSegment(0, len-1, 1, Number.MAX_VALUE);
  }

  function procSegment(startIdx, endIdx, depth, distSqPrev) {
    // get endpoint coords
    var ax = xx[startIdx],
        ay = yy[startIdx],
        cx = xx[endIdx],
        cy = yy[endIdx],
        az, cz;
    if (useZ) {
      az = zz[startIdx];
      cz = zz[endIdx];
    }

    var maxDistSq = 0,
        maxIdx = 0,
        distSqLeft = 0,
        distSqRight = 0,
        distSq;

    for (var i=startIdx+1; i<endIdx; i++) {
      if (useZ) {
        distSq = DouglasPeucker.metricSq3D(xx[i], yy[i], zz[i], ax, ay, az, cx, cy, cz);
      } else {
        distSq = DouglasPeucker.metricSq(xx[i], yy[i], ax, ay, cx, cy);
      }

      if (distSq >= maxDistSq) {
        maxDistSq = distSq;
        maxIdx = i;
      }
    }

    // Case -- threshold of parent segment is less than threshold of curr segment
    // Curr max point is assigned parent's threshold, so parent is not removed
    // before child as simplification is increased.
    //
    if (distSqPrev < maxDistSq) {
      maxDistSq = distSqPrev;
    }

    if (maxIdx - startIdx > 1) {
      distSqLeft = procSegment(startIdx, maxIdx, depth+1, maxDistSq);
    }
    if (endIdx - maxIdx > 1) {
      distSqRight = procSegment(maxIdx, endIdx, depth+1, maxDistSq);
    }

    // Case -- max point of curr segment is highest-threshold point of an island polygon
    // Give point the same threshold as the next-highest point, to prevent
    // a 3-vertex degenerate ring.
    if (depth == 1 && ax == cx && ay == cy) {
      maxDistSq = Math.max(distSqLeft, distSqRight);
    }

    dest[maxIdx] =  Math.sqrt(maxDistSq);
    return maxDistSq;
  }
};
