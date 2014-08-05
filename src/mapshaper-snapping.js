/* @requires
mapshaper-topology,
mapshaper-geom,
mapshaper-shapes
*/

MapShaper.getHighPrecisionSnapInterval = function(arcs) {
  var bb = arcs.getBounds();
  if (!bb.hasBounds()) return 0;
  var maxCoord = Math.max(Math.abs(bb.xmin), Math.abs(bb.ymin),
      Math.abs(bb.xmax), Math.abs(bb.ymax));
  return maxCoord * 1e-14;
};

MapShaper.snapCoords = function(arcs, threshold) {
  var avgDist = arcs.getAvgSegment(),
      autoSnapDist = avgDist * 0.0025,
      snapDist = autoSnapDist;

  if (threshold > 0) {
    if (threshold > avgDist) {
      message(Utils.format("Snapping interval is larger than avg. segment length (%.5f) -- using auto-snap instead", avgDist));
    } else {
      snapDist = threshold;
      message(Utils.format("Applying snapping threshold of %s -- %.6f times avg. segment length", threshold, threshold / avgDist));
    }
  }

  var snapCount = MapShaper.snapCoordsByInterval(arcs, snapDist);
  message(Utils.format("Snapped %s point%s", snapCount, "s?"));
};

// Snap together points within a small threshold
//
MapShaper.snapCoordsByInterval = function(arcs, snapDist) {
  var snapCount = 0,
      xx = arcs.getVertexData().xx,
      yy = arcs.getVertexData().yy;

  // Get sorted coordinate ids
  // Consider: speed up sorting -- try bucket sort as first pass.
  //
  var ids = utils.sortCoordinateIds(xx);
  for (var i=0, n=ids.length; i<n; i++) {
    snapCount += snapPoint(i, ids, snapDist);
  }
  return snapCount;

  function snapPoint(i, ids, limit) {
    var j = i,
        n = ids.length,
        id1 = ids[i],
        x = xx[id1],
        y = yy[id1],
        snaps = 0,
        dist, id2, x2, y2;

    while (++j < n) {
      id2 = ids[j];
      x2 = xx[id2];
      if (x2 - x > limit) {
        break;
      }
      y2 = yy[id2];
      // don't snap identical points
      if (x === x2 && y === y2) {
        continue;
      }
      dist = distance2D(x, y, x2, y2);
      if (dist < limit) {
        xx[id2] = x;
        yy[id2] = y;
        snaps++;
        //if (points) {
        //  points.push([[x, x2], [y, y2]]);
        //}
      }
    }
    return snaps;
  }
};

// Returns array of array ids, in ascending order.
// @a array of numbers
//
utils.sortCoordinateIds = function(a) {
  var n = a.length,
      ids = new Uint32Array(n);
  for (var i=0; i<n; i++) {
    ids[i] = i;
  }
  utils.quicksortIds(a, ids, 0, ids.length-1);
  return ids;
};

utils.quicksortIds = function (a, ids, lo, hi) {
  var i = lo,
      j = hi,
      pivot, tmp;
  while (i < hi) {
    pivot = a[ids[lo + hi >> 1]];
    while (i <= j) {
      while (a[ids[i]] < pivot) i++;
      while (a[ids[j]] > pivot) j--;
      if (i <= j) {
        tmp = ids[i];
        ids[i] = ids[j];
        ids[j] = tmp;
        i++;
        j--;
      }
    }
    if (j - lo > 0) utils.quicksortIds(a, ids, lo, j);
    lo = i;
    j = hi;
  }
};
