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

// Updated the original function with a smaller interval... which works
// better on a (limited) set of real-world sample data
// (less likely to create erroneous output)
export function getHighPrecisionSnapInterval(coords) {
  var n = Math.max.apply(null, coords.map(Math.abs));
  var ceil = n <= 1 ? 1 : 2 ** Math.ceil(Math.log2(n));
  // console.log(ceil < ceil + ceil / 2 ** 51) // true
  // console.log(ceil < ceil + ceil / 2 ** 52) // true
  // console.log(ceil < ceil + ceil / 2 ** 53) // false
  var interval = ceil / 2 ** 51;
  // console.log('interval:', interval)
  return interval;
}

export function getHighPrecisionSnapInterval_old(coords) {
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

  sortIds(data.xx, ids);

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

// Sort `ids` in place so that a[ids[k]] is ascending.
// A linear-time bucket pass distributes ids by value, then each bucket is
// finished with quicksortIds. For typical well-spread coordinate data this is
// O(n) and several times faster than sorting by indirect comparison (which
// chases random a[ids[i]] reads through the coordinate array); clustered values
// or many ties just make individual buckets larger and degrade gracefully to
// the O(n log n) quicksort, never worse. `ids` may be a typed or plain array.
export function sortIds(a, ids) {
  var len = ids.length;
  if (len < 64) {
    if (len > 1) quicksortIds(a, ids, 0, len - 1);
    return ids;
  }
  var min = Infinity, max = -Infinity, v, i, b;
  for (i = 0; i < len; i++) {
    v = a[ids[i]];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!(max > min)) return ids; // all equal or non-finite -- no order to impose
  var buckets = len >> 3;
  var scale = buckets / (max - min);
  var counts = new Uint32Array(buckets);
  for (i = 0; i < len; i++) {
    b = (a[ids[i]] - min) * scale | 0;
    if (b >= buckets) b = buckets - 1;
    counts[b]++;
  }
  var offsets = new Uint32Array(buckets);
  var cursor = new Uint32Array(buckets);
  for (b = 0, v = 0; b < buckets; b++) {
    offsets[b] = v;
    cursor[b] = v;
    v += counts[b];
  }
  var out = new Uint32Array(len);
  for (i = 0; i < len; i++) {
    b = (a[ids[i]] - min) * scale | 0;
    if (b >= buckets) b = buckets - 1;
    out[cursor[b]++] = ids[i];
  }
  for (b = 0; b < buckets; b++) {
    if (counts[b] > 1) {
      quicksortIds(a, out, offsets[b], offsets[b] + counts[b] - 1);
    }
  }
  for (i = 0; i < len; i++) ids[i] = out[i];
  return ids;
}

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
