import { message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { getAvgSegment } from '../paths/mapshaper-path-utils';

// Returns an interval for snapping together coordinates that be co-incident bug
// have diverged because of floating point rounding errors. Intended to be small
// enought not not to snap points that should be distinct.
// This is not a robust method... e.g. some formulas for some inputs may produce
// errors that are larger than this interval.
// @coords: Array of relevant coordinates (e.g. bbox coordinates of vertex coordinates
//   of two intersecting segments).
//
export function getHighPrecisionSnapInterval(coords) {
  var maxCoord = Math.max.apply(null, coords.map(Math.abs));
  return maxCoord * 1e-14;
}

export function snapCoords(arcs, threshold) {
    var avgDist = getAvgSegment(arcs),
        autoSnapDist = avgDist * 0.0025,
        snapDist = autoSnapDist;

  if (threshold > 0) {
    snapDist = threshold;
    message(utils.format("Applying snapping threshold of %s -- %.6f times avg. segment length", threshold, threshold / avgDist));
  }
  var snapCount = snapCoordsByInterval(arcs, snapDist);
  if (snapCount > 0) arcs.dedupCoords();
  message(utils.format("Snapped %s point%s", snapCount, utils.pluralSuffix(snapCount)));
}

export function snapCoordsByInterval(arcs, snapDist) {
  if (snapDist > 0 === false) return 0;
  var ids = getCoordinateIds(arcs);
  return snapCoordsInternal(ids, arcs, snapDist);
}

export function snapEndpointsByInterval(arcs, snapDist) {
  if (snapDist > 0 === false) return 0;
  var ids = getEndpointIds(arcs);
  return snapCoordsInternal(ids, arcs, snapDist);
}

// Snap together points within a small threshold
//
function snapCoordsInternal(ids, arcs, snapDist) {
  var snapCount = 0,
      n = ids.length,
      data = arcs.getVertexData();

  quicksortIds(data.xx, ids, 0, n-1);

  // Consider: speed up sorting -- try bucket sort as first pass.
  for (var i=0; i<n; i++) {
    snapCount += snapPoint(i, snapDist, ids, data.xx, data.yy);
  }
  return snapCount;

  function snapPoint(i, limit, ids, xx, yy) {
    var j = i,
        n = ids.length,
        x = xx[ids[i]],
        y = yy[ids[i]],
        snaps = 0,
        id2, dx, dy;

    while (++j < n) {
      id2 = ids[j];
      dx = xx[id2] - x;
      if (dx > limit) break;
      dy = yy[id2] - y;
      if (dx === 0 && dy === 0 || dx * dx + dy * dy > limit * limit) continue;
      xx[id2] = x;
      yy[id2] = y;
      snaps++;
    }
    return snaps;
  }
}

export function getCoordinateIds(arcs) {
  var data = arcs.getVertexData(),
      n = data.xx.length,
      ids = new Uint32Array(n);
  for (var i=0; i<n; i++) {
    ids[i] = i;
  }
  return ids;
}

export function getEndpointIds(arcs) {
  var i = 0;
  var ids = [];
  var data = arcs.getVertexData();
  data.nn.forEach(function(n) {
    if (n > 0 === false) return;
    ids.push(i, i+n-1);
    i += n;
  });
  return ids;
}

/*
// Returns array of array ids, in ascending order.
// @a array of numbers
//
utils.sortCoordinateIds = function(a) {
  return utils.bucketSortIds(a);
};

// This speeds up sorting of large datasets (~2x faster for 1e7 values)
// worth the additional code?
utils.bucketSortIds = function(a, n) {
  var len = a.length,
      ids = new Uint32Array(len),
      bounds = utils.getArrayBounds(a),
      buckets = Math.ceil(n > 0 ? n : len / 10),
      counts = new Uint32Array(buckets),
      offsets = new Uint32Array(buckets),
      i, j, offs, count;

  // get bucket sizes
  for (i=0; i<len; i++) {
    j = bucketId(a[i], bounds.min, bounds.max, buckets);
    counts[j]++;
  }

  // convert counts to offsets
  offs = 0;
  for (i=0; i<buckets; i++) {
    offsets[i] = offs;
    offs += counts[i];
  }

  // assign ids to buckets
  for (i=0; i<len; i++) {
    j = bucketId(a[i], bounds.min, bounds.max, buckets);
    offs = offsets[j]++;
    ids[offs] = i;
  }

  // sort each bucket with quicksort
  for (i = 0; i<buckets; i++) {
    count = counts[i];
    if (count > 1) {
      offs = offsets[i] - count;
      utils.quicksortIds(a, ids, offs, offs + count - 1);
    }
  }
  return ids;

  function bucketId(val, min, max, buckets) {
    var id = (buckets * (val - min) / (max - min)) | 0;
    return id < buckets ? id : buckets - 1;
  }
};
*/

function quicksortIds(a, ids, lo, hi) {
  if (hi - lo > 24) {
    var pivot = a[ids[lo + hi >> 1]],
        i = lo,
        j = hi,
        tmp;
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
    if (j > lo) quicksortIds(a, ids, lo, j);
    if (i < hi) quicksortIds(a, ids, i, hi);
  } else {
    insertionSortIds(a, ids, lo, hi);
  }
}

function insertionSortIds(arr, ids, start, end) {
  var id, i, j;
  for (j = start + 1; j <= end; j++) {
    id = ids[j];
    for (i = j - 1; i >= start && arr[id] < arr[ids[i]]; i--) {
      ids[i+1] = ids[i];
    }
    ids[i+1] = id;
  }
}
