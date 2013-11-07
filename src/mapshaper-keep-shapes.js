/* @require mapshaper-shapes */


MapShaper.protectRingsFromCollapse = function(arcData, lockCounts) {
  var n;
  for (var i=0, len=lockCounts.length; i<len; i++) {
    n = lockCounts[i];
    if (n > 0) {
      MapShaper.lockMaxThresholds(arcData.getArcThresholds(i), n);
    }
  }
};

// Protect the highest-threshold interior vertices in an arc from removal by
// setting their removal thresholds to Infinity
//
MapShaper.lockMaxThresholds = function(zz, numberToLock) {
  var lockVal = Infinity,
      target = numberToLock | 0,
      lockedCount, maxVal, replacements, z;
  do {
    lockedCount = 0;
    maxVal = 0;
    for (var i=1, len = zz.length - 1; i<len; i++) { // skip arc endpoints
      z = zz[i];
      if (z === lockVal) {
        lockedCount++;
      } else if (z > maxVal) {
        maxVal = z;
      }
    }
    if (lockedCount >= numberToLock) break;
    replacements = MapShaper.replaceValue(zz, maxVal, lockVal);
  } while (lockedCount < numberToLock && replacements > 0);
};

MapShaper.replaceValue = function(arr, value, replacement) {
  var count = 0, k;
  for (var i=0, n=arr.length; i<n; i++) {
    if (arr[i] === value) {
      arr[i] = replacement;
      count++;
    }
  }
  return count;
};
