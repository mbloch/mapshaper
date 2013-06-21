/* @requires core */

Utils.sortArrayByKeys = function(arr, keys, asc) {
  var ids = Utils.getSortedIds(keys, asc);
  Utils.reorderArray(arr, ids);
};

Utils.getSortedIds = function(arr, asc) {
  var ids = Utils.range(arr.length);
  Utils.sortArrayIndex(ids, arr, asc);
  return ids;
};

Utils.sortArrayIndex = function(ids, arr, asc) {
  var asc = asc !== false;
  ids.sort(function(i, j) {
    var a = arr[i], b = arr[j];
    // added i, j comparison to guarantee that sort is stable
    if (asc && a > b || !asc && a < b || a === b && i < j)
      return 1;
    else
      return -1;
  });
};

Utils.reorderArray = function(arr, idxs) {
  var len = idxs.length;
  var arr2 = [];
  for (var i=0; i<len; i++) {
    var idx = idxs[i];
    if (idx < 0 || idx >= len) error("Out-of-bounds array idx");
    arr2[i] = arr[idx];
  }
  Utils.replaceArray(arr, arr2);
};

// Sort an array of objects based on one or more properties.
// Usage: Utils.sortOn(array, key1, asc?[, key2, asc? ...])
//
Utils.sortOn = function(arr) {
  var params = Array.prototype.slice.call(arguments, 1)
  var compare = function(objA, objB) {
    for (var i=0, n = params.length; i < n;) {
      var key = params[i++],
          asc = params[i++] !== false,
          a = objA[key],
          b = objB[key];
      if (a === void 0 || b === void 0) {
        error("#sortOn() Missing key:", key);
      }
      if (a !== b) {
        return asc && a > b || !asc && b > a ? 1 : -1;
      }
    }
    return 0;
  };
  arr.sort(compare);
  return arr;
};

Utils.sortNumbers = function(arr, asc) {
  var compare = asc !== false ?
    function(a, b) {return a - b} : function(a, b) {return b - a};
  Array.prototype.sort.call(arr, compare);
};

// Sort array of values that can be compared with < > operators (strings, numbers)
// null, undefined and NaN are sorted to the end of the array
//
Utils.genericSort = function(arr, asc) {
  asc = asc !== false;
  var compare = function(a, b) {
    var retn = 0;
    if (b == null) {
      retn = a == null ? 0 : -1;
    } else if (a == null) {
      retn = 1;
    } else if (a < b) {
      retn = asc ? -1 : 1;
    } else if (a > b) {
      retn = asc ? 1 : -1;
    } else if (a !== a) {
      retn = 1;
    } else if (b !== b) {
      retn = -1;
    }
    return retn;
  };
  Array.prototype.sort.call(arr, compare);
  return arr;
};

// Sorts an array of numbers in-place
//
Utils.quicksort = function(arr, asc) {
  function partition(a, lo, hi) {
    var i = lo,
        j = hi,
        pivot, tmp;
    while (i < hi) {
      pivot = a[lo + hi >> 1]; // avoid n^2 performance on sorted arryays
      while (i <= j) {
        while (a[i] < pivot) i++;
        while (a[j] > pivot) j--;
        if (i <= j) {
          tmp = a[i];
          a[i] = a[j];
          a[j] = tmp;
          i++;
          j--;
        }
      }
      if (lo < j) partition(a, lo, j);
      lo = i;
      j = hi;
    }
  }
  partition(arr, 0, arr.length-1);
  if (asc === false) Array.prototype.reverse.call(arr); // Works with typed arrays
  return arr;
};

/**
 * This is much faster than Array.prototype.sort(<callback>) when "getter" returns a
 * precalculated sort string. Unpredictable if number is returned.
 *
 * @param {Array} arr Array of objects to sort.
 * @param {function} getter Function that returns a sort key (string) for each object.
 */
Utils.sortOnKeyFunction = function(arr, getter) {
  if (!arr || arr.length == 0) {
    return;
  }
  // Temporarily patch toString() method w/ sort key function.
  // Assumes array contains objects of the same type
  // and their "constructor" property is properly set.
  var p = arr[0].constructor.prototype;
  var tmp = p.toString;
  p.toString = getter;
  arr.sort();
  p.toString = tmp;
};