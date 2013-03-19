/** @requires core */

Utils.contains = function(container, item) {
  if (Utils.isString(container)) {
    return container.indexOf(item) != -1;
  }
  else if (Utils.isArray(container)) {
    return Utils.indexOf(container, item) != -1;
  }
  error("Expected Array or String argument");
};

Utils.some = function(arr, test) {
  return Utils.reduce(arr, false, function(item, val) {
    return val || test(item); // TODO: short-circuit?
  });
};

Utils.every = function(arr, test) {
  return Utils.reduce(arr, true, function(item, val) {
    return val && test(item);
  });
};

Utils.findInArray = function(obj, arr, prop) {
  return Utils.indexOf(arr, obj, prop);
};

Utils.indexOf = function(arr, item, prop) {
  for (var i = 0, len = arr.length || 0; i < len; i++) {
    if (!prop) {
      if (arr[i] === item) {
        return i;
      }
    }
    else if (arr[i][prop] === item) {
      return i;
    }
  }
  return -1;
};


Utils.getClassId = function(val, breaks) {
  var id = -1;
  if (!isNaN(val)) {
    id = 0;
    for (var j = 0, len=breaks.length; j < len; j++) {
      var breakVal = breaks[j];
      if (val < breakVal) {
        break;
      }
      id = j + 1;
    }
  }
  return id;
};


Utils.getInnerBreaks = function(v1, v2, breaks) {
  var id1 = Utils.getClassId(v1, breaks);
  var id2 = Utils.getClassId(v2, breaks);
  var retn = [];
  if (id1 == id2) {
    return retn;
  }
  else if (id1 < id2) {
    var start=id1;
    var end=id2;
    var inv = false;
  }
  else {
    start = id2
    end = id1;
    inv = true;
  }
  for (var i=start; i<end; i ++) {
    retn.push(breaks[i]);
  }

  if (inv) {
    retn.reverse();
  }
  return retn;
};

Utils.nextItem = function(arr, item, prev) {
  var nextIdx, idx = Utils.indexOf(arr, item);
  if (idx == -1) {
    return null;
  }
  if (prev) {
    nextIdx = idx == 0 ? arr.length - 1 : idx - 1;
  } 
  else {
    nextIdx = idx >= arr.length - 1 ? 0 : idx + 1;
  }
  return arr[nextIdx];
}

Utils.range = function(len, start, inc) {
  start = start || 0;
  inc = inc || 1;
  var arr = [];
  for (var i=0; i<len; i++) {
    arr.push(start + i * inc);
  }
  return arr;
};

Utils.sum = function(arr) {
  var tot = 0;
  for (var i=0, len=arr.length; i<len; i++) {
    var val = arr[i];
    if (val === !val) {
      error("Array contains NaN");
    } else {
      tot += val;
    }
  }
  return tot;
};


/**
 * Calculate min and max values of an array, ignoring NaN values
 */
Utils.getArrayBounds = function(arr) {
  var min = Infinity,
    max = -Infinity,
    nan = 0, val;
  for (var i=0, len=arr.length; i<len; i++) {
    val = arr[i];
    if (val !== val) nan++;
    if (val < min) min = val;
    if (val > max) max = val;
  }
  return {
    min: min,
    max: max,
    nan: nan
  };
};

Utils.average = function(arr) {
  if (arr.length == 0) error("Tried to find average of empty array");
  return Utils.sum(arr) / arr.length;
};

Utils.invertIndex = function(obj) {
  var inv = {};
  for (var key in obj) {
    inv[obj[key]] = key;
  }
  return inv;
};


Utils.getKeys = function(obj) {
  var arr = [];
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      arr.push(key);
    }
  }
  return arr;
};

Utils.uniqueArray = function(src) {
  var copy = src.concat();
  copy.sort();
  var retn = Utils.filter(copy, function(el, i) {
    return i == 0 || el !== copy[i-1] ? true : false;
  });
  return retn;
};


Utils.getValues = function(obj) {
  var arr = [];
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      arr.push(obj[key]);
    }
  }
  return arr;
};


Utils.filter = function(src, func, ctx) {
  var dest = [];
  for (var i=0, len=src.length; i<len; i++) {
    var val = src[i];
    if (func.call(ctx, val, i)) {
      dest.push(val);
    }
  }
  return dest;
};


Utils.arrayToLookupTable = function(arr, multi) {
  multi = !!multi;
  var index = {};
  for (var i=0, len=arr.length; i<len; i++) {
    var val = arr[i];
    if (val in index) {
      if (multi) {
        index[val].push(i);
      }
      else {
        trace("[Utils.arrayToLookupTable()] Trying to enter same value multiple times:", val);
      }
    }
    else if (multi) {
      index[val] = [i];
    }
    else {
      index[val] = i;
    }
  }
  return index;
};



Utils.arrayToIndex = function(arr, arg2) {
  var obj = {},
    haveVals = false,
    haveKey = false;

  if (arg2) {
    if (Utils.isArray(arg2)) {
      haveVals = true;
    }
    else if (Utils.isString(arg2)) {
      haveKey = true;
    }
  }
  
  for (var i=0, len=arr.length; i<len; i++) {
    var arrval = arr[i];
    if (haveVals) {
      obj[arrval] = arg2[i];
    }
    else if (haveKey) {
      var key = arrval[arg2];
      if (key in obj) {
        trace("[Utils.arrayToIndex()] Warning: duplicate key:", key);
      }
      obj[key] = arr[i];
    }
    else {
      obj[arrval] = true;
    }
  }
  return obj;
};


Utils.forEach = function(obj, func, ctx) {
  if (Utils.isString(obj)) error("Called Utils.forEach() on a string:", obj);
  if (!obj) {
    // ignore null objects
  }
  else if (Utils.isArray(obj) || obj.length) {  // treat objects with "length" property as arrays, e.g. dom element list, Uint32Array
    for (var i = 0, len = obj.length; i < len; i++) {
      if (func.call(ctx, obj[i], i) === false) break;
    }
  }
  else {
    for (var key in obj) {
      if (obj.hasOwnProperty(key))
        if (func.call(ctx, obj[key], key) === false)
          break;
    }
  }
};

/*
Utils.sequence = function(len, start, inc) {
  var arr = [],
    val = start || 0,
    inc = inc || 1;

  for (var i = 0; i < len; i++) {
    arr[i] = val;
    val += inc;
  }
  return arr;
};
*/

/*
Utils.createRandomArray = function(size, values) {
  var len = values.length;
  var func = function(i) { return values[Math.floor(Math.random() * len)] };
  return Utils.createArray(size, func);
};
*/


Utils.initializeArray = function(arr, init) {
  if (typeof init == "function") error("[initializeArray()] removed function initializers");
  for (var i=0, len=arr.length; i<len; i++) {
    arr[i] = init;
  }
  return arr;
}


Utils.createArray = function(size, init) {
  return Utils.initializeArray(new Array(size), init);
}; /* */


Utils.createIndexArray = function(size, func) {
  var arr = new Array(size);
  for (var i=0; i<size; i++) {
    arr[i] = func ? func(i) : i;
  }
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


/**
 * Sort an array of objects based on one or more properties.
 * (More than 2x faster than sortOn2 in ie8-: why bother?)
 */
Utils.sortOn = function(arr) {
  var js = "var aval, bval;\n";
  for (var i=1; i < arguments.length; i+=2) {
    var prop = arguments[i];
    var asc = arguments[i+1] !== false;
    var op = asc ? ">" : "<"; //  : ">";
    js += "aval = a['" + prop + "'];\nbval = b['" + prop + "'];\n";
    js += "if (aval" + op + "bval) return 1;\n";
    js += "if (bval" + op + "aval) return -1;\n";
  }
  js += "return 0;";
  arr.sort(new Function("a", "b", js));
};

/*
Utils.sortOn2 = function(arr) {
  var params = Array.prototype.slice.call(arguments, 1); // Chrome 19 likes this
  var len = params.length;
  var func = function(a, b) {
    for (var i=0; i < len; i+=2) {
      var prop = params[i];
      var asc = params[i+1] !== false;
      var va = a[prop], vb = b[prop];
      if (va != vb) {
        if (asc && va > vb || !asc && vb > va ) {
          return 1;
        }
        else {
          return -1;
        }
      }
    }
    return 0;
  };
  arr.sort(func);
};
*/

Utils.sortNumbers = function(arr, asc) {
  asc = asc !== false;
  var func = function(a, b) {
    if (a === b) return 0;
    if (asc && a > b || !asc && a < b) return 1;
    return -1;   
  }
  arr.sort(func);
}

Utils.replaceArray = function(arr, arr2) {
  arr.splice(0, arr.length);
  arr.push.apply(arr, arr2);
}

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

Utils.randomizeArray = function(arr) {
  var tmp, swap, n=arr.length;
  while(n) {
    swap = Math.random() * n | 0; // assumes random() != 1
    tmp = arr[swap];
    arr[swap] = arr[--n];
    arr[n] = tmp;
  }
};

Utils.swap = function(arr, i, j) {
  var tmp = arr[i];
  arr[i] = arr[j];
  arr[j] = tmp;
}

Utils.getRandomIds = function(len) {
  var ids = Utils.range(len);
  Utils.randomizeArray(ids);
  return ids;
};

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

/*
Utils.getFilteredCopy = function(arr, ids) {
  var copy = [];
  for (var i=0, len=ids.length; i<len; i++) {
    var idx = ids[i];
    copy.push(arr[idx]); // TODO: validate index
  }
  return copy;
};
*/