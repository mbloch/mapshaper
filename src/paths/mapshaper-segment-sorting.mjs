
// @xx array of x coords
// @ids an array of segment endpoint ids [a0, b0, a1, b1, ...]
// Sort @ids in place so that xx[a(n)] <= xx[b(n)] and xx[a(n)] <= xx[a(n+1)]
export function sortSegmentIds(xx, ids) {
  orderSegmentIds(xx, ids);
  quicksortSegmentIds(xx, ids, 0, ids.length-2);
}

function orderSegmentIds(xx, ids, spherical) {
  function swap(i, j) {
    var tmp = ids[i];
    ids[i] = ids[j];
    ids[j] = tmp;
  }
  for (var i=0, n=ids.length; i<n; i+=2) {
    if (xx[ids[i]] > xx[ids[i+1]]) {
      swap(i, i+1);
    }
  }
}

function insertionSortSegmentIds(arr, ids, start, end) {
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
}

function quicksortSegmentIds (a, ids, lo, hi) {
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

    if (j - lo < 40) insertionSortSegmentIds(a, ids, lo, j);
    else quicksortSegmentIds(a, ids, lo, j);
    if (hi - i < 40) {
      insertionSortSegmentIds(a, ids, i, hi);
      return;
    }
    lo = i;
    j = hi;
  }
}
