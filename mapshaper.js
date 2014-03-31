(function(){

var Env = (function() {
  var inNode = typeof module !== 'undefined' && !!module.exports;
  var inPhantom = !inNode && !!(window.phantom && window.phantom.exit);
  var inBrowser = !inNode; // phantom?
  var ieVersion = inBrowser && /MSIE ([0-9]+)/.exec(navigator.appVersion) && parseInt(RegExp.$1) || NaN;

  return {
    iPhone : inBrowser && !!(navigator.userAgent.match(/iPhone/i)),
    iPad : inBrowser && !!(navigator.userAgent.match(/iPad/i)),
    touchEnabled : inBrowser && ("ontouchstart" in window),
    canvas: inBrowser && !!document.createElement('canvas').getContext,
    inNode : inNode,
    inPhantom : inPhantom,
    inBrowser: inBrowser,
    ieVersion: ieVersion,
    ie: !isNaN(ieVersion)
  };
})();

var C = C || {}; // global constants
C.VERBOSE = true;

var Utils = {
  getUniqueName: function(prefix) {
    var n = Utils.__uniqcount || 0;
    Utils.__uniqcount = n + 1;
    return (prefix || "__id_") + n;
  },

  parseUrl: function parseUrl(url) {
    var rxp = /^(http|file|https):\/\/([^\/?#]+)([^?#]*)\??([^#?]*)#?(.*)/,
        matches = rxp.exec(url);
    if (!matches) {
      trace("[Utils.parseUrl()] unable to parse:", url);
      return null;
    }
    return {
      protocol: matches[1],
      host: matches[2],
      path: matches[3],
      query: matches[4],
      hash: matches[5]
    };
  },

  buildUrl: function(obj) {
    var url = "";
    url += (obj.protocol || 'http') + "://";
    url += obj.host || error("buildUrl() Missing host name");
    url += obj.path || "";
    if (obj.query) {
      url += '?' + obj.query;
    }
    if (obj.hash) {
      url += "#" + obj.hash;
    }
    return url;
  },

  keys: function(obj) {
    var arr = [];
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        arr.push(key);
      }
    }
    return arr;
  },

  reduce: function(arr, func, val, ctx) {
    var len = arr && arr.length || 0;
    for (var i = 0; i < len; i++) {
      val = func.call(ctx, val, arr[i], i);
    }
    return val;
  },

  mapFilter: function(src, func, ctx) {
    var isArray = Utils.isArrayLike(src),
        dest = [],
        retn, keys, key, n;
    if (isArray) {
      n = src.length;
    } else {
      keys = Utils.keys(src);
      n = keys.length;
    }
    for (var i=0; i < n; i++) {
      key = isArray ? i : keys[i];
      retn = func.call(ctx, src[key], key);
      if (retn !== void 0) {
        dest.push(retn);
      }
    }
    return dest;
  },

  map: function(src, func, ctx) {
    var dest = Utils.mapFilter(src, func, ctx);
    if (Utils.isInteger(src.length) && dest.length !== src.length) {
      error("Utils.map() Sparse array; use Utils.mapFilter()");
    }
    return dest;
  },

  // Convert an array-like object to an Array, or make a copy if @obj is an Array
  toArray: function(obj) {
    var arr;
    if (!Utils.isArrayLike(obj)) error("Utils.toArray() requires an array-like object");
    try {
      arr = Array.prototype.slice.call(obj, 0); // breaks in ie8
    } catch(e) {
      // support ie8
      arr = [];
      for (var i=0, n=obj.length; i<n; i++) {
        arr[i] = obj[i];
      }
    }
    return arr;
  },

  // Array like: has length property, is numerically indexed and mutable.
  // TODO: try to detect objects with length property but no indexed data elements
  isArrayLike: function(obj) {
    if (!obj) return false;
    if (Utils.isArray(obj)) return true;
    if (Utils.isString(obj)) return false;
    if (obj.length === 0) return true;
    if (obj.length > 0) return true;
    return false;
  },

  isFunction: function(obj) {
    return typeof obj == 'function';
  },

  isObject: function(obj) {
    return obj === Object(obj); // via underscore
  },

  isArray: function(obj) {
    return obj instanceof Array; // breaks across iframes
    // More robust:
    // return Object.constructor.toString.call(obj) == '[object Array]';
  },

  // NaN -> true
  isNumber: function(obj) {
    // return toString.call(obj) == '[object Number]'; // ie8 breaks?
    return obj != null && obj.constructor == Number;
  },

  isInteger: function(obj) {
    return Utils.isNumber(obj) && ((obj | 0) === obj);
  },

  isString: function(obj) {
    return obj != null && obj.toString === String.prototype.toString;
    // TODO: replace w/ something better.
  },

  isBoolean: function(obj) {
    return obj === true || obj === false;
  },

  clamp: function(val, min, max) {
    return val < min ? min : (val > max ? max : val);
  },

  interpolate: function(val1, val2, pct) {
    return val1 * (1-pct) + val2 * pct;
  },

  getFunctionName: function(f) {
    var matches = String(f).match(/^function ([^(]+)\(/);
    return matches && matches[1] || "";
  },

  // TODO: handle array output and/or multiple arguments
  //
  memoize: function(func, ctx) {
    var index = {},
        memos = 0;
    var f = function(arg) {
      if (arguments.length != 1 || (typeof arg == 'object')) error("[memoize] only works with one-arg functions that take strings or numbers");
      if (arg in index) {
        return index[arg];
      }
      if (memos++ > 1000) { // tweening groups of things might generate lots of values
        index = {};
      }
      return index[arg] = func.call(ctx, arg);
    };
    return f;
  },

  bind: function(func, ctx) {
    return function() {
      return func.apply(ctx, Utils.toArray(arguments));
    };
  },

  log: function(msg) {
    if (Env.inNode) {
      process.stderr.write(msg + '\n'); // node messages to stdout
    }
    else if (typeof console != "undefined" && console.log) {
      if (console.log.call) {
        console.log.call(console, msg); // Required by ____.
      }
      else {
        console.log(msg);
      }
    }
  },

  // Display string representation of an object, for logging, etc.
  // Functions and some objects are converted into a string label.
  //
  toString: function(obj, quoteString) {
    var type = typeof obj,
        str;
    if (type == 'function') {
      str = '"[' + (Utils.getFunctionName(obj) || 'function') + '()]"';
    } else if (obj == null || Utils.isNumber(obj) || Utils.isBoolean(obj)) {
      str = String(obj);
    } else if (Utils.isArray(obj) || obj.byteLength > 0) { // handle typed arrays (with bytelength property)
      str = '[' + Utils.map(obj, function(o) {return Utils.toString(o, true);}).join(', ') + ']';
    } else if (obj.constructor == Object) { // Show properties of Object instances.
      var parts = [];
      for (var key in obj) {
        var keyStr = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : '"' + Utils.addslashes(key) + '"';
        parts.push( keyStr + ':' + Utils.toString(obj[key], true));
      }
      str = '{' + parts.join(', ') + '}';
    } else if (obj.nodeName) { //
      str = '"[' + obj.nodeName + (obj.id ? " id=" + obj.id : "") + ']"';
    }
    // User-defined objects without a toString() method: Try to get function name from constructor function.
    // Can't assume objects have hasOwnProperty() function (e.g. HTML nodes don't in ie <= 8)
    else if (type == 'object' && obj.toString === Object.prototype.toString) {
      str = '"[' + (Utils.getFunctionName(obj.constructor) || "unknown object") + ']"';
    } else {
      // strings and objects with own "toString" methods.
      str = String(obj);
      if (quoteString) {
        str = '"' + Utils.addslashes(str) + '"';
      }
    }
    return str;
  },

  // Convert an object to a string, for logging
  strval: function(o) {
    var str = Utils.toString(o),
        max = 800;
    if (str.length > max) {
      str = str.substr(0, max - 4) + " ...";
    }
    return str;
  },

  // Convert an object to a string that can be parsed as JavaScript
  serialize: function(o) {
    return Utils.toString(o, true);
  },

  // See https://raw.github.com/kvz/phpjs/master/functions/strings/addslashes.js
  addslashes: function(str) {
    return (str + '').replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0');
  },

  /**
   * Escape a literal string to use in a regexp.
   * Ref.: http://simonwillison.net/2006/Jan/20/escape/
   */
  regexEscape: function(str) {
    return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  },

  flatten: function(src) {
    var obj = {};
    for (var k in src) {
      obj[k] = src[k];
    }
    return obj;
  },

  extend: function() {
    var dest = arguments[0] || {},
        src;
    for (var i=1, n=arguments.length; i<n; i++) {
      src = arguments[i];
      if (src) {
        for (var key in src) {
          if (src.hasOwnProperty(key)) {
            dest[key] = src[key];
          }
        }
      }
    }
    return dest;
  }
};

var Opts = {
  copyAllParams: Utils.extend,

  copyNewParams: function(dest, src) {
    for (var k in src) {
      if (k in dest == false && src.hasOwnProperty(k)) {
        dest[k] = src[k];
      }
    }
    return dest;
  },

  // Copy src functions/params to targ prototype
  // changed: overwrite existing properties
  // TODO: replace calls to this with Utils.extend(dest.prototype, ...);
  extendPrototype : function(targ, src) {
    Utils.extend(targ.prototype, Utils.flatten(src.prototype || src));
    targ.prototype.constructor = targ;
  },

  /**
   * Pseudoclassical inheritance
   *
   * Inherit from a Parent function:
   *    Opts.inherit(Child, Parent);
   * Call parent's constructor (inside child constructor):
   *    this.__super__([args...]);
   * Call a parent method (when it has been overriden by a same-named function in Child):
   *    this.__super__.<method_name>.call(this, [args...]);
   */
  inherit: function(targ, src) {
    var f = function() {
      // replaced: // if (this.constructor === targ) {
      if (this.__super__ == f) {
        // add __super__ of parent to front of lookup chain
        // so parent class constructor can call its parent using this.__super__
        this.__super__ = src.prototype.__super__;
        // call parent constructor function. this.__super__ now points to parent-of-parent
        src.apply(this, arguments);
        // remove temp __super__, expose targ.prototype.__super__ again
        delete this.__super__;
      }
    };

    f.prototype = src.prototype || src; // added || src to allow inheriting from objects as well as functions
    // Extend targ prototype instead of wiping it out --
    //   in case inherit() is called after targ.prototype = {stuff}; statement
    targ.prototype = Utils.extend(new f(), targ.prototype); //
    targ.prototype.constructor = targ;
    targ.prototype.__super__ = f;
  },

  // @parent Function to use as parent class
  // ... Additional args extend the child's prototype
  //
  subclass: function(parent) {
    var child = function() {
      var fn = (this.__constructor__ || this.__super__); // constructor function
      fn.apply(this, Utils.toArray(arguments));
    };
    Opts.inherit(child, parent);
    for (var i=1; i<arguments.length; i++) {
      Opts.extendPrototype(child, arguments[i]);
    }
    // set a constructor function, instead of automatically calling parent's constructor
    child.constructor = function(fn) {
      child.prototype.__constructor__ = fn;
      return child;
    };
    return child;
  },

  namespaceExists: function(name) {
    var node = Opts.global();
    var parts = name.split('.');
    var exists = Utils.reduce(parts, function(val, part) {
      if (val !== false) {
        if (node[part] == null) { // match null or undefined
          val = false;
        }
        else {
          node = node[part];
        }
      }
      return val;
    }, true);
    return exists;
  },

  global: function() {
    return (function() {return this})(); // default to window in DOM or global in node
  },

  getNamespace: function(name, root) {
    var node = root || this.global();
    var parts = name.split('.');
    for (var i=0, len=parts.length; i<len; i++) {
      var part = parts[i];
      if (!part) continue;
      if (!node[part]) {
        node[part] = {};
      }
      node = node[part];
    }
    return node;
  },

  readParam : function(param, defaultVal) {
    return param === undefined ? defaultVal : param;
  },

  extendNamespace : function(ns, obj) {
    var nsObj = typeof ns == 'string' ? Opts.getNamespace(ns) : ns;
    Opts.copyAllParams(nsObj, obj);
  },

  exportObject : function(path, obj, root) {
    root = root || this.global();
    var parts = path.split('.'),
        name = parts.pop();
    if (!name) {
      error("Opts.exportObject() Invalid name:", path);
    } else {
      var exp = {};
      exp[name] = obj;
      Opts.extendNamespace(parts.join('.'), exp)
    }
  }
};

var trace = function() {
  if (C.VERBOSE) {
    Utils.log(Utils.map(arguments, Utils.strval).join(' '));
  }
};

var error = function() {
  var msg = Utils.map(arguments, Utils.strval).join(' ');
  throw new Error(msg);
};


// Support for timing using T.start() and T.stop("message")
//
var T = {
  stack: [],
  verbose: true,

  start: function(msg) {
    if (T.verbose && msg) trace(T.prefix() + msg);
    T.stack.push(+new Date);
  },

  // Stop timing, print a message if T.verbose == true
  stop: function(note) {
    var startTime = T.stack.pop();
    var elapsed = (+new Date - startTime);
    if (T.verbose) {
      var msg =  T.prefix() + elapsed + 'ms';
      if (note) {
        msg += " " + note;
      }
      trace(msg);
    }
    return elapsed;
  },

  prefix: function() {
    var str = "- ",
        level = this.stack.length;
    while (level--) str = "-" + str;
    return str;
  }
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

Utils.getComparator = function(ascending) {
  var asc = asc !== false;
  return function(a, b) {
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
};

// Sort array of values that can be compared with < > operators (strings, numbers)
// null, undefined and NaN are sorted to the end of the array
//
Utils.genericSort = function(arr, asc) {
  var compare = Utils.getComparator(asc);
  Array.prototype.sort.call(arr, compare);
  return arr;
};

// Sorts an array of numbers in-place
//
Utils.quicksort = function(arr, asc) {
  Utils.quicksortPartition(arr, 0, arr.length-1);
  if (asc === false) Array.prototype.reverse.call(arr); // Works with typed arrays
  return arr;
};

// Moved out of Utils.quicksort() (saw >100% speedup in Chrome with deep recursion)
Utils.quicksortPartition = function (a, lo, hi) {
  var i = lo,
      j = hi,
      pivot, tmp;
  while (i < hi) {
    pivot = a[lo + hi >> 1]; // avoid n^2 performance on sorted arrays
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
    if (lo < j) Utils.quicksortPartition(a, lo, j);
    lo = i;
    j = hi;
  }
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





Utils.merge = function(dest, src) {
  if (!Utils.isArray(dest) || !Utils.isArray(src)) {
    error("Usage: Utils.merge(destArray, srcArray);")
  }
  if (src.length > 0) {
    dest.push.apply(dest, src);
  }
  return dest;
};

// Returns elements in arr and not in other
// (similar to underscore diff)
Utils.difference = function(arr, other) {
  var index = Utils.arrayToIndex(other);
  return Utils.mapFilter(arr, function(el) {
    return el in index ? void 0: el;
  });
};

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

Utils.some = function(arr, test) {
  return Utils.reduce(arr, function(val, item) {
    return val || test(item); // TODO: short-circuit?
  }, false);
};

Utils.every = function(arr, test) {
  return Utils.reduce(arr, function(val, item) {
    return val && test(item);
  }, true);
};

Utils.find = function(arr, test, ctx) {
  var matches = Utils.filter(arr, test, ctx);
  return matches.length === 0 ? null : matches[0];
};

Utils.indexOf = function(arr, item, prop) {
  if (prop) error("Utils.indexOf() No longer supports property argument");
  var nan = !(item === item);
  for (var i = 0, len = arr.length || 0; i < len; i++) {
    if (arr[i] === item) return i;
    if (nan && !(arr[i] === arr[i])) return i;
  }
  return -1;
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

Utils.range2 = function(start, end, inc) {
  var len = Math.floor((end - start) / inc) + 1;
  return Utils.range(len, start, inc);
};

Utils.repeat = function(times, func) {
  var values = [],
      val;
  for (var i=0; i<times; i++) {
    val = func(i);
    if (val !== void 0) {
      values[i] = val;
    }
  }
  return values.length > 0 ? values : void 0;
};

// Calc sum, skip falsy and NaN values
// Assumes: no other non-numeric objects in array
//
Utils.sum = function(arr, info) {
  if (!Utils.isArrayLike(arr)) error ("Utils.sum() expects an array, received:", arr);
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

Utils.invert = function(obj) {
  var inv = {};
  for (var key in obj) {
    inv[obj[key]] = key;
  }
  return inv;
};

Utils.getKeys = Utils.keys;

Utils.values =
Utils.getValues = function(obj) {
  var arr = [];
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      arr.push(obj[key]);
    }
  }
  return arr;
};

Utils.uniq = function(src) {
  var index = {};
  return Utils.mapFilter(src, function(el) {
    if (el in index === false) {
      index[el] = true;
      return el;
    }
  });
};

Utils.pluck = function(arr, key) {
  return Utils.map(arr, function(obj) {
    return obj[key];
  });
};

Utils.findAll =
Utils.filter = function(arr, func, ctx) {
  return Utils.mapFilter(arr, function(obj, i) {
    if (func.call(ctx, obj, i)) return obj;
  });
};

Utils.filterObject = function(obj, func, ctx) {
  return Utils.reduce(obj, function(memo, val, key) {
    if (func.call(ctx, val, key)) {
      memo[key] = val;
    }
    return memo;
  }, {});
};

Utils.countValues = function(obj) {
  return Utils.reduce(obj, function(memo, val, key) {
    memo[val] = (val in memo) ? memo[val] + 1 : 1;
    return memo;
  }, {});
};


Utils.indexOn = function(arr, k) {
  return Utils.reduce(arr, function(index, o) {
    index[o[k]] = o;
    return index;
  }, {});
};

Utils.groupBy = function(arr, k) {
  return Utils.reduce(arr, function(index, o) {
    var keyval = o[k];
    if (keyval in index) {
      index[keyval].push(o);
    } else {
      index[keyval] = [o]
    }
    return index;
  }, {});
};

Utils.arrayToIndex = function(arr, val) {
  var init = arguments.length > 1;
  return Utils.reduce(arr, function(index, key) {
    if (key in index) {
      trace("#arrayToIndex() Duplicate key:", key);
    }
    index[key] = init ? val : true;
    return index;
  }, {});
};

Utils.forEach = function(obj, func, ctx) {
  Utils.mapFilter(obj, func, ctx);
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
  for (var i=0, len=arr.length; i<len; i++) {
    arr[i] = init;
  }
  return arr;
};

Utils.newArray = function(size, init) {
  return Utils.initializeArray(new Array(size), init);
};

Utils.replaceArray = function(arr, arr2) {
  arr.splice(0, arr.length);
  arr.push.apply(arr, arr2);
};

Utils.randomizeArray = function(arr) {
  var n=arr.length,
      swap, tmp;
  while (n > 0) {
    swap = Math.random() * n | 0;
    tmp = arr[swap];
    arr[swap] = arr[--n];
    arr[n] = tmp;
  }
  return arr;
};





Utils.repeatString = function(src, n) {
  var str = "";
  for (var i=0; i<n; i++)
    str += src;
  return str;
};

Utils.endsWith = function(str, ending) {
    return str.indexOf(ending, str.length - ending.length) !== -1;
};

Utils.lpad = function(str, size, pad) {
  pad = pad || ' ';
  str = String(str);
  return Utils.repeatString(pad, size - str.length) + str;
};

Utils.rpad = function(str, size, pad) {
  pad = pad || ' ';
  str = String(str);
  return str + Utils.repeatString(pad, size - str.length);
};

Utils.trim = function(str) {
  return Utils.ltrim(Utils.rtrim(str));
};

var ltrimRxp = /^\s+/;
Utils.ltrim = function(str) {
  return str.replace(ltrimRxp, '');
};

var rtrimRxp = /\s+$/;
Utils.rtrim = function(str) {
  return str.replace(rtrimRxp, '');
};

Utils.lreplace = function(str, word) {
  if (str.indexOf(word) == 0) {
    str = str.substr(word.length);
  }
  return str;
};

Utils.capitalizeWord = function(w) {
  return w ? w.charAt(0).toUpperCase() + w.substr(1) : '';
};

Utils.addThousandsSep = function(str) {
  var fmt = '',
      start = str[0] == '-' ? 1 : 0,
      dec = str.indexOf('.'),
      end = str.length,
      ins = (dec == -1 ? end : dec) - 3;
  while (ins > start) {
    fmt = ',' + str.substring(ins, end) + fmt;
    end = ins;
    ins -= 3;
  }
  return str.substring(0, end) + fmt;
};

Utils.numToStr = function(num, decimals) {
  return decimals >= 0 ? num.toFixed(decimals) : String(num);
};

Utils.formatNumber = function(num, decimals, nullStr, showPos) {
  var fmt;
  if (isNaN(num)) {
    fmt = nullStr || '-';
  } else {
    fmt = Utils.numToStr(num, decimals);
    fmt = Utils.addThousandsSep(fmt);
    if (showPos && parseFloat(fmt) > 0) {
      fmt = "+" + fmt;
    }
  }
  return fmt;
};




function Handler(type, target, callback, listener, priority) {
  this.type = type;
  this.callback = callback;
  this.listener = listener || null;
  this.priority = priority || 0;
  this.target = target;
}

Handler.prototype.trigger = function(evt) {
  if (!evt) {
    evt = new EventData(this.type);
    evt.target = this.target;
  } else if (evt.target != this.target || evt.type != this.type) {
    error("[Handler] event target/type have changed.");
  }
  this.callback.call(this.listener, evt);
}

function EventData(type, target, data) {
  this.type = type;
  this.target = target;
  if (data) {
    Opts.copyNewParams(this, data);
    this.data = data;
  }
}

EventData.prototype.stopPropagation = function() {
  this.__stop__ = true;
};

EventData.prototype.__stop__ = false;

EventData.prototype.toString = function() {
  var str = 'type:' + this.type + ', target: ' + Utils.toString(this.target);
  if (this.data) {
    str += ', data:' + Utils.toString(this.data);
  }
  return '[EventData]: {' + str + '}';
};

/**
 * Base class for objects that dispatch events; public methods:
 *   addEventListener() / on()
 *   removeEventListener()
 *   dispatchEvent() / trigger()
 */
function EventDispatcher() {}

/**
 * Dispatch an event (i.e. all registered event handlers are called).
 * @param {string} type Name of the event type, e.g. "change".
 * @param {object=} obj Optional data to send with the event.
 */
EventDispatcher.prototype.dispatchEvent = function(type, obj, listener) {
  var evt;
  // TODO: check for bugs if handlers are removed elsewhere while firing
  var handlers = this._handlers;
  if (handlers) {
    for (var i = 0, len = handlers.length; i < len; i++) {
      var handler = handlers[i];
      if (handler.type == type && (!listener || listener == handler.listener)) {
        if (!evt) {
          evt = new EventData(type, this, obj);
        }
        else if (evt.__stop__) {
            break;
        }
        handler.trigger(evt);
      }
    }
  }
};

/**
 * Register an event handler for a named event.
 * @param {string} type Name of the event.
 * @param {function} callback Event handler, called with BoundEvent argument.
 * @param {*} context Execution context of the event handler.
 * @param {number} priority Priority of the event; defaults to 0.
 * removed * @return True if handler added, else false.
 */
EventDispatcher.prototype.addEventListener =
EventDispatcher.prototype.on = function(type, callback, context, priority) {
  context = context || this;
  priority = priority || 0;
  var handler = new Handler(type, this, callback, context, priority);

  // experimental: add_eventtype event
  if (this.countEventListeners(type) === 0) this.dispatchEvent("add_" + type);

  // Insert the new event in the array of handlers according to its priority.
  //
  var handlers = this._handlers || (this._handlers = []);
  var i = handlers.length;
  while(--i >= 0 && handlers[i].priority < handler.priority) {}
  handlers.splice(i+1, 0, handler);
  return this;
};


EventDispatcher.prototype.countEventListeners = function(type) {
  var handlers = this._handlers,
    len = handlers && handlers.length || 0,
    count = 0;
  if (!type) return len;
  for (var i = 0; i < len; i++) {
    if (handlers[i].type === type) count++;
  }
  return count;
};

/**
 * Remove an event handler.
 * @param {string} type Event type to match.
 * @param {function(BoundEvent)} callback Event handler function to match.
 * @param {*=} context Execution context of the event handler to match.
 * @return {number} Returns number of handlers removed (expect 0 or 1).
 */
EventDispatcher.prototype.removeEventListener = function(type, callback, context) {
  context = context || this;
  var count = this.removeEventListeners(type, callback, context);
  if (type && this.countEventListeners(type) === 0) this.dispatchEvent("remove_" + type);
  return count;
};

/**
 * Remove event handlers that match function arguments.
 * @param {string=} type Event type to match.
 * @param {function(BoundEvent)=} callback Event handler function to match.
 * @param {*=} context Execution context of the event handler to match.
 * @return {number} Number of handlers removed.
 */
// TODO: remove this: too convoluted. Need other way to remove listeners by type
EventDispatcher.prototype.removeEventListeners =
  function(type, callback, context) {
  var handlers = this._handlers;
  var newArr = [];
  var count = 0;
  for (var i = 0; handlers && i < handlers.length; i++) {
    var evt = handlers[i];
    if ((!type || type == evt.type) &&
      (!callback || callback == evt.callback) &&
      (!context || context == evt.listener)) {
      count += 1;
    }
    else {
      newArr.push(evt);
    }
  }
  this._handlers = newArr;
  return count;
};




var inNode = typeof module !== 'undefined' && !!module.exports;
var Node = {
  inNode: inNode,
  arguments: inNode ? process.argv.slice(1) : null // remove "node" from head of argv list
};

/**
 * Convenience functions for working with files and loading data.
 */
if (inNode) {
  Node.fs = require('fs');
  Node.path = require('path');

  Node.gc = function() {
    global.gc && global.gc();
  };

  Node.statSync = function(fpath) {
    var obj = null;
    try {
      obj = Node.fs.statSync(fpath);
    }
    catch(e) {
      //trace(e, fpath);
    }
    return obj;
  };


  Node.walkSync = function(dir, results) {
    results = results || [];
    var list = Node.fs.readdirSync(dir);
    Utils.forEach(list, function(file) {
      var path = dir + "/" + file;
      var stat = Node.statSync(path);
      if (stat && stat.isDirectory()) {
        Node.walkSync(path, results);
      }
      else {
        results.push(path);
      }
    });
    return results;
  };


  Node.toBuffer = function(src) {
    var buf;
    if (src instanceof ArrayBuffer) {
      buf = new Buffer(src.byteLength);
      for (var i = 0, n=buf.length; i < n; i++) {
        buf[i] = src[i]; // in Node, ArrayBuffers can be read like this
      }
    } else if (src instanceof Buffer) {
      buf = src;
    } else {
      error ("Node#toBuffer() unsupported input:", src);
    }
    return buf;
  };

  Node.shellExec = function(cmd) {
    var parts = cmd.split(/[\s]+/); // TODO: improve, e.g. handle quoted strings w/ spaces
    var spawn = require('child_process').spawn;
    spawn(parts[0], parts.slice(1), {stdio: "inherit"});
  };

  // Converts relative path to absolute path relative to the node script;
  // absolute paths returned unchanged
  //
  Node.resolvePathFromScript = function(path) {
    if (Node.pathIsAbsolute(path))
      return path;
    var scriptDir = Node.getFileInfo(require.main.filename).directory;
    return Node.path.join(scriptDir, path);
  };

  Node.resolvePathFromShell = function(path) {
    if (Node.pathIsAbsolute(path))
      return path;
    return Node.path.join(process.cwd(), path);
  };

  Node.pathIsAbsolute = function(path) {
    return (path[0] == '/' || path[0] == "~");
  };

  Node.dirExists = function(path) {
    var ss = Node.statSync(path);
    return ss && ss.isDirectory() || false;
  };

  Node.fileExists = function(path) {
    var ss = Node.statSync(path);
    return ss && ss.isFile() || false;
  };

  Node.parseFilename = function(fpath) {
    // TODO: give better output if fpath is a directory
    var info = {};
    var filename = Node.path.basename(fpath);
    if (/[\\/]$/.test(filename)) {
      filename = filename.substr(0, filename.length-1);
    }
    info.file = filename;
    info.path = Node.path.resolve(fpath);
    info.ext = Node.path.extname(fpath).toLowerCase().slice(1);
    info.base = info.ext.length > 0 ? info.file.slice(0, -info.ext.length - 1) : info.file;
    info.directory = Node.path.dirname(info.path);
    info.relative_dir = Node.path.dirname(fpath);
    return info;
  };

  Node.getFileInfo = function(fpath) {
    var info = Node.parseFilename(fpath),
        stat;
    Opts.copyAllParams(info, {exists: true, is_directory: false, is_file: false});
    if (stat = Node.statSync(fpath)) {
      if (stat.isFile()) {
        info.is_file = true;
      } else if (stat.isDirectory()) {
        info.is_directory = true;
      } else {
        // ighore other filesystem entities, e.g. devices
        info.exists = false;
      }
    }
    return info;
  };

  // @charset (optional) e.g. 'utf8'
  // returns string or Buffer if no charset is provided.
  //
  Node.readFile = function(fname, charset) {
    return Node.fs.readFileSync(fname, charset || void 0);
  };

  Node.writeFile = function(path, content) {
    if (content instanceof ArrayBuffer) {
      content = Node.toBuffer(content);
    }
    Node.fs.writeFileSync(path, content, 0, null, 0);
  };

  Node.copyFile = function(src, dest) {
    if (!Node.fileExists(src)) error("[copyFile()] File not found:", src);
    var content = Node.fs.readFileSync(src);
    Node.fs.writeFileSync(dest, content);
  };

  Node.post = function(url, data, callback, opts) {
    opts = opts || {};
    opts.method = 'POST';
    opts.data = data;
    Node.request(url, callback, opts);
  }

  Node.readResponse = function(res, callback, encoding) {
    res.setEncoding(encoding || 'utf8');
    var content = '';
    res.on('data', function(chunk) {
      content += chunk;
    });
    res.on('end', function() {
      callback(null, res, content);
    });
  }

  // Current signature: function(opts, callback), like Node.js request module
  //    callback: function(err, response, body)
  //
  Node.request = function(opts, callback) {
    if (Utils.isString(opts)) { // @opts is string -> assume url & old interface
      error("Node.request(opts, callback) No longer accepts a url string. Pass url as a property of opts.");
    }

    if (!opts.url) error("Node.request() Missing url in options:", opts);

    var receive = callback;

    var o = require('url').parse(opts.url),
        data = null,
        // moduleName: http or https
        moduleName = opts.protocol || o.protocol.slice(0, -1); // can override protocol (e.g. request https:// url using http)

    if (moduleName != 'http' && moduleName != 'https') error("Node.request() Unsupported protocol:", o.protocol);
    var reqOpts = {
      host: o.hostname,
      hostname: o.hostname,
      path: o.path,
      //port: o.port || module == 'https' && 443 || 80,
      method: opts.method || 'GET',
      headers: opts.headers || null
    };

    if (reqOpts.method == 'POST' || reqOpts.method == 'PUT') {
      data = opts.data || opts.body || '';
      reqOpts.headers = Utils.extend({
        'Content-Length': data.length,
        'Connection': 'close',
        'Accept-Encoding': 'identity'
      }, reqOpts.headers);
    }

    var req = require(moduleName).request(reqOpts);
    req.on('response', function(res) {
      if (res.statusCode > 201) {
        receive("Node.request() Unexpected status: " + res.statusCode + " url: " + opts.url, res, null);
      } else {
        Node.readResponse(res, receive, 'utf8');
      }
    });

    req.on('error', function(e) {
      // trace("Node.request() request error:", e.message);
      receive("Node.request() error: " + e.message, null, null);
    });
    req.end(data);
  };

  Node.atob = function(b64string) {
    return new Buffer(b64string, 'base64').toString('binary')
  };

  Node.readJson = function(url, callback, opts) {
    var retn = opts && opts.data || null;
    /*
    opts = {
      headers: {
        'Accept-Encoding': 'identity',
        'Accept-Charset': 'ISO-8859-1,utf-8;q=0.7,*;q=0.3',
        'Connection': 'keep-alive',
        'Cache-control': 'max-age=0',
        'User-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_3) AppleWebKit/537.31 (KHTML, like Gecko) Chrome/26.0.1410.43 Safari/537.31'
      }
    }*/

    Node.request({url: url}, function(err, req, str) {
      var data = null;
      if (err) {
        trace("Node.readJson() error:", err);
      } else if (!str) {
        trace("Node.readJson() empty response()");
      } else {
        try {
          // handle JS callback
          if (match = /^\s*([\w.-]+)\(/.exec(str)) {
            var ctx = {};
            Opts.exportObject(match[1], function(o) {return o}, ctx);
            with (ctx) {
              data = eval(str);
            }
          } else {
            data = JSON.parse(str); // no callback: assume valid JSON
          }
        } catch(e) {
          trace("Node#readJson() Error reading from url:", url,"response:", str);
          error(e);
        }
      }
      callback(data, retn);
    });

  };

  // super-simple options, if not using optimist
  Node.options = function(o) {
    o = o || {};
    var opts = {_:[]},
        flags = (o.flags || o.binary || '').split(','),
        currOpt;

    var aliases = Utils.reduce((o.aliases || "").split(','), function(obj, item) {
        var parts = item.split(':');
        if (parts.length == 2) {
          obj[parts[0]] = parts[1];
          obj[parts[1]] = parts[0];
        }
        return obj;
      }, {});

    function setOpt(opt, val) {
      opts[opt] = val;
      var alias = aliases[opt];
      if (alias) {
        opts[alias] = val;
      }
    }


    Node.arguments.slice(1).forEach(function(arg) {
      var match, alias, switches;
      if (arg[0] == '-') {
        currOpt = null; // handle this as an error
        if (match = /^--(.*)/.exec(arg)) {
          switches = [match[1]];
        }
        else if (match = /^-(.+)/.exec(arg)) {
          switches = match[1].split('');
        }
        Utils.forEach(switches, function(opt) {
          if (Utils.contains(flags, opt)) {
            setOpt(opt, true);
          } else {
            currOpt = opt;
          }
        });
      }
      else if (currOpt) {
        setOpt(currOpt, Utils.isNumber(arg) ? parseFloat(arg) : arg);
        currOpt = null;
      }
      else {
        opts._.push(arg);
      }
    });
    opts.argv = opts._;
    return opts;
  };
}





Utils.loadBinaryData = function(url, callback) {
  // TODO: throw error if ajax or arraybuffer not available
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'arraybuffer';
  xhr.onload = function(e) {
    callback(this.response);
  };
  xhr.send();
};




var pageEvents = (new function() {
  var useAttachEvent = typeof window != 'undefined' && !!window.attachEvent && !window.addEventListener,
      index = {};

  function __getNodeListeners(el) {
    var id = __getNodeKey(el);
    var listeners = index[id] || (index[id] = []);
    return listeners;
  }

  function __removeDOMListener(el, type, func) {
    if (useAttachEvent) {
      el.detachEvent('on' + type, func);
    }
    else {
      el.removeEventListener(type, func, false);
    }
  }

  function __findNodeListener(listeners, type, func, ctx) {
    for (var i=0, len = listeners.length; i < len; i++) {
      var evt = listeners[i];
      if (evt.type == type && evt.callback == func && evt.listener == ctx) {
        return i;
      }
    }
    return -1;
  };

  function __getNodeKey(el) {
    if (!el) {
      return '';
    } else if (el == window) {
      return '#';
    }
    return el.__evtid__ || (el.__evtid__ = Utils.getUniqueName());
  }

  this.addEventListener = function(el, type, func, ctx) {
    if (!el) {
      error("addEventListener() missing element");
    } else if (Utils.isString(el)) { // if el is a string, treat as id
      el = Browser.getElement(el);
    }
    if (useAttachEvent && el === window &&
        'mousemove,mousedown,mouseup,mouseover,mouseout'.indexOf(type) != -1) {
      trace("[page-events.js] In ie8-, window doesn't support mouse events");
    }
    var listeners = __getNodeListeners(el);
    if (listeners.length > 0) {
      if (__findNodeListener(listeners, type, func, ctx) != -1) {
        return;
      }
    }

    //var evt = new BoundEvent(type, el, func, ctx);
    var evt = new Handler(type, el, func, ctx);
    var handler = function(e) {
      // ie8 uses evt argument and window.event (different objects), no evt.pageX
      // chrome uses evt arg. and window.event (same obj), has evt.pageX
      // firefox uses evt arg, window.event === undefined, has evt.pageX
      // touch events
      /// if (!e || !(e.pageX || e.touches)) {
      if (!e || Browser.ieVersion <= 8) {
        var evt = e || window.event;
        e = {
          target : evt.srcElement,
          relatedTarget : type == 'mouseout' && evt.toElement || type == 'mouseover' && evt.fromElement || null,
          currentTarget : el
        };

        if (evt.clientX !== void 0) {
          // http://www.javascriptkit.com/jsref/event.shtml
          // pageX: window.pageXOffset+e.clientX
          // pageY: window.pageYOffset+e.clientY
          e.pageX = evt.pageX || evt.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
          e.pageY = evt.pageY || evt.clientY + document.body.scrollTop + document.documentElement.scrollTop;
        }
        // TODO: add other event properties && methods, e.g. preventDefault, stopPropagation, etc.
      }

      // Ignoring mouseover and mouseout events between child elements
      if (type == 'mouseover' || type == 'mouseout') {

        var rel = e.relatedTarget;
        while (rel && rel != el && rel.nodeName != 'BODY') {
          rel = rel.parentNode;
        }
        if (rel == el) {
          return;
        }
        if (el == window && e.relatedTarget != null) {
          return;
        }
      }

      var retn = func.call(ctx, e);
      if (retn === false) {
        trace("[Browser] Event handler blocking event:", type);
        e.preventDefault && e.preventDefault();
      }
      return retn;
    };
    evt.handler = handler;

    // handle window load if already loaded
    // TODO: test this
    if (el == window && type == 'load' && document.readyState == 'complete') {
      evt.trigger();
      return;
    }

    listeners.push(evt);

    if (useAttachEvent) {
      el.attachEvent('on' + type, handler);
    }
    else {
      el.addEventListener(type, handler, false);
    }
  };

  this.removeEventListener = function(el, type, func, ctx) {
    var listeners = __getNodeListeners(el);
    var idx = __findNodeListener(listeners, type, func, ctx);
    if (idx == -1) {
      return;
    }
    var evt = listeners[idx];
    __removeDOMListener(el, type, evt.handler);
    listeners.splice(idx, 1);
  };
});





var Browser = {

  getIEVersion: function() {
    return this.ieVersion;
  },

  /*getPageWidth: function() {
   return document.documentElement.clientWidth || document.body.clientWidth;
  },*/

  getViewportWidth: function() {
    return document.documentElement.clientWidth;
  },

  getViewportHeight: function() {
    return document.documentElement.clientHeight;
  },

  createElement: function(type, css, classes) {
    try {
      var el = document.createElement(type);
    }
    catch (err) {
      trace("[Browser.createElement()] Error creating element of type:", type);
      return null;
    }

    if (type.toLowerCase() == 'canvas' && window.CanvasSwf) {
      CanvasSwf.initElement(el);
    }

    if (css) {
      el.style.cssText = css;
    }

    if (classes) {
      el.className = classes;
    }
    return el;
  },

  /**
   * Return: HTML node reference or null
   * Receive: node reference or id or "#" + id
   */
  getElement: function(ref) {
    var el;
    if (typeof ref == 'string') {
      if (ref.charAt(0) == '#') {
        ref = ref.substr(1);
      }
      if (ref == 'body') {
        el = document.getElementsByTagName('body')[0];
      }
      else {
        el = document.getElementById(ref);
      }
    }
    else if (ref && ref.nodeType !== void 0) {
      el = ref;
    }
    return el || null;
  },

  removeElement: function(el) {
    el && el.parentNode && el.parentNode.removeChild(el);
  },

  getElementStyle: function(el) {
    return el.currentStyle || window.getComputedStyle && window.getComputedStyle(el, '') || {};
  },

  elementIsFixed: function(el) {
    // get top-level offsetParent that isn't body (cf. Firefox)
    var body = document.body;
    while (el && el != body) {
      var parent = el;
      el = el.offsetParent;
    }

    // Look for position:fixed in the computed style of the top offsetParent.
    // var styleObj = parent && (parent.currentStyle || window.getComputedStyle && window.getComputedStyle(parent, '')) || {};
    var styleObj = parent && Browser.getElementStyle(parent) || {};
    return styleObj['position'] == 'fixed';
  },

  getElementFromPageXY: function(x, y) {
    var viewX = this.pageXToViewportX(x);
    var viewY = this.pageYToViewportY(y);
    return document.elementFromPoint(viewX, viewY);
  },

  getLocalXY: function(el, pageX, pageY) {
    var xy = Browser.getPageXY(el);
    return {
      x: pageX - xy.x,
      y: pageY - xy.y
    };
  },

  getPageXY: function(el) {
    var x = 0, y = 0;
    if (el.getBoundingClientRect) {
      var box = el.getBoundingClientRect();
      x = box.left - Browser.pageXToViewportX(0);
      y = box.top - Browser.pageYToViewportY(0);
      //trace("[] box.left:", box.left, "box.top:", box.top);
    }
    else {
      var fixed = Browser.elementIsFixed(el);

      while (el) {
        x += el.offsetLeft || 0;
        y += el.offsetTop || 0;
        //Utils.trace("[el] id:", el.id, "class:", el.className, "el:", el, "offsLeft:", el.offsetLeft, "offsTop:", el.offsetTop);
        el = el.offsetParent;
      }

      if (fixed) {
        var offsX = -Browser.pageXToViewportX(0);
        var offsY = -Browser.pageYToViewportY(0);
        //Utils.trace("[fixed]; offsX:", offsX, "offsY:", offsY, "x:", x, "y:", y);
        x += offsX;
        y += offsY;
      }
    }

    var obj = {x:x, y:y};
    return obj;
  },

  // reference: http://stackoverflow.com/questions/871399/cross-browser-method-for-detecting-the-scrolltop-of-the-browser-window
  __getIEPageElement: function() {
    var d = document.documentElement;
    return d.clientHeight ? d: document.body;
  },

  pageXToViewportX: function(x) {
    var xOffs = window.pageXOffset;
    if (xOffs === undefined) {
      xOffs = Browser.__getIEPageElement().scrollLeft;
    }
    return x - xOffs;
  },

  pageYToViewportY: function(y) {
    var yOffs = window.pageYOffset;
    if (yOffs === undefined) {
      yOffs = Browser.__getIEPageElement().scrollTop;
    }
    return y - yOffs;
  },

  /**
   *  Add a DOM event handler.
   */
  addEventListener: pageEvents.addEventListener,
  on: pageEvents.addEventListener,

  /**
   *  Remove a DOM event handler.
   */
  removeEventListener: pageEvents.removeEventListener,

  getPageUrl: function() {
    return Browser.inNode ? "": window.location.href.toString();
  },

  getQueryString: function(url) {
    var match = /^[^?]+\?([^#]*)/.exec(url);
    return match && match[1] || "";
  },

  /**
   *  Add a query variable to circumvent browser caching.
   *  Value is calculated from UTC minutes, so the server does not see a large
   *  number of different values.
   */
  cacheBustUrl: function(url, minutes) {
    return Browser.extendUrl(url, "c=" + Browser.getCacheBustString(minutes));
  },

  getCacheBustString: function(minutes) {
    minutes = minutes || 1; // default: 60 seconds
    var k = 1;
    if (minutes < 1) {
      k = 60;
      minutes *= k;
    }
    var minPerWeek = 60*24*7 * k,
        utcMinutes = (+new Date) / 60000;
    return String(Math.round((utcMinutes % minPerWeek) / minutes));
  },

  extendUrl: function(url, obj) {
    var extended = url + (url.indexOf("?") == -1 ? "?": "&");
    if (Utils.isString(obj)) {
      extended += obj;
    } else if (Utils.isObject(obj)) {
      var parts = [];
      Utils.forEach(obj, function(val, key) {
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(val));
      });
      extended += parts.join('&');
    } else {
      error("Argument must be string or object");
    }
    return extended;
  },

  parseUrl: Utils.parseUrl,
  /**
   * Return query-string (GET) data as an object.
   */
  getQueryVars: function() {
    var matches, rxp = /([^=&]+)=?([^&]*)/g,
      q = this.getQueryString(this.getPageUrl()),
      vars = {};
    while (matches = rxp.exec(q)) {
      //vars[matches[1]] = unescape(matches[2]);
      // TODO: decode keys?
      vars[matches[1]] = decodeURIComponent(matches[2]);
    }
    return vars;
  },

  getQueryVar: function(name) {
    return Browser.getQueryVars()[name];
  },

  getHashString: function() {

  },

  setHashString: function(arg) {

  },

  /**
   * TODO: memoize?
   */
  getClassNameRxp: function(cname) {
    return new RegExp("(^|\\s)" + cname + "(\\s|$)");
  },

  hasClass: function(el, cname) {
    var rxp = this.getClassNameRxp(cname);
    return el && rxp.test(el.className);
  },

  addClass: function(el, cname) {
    var classes = el.className;
    if (!classes) {
      classes = cname;
    }
    else if (!this.hasClass(el, cname)) {
      classes = classes + ' ' + cname;
    }
    el.className = classes;
  },

  removeClass: function(el, cname) {
    var rxp = this.getClassNameRxp(cname);
    el.className = el.className.replace(rxp, "$2");
  },

  replaceClass: function(el, c1, c2) {
    var r1 = this.getClassNameRxp(c1);
    el.className = el.className.replace(r1, '$1' + c2 + '$2');
  },

  mergeCSS: function(s1, s2) {
    var div = this._cssdiv;
    if (!div) {
      div = this._cssdiv = Browser.createElement('div');
    }
    div.style.cssText = s1 + ";" + s2; // extra ';' for ie, which may leave off final ';'
    return div.style.cssText;
  },

  addCSS: function(el, css) {
    el.style.cssText = Browser.mergeCSS(el.style.cssText, css);
  },

  unselectable: function(el) {
    var noSel = "-webkit-user-select:none;-khtml-user-select:none;-moz-user-select:none;-moz-user-focus:ignore;-o-user-select:none;user-select: none;";
    noSel += "-webkit-tap-highlight-color: rgba(0,0,0,0);"
    //div.style.cssText = Browser.mergeCSS(div.style.cssText, noSel);
    Browser.addCSS(el, noSel);
    el.onselectstart = function(e){
      e && e.preventDefault();
      return false;
    };
  },

  undraggable: function(el) {
    el.ondragstart = function(){return false;};
    el.draggable = false;
  },

  /**
   *  Loads a css file and applies it to the current page.
   */
  loadStylesheet: function(cssUrl) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = cssUrl;
    Browser.appendToHead(link);
  },

  appendToHead: function(el) {
    var head = document.getElementsByTagName("head")[0];
    head.appendChild(el);
  },

  /**
   * TODO: Option to supply a "target" attribute for opening in another window.
   */
  //navigateToURL: function(url) {
  navigateTo: function(url) {
    window.location.href = url;
  }

};

Browser.onload = function(handler, ctx) {
  Browser.on(window, 'load', handler, ctx); // handles case when page is already loaded.
};

C.VERBOSE = !Env.inBrowser || Browser.getQueryVar('debug') != null;

// Add environment information to Browser
//
Opts.copyAllParams(Browser, Env);




var classSelectorRE = /^\.([\w-]+)$/,
    idSelectorRE = /^#([\w-]+)$/,
    tagSelectorRE = /^[\w-]+$/,
    tagOrIdSelectorRE = /^#?[\w-]+$/;

function Elements(sel) {
  if ((this instanceof Elements) == false) {
    return new Elements(sel);
  }
  this.elements = [];
  this.select(sel);
  this.tmp = new El();
}

Elements.prototype = {
  size: function() {
    return this.elements.length;
  },

  select: function(sel) {
    this.elements = Elements.__select(sel);
    return this;
  },

  addClass: function(className) {
    this.forEach(function(el) { el.addClass(className); });
    return this;
  },

  removeClass: function(className) {
    this.forEach(function(el) { el.removeClass(className); })
    return this;
  },

  forEach: function(callback, ctx) {
    var tmp = this.tmp;
    for (var i=0, len=this.elements.length; i<len; i++) {
      tmp.el = this.elements[i];
      callback.call(ctx, tmp, i);
    }
    return this;
  }
};

Elements.__select = function(selector, root) {
  root = root || document;
  var els;
  if (classSelectorRE.test(selector)) {
    els = Elements.__getElementsByClassName(RegExp.$1, root);
  }
  else if (tagSelectorRE.test(selector)) {
    els = root.getElementsByTagName(selector);
  }
  else if (document.querySelectorAll) {
    try {
      els = root.querySelectorAll(selector)
    } catch (e) {
      error("Invalid selector:", selector);
    }
  }
  else if (Browser.ieVersion() < 8) {
    els = Elements.__ie7QSA(selector, root);
  } else {
    error("This browser doesn't support CSS query selectors");
  }
  //return Array.prototype.slice.call(els);
  return Utils.toArray(els);
}

Elements.__getElementsByClassName = function(cname, node) {
  if (node.getElementsByClassName) {
    return node.getElementsByClassName(cname);
  }
  var a = [];
  var re = new RegExp('(^| )'+cname+'( |$)');
  var els = node.getElementsByTagName("*");
  for (var i=0, j=els.length; i<j; i++)
    if (re.test(els[i].className)) a.push(els[i]);
  return a;
};

Elements.__ie7QSA = function(selector, root) {
  var styleTag = Browser.createElement('STYLE');
  Browser.appendToHead(styleTag);
  document.__qsaels = [];
  styleTag.styleSheet.cssText = selector + "{x:expression(document.__qsaels.push(this))}";
  window.scrollBy(0, 0);
  var els = document.__qsaels;
  Browser.removeElement(styleTag);

  if (root != document) {
    els = Utils.filter(els, function(node) {
      while (node && node != root) {
        node = node.parentNode;
      }
      return !!node;
    });
  }
  return els;
};

// Converts dash-separated names (e.g. background-color) to camelCase (e.g. backgroundColor)
// Doesn't change names that are already camelCase
//
El.toCamelCase = function(str) {
  var cc = str.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase() });
  return cc;
};

El.fromCamelCase = function(str) {
  var dashed = str.replace(/([A-Z])/g, "-$1").toLowerCase();
  return dashed;
};

El.setStyle = function(el, name, val) {
  var jsName = Element.toCamelCase(name);
  if (el.style[jsName] == void 0) {
    trace("[Element.setStyle()] css property:", jsName);
    return;
  }
  var cssVal = val;
  if (isFinite(val)) {
    cssVal = String(val); // problem if converted to scientific notation
    if (jsName != 'opacity' && jsName != 'zIndex') {
      cssVal += "px";
    }
  }
  el.style[jsName] = cssVal;
}

El.findAll = function(sel, root) {
  return Elements.__select(sel, root);
};

function El(ref) {
  if (!ref) error("Element() needs a reference");
  if (ref instanceof El) {
    return ref;
  }
  else if (this instanceof El === false) {
    return new El(ref);
  }

  var node;
  if (Utils.isString(ref)) {
    if (El.isHTML(ref)) {
      var parent = El('div').html(ref).node();
      node = parent.childNodes.length  == 1 ? parent.childNodes[0] : parent;
    } else if (tagOrIdSelectorRE.test(ref)) {
      node = Browser.getElement(ref) || Browser.createElement(ref); // TODO: detect type of argument
    } else {
      node = Elements.__select(ref)[0];
    }
  } else if (ref.tagName) {
    node = ref;
  }
  if (!node) error("Unmatched element selector:", ref);
  this.el = node;
}

Opts.inherit(El, EventDispatcher); //

El.removeAll = function(sel) {
  var arr = Elements.__select(sel);
  Utils.forEach(arr, function(el) {
    El(el).remove();
  });
};

El.isHTML = function(str) {
  return str && str[0] == '<'; // TODO: improve
};

Utils.extend(El.prototype, {

  clone: function() {
    var el = this.el.cloneNode(true);
    if (el.nodeName == 'SCRIPT') {
      // Assume scripts are templates and convert to divs, so children
      //    can
      el = El('div').addClass(el.className).html(el.innerHTML).node();
    }
    el.id = Utils.getUniqueName();
    this.el = el;
    return this;
  },

  node: function() {
    return this.el;
  },

  width: function() {
   return this.el.offsetWidth;
  },

  height: function() {
    return this.el.offsetHeight;
  },

  top: function() {
    return this.el.offsetTop;
  },

  left: function() {
    return this.el.offsetLeft;
  },

  // Apply inline css styles to this Element, either as string or object.
  //
  css: function(css, val) {
    if (val != null) {
      El.setStyle(this.el, css, val);
    }
    else if (Utils.isString(css)) {
      Browser.addCSS(this.el, css);
    }
    else if (Utils.isObject(css)) {
      Utils.forEach(css, function(val, key) {
        El.setStyle(this.el, key, val);
      }, this);
    }
    return this;
  },

  attr: function(obj, value) {
    if (Utils.isString(obj)) {
      if (arguments.length == 1) {
        return this.el.getAttribute(obj);
      }
      this.el[obj] = value;
    }
    else if (!value) {
      Opts.copyAllParams(this.el, obj);
    }
    return this;
  },


  remove: function(sel) {
    this.el.parentNode && this.el.parentNode.removeChild(this.el);
    return this;
  },

  removeRight: function() {
    var right;
    trace(">>> removeRight()")
    while (right = this.nextSibling()) {
      trace("removing a sibling:", right.el);
      right.remove();
    }
    return this;
  },

  // TODO: destroy() // removes from dom, removes event listeners

  addClass: function(className) {
    Browser.addClass(this.el, className);
    return this;
  },

  removeClass: function(className) {
    Browser.removeClass(this.el, className);
    return this;
  },

  hasClass: function(className) {
    return Browser.hasClass(this.el, className);
  },

  toggleClass: function(cname) {
    if (this.hasClass(cname)) {
      this.removeClass(cname);
    } else {
      this.addClass(cname);
    }
  },

  computedStyle: function() {
    return Browser.getElementStyle(this.el);
  },

  visible: function() {
    if (this._hidden !== undefined) {
      return !this._hidden;
    }
    var style = this.computedStyle();
    return style.display != 'none' && style.visibility != 'hidden';
  },

  showCSS: function(css) {
    if (!css) {
      return this._showCSS || "display:block;";
    }
    this._showCSS = css;
    return this;
  },

  hideCSS: function(css) {
    if (!css) {
      return this._hideCSS || "display:none;";
    }
    this._hideCSS = css;
    return this;
  },

  hide: function(css) {
    if (this.visible()) {
      // var styles = Browser.getElementStyle(this.el);
      // this._display = styles.display;
      this.css(css || this.hideCSS());
      this._hidden = true;
    }
    return this;
  },

  show: function(css) {
    if (!this.visible()) {
      this.css(css || this.showCSS());
      this._hidden = false;
    }
    return this;
  },

  init: function(callback) {
    if (!this.el['data-el-init']) {
      callback(this);
      this.el['data-el-init'] = true;
    }
    return this;
  },

  html: function(html) {
    if (arguments.length == 0) {
      return this.el.innerHTML;
    } else {
      this.el.innerHTML = html;
      return this;
    }
  },

  text: function(obj) {
    if (Utils.isArray(obj)) {
      for (var i=0, el = this; i<obj.length && el; el=el.sibling(), i++) {
        el.text(obj[i]);
      }
    } else {
      this.html(obj);
    }
    return this;
  },

  // Shorthand for attr('id', <name>)
  id: function(id) {
    if (id) {
      this.el.id = id;
      return this;
    }
    return this.el.id;
  },

  findChild: function(sel) {
    var node = Elements.__select(sel, this.el)[0];
    if (!node) error("Unmatched selector:", sel);
    return new El(node);
  },

  appendTo: function(ref) {
    var parent = ref instanceof El ? ref.el : Browser.getElement(ref);
    if (this._sibs) {
      for (var i=0, len=this._sibs.length; i<len; i++) {
        parent.appendChild(this._sibs[i]);
      }
    }
    parent.appendChild(this.el);
    return this;
  },

  /**
   * Called with tagName: create new El as sibling of this El
   * No argument: traverse to next sibling
   */
  sibling: function(arg) {
    trace("Use newSibling or nextSibling instead of El.sibling()")
    return arg ? this.newSibling(arg) : this.nextSibling();
  },

  nextSibling: function() {
    return this.el.nextSibling ? new El(this.el.nextSibling) : null;
  },

  newSibling: function(tagName) {
    var el = this.el,
        sib = Browser.createElement(tagName),
        e = new El(sib),
        par = el.parentNode;
    if (par) {
      el.nextSibling ? par.insertBefore(sib, el.nextSibling) : par.appendChild(sib);
    } else {
      e._sibs = this._sibs || [];
      e._sibs.push(el);
    }
    return e;
  },


  /**
   * Called with tagName: Create new El, append as child to current El
   * Called with no arg: Traverse to first child.
   */
  child: function(arg) {
    error("Use El.newChild or El.firstChild instead of El.child()");
    return arg ? this.newChild(arg) : this.firstChild();
  },

  firstChild: function() {
    var ch = this.el.firstChild;
    while (ch.nodeType != 1) { // skip text nodes
      ch = ch.nextSibling;
    }
    return new El(ch);
  },

  appendChild: function(ref) {
    var el = El(ref);
    this.el.appendChild(el.el);
    return this;
  },

  newChild: function(tagName) {
    var ch = Browser.createElement(tagName);
    this.el.appendChild(ch);
    return new El(ch);
  },

  // Traverse to parent node
  //
  parent: function(sel) {
    sel && error("El.parent() no longer takes an argument; see findParent()")
    var p = this.el && this.el.parentNode;
    return p ? new El(p) : null;
  },

  findParent: function(tagName) {
    // error("TODO: use selector instead of tagname")
    var p = this.el && this.el.parentNode;
    if (tagName) {
      tagName = tagName.toUpperCase();
      while (p && p.tagName != tagName) {
        p = p.parentNode;
      }
    }
    return p ? new El(p) : null;
  },

  // Remove all children of this element
  //
  empty: function() {
    this.el.innerHTML = '';
    return this;
  }

});

// use DOM handler for certain events
// TODO: find a better way distinguising DOM events and other events registered on El
// e.g. different methods
//
//El.prototype.__domevents = Utils.arrayToIndex("click,mousedown,mousemove,mouseup".split(','));
El.prototype.__on = El.prototype.on;
El.prototype.on = function(type, func, ctx) {
  ctx = ctx || this;
  if (this.constructor == El) {
    Browser.on(this.el, type, func, ctx);
  } else {
    this.__on.apply(this, arguments);
  }
  return this;
};

El.prototype.__removeEventListener = El.prototype.removeEventListener;
El.prototype.removeEventListener = function(type, func, ctx) {
  if (this.constructor == El) {
    Browser.removeEventListener(this.el, type, func, ctx);
  } else {
    this.__removeEventListener.apply(this, arguments);
  }
  return this;
};
/*  */

var Element = El;

/**
 * Return ElSet representing children of this El.
 */
/*
El.prototype.children = function() {
  var set = new ElSet();
  set._parentNode = this.el;
  return set;
};
*/

/**
 * Return ElSet representing right-hand siblings of this El.
 */
/*
El.prototype.siblings = function() {
  var set = new ElSet();
  set._parentNode = this.el.parentNode;
  set._siblingNode = this.el;
  return set;
};
*/




function ElementPosition(ref) {
  var self = this;
  var el = El(ref);
  var pageX = 0,
      pageY = 0,
      width = 0,
      height = 0;

  el.on('mouseover', update);
  window.onorientationchange && Browser.on(window, 'orientationchange', update);
  Browser.on(window, 'scroll', update);
  Browser.on(window, 'resize', update);

  // trigger an update, e.g. when map container is resized
  this.update = function() {
    update();
  };

  this.resize = function(w, h) {
    el.css('width', w).css('height', h);
    update();
  };

  this.width = function() { return width };
  this.height = function() { return height };
  //this.pageX = function() { return pageX };
  //this.pageY = function() { return pageY };

  this.position = function() {
    return {
      element: el.node(),
      pageX: pageX,
      pageY: pageY,
      width: width,
      height: height
    };
  }

  function update() {
    var div = el.node();
    var xy = Browser.getPageXY(div);
    var w = div.clientWidth,
        h = div.clientHeight,
        x = xy.x,
        y = xy.y;

    var resized = w != width || h != height,
        moved = x != pageX || y != pageY;
    if (resized || moved) {
      pageX = x, pageY = y, width = w, height = h;
      var pos = self.position();
      self.dispatchEvent('change', pos);
      resized && self.dispatchEvent('resize', pos);
    }
  }

  update();
}

Opts.inherit(ElementPosition, EventDispatcher);


function Transform() {
  this.mx = this.my = 1;
  this.bx = this.by = 0;
}

Transform.prototype.isNull = function() {
  return !this.mx || !this.my || isNaN(this.bx) || isNaN(this.by);
};

Transform.prototype.invert = function() {
  var inv = new Transform();
  inv.mx = 1 / this.mx;
  inv.my = 1 / this.my;
  //inv.bx = -this.bx * inv.mx;
  //inv.by = -this.by * inv.my;
  inv.bx = -this.bx / this.mx;
  inv.by = -this.by / this.my;
  return inv;
};


Transform.prototype.transform = function(x, y, xy) {
  xy = xy || [];
  xy[0] = x * this.mx + this.bx;
  xy[1] = y * this.my + this.by;
  return xy;
};

Transform.prototype.toString = function() {
  return Utils.toString(Utils.extend({}, this));
};

function Bounds() {
  if (arguments.length > 0) {
    this.setBounds.apply(this, arguments);
  }
}

Bounds.prototype.toString = function() {
  return JSON.stringify({
    xmin: this.xmin,
    xmax: this.xmax,
    ymin: this.ymin,
    ymax: this.ymax
  });
};

Bounds.prototype.toArray = function() {
  return this.hasBounds() ? [this.xmin, this.ymin, this.xmax, this.ymax] : [];
};

Bounds.prototype.hasBounds = function() {
  return this.width() > 0 && this.height() > 0;
};

Bounds.prototype.sameBounds =
Bounds.prototype.equals = function(bb) {
  return bb && this.xmin === bb.xmin && this.xmax === bb.xmax &&
    this.ymin === bb.ymin && this.ymax === bb.ymax;
};

Bounds.prototype.width = function() {
  return (this.xmax - this.xmin) || 0;
};

Bounds.prototype.height = function() {
  return (this.ymax - this.ymin) || 0;
};

Bounds.prototype.area = function() {
  return this.width() * this.height() || 0;
};

Bounds.prototype.empty = function() {
  this.xmin = this.ymin = this.xmax = this.ymax = void 0;
  return this;
};

Bounds.prototype.setBounds = function(a, b, c, d) {
  if (arguments.length == 1) {
    // assume first arg is a Bounds or array
    if (Utils.isArrayLike(a)) {
      b = a[1];
      c = a[2];
      d = a[3];
      a = a[0];
    } else {
      b = a.ymin;
      c = a.xmax;
      d = a.ymax;
      a = a.xmin;
    }
  }

  this.xmin = a;
  this.ymin = b;
  this.xmax = c;
  this.ymax = d;
  if (a > c || b > d) this.update();
  // error("Bounds#setBounds() min/max reversed:", a, b, c, d);
  return this;
};


Bounds.prototype.centerX = function() {
  var x = (this.xmin + this.xmax) * 0.5;
  return x;
};

Bounds.prototype.centerY = function() {
  var y = (this.ymax + this.ymin) * 0.5;
  return y;
};

Bounds.prototype.containsPoint = function(x, y) {
  if (x >= this.xmin && x <= this.xmax &&
    y <= this.ymax && y >= this.ymin) {
    return true;
  }
  return false;
};

// intended to speed up slightly bubble symbol detection; could use intersects() instead
// TODO: fix false positive where circle is just outside a corner of the box
Bounds.prototype.containsBufferedPoint =
Bounds.prototype.containsCircle = function(x, y, buf) {
  if ( x + buf > this.xmin && x - buf < this.xmax ) {
    if ( y - buf < this.ymax && y + buf > this.ymin ) {
      return true;
    }
  }
  return false;
};

Bounds.prototype.intersects = function(bb) {
  if (bb.xmin <= this.xmax && bb.xmax >= this.xmin &&
    bb.ymax >= this.ymin && bb.ymin <= this.ymax) {
    return true;
  }
  return false;
};

Bounds.prototype.contains = function(bb) {
  if (bb.xmin >= this.xmin && bb.ymax <= this.ymax &&
    bb.xmax <= this.xmax && bb.ymin >= this.ymin) {
    return true;
  }
  return false;
};

Bounds.prototype.shift = function(x, y) {
  this.setBounds(this.xmin + x,
    this.ymin + y, this.xmax + x, this.ymax + y);
};

Bounds.prototype.padBounds = function(a, b, c, d) {
  this.xmin -= a;
  this.ymin -= b;
  this.xmax += c;
  this.ymax += d;
};

// Rescale the bounding box by a fraction. TODO: implement focus.
// @param {number} pct Fraction of original extents
// @param {number} pctY Optional amount to scale Y
//
Bounds.prototype.scale = function(pct, pctY) { /*, focusX, focusY*/
  var halfWidth = (this.xmax - this.xmin) * 0.5;
  var halfHeight = (this.ymax - this.ymin) * 0.5;
  var kx = pct - 1;
  var ky = pctY === undefined ? kx : pctY - 1;
  this.xmin -= halfWidth * kx;
  this.ymin -= halfHeight * ky;
  this.xmax += halfWidth * kx;
  this.ymax += halfHeight * ky;
};

// Return a bounding box with the same extent as this one.
Bounds.prototype.cloneBounds = // alias so child classes can override clone()
Bounds.prototype.clone = function() {
  return new Bounds(this.xmin, this.ymin, this.xmax, this.ymax);
};

Bounds.prototype.clearBounds = function() {
  this.setBounds(new Bounds());
};

Bounds.prototype.mergePoint = function(x, y) {
  if (this.xmin === void 0) {
    this.setBounds(x, y, x, y);
  } else {
    // this works even if x,y are NaN
    if (x < this.xmin)  this.xmin = x;
    else if (x > this.xmax)  this.xmax = x;

    if (y < this.ymin) this.ymin = y;
    else if (y > this.ymax) this.ymax = y;
  }
};

// expands either x or y dimension to match @aspect (width/height ratio)
// @focusX, @focusY (optional): expansion focus, as a fraction of width and height
Bounds.prototype.fillOut = function(aspect, focusX, focusY) {
  if (arguments.length < 3) {
    focusX = 0.5;
    focusY = 0.5;
  }
  var w = this.width(),
      h = this.height(),
      currAspect = w / h,
      pad;
  if (isNaN(aspect) || aspect <= 0) {
    // error condition; don't pad
  } else if (currAspect < aspect) { // fill out x dimension
    pad = h * aspect - w;
    this.xmin -= (1 - focusX) * pad;
    this.xmax += focusX * pad;
  } else {
    pad = w / aspect - h;
    this.ymin -= (1 - focusY) * pad;
    this.ymax += focusY * pad;
  }
  return this;
};

Bounds.prototype.update = function() {
  var tmp;
  if (this.xmin > this.xmax) {
    tmp = this.xmin;
    this.xmin = this.xmax;
    this.xmax = tmp;
  }
  if (this.ymin > this.ymax) {
    tmp = this.ymin;
    this.ymin = this.ymax;
    this.ymax = tmp;
  }
};

Bounds.prototype.transform = function(t) {
  this.xmin = this.xmin * t.mx + t.bx;
  this.xmax = this.xmax * t.mx + t.bx;
  this.ymin = this.ymin * t.my + t.by;
  this.ymax = this.ymax * t.my + t.by;
  this.update();
  return this;
};

// Returns a Transform object for mapping this onto Bounds @b2
// @flipY (optional) Flip y-axis coords, for converting to/from pixel coords
//
Bounds.prototype.getTransform = function(b2, flipY) {
  var t = new Transform();
  t.mx = b2.width() / this.width();
  t.bx = b2.xmin - t.mx * this.xmin;
  if (flipY) {
    t.my = -b2.height() / this.height();
    t.by = b2.ymax - t.my * this.ymin;
  } else {
    t.my = b2.height() / this.height();
    t.by = b2.ymin - t.my * this.ymin;
  }
  return t;
};

Bounds.prototype.mergeCircle = function(x, y, r) {
  if (r < 0) r = -r;
  this.mergeBounds([x - r, y - r, x + r, y + r]);
};

Bounds.prototype.mergeBounds = function(bb) {
  var a, b, c, d;
  if (bb instanceof Bounds) {
    a = bb.xmin, b = bb.ymin, c = bb.xmax, d = bb.ymax;
  } else if (arguments.length == 4) {
    a = arguments[0];
    b = arguments[1];
    c = arguments[2];
    d = arguments[3];
  } else if (bb.length == 4) {
    // assume array: [xmin, ymin, xmax, ymax]
    a = bb[0], b = bb[1], c = bb[2], d = bb[3];
  } else {
    error("Bounds#mergeBounds() invalid argument:", bb);
  }

  if (this.xmin === void 0) {
    this.setBounds(a, b, c, d);
  } else {
    if (a < this.xmin) this.xmin = a;
    if (b < this.ymin) this.ymin = b;
    if (c > this.xmax) this.xmax = c;
    if (d > this.ymax) this.ymax = d;
  }
  return this;
};




// Support for handling asynchronous dependencies.
// Waiter#isReady() == true and Waiter fires 'ready' after any/all dependents fire "ready"
// Instantiate directly or use as a base class.
// Public interface:
//   waitFor()
//   startWaiting()
//   isReady()
var Waiter = Opts.subclass(EventDispatcher);

Waiter.prototype.waitFor = function(obj) {
  if (!obj) error("#waitFor() missing arg; this:", this);
  if (!this.__tasks) this.__tasks = new Tasks();
  this.__tasks.add(function(callback) {
    obj.on('ready', callback);
  });
  return this;
};

Waiter.prototype.isReady = function() {
  return !!this._ready;
}

Waiter.prototype.addEventListener =
Waiter.prototype.on = function(type, callback, ctx, priority) {
  if (type === 'ready' && this.isReady()) {
    callback.call(ctx || this, new EventData(type));
  } else {
    EventDispatcher.prototype.on.call(this, type, callback, ctx, priority);
  }
  return this;
};

Waiter.prototype.dispatchEvent = function(type, obj, ctx) {
  EventDispatcher.prototype.dispatchEvent.call(this, type, obj, ctx);
  if (type == 'ready') {
    this.removeEventListeners(type, null);
  }
};

Waiter.prototype.startWaiting = function() {
  var self = this;
  function ready() {
    self._ready = true;
    if (self.handleReadyState) self.handleReadyState();
    self.dispatchEvent('ready');
  };

  if (!this.__tasks) {
    ready();
  } else {
    this.__tasks.run(ready);
  }
  return this;
};

// Usage: new Tasks().add(task1).add(task2) ... .run(oncomplete, onerror);
// Tasks are functions that take a single argument -- an ondata callback.
//
function Tasks() {
  if (this instanceof Tasks === false) {
    return new Tasks();
  }
  var _tasks = [];

  // Could call this on a timeout
  this.cancel = function() {
    error("Tasks#cancel() stub");
  }

  this.add = function(task) {
    _tasks.push(task);
    return this;
  };

  // @oncomplete Called when all tasks complete, with return values of task callbacks:
  //    oncomplete(val1, ...)
  // @error TODO: call optional onerror handler function if one or more tasks fail to complete
  //
  this.run = function(oncomplete, onerror) {
    var self = this,
        tasks = _tasks,
        values = [],
        needed = tasks.length;
    _tasks = []; // reset
    if (tasks.length == 0) {
      oncomplete();
      self.startWaiting();
    } else {
      Utils.forEach(tasks, function(task, i) {
        function ondone(data) {
          values[i] = data;
          if (--needed === 0) {
            oncomplete.apply(null, values);
            self.startWaiting();
          }
        }
        task(ondone);
      });
    }
    return this;
  };
}

Opts.inherit(Tasks, Waiter);


var TRANSITION_TIME = 500;

/*
var Fader = {};
Fader.fadeIn = function(el, time) {
  time = time || 300;
  el.style.WebkitTransition = 'opacity ' + time + 'ms linear';
  el.style.opacity = '1';
};

Fader.fadeOut = function(el, time) {
  time = time || 300;
  el.style.WebkitTransition = 'opacity ' + time + 'ms linear';
  el.style.opacity = '0';
};
*/


Timer.postpone = function(ms, func, ctx) {
  var callback = func;
  if (ctx) {
    callback = function() {
      func.call(ctx);
    };
  }
  setTimeout(callback, ms);
};

function Timer() {
  if (!(this instanceof Timer)) {
    return new Timer();
  }

  var _startTime,
      _prevTime,
      _count = 0,
      _times = 0,
      _duration = 0,
      _interval = 25, // default 25 = 40 frames per second
      MIN_INTERVAL = 8,
      _callback,
      _timerId = null,
      _self = this;

  this.busy = function() {
    return _timerId !== null;
  };

  this.start = function() {
    if (_timerId !== null) {
      this.stop();
    }
    _count = 0;
    _prevTime = _startTime = +new Date;
    _timerId = setTimeout(handleTimer, _interval);
    return this; // assumed by FrameCounter, etc
  };

  this.stop = function() {
    if (_timerId !== null) {
      //clearInterval(_timerId);
      clearTimeout(_timerId);
      _timerId = null;
    }
  };

  this.duration = function(ms) {
    _duration = ms;
    return this;
  };

  this.interval = function(ms) {
    if (ms == null) {
      return _interval;
    }
    _interval = ms | 0;
    if (_interval < MIN_INTERVAL) {
      trace("[Timer.interval()] Resetting to minimum interval:", MIN_INTERVAL);
      _interval = MIN_INTERVAL;
    }

    return this;
  };

  this.callback = function(f) {
    _callback = f;
    return this;
  };

  this.times = function(i) {
    _times = i;
    return this;
  };

  function handleTimer() {
    var now = +new Date,
        time = now - _prevTime,
        elapsed = now - _startTime;
    _count++;
    if (_duration > 0 && elapsed > _duration || _times > 0 && _count > _times) {
      this.stop();
      return;
    }
    var obj = {elapsed: elapsed, count: _count, time:now, interval:time, period: _interval};
    _callback && _callback(obj);
    _self.dispatchEvent('tick', obj);

    interval = +new Date - _prevTime; // update interval, now that event handlers have run
    _prevTime = now;
    var ms = Math.max(2 * _interval - time, 15);
    // trace("time:", time, "interval:", _interval, "timer:", ms);
    _timerId = setTimeout(handleTimer, ms);

  };
}

Opts.inherit(Timer, EventDispatcher);


var FrameCounter = new Timer().interval(25);

// FrameCounter will make a node script hang...
// TODO: find better solution:
//   option: only run counter when there is an event listener
//   option: make user responsible for calling "start()"
if (!Env.inNode) {
  FrameCounter.start();
}

//
//
function TweenTimer(obj) {
  if (obj) {
    var tween = new TweenTimer();
    tween.object = obj;
    return tween;
  }

  if (!(this instanceof TweenTimer)) {
    return new TweenTimer();
  }

  var _self = this;
  var _delay = 0; // not implemented
  var _start;
  var _busy;
  var _quickStart = true;
  var _snap = 0.0005;
  var _done = false;
  var _duration;
  var _method;

  var _src, _dest;

  this.method = function(f) {
    _method = f;
    return this;
  };

  this.snap = function(s) {
    _snap = s;
    return this;
  }

  this.duration = function(ms) {
    _duration = ms;
    return this;
  };

  this.to = function(obj) {
    _dest = obj;
    return this;
  };

  this.from = function(obj) {
    _src = obj;
    return this;
  };

  this.startTimer =
  this.start = function(ms, method) {

    if (_busy) {
      _self.stopTimer();
    }

    _duration = _duration || ms || 300;
    _method = _method || method || Tween.sineInOut;

    _start = (new Date).getTime();
    if (_quickStart) {
      _start -= FrameCounter.interval(); // msPerFrame;
    }

    _busy = true;
    FrameCounter.addEventListener('tick', handleTimer, this);
    return this;
  }


  this.setDelay =
  this.delay = function(ms) {
    ms = ms | 0;
    if (ms > 0 || ms < 10000 ) {
      _delay = ms;
    }
    return this;
  };

  this.__getData = function(pct) {
    var obj = {}
    if (_src && _dest) {
      Opts.copyAllParams(obj, _src);
      for (var key in obj) {
        obj[key] = (1 - pct) * obj[key] + pct * _dest[key];
      }
    }
    return obj;
  };

  this.busyTweening = this.busy = function() {
    return _busy;
  }

  this.stopTimer =
  this.stop = function() {
    _busy = false;
    FrameCounter.removeEventListener('tick', handleTimer, this);
    _done = false;
  }

  function handleTimer() {

    if (_busy == false) {
      _self.stopTimer();
      return;
    }

    if (_done) {
      return;
    }

    var pct = getCurrentPct();

    if (pct <= 0) { // still in 'delay' period
      return;
    }

    if (pct + _snap >= 1) {
      pct = 1;
      _done = true;
    }

    _self.procTween(pct);

    if (!_busy) { // ???
      _self.stopTimer();
      return;
    }

    if (pct == 1. && _done) {
      _self.stopTimer();
    }
  }


  function getCurrentPct() {
    if (_busy == false) {
      return 1;
    }

    var now = (new Date()).getTime();
    var elapsed = now - _start - _delay;
    if (elapsed < 0) { // negative number = still in delay period
      return 0;
    }

    var pct = elapsed / _duration;

    // prevent overflow (tween functions only valid in 0-1 range)
    if (pct > 1.0) {
      pct = 1.0;
    }

    if (_method != null) {
      pct = _method(pct);
    }
    return pct;
  }

}

Opts.inherit(TweenTimer, EventDispatcher);

TweenTimer.prototype.procTween = function(pct) {
  var isDone = pct >= 1;
  var obj = this.__getData(pct);
  obj.progress = pct;
  obj.done = isDone;
  this.dispatchEvent('tick', obj);
  isDone && this.dispatchEvent('done');
};

var Tween = TweenTimer;

//
//
Tween.quadraticOut = function(n) {
  return 1 - Math.pow((1 - n), 2);
};

// starts fast, slows down, ends fast
//
Tween.sineInOut = function(n) {
  n = 0.5 - Math.cos(n * Math.PI) / 2;
  return n;
};

// starts slow, speeds up, ends slow
//
Tween.inverseSine = function(n) {
  var n2 = Math.sin(n * Math.PI) / 2;
  if (n > 0.5) {
    n2 = 1 - n2;
  }
  return n2;
}

Tween.sineInOutStrong = function(n) {
  return Tween.sineInOut(Tween.sineInOut(n));
};

Tween.inOutStrong = function(n) {
  return Tween.quadraticOut(Tween.sineInOut(n));
}


/**
 * @constructor
 */
function NumberTween(callback) {
  this.__super__();

  this.start = function(fromVal, toVal, ms, method) {
    this._from = fromVal;
    this._to = toVal;
    this.startTimer(ms, method);
  }

  this.procTween = function(pct) {
    var val = this._to * pct + this._from * (1 - pct);
    callback(val, pct == 1);
  }
}

Opts.inherit(NumberTween, TweenTimer);







// @mouse: MouseArea object
//
function MouseWheel(mouse) {
  var self = this,
      prevWheelTime = 0,
      currDirection = 0,
      firing = false,
      scrolling = false;
  init();

  function init() {
    // reference: http://www.javascriptkit.com/javatutors/onmousewheel.shtml
    if (window.onmousewheel !== undefined) { // ie, webkit
      Browser.on(window, 'mousewheel', handleWheel);
    }
    else { // firefox
      Browser.on(window, 'DOMMouseScroll', handleWheel);
    }
    FrameCounter.addEventListener('tick', handleTimer, self);
  }

  function handleTimer(evt) {
    var sustainTime = 80;
    var fadeTime = 60;
    var elapsed = evt.time - prevWheelTime;
    if (currDirection == 0 || elapsed > sustainTime + fadeTime || !mouse.isOver()) {
      currDirection = 0;
      scrolling = false;
      firing = false;
      return;
    }
    if (firing) {
      var multiplier = evt.interval / evt.period; // 1;
      var fadeElapsed = elapsed - sustainTime;
      if (fadeElapsed > 0) {
        // Adjust multiplier if the timer fires during 'fade time' (for smoother zooming)
        multiplier *= Tween.quadraticOut((fadeTime - fadeElapsed) / fadeTime);
      }

      var obj = mouse.mouseData();
      obj.direction = currDirection;
      obj.multiplier = multiplier;
      self.dispatchEvent('mousewheel', obj);
    }
  }

  function handleWheel(evt) {
    if (!scrolling) {
      self.dispatchEvent('mousewheelstart');
      scrolling = true;
      if (mouse.isOver()) {
        firing = true;
      }
    }
    //if (mouse.isOver()) {
    if (firing) {
      evt.preventDefault();
      var direction = 0; // 1 = zoom in / scroll up, -1 = zoom out / scroll down
      if (evt.wheelDelta) {
        direction = evt.wheelDelta > 0 ? 1 : -1;
      }
      if (evt.detail) {
        direction = evt.detail > 0 ? -1 : 1;
      }

      prevWheelTime = +new Date;
      currDirection = direction;
    }
  }
}

Opts.inherit(MouseWheel, EventDispatcher);



function MouseArea(element) {
  var pos = new ElementPosition(element),
      _areaPos = pos.position(),
      _self = this,
      _dragging = false,
      _isOver = false,
      _isDown = false,
      _moveData,
      _downData;

  pos.on('change', function() {_areaPos = pos.position()});

  if (!Browser.touchEnabled) {
    Browser.on(document, 'mousemove', onMouseMove);
    Browser.on(document, 'mousedown', onMouseDown);
    Browser.on(document, 'mouseup', onMouseUp);
    Browser.on(element, 'mouseover', onAreaOver);
    Browser.on(element, 'mouseout', onAreaOut);
    Browser.on(element, 'mousedown', onAreaDown);
    Browser.on(element, 'dblclick', onAreaDblClick);
  }

  function onAreaDown(e) {
    e.preventDefault(); // prevent text selection cursor on drag
  }

  function onAreaOver(e) {
    _isOver = true;
    _self.dispatchEvent('enter');
  }

  function onAreaOut(e) {
    _isOver = false;
    _self.dispatchEvent('leave');
  }

  function onMouseUp(e) {
    _isDown = false;
    if (_dragging) {
      _dragging = false;
      _self.dispatchEvent('dragend', procMouseEvent(e));
    }

    if (_downData) {
      var obj = procMouseEvent(e),
          elapsed = obj.time - _downData.time,
          dx = obj.pageX - _downData.pageX,
          dy = obj.pageY - _downData.pageY;
      if (elapsed < 500 && Math.sqrt(dx * dx + dy * dy) < 6) {
        _self.dispatchEvent('click', obj);
      }
    }
  }

  function onMouseDown(e) {
    _isDown = true;
    _downData = _moveData
  }

  function onMouseMove(e) {
    _moveData = procMouseEvent(e, _moveData);
    if (!_dragging && _isDown && _downData.hover) {
      _dragging = true;
      _self.dispatchEvent('dragstart', procMouseEvent(e));
    }

    if (_dragging) {
      var obj = {
        dragX: _moveData.pageX - _downData.pageX,
        dragY: _moveData.pageY - _downData.pageY
      };
      _self.dispatchEvent('drag', Utils.extend(obj, _moveData));
    }
  }

  function onAreaDblClick(e) {
    if (_isOver) _self.dispatchEvent('dblclick', procMouseEvent(e));
  }

  function procMouseEvent(e, prev) {
    var pageX = e.pageX,
        pageY = e.pageY;

    return {
      shiftKey: e.shiftKey,
      time: +new Date,
      pageX: pageX,
      pageY: pageY,
      hover: _isOver,
      x: pageX - _areaPos.pageX,
      y: pageY - _areaPos.pageY,
      dx: prev ? pageX - prev.pageX : 0,
      dy: prev ? pageY - prev.pageY : 0
    };
  }

  this.isOver = function() {
    return _isOver;
  }

  this.isDown = function() {
    return _isDown;
  }

  this.mouseData = function() {
    return Utils.extend({}, _moveData);
  }
}

Opts.inherit(MouseArea, EventDispatcher);




Utils.findRankByValue = function(arr, value) {
  if (isNaN(value)) return arr.length;
  var rank = 1;
  for (var i=0, n=arr.length; i<n; i++) {
    if (value > arr[i]) rank++;
  }
  return rank;
}

Utils.findValueByPct = function(arr, pct) {
  var rank = Math.ceil((1-pct) * (arr.length));
  return Utils.findValueByRank(arr, rank);
};

// See http://ndevilla.free.fr/median/median/src/wirth.c
// Elements of @arr are reordered
//
Utils.findValueByRank = function(arr, rank) {
  if (!arr.length || rank < 1 || rank > arr.length) error("[findValueByRank()] invalid input");

  rank = Utils.clamp(rank | 0, 1, arr.length);
  var k = rank - 1, // conv. rank to array index
      n = arr.length,
      l = 0,
      m = n - 1,
      i, j, val, tmp;

  while (l < m) {
    val = arr[k];
    i = l;
    j = m;
    do {
      while (arr[i] < val) {i++;}
      while (val < arr[j]) {j--;}
      if (i <= j) {
        tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
        i++;
        j--;
      }
    } while (i <= j);
    if (j < k) l = i;
    if (k < i) m = j;
  }
  return arr[k];
};

//
//
Utils.findMedian = function(arr) {
  var n = arr.length,
      rank = Math.floor(n / 2) + 1,
      median = Utils.findValueByRank(arr, rank);
  if ((n & 1) == 0) {
    median = (median + Utils.findValueByRank(arr, rank - 1)) / 2;
  }
  return median;
};




// Wrapper for DataView class for more convenient reading and writing of
//   binary data; Remembers endianness and read/write position.
// Has convenience methods for copying from buffers, etc.
//
function BinArray(buf, le) {
  if (Utils.isNumber(buf)) {
    buf = new ArrayBuffer(buf);
  } else if (Env.inNode && buf instanceof Buffer == true) {
    // Since node 0.10, DataView constructor doesn't accept Buffers,
    //   so need to copy Buffer to ArrayBuffer
    buf = BinArray.toArrayBuffer(buf);
  }
  if (buf instanceof ArrayBuffer == false) {
    error("BinArray constructor takes an integer, ArrayBuffer or Buffer argument");
  }
  this._buffer = buf;
  this._bytes = new Uint8Array(buf);
  this._view = new DataView(buf);
  this._idx = 0;
  this._le = le !== false;
}

BinArray.bufferToUintArray = function(buf, wordLen) {
  if (wordLen == 4) return new Uint32Array(buf);
  if (wordLen == 2) return new Uint16Array(buf);
  if (wordLen == 1) return new Uint8Array(buf);
  error("BinArray.bufferToUintArray() invalid word length:", wordLen)
};

BinArray.uintSize = function(i) {
  return i & 1 || i & 2 || 4;
};

BinArray.bufferCopy = function(dest, destId, src, srcId, bytes) {
  srcId = srcId || 0;
  bytes = bytes || src.byteLength - srcId;
  if (dest.byteLength - destId < bytes)
    error("Buffer overflow; tried to write:", bytes);

  // When possible, copy buffer data in multi-byte chunks... Added this for faster copying of
  // shapefile data, which is aligned to 32 bits.
  var wordSize = Math.min(BinArray.uintSize(bytes), BinArray.uintSize(srcId),
      BinArray.uintSize(dest.byteLength), BinArray.uintSize(destId),
      BinArray.uintSize(src.byteLength));

  var srcArr = BinArray.bufferToUintArray(src, wordSize),
      destArr = BinArray.bufferToUintArray(dest, wordSize),
      count = bytes / wordSize,
      i = srcId / wordSize,
      j = destId / wordSize;

  while (count--) {
    destArr[j++] = srcArr[i++];
  }
  return bytes;
};

BinArray.toArrayBuffer = function(src) {
  var n = src.length,
      dest = new ArrayBuffer(n),
      view = new Uint8Array(dest);
  for (var i=0; i<n; i++) {
      view[i] = src[i];
  }
  return dest;
};

// Return length in bytes of an ArrayBuffer or Buffer
//
BinArray.bufferSize = function(buf) {
  return (buf instanceof ArrayBuffer ?  buf.byteLength : buf.length | 0);
};

Utils.buffersAreIdentical = function(a, b) {
  var alen = BinArray.bufferSize(a);
  var blen = BinArray.bufferSize(b);
  if (alen != blen) {
    return false;
  }
  for (var i=0; i<alen; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

BinArray.prototype = {
  size: function() {
    return this._buffer.byteLength;
  },

  littleEndian: function() {
    this._le = true;
    return this;
  },

  bigEndian: function() {
    this._le = false;
    return this;
  },

  buffer: function() {
    return this._buffer;
  },

  bytesLeft: function() {
    return this._buffer.byteLength - this._idx;
  },

  skipBytes: function(bytes) {
    this._idx += (bytes + 0);
    return this;
  },

  readUint8: function() {
    return this._bytes[this._idx++];
  },

  writeUint8: function(val) {
    this._bytes[this._idx++] = val;
    return this;
  },

  readInt8: function() {
    return this._view.getInt8(this._idx++);
  },

  writeInt8: function(val) {
    this._view.setInt8(this._idx++, val);
    return this;
  },

  readUint16: function() {
    var val = this._view.getUint16(this._idx, this._le);
    this._idx += 2;
    return val;
  },

  writeUint16: function(val) {
    this._view.setUint16(this._idx, val, this._le);
    this._idx += 2;
    return this;
  },

  readUint32: function() {
    var val = this._view.getUint32(this._idx, this._le);
    this._idx += 4;
    return val;
  },

  writeUint32: function(val) {
    this._view.setUint32(this._idx, val, this._le);
    this._idx += 4;
    return this;
  },

  readInt32: function() {
    var val = this._view.getInt32(this._idx, this._le);
    this._idx += 4;
    return val;
  },

  writeInt32: function(val) {
    this._view.setInt32(this._idx, val, this._le);
    this._idx += 4;
    return this;
  },

  readFloat64: function() {
    var val = this._view.getFloat64(this._idx, this._le);
    this._idx += 8;
    return val;
  },

  writeFloat64: function(val) {
    this._view.setFloat64(this._idx, val, this._le);
    this._idx += 8;
    return this;
  },

  // Returns a Float64Array containing @len doubles
  //
  readFloat64Array: function(len) {
    var bytes = len * 8,
        i = this._idx,
        buf = this._buffer,
        arr;
    // Inconsistent: first is a view, second a copy...
    if (i % 8 === 0) {
      arr = new Float64Array(buf, i, len);
    } else if (buf.slice) {
      arr = new Float64Array(buf.slice(i, i + bytes));
    } else { // ie10, etc
      var dest = new ArrayBuffer(bytes);
      BinArray.bufferCopy(dest, 0, buf, i, bytes);
      arr = new Float64Array(dest);
    }
    this._idx += bytes;
    return arr;
  },

  readUint32Array: function(len) {
    var arr = [];
    for (var i=0; i<len; i++) {
      arr.push(this.readUint32());
    }
    return arr;
  },

  peek: function() {
    return this._view.getUint8(this._idx);
  },

  position: function(i) {
    if (i != null) {
      this._idx = i;
      return this;
    }
    return this._idx;
  },

  readCString: function(fixedLen, asciiOnly) {
    var str = "";
    var count = 0;
    while(!fixedLen || count < fixedLen) {
      var byteVal = this.readUint8();
      count ++;
      if (byteVal == 0) {
        break;
      } else if (byteVal > 127 && asciiOnly) {
        str = null;
        break;
      }
      str += String.fromCharCode(byteVal);
    }

    if (fixedLen && count < fixedLen) {
      this.skipBytes(fixedLen - count);
    }
    return str;
  },

  writeString: function(str, maxLen) {
    var bytesWritten = 0,
        charsToWrite = str.length,
        cval;
    if (maxLen) {
      charsToWrite = Math.min(charsToWrite, maxLen);
    }
    for (var i=0; i<charsToWrite; i++) {
      cval = str.charCodeAt(i);
      if (cval > 127) {
        trace("#writeCString() Unicode value beyond ascii range")
        cval = '?'.charCodeAt(0);
      }
      this.writeUint8(cval);
      bytesWritten++;
    }
    return bytesWritten;
  },

  writeCString: function(str, fixedLen) {
    var maxChars = fixedLen ? fixedLen - 1 : null,
        bytesWritten = this.writeString(str, maxChars);

    this.writeUint8(0); // terminator
    bytesWritten++;

    if (fixedLen) {
      while (bytesWritten < fixedLen) {
        this.writeUint8(0);
        bytesWritten++;
      }
    }
    return this;
  },

  writeBuffer: function(buf, bytes, startIdx) {
    this._idx += BinArray.bufferCopy(this._buffer, this._idx, buf, startIdx, bytes);
    return this;
  }

  /*
  // TODO: expand buffer, probably via a public method, not automatically
  //
  _grow: function(k) {
    var fac = k > 1 && k <= 3 ? k : 1.7,
        srcLen = this.bufferSize(),
        destLen = Math.round(srcLen * fac),
        buf = new ArrayBuffer(destLen);

    var src = new Uint8Array(this._buffer),
        dest = new Uint8Array(buf);

    for (var i=0; i<srcLen; i++) {
      dest[i] = src[i];
    }

    this._buffer = buf;
    this._view = new DataView(buf);
  },*/
};





/*
A simplified version of printf formatting
Format codes: %[flags][width][.precision]type

supported flags:
  +   add '+' before positive numbers
  0   left-pad with '0'
width: 1 to many
precision: .(1 to many)
type:
  s     string
  di    integers
  f     decimal numbers
  xX    hexidecimal (unsigned)
  %     literal '%'

Examples:
  code    val    formatted
  %+d     1      '+1'
  %4i     32     '  32'
  %04i    32     '0032'
  %x      255    'ff'
  %.2f    0.125  '0.13'
  %'f     1000   '1,000'
*/

// Usage: Utils.format(formatString, [values])
// Tip: When reusing the same format many times, use Utils.formatter() for 5x - 10x better performance
//
Utils.format = function(fmt) {
  var fn = Utils.formatter(fmt);
  var str = fn.apply(null, Array.prototype.slice.call(arguments, 1));
  return str;
};

function formatValue(val, matches) {
  var flags = matches[1];
  var padding = matches[2];
  var decimals = matches[3] ? parseInt(matches[3].substr(1)) : void 0;
  var type = matches[4];

  if (type == '%') {
    return '%'; // %% = literal '%'
  }
  var isString = type == 's',
      isHex = type == 'x' || type == 'X',
      isInt = type == 'd' || type == 'i',
      isFloat = type == 'f',
      isNumber = !isString;

  var sign = "",
      padDigits = 0,
      isZero = false,
      isNeg = false;

  var str;
  if (isString) {
    str = String(val);
  }
  else if (isHex) {
    str = val.toString(16);
    if (type == 'X')
      str = str.toUpperCase();
  }
  else if (isNumber) {
    str = Utils.numToStr(val, isInt ? 0 : decimals);
    if (str[0] == '-') {
      isNeg = true;
      str = str.substr(1);
    }
    isZero = parseFloat(str) == 0;
    if (flags.indexOf("'") != -1 || flags.indexOf(',') != -1) {
      str = Utils.addThousandsSep(str);
    }
    if (!isZero) { // BUG: sign is added when num rounds to 0
      if (isNeg) {
        sign = "\u2212"; // U+2212
      } else if (flags.indexOf('+') != -1) {
        sign = '+';
      }
    }
  }

  if (padding) {
    var strLen = str.length + sign.length;
    var minWidth = parseInt(padding, 10);
    if (strLen < minWidth) {
      padDigits = minWidth - strLen;
      var padChar = flags.indexOf('0') == -1 ? ' ' : '0';
      var padStr = Utils.repeatString(padChar, padDigits);
    }
  }

  if (padDigits == 0) {
    str = sign + str;
  } else if (padChar == '0') {
    str = sign + padStr + str;
  } else {
    str = padStr + sign + str;
  }
  return str;
}

// Get a function for interpolating formatted values into a string.
//
Utils.formatter = function(fmt) {
  var codeRxp = /%([\',+0]*)([1-9]?)((?:\.[1-9])?)([sdifxX%])/g;
  var literals = [],
      formatCodes = [],
      startIdx = 0,
      escapes = 0,
      literal,
      matches;

  while(matches=codeRxp.exec(fmt)) {
    literal = fmt.substring(startIdx, codeRxp.lastIndex - matches[0].length);
    if (matches[0] == '%%') {
      matches = "%";
      escapes++;
    }
    literals.push(literal);
    formatCodes.push(matches);
    startIdx = codeRxp.lastIndex;
  }
  literals.push(fmt.substr(startIdx));

  if (escapes > 0) {
    formatCodes = Utils.filter(formatCodes, function(obj, i) {
      if (obj !== '%') return true;
      literals[i] += '%' + literals.splice(i+1, 1)[0];
      return false;
    });
  }


  return function() {
    var str = literals[0],
        n = arguments.length,
        count;
    if (n != formatCodes.length) {
      error("[Utils.format()] Data does not match format string; format:", fmt, "data:", arguments);
    }
    for (var i=0; i<n; i++) {
      // 's?': insert "s" if needed to form plural of previous value.
      if (arguments[i] == 's?') {
        if (Utils.isInteger(arguments[i-1])) {
          count = arguments[i-1];
        } else if (Utils.isInteger(arguments[i+1])) {
          count = arguments[i+1];
        } else {
          count = 1;
        }
        str += count == 1 ? "" : "s";
      } else {
        str += formatValue(arguments[i], formatCodes[i]);
      }
      str += literals[i+1];
    }
    return str;
  };
};







var MapShaper = {};

// TODO: adapt to run in browser
function stop() {
  var argArr = Utils.toArray(arguments);
  if (MapShaper.LOGGING) {
    message.apply(null, argArr);
    process.exit(1);
  } else {
    error.apply(null, argArr);
  }
}

function message() {
  var msg = Utils.toArray(arguments).join(' ');
  if (MapShaper.LOGGING && msg) {
    console.log(msg);
  }
}

MapShaper.absArcId = function(arcId) {
  return arcId >= 0 ? arcId : ~arcId;
};

MapShaper.parseLocalPath = function(path) {
  var obj = {
    ext: '',
    directory: '',
    filename: '',
    basename: ''
  };
  var parts = path.split('/'),
      name, i;

  if (parts.length == 1) {
    name = parts[0];
  } else {
    name = parts.pop();
    obj.directory = parts.join('/');
  }
  i = name.lastIndexOf('.');
  if (i > -1) {
    obj.ext = name.substr(i + 1); // omit '.'
    obj.basename = name.substr(0, i);
    obj.pathbase = path.substr(0, i);
  } else {
    obj.basename = name;
    obj.pathbase = path;
  }
  obj.filename = name;
  return obj;
};

MapShaper.guessFileType = function(file) {
  var info = MapShaper.parseLocalPath(file),
      ext = info.ext.toLowerCase(),
      type = null;
  if (/json$/i.test(file)) {
    type = 'json';
  } else if (ext == 'shp' || ext == 'dbf' || ext == 'prj') {
    type = ext;
  }
  return type;
};

MapShaper.guessFileFormat = function(str) {
  var type = null,
      name = str.toLowerCase();
  if (/topojson$/.test(name)) {
    type = 'topojson';
  } else if (/json$/.test(name)) {
    type = 'geojson';
  } else if (/shp$/.test(name)) {
    type = 'shapefile';
  }
  return type;
};


MapShaper.extendPartCoordinates = function(xdest, ydest, xsrc, ysrc, reversed) {
  var srcLen = xsrc.length,
      destLen = xdest.length,
      prevX = destLen === 0 ? Infinity : xdest[destLen-1],
      prevY = destLen === 0 ? Infinity : ydest[destLen-1],
      x, y, inc, startId, stopId;

  if (reversed) {
    inc = -1;
    startId = srcLen - 1;
    stopId = -1;
  } else {
    inc = 1;
    startId = 0;
    stopId = srcLen;
  }

  for (var i=startId; i!=stopId; i+=inc) {
    x = xsrc[i];
    y = ysrc[i];
    if (x !== prevX || y !== prevY) {
      xdest.push(x);
      ydest.push(y);
      prevX = x;
      prevY = y;
    }
  }
};

MapShaper.copyElements = function(src, i, dest, j, n, rev) {
  if (src === dest && j > i) error ("copy error");
  var inc = 1,
      offs = 0;
  if (rev) {
    inc = -1;
    offs = n - 1;
  }
  for (var k=0; k<n; k++, offs += inc) {
    dest[k + j] = src[i + offs];
  }
};

MapShaper.calcXYBounds = function(xx, yy, bb) {
  if (!bb) bb = new Bounds();
  var xbounds = Utils.getArrayBounds(xx),
      ybounds = Utils.getArrayBounds(yy);
  if (xbounds.nan > 0 || ybounds.nan > 0) error("[calcXYBounds()] Data contains NaN; xbounds:", xbounds, "ybounds:", ybounds);
  bb.mergePoint(xbounds.min, ybounds.min);
  bb.mergePoint(xbounds.max, ybounds.max);
  return bb;
};

MapShaper.transposeXYCoords = function(xx, yy) {
  var points = [];
  for (var i=0, len=xx.length; i<len; i++) {
    points.push([xx[i], yy[i]]);
  }
  return points;
};

// Convert a topological shape to a non-topological format
// (for exporting)
//
MapShaper.convertTopoShape = function(shape, arcs, closed) {
  var parts = [],
      pointCount = 0,
      bounds = new Bounds();

  for (var i=0; i<shape.length; i++) {
    var topoPart = shape[i],
        xx = [],
        yy = [];
    for (var j=0; j<topoPart.length; j++) {
      var arcId = topoPart[j],
          reversed = false;
      if (arcId < 0) {
        arcId = -1 - arcId;
        reversed = true;
      }
      var arc = arcs[arcId];
      MapShaper.extendPartCoordinates(xx, yy, arc[0], arc[1], reversed);
    }
    var pointsInPart = xx.length,
        validPart = !closed && pointsInPart > 0 || pointsInPart > 3;
    // TODO: other validation:
    // self-intersection test? test rings have non-zero area? rings follow winding rules?

    if (validPart) {
      parts.push([xx, yy]);
      pointCount += xx.length;
      MapShaper.calcXYBounds(xx, yy, bounds);
    }
  }

  return {parts: parts, bounds: bounds, pointCount: pointCount, partCount: parts.length};
};

MapShaper.getUniqueLayerNames = function(names) {
  if (names.length <= 1) return names; // name of single layer guaranteed unique
  var counts = Utils.countValues(names);

  // assign unique name to each layer
  var index = {};
  return names.map(function(name) {
    var count = counts[name],
        i;
    if (count > 1 || name in index) {
      // naming conflict, need to find a unique name
      name = name || 'layer'; // use layer1, layer2, etc as default
      i = 1;
      while ((name + i) in index) {
        i++;
      }
      name = name + i;
    }
    index[name] = true;
    return name;
  });
};




function distance3D(ax, ay, az, bx, by, bz) {
  var dx = ax - bx,
    dy = ay - by,
    dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function distanceSq(ax, ay, bx, by) {
  var dx = ax - bx,
      dy = ay - by;
  return dx * dx + dy * dy;
}

function distance2D(ax, ay, bx, by) {
  var dx = ax - bx,
      dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function distanceSq3D(ax, ay, az, bx, by, bz) {
  var dx = ax - bx,
      dy = ay - by,
      dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

function getRoundingFunction(inc) {
  if (!Utils.isNumber(inc) || inc === 0) {
    error("Rounding increment must be a non-zero number.");
  }
  var inv = 1 / inc;
  if (inv > 1) inv = Math.round(inv);
  return function(x) {
    // Need a rounding function that doesn't show rounding error after stringify()
    return Math.round(x * inv) / inv; // candidate
    //return Math.round(x / inc) / inv; // candidate
    //return Math.round(x / inc) * inc;
    //return Math.round(x * inv) * inc;
  };
}

// Detect intersections between two 2D segments.
// Return intersection as [x, y] array or false if segments do not cross or touch.
//
function segmentIntersection(s1p1x, s1p1y, s1p2x, s1p2y, s2p1x, s2p1y, s2p2x, s2p2y) {
  // Test collision (c.f. Sedgewick, _Algorithms in C_)
  // (Tried some other functions that might fail due to rounding errors)

  var hit = ccw(s1p1x, s1p1y, s1p2x, s1p2y, s2p1x, s2p1y) *
      ccw(s1p1x, s1p1y, s1p2x, s1p2y, s2p2x, s2p2y) <= 0 &&
      ccw(s2p1x, s2p1y, s2p2x, s2p2y, s1p1x, s1p1y) *
      ccw(s2p1x, s2p1y, s2p2x, s2p2y, s1p2x, s1p2y) <= 0;

  if (hit) {
    // Find x, y intersection
    var s1dx = s1p2x - s1p1x;
    var s1dy = s1p2y - s1p1y;
    var s2dx = s2p2x - s2p1x;
    var s2dy = s2p2y - s2p1y;
    var den = -s2dx * s1dy + s1dx * s2dy;
    if (den === 0) return false; // colinear -- treating as no intersection

    // Collision detected
    var m = (s2dx * (s1p1y - s2p1y) - s2dy * (s1p1x - s2p1x)) / den;
    var x = s1p1x + m * s1dx;
    var y = s1p1y + m * s1dy;
    return [x, y];
  }
  return false;
}


function ccw(x0, y0, x1, y1, x2, y2) {
  var dx1 = x1 - x0,
      dy1 = y1 - y0,
      dx2 = x2 - x0,
      dy2 = y2 - y0;
  if (dx1 * dy2 > dy1 * dx2) return 1;
  if (dx1 * dy2 < dy1 * dx2) return -1;
  if (dx1 * dx2 < 0 || dy1 * dy2 < 0) return -1;
  if (dx1 * dx1 + dy1 * dy1 < dx2 * dx2 + dy2 * dy2) return 1;
  return 0;
}

// atan2() makes this function fairly slow, replaced by ~2x faster formula
//
/*
function innerAngle_slow(ax, ay, bx, by, cx, cy) {
  var a1 = Math.atan2(ay - by, ax - bx),
      a2 = Math.atan2(cy - by, cx - bx),
      a3 = Math.abs(a1 - a2);
      a3 = a2 - a1
  if (a3 > Math.PI) {
    a3 = 2 * Math.PI - a3;
  }
  return a3;
}
*/

// TODO: make this safe for small angles
//
function innerAngle(ax, ay, bx, by, cx, cy) {
  var ab = distance2D(ax, ay, bx, by),
      bc = distance2D(bx, by, cx, cy),
      theta, dotp;
  if (ab === 0 || bc === 0) {
    theta = 0;
  } else {
    dotp = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by)) / ab * bc;
    if (dotp >= 1) {
      theta = 0;
    } else if (dotp <= -1) {
      theta = Math.PI;
    } else {
      theta = Math.acos(dotp); // consider using other formula at small dp
    }
  }
  return theta;
}

function innerAngle3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var ab = distance3D(ax, ay, az, bx, by, bz),
      bc = distance3D(bx, by, bz, cx, cy, cz),
      theta, dotp;
  if (ab === 0 || bc === 0) {
    theta = 0;
  } else {
    dotp = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by) + (az - bz) * (cz - bz)) / (ab * bc);
    if (dotp >= 1) {
      theta = 0;
    } else if (dotp <= -1) {
      theta = Math.PI;
    } else {
      theta = Math.acos(dotp); // consider using other formula at small dp
    }
  }
  return theta;
}


function triangleArea(ax, ay, bx, by, cx, cy) {
  var area = Math.abs(((ay - cy) * (bx - cx) + (by - cy) * (cx - ax)) / 2);
  return area;
}


function detSq(ax, ay, bx, by, cx, cy) {
  var det = ax * by - ax * cy + bx * cy - bx * ay + cx * ay - cx * by;
  return det * det;
}

function dotProduct(ax, ay, bx, by, cx, cy) {
  var ab = distance2D(ax, ay, bx, by),
      bc = distance2D(bx, by, cx, cy),
      den = ab * bc,
      dotp = 0;
  if (den > 0) {
    dotp = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by)) / den;
    if (dotp > 1) dotp = 1;
    else if (dotp < 0) dotp = 0;
  }
  return dotp;
}

function dotProduct3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var ab = distance3D(ax, ay, az, bx, by, bz),
      bc = distance3D(bx, by, bz, cx, cy, cz),
      dotp = 0;
  if (ab > 0 && bc > 0) {
    dotp = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by) + (az - bz) * (cz - bz)) / (ab * bc);
    if (dotp > 1) dotp = 1;
    else if (dotp < 0) dotp = 0;
  }
  return dotp;
}


function triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var area = 0.5 * Math.sqrt(detSq(ax, ay, bx, by, cx, cy) +
    detSq(ax, az, bx, bz, cx, cz) + detSq(ay, az, by, bz, cy, cz));
  return area;
}

// Given point B and segment AC, return the distSq from B to the nearest
// point on AC
// Receive the distSq of segments AB, BC, AC
//
function pointSegDistSq(ab2, bc2, ac2) {
  var dist2;
  if (ac2 === 0) {
    dist2 = ab2;
  } else if (ab2 >= bc2 + ac2) {
    dist2 = bc2;
  } else if (bc2 >= ab2 + ac2) {
    dist2 = ab2;
  } else {
    var dval = (ab2 + ac2 - bc2);
    dist2 = ab2 -  dval * dval / ac2  * 0.25;
  }
  if (dist2 < 0) {
    dist2 = 0;
  }
  return dist2;
}

MapShaper.calcArcBounds = function(xx, yy, start, len) {
  var xmin = Infinity,
      ymin = Infinity,
      xmax = -Infinity,
      ymax = -Infinity,
      i = start | 0,
      n = isNaN(len) ? xx.length - i : len + i,
      x, y;
  for (; i<n; i++) {
    x = xx[i];
    y = yy[i];
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }
  if (xmin > xmax || ymin > ymax) error("#calcArcBounds() null bounds");
  return [xmin, ymin, xmax, ymax];
};

function msSignedRingArea(xx, yy, start, len) {
  var sum = 0,
      i = start | 0,
      end = i + (len ? len | 0 : xx.length - i) - 1;

  if (i < 0 || end >= xx.length) {
    error("Out-of-bounds array index");
  }
  for (; i < end; i++) {
    sum += xx[i+1] * yy[i] - xx[i] * yy[i+1];
  }
  return sum / 2;
}

MapShaper.reversePathCoords = function(arr, start, len) {
  var i = start,
      j = start + len - 1,
      tmp;
  while (i < j) {
    tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    i++;
    j--;
  }
};

// merge B into A
function mergeBounds(a, b) {
  if (b[0] < a[0]) a[0] = b[0];
  if (b[1] < a[1]) a[1] = b[1];
  if (b[2] > a[2]) a[2] = b[2];
  if (b[3] > a[3]) a[3] = b[3];
}

function containsBounds(a, b) {
  return a[0] <= b[0] && a[2] >= b[2] && a[1] <= b[1] && a[3] >= b[3];
}

function boundsArea(b) {
  return (b[2] - b[0]) * (b[3] - b[1]);
}

function probablyDecimalDegreeBounds(b) {
  return containsBounds([-200, -91, 200, 90], b);
}

// export functions so they can be tested
MapShaper.geom = {
  getRoundingFunction: getRoundingFunction,
  segmentIntersection: segmentIntersection,
  distance3D: distance3D,
  innerAngle: innerAngle,
  innerAngle3D: innerAngle3D,
  triangleArea: triangleArea,
  triangleArea3D: triangleArea3D,
  msSignedRingArea: msSignedRingArea,
  probablyDecimalDegreeBounds: probablyDecimalDegreeBounds
};




MapShaper.ArcDataset = ArcDataset;

// An interface for managing a collection of paths.
// Constructor signatures:
//
// ArcDataset(arcs)
//    arcs is an array of polyline arcs; each arc is a two-element array: [[x0,x1,...],[y0,y1,...]
//
// ArcDataset(nn, xx, yy, zz)
//    nn is an array of arc lengths; xx, yy are arrays of concatenated coords;
//    zz (optional) is an array of concatenated simplification thresholds
//
function ArcDataset() {
  var _self = this;
  var _xx, _yy,  // coordinates data
      _ii, _nn,  // indexes, sizes
      _zz, _zlimit = 0, // simplification
      _bb, _allBounds, // bounding boxes
      _arcIter, _shapeIter; // path iterators

  if (arguments.length == 1) {
    initLegacyArcs(arguments[0]);  // want to phase this out
  } else if (arguments.length >= 3) {
    initPathData.apply(this, arguments);
  } else {
    error("ArcDataset() Invalid arguments");
  }

  function initLegacyArcs(coords) {
    var data = convertLegacyArcs(coords);
    initPathData(data.nn, data.xx, data.yy, data.zz);
  }

  function initPathData(nn, xx, yy, zz) {
    var size = nn.length;
    _xx = xx;
    _yy = yy;
    _nn = nn;
    _zz = zz || new Float64Array(xx.length);

    // generate array of starting idxs of each arc
    _ii = new Uint32Array(size);
    for (var idx = 0, j=0; j<size; j++) {
      _ii[j] = idx;
      idx += nn[j];
    }

    if (idx != _xx.length || _xx.length != _yy.length || _xx.length != _zz.length) {
      error("ArcDataset#initPathData() Counting error");
    }

    initBounds();

    // Pre-allocate some path iterators for repeated use.
    _arcIter = new ArcIter(_xx, _yy, _zz);
    _shapeIter = new ShapeIter(_self);
    return this;
  }

  function initBounds() {
    var data = calcArcBounds(_xx, _yy, _nn);
    _bb = data.bb;
    _allBounds = data.bounds;
  }

  function calcArcBounds(xx, yy, nn) {
    var numArcs = nn.length,
        bb = new Float64Array(numArcs * 4),
        arcOffs = 0,
        arcLen,
        j, b;
    for (var i=0; i<numArcs; i++) {
      arcLen = nn[i];
      b = MapShaper.calcArcBounds(xx, yy, arcOffs, arcLen);
      j = i * 4;
      bb[j++] = b[0];
      bb[j++] = b[1];
      bb[j++] = b[2];
      bb[j] = b[3];
      arcOffs += arcLen;
    }
    var bounds = new Bounds();
    if (numArcs > 0) bounds.setBounds(MapShaper.calcArcBounds(xx, yy));
    return {
      bb: bb,
      bounds: bounds
    };
  }

  function convertLegacyArcs(coords) {
    var numArcs = coords.length;

    // Generate arrays of arc lengths and starting idxs
    var nn = new Uint32Array(numArcs),
        pointCount = 0,
        useZ = false,
        arc, arcLen;
    for (var i=0; i<numArcs; i++) {
      arc = coords[i];
      arcLen = arc && arc[0].length || 0;
      useZ = useZ || arc.length > 2;
      nn[i] = arcLen;
      pointCount += arcLen;
      if (arcLen === 0) error("#convertArcArrays() Empty arc:", arc);
    }

    // Copy x, y coordinates into long arrays
    var xx = new Float64Array(pointCount),
        yy = new Float64Array(pointCount),
        zz = useZ ? new Float64Array(pointCount) : null,
        offs = 0;
    coords.forEach(function(arc, arcId) {
      var xarr = arc[0],
          yarr = arc[1],
          zarr = arc[2] || null,
          n = nn[arcId];
      for (var j=0; j<n; j++) {
        xx[offs + j] = xarr[j];
        yy[offs + j] = yarr[j];
        if (useZ) zz[offs + j] = zarr[j];
      }
      offs += n;
    });
    return {
      xx: xx,
      yy: yy,
      zz: zz,
      nn: nn
    };
  }

  // Give access to raw data arrays...
  this.getVertexData = function() {
    return {
      xx: _xx,
      yy: _yy,
      zz: _zz,
      bb: _bb,
      nn: _nn,
      ii: _ii
    };
  };

  this.getCopy = function() {
    return new ArcDataset(new Int32Array(_nn), new Float64Array(_xx),
        new Float64Array(_yy), new Float64Array(_zz));
  };

  this.getFilteredCopy = function() {
    var len2 = this.getFilteredPointCount();
    if (len2 == this.getPointCount()) {
      return this.getCopy();
    }

    var xx2 = new Float64Array(len2),
        yy2 = new Float64Array(len2),
        zz2 = new Float64Array(len2),
        nn2 = new Int32Array(this.size()),
        i2 = 0;

    this.forEach2(function(i, n, xx, yy, zz, arcId) {
      var n2 = 0;
      for (var end = i+n; i < end; i++) {
        if (_zz[i] >= _zlimit) {
          xx2[i2] = xx[i];
          yy2[i2] = yy[i];
          zz2[i2] = zz[i];
          i2++;
          n2++;
        }
      }
      if (n2 < 2) error("Collapsed arc"); // endpoints should be z == Infinity
      nn2[arcId] = n2;
    });

    return new ArcDataset(nn2, xx2, yy2, zz2);
  };

  // Return arcs as arrays of [x, y] points (intended for testing).
  this.toArray = function() {
    return Utils.range(this.size()).map(function(i) {
      return _self.getArc(i).toArray();
    });
  };

  this.toArray2 = function() {
    var arr = [];
    this.forEach3(function(xx, yy, zz) {
      var path = [Utils.toArray(xx), Utils.toArray(yy), Utils.toArray(zz)];
      arr.push(path);
    });
    return arr;
  };

  // Snap coordinates to a grid of @quanta locations on both axes
  // This may snap nearby points to the same coordinates.
  // Consider a cleanup pass to remove dupes, make sure collapsed arcs are
  //   removed on export.
  //
  this.quantize = function(quanta) {
    var bb1 = this.getBounds(),
        bb2 = new Bounds(0, 0, quanta-1, quanta-1),
        transform = bb1.getTransform(bb2),
        inverse = transform.invert();

    this.applyTransform(transform, true);
    this.applyTransform(inverse);
  };

  this.getAverageSegment = function(nth) {
    return MapShaper.getAverageSegment(this.getSegmentIter(), nth);
  };

  /*
  this.getNextId = function(i) {
    var n = _xx.length,
        zlim = _zlimit;
    while (++i < n) {
      if (zlim === 0 || _zz[i] >= zlim) return i;
    }
    return -1;
  };

  this.getPrevId = function(i) {
    var zlim = _zlimit;
    while (--i >= 0) {
      if (zlim === 0 || _zz[i] >= zlim) return i;
    }
    return -1;
  }; */

  // Apply a linear transform to the data, with or without rounding.
  //
  this.applyTransform = function(t, rounding) {
    var xx = _xx, yy = _yy, x, y;
    for (var i=0, n=xx.length; i<n; i++) {
      x = xx[i] * t.mx + t.bx;
      y = yy[i] * t.my + t.by;
      if (rounding) {
        x = Math.round(x);
        y = Math.round(y);
      }
      xx[i] = x;
      yy[i] = y;
    }
    initBounds();
  };

  this.getSegmentIter = function() {
    return MapShaper.getSegmentIter(_xx, _yy, _nn, _zz, _zlimit);
  };

  this.forEachSegment = function(cb) {
    this.getSegmentIter()(cb, 1);
  };

  this.forNthSegment = function(cb, nth) {
    this.getSegmentIter()(cb, nth);
  };

  // Return an ArcIter object for each path in the dataset
  //
  this.forEach = function(cb) {
    for (var i=0, n=this.size(); i<n; i++) {
      cb(this.getArcIter(i), i);
    }
  };

  // Iterate over arcs with access to low-level data
  //
  this.forEach2 = function(cb) {
    for (var arcId=0, n=this.size(); arcId<n; arcId++) {
      cb(_ii[arcId], _nn[arcId], _xx, _yy, _zz, arcId);
    }
  };

  this.forEach3 = function(cb) {
    var start, end, xx, yy, zz;
    for (var arcId=0, n=this.size(); arcId<n; arcId++) {
      start = _ii[arcId];
      end = start + _nn[arcId];
      xx = _xx.subarray(start, end);
      yy = _yy.subarray(start, end);
      zz = _zz.subarray(start, end);
      cb(xx, yy, zz, arcId);
    }
  };

  // Remove arcs that don't pass a filter test and re-index arcs
  // Return array mapping original arc ids to re-indexed ids. If arr[n] == -1
  // then arc n was removed. arr[n] == m indicates that the arc at n was
  // moved to index m.
  // Return null if no arcs were re-indexed (and no arcs were removed)
  //
  this.filter = function(cb) {
    var map = new Int32Array(this.size()),
        goodArcs = 0,
        goodPoints = 0,
        iter;
    for (var i=0, n=this.size(); i<n; i++) {
      if (cb(this.getArcIter(i), i)) {
        map[i] = goodArcs++;
        goodPoints += _nn[i];
      } else {
        map[i] = -1;
      }
    }
    if (goodArcs === this.size()) {
      return null;
    } else {
      condenseArcs(map);
      if (goodArcs === 0) {
        // no remaining arcs
      }
      return map;
    }
  };

  /*
  function copyElements(src, i, dest, j, n) {
    if (src === dest && j > i) error ("copy error");
    for (var k=0; k<n; k++) {
      dest[k + j] = src[k + i];
    }
  }
  */

  function condenseArcs(map) {
    var goodPoints = 0,
        goodArcs = 0,
        copyElements = MapShaper.copyElements,
        k, arcLen;
    for (var i=0, n=map.length; i<n; i++) {
      k = map[i];
      arcLen = _nn[i];
      if (k > -1) {
        copyElements(_xx, _ii[i], _xx, goodPoints, arcLen);
        copyElements(_yy, _ii[i], _yy, goodPoints, arcLen);
        copyElements(_zz, _ii[i], _zz, goodPoints, arcLen);
        _nn[k] = arcLen;
        goodPoints += arcLen;
        goodArcs++;
      }
    }

    initPathData(_nn.subarray(0, goodArcs), _xx.subarray(0, goodPoints),
        _yy.subarray(0, goodPoints), _zz.subarray(0, goodPoints));
  }

  this.getArcIter = function(arcId) {
    var fw = arcId >= 0,
        i = fw ? arcId : ~arcId,
        start = _ii[i],
        len = _nn[i];

    _arcIter.init(start, len, fw, _zlimit || 0);
    return _arcIter;
  };

  this.getShapeIter = function(ids) {
    var iter = _shapeIter;
    iter.init(ids);
    return iter;
  };

  // Add simplification data to the dataset
  // @thresholds is an array of arrays of removal thresholds for each arc-vertex.
  //
  this.setThresholds = function(thresholds) {
    if (thresholds.length != this.size())
      error("ArcDataset#setThresholds() Mismatched arc/threshold counts.");
    var i = 0;
    thresholds.forEach(function(arr) {
      var zz = _zz;
      for (var j=0, n=arr.length; j<n; i++, j++) {
        zz[i] = arr[j];
      }
    });

    return this;
  };

  this.getRetainedInterval = function() {
    return _zlimit;
  };

  this.setRetainedInterval = function(z) {
    _zlimit = z;
    return this;
  };

  this.setRetainedPct = function(pct) {
    if (pct >= 1) {
      _zlimit = 0;
    } else {
      _zlimit = this.getThresholdByPct(pct);
      _zlimit = MapShaper.clampIntervalByPct(_zlimit, pct);
    }
    return this;
  };

  // Return array of z-values that can be removed for simplification
  //
  this.getRemovableThresholds = function(nth) {
    if (!_zz) error("Missing simplification data");
    var skip = nth | 1,
        arr = new Float64Array(Math.ceil(_zz.length / skip)),
        z;
    for (var i=0, j=0, n=this.getPointCount(); i<n; i+=skip) {
      z = _zz[i];
      if (z != Infinity) {
        arr[j++] = z;
      }
    }
    return arr.subarray(0, j);
  };

  this.getArcThresholds = function(arcId) {
    if (!(arcId >= 0 && arcId < this.size())) {
      error("ArcDataset#getArcThresholds() invalid arc id:", arcId);
    }
    var start = _ii[arcId],
        end = start + _nn[arcId];
    return _zz.subarray(start, end);
  };

  this.getThresholdByPct = function(pct) {
    var tmp = this.getRemovableThresholds(),
        rank, z;
    if (tmp.length === 0) { // No removable points
      rank = 0;
    } else {
      rank = Math.floor((1 - pct) * (tmp.length + 2));
    }

    if (rank <= 0) {
      z = 0;
    } else if (rank > tmp.length) {
      z = Infinity;
    } else {
      z = Utils.findValueByRank(tmp, rank);
    }
    return z;
  };

  this.arcIntersectsBBox = function(i, b1) {
    var b2 = _bb,
        j = i * 4;
    return b2[j] <= b1[2] && b2[j+2] >= b1[0] && b2[j+3] >= b1[1] && b2[j+1] <= b1[3];
  };

  this.arcIsSmaller = function(i, units) {
    var bb = _bb,
        j = i * 4;
    return bb[j+2] - bb[j] < units && bb[j+3] - bb[j+1] < units;
  };

  this.size = function() {
    return _ii && _ii.length || 0;
  };

  this.getPointCount = function() {
    return _xx && _xx.length || 0;
  };

  this.getFilteredPointCount = function() {
    var zz = _zz, z = _zlimit;
    if (!zz || !z) return this.getPointCount();
    var count = 0;
    for (var i=0, n = zz.length; i<n; i++) {
      if (zz[i] >= z) count++;
    }
    return count;
  };

  this.getBounds = function() {
    return _allBounds;
  };

  this.getSimpleShapeBounds = function(arcIds, bounds) {
    bounds = bounds || new Bounds();
    for (var i=0, n=arcIds.length; i<n; i++) {
      this.mergeArcBounds(arcIds[i], bounds);
    }
    return bounds;
  };

  this.getMultiShapeBounds = function(shapeIds, bounds) {
    bounds = bounds || new Bounds();
    if (shapeIds) { // handle null shapes
      for (var i=0, n=shapeIds.length; i<n; i++) {
        this.getSimpleShapeBounds(shapeIds[i], bounds);
      }
    }
    return bounds;
  };

  this.mergeArcBounds = function(arcId, bounds) {
    if (arcId < 0) arcId = ~arcId;
    var offs = arcId * 4;
    bounds.mergeBounds(_bb[offs], _bb[offs+1], _bb[offs+2], _bb[offs+3]);
  };

  this.getArc = function(id) {
    return new Arc(this).init(id);
  };

  this.getMultiPathShape = function(arr) {
    if (!arr || arr.length > 0 === false) {
      error("#getMultiPathShape() Missing arc ids");
    } else {
      return new MultiShape(this).init(arr);
    }
  };
}

function Arc(src) {
  this.src = src;
}

Arc.prototype = {
  init: function(id) {
    this.id = id;
    return this;
  },
  pathCount: 1,
  getPathIter: function(i) {
    return this.src.getArcIter(this.id);
  },

  inBounds: function(bbox) {
    return this.src.arcIntersectsBBox(this.id, bbox);
  },

  // Return arc coords as an array of [x, y] points
  toArray: function() {
    var iter = this.getPathIter(),
        coords = [];
    while (iter.hasNext()) {
      coords.push([iter.x, iter.y]);
    }
    return coords;
  },

  smallerThan: function(units) {
    return this.src.arcIsSmaller(this.id, units);
  }
};

//
function MultiShape(src) {
  this.src = src;
}

MultiShape.prototype = {
  init: function(parts) {
    this.pathCount = parts ? parts.length : 0;
    this.parts = parts || [];
    return this;
  },
  getPathIter: function(i) {
    return this.src.getShapeIter(this.parts[i]);
  },
  getPath: function(i) {
    if (i < 0 || i >= this.parts.length) error("MultiShape#getPart() invalid part id:", i);
    return new SimpleShape(this.src).init(this.parts[i]);
  },
  // Return array of SimpleShape objects, one for each path
  getPaths: function() {
    return this.parts.map(function(ids) {
      return new SimpleShape(this.src).init(ids);
    }, this);
  }
};

function SimpleShape(src) {
  this.src = src;
}

SimpleShape.prototype = {
  pathCount: 1,
  init: function(ids) {
    this.ids = ids;
    return this;
  },
  getPathIter: function() {
    return this.src.getShapeIter(this.ids);
  }
};

// Iterate over the points of an arc
// properties: x, y)
// method: hasNext()
// usage:
//   while (iter.hasNext()) {
//     iter.x, iter.y; // do something w/ x & y
//   }
//
function ArcIter(xx, yy, zz) {
  var _xx = xx,
      _yy = yy,
      _zz = zz,
      _zlim, _len;
  var _i, _inc, _start, _stop;
  this.hasNext = nextIdx;
  this.x = this.y = 0;
  this.i = -1;

  this.init = function(i, len, fw, zlim) {
    _zlim = zlim;
    this.hasNext = zlim ? nextSimpleIdx : nextIdx;
    if (fw) {
      _start = i;
      _inc = 1;
      _stop = i + len;
    } else {
      _start = i + len - 1;
      _inc = -1;
      _stop = i - 1;
    }
    _i = _start;
  };

  function nextIdx() {
    var i = _i;
    if (i == _stop) return false;
    _i = i + _inc;
    this.x = _xx[i];
    this.y = _yy[i];
    this.i = i; // experimental
    if (isNaN(i) || isNaN(this.x)) throw "not a number";
    return true;
  }

  function nextSimpleIdx() {
    // using local vars is significantly faster when skipping many points
    var zz = _zz,
        i = _i,
        j = i,
        zlim = _zlim,
        stop = _stop,
        inc = _inc;
    if (i == stop) return false;
    do {
      j += inc;
    } while (j != stop && zz[j] < zlim);
    _i = j;
    this.x = _xx[i];
    this.y = _yy[i];
    this.i = i; // experimental
    return true;
  }
}

// Iterate along a path made up of one or more arcs.
// Similar interface to ArcIter()
//
function ShapeIter(arcs) {
  var _ids, _arc = null;
  var i, n;

  this.init = function(ids) {
    _ids = ids;
    n = ids.length;
    this.reset();
  };

  function nextArc() {
    i += 1;
    return (i < n) ? arcs.getArcIter(_ids[i]) : null;
  }

  this.reset = function() {
    i = -1;
    _arc = nextArc();
  };

  this.hasNext = function() {
    while (_arc) {
      if (_arc.hasNext()) {
        this.x = _arc.x;
        this.y = _arc.y;
        return true;
      } else {
        _arc = nextArc();
        if (_arc) _arc.hasNext(); // skip first point of arc
      }
    }
    return false;
  };
}

MapShaper.clampIntervalByPct = function(z, pct) {
  if (pct <= 0) z = Infinity;
  else if (pct >= 1) z = 0;
  return z;
};

// Return id of the vertex between @start and @end with the highest
// threshold that is less than @zlim.
//
MapShaper.findNextRemovableVertex = function(zz, zlim, start, end) {
  var tmp, jz = 0, j = -1, z;
  if (start > end) {
    tmp = start;
    start = end;
    end = tmp;
  }
  for (var i=start+1; i<end; i++) {
    z = zz[i];
    if (z < zlim && z > jz) {
      j = i;
      jz = z;
    }
  }
  return j;
};

// Return average magnitudes of dx, dy
// @iter Function returned by getSegmentIter()
//
MapShaper.getAverageSegment = function(iter, nth) {
  var count = 0,
      dx = 0,
      dy = 0;
  iter(function(i1, i2, xx, yy) {
    dx += Math.abs(xx[i1] - xx[i2]);
    dy += Math.abs(yy[i1] - yy[i2]);
    count++;
  }, nth);
  return [dx / count, dy / count];
};

MapShaper.getSegmentIter = function(xx, yy, nn, zz, zlim) {
  return function forNthSegment(cb, nth) {
    var filtered = zlim > 0,
        nextArcStart = 0,
        arcId = -1,
        count = 0,
        id1, id2, retn;
    nth = nth > 1 ? Math.floor(nth) : 1;
    for (var k=0, n=xx.length; k<n; k++) {
      if (!filtered || zz[k] >= zlim) { // check: > or >=
        id1 = id2;
        id2 = k;
        if (k < nextArcStart) {
          count++;
          if (nth == 1 || count % nth === 0) {
            cb(id1, id2, xx, yy);
          }
        } else {
          do {
            arcId++;
            nextArcStart += nn[arcId];
          } while (nextArcStart <= k); // handle empty paths
        }
      }
    }
  };
};




// buildTopology() converts non-topological polygon data into a topological format
//
// Input format:
// {
//    xx: [Array|Float64Array],   // x-coords of each point in the dataset
//    yy: [Array|Float64Array],   // y-coords "  "  "  "
//    nn: [Array] // array of path lengths
// }
// Note: x- and y-coords of all paths are concatenated into two long arrays, for easy indexing
// Note: Input coords can use typed arrays (better performance) or regular arrays (for testing)
//
// Output format:
// {
//    arcs: [ArcDataset],
//    paths: [Array]   // Paths are arrays of one or more arc id.
// }                   // Arc ids use the same numbering scheme as TopoJSON (see note).
// Note: Arc ids in the shapes array are indices of objects in the arcs array.
//       Negative ids signify that the arc coordinates are in reverse sequence.
//       Negative ids are converted to array indices with the fornula fwId = ~revId.
//       -1 is arc 0 reversed, -2 is arc 1 reversed, etc.
// Note: Arcs use typed arrays or regular arrays for coords, depending on the input array type.
//
MapShaper.buildTopology = function(obj) {
  if (!(obj.xx && obj.yy && obj.nn)) error("#buildTopology() Missing required param/s");

  T.start();
  var topoData = buildPathTopology(obj.xx, obj.yy, obj.nn);
  T.stop("Process topology");
  return {
    arcs: topoData.arcs,
    paths: topoData.paths
  };
};

//
//
function ArcIndex(pointCount, xyToUint) {
  var hashTableSize = Math.ceil(pointCount * 0.25);
  var hashTable = new Int32Array(hashTableSize),
      hash = function(x, y) {
        return xyToUint(x, y) % hashTableSize;
      },
      chainIds = [],
      arcs = [];

  Utils.initializeArray(hashTable, -1);

  this.addArc = function(xx, yy) {
    var end = xx.length - 1,
        key = hash(xx[end], yy[end]),
        chainId = hashTable[key],
        arcId = arcs.length;

    hashTable[key] = arcId;
    arcs.push([xx, yy]);
    chainIds.push(chainId);
    return arcId;
  };

  // Look for a previously generated arc with the same sequence of coords, but in the
  // opposite direction. (This program uses the convention of CW for space-enclosing rings, CCW for holes,
  // so coincident boundaries should contain the same points in reverse sequence).
  //
  this.findArcNeighbor = function(xx, yy, start, end, getNext) {
    var next = getNext(start),
        key = hash(xx[start], yy[start]),
        arcId = hashTable[key],
        arcX, arcY, len;

    while (arcId != -1) {
      // check endpoints and one segment...
      // it would be more rigorous but slower to identify a match
      // by comparing all segments in the coordinate sequence
      arcX = arcs[arcId][0];
      arcY = arcs[arcId][1];
      len = arcX.length;
      if (arcX[0] === xx[end] && arcX[len-1] === xx[start] && arcX[len-2] === xx[next] &&
          arcY[0] === yy[end] && arcY[len-1] === yy[start] && arcY[len-2] === yy[next]) {
        return arcId;
      }
      arcId = chainIds[arcId];
    }
    return -1;
  };

  this.getArcs = function() {
    return arcs;
  };
}

// Get function to Hash an x, y point to a non-negative integer
function getXYHash() {
  var buf = new ArrayBuffer(16),
      floats = new Float64Array(buf),
      uints = new Uint32Array(buf);

  return function(x, y) {
    var u = uints, h;
    floats[0] = x;
    floats[1] = y;
    h = u[0] ^ u[1];
    h = h << 5 ^ h >> 7 ^ u[2] ^ u[3];
    return h & 0x7fffffff;
  };
}

// Transform spaghetti paths into topological paths
//
function buildPathTopology(xx, yy, nn) {

  var pointCount = xx.length,
      index = new ArcIndex(pointCount, getXYHash()),
      typedArrays = !!(xx.subarray && yy.subarray),
      slice, array;

  var pathIds = initPathIds(pointCount, nn);

  if (typedArrays) {
    array = Float64Array;
    slice = xx.subarray;
  } else {
    array = Array;
    slice = Array.prototype.slice;
  }

  //T.start();
  var chainIds = initPointChains(xx, yy, !"verbose");
  //T.stop("Find matching vertices");

  //T.start();
  var pointId = 0;
  var paths = Utils.map(nn, function(pathLen) {
    var arcs = pathLen < 2 ? null : convertPath(pointId, pointId + pathLen - 1);
    pointId += pathLen;
    return arcs;
  });

  var arcs = new ArcDataset(index.getArcs());
  //T.stop("Find topological boundaries");

  return {
    paths: paths,
    arcs: arcs
  };

  function nextPoint(id) {
    var partId = pathIds[id];
    if (pathIds[id+1] === partId) {
      return id + 1;
    }
    var len = nn[partId];
    return sameXY(id, id - len + 1) ? id - len + 2 : -1;
  }

  function prevPoint(id) {
    var partId = pathIds[id];
    if (pathIds[id - 1] === partId) {
      return id - 1;
    }
    var len = nn[partId];
    return sameXY(id, id + len - 1) ? id + len - 2 : -1;
  }

  function sameXY(a, b) {
    return xx[a] == xx[b] && yy[a] == yy[b];
  }


  // Convert a non-topological path to one or more topological arcs
  // @start, @end are ids of first and last points in the path
  // TODO: don't allow id ~id pairs
  //
  function convertPath(start, end) {
    var arcIds = [],
        firstNodeId = -1,
        arcStartId;

    // Visit each point in the path, up to but not including the last point
    //
    for (var i = start; i < end; i++) {
      if (pointIsArcEndpoint(i)) {
        if (firstNodeId > -1) {
          arcIds.push(addEdge(arcStartId, i));
        } else {
          firstNodeId = i;
        }
        arcStartId = i;
      }
    }

    // Identify the final arc in the path
    //
    if (firstNodeId == -1) {
      // Not in an arc, i.e. no nodes have been found...
      // Assuming that path is either an island or is congruent with one or more rings
      arcIds.push(addRing(start, end));
    }
    else if (firstNodeId == start) {
      // path endpoint is a node;
      if (!pointIsArcEndpoint(end)) {
        error("Topology error"); // TODO: better error handling
      }
      arcIds.push(addEdge(arcStartId, i));
    } else {
      // final arc wraps around
      arcIds.push(addEdge(arcStartId, end, start + 1, firstNodeId));
    }

    return arcIds;
  }

  // @a and @b are ids of two points with same x, y coords
  // Return false if adjacent points match, either in fw or rev direction
  //
  function brokenEdge(a, b) {
    var xarr = xx, yarr = yy; // local vars: faster
    var aprev = prevPoint(a),
        anext = nextPoint(a),
        bprev = prevPoint(b),
        bnext = nextPoint(b);
    if (aprev == -1 || anext == -1 || bprev == -1 || bnext == -1) {
      return true;
    }
    else if (xarr[aprev] == xarr[bnext] && xarr[anext] == xarr[bprev] &&
      yarr[aprev] == yarr[bnext] && yarr[anext] == yarr[bprev]) {
      return false;
    }
    else if (xarr[aprev] == xarr[bprev] && xarr[anext] == xarr[bnext] &&
      yarr[aprev] == yarr[bprev] && yarr[anext] == yarr[bnext]) {
      return false;
    }
    return true;
  }

  // Test if a point @id is an endpoint of a topological path
  //
  function pointIsArcEndpoint(id) {
    var chainId = chainIds[id];
    if (chainId == id) {
      // point is unique -- point is arc endpoint iff it is start or end of an open path
      return nextPoint(id) == -1 || prevPoint(id) == -1;
    }
    do {
      if (brokenEdge(id, chainId)) {
        // there is a discontinuity at @id -- point is arc endpoint
        return true;
      }
      chainId = chainIds[chainId];
    } while (id != chainId);
    // path parallels all adjacent paths at @id -- point is not arc endpoint
    return false;
  }

  function mergeArcParts(src, startId, endId, startId2, endId2) {
    var len = endId - startId + endId2 - startId2 + 2,
        dest = new array(len),
        j = 0, i;
    for (i=startId; i <= endId; i++) {
      dest[j++] = src[i];
    }
    for (i=startId2; i <= endId2; i++) {
      dest[j++] = src[i];
    }
    if (j != len) error("mergeArcParts() counting error.");
    return dest;
  }

  function addEdge(startId1, endId1, startId2, endId2) {
    var splitArc = arguments.length == 4,
        start = startId1,
        end = splitArc ? endId2 : endId1,
        arcId, xarr, yarr;

    // Look for previously identified arc, in reverse direction (normal topology)
    arcId = index.findArcNeighbor(xx, yy, start, end, nextPoint);
    if (arcId >= 0) return ~arcId;

    // Look for matching arc in same direction
    // (Abnormal topology, but we're accepting it because real-world Shapefiles
    //   sometimes have duplicate paths)
    arcId = index.findArcNeighbor(xx, yy, end, start, prevPoint);
    if (arcId >= 0) return arcId;

    if (splitArc) {
      xarr = mergeArcParts(xx, startId1, endId1, startId2, endId2);
      yarr = mergeArcParts(yy, startId1, endId1, startId2, endId2);
    } else {
      xarr = slice.call(xx, startId1, endId1 + 1);
      yarr = slice.call(yy, startId1, endId1 + 1);
    }
    return index.addArc(xarr, yarr);
  }

  //
  //
  function addRing(startId, endId) {
    var chainId = chainIds[startId],
        pathId = pathIds[startId],
        arcId;

    while (chainId != startId) {
      if (pathIds[chainId] < pathId) {
        break;
      }
      chainId = chainIds[chainId];
    }

    if (chainId == startId) {
      return addEdge(startId, endId);
    }

    for (var i=startId; i<endId; i++) {
      arcId = index.findArcNeighbor(xx, yy, i, i, nextPoint);
      if (arcId >= 0) return ~arcId;

      arcId = index.findArcNeighbor(xx, yy, i, i, prevPoint);
      if (arcId >= 0) return arcId;
    }

    error("Unmatched ring; id:", pathId, "len:", nn[pathId]);
  }
}

// Create a lookup table for path ids; path ids are indexed by point id
//
function initPathIds(size, pathSizes) {
  var pathIds = new Int32Array(size),
      j = 0;
  for (var pathId=0, pathCount=pathSizes.length; pathId < pathCount; pathId++) {
    for (var i=0, n=pathSizes[pathId]; i<n; i++, j++) {
      pathIds[j] = pathId;
    }
  }
  return pathIds;
}


// Return an array with data for chains of vertices with same x, y coordinates
// Array ids are same as ids of x- and y-coord arrays.
// Array values are ids of next point in each chain.
// Unique (x, y) points link to themselves (i.e. arr[n] == n)
//
function initPointChains(xx, yy, verbose) {
  var pointCount = xx.length,
      hash = getXYHash(),
      hashTableSize = Math.floor(pointCount * 1.4);

  // A hash table larger than ~1.3 * point count doesn't seem to improve performance much.

  // Hash table is temporary storage for building chains of coincident points.
  // Hash bins contains the id of the first point in a chain.
  var hashChainIds = new Int32Array(hashTableSize);
  Utils.initializeArray(hashChainIds, -1);

  // Array that gets populated with chain data
  var chainIds = new Int32Array(pointCount);
  var key, headId, x, y, collisions = 0;

  for (var i=0; i<pointCount; i++) {
    x = xx[i];
    y = yy[i];
    key = hash(x, y) % hashTableSize;

    // Points with different (x, y) coords can hash to the same bin;
    // ... use linear probing to find a different bin for each (x, y) coord.
    while (true) {
      headId = hashChainIds[key];
      if (headId == -1) {
        // case -- first coordinate in chain: start new chain, point to self
        hashChainIds[key] = i;
        chainIds[i] = i;
        break;
      }
      else if (xx[headId] == x && yy[headId] == y) {
        // case -- extending a chain: insert new point after head of chain
        chainIds[i] = chainIds[headId];
        chainIds[headId] = i;
        break;
      }

      // case -- this bin is used by another coord, try the next bin
      collisions++;
      key = (key + 1) % hashTableSize;
    }
  }
  if (verbose) trace(Utils.format("#initPointChains() collision rate: %.3f", collisions / pointCount));
  return chainIds;
}


// Export functions for testing
MapShaper.topology = {
  buildPathTopology: buildPathTopology,
  ArcIndex: ArcIndex
  // groupPathsByShape: groupPathsByShape,
  // initPathIds: initPathIds
};




// A heap data structure used for computing Visvalingam simplification data.
//
function Heap() {
  var maxItems,
      dataOffs,
      dataArr,
      itemsInHeap,
      poppedVal,
      heapArr,
      indexArr;

  this.addValues = function(values, start, end) {
    var minId = start | 0,
        maxItems = (isNaN(end) ? values.length : end + 1) - minId;
    dataOffs = minId;
    dataArr = values;
    itemsInHeap = 0;
    reserveSpace(maxItems);
    for (var i=0; i<maxItems; i++) {
      insert(i, i + dataOffs); // push item onto the heap
    }
    itemsInHeap = maxItems;
    for (var j=(itemsInHeap-2) >> 1; j >= 0; j--) {
      downHeap(j);
    }
    poppedVal = -Infinity;
  };

  this.heapSize = function() {
    return itemsInHeap;
  };

  // Update a single value and re-heap.
  //
  this.updateValue = function(valId, val) {
    // TODO: move this logic out of heap
    if (val < poppedVal) {
      // don't give updated values a lesser value than the last popped vertex
      // (required by visvalingam)
      val = poppedVal;
    }
    dataArr[valId] = val;
    var heapIdx = indexArr[valId - dataOffs];
    if (!(heapIdx >= 0 && heapIdx < itemsInHeap)) error("[updateValue()] out-of-range heap index.");
    reHeap(heapIdx);
  };


  this.testHeapOrder = function() {
    checkNode(0, -Infinity);
    return true;
  };

  // Return the idx of the lowest-value item in the heap
  //
  this.pop = function() {
    if (itemsInHeap <= 0) error("Tried to pop from an empty heap.");
    var minValId = heapArr[0],
        lastIdx = --itemsInHeap;
    if (itemsInHeap > 0) {
      insert(0, heapArr[lastIdx]);// copy last item in heap into root position
      downHeap(0);
    }
    poppedVal = dataArr[minValId];
    return minValId;
  };


  function reserveSpace(heapSize) {
    if (!heapArr || heapSize > heapArr.length) {
      var bufLen = heapSize * 1.2 | 0;
      heapArr = new Int32Array(bufLen);
      indexArr = new Int32Array(bufLen);
    }
  }

  // Associate a heap idx with the id of a value in valuesArr
  //
  function insert(heapIdx, valId) {
    indexArr[valId - dataOffs] = heapIdx;
    heapArr[heapIdx] = valId;
  }

  // Check that heap is ordered starting at a given node
  // (traverses heap recursively)
  //
  function checkNode(heapIdx, parentVal) {
    if (heapIdx >= itemsInHeap) {
      return;
    }
    var val = dataArr[heapArr[heapIdx]];
    if (parentVal > val) error("Heap is out-of-order");
    var childIdx = heapIdx * 2 + 1;
    checkNode(childIdx, val);
    checkNode(childIdx + 1, val);
  }

  function reHeap(idx) {
    if (idx < 0 || idx >= itemsInHeap)
      error("Out-of-bounds heap idx passed to reHeap()");
    downHeap(upHeap(idx));
  }

  function upHeap(currIdx) {
    var valId = heapArr[currIdx],
        currVal = dataArr[valId],
        parentIdx, parentValId, parentVal;

    // Move item up in the heap until it's at the top or is heavier than its parent
    //
    while (currIdx > 0) {
      parentIdx = (currIdx - 1) >> 1; // integer division by two gives idx of parent
      parentValId = heapArr[parentIdx];
      parentVal = dataArr[parentValId];

      if (parentVal <= currVal) {
        break;
      }

      // out-of-order; swap child && parent
      insert(currIdx, parentValId);
      insert(parentIdx, valId);
      currIdx = parentIdx;
      // if (dataArr[heapArr[currIdx]] !== currVal) error("Lost value association");
    }
    return currIdx;
  }

  function downHeap(currIdx) {
    // Item gets swapped with any lighter children
    //
    var data = dataArr, heap = heapArr, // local vars, faster
        valId = heap[currIdx],
        currVal = data[valId],
        firstChildIdx = 2 * currIdx + 1,
        secondChildIdx,
        minChildIdx, childValId, childVal;

    while (firstChildIdx < itemsInHeap) {
      secondChildIdx = firstChildIdx + 1;
      minChildIdx = secondChildIdx >= itemsInHeap || data[heap[firstChildIdx]] <= data[heap[secondChildIdx]] ? firstChildIdx : secondChildIdx;

      childValId = heap[minChildIdx];
      childVal = data[childValId];

      if (currVal <= childVal) {
        break;
      }

      insert(currIdx, childValId);
      insert(minChildIdx, valId);

      // descend in the heap:
      currIdx = minChildIdx;
      firstChildIdx = 2 * currIdx + 1;
    }
  }
}




var Visvalingam = {};

MapShaper.Heap = Heap; // export Heap for testing

Visvalingam.getArcCalculator = function(metric2D, metric3D, scale) {
  var bufLen = 0,
      heap = new Heap(),
      prevArr, nextArr;

  // Calculate Visvalingam simplification data for an arc
  // Receives arrays of x- and y- coordinates, optional array of z- coords
  //
  return function calcVisvalingam(dest, xx, yy, zz) {
    var arcLen = dest.length,
        useZ = !!zz,
        threshold,
        ax, ay, bx, by, cx, cy;

    if (arcLen > bufLen) {
      bufLen = Math.round(arcLen * 1.2);
      prevArr = new Int32Array(bufLen);
      nextArr = new Int32Array(bufLen);
    }

    // Initialize Visvalingam "effective area" values and references to
    //   prev/next points for each point in arc.
    //
    for (var i=1; i<arcLen-1; i++) {
      ax = xx[i-1];
      ay = yy[i-1];
      bx = xx[i];
      by = yy[i];
      cx = xx[i+1];
      cy = yy[i+1];

      if (!useZ) {
        threshold = metric2D(ax, ay, bx, by, cx, cy);
      } else {
        threshold = metric3D(ax, ay, zz[i-1], bx, by, zz[i], cx, cy, zz[i+1]);
      }

      dest[i] = threshold;
      nextArr[i] = i + 1;
      prevArr[i] = i - 1;
    }
    prevArr[arcLen-1] = arcLen - 2;
    nextArr[0] = 1;

    // Initialize the heap with thresholds; don't add first and last point
    heap.addValues(dest, 1, arcLen-2);

    // Calculate removal thresholds for each internal point in the arc
    //
    var idx, nextIdx, prevIdx;
    while(heap.heapSize() > 0) {

      // Remove the point with the least effective area.
      idx = heap.pop();
      if (idx < 1 || idx > arcLen - 2) {
        error("Popped first or last arc vertex (error condition); idx:", idx, "len:", arcLen);
      }

      // Recompute effective area of neighbors of the removed point.
      prevIdx = prevArr[idx];
      nextIdx = nextArr[idx];
      ax = xx[prevIdx];
      ay = yy[prevIdx];
      bx = xx[nextIdx];
      by = yy[nextIdx];

      if (prevIdx > 0) {
        cx = xx[prevArr[prevIdx]];
        cy = yy[prevArr[prevIdx]];
        if (!useZ) {
          threshold = metric2D(bx, by, ax, ay, cx, cy); // next point, prev point, prev-prev point
        } else {
          threshold = metric3D(bx, by, zz[nextIdx], ax, ay, zz[prevIdx], cx, cy, zz[prevArr[prevIdx]]);
        }
        heap.updateValue(prevIdx, threshold);
      }
      if (nextIdx < arcLen-1) {
        cx = xx[nextArr[nextIdx]];
        cy = yy[nextArr[nextIdx]];
        if (!useZ) {
          threshold = metric2D(ax, ay, bx, by, cx, cy); // prev point, next point, next-next point
        } else {
          threshold = metric3D(ax, ay, zz[prevIdx], bx, by, zz[nextIdx], cx, cy, zz[nextArr[nextIdx]]);
        }
        heap.updateValue(nextIdx, threshold);
      }
      nextArr[prevIdx] = nextIdx;
      prevArr[nextIdx] = prevIdx;
    }

    // convert area metric to a linear equivalent
    //
    for (var j=1; j<arcLen-1; j++) {
      dest[j] = Math.sqrt(dest[j]) * (scale || 1);
    }
    dest[0] = dest[arcLen-1] = Infinity; // arc endpoints
  };
};

Visvalingam.standardMetric = triangleArea;
Visvalingam.standardMetric3D = triangleArea3D;

// Replacement for original "Modified Visvalingam"
// Underweight polyline vertices with acute angles in proportion to 1 - cosine
//
Visvalingam.specialMetric = function(ax, ay, bx, by, cx, cy) {
  var area = triangleArea(ax, ay, bx, by, cx, cy),
      dotp = dotProduct(ax, ay, bx, by, cx, cy),
      weight = dotp > 0 ? 1 - dotp : 1;
  return area * weight;
};

Visvalingam.specialMetric3D = function(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var area = triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz),
      dotp = dotProduct3D(ax, ay, az, bx, by, bz, cx, cy, cz),
      weight = dotp > 0 ? 1 - dotp : 1;
  return area * weight;
};

// The original "modified Visvalingam" function uses a step function to
// underweight more acute triangles.
//
Visvalingam.specialMetric_v1 = function(ax, ay, bx, by, cx, cy) {
  var area = triangleArea(ax, ay, bx, by, cx, cy),
      angle = innerAngle(ax, ay, bx, by, cx, cy),
      weight = angle < 0.5 ? 0.1 : angle < 1 ? 0.3 : 1;
  return area * weight;
};

Visvalingam.specialMetric3D_v1 = function(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var area = triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz),
      angle = innerAngle3D(ax, ay, az, bx, by, bz, cx, cy, cz),
      weight = angle < 0.5 ? 0.1 : angle < 1 ? 0.3 : 1;
  return area * weight;
};




var DouglasPeucker = {};

DouglasPeucker.metricSq3D = function(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var ab2 = distanceSq3D(ax, ay, az, bx, by, bz),
      ac2 = distanceSq3D(ax, ay, az, cx, cy, cz),
      bc2 = distanceSq3D(bx, by, bz, cx, cy, cz);
  return pointSegDistSq(ab2, bc2, ac2);
};

DouglasPeucker.metricSq = function(ax, ay, bx, by, cx, cy) {
  var ab2 = distanceSq(ax, ay, bx, by),
      ac2 = distanceSq(ax, ay, cx, cy),
      bc2 = distanceSq(bx, by, cx, cy);
  return pointSegDistSq(ab2, bc2, ac2);
};

// @dest array to contain point removal thresholds
// @xx, @yy arrays of x, y coords of a path
// @zz (optional) array of z coords for spherical simplification
//
DouglasPeucker.calcArcData = function(dest, xx, yy, zz) {
  var len = dest.length,
      useZ = !!zz;

  dest[0] = dest[len-1] = Infinity;
  if (len > 2) {
    procSegment(0, len-1, 1, Number.MAX_VALUE);
  }

  function procSegment(startIdx, endIdx, depth, distSqPrev) {
    // get endpoint coords
    var ax = xx[startIdx],
        ay = yy[startIdx],
        cx = xx[endIdx],
        cy = yy[endIdx],
        az, cz;
    if (useZ) {
      az = zz[startIdx];
      cz = zz[endIdx];
    }

    var maxDistSq = 0,
        maxIdx = 0,
        distSqLeft = 0,
        distSqRight = 0,
        distSq;

    for (var i=startIdx+1; i<endIdx; i++) {
      if (useZ) {
        distSq = DouglasPeucker.metricSq3D(ax, ay, az, xx[i], yy[i], zz[i], cx, cy, cz);
      } else {
        distSq = DouglasPeucker.metricSq(ax, ay, xx[i], yy[i], cx, cy);
      }

      if (distSq >= maxDistSq) {
        maxDistSq = distSq;
        maxIdx = i;
      }
    }

    // Case -- threshold of parent segment is less than threshold of curr segment
    // Curr max point is assigned parent's threshold, so parent is not removed
    // before child as simplification is increased.
    //
    if (distSqPrev < maxDistSq) {
      maxDistSq = distSqPrev;
    }

    if (maxIdx - startIdx > 1) {
      distSqLeft = procSegment(startIdx, maxIdx, depth+1, maxDistSq);
    }
    if (endIdx - maxIdx > 1) {
      distSqRight = procSegment(maxIdx, endIdx, depth+1, maxDistSq);
    }

    // Case -- max point of curr segment is highest-threshold point of an island polygon
    // Give point the same threshold as the next-highest point, to prevent
    // a 3-vertex degenerate ring.
    if (depth == 1 && ax == cx && ay == cy) {
      maxDistSq = Math.max(distSqLeft, distSqRight);
    }

    dest[maxIdx] =  Math.sqrt(maxDistSq);
    return maxDistSq;
  }
};




// Protect polar coordinates and coordinates at the prime meridian from
// being removed before other points in a path.
// Assume: coordinates are in decimal degrees
//
MapShaper.protectWorldEdges = function(paths) {
  // Need to handle coords with rounding errors:
  // -179.99999999999994 in test/test_data/ne/ne_110m_admin_0_scale_rank.shp
  // 180.00000000000003 in ne/ne_50m_admin_0_countries.shp
  var err = 1e-12,
      l = -180 + err,
      r = 180 - err,
      t = 90 - err,
      b = -90 + err;

  // return if content doesn't reach edges
  var bounds = paths.getBounds().toArray();
  if (containsBounds([l, b, r, t], bounds) === true) return;

  paths.forEach3(function(xx, yy, zz) {
    var maxZ = 0,
    x, y;
    for (var i=0, n=zz.length; i<n; i++) {
      x = xx[i];
      y = yy[i];
      if (x > r || x < l || y < b || y > t) {
        if (maxZ === 0) {
          maxZ = MapShaper.findMaxThreshold(zz);
        }
        if (zz[i] !== Infinity) { // don't override lock value
          zz[i] = maxZ;
        }
      }
    }
  });
};

// Return largest value in an array, ignoring Infinity (lock value)
//
MapShaper.findMaxThreshold = function(zz) {
  var z, maxZ = 0;
  for (var i=0, n=zz.length; i<n; i++) {
    z = zz[i];
    if (z > maxZ && z < Infinity) {
      maxZ = z;
    }
  }
  return maxZ;
};


// Convert arrays of lng and lat coords (xsrc, ysrc) into
// x, y, z coords on the surface of a sphere with radius 6378137
// (the radius of spherical Earth datum in meters)
//
MapShaper.convLngLatToSph = function(xsrc, ysrc, xbuf, ybuf, zbuf) {
  var deg2rad = Math.PI / 180,
      r = 6378137;
  for (var i=0, len=xsrc.length; i<len; i++) {
    var lng = xsrc[i] * deg2rad,
        lat = ysrc[i] * deg2rad,
        cosLat = Math.cos(lat);
    xbuf[i] = Math.cos(lng) * cosLat * r;
    ybuf[i] = Math.sin(lng) * cosLat * r;
    zbuf[i] = Math.sin(lat) * r;
  }
};

MapShaper.simplifyPaths = function(paths, method, force2D) {
  T.start();
  var bounds = paths.getBounds().toArray();
  var decimalDegrees = probablyDecimalDegreeBounds(bounds);
  var simplifyPath = MapShaper.simplifiers[method] || error("Unknown method:", method);
  if (decimalDegrees && !force2D) {
    MapShaper.simplifyPaths3D(paths, simplifyPath);
    MapShaper.protectWorldEdges(paths);
  } else {
    MapShaper.simplifyPaths2D(paths, simplifyPath);
  }
  T.stop("Calculate simplification data");
};

MapShaper.simplifyPaths2D = function(paths, simplify) {
  paths.forEach3(function(xx, yy, kk, i) {
    simplify(kk, xx, yy);
  });
};

MapShaper.simplifyPaths3D = function(paths, simplify) {
  var bufSize = 0,
      xbuf, ybuf, zbuf;

  paths.forEach3(function(xx, yy, kk, i) {
    var arcLen = xx.length;
    if (bufSize < arcLen) {
      bufSize = Math.round(arcLen * 1.2);
      xbuf = new Float64Array(bufSize);
      ybuf = new Float64Array(bufSize);
      zbuf = new Float64Array(bufSize);
    }

    MapShaper.convLngLatToSph(xx, yy, xbuf, ybuf, zbuf);
    simplify(kk, xbuf, ybuf, zbuf);
  });
};

// Path simplification functions
// Signature: function(xx:array, yy:array, [zz:array], [length:integer]):array
//
MapShaper.simplifiers = {
  vis: Visvalingam.getArcCalculator(Visvalingam.standardMetric, Visvalingam.standardMetric3D, 0.65),
  mod1: Visvalingam.getArcCalculator(Visvalingam.specialMetric_v1, Visvalingam.specialMetric3D_v1, 0.65),
  mod2: Visvalingam.getArcCalculator(Visvalingam.specialMetric, Visvalingam.specialMetric3D, 0.65),
  dp: DouglasPeucker.calcArcData
};

MapShaper.simplifyPathsSph = function(xx, yy, mm, simplify) {
  var bufSize = 0,
      xbuf, ybuf, zbuf;

  var data = Utils.map(arcs, function(arc) {
    var arcLen = arc[0].length;
    if (bufSize < arcLen) {
      bufSize = Math.round(arcLen * 1.2);
      xbuf = new Float64Array(bufSize);
      ybuf = new Float64Array(bufSize);
      zbuf = new Float64Array(bufSize);
    }

    MapShaper.convLngLatToSph(arc[0], arc[1], xbuf, ybuf, zbuf);
    return simplify(xbuf, ybuf, zbuf, arcLen);
  });
  return data;
};




// Snap together points within a small threshold
// @xx, @yy arrays of x, y coords
// @nn array of path lengths
// @points (optional) array, snapped coords are added so they can be displayed
//
MapShaper.autoSnapCoords = function(xx, yy, nn, threshold, points) {
  var avgSeg = MapShaper.getAverageSegment(MapShaper.getSegmentIter(xx, yy, nn), 3),
      avgDist = (avgSeg[0] + avgSeg[1]), // avg. dx + dy -- crude approximation
      snapDist = avgDist * 0.0025,
      snapCount = 0;

  if (threshold) {
    if (threshold > avgDist) {
      message("Snapping threshold is larger than average segment length -- ignoring");
    } else if (threshold > 0) {
      message(Utils.format("Applying snapping threshold of %s -- %.6f times avg. segment length", threshold, threshold / avgDist));
      snapDist = threshold;
    }
  }

  // Get sorted coordinate ids
  // Consider: speed up sorting -- try bucket sort as first pass.
  //
  var ids = MapShaper.sortCoordinateIds(xx);

  for (var i=0, n=ids.length; i<n; i++) {
    snapCount += snapPoint(i, ids, snapDist);
  }

  message(Utils.format("Snapped %s point%s", snapCount, "s?"));

  function snapPoint(i, ids, limit) {
    var j = i,
        n = ids.length,
        id1 = ids[i],
        x = xx[id1],
        y = yy[id1],
        snaps = 0,
        dist, id2, x2, y2;

    while (++j < n) {
      id2 = ids[j];
      x2 = xx[id2];
      if (x2 - x > limit) {
        break;
      }
      y2 = yy[id2];
      // don't snap identical points
      if (x === x2 && y === y2) {
        continue;
      }
      dist = distance2D(x, y, x2, y2);
      if (dist < limit) {
        xx[id2] = x;
        yy[id2] = y;
        snaps++;
        if (points) {
          points.push([[x, x2], [y, y2]]);
        }
      }
    }
    return snaps;
  }
};

// Returns array of array ids, in ascending order.
// @a array of numbers
//
MapShaper.sortCoordinateIds = function(a) {
  var n = a.length,
      ids = new Uint32Array(n);
  for (var i=0; i<n; i++) {
    ids[i] = i;
  }
  MapShaper.quicksortIds(a, ids, 0, ids.length-1);
  return ids;
};

MapShaper.quicksortIds = function (a, ids, lo, hi) {
  var i = lo,
      j = hi,
      pivot, tmp;
  while (i < hi) {
    pivot = a[ids[lo + hi >> 1]];
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
    if (j - lo > 0) MapShaper.quicksortIds(a, ids, lo, j);
    lo = i;
    j = hi;
  }
};




// Convert path data from a non-topological source (Shapefile, GeoJSON, etc)
// into a topoological format
//
function PathImporter(pointCount, opts) {
  opts = opts || {};
  var xx = new Float64Array(pointCount),
      yy = new Float64Array(pointCount),
      buf = new Float64Array(1024),
      round = null;

  if (opts.precision) {
    round = getRoundingFunction(opts.precision);
  }

  var paths = [],
      pointId = 0,
      shapeId = -1;

  this.startShape = function() {
    shapeId++;
  };

  this.roundCoords = function(arr, round) {
    for (var i=0, n=arr.length; i<n; i++) {
      arr[i] = round(arr[i]);
    }
  };

  this.cleanPaths = function(xx, yy, paths) {
    var offs = 0,
        ins = 0,
        openPathCount = 0,
        dupeCount = 0,
        validPaths = [],
        nn = [];
    Utils.forEach(paths, function(path, pathId) {
      var validPoints,
          startId = ins,
          n = path.size,
          err = null,
          i, x, y, prevX, prevY;
      for (i=0; i<n; i++, offs++) {
        x = xx[offs];
        y = yy[offs];
        if (i === 0 || prevX != x || prevY != y) {
          xx[ins] = x;
          yy[ins] = y;
          ins++;
        } else {
          dupeCount++;
        }
        prevX = x;
        prevY = y;
      }
      validPoints = ins - startId;

      if (path.isRing) {
        if (validPoints < 4) {
          err = "Only " + validPoints + " valid points in ring";
        }
        // If number of points in ring have changed (e.g. from snapping) or if
        // coords were rounded, check for collapsed or inverted rings.
        else if (validPoints < path.size || round) {
          var area = msSignedRingArea(xx, yy, startId, validPoints);
          if (area === 0) {
            err = "Collapsed ring";
          } else if (area < 0 != path.area < 0) {
            err = "Inverted ring";
          }
        }
        // Catch rings that were originally empty
        else if (path.area === 0) {
          err = "Zero-area ring";
        }
      } else {
        if (validPoints < 2) {
          err = "Collapsed open path";
        } else {
          openPathCount++;
        }
      }

      if (err) {
        trace(err + " -- skipping a path.");
        ins -= validPoints;
      } else {
        nn.push(validPoints);
        validPaths.push(path);
      }
    });

    if (dupeCount > 0) {
      trace(Utils.format("Removed %,d duplicate point%s", dupeCount, "s?"));
    }

    return {
      xx: xx.subarray(0, ins),
      yy: yy.subarray(0, ins),
      nn: nn,
      validPaths: validPaths,
      openPathCount: openPathCount,
      invalidPointCount: offs - ins,
      validPointCount: ins
    };
  };

  // Import coordinates from an array with coordinates in format: [x, y, x, y, ...]
  // @offs Array index of first coordinate
  //
  this.importCoordsFromFlatArray = function(arr, offs, pointCount) {
    var startId = pointId,
        x, y;

    for (var i=0; i<pointCount; i++) {
      x = arr[offs++];
      y = arr[offs++];
      xx[pointId] = x;
      yy[pointId] = y;
      pointId++;
    }
    var isRing = pointCount > 1 && xx[startId] === x && yy[startId] === y;
    var path = {
      size: pointCount,
      shapeId: shapeId,
      isRing: isRing
    };

    if (isRing) {
      path.area = msSignedRingArea(xx, yy, startId, pointCount);
    }

    paths.push(path);
    return path;
  };

  // Import an array of [x, y] Points
  //
  this.importPoints = function(points, isHole) {
    var n = points.length,
        size = n * 2,
        p;
    if (buf.length < size) buf = new Float64Array(Math.ceil(size * 1.3));
    for (var i=0, j=0; i < n; i++) {
      p = points[i];
      buf[j++] = p[0];
      buf[j++] = p[1];
    }
    var startId = pointId;
    var path = this.importCoordsFromFlatArray(buf, 0, n);
    if (path.isRing) {
      if (isHole && path.area > 0 || !isHole && path.area < 0) {
        trace("Warning: reversing", isHole ? "a CW hole" : "a CCW ring");
        MapShaper.reversePathCoords(xx, startId, path.size);
        MapShaper.reversePathCoords(yy, startId, path.size);
        path.area = -path.area;
      }
    }
  };

  // Return topological shape data
  // Applies any requested snapping and rounding
  // Removes duplicate points, checks for ring inversions
  //
  this.done = function() {
    var snappedPoints;
    if (round) {
      this.roundCoords(xx, round);
      this.roundCoords(yy, round);
    }
    if (opts.snapping) {
      T.start();
      var nn = Utils.pluck(paths, 'size'); // TODO: refactor
      snappedPoints = opts.debug_snapping ? [] : null;
      MapShaper.autoSnapCoords(xx, yy, nn, opts.snap_interval, snappedPoints);
      T.stop("Snapping points");
    }

    var pathData = this.cleanPaths(xx, yy, paths);
    var info = {
      snapped_points: snappedPoints,
      input_path_count: pathData.validPaths.length,
      input_point_count: pathData.validPointCount,
      input_skipped_points: pathData.invalidPointCount,
      input_shape_count: shapeId + 1,
      input_geometry_type: pathData.openPathCount > 0 ? 'polyline' : 'polygon'
    };

    return {
      geometry: pathData,
      info: info
    };
  };
}




MapShaper.getEncodings = function() {
  var encodings = MapShaper.getIconvLiteEncodings();
  encodings = encodings.concat(MapShaper.getJapaneseEncodings());
  return Utils.uniq(encodings);
};

MapShaper.getIconvLiteEncodings = function() {
  var iconv = require('iconv-lite');
  iconv.encodingExists('ascii'); // make iconv load its encodings
  return Utils.filter(Utils.keys(iconv.encodings), function(name) {
    return !/^(internal|singlebyte|table|cp)/.test(name);
  });
};

// List of encodings from jconv (hard-coded, because not exposed by the library)
MapShaper.getJapaneseEncodings = function() {
  return ['jis', 'iso2022jp', 'iso2022jp1', 'shiftjis', 'eucjp'];
};

MapShaper.requireConversionLib = function(encoding) {
  var conv;
  if (Utils.contains(MapShaper.getJapaneseEncodings(), encoding)) {
    conv = require('jconv');
  } else {
    conv = require('iconv-lite');
  }
  return conv;
};

MapShaper.getFormattedEncodings = function() {
  var encodings = MapShaper.getEncodings(),
      longest = Utils.reduce(encodings, function(len, str) {
        return Math.max(len, str.length);
      }, 0),
      padding = longest + 2,
      perLine = Math.floor(80 / padding);
  encodings.sort();
  return Utils.reduce(encodings, function(str, name, i) {
    if (i > 0 && i % perLine === 0) str += '\n';
    return str + Utils.rpad(name, padding, ' ');
  }, '');
};

MapShaper.printEncodings = function() {
  console.log("Supported encodings:");
  console.log(MapShaper.getFormattedEncodings());
};



//
// DBF format references:
// http://www.dbf2002.com/dbf-file-format.html
// http://www.digitalpreservation.gov/formats/fdd/fdd000325.shtml
// http://www.clicketyclick.dk/databases/xbase/format/index.html
// http://www.clicketyclick.dk/databases/xbase/format/data_types.html

var Dbf = {};

var RE_UTF8 = /^utf-?8$/i;

Dbf.importRecords = function(src, encoding) {
  return new DbfReader(src, encoding).readRows();
};

Dbf.getStringReaderAscii = function(size) {
  return function(bin) {
    var require7bit = Env.inNode;
    var str = bin.readCString(size, require7bit);
    if (str === null) {
      stop("DBF file contains non-ascii text data.\n" +
          "Use the --encoding option with one of these encodings:\n" +
          MapShaper.getFormattedEncodings());
    }
    return Utils.trim(str);
  };
};

Dbf.getStringReaderEncoded = function(size, encoding) {
  var iconv = MapShaper.requireConversionLib(encoding),
      buf = new Buffer(size),
      isUtf8 = RE_UTF8.test(encoding);
  return function(bin) {
    var i, c, eos = false;
    for (i=0; i<size; i++) {
      c = bin.readUint8();
      if (c === 0) break;
      buf[i] = c;
    }
    if (i === 0) {
      str = '';
    } else if (isUtf8) {
      str = buf.toString('utf8', 0, i);
    } else {
      str = iconv.decode(buf.slice(0, i), encoding);
    }
    str = Utils.trim(str);
    return str;
  };
};

Dbf.getStringReader = function(size, encoding) {
  if (encoding === 'ascii') {
    return Dbf.getStringReaderAscii(size);
  } else if (Env.inNode) {
    // console.log(name)
    return Dbf.getStringReaderEncoded(size, encoding);
  }
  // TODO: user browserify or other means of decoding string data in the browser
  error("[Dbf.getStringReader()] Non-ascii encodings only supported in Node.");
};


// cf. http://code.google.com/p/stringencoding/
//
// @src is a Buffer or ArrayBuffer or filename
//
function DbfReader(src, encoding) {
  if (Utils.isString(src)) {
    src = Node.readFile(src);
  }
  var bin = new BinArray(src).littleEndian();
  encoding = encoding || 'ascii';
  this.header = this.readHeader(bin, encoding);
  this.bin = bin;
  this.recordCount = this.header.recordCount;
  this.fieldCount = this.header.fields.length;
}


DbfReader.prototype.readCol = function(c) {
  var rows = this.header.recordCount,
      col = [];
  for (var r=0; r<rows; r++) {
    col[r] = this.readRowCol(r, c);
  }
  return col;
};

// TODO: handle cols with the same name
//
DbfReader.prototype.readCols = function() {
  var data = {};
  Utils.forEach(this.header.fields, function(field, col) {
    data[field.name] = this.readCol(col);
  }, this);
  return data;
};

DbfReader.prototype.readRows = function() {
  var fields = this.header.fields,
    rows = this.header.recordCount,
    cols = fields.length,
    names = Utils.map(fields, function(f) {return f.name}),
    data = [];

  for (var r=0; r<rows; r++) {
    var rec = data[r] = {};
    for (var c=0; c < cols; c++) {
      rec[names[c]] = this.readRowCol(r, c);
    }
  }
  return data;
};

DbfReader.prototype.readRowCol = function(r, c) {
  var field = this.header.fields[c],
      offs = this.header.headerSize + this.header.recordSize * r + field.columnOffset;
  return field.reader(this.bin.position(offs));
};

DbfReader.prototype.readHeader = function(bin, encoding) {
  var header = {
    version: bin.readInt8(),
    updateYear: bin.readUint8(),
    updateMonth: bin.readUint8(),
    updateDay: bin.readUint8(),
    recordCount: bin.readUint32(),
    headerSize: bin.readUint16(),
    recordSize: bin.readUint16(),
    incompleteTransaction: bin.skipBytes(2).readUint8(),
    encrypted: bin.readUint8(),
    mdx: bin.skipBytes(12).readUint8(),
    language: bin.readUint8()
  };

  bin.skipBytes(2);
  header.fields = [];
  var colOffs = 1; // first column starts on second byte of record
  while (bin.peek() != 0x0D) {
    var field = this.readFieldHeader(bin, encoding);
    field.columnOffset = colOffs;
    colOffs += field.size;
    header.fields.push(field);
  }

  if (colOffs != header.recordSize)
    error("Record length mismatch; header:", header.recordSize, "detected:", colOffs);
  return header;
};

Dbf.getNumberReader = function(size, decimals) {
  return function(bin) {
    var str = bin.readCString(size);
    return parseFloat(str);
  };
};

Dbf.getIntegerReader = function() {
  return function(bin) {
    return bin.readInt32();
  };
};

DbfReader.prototype.readFieldHeader = function(bin, encoding) {
  var field = {
    name: bin.readCString(11),
    type: String.fromCharCode(bin.readUint8()),
    address: bin.readUint32(),
    size: bin.readUint8(),
    decimals: bin.readUint8(),
    id: bin.skipBytes(2).readUint8(),
    position: bin.skipBytes(2).readUint8(),
    indexFlag: bin.skipBytes(7).readUint8()
  };

  if (field.type == 'C') {
    field.reader = Dbf.getStringReader(field.size, encoding);
  } else if (field.type == 'F' || field.type == 'N') {
    field.reader = Dbf.getNumberReader(field.size, field.decimals);
  } else if (field.type == 'I') {
    field.reader = Dbf.getIntegerReader();
  } else if (field.type == 'L') {
    field.reader = function(bin) {
      var c = bin.readCString(field.size),
          val = null;
      if (/[ty]/i.test(c)) val = true;
      else if (/[fn]/i.test(c)) val = false;
      return val;
    };
  } else if (field.type == 'D') {
    field.reader = function(bin) {
      var str = bin.readCString(field.size),
          yr = str.substr(0, 4),
          mo = str.substr(4, 2),
          day = str.substr(6, 2);
      return new Date(Date.UTC(+yr, +mo - 1, +day));
    };
  } else {
    error("Unsupported DBF field type:", field.type);
  }
  return field;
};

// export for testing
MapShaper.dbf = {
  Dbf: Dbf,
  DbfReader: DbfReader
};




Dbf.exportRecords = function(arr, encoding) {
  encoding = encoding || 'ascii';
  var fields = Utils.keys(arr[0]);
  var rows = arr.length;
  var fieldData = Utils.map(fields, function(name) {
    return Dbf.getFieldInfo(arr, name, encoding);
  });

  var headerBytes = Dbf.getHeaderSize(fieldData.length),
      recordBytes = Dbf.getRecordSize(Utils.pluck(fieldData, 'size')),
      fileBytes = headerBytes + rows * recordBytes + 1;

  var buffer = new ArrayBuffer(fileBytes);
  var bin = new BinArray(buffer).littleEndian();
  var now = new Date();

  // write header
  bin.writeUint8(3);
  bin.writeUint8(now.getFullYear() - 1900);
  bin.writeUint8(now.getMonth() + 1);
  bin.writeUint8(now.getDate());
  bin.writeUint32(rows);
  bin.writeUint16(headerBytes);
  bin.writeUint16(recordBytes);
  bin.skipBytes(17);
  bin.writeUint8(0); // language flag; TODO: improve this
  bin.skipBytes(2);

  // field subrecords
  Utils.reduce(fieldData, function(recordOffset, obj) {
    var fieldName = Dbf.getValidFieldName(obj.name);
    bin.writeCString(fieldName, 11);
    bin.writeUint8(obj.type.charCodeAt(0));
    bin.writeUint32(recordOffset);
    bin.writeUint8(obj.size);
    bin.writeUint8(obj.decimals);
    bin.skipBytes(14);
    return recordOffset + obj.size;
  }, 1);

  bin.writeUint8(0x0d); // "field descriptor terminator"
  if (bin.position() != headerBytes) {
    error("Dbf#exportRecords() header size mismatch; expected:", headerBytes, "written:", bin.position());
  }

  Utils.forEach(arr, function(rec, i) {
    var start = bin.position();
    bin.writeUint8(0x20); // delete flag; 0x20 valid 0x2a deleted
    for (var j=0, n=fieldData.length; j<n; j++) {
      fieldData[j].write(i, bin);
    }
    if (bin.position() - start != recordBytes) {
      error("#exportRecords() Error exporting record:", rec);
    }
  });

  bin.writeUint8(0x1a); // end-of-file

  if (bin.position() != fileBytes) {
    error("Dbf#exportRecords() file size mismatch; expected:", fileBytes, "written:", bin.position());
  }
  return buffer;
};

Dbf.getHeaderSize = function(numFields) {
  return 33 + numFields * 32;
};

Dbf.getRecordSize = function(fieldSizes) {
  return Utils.sum(fieldSizes) + 1; // delete byte plus data bytes
};

Dbf.getValidFieldName = function(name) {
  // TODO: handle non-ascii chars in name
  return name.substr(0, 10); // max 10 chars
};

Dbf.initNumericField = function(info, arr, name) {
  var MAX_FIELD_SIZE = 18,
      size;

  data = this.getNumericFieldInfo(arr, name);
  info.decimals = data.decimals;
  size = Math.max(data.max.toFixed(info.decimals).length,
      data.min.toFixed(info.decimals).length);
  if (size > MAX_FIELD_SIZE) {
    size = MAX_FIELD_SIZE;
    info.decimals -= size - MAX_FIELD_SIZE;
    if (info.decimals < 0) {
      error ("Dbf#getFieldInfo() Out-of-range error.");
    }
  }
  info.size = size;

  var formatter = Dbf.getDecimalFormatter(size, info.decimals);
  info.write = function(i, bin) {
    var rec = arr[i],
        str = formatter(rec[name]);
    if (str.length < size) {
      str = Utils.lpad(str, size, ' ');
    }
    bin.writeString(str, size);
  };
};

Dbf.initBooleanField = function(info, arr, name) {
  info.size = 1;
  info.write = function(i, bin) {
    var val = arr[i][name],
        c;
    if (val === true) c = 'T';
    else if (val === false) c = 'F';
    else c = '?';
    bin.writeString(c);
  };
};

Dbf.initDateField = function(info, arr, name) {
  info.size = 8;
  info.write = function(i, bin) {
    var d = arr[i][name],
        str;
    if (d instanceof Date === false) {
      str = '00000000';
    } else {
      str = Utils.lpad(d.getUTCFullYear(), 4, '0') +
            Utils.lpad(d.getUTCMonth() + 1, 2, '0') +
            Utils.lpad(d.getUTCDate(), 2, '0');
    }
    bin.writeString(str);
  };
};

Dbf.initStringField = function(info, arr, name, encoding) {
  var formatter = Dbf.getStringWriter(encoding);
  var maxLen = 0;
  var values = Utils.map(arr, function(rec) {
    var buf = formatter(rec[name]);
    maxLen = Math.max(maxLen, buf.byteLength);
    return buf;
  });
  var size = Math.min(maxLen, 254);
  info.size = size;
  info.write = function(i, bin) {
    var buf = values[i],
        bytes = Math.min(size, buf.byteLength),
        idx = bin.position();
    bin.writeBuffer(buf, bytes, 0);
    bin.position(idx + size);
  };
};

Dbf.getFieldInfo = function(arr, name, encoding) {
  var type = this.discoverFieldType(arr, name),
      info = {
        name: name,
        type: type,
        decimals: 0
      };
  if (type == 'N') {
    Dbf.initNumericField(info, arr, name);
  } else if (type == 'C') {
    Dbf.initStringField(info, arr, name, encoding);
  } else if (type == 'L') {
    Dbf.initBooleanField(info, arr, name);
  } else if (type == 'D') {
    Dbf.initDateField(info, arr, name);
  } else {
    error("[dbf] Type error exporting field:", name);
  }
  return info;
};

Dbf.discoverFieldType = function(arr, name) {
  var val;
  for (var i=0, n=arr.length; i<n; i++) {
    val = arr[i][name];
    if (Utils.isString(val)) return "C";
    if (Utils.isNumber(val)) return "N";
    if (Utils.isBoolean(val)) return "L";
    if (val instanceof Date) return "D";
  }
  return "null" ;
};

Dbf.getDecimalFormatter = function(size, decimals) {
  // TODO: find better way to handle nulls
  var nullValue = ' '; // ArcGIS may use 0
  return function(val) {
    // TODO: handle invalid values better
    var valid = val && isFinite(val) || val === 0,
        strval = valid ? val.toFixed(decimals) : String(nullValue);
    return Utils.lpad(strval, size, ' ');
  };
};

Dbf.getNumericFieldInfo = function(arr, name) {
  var maxDecimals = 0,
      limit = 15,
      min = Infinity,
      max = -Infinity,
      k = 1,
      val, decimals;
  for (var i=0, n=arr.length; i<n; i++) {
    val = arr[i][name];
    if (!Number.isFinite(val)) {
      continue;
    }
    decimals = 0;
    if (val < min) min = val;
    if (val > max) max = val;
    while (val * k % 1 !== 0) {
      if (decimals == limit) {
        // TODO: verify limit, remove oflo message, round overflowing values
        trace ("#getNumericFieldInfo() Number field overflow; value:", val)
        break;
      }
      decimals++;
      k *= 10;
    }
    if (decimals > maxDecimals) maxDecimals = decimals;
  }
  return {
    decimals: maxDecimals,
    min: min,
    max: max
  };
};

// Return function to convert a JS str to an ArrayBuffer containing encoded str.
Dbf.getStringWriter = function(encoding) {
  if (encoding === 'ascii') {
    return Dbf.getStringWriterAscii();
  } else if (Env.inNode) {
    return Dbf.getStringWriterEncoded(encoding);
  }
  error("[Dbf.getStringWriter()] Non-ascii encodings only supported in Node.");
};

// TODO: handle non-ascii chars. Option: switch to
// utf8 encoding if non-ascii chars are found.
Dbf.getStringWriterAscii = function() {
  return function(val) {
    var str = String(val),
        n = str.length,
        dest = new ArrayBuffer(n),
        view = new Uint8ClampedArray(dest);
    for (var i=0; i<n; i++) {
      view[i] = str.charCodeAt(i);
    }
    return dest;
  };
};

Dbf.getStringWriterEncoded = function(encoding) {
  var iconv = MapShaper.requireConversionLib(encoding);
  return function(val) {
    var buf = iconv.encode(val, encoding);
    return BinArray.toArrayBuffer(buf);
  };
};




var dataFieldRxp = /^[a-zA-Z_][a-zA-Z_0-9]*$/;

function DataTable(obj) {
  var records;
  if (Utils.isArray(obj)) {
    records = obj;
  } else {
    records = [];
    // integer object: create empty records
    if (Utils.isInteger(obj)) {
      for (var i=0; i<obj; i++) {
        records.push({});
      }
    } else if (obj) {
      error("[DataTable] Invalid constructor argument:", obj);
    }
  }

  this.exportAsDbf = function(encoding) {
    return Dbf.exportRecords(records, encoding);
  };

  this.getRecords = function() {
    return records;
  };
}

var dataTableProto = {
  fieldExists: function(name) {
    return Utils.contains(this.getFields(), name);
  },

  exportAsJSON: function() {
    return JSON.stringify(this.getRecords());
  },

  addField: function(name, init) {
    var useFunction = Utils.isFunction(init);
    if (!Utils.isNumber(init) && !Utils.isString(init) && !useFunction) {
      error("DataTable#addField() requires a string, number or function for initialization");
    }
    if (this.fieldExists(name)) error("DataTable#addField() tried to add a field that already exists:", name);
    if (!dataFieldRxp.test(name)) error("DataTable#addField() invalid field name:", name);

    Utils.forEach(this.getRecords(), function(obj, i) {
      obj[name] = useFunction ? init(obj, i) : init;
    });
  },

  addIdField: function() {
    this.addField('FID', function(obj, i) {
      return i;
    });
  },

  deleteField: function(f) {
    this.getRecords().forEach(function(o) {
      delete o[f];
    });
  },

  indexOn: function(f) {
    this._index = Utils.indexOn(this.getRecords(), f);
  },

  getIndexedRecord: function(val) {
    return this._index && this._index[val] || null;
  },

  clearIndex: function() {
    this._index = null;
  },

  getFields: function() {
    var records = this.getRecords();
    return records.length > 0 ? Utils.keys(records[0]) : [];
  },

  size: function() {
    return this.getRecords().length;
  }
};

Utils.extend(DataTable.prototype, dataTableProto);

// Implements the DataTable api for DBF file data.
// We avoid touching the raw DBF field data if possible. This way, we don't need
// to parse the DBF at all in common cases, like importing a Shapefile, editing
// just the shapes and exporting in Shapefile format.
//
function ShapefileTable(buf, encoding) {
  encoding = encoding || 'ascii';
  var reader = new DbfReader(buf, encoding);
  var table;

  function getTable() {
    if (!table) {
      // export DBF records on first table access
      table = new DataTable(reader.readRows());
      reader = null;
      buf = null; // null out references to DBF data for g.c.
    }
    return table;
  }

  this.exportAsDbf = function(encoding) {
    // export original dbf string if records haven't been touched.
    return buf || table.exportAsDbf(encoding);
  };

  this.getRecords = function() {
    return getTable().getRecords();
  };

  this.getFields = function() {
    return reader ? Utils.pluck(reader.header.fields, 'name') : table.getFields();
  };

  this.size = function() {
    return reader ? reader.recordCount : table.size();
  };
}

Utils.extend(ShapefileTable.prototype, dataTableProto);

// export for testing
MapShaper.data = {
  DataTable: DataTable,
  ShapefileTable: ShapefileTable
};




MapShaper.importGeoJSON = function(obj, opts) {
  if (Utils.isString(obj)) {
    obj = JSON.parse(obj);
  }
  var supportedGeometries = Utils.getKeys(GeoJSON.pathImporters);
  var supportedTypes = supportedGeometries.concat(['FeatureCollection', 'GeometryCollection']);

  if (!Utils.contains(supportedTypes, obj.type)) {
    error("#importGeoJSON() Unsupported type:", obj.type);
  }

  // Convert single feature or geometry into a collection with one member
  //
  if (obj.type == 'Feature') {
    obj = {
      type: 'FeatureCollection',
      features: [obj]
    };
  } else if (Utils.contains(supportedGeometries, obj.type)) {
    obj = {
      type: 'GeometryCollection',
      geometries: [obj]
    };
  }

  var properties = null, geometries;
  if (obj.type == 'FeatureCollection') {
    properties = [];
    geometries = obj.features.map(function(feat) {
      properties.push(feat.properties);
      return feat.geometry;
    });
  } else {
    geometries = obj.geometries;
  }

  // Count points in dataset (PathImporter needs total points to initialize buffers)
  //
  var pointCount = Utils.reduce(geometries, function(sum, geom) {
    if (geom) { // geom may be null
      var depth = GeoJSON.geometryDepths[geom.type] || 0;
      sum += GeoJSON.countNestedPoints(geom.coordinates, depth);
    }
    return sum;
  }, 0);

  // Import GeoJSON geometries
  //
  var importer = new PathImporter(pointCount, opts);
  geometries.forEach(function(geom) {
    importer.startShape();
    var f = geom && GeoJSON.pathImporters[geom.type];
    if (f) f(geom.coordinates, importer);
  });

  var importData = importer.done();
  if (properties) {
    importData.data = new DataTable(properties);
  }
  return importData;
};


var GeoJSON = MapShaper.geojson = {};

// Functions for importing geometry coordinates using a PathImporter
//
GeoJSON.pathImporters = {
  LineString: function(coords, importer) {
    importer.importPoints(coords, false);
  },
  MultiLineString: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      GeoJSON.pathImporters.LineString(coords[i], importer);
    }
  },
  Polygon: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      importer.importPoints(coords[i], i > 0);
    }
  },
  MultiPolygon: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      GeoJSON.pathImporters.Polygon(coords[i], importer);
    }
  }
};

// Nested depth of GeoJSON Points in coordinates arrays
//
GeoJSON.geometryDepths = {
  LineString: 1,
  MultiLineString: 2,
  Polygon: 2,
  MultiPolygon: 3
};


// Sum points in a GeoJSON coordinates array
//
GeoJSON.countNestedPoints = function(coords, depth) {
  var tally = 0;
  if (depth == 1) {
    tally = coords.length;
  } else if (depth > 1) {
    for (var i=0, n=coords.length; i<n; i++) {
      tally += GeoJSON.countNestedPoints(coords[i], depth-1);
    }
  }
  return tally;
};

MapShaper.exportGeoJSON = function(layers, arcData, opts) {
  return layers.map(function(layer) {
    return {
      content: MapShaper.exportGeoJSONString(layer, arcData, opts),
      name: layer.name
    };
  });
};

MapShaper.exportGeoJSONString = function(layerObj, arcData, opts) {
  var type = layerObj.geometry_type;
  if (type != "polygon" && type != "polyline") error("#exportGeoJSONString() Unsupported geometry type:", type);

  var geomType = type == 'polygon' ? 'MultiPolygon' : 'MultiLineString',
      properties = layerObj.data && layerObj.data.getRecords() || null,
      useFeatures = !!properties && (!opts || !opts.cut_table);

  if (useFeatures && properties.length !== layerObj.shapes.length) {
    error("#exportGeoJSON() Mismatch between number of properties and number of shapes");
  }
  var exporter = new PathExporter(arcData, type == 'polygon');
  var objects = Utils.reduce(layerObj.shapes, function(memo, shapeIds, i) {
    var shape = exporter.exportShapeForGeoJSON(shapeIds),
        obj, str;
    if (useFeatures) {
      obj = MapShaper.exportGeoJSONFeature(shape, geomType, properties[i]);
    } else {
      obj = MapShaper.exportGeoJSONGeometry(shape, geomType);
      // null geometries not allowed in GeometryCollection, filter them
      if (obj === null) return memo;
    }
    str = JSON.stringify(obj);
    return memo === "" ? str : memo + ",\n" + str;
  }, "");

  var output = {},
      bounds = exporter.getBounds();

  if (bounds.hasBounds()) {
    output.bbox = bounds.toArray();
  }

  if (useFeatures) {
    output.type = 'FeatureCollection';
    output.features = ["$"];
  } else {
    output.type = 'GeometryCollection';
    output.geometries = ["$"];
  }

  var parts = JSON.stringify(output).split('"$"');
  return parts[0] + objects + parts[1];
};

MapShaper.exportGeoJSONObject = function(layerObj, arcData, opts) {
  return JSON.parse(MapShaper.exportGeoJSONString(layerObj, arcData, opts));
};

MapShaper.exportGeoJSONGeometry = function(coords, type) {
  var geom = {};

  if (!coords || !coords.length) {
    geom = null; // null geometry
  }
  else if (type == 'MultiPolygon') {
    if (coords.length == 1) {
      geom.type = "Polygon";
      geom.coordinates = coords[0];
    } else {
      geom.type = "MultiPolygon";
      geom.coordinates = coords;
    }
  }
  else if (type == 'MultiLineString') {
    if (coords.length == 1) {
      geom.type = "LineString";
      geom.coordinates = coords[0];
    } else {
      geom.type = "MultiLineString";
      geom.coordinates = coords;
    }
  }
  else {
    geom = null;
  }
  return geom;
};

MapShaper.exportGeoJSONFeature = function(coords, type, properties) {
  var feature = {
    type: "Feature",
    properties: properties || null,
    geometry: MapShaper.exportGeoJSONGeometry(coords, type)
  };
  return feature;
};

function exportCoordsForGeoJSON(paths) {
  return Utils.map(paths, function(path) {
    return path.toArray();
  });
}



var TopoJSON = {};

// Converts arc coordinates from rounded, delta-encoded values to
// transposed arrays of geographic coordinates.
//
TopoJSON.importArcs = function(arcs, transform, round) {
  TopoJSON.decodeArcs(arcs, transform, round);
  return Utils.map(arcs, function(arc) {
    var xx = [],
        yy = [];
    for (var i=0, len=arc.length; i<len; i++) {
      xx.push(arc[i][0]);
      yy.push(arc[i][1]);
    }
    return [xx, yy];
  });
};

TopoJSON.decodeArcs = function(arcs, transform, round) {
  var mx = 1, my = 1, bx = 0, by = 0,
      useDelta = !!transform;
  if (transform) {
    mx = transform.scale[0];
    my = transform.scale[1];
    bx = transform.translate[0];
    by = transform.translate[1];
  }

  Utils.forEach(arcs, function(arc) {
    var prevX = 0,
        prevY = 0,
        scaledX, scaledY, xy, x, y;
    for (var i=0, len=arc.length; i<len; i++) {
      xy = arc[i];
      x = xy[0];
      y = xy[1];
      if (useDelta) {
        x += prevX;
        y += prevY;
      }
      scaledX = x * mx + bx;
      scaledY = y * my + by;
      if (round) {
        scaledX = round(scaledX);
        scaledY = round(scaledY);
      }
      xy[0] = scaledX;
      xy[1] = scaledY;
      prevX = x;
      prevY = y;
    }
  });
};

TopoJSON.importObject = function(obj, arcs) {
  if (obj.type != 'GeometryCollection') {
    obj = {
      type: "GeometryCollection",
      geometries: [obj]
    };
  }
  return TopoJSON.importGeometryCollection(obj, arcs);
};

TopoJSON.importGeometryCollection = function(obj, arcs) {
  var importer = new TopoJSON.Importer(arcs.length);
  Utils.forEach(obj.geometries, function(geom) {
    importer.startShape(geom.properties, geom.id);
    var pathImporter = TopoJSON.pathImporters[geom.type];
    if (pathImporter) {
      pathImporter(geom.arcs, importer);
    } else if (geom.type) {
      trace("TopoJSON.importGeometryCollection() Unsupported geometry type:", geom.type);
    } else {
      // null geometry -- ok
    }
  });
  return importer.done();
};

TopoJSON.Importer = function(numArcs) {
  var geometries = [],
      currGeometry,
      paths = [],
      shapeProperties = [],
      shapeIds = [],
      currIdx = -1;

  this.startShape = function(properties, id) {
    currIdx++;
    if (properties) {
      shapeProperties[currIdx] = properties;
    }
    if (id !== null && id !== undefined) {
      shapeIds[currIdx] = id;
    }
    currGeometry = geometries[currIdx] = [];
  };

  this.importPath = function(ids, isRing, isHole) {
    paths.push({
      isRing: !!isRing,
      isHole: !!isHole,
      shapeId: currIdx
    });
    currGeometry.push(ids);
  };

  this.done = function() {
    var data;
    var openCount = Utils.reduce(paths, function(count, path) {
      if (!path.isRing) count++;
      return count;
    }, 0);

    return {
      paths: paths,
      geometry_type: openCount > 0 ? 'polyline' : 'polygon',
      shapes: geometries,
      properties: shapeProperties.length > 0 ? shapeProperties : null,
      ids: shapeIds.length > 0 ? shapeIds : null
    };
  };
};

TopoJSON.pathImporters = {
  LineString: function(arr, importer) {
    importer.importPath(arr, false, false);
  },
  MultiLineString: function(arr, importer) {
    for (var i=0; i<arr.length; i++) {
      TopoJSON.pathImporters.LineString(arr[i], importer);
    }
  },
  Polygon: function(arr, importer) {
    for (var i=0; i<arr.length; i++) {
      importer.importPath(arr[i], true, i > 0);
    }
  },
  MultiPolygon: function(arr, importer) {
    for (var i=0; i<arr.length; i++) {
      TopoJSON.pathImporters.Polygon(arr[i], importer);
    }
  }
};




// Divide a TopoJSON topology into multiple topologies, one for each
// named geometry object.
// Arcs are filtered and arc ids are reindexed as needed.
//
TopoJSON.splitTopology = function(topology) {
  var topologies = {};
  Utils.forEach(topology.objects, function(obj, name) {
    var split = {
      arcs: TopoJSON.extractGeometryObject(obj, topology.arcs),
      bbox: obj.bbox || null,
      objects: {}
    };
    split.objects[name] = obj;
    Opts.copyNewParams(split, topology);
    topologies[name] = split;
  });
  return topologies;
};

// Filter array of arcs to include only arcs referenced by geometry object @obj
// Returns: Filtered copy of @arcs array
// Side effect: arc ids in @obj are re-indexed to match filtered arcs.
//
TopoJSON.extractGeometryObject = function(obj, arcs) {
  if (!Utils.isArray(arcs)) {
    error("Usage: TopoJSON.extractObject(object, arcs)");
  }

  // Mark arcs that are present in this object
  var flags = new Uint8Array(arcs.length);
  TopoJSON.traverseGeometryObject(obj, function(arcId) {
    if (arcId < 0) arcId = ~arcId;
    flags[arcId] = 1;
  });

  // Create array for translating original arc ids to filtered arc arrays
  var arcMap = new Uint32Array(arcs.length),
      newId = 0;
  var filteredArcs = Utils.filter(arcs, function(coords, i) {
    if (flags[i] === 1) {
      arcMap[i] = newId++;
      return true;
    }
    return false;
  });

  // Re-index
  TopoJSON.reindexArcIds(obj, arcMap);
  return filteredArcs;
};

// @map is an array of new arc ids, indexed by original arc ids.
//
TopoJSON.reindexArcIds = function(obj, map) {
  TopoJSON.traverseGeometryObject(obj, function(arcId) {
    var rev = arcId < 0,
        idx = rev ? ~arcId : arcId,
        mappedId = map[idx];
    return rev ? ~mappedId : mappedId;
  });
};

TopoJSON.traverseGeometryObject = function(obj, cb) {
  if (obj.arcs) {
    TopoJSON.traverseArcs(obj.arcs, cb);
  } else if (obj.geometries) {
    Utils.forEach(obj.geometries, function(geom) {
      TopoJSON.traverseGeometryObject(geom, cb);
    });
  }
};

// Visit each arc id in the arcs array of a geometry object.
// Use non-undefined return values of callback @cb as replacements.
//
TopoJSON.traverseArcs = function(arr, cb) {
  Utils.forEach(arr, function(item, i) {
    var val;
    if (item instanceof Array) {
      TopoJSON.traverseArcs(item, cb);
    } else {
      val = cb(item);
      if (val !== void 0) {
        arr[i] = val;
      }
    }
  });
};




MapShaper.topojson = TopoJSON;

MapShaper.importTopoJSON = function(obj, opts) {
  var round = opts && opts.precision ? getRoundingFunction(opts.precision) : null;

  if (Utils.isString(obj)) {
    obj = JSON.parse(obj);
  }
  var arcs = TopoJSON.importArcs(obj.arcs, obj.transform, round),
      layers = [];
  Utils.forEach(obj.objects, function(object, name) {
    var layerData = TopoJSON.importObject(object, arcs);
    var data;
    if (layerData.properties) {
      data = new DataTable(layerData.properties);
    }
    layers.push({
      name: name,
      data: data,
      shapes: layerData.shapes,
      geometry_type: layerData.geometry_type
    });
  });

  return {
    arcs: new ArcDataset(arcs),
    layers: layers,
    info: {}
  };
};

// TODO: Support ids from attribute data
//
MapShaper.exportTopoJSON = function(layers, arcData, opts) {
  var topology = TopoJSON.exportTopology(layers, arcData, opts),
      topologies, files;
  if (opts.topojson_divide) {
    topologies = TopoJSON.splitTopology(topology);
    files = Utils.map(topologies, function(topo, name) {
      return {
        content: JSON.stringify(topo),
        name: name
      };
    });
  } else {
    files = [{
      content: JSON.stringify(topology),
      name: ""
    }];
  }
  return files;
};

TopoJSON.exportTopology = function(layers, arcData, opts) {
  var topology = {type: "Topology"},
      objects = {},
      filteredArcs = arcData.getFilteredCopy(),
      bounds = new Bounds(),
      transform, invTransform,
      arcArr, arcIdMap;

  // TODO: getting messy, refactor
  if (opts.topojson_precision) {
    transform = TopoJSON.getExportTransform(filteredArcs, null, opts.topojson_precision);
  } else if (opts.topojson_resolution === 0) {
    // no transform
  } else if (opts.topojson_resolution > 0) {
    transform = TopoJSON.getExportTransform(filteredArcs, opts.topojson_resolution);
  } else if (opts.precision > 0) {
    transform = TopoJSON.getExportTransformFromPrecision(filteredArcs, opts.precision);
  } else {
    transform = TopoJSON.getExportTransform(filteredArcs); // auto quantization
  }

  // kludge: null transform likely due to collapsed shape(s)
  // using identity transform as a band-aid, need to rethink this.
  if (transform && transform.isNull()) {
    transform = new Transform();
  }

  if (transform) {
    invTransform = transform.invert();
    topology.transform = {
      scale: [invTransform.mx, invTransform.my],
      translate: [invTransform.bx, invTransform.by]
    };
    filteredArcs.applyTransform(transform, !!"round");
    arcIdMap = TopoJSON.filterExportArcs(filteredArcs);
    arcArr = TopoJSON.exportDeltaEncodedArcs(filteredArcs);
  } else {
    arcIdMap = TopoJSON.filterExportArcs(filteredArcs);
    arcArr = TopoJSON.exportArcs(filteredArcs);
  }

  Utils.forEach(layers, function(lyr, i) {
    var geomType = lyr.geometry_type == 'polygon' ? 'MultiPolygon' : 'MultiLineString';
    var exporter = new PathExporter(filteredArcs, lyr.geometry_type == 'polygon'),
        shapes = lyr.shapes;
    if (arcIdMap) shapes = TopoJSON.remapShapes(shapes, arcIdMap);
    var name = lyr.name || "layer" + (i + 1);
    var obj = TopoJSON.exportGeometryCollection(exporter, geomType, shapes);
    var objectBounds = exporter.getBounds();
    if (invTransform) {
      objectBounds.transform(invTransform);
    }
    if (objectBounds.hasBounds()) {
      obj.bbox = objectBounds.toArray();
    }
    objects[name] = obj;
    bounds.mergeBounds(objectBounds);

    // export attribute data, if present
    if (lyr.data) {
      TopoJSON.exportProperties(obj.geometries, lyr.data.getRecords(), opts);
    }
  });

  topology.objects = objects;
  topology.arcs = arcArr;
  if (bounds.hasBounds()) {
    topology.bbox = bounds.toArray();
  }
  return topology;
};

// TODO: consider refactoring and combining with remapping code from
// mapshaper-topojson-split.js
//
TopoJSON.remapShapes = function(shapes, map) {
  return Utils.map(shapes, function(shape) {
    return shape ? TopoJSON.remapShape(shape, map) : null;
  });
};

// Re-index the arcs in a shape to account for removal of collapsed arcs
// Return arrays of remapped arcs; original arcs are unmodified.
//
TopoJSON.remapShape = function(src, map) {
  if (!src || src.length === 0) return [];
  var dest = [],
      arcIds, path, arcNum, arcId, k, inv;

  for (var pathId=0, numPaths=src.length; pathId < numPaths; pathId++) {
    path = src[pathId];
    arcIds = [];
    for (var i=0, n=path.length; i<n; i++) {
      arcNum = path[i];
      inv = arcNum < 0;
      arcId = inv ? ~arcNum : arcNum;
      k = map[arcId];
      if (k == -1) {
        //
      } else if (k <= arcId) {
        arcIds.push(inv ? ~k : k);
      } else {
        error("Arc index problem");
      }
    }
    if (arcIds.length > 0) {
      dest.push(arcIds);
    }
  }
  return dest;
};

// Remove collapsed arcs from @arcDataset (ArcDataset) and re-index remaining
// arcs.
// Return an array mapping original arc ids to new ids (See ArcDataset#filter())
//
TopoJSON.filterExportArcs = function(arcData) {
  var arcMap = arcData.filter(function(iter, i) {
    var x, y;
    if (iter.hasNext()) {
      x = iter.x;
      y = iter.y;
      while (iter.hasNext()) {
        if (iter.x !== x || iter.y !== y) return true;
      }
    }
    return false;
  });
  return arcMap;
};

// Export arcs as arrays of [x, y] coords without delta encoding
//
TopoJSON.exportArcs = function(arcData) {
  var arcs = [];
  arcData.forEach(function(iter, i) {
    var arc = [];
    while (iter.hasNext()) {
      arc.push([iter.x, iter.y]);
    }
    arcs.push(arc.length > 1 ? arc : null);
  });
  return arcs;
};

// Export arcs with delta encoding, as per the topojson spec.
//
TopoJSON.exportDeltaEncodedArcs = function(arcData) {
  var arcs = [];
  arcData.forEach(function(iter, i) {
    var arc = [],
        x = 0,
        y = 0,
        dx, dy;
    while (iter.hasNext()) {
      dx = iter.x - x;
      dy = iter.y - y;
      if (dx !== 0 || dy !== 0) {
        arc.push([dx, dy]);
      }
      x = iter.x;
      y = iter.y;
    }
    if (arc.length <= 1) {
      trace("TopoJSON.exportDeltaEncodedArcs() defective arc, length:", arc.length);
      // defective arcs should have been filtered out earlier with ArcDataset.filter()
    }
    arcs.push(arc);
  });
  return arcs;
};

// Return a Transform object for converting geographic coordinates to quantized
// integer coordinates.
//
TopoJSON.getExportTransform = function(arcData, quanta, precision) {
  var srcBounds = arcData.getBounds(),
      destBounds, xmax, ymax;
  if (quanta) {
    xmax = quanta - 1;
    ymax = quanta - 1;
  } else {
    var resXY = TopoJSON.calcExportResolution(arcData, precision);
    xmax = srcBounds.width() / resXY[0];
    ymax = srcBounds.height() / resXY[1];
  }
  // rounding xmax, ymax ensures original layer bounds don't change after 'quantization'
  // (this could matter if a layer extends to the poles or the central meridian)
  // TODO: test this
  destBounds = new Bounds(0, 0, Math.ceil(xmax), Math.ceil(ymax));
  return srcBounds.getTransform(destBounds);
};

TopoJSON.getExportTransformFromPrecision = function(arcData, precision) {
  var src = arcData.getBounds(),
      dest = new Bounds(0, 0, src.width() / precision, src.height() / precision),
      transform = src.getTransform(dest);
  return transform;
};

// Find the x, y values that map to x / y integer unit in topojson output
// Calculated as 1/50 the size of average x and y offsets
// (a compromise between compression, precision and simplicity)
//
TopoJSON.calcExportResolution = function(arcData, precision) {
  // TODO: remove influence of long lines created by polar and antimeridian cuts
  var xy = arcData.getAverageSegment(),
      k = parseFloat(precision) || 0.02;
  return [xy[0] * k, xy[1] * k];
};

TopoJSON.exportProperties = function(geometries, records, opts) {
  geometries.forEach(function(geom, i) {
    var properties = records[i];
    if (properties) {
      if (!opts.cut_table) {
        geom.properties = properties;
      }
      if (opts.id_field) {
        geom.id = properties[opts.id_field];
      }
    }
  });
};

TopoJSON.exportGeometryCollection = function(exporter, type, shapes) {
  var obj = {
        type: "GeometryCollection"
      };
  obj.geometries = Utils.map(shapes, function(shape, i) {
    var paths = exporter.exportShapeForTopoJSON(shape);
    return TopoJSON.exportGeometry(paths, type);
  });
  return obj;
};

TopoJSON.exportGeometry = function(paths, type) {
  var obj = {};
  if (!paths || paths.length === 0) {
    // null geometry
    obj.type = null;
  }
  else if (type == 'MultiPolygon') {
    if (paths.length == 1) {
      obj.type = "Polygon";
      obj.arcs = paths[0];
    } else {
      obj.type = "MultiPolygon";
      obj.arcs = paths;
    }
  }
  else if (type == "MultiLineString") {
    if (paths.length == 1) {
      obj.arcs = paths[0];
      obj.type = "LineString";
    } else {
      obj.arcs = paths;
      obj.type = "MultiLineString";
    }
  }
  else {
    error ("TopoJSON.exportGeometry() unsupported type:", type);
  }
  return obj;
};




var ShpType = {
  NULL: 0,
  POINT: 1,
  POLYLINE: 3,
  POLYGON: 5,
  MULTIPOINT: 8,
  POINTZ: 11,
  POLYLINEZ: 13,
  POLYGONZ: 15,
  MULTIPOINTZ: 18,
  POINTM: 21,
  POLYLINEM: 23,
  POLYGONM: 25,
  MULIPOINTM: 28,
  MULTIPATCH: 31 // not supported
};

ShpType.polygonType = function(t) {
  return t == 5 || t == 15 || t == 25;
};

// Read data from a .shp file
// @src is an ArrayBuffer, Node.js Buffer or filename
//
//    // Example: read everthing into nested arrays
//    // coordinates are read as 2-4 element arrays [x,y(,z,m)]
//    // nested in arrays for shapes, parts and line-strings depending on the type
//    var reader = new ShpReader("file.shp");
//    var data = reader.read();
//
//    // Example: iterating using #nextShape()
//    var reader = new ShpReader(buf), s;
//    while (s = reader.nextShape()) {
//      // process the raw coordinate data yourself...
//      var coords = s.readCoords(); // [x,y,x,y,...]
//      var zdata = s.readZ();  // [z,z,...]
//      var mdata = s.readM();  // [m,m,...] or null
//      var partSizes = s.readPartSizes(); // for types w/ parts
//      // .. or read the shape into nested arrays
//      var data = s.read();
//    }
//
//    // Example: reading records using a callback
//    var reader = new ShpReader(buf);
//    reader.forEachShape(function(s) {
//      var data = s.read();
//    });
//
function ShpReader(src) {
  if (this instanceof ShpReader == false) {
    return new ShpReader(src);
  }

  if (Utils.isString(src)) {
    src = Node.readFile(src)
  }

  var bin = new BinArray(src),
      header = readHeader(bin);
  validateHeader(header);

  this.header = function() {
    return header;
  };

  var shapeClass = this.getRecordClass(header.type);

  // return data as nested arrays of shapes > parts > points > [x,y(,z,m)]
  // TODO: implement @format param for extracting coords in different formats
  //
  this.read = function(format) {
    var shapes = [];
    this.forEachShape(function(shp) {
      shapes.push(shp.isNull ? null : shp.read(format));
    });
    return shapes;
  }

  // Callback interface: for each record in a .shp file, pass a
  //   record object to a callback function
  //
  this.forEachShape = function(callback) {
    var shape;
    this.reset();
    while (shape = this.nextShape()) {
      callback(shape);
    }
  };

  // Iterator interface for reading shape records
  //
  var readPos = 100;

  this.nextShape = function() {
    bin.position(readPos);
    if (bin.bytesLeft() == 0) {
      this.reset();
      return null;
    }
    var shape = new shapeClass(bin);
    readPos += shape.byteLength;
    return shape;
  };

  this.reset = function() {
    readPos = 100;
  }

  function readHeader(bin) {
    return {
      signature: bin.bigEndian().readUint32(),
      byteLength: bin.skipBytes(20).readUint32() * 2,
      version: bin.littleEndian().readUint32(),
      type: bin.readUint32(),
      bounds: bin.readFloat64Array(4), // xmin, ymin, xmax, ymax
      zbounds: bin.readFloat64Array(2),
      mbounds: bin.readFloat64Array(2)
    };
  }

  function validateHeader(header) {
    if (header.signature != 9994)
      error("Not a valid .shp file");

    var supportedTypes = [1,3,5,8,11,13,15,18,21,23,25,28];
    if (!Utils.contains(supportedTypes, header.type))
      error("Unsupported .shp type:", header.type);

    if (header.byteLength != bin.size())
      error("File size doesn't match size in header");
  }
}

ShpReader.prototype.type = function() {
  return this.header().type;
}

ShpReader.prototype.hasZ = function() {
  return Utils.contains([11,13,15,18], this.type());
};

ShpReader.prototype.hasM = function() {
  return this.hasZ() || Utils.contains([21,23,25,28], this.type());
};

// i.e. non-point type
ShpReader.prototype.hasParts = function() {
  return Utils.contains([3,5,13,15,23,25], this.type());
};

ShpReader.prototype.hasBounds = function() {
  return this.hasParts() || Utils.contains([8,18,28], this.type());
};

ShpReader.prototype.getCounts = function() {
  var counts = {
    nullCount: 0,
    partCount: 0,
    shapeCount: 0,
    pointCount: 0
  };
  this.forEachShape(function(shp) {
    if (shp.isNull) counts.nullCount++;
    counts.pointCount += shp.pointCount;
    counts.partCount += shp.partCount;
    counts.shapeCount++;
  });
  return counts;
};

// Returns a constructor function for a shape record class with
//   properties and methods for reading data.
//
// Record properties
//   type, isNull, byteLength, pointCount, partCount (all types)
//
// Record methods
//   read() (all types)
//   readBounds(), readCoords()  (all but single point types)
//   readPartSizes() (polygon and polyline types)
//   readZBounds(), readZ() (Z types except POINTZ)
//   readMBounds(), readM(), hasM() (M and Z types, except POINT[MZ])
//
ShpReader.prototype.getRecordClass = function(type) {
  var hasBounds = this.hasBounds(),
      hasParts = this.hasParts(),
      hasZ = this.hasZ(),
      hasM = this.hasM(),
      singlePoint = !hasBounds;

  // @bin is a BinArray set to the first byte of a shape record
  //
  var constructor = function ShapeRecord(bin) {
    var pos = bin.position();
    this.id = bin.bigEndian().readUint32();
    this.byteLength = bin.readUint32() * 2 + 8; // bytes in content section + 8 header bytes
    this.type = bin.littleEndian().readUint32();
    this.isNull = this.type == 0;
    if (this.byteLength <= 0 || this.type !== 0 && this.type != type)
      error("Unable to read a shape -- .shp file may be corrupted");

    if (this.isNull) {
      this.pointCount = 0;
      this.partCount = 0;
    } else if (singlePoint) {
      this.pointCount = 1;
      this.partCount = 1;
    } else {
      bin.skipBytes(32); // skip bbox
      this.partCount = hasParts ? bin.readUint32() : 1;
      this.pointCount = bin.readUint32();
    }
    this._data = function() {
      return this.isNull ? null : bin.position(pos);
    }
  };

  var singlePointProto = {
    hasM: function() {
      return this.byteLength == 12 + (hasZ ? 30 : 24); // size with M
    },

    read: function() {
      var n = 2;
      if (hasZ) n++;
      if (this.hasM()) n++; // checking for M
      return this._data().skipBytes(12).readFloat64Array(n);
    }
  };

  var multiCoordProto = {
    _xypos: function() {
      var offs = 16; // skip header, type, record size & point count
      if (hasBounds) offs += 32;
      if (hasParts) offs += 4 * this.partCount + 4; // skip part count & index
      return offs;
    },

    readBounds: function() {
      return this._data().skipBytes(12).readFloat64Array(4);
    },

    readCoords: function() {
      return this._data().skipBytes(this._xypos()).readFloat64Array(this.pointCount * 2);
    },

    readPoints: function() {
      var coords = this.readCoords(),
          zz = hasZ ? this.readZ() : null,
          mm = hasM && this.hasM() ? this.readM() : null,
          points = [], p;

      for (var i=0, n=coords.length / 2; i<n; i++) {
        p = [coords[i*2], coords[i*2+1]];
        if (zz) p.push(zz[i]);
        if (mm) p.push(mm[i]);
        points.push(p);
      }
      return points;
    },

    read: function() {
      return this.readPoints();
    }
  };

  // Mixins for various shape types

  var partsProto = {
    readPartSizes: function() {
      var partLen,
          startId = 0,
          sizes = [],
          bin = this._data().skipBytes(56); // skip to second entry in part index

      for (var i=0, n=this.partCount; i<n; i++) {
        if (i < n - 1)
          partLen = bin.readUint32() - startId;
        else
          partLen = this.pointCount - startId;

        if (partLen <= 0) error("ShapeRecord#readPartSizes() corrupted part");
        sizes.push(partLen);
        startId += partLen;
      }
      return sizes;
    },

    // overrides read() function from multiCoordProto
    read: function() {
      var points = this.readPoints();
      var parts = Utils.map(this.readPartSizes(), function(size) {
          return points.splice(0, size);
        });
      return parts;
    }
  };

  var mProto = {
    _mpos: function() {
      var pos = this._xypos() + this.pointCount * 16;
      if (hasZ) pos += this.pointCount * 8 + 16;
      return pos;
    },

    readMBounds: function() {
      return this.hasM() ? this._data().skipBytes(this._mpos()).readFloat64Array(2) : null;
    },

    readM: function() {
      return this.hasM() ? this._data().skipBytes(this._mpos() + 16).readFloat64Array(this.pointCount) : null;
    },

    // Test if this record contains M data
    // (according to the Shapefile spec, M data is optional in a record)
    //
    hasM: function() {
      var bytesWithoutM = this._mpos(),
          bytesWithM = bytesWithoutM + this.pointCount * 8 + 16;
      if (this.byteLength == bytesWithoutM)
        return false;
      else if (this.byteLength == bytesWithM)
        return true;
      else
        error("#hasM() Counting error");
    }
  };

  var zProto = {
    _zpos: function() {
      return this._xypos() + this.pointCount * 16;
    },

    readZBounds: function() {
      return this._data().skipBytes(this._zpos()).readFloat64Array(2);
    },

    readZ: function() {
      return this._data().skipBytes(this._zpos() + 16).readFloat64Array(this.pointCount);
    }
  };

  var proto;
  if (singlePoint) {
    proto = singlePointProto;
  } else {
    proto = multiCoordProto;
    if (hasZ)
      Utils.extend(proto, zProto);
    if (hasM)
      Utils.extend(proto, mProto);
    if (hasParts)
      Utils.extend(proto, partsProto);
  }
  constructor.prototype = proto;
  proto.constructor = constructor;
  return constructor;
};




// Read Shapefile data from an ArrayBuffer or Buffer
// Build topology
//
MapShaper.importShp = function(src, opts) {
  var reader = new ShpReader(src);
  var supportedTypes = [
    ShpType.POLYGON, ShpType.POLYGONM, ShpType.POLYGONZ,
    ShpType.POLYLINE, ShpType.POLYLINEM, ShpType.POLYLINEZ
  ];
  if (!Utils.contains(supportedTypes, reader.type())) {
    stop("Only polygon and polyline Shapefiles are supported.");
  }
  if (reader.hasZ()) {
    trace("Warning: Z data is being removed.");
  } else if (reader.hasM()) {
    trace("Warning: M data is being removed.");
  }

  var counts = reader.getCounts();
  var importer = new PathImporter(counts.pointCount, opts);
  //var expectRings = Utils.contains([5,15,25], reader.type());

  // TODO: test cases: null shape; non-null shape with no valid parts

  reader.forEachShape(function(shp) {
    importer.startShape();
    if (shp.isNull) return;
    var partSizes = shp.readPartSizes(),
        coords = shp.readCoords(),
        offs = 0,
        pointsInPart;

    for (var j=0, n=shp.partCount; j<n; j++) {
      pointsInPart = partSizes[j];
      importer.importCoordsFromFlatArray(coords, offs, pointsInPart);
      offs += pointsInPart * 2;
    }
  });

  return importer.done();
};

// Convert topological data to buffers containing .shp and .shx file data
//
MapShaper.exportShp = function(layers, arcData, opts) {
  if (arcData instanceof ArcDataset === false || !Utils.isArray(layers)) error("Missing exportable data.");

  var files = [];
  layers.forEach(function(layer) {
    var data = layer.data,
        obj, dbf;
    T.start();
    obj = MapShaper.exportShpFile(layer, arcData);
    T.stop("Export .shp file");
    T.start();
    data = layer.data;
    // create empty data table if missing a table or table is being cut out
    if (!data || opts.cut_table) {
      data = new DataTable(layer.shapes.length);
    }
    // dbfs should have at least one column; add id field if none
    if (data.getFields().length === 0) {
      data.addIdField();
    }
    dbf = data.exportAsDbf(opts.encoding);
    T.stop("Export .dbf file");

    files.push({
        content: obj.shp,
        name: layer.name,
        extension: "shp"
      }, {
        content: obj.shx,
        name: layer.name,
        extension: "shx"
      }, {
        content: dbf,
        name: layer.name,
        extension: "dbf"
      });
  });
  return files;
};

MapShaper.exportShpFile = function(layer, arcData) {
  var geomType = layer.geometry_type;
  if (geomType != 'polyline' && geomType != 'polygon') error("Invalid geometry type:", geomType);

  var isPolygonType = geomType == 'polygon';
  var shpType = isPolygonType ? 5 : 3;

  var exporter = new PathExporter(arcData, isPolygonType);
  var fileBytes = 100;
  var bounds = new Bounds();
  var shapeBuffers = layer.shapes.map(function(shapeIds, i) {
    var shape = MapShaper.exportShpRecord(shapeIds, exporter, i+1, shpType);
    fileBytes += shape.buffer.byteLength;
    if (shape.bounds) bounds.mergeBounds(shape.bounds);
    return shape.buffer;
  });

  // write .shp header section
  var shpBin = new BinArray(fileBytes, false)
    .writeInt32(9994)
    .skipBytes(5 * 4)
    .writeInt32(fileBytes / 2)
    .littleEndian()
    .writeInt32(1000)
    .writeInt32(shpType)
    .writeFloat64(bounds.xmin)
    .writeFloat64(bounds.ymin)
    .writeFloat64(bounds.xmax)
    .writeFloat64(bounds.ymax)
    .skipBytes(4 * 8); // skip Z & M type bounding boxes;

  // write .shx header
  var shxBytes = 100 + shapeBuffers.length * 8;
  var shxBin = new BinArray(shxBytes, false)
    .writeBuffer(shpBin.buffer(), 100) // copy .shp header to .shx
    .position(24)
    .bigEndian()
    .writeInt32(shxBytes/2)
    .position(100);

  // write record sections of .shp and .shx
  shapeBuffers.forEach(function(buf, i) {
    var shpOff = shpBin.position() / 2,
        shpSize = (buf.byteLength - 8) / 2; // alternative: shxBin.writeBuffer(buf, 4, 4);
    shxBin.writeInt32(shpOff);
    shxBin.writeInt32(shpSize);
    shpBin.writeBuffer(buf);
  });

  var shxBuf = shxBin.buffer(),
      shpBuf = shpBin.buffer();

  return {shp: shpBuf, shx: shxBuf};
};


// Returns an ArrayBuffer containing a Shapefile record for one shape
//   and the bounding box of the shape.
// TODO: remove collapsed rings, convert to null shape if necessary
//
MapShaper.exportShpRecord = function(shapeIds, exporter, id, shpType) {
  var bounds = null,
      bin = null,
      data = exporter.exportShapeForShapefile(shapeIds);
  if (data.pointCount > 0) {
    var partsIdx = 52,
        pointsIdx = partsIdx + 4 * data.pathCount,
        recordBytes = pointsIdx + 16 * data.pointCount,
        pointCount = 0;

    bounds = data.bounds;
    bin = new BinArray(recordBytes, false)
      .writeInt32(id)
      .writeInt32((recordBytes - 8) / 2)
      .littleEndian()
      .writeInt32(shpType)
      .writeFloat64(bounds.xmin)
      .writeFloat64(bounds.ymin)
      .writeFloat64(bounds.xmax)
      .writeFloat64(bounds.ymax)
      .writeInt32(data.pathCount)
      .writeInt32(data.pointCount);

    data.paths.forEach(function(part, i) {
      bin.position(partsIdx + i * 4)
        .writeInt32(pointCount)
        .position(pointsIdx + pointCount * 16);
      var xx = part[0],
          yy = part[1];
      for (var j=0, len=xx.length; j<len; j++) {
        bin.writeFloat64(xx[j]);
        bin.writeFloat64(yy[j]);
      }
      pointCount += j;
    });
    if (data.pointCount != pointCount)
      error("Shp record point count mismatch; pointCount:",
          pointCount, "data.pointCount:", data.pointCount);

  }

  if (!bin) {
    bin = new BinArray(12, false)
      .writeInt32(id)
      .writeInt32(2)
      .littleEndian()
      .writeInt32(0);
  }

  return {bounds: bounds, buffer: bin.buffer()};
};




// Convert topological data into formats that are useful for exporting
// Shapefile, GeoJSON and TopoJSON
//
function PathExporter(arcData, polygonType) {
  var layerBounds = new Bounds();
  if (polygonType !== true && polygonType !== false)
    error("PathExporter requires boolean @polygonType parameter.");

  this.getBounds = function() {
    return layerBounds;
  };

  // Export data for serializing one Shapefile record
  //
  this.exportShapeForShapefile = function(ids) {
    var bounds = new Bounds();
    var data = exportShapeData(ids);
    var paths = Utils.map(data.pathData, function(path) {
      bounds.mergeBounds(path.bounds);
      return [path.xx, path.yy];
    });
    return {
      bounds: bounds,
      pointCount: data.pointCount,
      paths: paths,
      pathCount: paths.length
    };
  };

  // Export path coordinates for one Shape/Feature, either nested like a
  // GeoJSON MultiPolygon or like a GeoJSON MultiLineString
  //
  this.exportShapeForGeoJSON = function(ids) {
    var obj = exportShapeData(ids);
    if (obj.pointCount === 0) return null;
    if (polygonType) {
      var groups = groupMultiPolygonPaths(obj.pathData);
      return Utils.map(groups, function(group) {
        return convertPathsForGeoJSON(group);
      });
    } else {
      return convertPathsForGeoJSON(obj.pathData);
    }
  };

  // Export arrays of arc ids for the "arcs" parameter of a TopoJSON "object"
  //
  this.exportShapeForTopoJSON = function(ids) {
    var obj = exportShapeData(ids);
    if (obj.pointCount === 0) return null;
    if (polygonType) {
      var groups = groupMultiPolygonPaths(obj.pathData);
      return Utils.map(groups, function(group) {
        return convertPathsForTopoJSON(group);
      });
    } else {
      return convertPathsForTopoJSON(obj.pathData);
    }
  };

  function convertPathsForGeoJSON(paths) {
    return Utils.map(paths, function(path) {
      return MapShaper.transposeXYCoords(path.xx, path.yy);
    });
  }

  function convertPathsForTopoJSON(paths) {
    return Utils.map(paths, function(path) {
      return path.ids;
    });
  }

  // Bundle holes with their containing rings, for Topo/GeoJSON export
  // Assume outer rings are CW and inner (hole) rings are CCW, like Shapefile
  // @paths array of path objects from exportShapeData()
  //
  function groupMultiPolygonPaths(paths) {
    var pos = [],
        neg = [];
    Utils.forEach(paths, function(path) {
      if (path.area > 0) {
        pos.push(path);
      } else if (path.area < 0) {
        neg.push(path);
      } else {
        // trace("Zero-area ring, skipping");
      }
    });

    var output = Utils.map(pos, function(part) {
      return [part];
    });

    Utils.forEach(neg, function(hole) {
      var containerId = -1,
          containerArea = 0;
      for (var i=0, n=pos.length; i<n; i++) {
        var part = pos[i],
            contained = part.bounds.contains(hole.bounds);
        if (contained && (containerArea === 0 || part.area < containerArea)) {
          containerArea = part.area;
          containerId = i;
        }
      }
      if (containerId == -1) {
        trace("#groupMultiShapePaths() polygon hole is missing a containing ring, dropping.");
      } else {
        output[containerId].push(hole);
      }
    });
    return output;
  }

  // TODO: add shape preservation code here.
  //   re-introduce vertices to ring with largest bounding box
  //
  function exportShapeData(ids) {
    var pointCount = 0,
        pathData = [],
        path,
        shp;

    if (ids && ids.length > 0) { // may be null
      shp = arcData.getMultiPathShape(ids);
      for (var i=0; i<shp.pathCount; i++) {
        path = convertPath(shp.getPath(i), polygonType);
        if (path) {
          pathData.push(path);
          pointCount += path.pointCount;
        }
      }
    }
    return {
      pointCount: pointCount,
      pathData: pathData
    };
  }

  // Extract data from a SimpleShape object (see mapshaper-shapes.js)
  // Returns null if shape has collapsed or is otherwise invalid
  //
  function convertPath(path, isRing) {
    var xx = [],
        yy = [],
        iter = path.getPathIter();

    var x, y, prevX, prevY,
        bounds,
        i = 0,
        area = 0;
    while (iter.hasNext()) {
      x = iter.x;
      y = iter.y;

      if (i === 0 || prevX != x || prevY != y) {
        xx.push(x);
        yy.push(y);
        i++;
      }

      prevX = x;
      prevY = y;
    }

    if (isRing) {
      area = msSignedRingArea(xx, yy);
      if (i < 4 || area === 0) return null;
    } else if (i < 2) {
      return null;
    }

    bounds = MapShaper.calcXYBounds(xx, yy);
    layerBounds.mergeBounds(bounds); // KLUDGE: simpler to accumulate bounds here

    return {
      xx: xx,
      yy: yy,
      pointCount: xx.length,
      area: area,
      ids: path.ids,
      bounds: bounds
    };
  }
}

MapShaper.PathExporter = PathExporter; // for testing




MapShaper.calcLayerBounds = function(lyr, arcs) {
  var bounds = new Bounds();
  Utils.forEach(lyr.shapes, function(shp) {
    arcs.getMultiShapeBounds(shp, bounds);
  });
  return bounds;
};



// Return an array of objects with "filename" "filebase" "extension" and
// "content" attributes.
//
MapShaper.exportContent = function(layers, arcData, opts) {
  var exporter = MapShaper.exporters[opts.output_format],
      files;
  if (!exporter) {
    error("exportContent() Unknown export format:", opts.output_format);
  }
  if (!opts.output_extension) {
    opts.output_extension = MapShaper.getDefaultFileExtension(opts.output_format);
  }
  if (!opts.output_file_base) {
    opts.output_file_base = "out";
  }

  T.start();
  validateLayerData(layers);
  assignLayerNames(layers);
  files = exporter(layers, arcData, opts);
  if (opts.cut_table) {
    Utils.merge(files, MapShaper.exportDataTables(layers, opts));
  }
  if (layers.length > 1) {
    files.push(createIndexFile(layers, arcData));
  }
  assignFileNames(files, opts);
  T.stop("Export " + opts.output_format);
  return files;

  function validateLayerData(layers) {
    Utils.forEach(layers, function(lyr) {
      if (!Utils.isArray(lyr.shapes)) {
        error ("#exportContent() A layer is missing shape data");
      }
      if (lyr.geometry_type != 'polygon' && lyr.geometry_type != 'polyline') {
        error ("#exportContent() A layer is missing a valid geometry type");
      }
    });
  }

  // Make sure each layer has a unique name
  function assignLayerNames(layers, opts) {
    var names = layers.map(function(lyr) {
      return lyr.name || "";
    });
    var uniqueNames = MapShaper.getUniqueLayerNames(names);
    layers.forEach(function(lyr, i) {
      lyr.name = uniqueNames[i];
    });
  }

  function assignFileNames(files, opts) {
    var index = {};
    Utils.forEach(files, function(file) {
      file.extension = file.extension || opts.output_extension;
      var basename = opts.output_file_base,
          filename;
      if (file.name) {
        basename += "-" + file.name;
      }
      filename = basename + "." + file.extension;
      if (filename in index) error("File name conflict:", filename);
      index[filename] = true;
      file.filebase = basename;
      file.filename = filename;
    });
  }

  // Generate json file with bounding boxes and names of each export layer
  //
  function createIndexFile(layers, arcs) {
    var index = Utils.map(layers, function(lyr) {
      var bounds = MapShaper.calcLayerBounds(lyr, arcs);
      return {
        bounds: bounds.toArray(),
        name: lyr.name
      };
    });

    return {
      content: JSON.stringify(index),
      extension: 'json',
      name: 'index'
    };
  }
};

MapShaper.exporters = {
  geojson: MapShaper.exportGeoJSON,
  topojson: MapShaper.exportTopoJSON,
  shapefile: MapShaper.exportShp
};

MapShaper.getDefaultFileExtension = function(fileType) {
  var ext = "";
  if (fileType == 'shapefile') {
    ext = 'shp';
  } else if (fileType == 'geojson' || fileType == 'topojson') {
    ext = "json";
  }
  return ext;
};

MapShaper.exportDataTables = function(layers, opts) {
  var tables = [];
  layers.forEach(function(lyr) {
    if (lyr.data) {
      var name = (lyr.name ? lyr.name + '-' : '') + 'table';
      tables.push({
        content: lyr.data.exportAsJSON(), // TODO: other formats
        name: name,
        extension: "json"
      });
    }
  });
  return tables;
};




// Convert an array of intersections into an ArcDataset (for display)
//
MapShaper.getIntersectionPoints = function(intersections) {
  // Kludge: create set of paths of length 1 to display intersection points
  var vectors = Utils.map(intersections, function(obj) {
        var x = obj.intersection.x,
            y = obj.intersection.y;
        return [[x], [y]];
      });
  return new ArcDataset(vectors);
};

// Identify intersecting segments in an ArcDataset
//
// Method: bin segments into horizontal stripes
// Segments that span stripes are assigned to all intersecting stripes
// To find all intersections:
// 1. Assign each segment to one or more bins
// 2. Find intersections inside each bin (ignoring duplicate intersections)
//
MapShaper.findSegmentIntersections = (function() {

  // Re-use buffer for temp data -- Chrome's gc starts bogging down
  // if large buffers are repeatedly created.
  var buf;
  function getUint32Array(count) {
    var bytes = count * 4;
    if (!buf || buf.byteLength < bytes) {
      buf = new ArrayBuffer(bytes);
    }
    return new Uint32Array(buf, 0, count);
  }

  return function(arcs) {
    //T.start();
    var bounds = arcs.getBounds(),
        ymin = bounds.ymin,
        yrange = bounds.ymax - ymin,
        stripeCount = calcStripeCount(arcs),
        stripeCounts = new Uint32Array(stripeCount),
        i;

    function stripeId(y) {
      return Math.floor((stripeCount-1) * (y - ymin) / yrange);
    }

    // Count segments in each stripe
    arcs.forEachSegment(function(id1, id2, xx, yy) {
      var s1 = stripeId(yy[id1]),
          s2 = stripeId(yy[id2]);
      while (true) {
        stripeCounts[s1] = stripeCounts[s1] + 2;
        if (s1 == s2) break;
        s1 += s2 > s1 ? 1 : -1;
      }
    });

    // Allocate arrays for segments in each stripe
    var stripeData = getUint32Array(Utils.sum(stripeCounts)),
        offs = 0;
    var stripes = Utils.map(stripeCounts, function(stripeSize) {
      var start = offs;
      offs += stripeSize;
      return stripeData.subarray(start, offs);
    });

    // Assign segment ids to each stripe
    Utils.initializeArray(stripeCounts, 0);
    arcs.forEachSegment(function(id1, id2, xx, yy) {
      var s1 = stripeId(yy[id1]),
          s2 = stripeId(yy[id2]),
          count, stripe, tmp;
      if (xx[id2] < xx[id1]) {
        tmp = id1;
        id1 = id2;
        id2 = tmp;
      }
      while (true) {
        count = stripeCounts[s1];
        stripeCounts[s1] = count + 2;
        stripe = stripes[s1];
        stripe[count] = id1;
        stripe[count+1] = id2;
        if (s1 == s2) break;
        s1 += s2 > s1 ? 1 : -1;
      }
    });

    // Detect intersections among segments in each stripe.
    var raw = arcs.getVertexData(),
        intersections = [],
        index = {},
        arr;
    for (i=0; i<stripeCount; i++) {
      arr = MapShaper.intersectSegments(stripes[i], raw.xx, raw.yy);
      if (arr.length > 0) extendIntersections(intersections, arr, i);
    }

    // T.stop("Intersections: " + intersections.length + " stripes: " + stripeCount);
    return intersections;

    // Add intersections from a bin, but avoid duplicates.
    //
    function extendIntersections(intersections, arr, stripeId) {
      Utils.forEach(arr, function(obj, i) {
        if (obj.key in index === false) {
          intersections.push(obj);
          index[obj.key] = true;
        }
      });
    }

  };

  function calcStripeCount(arcs) {
    var bounds = arcs.getBounds(),
        yrange = bounds.ymax - bounds.ymin,
        avg = arcs.getAverageSegment(3), // don't bother sampling all segments
        avgY = avg[1],
        count = Math.ceil(yrange / avgY / 20) || 1;  // count is positive int
    if (count > 0 === false) throw "Invalid stripe count";
    return count;
  }

})();

// Get an indexable key that is consistent regardless of point sequence
// @a, @b ids of segment 1, @c, @d ids of segment 2
MapShaper.getIntersectionKey = function(a, b, c, d) {
  var ab = a < b ? a + ',' + b : b + ',' + a,
      cd = c < d ? c + ',' + d : d + ',' + c,
      key = a < c ? ab + ',' + cd : cd + ',' + ab;
  return key;
};

// Find intersections among a group of line segments
//
// @ids: Array of indexes: [s0p0, s0p1, s1p0, s1p1, ...] where xx[sip0] <= xx[sip1]
// @xx, @yy: Arrays of x- and y-coordinates
//
MapShaper.intersectSegments = function(ids, xx, yy) {
  var lim = ids.length - 2,
      intersections = [];
  var s1p1, s1p2, s2p1, s2p2,
      s1p1x, s1p2x, s2p1x, s2p2x,
      s1p1y, s1p2y, s2p1y, s2p2y,
      hit, i, j;

  // Sort segments by xmin, to allow efficient exclusion of segments with
  // non-overlapping x extents.
  MapShaper.sortSegmentIds(xx, ids);

  i = 0;
  while (i < lim) {
    s1p1 = ids[i];
    s1p2 = ids[i+1];
    s1p1x = xx[s1p1];
    s1p2x = xx[s1p2];
    s1p1y = yy[s1p1];
    s1p2y = yy[s1p2];

    j = i;
    while (j < lim) {
      j += 2;
      s2p1 = ids[j];
      s2p1x = xx[s2p1];

      if (s1p2x <= s2p1x) break; // x extent of seg 2 is greater than seg 1: done with seg 1

      s2p1y = yy[s2p1];
      s2p2 = ids[j+1];
      s2p2x = xx[s2p2];
      s2p2y = yy[s2p2];

      // skip segments with non-overlapping y ranges
      if (s1p1y >= s2p1y) {
        if (s1p1y >= s2p2y && s1p2y >= s2p1y && s1p2y >= s2p2y) continue;
      } else {
        if (s1p1y <= s2p2y && s1p2y <= s2p1y && s1p2y <= s2p2y) continue;
      }

      // skip segments that share an endpoint
      if (s1p1x == s2p1x && s1p1y == s2p1y || s1p1x == s2p2x && s1p1y == s2p2y ||
          s1p2x == s2p1x && s1p2y == s2p1y || s1p2x == s2p2x && s1p2y == s2p2y)
        continue;

      // test two candidate segments for intersection
      hit = segmentIntersection(s1p1x, s1p1y, s1p2x, s1p2y,
          s2p1x, s2p1y, s2p2x, s2p2y);

      if (hit) {
        intersections.push({
          i: i,
          j: j,
          intersection: {x: hit[0], y: hit[1]},
          ids: [s1p1, s1p2, s2p1, s2p2],
          key: MapShaper.getIntersectionKey(s1p1, s1p2, s2p1, s2p2),
          segments: [[{x: s1p1x, y: s1p1y}, {x: s1p2x, y: s1p2y}],
              [{x: s2p1x, y: s2p1y}, {x: s2p2x, y: s2p2y}]]
        });
      }
    }
    i += 2;
  }
  return intersections;
};

MapShaper.sortSegmentIds = function(arr, ids) {
  MapShaper.quicksortSegmentIds(arr, ids, 0, ids.length-2);
};

MapShaper.insertionSortSegmentIds = function(arr, ids, start, end) {
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

MapShaper.quicksortSegmentIds = function (a, ids, lo, hi) {
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

    if (j - lo < 40) MapShaper.insertionSortSegmentIds(a, ids, lo, j);
    else MapShaper.quicksortSegmentIds(a, ids, lo, j);
    if (hi - i < 40) {
      MapShaper.insertionSortSegmentIds(a, ids, i, hi);
      return;
    }
    lo = i;
    j = hi;
  }
};




// Combine detection and repair for cli
//
MapShaper.findAndRepairIntersections = function(arcs) {
  T.start();
  var intersections = MapShaper.findSegmentIntersections(arcs),
      unfixable = MapShaper.repairIntersections(arcs, intersections),
      countPre = intersections.length,
      countPost = unfixable.length,
      countFixed = countPre > countPost ? countPre - countPost : 0;
  T.stop('Find and repair intersections');
  return {
    intersections_initial: countPre,
    intersections_remaining: countPost,
    intersections_repaired: countFixed
  };
};


// Try to resolve a collection of line-segment intersections by rolling
// back simplification along intersecting segments.
//
// Limitation of this method: it can't remove intersections that are present
// in the original dataset.
//
// @arcs ArcDataset object
// @intersections (Array) Output from MapShaper.findSegmentIntersections()
// Returns array of unresolved intersections, or empty array if none.
//
MapShaper.repairIntersections = function(arcs, intersections) {

  var raw = arcs.getVertexData(),
      zz = raw.zz,
      yy = raw.yy,
      xx = raw.xx,
      zlim = arcs.getRetainedInterval();

  while (repairAll(intersections) > 0) {
    // After each repair pass, check for new intersections that may have been
    // created as a by-product of repairing one set of intersections.
    //
    // Issue: several hit-detection passes through a large dataset may be slow.
    // Possible optimization: only check for intersections among segments that
    // intersect bounding boxes of segments touched during previous repair pass.
    // Need an efficient way of checking up to thousands of bounding boxes.
    // Consider indexing boxes for n * log(k) or better performance.
    //
    intersections = MapShaper.findSegmentIntersections(arcs);
  }
  return intersections;

  // Find the z value of the next vertex that should be re-introduced into
  // a set of two intersecting segments in order to remove the intersection.
  // Add the z-value and id of this point to the intersection object @obj.
  //
  function setPriority(obj) {
    ids = obj.ids;
    var i = MapShaper.findNextRemovableVertex(zz, zlim, ids[0], ids[1]),
        j = MapShaper.findNextRemovableVertex(zz, zlim, ids[2], ids[3]),
        zi = i == -1 ? Infinity : zz[i],
        zj = j == -1 ? Infinity : zz[j];

    if (zi == Infinity && zj == Infinity) {
      // No more points available to add; unable to repair.
      return Infinity;
    }

    if (zi > zj && zi < Infinity || zj == Infinity) {
      obj.newId = i;
      obj.z = zi;
    } else {
      obj.newId = j;
      obj.z = zj;
      obj.ids = [ids[2], ids[3], ids[0], ids[1]];
    }
    return obj.z;
  }

  function repairAll(intersections) {
    var repairs = 0,
        loops = 0,
        intersection, segIds, pairs, pair, len;

    intersections = Utils.mapFilter(intersections, function(obj) {
      if (setPriority(obj) == Infinity) return void 0;
      return obj;
    });

    Utils.sortOn(intersections, 'z', !!"ascending");

    while (intersections.length > 0) {
      len = intersections.length;
      intersection = intersections.pop();
      segIds = getIntersectionCandidates(intersection);
      pairs = MapShaper.intersectSegments(segIds, xx, yy);

      if (pairs.length === 0) continue;
      if (pairs.length == 1) {
        // single intersection found: re-introduce a vertex to one of the
        // intersecting segments.
        pair = pairs[0];
        if (setPriority(pair) == Infinity) continue;
        pairs = splitSegmentPair(pair);
        zz[pair.newId] = zlim;
        repairs++;
      } else {
        // found multiple intersections along two segments, because
        // vertices have been re-introduced after intersection was first added.
        // They get pushed back on the stack below
      }

      for (var i=0; i<pairs.length; i++) {
        pair = pairs[i];
        if (setPriority(pair) < Infinity) {
          intersections.push(pair);
        }
      }

      if (intersections.length >= len) {
        sortIntersections(intersections, len-1);
      }

      if (++loops > 500000) {
        trace("Caught an infinite loop at intersection:", intersection);
        return 0;
      }
    }

    // trace("repairs:", repairs);
    return repairs;
  }

  // Use insertion sort to move newly pushed intersections to their sorted position
  function sortIntersections(arr, start) {
    for (var i=start; i<arr.length; i++) {
      var obj = arr[i];
      for (var j = i-1; j >= 0; j--) {
        if (arr[j].z <= obj.z) {
          break;
        }
        arr[j+1] = arr[j];
      }
      arr[j+1] = obj;
    }
  }

  function splitSegmentPair(obj) {
    var ids = obj.ids,
        start = ids[0],
        end = ids[1],
        middle = obj.newId;
    if (!(start < middle && middle < end || start > middle && middle > end)) {
      error("[splitSegment()] Indexing error --", obj);
    }
    return [
      getSegmentPair(start, middle, ids[2], ids[3]),
      getSegmentPair(middle, end, ids[2], ids[3])
    ];
  }

  function getSegmentPair(s1p1, s1p2, s2p1, s2p2) {
    var obj = {},
        ids;
    if (xx[s1p1] > xx[s1p2]) {
      ids = [s1p2, s1p1, s2p1, s2p2];
    } else {
      ids = [s1p1, s1p2, s2p1, s2p2];
    }
    obj.ids = ids;
    return obj;
  }

  function getIntersectionCandidates(obj) {
    var segments = [];
    addSegmentVertices(segments, obj.ids[0], obj.ids[1]);
    addSegmentVertices(segments, obj.ids[2], obj.ids[3]);
    return segments;
  }

  // Gat all segments defined by two endpoints and the vertices between
  // them that are at or above the current simplification threshold.
  // @ids Accumulator array
  function addSegmentVertices(ids, p1, p2) {
    var start, end, prev;
    if (p1 <= p2) {
      start = p1;
      end = p2;
    } else {
      start = p2;
      end = p1;
    }
    prev = start;
    for (var i=start+1; i<=end; i++) {
      if (zz[i] >= zlim) {
        if (xx[prev] < xx[i]) {
          ids.push(prev, i);
        } else {
          ids.push(i, prev);
        }
        prev = i;
      }
    }
  }
};




// Calculations for planar geometry of shapes
// TODO: consider 3D versions of some of these

MapShaper.getShapeArea = function(shp, arcs) {
  var area = Utils.reduce(shp, function(area, ids) {
    var iter = arcs.getShapeIter(ids);
    return area + MapShaper.getPathArea(iter);
  }, 0);
  return area;
};

MapShaper.getPathArea = function(iter) {
  var sum = 0,
      x, y;
  if (iter.hasNext()) {
    x = iter.x;
    y = iter.y;
    while (iter.hasNext()) {
      sum += iter.x * y - x * iter.y;
      x = iter.x;
      y = iter.y;
    }
  }
  return sum / 2;
};

MapShaper.getMaxPath = function(shp, arcs) {
  var maxArea = 0;
  return Utils.reduce(shp, function(maxPath, path) {
    var bbArea = arcs.getSimpleShapeBounds(path).area();
    if (bbArea > maxArea) {
      maxArea = bbArea;
      maxPath = path;
    }
    return maxPath;
  }, null);
};

MapShaper.getAvgPathXY = function(ids, arcs) {
  var iter = arcs.getShapeIter(ids);
  if (!iter.hasNext()) return null;
  var x0 = iter.x,
      y0 = iter.y,
      count = 0,
      sumX = 0,
      sumY = 0;
  while (iter.hasNext()) {
    count++;
    sumX += iter.x;
    sumY += iter.y;
  }
  if (count === 0 || iter.x !== x0 || iter.y !== y0) {
    sumX += x0;
    sumY += y0;
    count++;
  }
  return {
    x: sumX / count,
    y: sumY / count
  };
};

MapShaper.getPathCentroid = function(ids, arcs) {
  var iter = arcs.getShapeIter(ids),
      sum = 0,
      sumX = 0,
      sumY = 0,
      ax, ay, tmp, area;
  if (!iter.hasNext()) return null;
  ax = iter.x;
  ay = iter.y;
  while (iter.hasNext()) {
    tmp = ax * iter.y - ay * iter.x;
    sum += tmp;
    sumX += tmp * (iter.x + ax);
    sumY += tmp * (iter.y + ay);
    ax = iter.x;
    ay = iter.y;
  }
  area = sum / 2;
  if (area === 0) {
    return MapShaper.getAvgPathXY(ids, arcs);
  } else return {
    x: sumX / (6 * area),
    y: sumY / (6 * area)
  };
};

MapShaper.getShapeCentroid = function(shp, arcs) {
  var maxPath = MapShaper.getMaxPath(shp, arcs);
  return maxPath ? MapShaper.getPathCentroid(maxPath, arcs) : null;
};

// TODO: decide how to handle points on the boundary
MapShaper.testPointInShape = function(x, y, shp, arcs) {
  var intersections = 0;
  Utils.forEach(shp, function(ids) {
    if (arcs.getSimpleShapeBounds(ids).containsPoint(x, y)) {
      if (MapShaper.testPointInRing(x, y, ids, arcs)) {
        intersections++;
      }
    }
  });
  return intersections % 2 == 1;
};

// Get a point suitable for anchoring a label
// Method:
// - find centroid
// - ...
//
MapShaper.getInteriorPoint = function(shp, arcs) {


};

MapShaper.getPointToPathDistance = function(px, py, ids, arcs) {
  var iter = arcs.getShapeIter(ids);
  if (!iter.hasNext()) return Infinity;
  var ax = iter.x,
      ay = iter.y,
      paSq = distanceSq(px, py, ax, ay),
      pPathSq = paSq,
      pbSq, abSq,
      bx, by;

  while (iter.hasNext()) {
    bx = iter.x;
    by = iter.y;
    pbSq = distanceSq(px, py, bx, by);
    abSq = distanceSq(ax, ay, bx, by);
    pPathSq = Math.min(pPathSq, pointSegDistSq(paSq, pbSq, abSq));
    ax = bx;
    ay = by;
    paSq = pbSq;
  }
  return Math.sqrt(pPathSq);
};

MapShaper.getYIntercept = function(x, ax, ay, bx, by) {
  return ay + (x - ax) * (by - ay) / (bx - ax);
};

MapShaper.getXIntercept = function(y, ax, ay, bx, by) {
  return ax + (y - ay) * (bx - ax) / (by - ay);
};

// Return signed distance of a point to a shape
//
MapShaper.getPointToShapeDistance = function(x, y, shp, arcs) {
  var minDist = Utils.reduce(shp, function(minDist, ids) {
    var pathDist = MapShaper.getPointToPathDistance(x, y, ids, arcs);
    return Math.min(minDist, pathDist);
  }, Infinity);
  return minDist;
};

MapShaper.testPointInRing = function(x, y, ids, arcs) {
  var iter = arcs.getShapeIter(ids);
  if (!iter.hasNext()) return false;
  var x0 = iter.x,
      y0 = iter.y,
      ax = x0,
      ay = y0,
      bx, by,
      yInt,
      intersections = 0;

  while (iter.hasNext()) {
    bx = iter.x;
    by = iter.y;
    if (x < ax && x < bx || x > ax && x > bx || y >= ay && y >= by) {
      // no intersection
    } else if (x === ax) {
      if (y === ay) {
        intersections = 0;
        break;
      }
      if (bx < x && y < ay) {
        intersections++;
      }
    } else if (x === bx) {
      if (y === by) {
        intersections = 0;
        break;
      }
      if (ax < x && y < by) {
        intersections++;
      }
    } else if (y < ay && y < by) {
      intersections++;
    } else {
      yInt = MapShaper.getYIntercept(x, ax, ay, bx, by);
      if (yInt > y) {
        intersections++;
      }
    }
    ax = bx;
    ay = by;
  }

  return intersections % 2 == 1;
};




MapShaper.protectShapes = function(arcData, layers) {
  T.start();
  Utils.forEach(layers, function(lyr) {
    // TODO: test with polyline shapes
    MapShaper.protectLayerShapes(arcData, lyr.shapes);
  });
  T.stop("Protect shapes");
};

MapShaper.protectLayerShapes = function(arcData, shapes) {
  Utils.forEach(shapes, function(shape) {
    MapShaper.protectShape(arcData, shape);
  });
};

// Protect a single shape from complete removal by simplification
// @arcData an ArcDataset
// @shape an array containing one or more arrays of arc ids, or null if null shape
//
MapShaper.protectShape = function(arcData, shape) {
  var maxArea = 0,
      arcCount = shape ? shape.length : 0,
      maxRing, area;
  // Find ring with largest bounding box
  for (var i=0; i<arcCount; i++) {
    area = arcData.getSimpleShapeBounds(shape[i]).area();
    if (area > maxArea) {
      maxRing = shape[i];
      maxArea = area;
    }
  }

  if (!maxRing || maxRing.length === 0) {
    // invald shape
    trace("[protectShape()] Invalid shape:", shape);
  } else if (maxRing.length == 1) {
    MapShaper.protectIslandRing(arcData, maxRing);
  } else {
    MapShaper.protectMultiRing(arcData, maxRing);
  }
};

// Add two vertices to the ring to form a triangle.
// Assuming that this will inflate the ring.
// Consider using the function for multi-arc rings, which
//   calculates ring area...
MapShaper.protectIslandRing = function(arcData, ring) {
  var added = MapShaper.lockMaxThreshold(arcData, ring);
  if (added == 1) {
    added += MapShaper.lockMaxThreshold(arcData, ring);
  }
  if (added < 2) trace("[protectIslandRing()] Failed on ring:", ring);
};

MapShaper.protectMultiRing = function(arcData, ring) {
  var zlim = arcData.getRetainedInterval(),
      minArea = 0, // 0.00000001, // Need to handle rounding error?
      iter, area, added;
  arcData.setRetainedInterval(Infinity);
  iter = arcData.getShapeIter(ring);
  area = MapShaper.getPathArea(iter);
  while (area <= minArea) {
    added = MapShaper.lockMaxThreshold(arcData, ring);
    if (added === 0) {
      trace("protectMultiRing() Failed on ring:", ring);
      break;
    }
    iter.reset();
    area = MapShaper.getPathArea(iter);
  }
  arcData.setRetainedInterval(zlim);
};

// Protect the vertex or vertices with the largest non-infinite
// removal threshold in a ring.
//
MapShaper.lockMaxThreshold = function(arcData, ring) {
  var targZ = 0,
      targArcId,
      raw = arcData.getVertexData(),
      arcId, id, z,
      start, end;

  for (var i=0; i<ring.length; i++) {
    arcId = ring[i];
    if (arcId < 0) arcId = ~arcId;
    start = raw.ii[arcId];
    end = start + raw.nn[arcId] - 1;
    id = MapShaper.findNextRemovableVertex(raw.zz, Infinity, start, end);
    if (id == -1) continue;
    z = raw.zz[id];
    if (z > targZ) {
      targZ = z;
      targArcId = arcId;
    }
  }
  if (targZ > 0) {
    // There may be more than one vertex with the target Z value; lock them all.
    start = raw.ii[targArcId];
    end = start + raw.nn[targArcId] - 1;
    return MapShaper.replaceValue(raw.zz, targZ, Infinity, start, end);
  }
  return 0;
};

MapShaper.replaceValue = function(zz, value, replacement, start, end) {
  var count = 0;
  for (var i=start; i<=end; i++) {
    if (zz[i] === value) {
      zz[i] = replacement;
      count++;
    }
  }
  return count;
};




// @content: ArrayBuffer or String
// @type: 'shapefile'|'json'
//
MapShaper.importContent = function(content, fileType, opts) {
  var src = MapShaper.importFileContent(content, fileType, opts),
      fmt = src.info.input_format,
      useTopology = !opts || !opts.no_topology,
      imported;

  if (fmt == 'shapefile' || fmt == 'geojson') {
    imported = MapShaper.importPaths(src, useTopology);
  } else if (fmt == 'topojson') {
    imported = src; // already in topological format
  }
  imported.info = {
    input_format: fmt
  };
  return imported;
};

MapShaper.importFileContent = function(content, fileType, opts) {
  var data,
      fileFmt;
  T.start();
  if (fileType == 'shp') {
    data = MapShaper.importShp(content, opts);
    fileFmt = 'shapefile';
  } else if (fileType == 'json') {
    var jsonObj = JSON.parse(content);
    if (jsonObj.type == 'Topology') {
      data = MapShaper.importTopoJSON(jsonObj, opts);
      fileFmt = 'topojson';
    } else {
      data = MapShaper.importGeoJSON(jsonObj, opts);
      fileFmt = 'geojson';
    }
  } else {
    error("Unsupported file type:", fileType);
  }
  data.info.input_format = fileFmt;
  T.stop("Import " + fileFmt);
  return data;
};

MapShaper.importPaths = function(src, useTopology) {
  var importer = useTopology ? MapShaper.importPathsWithTopology : MapShaper.importPathsWithoutTopology,
      imported = importer(src);

  return {
    layers: [{
      name: '',
      geometry_type: src.info.input_geometry_type,
      shapes: imported.shapes,
      data: src.data || null
    }],
    arcs: imported.arcs
  };
};

MapShaper.importPathsWithTopology = function(src) {
  var topo = MapShaper.buildTopology(src.geometry);
  return {
    shapes: groupPathsByShape(topo.paths, src.geometry.validPaths, src.info.input_shape_count),
    arcs: topo.arcs
  };
};

MapShaper.importPathsWithoutTopology = function(src) {
  var geom = src.geometry;
  var arcs = new ArcDataset(geom.nn, geom.xx, geom.yy);
  var paths = Utils.map(geom.nn, function(n, i) {
    return [i];
  });
  var shapes = groupPathsByShape(paths, src.geometry.validPaths, src.info.input_shape_count);
  return {
    shapes: shapes,
    arcs: arcs
  };
};

/*
MapShaper.createTopology = function(src) {
  var topo = MapShaper.buildTopology(src.geometry),
      shapes, lyr;
  shapes = groupPathsByShape(topo.paths, src.geometry.validPaths,
      src.info.input_shape_count);
  lyr = {
    name: '',
    geometry_type: src.info.input_geometry_type,
    shapes: shapes,
    data: src.data || null
  };

  return {
    layers: [lyr],
    arcs: topo.arcs
  };
};
*/

// Use shapeId property of @pathData objects to group paths by shape
//
function groupPathsByShape(paths, pathData, shapeCount) {
  var shapes = new Array(shapeCount); // Array can be sparse, but should have this length
  Utils.forEach(paths, function(path, pathId) {
    var shapeId = pathData[pathId].shapeId;
    if (shapeId in shapes === false) {
      shapes[shapeId] = [path]; // first part in a new shape
    } else {
      shapes[shapeId].push(path);
    }
  });
  return shapes;
}




MapShaper.importTableAsync = function(fname, done, opts) {
  if (Utils.endsWith(fname.toLowerCase(), '.dbf')) {
    done(MapShaper.importDbfTable(fname, opts.encoding));
  } else {
    // assume delimited text file
    // unsupported file types can be detected earlier, during
    // option validation, using filename extensions
    MapShaper.importDelimTableAsync(fname, done);
  }
};

// Accept a type hint from a header like "FIPS:string"
// Return standard type name (number|string)
//
MapShaper.validateFieldType = function(str) {
  var type = 'string'; // default type
  if (str.toLowerCase()[0] == 'n') {
    type = 'number';
  }
  return type;
};

// Look for type hints in array of field headers
// return index of field types
// modify @fields to remove type hints
//
MapShaper.parseFieldHeaders = function(fields, index) {
  var parsed = Utils.map(fields, function(raw) {
    var parts, name, type;
    if (raw.indexOf(':') != -1) {
      parts = raw.split(':');
      name = parts[0];
      type = MapShaper.validateFieldType(parts[1]);
    } else if (raw[0] === '+') {
      name = raw.substr(1);
      type = 'number';
    } else {
      name = raw;
    }
    if (type) {
      index[name] = type;
    }
    // TODO: validate field name
    return name;
  });
  return parsed;
};

MapShaper.importDbfTable = function(shpName, encoding) {
  var dbfName = cli.replaceFileExtension(shpName, 'dbf');
  if (!Node.fileExists(dbfName)) return null;
  return new ShapefileTable(Node.readFile(dbfName), encoding);
};

MapShaper.importDelimTableAsync = function(file, done, typeIndex) {
  return MapShaper.importDelimStringAsync(Node.readFile(file, 'utf-8'), done);
};

MapShaper.importDelimStringAsync = function(content, done) {
  var csv = require("csv"),
      delim = MapShaper.guessDelimiter(content),
      opts = {columns: true};
  if (delim) {
    opts.delimiter = delim;
  }
  csv().from.string(content, opts)
      .to.array(function(data) {
        done(new DataTable(data));
      });
};

MapShaper.stringIsNumeric = function(str) {
  str = MapShaper.cleanNumber(str);
  // Number() accepts empty strings
  // parseFloat() accepts a number followed by other content
  // Using both for stricter check. TODO consider using regex
  return !isNaN(parseFloat(str)) && !isNaN(Number(str));
};

MapShaper.guessDelimiter = function(content) {
  var delimiters = ['|', '\t', ','];
  return Utils.find(delimiters, function(delim) {
    var rxp = MapShaper.getDelimiterRxp(delim);
    return rxp.test(content);
  });
};

MapShaper.getDelimiterRxp = function(delim) {
  var rxp = "^[^\\n\\r]+" + Utils.regexEscape(delim);
  return new RegExp(rxp);
};

MapShaper.adjustRecordTypes = function(records, rawFields) {
  if (records.length === 0) return;
  var hintIndex = {},
      fields = rawFields && MapShaper.parseFieldHeaders(rawFields, hintIndex) || [],
      conversionIndex = {};

  Utils.forEach(records[0], function(val, key) {
    if (key in hintIndex === false) {
      if (Utils.isString(val) && MapShaper.stringIsNumeric(val)) {
        conversionIndex[key] = 'number';
      }
    } else if (hintIndex[key] == 'number' && !Utils.isNumber(val)) {
      conversionIndex[key] = 'number';
    } else if (hintIndex[key] == 'string' && !Utils.isString(val)) {
      conversionIndex[key] = 'string';
    }
  });

  MapShaper.convertRecordTypes(records, conversionIndex);
  return fields;
};

MapShaper.cleanNumber = function(str) {
  return str.replace(/,/g, '');
};

MapShaper.parseNumber = function(str) {
  return Number(MapShaper.cleanNumber(str));
};

MapShaper.convertRecordTypes = function(records, typeIndex) {
  var typedFields = Utils.keys(typeIndex),
      converters = {
        'string': String,
        'number': MapShaper.parseNumber
      },
      transforms = Utils.map(typedFields, function(f) {
        var type = typeIndex[f],
            converter = converters[type];
        return converter;
      });
  if (typedFields.length === 0) return;
  Utils.forEach(records, function(rec) {
    MapShaper.convertRecordData(rec, typedFields, transforms);
  });
};

MapShaper.convertRecordData = function(rec, fields, converters) {
  var f;
  for (var i=0; i<fields.length; i++) {
    f = fields[i];
    rec[f] = converters[i](rec[f]);
  }
};




MapShaper.importFromFile = function(fname, opts) {
  var fileType = MapShaper.guessFileType(fname),
      content = MapShaper.readGeometryFile(fname, fileType),
      data = MapShaper.importContent(content, fileType, opts);
  if (fileType == 'shp' && data.layers.length == 1) {
    data.layers[0].data = MapShaper.importDbfTable(fname, opts.encoding);
  }
  data.info.input_files = [fname];
  return data;
};

MapShaper.readGeometryFile = function(fname, fileType) {
  var content;
  if (fileType == 'shp') {
    content = Node.readFile(fname);
  } else if (fileType == 'json') {
    content = Node.readFile(fname, 'utf-8');
  } else {
    error("Unexpected input file:", fname);
  }
  return content;
};




MapShaper.dissolveLayers = function(layers) {
  T.start();
  if (!Utils.isArray(layers)) error ("[dissolveLayers()] Expected an array of layers");
  var dissolvedLayers = [],
      args = Utils.toArray(arguments);

  Utils.forEach(layers, function(lyr) {
    args[0] = lyr;
    var layers2 = MapShaper.dissolveLayer.apply(null, args);
    dissolvedLayers.push.apply(dissolvedLayers, layers2);
  });
  T.stop('Dissolve polygons');
  return dissolvedLayers;
};

// Dissolve a polygon layer into one or more derived layers
// @dissolve comma-separated list of fields or true
//
MapShaper.dissolveLayer = function(lyr, arcs, dissolve, opts) {
  if (lyr.geometry_type != 'polygon') {
    error("[dissolveLayer()] Expected a polygon layer");
  }
  if (!Utils.isString(dissolve)) {
    dissolve = "";
  }
  var layers = Utils.map(dissolve.split(','), function(f) {
    return MapShaper.dissolve(lyr, arcs, f || null, opts);
  });
  return layers;
};

// Generate a dissolved layer
// @field Name of data field to dissolve on or null to dissolve all polygons
//
MapShaper.dissolve = function(lyr, arcs, field, opts) {
  var shapes = lyr.shapes,
      dataTable = lyr.data || null,
      properties = dataTable ? dataTable.getRecords() : null,
      dissolveLyr,
      dissolveRecords,
      getDissolveKey;

  opts = opts || {};
  // T.start();

  if (field) {
    if (!dataTable) {
      error("[dissolveLayer()] Layer is missing a data table");
    }
    if (field && !dataTable.fieldExists(field)) {
      error("[dissolveLayer()] Missing field:",
        field, '\nAvailable fields:', dataTable.getFields().join(', '));
    }
    getDissolveKey = function(shapeId) {
      var record = properties[shapeId];
      return record[field];
    };
  } else {
    getDissolveKey = function(shapeId) {
      return "";
    };
  }

  //T.start();
  var first = dissolveFirstPass(shapes, getDissolveKey);
  //T.stop("dissolve first pass");
  //T.start();
  var second = dissolveSecondPass(first.segments, shapes, first.keys);
  //T.stop('dissolve second pass');
  dissolveLyr = {
    shapes: second.shapes,
    name: field || 'dissolve',
  };
  if (properties) {
    dissolveRecords = MapShaper.calcDissolveData(first.keys, second.index, properties, field, opts);
    dissolveLyr.data = new DataTable(dissolveRecords);
  }
  Opts.copyNewParams(dissolveLyr, lyr);

  // T.stop('Dissolve polygons');
  return dissolveLyr;
};

// First pass -- identify pairs of segments that can be dissolved
//
function dissolveFirstPass(shapes, getKey) {
  var groups = [],
      largeGroups = [],
      segments = [],
      keys = [];

  function procShape(shapeId) {
    var key = getKey(shapeId);
    keys[shapeId] = key;
  }

  function procArc(obj) {
    var arcId = obj.arcId,
        idx = arcId < 0 ? ~arcId : arcId,
        segId = segments.length,
        group = groups[idx];
    if (!group) {
      group = [];
      groups[idx] = group;
    }
    group.push(segId);
    obj.group = group;
    segments.push(obj);

    // Three or more segments sharing the same arc is abnormal topology...
    // Need to try to identify pairs of matching segments in each of these
    // groups.
    //
    if (group.length == 3) {
      largeGroups.push(group);
    }
  }

  function findMatchingPair(group, cb) {
    var arc1, arc2;
    for (var i=0; i<group.length - 1; i++) {
      arc1 = segments[group[i]];
      for (var j=i+1; j<group.length; j++) {
        arc2 = segments[group[j]];
        if (cb(arc1, arc2)) {
          return [arc1.segId, arc2.segId];
        }
      }
    }
    return null;
  }

  function checkFwExtension(arc1, arc2) {
    return getNextSegment(arc1, segments, shapes).arcId ===
        ~getNextSegment(arc2, segments, shapes).arcId;
  }

  function checkBwExtension(arc1, arc2) {
    return getPrevSegment(arc1, segments, shapes).arcId ===
        ~getPrevSegment(arc2, segments, shapes).arcId;
  }

  function checkDoubleExtension(arc1, arc2) {
    return checkPairwiseMatch(arc1, arc2) &&
        checkFwExtension(arc1, arc2) &&
        checkBwExtension(arc1, arc2);
  }

  function checkSingleExtension(arc1, arc2) {
    return checkPairwiseMatch(arc1, arc2) &&
        (checkFwExtension(arc1, arc2) ||
        checkBwExtension(arc1, arc2));
  }

  function checkPairwiseMatch(arc1, arc2) {
    return arc1.arcId === ~arc2.arcId && keys[arc1.shapeId] ===
        keys[arc2.shapeId];
  }

  function updateGroupIds(ids) {
    Utils.forEach(ids, function(id) {
      segments[id].group = ids;
    });
  }

  // split a group of segments into pairs of matching segments + a residual group
  // @group Array of segment ids
  //
  function splitGroup(group) {
    // find best-match segment pair
    var group2 = findMatchingPair(group, checkDoubleExtension) ||
        findMatchingPair(group, checkSingleExtension) ||
        findMatchingPair(group, checkPairwiseMatch);
    if (group2) {
      group = Utils.filter(group, function(i) {
        return !Utils.contains(group2, i);
      });
      updateGroupIds(group);
      updateGroupIds(group2);
      // Split again if reduced group is still large
      if (group.length > 2) splitGroup(group);
    }
  }

  MapShaper.traverseShapes(shapes, procArc, null, procShape);
  Utils.forEach(largeGroups, splitGroup);

  return {
    segments: segments,
    keys: keys
  };
}

// Second pass -- generate dissolved shapes
//
function dissolveSecondPass(segments, shapes, keys) {
  var dissolveIndex = {},  // new shape ids indexed by dissolveKey
      dissolveShapes = []; // dissolved shapes

  function addRing(arcs, key) {
    var i;
    if (key in dissolveIndex === false) {
      i = dissolveShapes.length;
      dissolveIndex[key] = i;
      dissolveShapes[i] = [];
    } else {
      i = dissolveIndex[key];
    }
    dissolveShapes[i].push(arcs);
  }

  // Generate a dissolved ring
  // @firstArc the first arc instance in the ring
  //
  function buildRing(firstArc) {
    var newArcs = [firstArc.arcId],
        nextArc = getNextArc(firstArc);
        firstArc.used = true;

    while (nextArc && nextArc != firstArc) {
      newArcs.push(nextArc.arcId);
      nextArc.used = true;
      nextArc = getNextArc(nextArc);
      if (nextArc && nextArc != firstArc && nextArc.used) error("buildRing() topology error");
    }

    if (!nextArc) error("buildRing() traversal error");
    firstArc.used = true;
    addRing(newArcs, keys[firstArc.shapeId]);
  }

  // Get the next arc in a dissolved polygon ring
  // @obj an undissolvable arc instance
  //
  function getNextArc(obj, depth) {
    var next = getNextSegment(obj, segments, shapes),
        match;
    depth = depth || 0;
    if (next != obj) {
      match = findDissolveArc(next);
      if (match) {
        if (depth > 100) {
          error ('[dissolve] deep recursion -- unhandled topology problem');
        }
        // if (match.part.arcs.length == 1) {
        if (shapes[match.shapeId][match.partId].length == 1) {
          // case: @obj has an island inclusion -- keep traversing @obj
          // TODO: test case if @next is first arc in the ring
          next = getNextArc(next, depth + 1);
        } else {
          next = getNextArc(match, depth + 1);
        }
      }
    }
    return next;
  }

  // Look for an arc instance that can be dissolved with segment @obj
  // (must be going the opposite direction and have same dissolve key, etc)
  // Return matching segment or null if no match
  //
  function findDissolveArc(obj) {
    var dissolveKey = keys[obj.shapeId], // obj.shape.dissolveKey,
        match, matchId;
    matchId = Utils.find(obj.group, function(i) {
      var a = obj,
          b = segments[i];
      if (a == b ||
          b.used ||
          keys[b.shapeId] != dissolveKey ||
          // don't prevent rings from dissolving with themselves (risky?)
          // a.shapeId == b.shapeId && a.partId == b.partId ||
          a.arcId != ~b.arcId) return false;
      return true;
    });
    match = matchId === null ? null : segments[matchId];
    return match;
  }

  // @obj is an arc instance
  function procSegment(obj) {
    if (obj.used) return;
    var match = findDissolveArc(obj);
    if (!match) buildRing(obj);
  }

  Utils.forEach(segments, procSegment);
  return {
    index: dissolveIndex,
    shapes: dissolveShapes
  };
}

function getNextSegment(seg, segments, shapes) {
  return getSegmentByOffs(seg, segments, shapes, 1);
}

function getPrevSegment(seg, segments, shapes) {
  return getSegmentByOffs(seg, segments, shapes, -1);
}

function getSegmentByOffs(seg, segments, shapes, offs) {
  var arcs = shapes[seg.shapeId][seg.partId],
      partLen = arcs.length,
      nextOffs = (seg.i + offs) % partLen,
      nextSeg;
  if (nextOffs < 0) nextOffs += partLen;
  nextSeg = segments[seg.segId - seg.i + nextOffs];
  if (!nextSeg || nextSeg.shapeId != seg.shapeId) error("index error");
  return nextSeg;
}

// Return a properties array for a set of dissolved shapes
// Records contain dissolve field data (or are empty if not dissolving on a field)
// TODO: copy other user-specified fields
//
// @keys array of dissolve keys, indexed on original shape ids
// @index hash of dissolve shape ids, indexed on dissolve keys
// @properties original records
// @field name of dissolve field, or null
//
MapShaper.calcDissolveData = function(keys, index, properties, field, opts) {
  var arr = [];
  var sumFields = opts.sum_fields,
      copyFields = opts.copy_fields || [];

  if (field) {
    copyFields.push(field);
  }

  Utils.forEach(keys, function(key, i) {
    if (key in index === false) return;
    var idx = index[key],
        rec = properties[i],
        dissolveRec;

    if (!rec) return;

    if (idx in arr) {
      dissolveRec = arr[idx];
    } else {
      arr[idx] = dissolveRec = {};
      Utils.forEach(copyFields, function(f) {
        dissolveRec[f] = rec[f];
      });
    }

    Utils.forEach(sumFields, function(f) {
      dissolveRec[f] = (rec[f] || 0) + (dissolveRec[f] || 0);
    });
  });
  return arr;
};

MapShaper.traverseShapes = function traverseShapes(shapes, cbArc, cbPart, cbShape) {
  var segId = 0;
  Utils.forEach(shapes, function(parts, shapeId) {
    if (!parts || parts.length === 0) return; // null shape
    var arcIds, arcId, partData;
    if (cbShape) {
      cbShape(shapeId);
    }
    for (var i=0, m=parts.length; i<m; i++) {
      arcIds = parts[i];
      if (cbPart) {
        cbPart({
          i: i,
          shapeId: shapeId,
          shape: parts,
          arcs: arcIds
        });
      }

      for (var j=0, n=arcIds.length; j<n; j++, segId++) {
        if (cbArc) {
          arcId = arcIds[j];
          cbArc({
            i: j,
            shapeId: shapeId,
            partId: i,
            arcId: arcId,
            segId: segId
          });
        }
      }
    }
  });
};




// Remove arc endpoints that are only shared by two arcs
// (Useful for reducing number of arcs after a polygon dissolve)
//
MapShaper.dissolveArcs = function(layers, arcs) {
  T.start();
  // Map old arc ids to new arc ids
  var map = arcDissolveFirstPass(layers, arcs);
  // Update layers and return an updated ArcDataset
  var arcs2 = arcDissolveSecondPass(layers, arcs, map);
  // Set simplification threshold of new ArcDataset
  arcs2.setRetainedInterval(arcs.getRetainedInterval());

  var msg = Utils.format("Dissolve arcs; before: %d, after: %d", arcs.size(), arcs2.size());
  T.stop(msg);
  return arcs2;
};

function convertArcs(groups, arcs) {
  var src = arcs.getVertexData(),
      abs = MapShaper.absArcId,
      offs = 0,
      pointCount = countPoints(groups, src.nn),
      nn2 = new Int32Array(groups.length),
      xx2 = new Float64Array(pointCount),
      yy2 = new Float64Array(pointCount),
      zz2 = new Float64Array(pointCount);

  Utils.forEach(groups, function(oldIds, newId) {
    Utils.forEach(oldIds, function(oldId) {
      extendDissolvedArc(newId, oldId);
    });
  });

  return new ArcDataset(nn2, xx2, yy2, zz2);

  // Count points required by dissolved arcs, so typed arrays can be allocated
  function countPoints(groups, nn) {
    var total = 0,
        subtotal, n, ids;
    for (var i=0; i<groups.length; i++) {
      ids = groups[i];
      subtotal = 0;
      for (var j=0; j<ids.length; j++) {
        n = nn[abs(ids[j])];
        if (n > 0) subtotal += n - 1;
      }
      if (subtotal > 0) subtotal++;
      total += subtotal;
    }
    return total;
  }

  function extendDissolvedArc(newId, oldId) {
    var absId = abs(oldId),
        rev = oldId < 0,
        n = src.nn[absId],
        i = src.ii[absId],
        n2 = nn2[newId];

    if (n > 0) {
      if (n2 > 0) {
        n--;
        if (!rev) i++;
      }
      MapShaper.copyElements(src.xx, i, xx2, offs, n, rev);
      MapShaper.copyElements(src.yy, i, yy2, offs, n, rev);
      MapShaper.copyElements(src.zz, i, zz2, offs, n, rev);
      nn2[newId] += n;
      offs += n;
    }
  }
}

function arcDissolveSecondPass(layers, arcs, map) {
  var convertedIndex = [],
      groups = [];

  // Traverse shapes, replace old arc ids with new arc ids,
  // populate @groups array with arrays of old arc ids indexed by
  // ids of dissolved arcs (inverse of @map)
  //
  Utils.forEach(layers, function(lyr) {
    MapShaper.traverseShapes(lyr.shapes, null, updatePaths, null);
  });

  // Generate a new ArcDataset containing dissolved arcs
  //
  return convertArcs(groups, arcs);

  function updatePaths(obj) {
    var newPath = [],
        abs = MapShaper.absArcId,
        ids = obj.arcs,
        mappedId = -1,
        arcCount = 0,
        dissolveGroup,
        firstDissolveGroupId, firstDissolveGroup,
        oldId, newId,
        startingNewGroup, converted;

    for (var i=0; i<ids.length; i++) {
      oldId = ids[i];
      newId = map[abs(oldId)];
      startingNewGroup = newId != mappedId;
      converted = oldId in convertedIndex;

      if (newId === undefined) error("updatePaths() null arc id");
      if (startingNewGroup) {
        mappedId = newId;
        arcCount++;

        if (converted) {
          if (convertedIndex[oldId] == -1) {
            newId = ~newId;
          }
        } else {
          if (newId < 0) error("updatePaths() unexpected negative id");
          if (newId in groups && groups[newId] !== firstDissolveGroup) {
            error("[arc dissolve] traversal errro");
          }
          dissolveGroup = [];
          groups[newId] = dissolveGroup;
        }
        newPath.push(newId);

        if (i === 0) {
          firstDissolveGroupId = newId;
          if (!converted) {
            firstDissolveGroup = dissolveGroup;
          }
        }
      }

      //
      if (!converted) {
        dissolveGroup.push(oldId);
        convertedIndex[oldId] = 1;
        convertedIndex[~oldId] = -1;
      }
    }

    // handle dissolved arcs that wrap around to include arcs from beginning
    // and end of original path
    if (arcCount > 1 && newId == firstDissolveGroupId) {
      newPath.pop(); // remove duplicate id
      if (firstDissolveGroup) {
        // merge arrays of arc ids from beginning and end of path
        dissolveGroup = Utils.merge(dissolveGroup, firstDissolveGroup);
      }
    }

    if (newPath.length === 0) error("updatePaths() empty path");
    obj.shape[obj.i] = newPath;
  }
}

function arcDissolveFirstPass(layers, arcs) {
  var src = arcs.getVertexData(),
      dummyY = arcs.getBounds().ymin - 1,
      xx2 = [],
      yy2 = [],
      nn2 = [];

  // Use mapshaper's topology function to identify dissolvable sequences of
  // arcs across all layers (hackish)
  //
  Utils.forEach(layers, function(lyr) {
    MapShaper.traverseShapes(lyr.shapes, null, translatePath);
  });
  var topo = buildPathTopology(xx2, yy2, nn2);
  return getArcMap(topo.arcs);

  function translatePath(obj) {
    nn2.push(0);
    Utils.forEach(obj.arcs, extendPath);
  }

  function extendPath(arcId) {
    var absId = MapShaper.absArcId(arcId),
        pathId = nn2.length - 1,
        first = src.ii[absId],
        last = first + src.nn[absId] - 1,
        start, end;

    if (arcId < 0) {
      start = last;
      end = first;
    } else {
      start = first;
      end = last;
    }

    // TODO: check for empty paths
    if (nn2[pathId] === 0) {
      nn2[pathId]++;
      xx2.push(src.xx[start]);
      yy2.push(src.yy[start]);
    }
    xx2.push(absId);
    xx2.push(src.xx[end]);
    yy2.push(dummyY);
    yy2.push(src.yy[end]);
    nn2[pathId] += 2;
  }

  // map old arc ids to new ids
  function getArcMap(arcs) {
    var map = [];
    arcs.forEach3(function(xx, yy, zz, id) {
      var oldId;
      for (var i=1, n=xx.length; i<n; i+=2) {
        oldId = xx[i];
        if (oldId in map && map[oldId] != id) error("mapping error");
        map[oldId] = id;
      }
    });
    return map;
  }
}




MapShaper.splitLayersOnField = function(layers, arcs, field) {
  var splitLayers = [];
  Utils.forEach(layers, function(lyr) {
    splitLayers = splitLayers.concat(MapShaper.splitOnField(lyr, arcs, field));
  });
  return splitLayers;
};

MapShaper.splitOnField = function(lyr0, arcs, field) {
  var dataTable = lyr0.data;
  if (!dataTable) error("[splitOnField] Missing a data table");
  if (!dataTable.fieldExists(field)) error("[splitOnField] Missing field:", field);

  var index = {},
      properties = dataTable.getRecords(),
      shapes = lyr0.shapes,
      splitLayers = [];

  Utils.forEach(shapes, function(shp, i) {
    var rec = properties[i],
        key = String(rec[field]), // convert numbers to strings (for layer naming)
        lyr, idx;

    if (key in index === false) {
      idx = splitLayers.length;
      index[key] = idx;
      splitLayers.push({
        name: key || Utils.getUniqueName("layer"),
        properties: [],
        shapes: []
      });
    } else {
      idx = index[key];
    }

    lyr = splitLayers[idx];
    lyr.shapes.push(shapes[i]);
    lyr.properties.push(properties[i]);
  });

  return Utils.map(splitLayers, function(obj) {
    return Opts.copyNewParams({
      name: obj.name,
      shapes: obj.shapes,
      data: new DataTable(obj.properties)
    }, lyr0);
  });
};




// Split the shapes in a layer according to a grid
// Return array of layers and an index with the bounding box of each cell
//
MapShaper.splitOnGrid = function(lyr, arcs, rows, cols) {
  var shapes = lyr.shapes,
      bounds = arcs.getBounds(),
      xmin = bounds.xmin,
      ymin = bounds.ymin,
      w = bounds.width(),
      h = bounds.height(),
      properties = lyr.data ? lyr.data.getRecords() : null,
      groups = [];

  function groupId(shpBounds) {
    var c = Math.floor((shpBounds.centerX() - xmin) / w * cols),
        r = Math.floor((shpBounds.centerY() - ymin) / h * rows);
    c = Utils.clamp(c, 0, cols-1);
    r = Utils.clamp(r, 0, rows-1);
    return r * cols + c;
  }

  function groupName(i) {
    var c = i % cols + 1,
        r = Math.floor(i / cols) + 1;
    return "r" + r + "c" + c;
  }

  Utils.forEach(shapes, function(shp, i) {
    var bounds = arcs.getMultiShapeBounds(shp),
        idx = groupId(bounds),
        group = groups[idx];
    if (!group) {
      group = groups[idx] = {
        shapes: [],
        properties: properties ? [] : null,
        bounds: new Bounds(),
        name: groupName(idx)
      };
    }
    group.shapes.push(shp);
    group.bounds.mergeBounds(bounds);
    if (group.properties) {
      group.properties.push(properties[i]);
    }
  });

  var layers = [];
  Utils.forEach(groups, function(group, i) {
    if (!group) return; // empty cell
    var groupLyr = {
      shapes: group.shapes,
      name: group.name
    };
    Opts.copyNewParams(groupLyr, lyr);
    if (group.properties) {
      groupLyr.data = new DataTable(group.properties);
    }
    layers.push(groupLyr);
  });

  return layers;
};




MapShaper.recombineLayers = function(layers) {
  if (layers.length <= 1) return layers;
  var lyr0 = layers[0],
      mergedProperties = lyr0.data ? [] : null,
      mergedShapes = [];

  Utils.forEach(layers, function(lyr) {
    if (mergedProperties) {
      mergedProperties.push.apply(mergedProperties, lyr.data.getRecords());
    }
    mergedShapes.push.apply(mergedShapes, lyr.shapes);
  });

  return Opts.copyNewParams({
    data: new DataTable(mergedProperties),
    shapes: mergedShapes,
    name: ""
  }, lyr0);
};




MapShaper.compileLayerExpression = function(exp, arcs) {
  var env = new LayerExpressionContext(arcs),
      func;
  try {
    func = new Function("env", "with(env){return " + exp + ";}");
  } catch(e) {
    message('Error compiling expression "' + exp + '"');
    stop(e);
  }

  return function(lyr) {
    var value;
    env.__setLayer(lyr);
    try {
      value = func.call(null, env);
    } catch(e) {
      stop(e);
    }
    return value;
  };
};

MapShaper.compileFeatureExpression = function(exp, arcs, shapes, records) {
  if (arcs instanceof ArcDataset === false) error("[compileFeatureExpression()] Missing ArcDataset;", arcs);
  var RE_ASSIGNEE = /[A-Za-z_][A-Za-z0-9_]*(?= *=[^=])/g,
      newFields = exp.match(RE_ASSIGNEE) || null,
      env = {},
      func;
  hideGlobals(env);
  env.$ = new FeatureExpressionContext(arcs, shapes, records);
  exp = MapShaper.removeExpressionSemicolons(exp);
  try {
    func = new Function("record,env", "with(env){with(record) { return " + exp + ";}}");
  } catch(e) {
    message('Error compiling expression "' + exp + '"');
    stop(e);
  }

  return function(shapeId) {
    var record = records[shapeId],
        value, f;

    if (!record) {
      record = {};
      if (newFields) {
        // add (empty) record to data table if there's an assignment
        records[shapeId] = record;
      }
    }

    // initialize new fields to null so assignments work
    if (newFields) {
      for (var i=0; i<newFields.length; i++) {
        f = newFields[i];
        if (f in record === false) {
          record[f] = null;
        }
      }
    }
    env.$.__setId(shapeId);
    try {
      value = func.call(null, record, env);
    } catch(e) {
      stop(e);
    }
    return value;
  };
};

// Semicolons that divide the expression into two or more js statements
// cause problems when 'return' is added before the expression
// (only the first statement is evaluated). Replacing with commas fixes this
//
MapShaper.removeExpressionSemicolons = function(exp) {
  if (exp.indexOf(';') != -1) {
    // remove any ; from end of expression
    exp = exp.replace(/[; ]+$/, '');
    // change any other semicolons to commas
    // (this is not very safe -- what if a string literal contains a semicolon?)
    exp = exp.replace(/;/g, ',');
  }
  return exp;
};

function hideGlobals(obj) {
  // Can hide global properties during expression evaluation this way
  // (is this worth doing?)
  for (var key in this) {
    obj[key] = null;
  }
  obj.console = console;
}

function addGetters(obj, getters) {
  Utils.forEach(getters, function(f, name) {
    Object.defineProperty(obj, name, {get: f});
  });
}

function FeatureExpressionContext(arcs, shapes, records) {
  var _shp = new MultiShape(arcs),
      _self = this,
      _centroid, _innerXY,
      _record,
      _id, _ids, _bounds;

  // TODO: add methods:
  // isClosed / isOpen
  //
  addGetters(this, {
    id: function() {
      return _id;
    },
    // TODO: count hole/s + containing ring as one part
    partCount: function() {
      return _shp.pathCount;
    },
    isNull: function() {
      return _shp.pathCount === 0;
    },
    bounds: function() {
      return shapeBounds().toArray();
    },
    width: function() {
      return shapeBounds().width();
    },
    height: function() {
      return shapeBounds().height();
    },
    area: function() {
      return MapShaper.getShapeArea(_ids, arcs);
    },
    originalArea: function() {
      var i = arcs.getRetainedInterval(),
          area;
      arcs.setRetainedInterval(0);
      area = _self.area;
      arcs.setRetainedInterval(i);
      return area;
    },
    centroidX: function() {
      var p = centroid();
      return p ? p.x : null;
    },
    centroidY: function() {
      var p = centroid();
      return p ? p.y : null;
    },
    interiorX: function() {
      var p = innerXY();
      return p ? p.x : null;
    },
    interiorY: function() {
      var p = innerXY();
      return p ? p.y : null;
    }
  });

  Object.defineProperty(this, 'properties',
    {set: function(obj) {
      if (Utils.isObject(obj)) {
        records[_id] = obj;
      } else {
        stop("Can't assign non-object to $.properties");
      }
    }, get: function() {
      var rec = records[_id];
      if (!rec) {
        rec = records[_id] = {};
      }
      return rec;
    }});

  this.__setId = function(id) {
    _id = id;
    _bounds = null;
    _centroid = null;
    _innerXY = null;
    _record = records[id];
    _ids = shapes[id];
    _shp.init(_ids);
  };

  function centroid() {
    _centroid = _centroid || MapShaper.getShapeCentroid(_ids, arcs);
    return _centroid;
  }

  function innerXY() {
    //_innerXY = centroid(); // TODO: implement
    return null;
  }

  function shapeBounds() {
    if (!_bounds) {
      _bounds = arcs.getMultiShapeBounds(_ids);
    }
    return _bounds;
  }
}

function LayerExpressionContext(arcs) {
  var shapes, properties, lyr;
  hideGlobals(this);
  this.$ = this;

  this.sum = function(exp) {
    return reduce(exp, 0, function(accum, val) {
      return accum + (val || 0);
    });
  };

  this.min = function(exp) {
    var min = reduce(exp, Infinity, function(accum, val) {
      return Math.min(accum, val);
    });
    return min;
  };

  this.max = function(exp) {
    var max = reduce(exp, -Infinity, function(accum, val) {
      return Math.max(accum, val);
    });
    return max;
  };

  this.average = function(exp) {
    /*
    var avg = reduce(exp, NaN, function(accum, val, i) {
      if (i > 0) {
        val = val / (i+1) + accum * i / (i+1);
      }
      return val;
    });
    */
    var sum = this.sum(exp);
    return sum / shapes.length;
  };

  this.median = function(exp) {
    var arr = values(exp);
    return Utils.findMedian(arr);
  };

  this.__setLayer = function(layer) {
    lyr = layer;
    shapes = layer.shapes;
    properties = layer.data ? layer.data.getRecords() : [];
  };

  function values(exp) {
    var compiled = MapShaper.compileFeatureExpression(exp, arcs, shapes, properties);
    return Utils.repeat(shapes.length, compiled);
  }

  function reduce(exp, initial, func) {
    var val = initial,
        compiled = MapShaper.compileFeatureExpression(exp, arcs, shapes, properties);
    for (var i=0, n=shapes.length; i<n; i++) {
      val = func(val, compiled(i), i);
    }
    return val;
  }

  addGetters({
    bounds: function() {
      return MapShaper.calcLayerBounds(lyr, arcs).toArray();
    }
  });
}




MapShaper.evaluateLayers = function(layers, arcs, exp) {
  T.start();
  for (var i=0; i<layers.length; i++) {
    MapShaper.evaluate(layers[i], arcs, exp);
  }
  T.stop("Calculate expression");
};

MapShaper.evaluate = function(lyr, arcs, exp) {
  var shapes = lyr.shapes,
      // create new table if none exists
      dataTable = lyr.data || (lyr.data = new DataTable(shapes.length)),
      records = dataTable.getRecords(),
      compiled = MapShaper.compileFeatureExpression(exp, arcs, shapes, records);

  // call compiled expression with id of each record
  Utils.repeat(records.length, compiled);
};




//
//
MapShaper.subdivideLayers = function(layers, arcs, exp) {
  var compiled = MapShaper.compileLayerExpression(exp, arcs),
      subdividedLayers = [];
  Utils.forEach(layers, function(lyr) {
    Utils.merge(subdividedLayers, MapShaper.subdivide(lyr, arcs, compiled));
    Utils.forEach(subdividedLayers, function(lyr2) {
      Opts.copyNewParams(lyr2, lyr);
    });
  });
  return subdividedLayers;
};

// Recursively divide a layer into two layers until a (compiled) expression
// no longer returns true. The original layer is split along the long side of
// its bounding box, so that each split-off layer contains half of the original
// shapes (+/- 1).
//
MapShaper.subdivide = function(lyr, arcs, compiled) {
  var divide = compiled(lyr),
      subdividedLayers = [],
      tmp, bounds, lyr1, lyr2;

  if (!Utils.isBoolean(divide)) {
    stop("--subdivide expressions must return true or false");
  }
  if (divide) {
    bounds = MapShaper.calcLayerBounds(lyr, arcs);
    tmp = MapShaper.divideLayer(lyr, arcs, bounds);
    lyr1 = tmp[0];
    if (lyr1.shapes.length > 1 && lyr1.shapes.length < lyr.shapes.length) {
      Utils.merge(subdividedLayers, MapShaper.subdivide(lyr1, arcs, compiled));
    } else {
      subdividedLayers.push(lyr1);
    }

    lyr2 = tmp[1];
    if (lyr2.shapes.length > 1 && lyr2.shapes.length < lyr.shapes.length) {
      Utils.merge(subdividedLayers, MapShaper.subdivide(lyr2, arcs, compiled));
    } else {
      subdividedLayers.push(lyr2);
    }
  } else {
    subdividedLayers.push(lyr);
  }
  return subdividedLayers;
};

// split one layer into two layers containing the same number of shapes (+-1),
// either horizontally or vertically
//
MapShaper.divideLayer = function(lyr, arcs, bounds) {
  var properties = lyr.data ? lyr.data.getRecords() : null,
      shapes = lyr.shapes,
      lyr1, lyr2;
  lyr1 = {
    shapes: [],
    data: properties ? [] : null
  };
  lyr2 = {
    shapes: [],
    data: properties ? [] : null
  };

  var useX = bounds.width() > bounds.height();
  // TODO: think about case where there are null shapes with NaN centers
  var centers = Utils.map(shapes, function(shp) {
    var bounds = arcs.getMultiShapeBounds(shp);
    return useX ? bounds.centerX() : bounds.centerY();
  });
  var ids = Utils.range(centers.length);
  ids.sort(function(a, b) {
    return centers[a] - centers[b];
  });
  Utils.forEach(ids, function(shapeId, i) {
    var dest = i < shapes.length / 2 ? lyr1 : lyr2;
    dest.shapes.push(shapes[shapeId]);
    if (properties) {
      dest.data.push(properties[shapeId]);
    }
  });

  if (properties) {
    lyr1.data = new DataTable(lyr1.data);
    lyr2.data = new DataTable(lyr2.data);
  }
  return [lyr1, lyr2];
};




MapShaper.filterLayers = function(layers, arcs, exp) {
  T.start();
  Utils.forEach(layers, function(lyr) {
    MapShaper.filter(lyr, arcs, exp);
  });
  T.stop("Filter");
};

MapShaper.selectLayers = function(layers, arcs, exp) {
  var unselected = [], tmp;
  Utils.forEach(layers, function(lyr) {
    tmp = MapShaper.filter(lyr, arc, exp);
    if (tmp && tmp.shapes.length > 0) {
      unselected.push(tmp);
    }
  });
  return unselected;
};

MapShaper.filter = function(lyr, arcs, exp) {
  MapShaper.select(lyr, arcs, exp, true);
};

MapShaper.select = function(lyr, arcs, exp, discard) {
  var records = lyr.data ? lyr.data.getRecords() : null,
      shapes = lyr.shapes,
      compiled = MapShaper.compileFeatureExpression(exp, arcs, shapes, records);

  var selectedShapes = [],
      selectedRecords = [],
      unselectedShapes = [],
      unselectedRecords = [],
      unselectedLyr;

  Utils.forEach(shapes, function(shp, shapeId) {
    var rec = records ? records[shapeId] : null,
        result = compiled(shapeId);

    if (!Utils.isBoolean(result)) {
      stop("--filter expressions must return true or false");
    }
    if (result) {
      selectedShapes.push(shp);
      if (records) selectedRecords.push(rec);
    } else if (!discard) {
      unselectedShapes.push(shp);
      if (records) unselectedRecords.push(rec);
    }
  });

  lyr.shapes = selectedShapes;
  if (records) {
    lyr.data = new DataTable(selectedRecords);
  }
  if (!discard) {
    unselectedLyr = {
      shapes: unselectedShapes,
      data: records ? new DataTable(unselectedRecords) : null
    };
    Opts.copyNewParams(unselectedLyr, lyr);
  }
  return unselectedLyr;
};




// receive array of options for files to import
// return merged file data
// TODO: remove duplication with single-file import
//
MapShaper.mergeFiles = function(files, opts, separateLayers) {
  var first, geometries, layerNames;
  if (separateLayers) {
    layerNames = MapShaper.getLayerNames(files);
  }

  geometries = Utils.map(files, function(fname, i) {
    var fileType = MapShaper.guessFileType(fname),
        content = MapShaper.readGeometryFile(fname, fileType),
        importData = MapShaper.importFileContent(content, fileType, opts),
        fmt = importData.info.input_format;

    if (fileType == 'shp' && !importData.data) {
      importData.data = MapShaper.importDbfTable(fname, opts.encoding);
    }

    if (fmt != 'geojson' && fmt != 'shapefile') {
      error("[merge files] Incompatible file format:", fmt);
    }

    if (first && fmt != first.info.input_format) {
      error("[merge files] Found mixed file formats:", first.info.input_format, "and", fmt);
    }

    if (separateLayers) {
      // kludge: need a data table in order to add layer name
      if (!importData.data) {
        importData.data = new DataTable(importData.info.input_shape_count);
      }
      importData.data.addField("__LAYER", layerNames[i]);
    }

    if (!first) {
      first = importData;
    } else {
      if (first.data) {
        MapShaper.extendDataTable(first.data, importData.data, !separateLayers);
      }
      var shapeCount = MapShaper.extendPathData(first.geometry.validPaths,
          first.info.input_shape_count,
          importData.geometry.validPaths, importData.info.input_shape_count);
      first.info.input_shape_count = shapeCount;
      // TODO: combine other info fields (e.g. input_point_count)
    }

    return importData.geometry;
  });

  var coords = MapShaper.mergeArcData(geometries);
  Utils.extend(first.geometry, coords); // replace xx, yy, nn

  var topology = MapShaper.importPaths(first, true);
  if (separateLayers) {
    topology.layers = MapShaper.splitLayersOnField(topology.layers, topology.arcs, "__LAYER");
    // remove temp property
    topology.layers.forEach(function(lyr) {
      lyr.data.deleteField('__LAYER');
    });
  }

  topology.info = first.info;
  topology.info.input_files = files;
  return topology;
};


MapShaper.getLayerNames = function(paths) {
  // default names: filenames without the extension
  var names = paths.map(function(path) {
    return MapShaper.parseLocalPath(path).basename;
  });

  // remove common prefix, if any
  var prefix = MapShaper.getCommonFilePrefix(names);
  if (prefix && !Utils.contains(names, prefix)) {
    names = names.map(function(name) {
      return Utils.lreplace(name, prefix);
    });
  }

  return MapShaper.getUniqueLayerNames(names);
};

MapShaper.getFileSuffix = function(filebase, prefix) {
  if (filebase.indexOf(prefix) === 0) {
    return filebase.substr(prefix.length);
  }
  return filebase;
};

MapShaper.getCommonFilePrefix = function(files) {
  return Utils.reduce(files, function(prefix, file) {
    var filebase = Node.getFileInfo(file).base;
    if (prefix !== null) {
      filebase = MapShaper.findStringPrefix(prefix, filebase);
    }
    return filebase;
  }, null);
};

// @see mapshaper script
//
MapShaper.getMergedFileBase = function(arr, suffix) {
  var basename = MapShaper.getCommonFilePrefix(arr);
  basename = basename.replace(/[-_ ]+$/, '');
  if (suffix) {
    basename = basename ? basename + '-' + suffix : suffix;
  }
  return basename;
};

MapShaper.findStringPrefix = function(a, b) {
  var i = 0;
  for (var n=a.length; i<n; i++) {
    if (a[i] !== b[i]) break;
  }
  return a.substr(0, i);
};

// Concatenate arc data contained in an
// array of objects.
//
MapShaper.mergeArcData = function(arr) {
  return {
    xx: MapShaper.mergeArrays(Utils.pluck(arr, 'xx'), Float64Array),
    yy: MapShaper.mergeArrays(Utils.pluck(arr, 'yy'), Float64Array),
    nn: MapShaper.mergeArrays(Utils.pluck(arr, 'nn'), Int32Array)
  };
};

MapShaper.countElements = function(arrays) {
  var c = 0;
  for (var i=0; i<arrays.length; i++) {
    c += arrays[i].length || 0;
  }
  return c;
};

MapShaper.mergeArrays = function(arrays, TypedArr) {
  var size = MapShaper.countElements(arrays),
      Arr = TypedArr || Array,
      merged = new Arr(size),
      offs = 0;
  Utils.forEach(arrays, function(src) {
    var n = src.length;
    for (var i = 0; i<n; i++) {
      merged[i + offs] = src[i];
    }
    offs += n;
  });
  return merged;
};

MapShaper.extendPathData = function(dest, destCount, src, srcCount) {
  var path;
  for (var i=0, n=src.length; i<n; i++) {
    path = src[i];
    path.shapeId += destCount;
    dest.push(path);
  }
  return destCount + srcCount;
};

MapShaper.extendDataTable = function(dest, src, validateFields) {
  if (src.size() > 0) {
    if (dest.size() > 0 && validateFields) {
      // both tables have records: make sure fields match
      var destFields = dest.getFields(),
          srcFields = src.getFields();
      if (destFields.length != srcFields.length ||
          Utils.difference(destFields, srcFields).length > 0) {
        // TODO: stop the program without printing entire call stack
        error("Merged files have different fields");
      }
    }
    Utils.merge(dest.getRecords(), src.getRecords());
  }
  return dest;
};





MapShaper.importJoinTable = function(file, opts, done) {
  MapShaper.importTableAsync(file, function(table) {
    var fields = opts.join_fields || table.getFields(),
        keys = opts.join_keys;
    if (!Utils.isArray(keys) || keys.length != 2) {
      error("importJointTable() Invalid join keys:", keys);
    }
    // this may cause duplicate field name with inconsistent type hints
    // adjustRecordTypes() should handle this case
    fields.push(opts.join_keys[1]);
    // convert data types based on type hints and numeric csv fields
    // SIDE EFFECT: type hints are removed from field names
    fields = MapShaper.adjustRecordTypes(table.getRecords(), fields);
    // replace foreign key in case original contained type hint
    opts.join_keys[1] = fields.pop();
    opts.join_fields = fields;
    done(table);
  }, opts);
};

MapShaper.joinTableToLayers = function(layers, table, keys, joinFields) {
  var localKey = keys[0],
      foreignKey = keys[1],
      typeIndex = {};
  T.start();
  if (table.fieldExists(foreignKey) === false) {
    stop("[join] External table is missing a field named:", foreignKey);
  }

  if (!joinFields || joinFields.length === 0) {
    joinFields = Utils.difference(table.getFields(), [foreignKey]);
  }

  var joins = 0,
      index = Utils.indexOn(table.getRecords(), foreignKey);

  Utils.forEach(layers, function(lyr) {
    if (lyr.data && lyr.data.fieldExists(localKey)) {
      if (MapShaper.joinTables(lyr.data, localKey, joinFields,
          table, foreignKey, joinFields)) {
        joins++;
      }
    }
  });

  if (joins === 0) {
    // TODO: better handling of failed joins
    stop("[join] Join failed");
  }
  T.stop("Join");
};

MapShaper.joinTables = function(dest, destKey, destFields, src, srcKey, srcFields) {
  var hits = 0, misses = 0,
      records = dest.getRecords(),
      len = records.length,
      destField, srcField,
      unmatched = [],
      nullRec = Utils.newArray(destFields.length, null),
      destRec, srcRec, joinVal;
  src.indexOn(srcKey);

  for (var i=0; i<len; i++) {
    destRec = records[i];
    joinVal = destRec[destKey];
    srcRec = src.getIndexedRecord(joinVal);
    if (!srcRec) {
      misses++;
      if (misses <= 10) unmatched.push(joinVal);
      srcRec = nullRec;
    } else {
      hits++;
    }
    for (var j=0, n=srcFields.length; j<n; j++) {
      destRec[destFields[j]] = srcRec[srcFields[j]] || null;
    }
  }
  if (misses > 0) {
    var msg;
    if (misses > 10) {
      msg = Utils.format("Unable to join %d records", misses);
    } else {
      msg = Utils.format("Unjoined values: %s", Utils.uniq(unmatched).join(', '));
    }
    message(msg);
  }

  return hits > 0;
};




MapShaper.convertLayersToInnerLines = function(layers, arcs) {
  T.start();
  var converted = Utils.map(layers, function(lyr) {
    return MapShaper.convertLayerToInnerLines(lyr, arcs);
  });
  T.stop("Inner lines");
  return converted;
};

MapShaper.convertLayerToInnerLines = function(lyr, arcs) {
  if (lyr.geometry_type != 'polygon') {
    stop("[innerlines] Layer not polygon type");
  }
  var arcs2 = MapShaper.convertShapesToArcs(lyr.shapes, arcs.size(), 'inner'),
      lyr2 = MapShaper.convertArcsToLineLayer(arcs2);
  lyr2.name = lyr.name;
  return lyr2;
};

MapShaper.convertLayersToTypedLines = function(layers, arcs, fields) {
  T.start();
  var converted = Utils.map(layers, function(lyr) {
    return MapShaper.convertLayerToTypedLines(lyr, arcs, fields);
  });
  T.stop("Lines");
  return converted;
};

MapShaper.convertLayerToTypedLines = function(lyr, arcs, fields) {
  if (lyr.geometry_type != 'polygon') {
    stop("[lines] Layer not polygon type");
  }
  var arcCount = arcs.size(),
      outerArcs = MapShaper.convertShapesToArcs(lyr.shapes, arcCount, 'outer'),
      typeCode = 0,
      allArcs = [],
      allData = [];

  function addArcs(typeArcs) {
    var typeData = Utils.repeat(typeArcs.length, function(i) {
          return {TYPE: typeCode};
        }) || [];
    allArcs = Utils.merge(typeArcs, allArcs);
    allData = Utils.merge(typeData, allData);
    typeCode++;
  }

  addArcs(outerArcs);

  if (Utils.isArray(fields)) {
    if (!lyr.data) {
      stop("[lines] missing a data table:");
    }
    Utils.forEach(fields, function(field) {
      if (!lyr.data.fieldExists(field)) {
        stop("[lines] unknown data field:", field);
      }
      var dissolved = MapShaper.dissolve(lyr, arcs, field),
          dissolvedArcs = MapShaper.convertShapesToArcs(dissolved.shapes, arcCount, 'inner');
      dissolvedArcs = Utils.difference(dissolvedArcs, allArcs);
      addArcs(dissolvedArcs);
    });
  }

  var innerArcs = MapShaper.convertShapesToArcs(lyr.shapes, arcCount, 'inner');
  innerArcs = Utils.difference(innerArcs, allArcs);
  addArcs(innerArcs);

  var lyr2 = MapShaper.convertArcsToLineLayer(allArcs, allData);
  lyr2.name = lyr.name;
  return lyr2;
};

MapShaper.convertArcsToLineLayer = function(arcs, data) {
  var shapes = MapShaper.convertArcsToShapes(arcs),
      lyr = {
        geometry_type: 'polyline',
        shapes: shapes
      };
  if (data) {
    lyr.data = new DataTable(data);
  }
  return lyr;
};

MapShaper.convertArcsToShapes = function(arcs) {
  return Utils.map(arcs, function(id) {
    return [[id]];
  });
};

MapShaper.convertShapesToArcs = function(shapes, arcCount, type) {
  type = type || 'all';
  var counts = MapShaper.countArcsInShapes(shapes, arcCount),
      arcs = [],
      count;

  for (var i=0, n=counts.length; i<n; i++) {
    count = counts[i];
    if (count > 0) {
      if (type == 'all' || type == 'outer' && count == 1 ||
          type == 'inner' && count > 1) {
        arcs.push(i);
      }
    }
  }
  return arcs;
};

MapShaper.countArcsInShapes = function(shapes, arcCount) {
  var counts = new Uint8Array(arcCount);
  MapShaper.traverseShapes(shapes, null, function(obj) {
    var arcs = obj.arcs,
        id;
    for (var i=0; i<arcs.length; i++) {
      id = arcs[i];
      if (id < 0) id = ~id;
      counts[id]++;
    }
  });
  return counts;
};




MapShaper.printInfo = function(layers, arcData, opts, info) {
  var str = Utils.format("Input: %s (%s)\n",
      opts.input_files.join(', '), opts.input_format);
  str += "Bounds: " + arcData.getBounds().toArray().join(', ') + "\n";
  str += Utils.format("Topological arcs: %'d\n", arcData.size());

  if (!Utils.isInteger(info.intersections_remaining)) {
    info.intersections_remaining = MapShaper.findSegmentIntersections(arcData).length;
  }
  str += Utils.format("Line intersections: %'d\n", info.intersections_remaining);
  if (layers.length > 1) str += '\n';
  str += Utils.map(layers, MapShaper.getLayerInfo).join('\n');
  console.log(str);
};

// TODO: consider polygons with zero area or other invalid geometries
//
MapShaper.countNullShapes = function(shapes) {
  var count = 0;
  for (var i=0; i<shapes.length; i++) {
    if (!shapes[i] || shapes[i].length === 0) count++;
  }
  return count;
};

MapShaper.getLayerInfo = function(lyr) {
  var obj = {};
  obj.fields = lyr.data ? lyr.data.getFields() : null;
  obj.name = lyr.name || null;
  obj.geometry_type = lyr.geometry_type;
  obj.record_count = lyr.shapes.length;
  obj.null_geom_count = MapShaper.countNullShapes(lyr.shapes);
  if (obj.fields) {
    obj.fields.sort();
    obj.sample_values = Utils.map(obj.fields, function(fname) {
      return lyr.data.getRecords()[0][fname];
    });
  }
  return MapShaper.formatLayerInfo(obj);
};

MapShaper.formatSampleData = function(arr) {
  var strings = Utils.map(arr, String),
      digits = Utils.map(strings, function(str, i) {
        return Utils.isNumber(arr[i]) ? (str + '.').indexOf('.') + 1 :  0;
      }),
      maxDigits = Math.max.apply(null, digits),
      col = Utils.map(strings, function(str, i) {
        if (Utils.isNumber(arr[i])) {
          str = Utils.lpad("", 1 + maxDigits - digits[i], ' ') + str;
        } else {
          str = "'" + str + "'";
        }
        return str;
      });
  return col;
};

MapShaper.formatLayerInfo = function(obj) {
  var nameStr = obj.name ? "Layer name: " + obj.name : "Unnamed layer",
      countStr = Utils.format("Records: %'d (with null geometry: %'d)",
          obj.record_count, obj.null_geom_count),
      typeStr = "Geometry: " + obj.geometry_type,
      dataStr;
  if (obj.fields && obj.fields.length > 0) {
    var col1 = Utils.merge(['Field'], obj.fields),
        col2 = Utils.merge(['First value'], MapShaper.formatSampleData(obj.sample_values)),
        padding = Utils.reduce(obj.fields, function(len, fname) {
          return Math.max(len, fname.length);
        }, 5),
        fieldStr = Utils.repeat(col1.length, function(i) {
          return '  ' + Utils.rpad(col1[i], padding, ' ') + "  " + String(col2[i]);
        }).join('\n');
    dataStr = 'Data table:\n' + fieldStr;
  } else {
    dataStr = "Missing attribute data";
  }

  var formatted = "";
  if (obj.name) formatted += "Layer name: " + obj.name + "\n";
  formatted += Utils.format("%s\n%s\n%s\n", typeStr, countStr, dataStr);
  return formatted;
};



//
//mapshaper-explode,

var cli = MapShaper.cli = {};

var usage =
  "Usage: mapshaper [options] [file ...]\n\n" +

  "Example: fix minor topology errors, simplify to 10%, convert to geojson\n" +
  "$ mapshaper -p 0.1 --auto-snap --format geojson states.shp\n\n" +

  "Example: aggregate census tracts to counties\n" +
  "$ mapshaper -e 'CTY_FIPS=FIPS.substr(0, 5)' --dissolve CTY_FIPS tracts.shp";

MapShaper.getOptionParser = function() {
  var basic = MapShaper.getBasicOptionParser(),
      more = MapShaper.getExtraOptionParser(basic),
      all = MapShaper.getHiddenOptionParser(more);
  return all;
};

MapShaper.getBasicOptionParser = function() {
  return getOptimist()
    .usage(usage)

    .options("o", {
      describe: "specify name of output file or directory",
    })

    .options("f", {
      alias: "format",
      describe: "output to a different format (shapefile|geojson|topojson)",
    })

    .options("p", {
      alias: "pct",
      describe: "proportion of removable points to retain (0-1)"
    })

    .options("i", {
      alias: "interval",
      describe: "simplification resolution in linear units"
    })

    .options("cartesian", {
      describe: "simplify decimal degree coords in 2D space (default is 3D)"
    })

    .options("dp", {
      alias: "rdp",
      describe: "use Douglas-Peucker simplification",
      'boolean': true
    })

    .options("visvalingam", {
      // alias: "vis", // makes help message too wide
      describe: "use Visvalingam simplification",
      'boolean': true
    })

    .options("modified", {
      describe: "use a version of Visvalingam designed for mapping (default)",
      'boolean': true
    })

    .options("keep-shapes", {
      describe: "prevent small shapes from disappearing",
      'boolean': true
    })

    .options("auto-snap", {
      describe: "snap nearly identical points to fix minor topology errors",
      'boolean': true
    })

    .options("precision", {
      describe: "coordinate precision in source units (applied on import)"
    })

    .options("encoding", {
      describe: "encoding of text data in Shapefile .dbf file"
    })

    .options("encodings", {
      describe: "print list of supported text encodings",
      'boolean': true
    })

    .options("info", {
      describe: "print summary info instead of exporting files",
      'boolean': true
    })

    .options("verbose", {
      describe: "print verbose processing messages",
      'boolean': true
    })

    .options("v", {
      alias: "version",
      describe: "print mapshaper version",
      'boolean': true
    })

    .options("h", {
      alias: "help",
      describe: "print this help message",
      'boolean': true
    })

    .options("more", {
      describe: "print more options"
    });
    /*
    // TODO
    // prevent points along straight lines from being stripped away, to allow reprojection
    .options("min-segment", {
      describe: "min segment length (no. of segments in largest dimension)",
      default: 0
    })
    .options("remove-null", {
      describe: "remove null shapes",
      default: false
    })
    */
};

MapShaper.getHiddenOptionParser = function(optimist) {
  return (optimist || getOptimist())
    // These option definitions don't get printed by --help and --more
    // Validate them in validateExtraOpts()
  .options("modified-v1", {
    describe: "use the original modified Visvalingam method (deprecated)",
    'boolean': true
  })

  .options("topojson-precision", {
    describe: "pct of avg segment length for rounding (0.02 is default)"
  })

  .options("postfilter", {
    describe: "filter shapes after dissolve"
  })
  ;
};

MapShaper.getExtraOptionParser = function(optimist) {
  return (optimist || getOptimist())

  .options("join ", {
    describe: "join a dbf or delimited text file to the imported shapes"
  })

  .options("join-keys", {
    describe: "local,foreign keys, e.g. --join-keys FIPS,CNTYFIPS:str"
  })

  .options("join-fields", {
    describe: "(optional) join fields, e.g. --join-fields FIPS:str,POP"
  })

  .options('filter ', {
    describe: "filter shapes with a boolean JavaScript expression"
  })

  .options("expression", {
    alias: "e",
    describe: "create/update/delete data fields with a JS expression"
  })

  /*
  // TODO: enable this when holes are handled correctly
  .options("explode", {
    describe: "divide each multi-part shape into several single-part shapes"
  })
  */

  .options("split", {
    describe: "split shapes on a data field"
  })

  .options("subdivide", {
    describe: "recursively divide a layer with a boolean JS expression"
  })

  .options("dissolve", {
    describe: "dissolve polygons; takes optional comma-sep. list of fields"
  })

  .options("sum-fields", {
    describe: "fields to sum when dissolving  (comma-sep. list)"
  })

  .options("copy-fields", {
    describe: "fields to copy when dissolving (comma-sep. list)"
  })

  .options("merge-layers", {
    describe: "merge split-apart layers back into a single layer",
    'boolean': true
  })

  .options("split-on-grid", {
    describe: "split layer into cols,rows  e.g. --split-on-grid 12,10"
  })

  .options("snap-interval", {
    describe: "specify snapping distance in source units"
  })

  .options("quantization", {
    describe: "specify TopoJSON quantization (auto-set by default)"
  })

  .options("no-quantization", {
    describe: "export TopoJSON without quantization",
    'boolean': true
  })

  .options("id-field", {
    describe: "field to use for TopoJSON id property"
  })

  .options("no-repair", {
    describe: "don't remove intersections introduced by simplification",
    'boolean': true
  })

  .options("no-topology", {
    describe: "treat each shape as topologically independent",
    'boolean': true
  })

  .options("lines", {
    describe: "convert polygons to lines; takes optional list of fields"
  })

  .options("innerlines", {
    describe: "output polyline layers containing shared polygon boundaries",
    'boolean': true
  })

  .options("merge-files", {
    describe: "merge input files into a single layer before processing",
    'boolean': true
  })

  .options("combine-files", {
    describe: "import files to separate layers with shared topology",
    'boolean': true
  })

  .options("cut-table", {
    describe: "detach attributes from shapes and save as a JSON file",
    'boolean': true
  })
  ;
};

// Parse command line and return options object for bin/mapshaper
//
MapShaper.getOpts = function() {
  var optimist = MapShaper.getOptionParser(),
      argv = optimist.argv,
      opts;

  if (argv.help) {
    MapShaper.getBasicOptionParser().showHelp();
    process.exit(0);
  }
  if (argv.more) {
    console.log( "More " + MapShaper.getExtraOptionParser().help());
    process.exit(0);
  }
  if (argv.version) {
    console.log(getVersion());
    process.exit(0);
  }
  if (argv.encodings) {
    MapShaper.printEncodings();
    process.exit(0);
  }

  // validate args against basic option parser so standard help message is shown
  var dummy = MapShaper.getBasicOptionParser().check(function() {
    opts = MapShaper.validateArgs(argv, getSupportedArgs());
  }).argv;

  C.VERBOSE = argv.verbose;
  return opts;
};

// Test option parsing -- throws an error if a problem is found.
// @argv array of command line tokens
//
MapShaper.checkArgs = function(argv) {
  var optimist = MapShaper.getOptionParser();
  return MapShaper.validateArgs(optimist.parse(argv), getSupportedArgs());
};

function getOptimist() {
  delete require.cache[require.resolve('optimist')];
  return require('optimist');
}

// Return an array of all recognized cli arguments: ["f", "format", ...]
//
function getSupportedArgs() {
  var optimist = MapShaper.getOptionParser(),
      args = optimist.help().match(/-([a-z][0-9a-z-]*)/g).map(function(arg) {
        return arg.replace(/^-/, '');
      });
  return args;
}

function getVersion() {
  var v;
  try {
    var packagePath = Node.resolvePathFromScript("../package.json"),
        obj = JSON.parse(Node.readFile(packagePath, 'utf-8'));
    v = obj.version;
  } catch(e) {}
  return v || "";
}

// Throw an error if @argv array contains an unsupported option
// @flags array of supported options
//
MapShaper.checkArgSupport = function(argv, flags) {
  var supportedOpts = flags.reduce(function(acc, opt) {
      acc[opt] = true;
      return acc;
    }, {'_': true, '$0': true});

  Utils.forEach(argv, function(val, arg) {
    // If --no-somearg is defined, also accept --somearg (optimist workaround)
    if (arg in supportedOpts === false && ("no-" + arg in supportedOpts) === false) {
      throw "Unsupported option: " + arg;
    }
  });
};

MapShaper.validateArgs = function(argv, supported) {
  MapShaper.checkArgSupport(argv, supported);

  // If an option is given multiple times, throw an error
  Utils.forEach(argv, function(val, arg) {
    if (Utils.isArray(val) && arg != '_') {
      throw new Error((arg.length == 1 ? '-' : '--') + arg + " option is repeated");
    }
  });

  var opts = {};
  Utils.extend(opts, cli.validateSimplifyOpts(argv));
  Utils.extend(opts, cli.validateTopologyOpts(argv));
  Utils.extend(opts, cli.validateExtraOpts(argv));
  Utils.extend(opts, cli.validateOutputOpts(argv));
  opts.input_files = cli.validateInputFiles(argv._);

  return opts;
};

MapShaper.getOutputPaths = function(files, dir, extension) {
  if (!files || !files.length) {
    console.log("No files to save");
    return;
  }
  // assign filenames
  Utils.forEach(files, function(obj) {
    obj.pathbase = Node.path.join(dir, obj.filebase);
    obj.extension = obj.extension || extension || "x"; // TODO: validate ext
  });

  // avoid naming conflicts
  var i = 0, suffix = "";
  while (cli.testFileCollision(files, suffix)) {
    i++;
    suffix = "-ms";
    if (i > 1) suffix += String(i);
  }

  // compose paths
  return Utils.map(files, function(obj) {
    return obj.pathbase + suffix + '.' + obj.extension;
  });
};

cli.testFileCollision = function(files, suff) {
  return Utils.some(files, function(obj) {
    var path = obj.pathbase + suff + '.' + obj.extension;
    return Node.fileExists(path);
  });
};

cli.validateFileExtension = function(path) {
  var type = MapShaper.guessFileType(path),
      valid = type == 'shp' || type == 'json';
  return valid;
};

cli.replaceFileExtension = function(path, ext) {
  var info = Node.parseFilename(path);
  return Node.path.join(info.relative_dir, info.base + "." + ext);
};

cli.validateInputFiles = function(arr) {
  var files = Utils.map(arr, cli.validateInputFile);
  if (files.length === 0) error("Missing an input file");
  return files;
};

cli.validateInputFile = function(ifile) {
  var opts = {};
  if (!Node.fileExists(ifile)) {
    error("File not found (" + ifile + ")");
  }
  if (!cli.validateFileExtension(ifile)) {
     error("File has an unsupported extension:", ifile);
  }
  return ifile;
};

cli.validateOutputOpts = function(argv) {
  var supportedTypes = ["geojson", "topojson", "shapefile"],
      odir = ".",
      //obase = ifileInfo.base, // default to input file name
      //oext = ifileInfo.ext,   // default to input file extension
      obase, oext, ofmt;

  // process --format option
  if (argv.f) {
    ofmt = argv.f.toLowerCase();
    // use default extension for output format
    // oext = MapShaper.getDefaultFileExtension(ofmt); // added during export
    if (!Utils.contains(supportedTypes, ofmt)) {
      error("Unsupported output format:", argv.f);
    }
  }

  // process -o option
  if (argv.o) {
    if (!Utils.isString(argv.o)) {
      error("-o option needs a file name");
    }
    var ofileInfo = Node.getFileInfo(argv.o);
    if (ofileInfo.is_directory) {
      odir = argv.o;
    } else if (ofileInfo.relative_dir && !Node.dirExists(ofileInfo.relative_dir)) {
      error("Output directory not found:", ofileInfo.relative_dir);
    } else if (!ofileInfo.base) {
      error('Invalid output file:', argv.o);
    } else {
      if (ofileInfo.ext) {
        if (!cli.validateFileExtension(ofileInfo.file)) {
          error("Output file looks like an unsupported file type:", ofileInfo.file);
        }
        // use -o extension, if present
        // allows .topojson or .geojson instead of .json
        // override extension inferred from --format option
        oext = ofileInfo.ext;
        // Infer output format from -o option extension when appropriate
        /*
        if (!ofmt &&
          MapShaper.guessFileFormat(oext) != MapShaper.guessFileFormat(ifileInfo.ext)) {
          ofmt =  MapShaper.guessFileFormat(oext);
        }
        */
      }
      obase = ofileInfo.base;
      odir = ofileInfo.relative_dir || '.';
    }
  }

  return {
    output_directory: odir,
    output_extension: oext || null, // inferred later if not found above
    output_file_base: obase || null,
    output_format: ofmt || null
  };
};

cli.validateCommaSepNames = function(str) {
  if (!Utils.isString(str)) {
    error ("Expected comma-separated list; found:", str);
  }
  var parts = Utils.map(str.split(','), Utils.trim);
  return parts;
};

cli.validateExtraOpts = function(argv) {
  var opts = {},
      tmp;

  if (argv.info) {
    opts.info = true;
  }

  if ('split-on-grid' in argv) {
    var rows = 4, cols = 4;
    tmp = argv['split-on-grid'];
    if (Utils.isString(tmp)) {
      tmp = tmp.split(',');
      cols = parseInt(tmp[0], 10);
      rows = parseInt(tmp[1], 10);
      if (rows <= 0 || cols <= 0) {
        error ("--split-on-grid expects columns,rows");
      }
    } else if (Utils.isInteger(tmp) && tmp > 0) {
      cols = tmp;
      rows = tmp;
    }
    opts.split_rows = rows;
    opts.split_cols = cols;
  }

  if (Utils.isString(argv.dissolve) || argv.dissolve === true) {
    opts.dissolve = argv.dissolve || true; // empty string -> true
  }

  if ('snap-interval' in argv) {
    opts.snap_interval = argv['snap-interval'];
    if (opts.snap_interval > 0) {
      opts.snapping = true;
    }
  }

  if (argv['sum-fields']) {
    opts.sum_fields = cli.validateCommaSepNames(argv['sum-fields']);
  }

  if (argv['copy-fields']) {
    opts.copy_fields = cli.validateCommaSepNames(argv['copy-fields']);
  }

  if (argv.split) {
    if (!Utils.isString(argv.split)) {
      error("--split option requires the name of a field to split on");
    }
    opts.split = argv.split;
  }

  if (argv['merge-layers']) {
    opts.recombine = argv['merge-layers'];
  }

  if (argv.expression) {
    opts.expression = argv.expression;
  }

  if (argv.subdivide) {
    if (!Utils.isString(argv.subdivide)) {
      error("--subdivide option requires a JavaScript expression");
    }
    opts.subdivide = argv.subdivide;
  }

  if (argv.filter) {
    if (!Utils.isString(argv.filter)) {
      error("--filter option requires a JavaScript expression");
    }
    opts.filter = argv.filter;
  }

  if (argv.postfilter) {
    if (!Utils.isString(argv.postfilter)) {
      error("--postfilter option requires a JavaScript expression");
    }
    opts.postfilter = argv.postfilter;
  }

  if (argv['cut-table']) {
    opts.cut_table = true;
  }

  if (argv['merge-files']) {
    opts.merge_files = true;
  }

  if (argv['combine-files']) {
    opts.combine_files = true;
  }

  if (argv['topojson-precision']) {
    opts.topojson_precision = argv['topojson-precision'];
  }

  if (argv['id-field']) {
    opts.id_field = argv['id-field'];
  }

  if (argv.innerlines) {
    opts.innerlines = true;
  }

  if (argv.lines) {
    if (Utils.isString(argv.lines)) {
      opts.lines = cli.validateCommaSepNames(argv.lines);
    } else {
      opts.lines = true;
    }
  }

  if (argv.encoding) {
    opts.encoding = cli.validateEncoding(argv.encoding);
  }

  validateJoinOpts(argv, opts);

  return opts;
};

cli.validateTopologyOpts = function(argv) {
  var opts = {};
  if (argv.precision) {
    if (!Utils.isNumber(argv.precision) || argv.precision <= 0) {
      error("--precision option should be a positive number");
    }
    opts.precision = argv.precision;
  }
  opts.repair = argv.repair !== false;
  opts.snapping = !!argv['auto-snap'];

  if (argv.topology === false) { // handle --no-topology
    opts.no_topology = true;
    // trying to repair simplified polygons without topology is pointless
    // and is likely to take a long time as many intersections are unrolled
    // therefore disabling repair option
    opts.repair = false;
  }
  return opts;
};

cli.validateSimplifyOpts = function(argv) {
  var opts = {};
  if (argv.i) {
    if (!Utils.isNumber(argv.i) || argv.i < 0) error("-i (--interval) option should be a non-negative number");
    opts.simplify_interval = argv.i;
  }
  else if ('p' in argv) {
    if (!Utils.isNumber(argv.p) || argv.p < 0 || argv.p > 1)
      error("-p (--pct) expects a number in the range 0-1");
    if (argv.p < 1) {
      opts.simplify_pct = argv.p;
    }
  }

  if (argv.cartesian) {
    opts.force2D = true;
  }

  if (argv.quantization) {
    if (!Utils.isInteger(argv.quantization) || argv.quantization < 0) {
      error("--quantization option should be a nonnegative integer");
    }
    opts.topojson_resolution = argv.quantization;
  } else if (argv.quantization === false || argv.quantization === 0) {
    opts.topojson_resolution = 0; // handle --no-quantization
  }

  opts.use_simplification = Utils.isNumber(opts.simplify_pct) || Utils.isNumber(opts.simplify_interval);

  if (opts.use_simplification) {
    opts.keep_shapes = !!argv['keep-shapes'];
    if (argv.dp)
      opts.simplify_method = "dp";
    else if (argv.visvalingam)
      opts.simplify_method = "vis";
    else if (argv['modified-v1'])
      opts.simplify_method = "mod1";
    else
      opts.simplify_method = "mod2";
  }
  return opts;
};

cli.printRepairMessage = function(info, opts) {
  if (info.intersections_initial > 0 || opts.verbose) {
    console.log(Utils.format(
        "Repaired %'i intersection%s; unable to repair %'i intersection%s.",
        info.intersections_repaired, "s?", info.intersections_remaining, "s?"));
    if (info.intersections_remaining > 10) {
      if (!opts.snapping) {
        console.log("Tip: use --auto-snap to fix minor topology errors.");
      }
    }
  }
};

cli.validateEncoding = function(raw) {
  var enc = raw.replace(/-/, '').toLowerCase();
  if (!Utils.contains(MapShaper.getEncodings(), enc)) {
    console.log("[Unsupported encoding:", raw + "]");
    MapShaper.printEncodings();
    process.exit(0);
  }
  return enc;
};

function validateCommaSep(str, count) {
  var parts = Utils.mapFilter(str.split(','), function(part) {
    var str = Utils.trim(part);
    return str === '' ? void 0 : str;
  });
  if (parts.length === 0 || count && parts.length !== count) {
    return null;
  }
  return parts;
}

function validateJoinOpts(argv, opts) {
  var file = argv.join,
      fields = argv['join-fields'],
      keys = argv['join-keys'],
      includeArr, keyArr;

  if (!file) return;

  if (Utils.some("shp,xls,xlsx".split(','), function(suff) {
    return Utils.endsWith(file, suff);
  })) {
    error("--join currently only supports dbf and csv files");
  }

  if (!Node.fileExists(file)) {
    error("Missing join file (" + file + ")");
  }
  if (!keys) error("Missing required --join-keys argument");
  keyArr = validateCommaSep(keys, 2);
  if (!keyArr) error("--join-keys takes two comma-seperated names, e.g.: FIELD1,FIELD2");
  includeArr = fields && validateCommaSep(fields) || null;

  opts.join_file = file;
  opts.join_keys = keyArr;
  opts.join_fields = includeArr;
}

// Force v8 to perform a complete gc cycle.
// To enable, run node with --expose_gc
// Timing gc() gives a crude indication of number of objects in memory.
//
MapShaper.gc = function() {
  if (global.gc) {
    T.start();
    global.gc();
    T.stop("gc()");
  }
};

var api = Utils.extend(MapShaper, {
  Node: Node,
  Utils: Utils,
  Opts: Opts,
  trace: trace,
  error: error,
  T: T,
  BinArray: BinArray,
  DouglasPeucker: DouglasPeucker,
  Visvalingam: Visvalingam,
  ShpReader: ShpReader,
  Dbf: Dbf,
  C: C,
  Bounds: Bounds
});

module.exports = api;
C.VERBOSE = false;

})();
