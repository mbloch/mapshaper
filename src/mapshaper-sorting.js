/* @requires mapshaper-common */

MapShaper.insertionSortIds = function(arr, ids, start, end) {
  var id, id2;
  for (var j = start + 2; j <= end; j+=2) {
    id = ids[j];
    id2 = ids[j+1];
    for (var i = j - 2; i >= start && arr[id] < arr[ids[i]]; i-=2) {
      ids[i+2] = ids[i];
      ids[i+3] = ids[i+1];
    }
    ids[i+2] = id;
    ids[i+3] = id2;
  }
};

MapShaper.sortIdsFast = function(arr, ids) {
  MapShaper.quicksortIds(arr, ids, 0, ids.length-2);
};

MapShaper.quicksortIds = function (a, ids, lo, hi) {
  var i = lo,
      j = hi,
      pivot, tmp;
  while (i < hi) {
    pivot = a[ids[(lo + hi >> 2) << 1]]; // avoid n^2 performance on sorted arrays
    while (i <= j) {
      while (a[ids[i]] < pivot) i+=2;
      while (a[ids[j]] > pivot) j-=2;
      if (i <= j) {
        tmp = ids[i];
        ids[i] = ids[j];
        ids[j] = tmp;
        tmp = ids[i+1];
        ids[i+1] = ids[j+1];
        ids[j+1] = tmp;
        i+=2;
        j-=2;
      }
    }

    if (j - lo < 40) MapShaper.insertionSortIds(a, ids, lo, j);
    else MapShaper.quicksortIds(a, ids, lo, j);
    if (hi - i < 40) {
      MapShaper.insertionSortIds(a, ids, i, hi);
      return;
    }
    lo = i;
    j = hi;
  }
};
