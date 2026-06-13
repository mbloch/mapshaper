
// @xx array of x coords
// @ids an array of segment endpoint ids [a0, b0, a1, b1, ...]
// Sort @ids in place so that xx[a(n)] <= xx[b(n)] and xx[a(n)] <= xx[a(n+1)]
//
// The sort key for each segment is its smaller x-coordinate (xmin). A naive
// indirect sort compares xx[ids[i]] on every step, which gathers from the
// (potentially multi-MB) coordinate array at scattered vertex ids -- a cache
// miss per comparison. Instead we hoist each segment into three small,
// contiguous scratch arrays (xmin key + the two endpoint ids, with the xmin
// endpoint first), sort those together so comparisons read a cache-resident
// key array, then scatter back into @ids. On sparse/clean inputs the segment
// sort is 25-40% of intersection-detection time, so this locality win matters;
// on intersection-dense inputs the sort is a few percent, so there's no risk.
var keyBuf = null, aBuf = null, bBuf = null;

function ensureScratch(n) {
  if (!keyBuf || keyBuf.length < n) {
    keyBuf = new Float64Array(n);
    aBuf = new Uint32Array(n);
    bBuf = new Uint32Array(n);
  }
}

export function sortSegmentIds(xx, ids) {
  var n = ids.length >> 1;
  if (n < 2) {
    if (n == 1 && xx[ids[0]] > xx[ids[1]]) {
      var t = ids[0]; ids[0] = ids[1]; ids[1] = t;
    }
    return;
  }
  ensureScratch(n);
  var key = keyBuf, a = aBuf, b = bBuf;
  for (var k = 0, i = 0; k < n; k++, i += 2) {
    var p = ids[i], q = ids[i + 1], xp = xx[p], xq = xx[q];
    if (xp <= xq) {
      a[k] = p; b[k] = q; key[k] = xp;
    } else {
      a[k] = q; b[k] = p; key[k] = xq;
    }
  }
  quicksortRecords(key, a, b, 0, n - 1);
  for (var k2 = 0, j = 0; k2 < n; k2++, j += 2) {
    ids[j] = a[k2];
    ids[j + 1] = b[k2];
  }
}

function insertionSortRecords(key, a, b, lo, hi) {
  for (var j = lo + 1; j <= hi; j++) {
    var kv = key[j], av = a[j], bv = b[j], i = j - 1;
    while (i >= lo && key[i] > kv) {
      key[i + 1] = key[i];
      a[i + 1] = a[i];
      b[i + 1] = b[i];
      i--;
    }
    key[i + 1] = kv;
    a[i + 1] = av;
    b[i + 1] = bv;
  }
}

function quicksortRecords(key, a, b, lo, hi) {
  while (lo < hi) {
    if (hi - lo < 24) {
      insertionSortRecords(key, a, b, lo, hi);
      return;
    }
    var mid = (lo + hi) >> 1;
    // median-of-3 pivot guards against worst-case behavior on sorted input
    var kl = key[lo], km = key[mid], kh = key[hi], pivot;
    if (kl < km) {
      pivot = km < kh ? km : (kl < kh ? kh : kl);
    } else {
      pivot = kl < kh ? kl : (km < kh ? kh : km);
    }
    var i = lo, j = hi;
    while (i <= j) {
      while (key[i] < pivot) i++;
      while (key[j] > pivot) j--;
      if (i <= j) {
        var tk = key[i]; key[i] = key[j]; key[j] = tk;
        var ta = a[i]; a[i] = a[j]; a[j] = ta;
        var tb = b[i]; b[i] = b[j]; b[j] = tb;
        i++;
        j--;
      }
    }
    // recurse into the smaller partition, loop on the larger (bounded stack)
    if (j - lo < hi - i) {
      quicksortRecords(key, a, b, lo, j);
      lo = i;
    } else {
      quicksortRecords(key, a, b, i, hi);
      hi = j;
    }
  }
}
