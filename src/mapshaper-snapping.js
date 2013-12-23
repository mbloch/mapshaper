/* @requires
mapshaper-topology,
mapshaper-geom,
mapshaper-shapes
*/

// Snap together points within a small threshold
// @xx, @yy arrays of x, y coords
// @nn array of path lengths
// @points (optional) array, snapped coords are added so they can be displayed
//
MapShaper.autoSnapCoords = function(xx, yy, nn, threshold, points) {
  var avgSeg = MapShaper.getAverageSegment(MapShaper.getSegmentIter(xx, yy, nn), 3),
      avgDist = (avgSeg[0] + avgSeg[1]), // avg. dx + dy -- crude approximation
      snapDist = avgDist * 0.0025,
      snapCount = 0;

  if (threshold) {
    if (threshold > avgDist) {
      message("Snapping threshold is larger than average segment length -- ignoring");
    } else if (threshold > 0) {
      message(Utils.format("Applying snapping threshold of %s -- %.6f times avg. segment length", threshold, threshold / avgDist));
      snapDist = threshold;
    }
  }

  // Get sorted coordinate ids
  // Consider: speed up sorting -- try bucket sort as first pass.
  //
  var ids = MapShaper.sortCoordinateIds(xx);

  for (var i=0, n=ids.length; i<n; i++) {
    snapCount += snapPoint(i, ids, snapDist);
  }

  message(Utils.format("Snapped %s point%s", snapCount, "s?"));

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
        if (points) {
          points.push([[x, x2], [y, y2]]);
        }
      }
    }
    return snaps;
  }
};

// Returns array of array ids, in ascending order.
// @a array of numbers
//
MapShaper.sortCoordinateIds = function(a) {
  var n = a.length,
      ids = new Uint32Array(n);
  for (var i=0; i<n; i++) {
    ids[i] = i;
  }
  MapShaper.quicksortIds(a, ids, 0, ids.length-1);
  return ids;
};

MapShaper.quicksortIds = function (a, ids, lo, hi) {
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
    if (j - lo > 0) MapShaper.quicksortIds(a, ids, lo, j);
    lo = i;
    j = hi;
  }
};
