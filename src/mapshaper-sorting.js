/* @requires mapshaper-common */

// Return ids of an array of numbers in sorted order (ascending)
// @arr Array of numbers to sort (not modified)
//
// Uses bucket sort for one pass, then quicksort and insertion sort.
// (Faster than just quicksort for large inputs with moderate clustering.)
//
MapShaper.bucketSortIds = function(arr, buckets) {
  buckets = Utils.isInteger(buckets) && buckets > 0 || Math.ceil(arr.length *  0.3);
  var size = arr.length,
      arrIds = new Uint32Array(size),
      counts = new Uint32Array(buckets);

  var count, i,
      start, end,
      val, bucketId, offset,
      min, max;

  var getMinBucketVal = function(i, min, max, buckets) {
    return min + i / (buckets-1) * (max - min);
  };

  var getBucketId = function(val, min, max, buckets) {
    var id = Math.floor((buckets - 1) * (val - min) / (max - min));
    // if (id < 0 || id >= buckets) error("out-of-range bucket id; id:", id, "buckets:", buckets, "val:", val, "min:", min, "max:", max);
    return id;
  };

  // Find min, max data value
  min = arr[0];
  max = min;
  for (i=1; i<size; i++) {
    val = arr[i];
    if (val < min) min = val;
    else if (val > max) max = val;
  }

  // Assign each item to a bucket
  for (i=0; i<size; i++) {
    bucketId = getBucketId(arr[i], min, max, buckets);
    counts[bucketId]++;
  }

  // Calc insertion offset of first item in each bucket
  offset = 0;
  for (i=0; i<buckets; i++) {
    count = counts[i];
    counts[i] = offset;
    offset += count;
  }

  // Sort array ids into buckets
  for (i=0; i<size; i++) {
    bucketId = getBucketId(arr[i], min, max, buckets);
    offset = counts[bucketId]++;
    arrIds[offset] = i;
  }

  // Sort each bucket
  start = 0;
  for (i=0; i<buckets; i++) {
    end = counts[i];
    count = end - start;
    if (count > 15) {
      MapShaper.quicksortIds(arr, arrIds, start, end - 1);
    } else if (count > 1) {
      MapShaper.insertionSortIds(arr, arrIds, start, end - 1);
    }
    start = end;
  }
  return arrIds;
};

MapShaper.quicksortIds = function (a, ids, lo, hi) {
  var i = lo,
      j = hi,
      pivot = a[ids[lo + hi >> 1]],
      id, spread;
  while (i <= j) {
    while (a[ids[i]] < pivot) i++;
    while (a[ids[j]] > pivot) j--;
    if (i <= j) {
      id = ids[i];
      ids[i] = ids[j];
      ids[j] = id;
      i++;
      j--;
    }
  }
  spread = j - lo;
  if (spread > 15) MapShaper.quicksortIds(a, ids, lo, j);
  else if (spread > 0) MapShaper.insertionSortIds(a, ids, lo, j);
  spread = hi - i;
  if (spread > 15) MapShaper.quicksortIds(a, ids, i, hi);
  else if (spread > 0) MapShaper.insertionSortIds(a, ids, i, hi);
};

MapShaper.insertionSortIds = function(arr, ids, start, end) {
  var id;
  for (var j = start + 1; j <= end; j++) {
    id = ids[j];
    for (var i = j - 1; i >= start && arr[id] < arr[ids[i]]; i--) {
      ids[i+1] = ids[i];
    }
    ids[i+1] = id;
  }
};

// Slow alternative to bucketSortIds() for testing
//
MapShaper.sortIds = function(arr) {
  var ids = Utils.range(arr.length);
  ids.sort(function(i, j) {
    return arr[i] - arr[j];
  });
  return ids;
};
