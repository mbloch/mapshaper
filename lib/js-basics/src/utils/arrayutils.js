/* @requires core, sorting */

// Test a string or array-like object for existence of substring or element
Utils.contains = function(container, item) {
  if (Utils.isString(container)) {
    return container.indexOf(item) != -1;
  }
  else if (Utils.isArrayLike(container)) {
    return Utils.indexOf(container, item) != -1;
  }
  error("Expected Array or String argument");
};

// Transpose an object with (assumed) equal-size column arrays to an array of object-records
Utils.transposeDataBlock = function(obj) {
  var data = null;
  if (Utils.isArray(obj)) {

  } else {
    var keys = Utils.getKeys(obj),
        cols = keys.length,
        rows = obj[keys[0]].length;

    data = [];
    for (var j=0; j<rows; j++) {
      data.push({});
    }
    for (var i=0; i<cols; i++) {
      var key = keys[i];
      var col = obj[key];
      for (var j=0; j<rows; j++) {
        data[j][key] = col[j];
      }
    }
  }
  return data;
};

// Return array of hash keys with value === null
Utils.nullKeys = function(obj) {
  var arr = Utils.filter(Utils.getKeys(obj), function(key) {
    return obj[key] === null;
  });
  return arr.length == 0 ? null : arr;
};

Utils.some = function(arr, test) {
  return Utils.reduce(arr, function(item, val) {
    return val || test(item); // TODO: short-circuit?
  }, false);
};

Utils.every = function(arr, test) {
  return Utils.reduce(arr, function(item, val) {
    return val && test(item);
  }, true);
};

Utils.findInArray = function(obj, arr, prop) {
  return Utils.indexOf(arr, obj, prop);
};

// Convert an array-like object to an Array
Utils.toArray = function(obj) {
  if (!Utils.isArrayLike(obj)) error("Utils.toArray() requires an array-like object");
  return Array.apply([], obj);
};

Utils.find = function(arr, test) {
  for (var i=0, n=arr.length; i<n; i++) {
    var o = arr[i];
    if (test(o)) return o;
  }
  return null;
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

Utils.range = function(len, start, inc) {
  var arr = [],
      v = start === void 0 ? 0 : start,
      i = inc === void 0 ? 1 : inc;
  while(len--) {
    arr.push(v);
    v += i;
  }
  return arr;
};

Utils.repeat = function(times, func) {
  times = times > 0 && times || 1;
  var i = 0;
  while (i < times) {
    func(i++);
  }
};


// Calc sum, skip falsy and NaN values
// Assumes: no other non-numeric objects in array
//
Utils.sum = function(arr, info) {
  var tot = 0,
      nan = 0,
      val;
  for (var i=0, n=arr.length; i<n; i++) {
    val = arr[i];
    if (val) {
      tot += val;
    } else if (isNaN(val)) {
      nan++;
    }
  }
  if (info) {
    info.nan = nan;
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
  if (!arr.length) error("Tried to find average of empty array");
  return Utils.sum(arr) / arr.length;
};

Utils.invertIndex = function(obj) {
  var inv = {};
  for (var key in obj) {
    inv[obj[key]] = key;
  }
  return inv;
};

Utils.invertArray = function(arr) {
  var index = {};
  // iterate bw so first occurence gets indexed
  for (var i=arr.length - 1; i >= 0; i--) {
    index[arr[i]] = i;
  }
  return index;
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

Utils.getValues = function(obj) {
  var arr = [];
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      arr.push(obj[key]);
    }
  }
  return arr;
};

//
Utils.uniq = function(src) {
  var index = {};
  return Utils.filter(src, function(el, i) {
    if (el in index) {
      return false;
    }
    index[el] = true;
    return true;
    // return i == 0 || el !== copy[i-1] ? true : false;
  });
};

Utils.pluck = function(arr, key) {
  return Utils.map(arr, function(obj) {
    return obj[key];
  });
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

Utils.assembleObjects = function(keys, vals) {
  return Utils.map(keys, function(k, i) {
    var o = {};
    o[k] = vals[i];
    return o;
  })
};

Utils.indexOn = function(arr, k) {
  return Utils.reduce(arr, function(o, index) {
    index[o[k]] = o;
    return index;
  }, {});
};

Utils.indexOn2 = function(arr, k) {
  return Utils.reduce(arr, function(o, index) {
    var keyval = o[k];
    if (keyval in index) {
      index[keyval].push(o);
    } else {
      index[keyval] = [o]
    }
    return index;
  }, {});
};


Utils.arrayToIndex = function(arr, arg2) {
  if (Utils.isArray(arg2))
    return Utils.assembleObjects(arr, arg2);
  if (Utils.isString(arg2))
    return Utils.indexOn(arr, arg2);

  return Utils.reduce(arr, function(key, index) {
    if (key in index) trace("[Utils.arrayToIndex()] Warning: duplicate key:", key);
    index[key] = true;
    return index;
  }, {});
};

Utils.groupBy = function(arr, key) {
  var index = {},
      groups = [];
  Utils.forEach(arr, function(obj) {
    var keyval = obj[key];
    var group = index[keyval];
    if (!group) {
      index[keyval] = group = [];
      groups.push(group);
    }
    group.push(obj);
  });
  groups.index = index;
  return groups;
};

Utils.forEach = function(obj, callback, ctx) {
  Utils.map(obj, callback, ctx);
};

Utils.multiMap = function(callback) {
  var usage = "Usage: Utils.multiMap(callback, arr1, [arr2, ...])";
  if (!Utils.isFunction(callback)) error(usage)
  var args = [],
      sources = args.slice.call(arguments, 1),
      arrLen = 0;
  Utils.forEach(sources, function(src, i) {
    if (Utils.isArrayLike(src)) {
      if (arrLen == 0) {
        arrLen = src.length;
      } else if (src.length != arrLen) {
        error("#multiMap() mismatched source arrays");
      }
    } else {
      args[i] = src;
      sources[i] = null;
    }
  });

  var retn = [];
  for (var i=0; i<arrLen; i++) {
    for (var j=0, n=sources.length; j<n; j++) {
      if (sources[j]) args[j] = sources[j][i];
    }
    retn[i] = callback.apply(null, args);
  }
  return retn;
};

Utils.initializeArray = function(arr, init) {
  // if (typeof init == "function") error("[initializeArray()] removed function initializers");
  for (var i=0, len=arr.length; i<len; i++) {
    arr[i] = init;
  }
  return arr;
}

Utils.newArray = function(size, init) {
  return Utils.initializeArray(new Array(size), init);
};

Utils.replaceArray = function(arr, arr2) {
  arr.splice(0, arr.length);
  arr.push.apply(arr, arr2);
}

Utils.randomizeArray = function(arr) {
  var tmp, swap, n=arr.length;
  while(n) {
    swap = Math.random() * n | 0; // assumes random() != 1
    tmp = arr[swap];
    arr[swap] = arr[--n];
    arr[n] = tmp;
  }
  return arr;
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

Utils.filterById = function(src, ids) {
  var arr = [], val;
  for (var i=0, n=ids.length; i<n; i++) {
    val = src[ids[i]];
    if (val !== void 0) arr.push(val);
  }
  return arr;
};
