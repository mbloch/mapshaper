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

  defaults: function(dest) {
    for (var i=1, n=arguments.length; i<n; i++) {
      var src = arguments[i] || {};
      for (var key in src) {
        if (key in dest === false && src.hasOwnProperty(key)) {
          dest[key] = src[key];
        }
      }
    }
    return dest;
  },

  extend: function(dest) {
    for (var i=1, n=arguments.length; i<n; i++) {
      var src = arguments[i] || {};
      for (var key in src) {
        if (src.hasOwnProperty(key)) {
          dest[key] = src[key];
        }
      }
    }
    return dest;
  }
};

var Opts = {
  copyAllParams: Utils.extend,
  copyNewParams: Utils.defaults,

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

    if (typeof define === "function" && define.amd) {
      define(function() { return obj; });
    }

    if (Env.inNode) {
      module.exports = obj;
    } else {
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
  }
};

var trace = function() {
  if (C.VERBOSE) {
    Utils.log(Utils.map(arguments, Utils.strval).join(' '));
  }
};

var verbose = trace;

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
    if (T.verbose && msg) verbose(T.prefix() + msg);
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
      verbose(msg);
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

Utils.count = function(arr, func, ctx) {
  return Utils.filter(arr, func, ctx).length;
};

Utils.getValueCounts = function(obj) {
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
};

if (inNode) {
  Node.arguments = process.argv.slice(1); // remove "node" from head of argv list

  Node.gc = function() {
    global.gc && global.gc();
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
      error ("[Node.toBuffer()] unsupported input:", src);
    }
    return buf;
  };
}




// Convenience functions for working with the local filesystem
if (Node.inNode) {
  Node.path = require('path');
}

Node.statSync = function(fpath) {
  var obj = null;
  try {
    obj = require('fs').statSync(fpath);
  }
  catch(e) {
    //trace(e, fpath);
  }
  return obj;
};

Node.walkSync = function(dir, results) {
  results = results || [];
  var list = require('fs').readdirSync(dir);
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


Node.shellExec = function(cmd) {
  var parts = cmd.split(/[\s]+/); // TODO: improve, e.g. handle quoted strings w/ spaces
  var spawn = require('child_process').spawn;
  spawn(parts[0], parts.slice(1), {stdio: "inherit"});
};

// Converts relative path to absolute path relative to the node script;
// absolute paths returned unchanged
Node.resolvePathFromScript = function(path) {
  if (Node.pathIsAbsolute(path))
    return path;
  var scriptDir = Node.getFileInfo(require.main.filename).directory;
  return Node.path.join(scriptDir, path);
};

Node.resolvePathFromShell = function(path) {
  return Node.pathIsAbsolute(path) ? path : Node.path.join(process.cwd(), path);
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

Node.fileSize = function(path) {
  var ss = Node.statSync(path);
  return ss && ss.size || 0;
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
Node.readFile = function(fname, charset) {
  return require('fs').readFileSync(fname, charset || void 0);
};

Node.writeFile = function(path, content) {
  if (content instanceof ArrayBuffer) {
    content = Node.toBuffer(content);
  }
  require('rw').writeFileSync(path, content, 0, null, 0);
};

Node.copyFile = function(src, dest) {
  var fs = require('fs');
  if (!Node.fileExists(src)) error("[copyFile()] File not found:", src);
  var content = fs.readFileSync(src);
  fs.writeFileSync(dest, content);
};



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
  return this.xmin <= this.xmax && this.ymin <= this.ymax;
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
    var str = "",
        count = fixedLen >= 0 ? fixedLen : this.bytesLeft();
    while (count > 0) {
      var byteVal = this.readUint8();
      count--;
      if (byteVal == 0) {
        break;
      } else if (byteVal > 127 && asciiOnly) {
        str = null;
        break;
      }
      str += String.fromCharCode(byteVal);
    }

    if (fixedLen > 0 && count > 0) {
      this.skipBytes(count);
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





var api = {};
var MapShaper = api.internal = {};
var geom = api.geom = {};
var utils = api.utils = Utils.extend({}, Utils);

MapShaper.LOGGING = false;
MapShaper.TRACING = false;
MapShaper.VERBOSE = false;

api.enableLogging = function() {
  MapShaper.LOGGING = true;
  return api;
};

api.printError = function(err) {
  if (utils.isString(err)) {
    err = new APIError(err);
  }
  if (MapShaper.LOGGING && err.name == 'APIError') {
    message("Error: " + err.message);
    message("Run mapshaper -h to view help");
  } else {
    throw err;
  }
};

// Handle an error caused by invalid input or misuse of API
function stop() {
  var message = Utils.toArray(arguments).join(' ');
  var err = new APIError(message);
  throw err;
}

function APIError(msg) {
  var err = new Error(msg);
  err.name = 'APIError';
  return err;
}

var message = function() {
  if (MapShaper.LOGGING) {
    logArgs(arguments);
  }
};

var verbose = function() {
  if (MapShaper.VERBOSE && MapShaper.LOGGING) {
    logArgs(arguments);
  }
};

var trace = function() {
  if (MapShaper.TRACING) {
    logArgs(arguments);
  }
};

function logArgs(args) {
  if (Utils.isArrayLike(args)) {
    var arr = Utils.toArray(args);
    (console.error || console.log).apply(console, arr);
  }
}

function absArcId(arcId) {
  return arcId >= 0 ? arcId : ~arcId;
}

// Parse the path to a file
// Assumes: not a directory path
utils.parseLocalPath = function(path) {
  var obj = {},
      parts = path.split('/'), // TODO: fix
      i;

  if (parts.length == 1) {
    obj.filename = parts[0];
    obj.directory = "";
  } else {
    obj.filename = parts.pop();
    obj.directory = parts.join('/');
  }
  i = obj.filename.lastIndexOf('.');
  if (i > -1) {
    obj.extension = obj.filename.substr(i + 1);
    obj.basename = obj.filename.substr(0, i);
    obj.pathbase = path.substr(0, path.lastIndexOf('.'));
  } else {
    obj.extension = "";
    obj.basename = obj.filename;
    obj.pathbase = path;
  }
  return obj;
};

utils.getFileBase = function(path) {
  return utils.parseLocalPath(path).basename;
};

utils.getFileExtension = function(path) {
  return utils.parseLocalPath(path).extension;
};

utils.getPathBase = function(path) {
  return utils.parseLocalPath(path).pathbase;
};

MapShaper.guessFileType = function(file) {
  var ext = utils.getFileExtension(file).toLowerCase(),
      type = null;
  if (file == '/dev/stdin') {
    type = 'json';
  } else if (/json$/i.test(file)) {
    type = 'json';
  } else if (ext == 'shp' || ext == 'dbf' || ext == 'prj') {
    type = ext;
  }
  return type;
};

MapShaper.guessFileFormat = function(file, inputFormat) {
  var type = MapShaper.guessFileType(file),
      format = null;
  if (type == 'shp') {
    format = 'shapefile';
  } else if (type == 'json') {
    if (/geojson$/.test(file)) {
      format = 'geojson';
    } else if (/topojson$/.test(file) || inputFormat == 'topojson') {
      format = 'topojson';
    } else {
      format = 'geojson';
    }
  }
  return format;
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

MapShaper.getCommonFileBase = function(names) {
  return names.reduce(function(memo, name, i) {
    if (i === 0) {
      memo = utils.getFileBase(name);
    } else {
      memo = MapShaper.mergeNames(memo, name);
    }
    return memo;
  }, "");
};

MapShaper.mergeNames = function(name1, name2) {
  var merged = "";
  if (name1 && name2) {
    merged = utils.findStringPrefix(name1, name2).replace(/[-_]$/, '');
  }
  return merged;
};

utils.findStringPrefix = function(a, b) {
  var i = 0;
  for (var n=a.length; i<n; i++) {
    if (a[i] !== b[i]) break;
  }
  return a.substr(0, i);
};

MapShaper.probablyDecimalDegreeBounds = function(b) {
  if (b instanceof Bounds) b = b.toArray();
  return containsBounds([-200, -91, 200, 91], b);
};

MapShaper.layerHasPaths = function(lyr) {
  return lyr.shapes && (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline');
};

MapShaper.layerHasPoints = function(lyr) {
  return lyr.shapes && lyr.geometry_type == 'point';
};

MapShaper.requirePolygonLayer = function(lyr, msg) {
  if (!lyr || lyr.geometry_type !== 'polygon') stop(msg || "Expected a polygon layer");
};

MapShaper.requirePathLayer = function(lyr, msg) {
  if (!lyr || !MapShaper.layerHasPaths(lyr)) stop(msg || "Expected a polygon or polyline layer");
};




function CommandParser() {
  var _usage = "",
      _examples = [],
      _commands = [],
      _default = null,
      _note;

  if (this instanceof CommandParser === false) return new CommandParser();

  this.usage = function(str) {
    _usage = str;
    return this;
  };

  this.note = function(str) {
    _note = str;
    return this;
  };

  // set a default command; applies to command line args preceding the first
  // explicit command
  this.default = function(str) {
    _default = str;
  };

  this.example = function(str) {
    _examples.push(str);
  };

  this.command = function(name) {
    var opts = new CommandOptions(name);
    _commands.push(opts);
    return opts;
  };

  this.parseArgv = function(raw) {
    var commandDefs = getCommands(),
        commandRxp = /^--?([\w-]+)$/i,
        commands = [], cmd,
        argv = raw.concat(), // make copy, so we can consume the array
        cmdName, cmdDef, opt;

    while (argv.length > 0) {
      // if there are arguments before the first explicit command, use the default command
      if (commands.length === 0 && moreOptions(argv)) {
        cmdName = _default;
      } else {
        cmdName = readCommandName(argv);
      }
      if (!cmdName) stop("Invalid command:", argv[0]);
      cmdDef = findCommandDefn(cmdName, commandDefs);
      if (!cmdDef) {
        stop("Unknown command:", '-' + cmdName);
      }
      cmd = {
        name: cmdDef.name,
        options: {},
        _: []
      };

      while (moreOptions(argv)) {
        opt = readOption(argv, cmdDef);
        if (!opt) {
          // not a defined option; add it to _ array for later processing
          cmd._.push(argv.shift());
        } else {
          cmd.options[opt[0]] = opt[1];
        }
      }

      if (cmdDef.validate) {
        try {
          cmdDef.validate(cmd);
        } catch(e) {
          stop("[" + cmdName + "] " + e.message);
        }
      }
      commands.push(cmd);
    }
    return commands;

    function moreOptions(argv) {
      return argv.length > 0 && !commandRxp.test(argv[0]);
    }

    function readOption(argv, cmdDef) {
      var token = argv[0],
          optRxp = /^([a-z0-9_+-]+)=(.+)$/i,
          match = optRxp.exec(token),
          name = match ? match[1] : token,
          optDef = findOptionDefn(name, cmdDef),
          optName,
          optVal;

      if (!optDef) return null;

      if (match && (optDef.type == 'flag' || optDef.assign_to)) {
        stop("-" + cmdDef.name + " " + name + " doesn't take a value");
      }

      if (match) {
        argv[0] = match[2];
      } else {
        argv.shift();
      }

      optName = optDef.assign_to || optDef.name.replace(/-/g, '_');
      optVal = readOptionValue(argv, optDef);
      if (optVal === null) {
        stop("Invalid value for -" + cmdDef.name + " " + optName);
      }
      return [optName, optVal];
    }

    function readOptionValue(args, def) {
      var type = def.type,
          raw, val;
      if (type == 'flag') {
        val = true;
      } else if (def.assign_to) { // opt is a member of a set, assigned to another name
        val = def.name;
      } else {
        raw = args[0];
        if (type == 'number') {
          val = Number(raw);
        } else if (type == 'integer') {
          val = Math.round(Number(raw));
        } else if (type == 'comma-sep') {
          val = raw.split(',');
        } else if (type) {
          val = null; // unknown type
        } else {
          val = raw; // string
        }

        if (val !== val || val === null) {
          val = null; // null indicates invalid value
        } else {
          args.shift(); // good value, remove from argv
        }
      }

      return val;
    }

    function readCommandName(args) {
      var match = commandRxp.exec(args[0]);
      if (match) {
        args.shift();
        return match[1];
      }
      return null;
    }

    function findCommandDefn(name, arr) {
      return Utils.find(arr, function(cmd) {
        return cmd.name === name || cmd.alias === name;
      });
    }

    function findOptionDefn(name, cmd) {
      return Utils.find(cmd.options, function(o) {
        return o.name === name || o.alias === name;
      });
    }
  };

  this.getHelpMessage = function(commandNames) {
    var allCommands = getCommands(),
        helpCommands = allCommands,
        helpStr = '',
        cmdPre = ' ',
        optPre = '  ',
        gutter = '  ',
        colWidth = 0,
        detailView = false;

    if (commandNames) {
      detailView = true;
      if (Utils.contains(commandNames, 'all')) {
        helpCommands = allCommands;
      } else {
        helpCommands = allCommands.filter(function(cmd) {
          return Utils.contains(commandNames, cmd.name);
        });
      }

      if (helpCommands.length === 0) {
        detailView = false;
        helpCommands = allCommands;
      }
    }

    if (detailView) {
      helpStr += "\n";
    } else if (_usage) {
      helpStr +=  _usage + "\n\n";
    }

    helpCommands.forEach(function(obj) {
      if (obj.describe) {
        var help = cmdPre + (obj.name ? "-" + obj.name : "");
        if (obj.alias) help += ", -" + obj.alias;
        obj.help = help;
        colWidth = Math.max(colWidth, help.length);
      }
      if (detailView) {
        obj.options.forEach(formatOption);
      }
    });

    helpCommands.forEach(function(obj, i) {
      if (helpCommands == allCommands && obj.title) {
        helpStr += obj.title + "\n";
      }
      if (obj.describe) {
        helpStr += formatHelpLine(obj.help, obj.describe);
      }
      if (obj.title || obj.describe) {

       if (detailView && obj.options.length > 0) {
          obj.options.forEach(addOptionHelp);
          helpStr += '\n';
        }
      }
    });

    if (!detailView && _examples.length > 0) {
      helpStr += "\nExamples\n";
      _examples.forEach(function(str) {
        helpStr += "\n" + str + "\n";
      });
    }

    if (!detailView && _note) {
      helpStr += '\n' + _note;
    }

    return helpStr;

    function formatHelpLine(help, desc) {
      return Utils.rpad(help, colWidth, ' ') + gutter + (desc || '') + '\n';
    }

    function formatOption(o) {
      if (o.describe) {
        o.help = optPre;
        if (o.label) {
          o.help += o.label;
        } else {
          o.help += o.name;
          if (o.alias) o.help += ", " + o.alias;
          if (o.type != 'flag' && !o.assign_to) o.help += "=";
        }
        colWidth = Math.max(colWidth, o.help.length);
      }
    }

    function addOptionHelp(o) {
      if (o.help) {
        helpStr += formatHelpLine(o.help, o.describe);
      }
    }
  };

  this.printHelp = function(commands) {
    console.log(this.getHelpMessage(commands));
  };

  function getCommands() {
    return _commands.map(function(cmd) {
      return cmd.done();
    });
  }
}

function CommandOptions(name) {
  var _command = {
    name: name,
    options: []
  };

  this.validate = function(f) {
    _command.validate = f;
    return this;
  };

  this.describe = function(str) {
    _command.describe = str;
    return this;
  };

  this.alias = function(name) {
    _command.alias = name;
    return this;
  };

  this.title = function(str) {
    _command.title = str;
    return this;
  };

  this.option = function(name, opts) {
    opts = opts || {}; // accept just a name -- some options don't need properties
    if (!Utils.isString(name) || !name) error("Missing option name");
    if (!Utils.isObject(opts)) error("Invalid option definition:", opts);
    opts.name = name;
    _command.options.push(opts);
    return this;
  };

  this.done = function() {
    return _command;
  };
}





function validateHelpOpts(cmd) {
  var commands = validateCommaSepNames(cmd._[0]);
  if (commands) {
    cmd.options.commands = commands;
  }
}

function validateInputOpts(cmd) {
  var o = cmd.options,
      _ = cmd._;

  if (_[0] == '-' || _[0] == '/dev/stdin') {
    o.stdin = true;
  } else {
    o.files = cli.validateInputFiles(_);
  }

  if ("precision" in o && o.precision > 0 === false) {
    error("precision option should be a positive number");
  }

  if (o.encoding) {
    o.encoding = cli.validateEncoding(o.encoding);
  }
}

function validateSimplifyOpts(cmd) {
  var o = cmd.options,
      _ = cmd._,
      methods = ["visvalingam", "dp"];

  if (o.method) {
    if (!Utils.contains(methods, o.method)) {
      error(o.method, "is not a recognized simplification method; choos from:", methods);
    }
  }

  var pctStr = o.pct || "";
  if (_.length > 0) {
    if (/^[0-9.]+%?$/.test(_[0])) {
      pctStr = _.pop();
    }
    if (_.length > 0) {
      error("unparsable option:", _.join(' '));
    }
  }

  if (pctStr) {
    var isPct = pctStr.indexOf('%') > 0;
    if (isPct) {
      o.pct = Number(pctStr.replace('%', '')) / 100;
    } else {
      o.pct = Number(pctStr);
    }
    if (!(o.pct >= 0 && o.pct <= 1)) {
      error(Utils.format("out-of-range pct value: %s", pctStr));
    }
  }

  var intervalStr = o.interval;
  if (intervalStr) {
    o.interval = Number(intervalStr);
    if (o.interval >= 0 === false) {
      error(Utils.format("out-of-range interval value: %s", intervalStr));
    }
  }

  if (isNaN(o.interval) && isNaN(o.pct)) {
    error("command requires an interval or pct");
  }
}

function validateJoinOpts(cmd) {
  var o = cmd.options;
  o.source = o.source || cmd._[0];

  if (!o.source) {
    error("command requires the name of a file to join");
  }

  if (Utils.some("shp,xls,xlsx".split(','), function(suff) {
    return Utils.endsWith(o.source, suff);
  })) {
    error("currently only dbf and csv files are supported");
  }

  if (!cli.isFile(o.source)) {
    error("missing source file:", o.source);
  }

  if (!o.keys) error("missing required keys option");
  if (!isCommaSep(o.keys)) error("keys= option takes two comma-separated names, e.g.: FIELD1,FIELD2");

  if (o.fields && !isCommaSep(o.fields)) {
    error("fields= option is a comma-sep. list of fields to join");
  }
}

function isCommaSep(arr, count) {
  var ok = arr && Utils.isArray(arr);
  if (count) ok = ok && arr.length === count;
  return ok;
}

function validateSplitOpts(cmd) {
  if (cmd._.length == 1) {
    cmd.options.field = cmd._[0];
  } else if (cmd._.length > 1) {
    error("command takes a single field name");
  }
}

function validateClip(cmd) {
  var src = cmd.options.source || cmd._[0];
  if (src) {
    cmd.options.source = src;
  } else {
    error("command requires a source file or layer id");
  }
}

function validateDissolveOpts(cmd) {
  var _= cmd._,
      o = cmd.options;
  if (_.length == 1) {
    o.field = _[0];
  } else if (_.length > 1) {
    error("command takes a single field name");
  }

  if (o.sum_fields && !isCommaSep(o.sum_fields)) error("sum-fields= option takes a comma-sep. list");
  if (o.copy_fields && !isCommaSep(o.copy_fields)) error("copy-fields= option takes a comma-sep. list");
}

function validateMergeLayersOpts(cmd) {
  if (cmd._.length > 0) error("unexpected option:", cmd._);
}

function validateRenameLayersOpts(cmd) {
  cmd.options.names = validateCommaSepNames(cmd._[0]) || null;
}

function validateSplitOnGridOpts(cmd) {
  var o = cmd.options;
  if (cmd._.length == 1) {
    var tmp = cmd._[0].split(',');
    o.cols = parseInt(tmp[0], 10);
    o.rows = parseInt(tmp[1], 10) || o.cols;
  }

  if (o.rows > 0 === false || o.cols > 0 === false) {
    error("comand expects cols,rows");
  }
}

function validateLinesOpts(cmd) {
  try {
    var fields = validateCommaSepNames(cmd.options.fields || cmd._[0]);
    if (fields) cmd.options.fields = fields;
  } catch (e) {
    error("command takes a comma-separated list of fields");
  }
}

function validateInnerLinesOpts(cmd) {
  if (cmd._.length > 0) {
    error("command takes no arguments");
  }
}

function validateSubdivideOpts(cmd) {
  if (cmd._.length !== 1) {
    error("command requires a JavaScript expression");
  }
  cmd.options.expression = cmd._[0];
}

function validateFilterFieldsOpts(cmd) {
  try {
    var fields = validateCommaSepNames(cmd._[0]);
    cmd.options.fields = fields || [];
  } catch(e) {
    error("command requires a comma-sep. list of fields");
  }
}

function validateExpressionOpts(cmd) {
  if (cmd._.length !== 1) {
    error("command requires a JavaScript expression");
  }
  cmd.options.expression = cmd._[0];
}

function validateOutputOpts(cmd) {
  var _ = cmd._,
      o = cmd.options,
      path = _[0] || "",
      pathInfo = utils.parseLocalPath(path),
      supportedTypes = ["geojson", "topojson", "shapefile"];

  if (_.length > 1) {
    error("command takes one file or directory argument");
  }

  if (!path) {
    // no output file or dir
  } else if (path == '-' || path == '/dev/stdout') {
    o.stdout = true;
  } else if (!pathInfo.extension) {
    o.output_dir = path;
  } else {
    if (pathInfo.directory) o.output_dir = pathInfo.directory;
    o.output_file = pathInfo.filename;
  }

  if (o.output_file && !cli.validateFileExtension(o.output_file)) {
    error("Output file looks like an unsupported file type:", o.output_file);
  }

  if (o.output_dir && !cli.isDirectory(o.output_dir)) {
    if (!cli.isDirectory(o.output_dir)) {
      error("Output directory not found:", o.output_dir);
    }
  }

  if (o.format) {
    o.format = o.format.toLowerCase();
    if (!Utils.contains(supportedTypes, o.format)) {
      error("Unsupported output format:", o.format);
    }
  }

  if (o.encoding) {
    o.encoding = cli.validateEncoding(o.encoding);
  }

  // topojson-specific
  if ("quantization" in o && o.quantization > 0 === false) {
    error("quantization= option should be a nonnegative integer");
  }

  if ("topojson_precision" in o && o.topojson_precision > 0 === false) {
    error("topojson-precision= option should be a positive number");
  }

}

// Convert a comma-separated string into an array of trimmed strings
// Return null if list is empty
function validateCommaSepNames(str, min) {
  if (!min && !str) return null; // treat
  if (!Utils.isString(str)) {
    error ("expected comma-separated list; found:", str);
  }
  var parts = str.split(',').map(Utils.trim).filter(function(s) {return !!s;});
  if (min && min > parts.length < min) {
    error(Utils.format("expected a list of at least %d member%s; found: %s", min, 's?', str));
  }
  return parts.length > 0 ? parts : null;
}




MapShaper.parseCommands = function(arr) {
  return MapShaper.getOptionParser().parseArgv(arr);
};

MapShaper.getOptionParser = function() {
  // definitions of options shared by more than one command
  var targetOpt = {
        describe: "layer(s) to target (comma-sep. list); default is all layers"
      },
      nameOpt = {
        describe: "rename the edited layer(s)"
      },
      noReplaceOpt = {
        alias: "+",
        type: 'flag',
        describe: "retain the original layer(s) instead of replacing"
      },
      encodingOpt = {
        describe: "text encoding of .dbf file"
      },
      autoSnapOpt = {
        describe: "snap nearly identical points to fix minor topology errors",
        type: "flag"
      },
      snapIntervalOpt = {
        describe: "specify snapping distance in source units",
        type: "number"
      },
      sumFieldsOpt = {
        describe: "fields to sum when dissolving  (comma-sep. list)",
        type: "comma-sep"
      },
      copyFieldsOpt = {
        describe: "fields to copy when dissolving (comma-sep. list)",
        type: "comma-sep"
      },
      dissolveFieldOpt = {
        label: "<field>",
        describe: "(optional) name of a data field to dissolve on"
      };

  var parser = new CommandParser(),
      usage = "Usage\n" +
    "  mapshaper [-i] input-file(s) [input-options] [-command [options]] ...\n" +
    "  mapshaper -h [command(s)]\n" +
    "  mapshaper -encodings|version";
  parser.usage(usage);

  parser.example("Fix minor topology errors, simplify to 10%, convert to GeoJSON\n" +
      "$ mapshaper states.shp auto-snap -simplify 10% -o format=geojson");

  parser.example("Aggregate census tracts to counties\n" +
      "$ mapshaper tracts.shp -each \"CTY_FIPS=FIPS.substr(0, 5)\" -dissolve CTY_FIPS");

  parser.example("Use mapshaper -help <command> to view options for a single command");

  parser.default('i');

  parser.command('i')
    .title("Editing commands")
    .describe("input one or more files")
    .validate(validateInputOpts)
    .option("files", {
      label: "<file(s)>",
      describe: "files to import (separated by spaces), or - to use stdin"
    })
    .option("merge-files", {
      describe: "merge features from compatible files into the same layer",
      type: "flag"
    })
    .option("combine-files", {
      describe: "import files to separate layers with shared topology",
      type: "flag"
    })
    .option("no-topology", {
      describe: "treat each shape as topologically independent",
      type: "flag"
    })
    .option("precision", {
      describe: "coordinate precision in source units, e.g. 0.001",
      type: "number"
    })
    .option("auto-snap", autoSnapOpt)
    .option("snap-interval", snapIntervalOpt)
    .option("encoding", encodingOpt)
    .option("id-field", {
      describe: "import Topo/GeoJSON id property to this field"
    });

  parser.command('o')
    .describe("output edited content")
    .validate(validateOutputOpts)
    .option('_', {
      label: "<file|dir|->",
      describe: "(optional) name of output file or directory, or - for stdout"
    })
    .option("format", {
      describe: "set export format (shapefile|geojson|topojson)"
    })
    .option("force", {
      type: "flag",
      describe: "let output files overwrite existing files"
    })
    /*
    .option("encoding", {
      describe: "text encoding of .dbf file"
    })*/

    .option("bbox-index", {
      describe: "export a .json file with bbox of each layer",
      type: 'flag'
    })
    /*
    .option("drop-table", {
      describe: "delete data attributes",
      type: "flag"
    })
    */
    .option("cut-table", {
      describe: "detach data attributes from shapes and save as a JSON file",
      type: "flag"
    })
    .option("drop-table", {
      describe: "remove data attributes from output",
      type: "flag"
    })
    .option("precision", {
      describe: "coordinate precision in source units, e.g. 0.001",
      type: "number"
    })
    .option("bbox", {
      type: "flag",
      describe: "(Topo/GeoJSON) add bbox property"
    })
    .option("id-field", {
      describe: "(Topo/GeoJSON) field to use for id property"
    })
    .option("quantization", {
      describe: "(TopoJSON) specify quantization (auto-set by default)",
      type: "integer"
    })
    .option("no-quantization", {
      describe: "(TopoJSON) export arc coordinates without quantization",
      type: "flag"
    })
    .option('presimplify', {
      describe: "(TopoJSON) add per-vertex data for dynamic simplification",
      type: "flag"
    })
    .option("topojson-precision", {
      // describe: "pct of avg segment length for rounding (0.02 is default)",
      type: "number"
    })
    .option("target", targetOpt);

  parser.command('simplify')
    .validate(validateSimplifyOpts)
    .describe("simplify the geometry of polygon and polyline features")
    .option('pct', {
      alias: 'p',
      label: "<x%>",
      describe: "percentage of removable points to retain, e.g. 10%"
    })
    .option("dp", {
      alias: "rdp",
      describe: "use (Ramer-)Douglas-Peucker simplification",
      assign_to: "method"
    })
    .option("visvalingam", {
      describe: "use Visvalingam simplification with \"effective area\" metric",
      assign_to: "method"
    })
    .option("method", {
      // hidden option
    })
    .option("interval", {
      // alias: "i",
      describe: "target resolution in linear units (alternative to %)",
      type: "number"
    })
    .option("cartesian", {
      describe: "simplify decimal degree coords in 2D space (default is 3D)",
      type: "flag"
    })
    .option("keep-shapes", {
      describe: "prevent small polygon features from disappearing",
      type: "flag"
    })
    .option("no-repair", {
      describe: "don't remove intersections introduced by simplification",
      type: "flag"
    });

  parser.command("join")
    .describe("join a dbf or delimited text file to the input features")
    .validate(validateJoinOpts)
    .option("source", {
      label: "<file>",
      describe: "file containing data records"
    })
    .option("keys", {
      describe: "target,source keys, e.g. keys=FIPS,CNTYFIPS:str",
      type: "comma-sep"
    })
    .option("fields", {
      describe: "fields to join, e.g. fields=FIPS:str,POP (default is all)",
      type: "comma-sep"
    })
    .option("where", {
      describe: "use a JS expression to filter records from source table"
    })
    .option("encoding", encodingOpt)
    .option("target", targetOpt);

  parser.command("each")
    .describe("create/update/delete data fields using a JS expression")
    .validate(validateExpressionOpts)
    .option("expression", {
      label: "<expression>",
      describe: "JS expression to apply to each target feature"
    })
    .option("target", targetOpt);

  parser.command("filter")
    .describe("filter features using a JavaScript expression")
    .validate(validateExpressionOpts)
    .option("expression", {
      label: "<expression>",
      describe: "boolean JS expression applied to each feature"
    })
    .option("target", targetOpt);

  parser.command("filter-fields")
    .describe('filter and rename data fields, e.g. "fips,st=state"')
    .validate(validateFilterFieldsOpts)
    .option("fields", {
      label: "<field(s)>",
      describe: "comma-sep. list of fields to retain"
    })
    .option("target", targetOpt);

  parser.command("clip")
    .describe("use a polygon layer to clip another polygon layer")
    .validate(validateClip)
    .option("source", {
      label: "<file|layer>",
      describe: "file or layer containing clip polygons"
    })
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("erase")
    .describe("use a polygon layer to erase another polygon layer")
    .validate(validateClip)
    .option("source", {
      label: "<file|layer>",
      describe: "file or layer containing erase polygons"
    })
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("dissolve")
    .validate(validateDissolveOpts)
    .describe("merge adjacent polygons")
    .option("field", dissolveFieldOpt)
    .option("sum-fields", sumFieldsOpt)
    .option("copy-fields", copyFieldsOpt)
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("dissolve2")
    .validate(validateDissolveOpts)
    // .describe("merge adjacent and overlapping polygons")
    .option("field", dissolveFieldOpt)
    .option("sum-fields", sumFieldsOpt)
    .option("copy-fields", copyFieldsOpt)
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("explode")
    .describe("separate multi-part features into single-part features")
    .option("convert-holes", {type: "flag"}) // testing
    .option("target", targetOpt);

  parser.command("lines")
    .describe("convert polygons to classified polylines")
    .validate(validateLinesOpts)
    .option("fields", {
      label: "<field(s)>",
      describe: "optional comma-sep. list of fields to create a hierarchy",
      type: "comma-sep"
    })
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("innerlines")
    .describe("convert polygons to polylines along shared boundaries")
    .validate(validateInnerLinesOpts)
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("split")
    .describe("split features on a data field")
    .validate(validateSplitOpts)
    .option("field", {
      label: '<field>',
      describe: "name of an attribute field"
    })
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("merge-layers")
    .describe("merge split-apart layers back into a single layer")
    .validate(validateMergeLayersOpts)
    .option("name", nameOpt)
    .option("target", targetOpt);

  parser.command("rename-layers")
    .describe("assign new names to layers (comma-sep. list)")
    .validate(validateRenameLayersOpts)
    .option("target", targetOpt);

  parser.command("subdivide")
    .describe("recursively split a layer using a JS expression")
    .validate(validateSubdivideOpts)
    .option("expression", {
      label: "<expression>",
      describe: "boolean JS expression"
    })
    // .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("split-on-grid")
    .describe("split features into separate layers according to a grid")
    .validate(validateSplitOnGridOpts)
    .option("-", {
      label: "<cols,rows>",
      describe: "size of the grid, e.g. -split-on-grid 12,10"
    })
    .option("cols", {
      type: "integer"
    })
    .option("rows", {
      type: "integer"
    })
    // .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command('encodings')
    .title("\nInformational commands")
    .describe("print list of supported text encodings (for .dbf import)");

  parser.command('version')
    .alias('v')
    .describe("print mapshaper version");

  parser.command('info')
    .describe("print information about data layers");

  parser.command('verbose')
    .describe("print verbose processing messages");

  parser.command('help')
    .alias('h')
    .validate(validateHelpOpts)
    .describe("print help; takes optional comma-sep. list of command names")
    .option("commands");

  // trap v0.1 options
  ("f,format,p,e,expression,pct,i,visvalingam,dp,rdp,interval,merge-files,combine-files," +
  "fields,precision,auto-snap").split(',')
    .forEach(function(str) {
      parser.command(str).validate(function() {
        error(Utils.format('[%s] maphshaper syntax has changed since v0.1.x.', str));
      });
    });

  // Work-in-progress (no .describe(), so hidden from -h)
  parser.command('tracing');
  parser.command("flatten")
    .option("target", targetOpt);
  /*

  parser.command("divide")
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("fill-holes")
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("repair")
    .option("target", targetOpt);


  parser.command("points")
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt)
    .option("type", {
      type: "set",
      values: ["centroids", "vertices", "intersections", "anchors"]
    })
  */

  /*
  parser.command("filter-layers")
    .describe('filter and rename layers, e.g. "layer1=counties,layer2=1"')
    .validate(validateLayersOpts);
  */

  return parser;
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
    return Math.round(x * inv) / inv;
    // these alternatives show rounding error after JSON.stringify()
    // return Math.round(x / inc) / inv;
    // return Math.round(x / inc) * inc;
    // return Math.round(x * inv) * inc;
  };
}

// Return id of nearest point to x, y, among x0, y0, x1, y1, ...
function nearestPoint(x, y, x0, y0) {
  var minIdx = -1,
      minDist = Infinity,
      dist;
  for (var i = 0, j = 2, n = arguments.length; j < n; i++, j += 2) {
    dist = distanceSq(x, y, arguments[j], arguments[j+1]);
    if (dist < minDist) {
      minDist = dist;
      minIdx = i;
    }
  }
  return minIdx;
}

function lineIntersection(s1p1x, s1p1y, s1p2x, s1p2y, s2p1x, s2p1y, s2p2x, s2p2y) {
  var den = determinant2D(s1p2x - s1p1x, s1p2y - s1p1y, s2p2x - s2p1x, s2p2y - s2p1y);
  if (den === 0) return false;
  var m = orient2D(s2p1x, s2p1y, s2p2x, s2p2y, s1p1x, s1p1y) / den;
  var x = s1p1x + m * (s1p2x - s1p1x);
  var y = s1p1y + m * (s1p2y - s1p1y);
  return [x, y];
}

// Find intersection between two 2D segments.
// Return [x, y] point if segments intersect at a single point
// Return false if segments do not touch or are colinear
function segmentIntersection(s1p1x, s1p1y, s1p2x, s1p2y, s2p1x, s2p1y, s2p2x, s2p2y) {
  // Source: Sedgewick, _Algorithms in C_
  // (Tried various other functions that failed owing to floating point errors)
  var p = false;
  var hit = orient2D(s1p1x, s1p1y, s1p2x, s1p2y, s2p1x, s2p1y) *
      orient2D(s1p1x, s1p1y, s1p2x, s1p2y, s2p2x, s2p2y) <= 0 &&
      orient2D(s2p1x, s2p1y, s2p2x, s2p2y, s1p1x, s1p1y) *
      orient2D(s2p1x, s2p1y, s2p2x, s2p2y, s1p2x, s1p2y) <= 0;

  if (hit) {
    p = lineIntersection(s1p1x, s1p1y, s1p2x, s1p2y, s2p1x, s2p1y, s2p2x, s2p2y);
    if (p) { // colinear if p is false -- treating this as no intersection
      // Re-order operands so intersection point is closest to s1p1 (better numerical accuracy)
      // Source: Jonathan Shewchuk http://www.cs.berkeley.edu/~jrs/meshpapers/robnotes.pdf
      var nearest = nearestPoint(p[0], p[1], s1p1x, s1p1y, s1p2x, s1p2y, s2p1x, s2p1y, s2p2x, s2p2y);
      if (nearest == 1) {
        // use b a c d
        p = lineIntersection(s1p2x, s1p2y, s1p1x, s1p1y, s2p1x, s2p1y, s2p2x, s2p2y);
      } else if (nearest == 2) {
        // use c d a b
        p = lineIntersection(s2p1x, s2p1y, s2p2x, s2p2y, s1p1x, s1p1y, s1p2x, s1p2y);
      } else if (nearest == 3) {
        // use d c a b
        p = lineIntersection(s2p2x, s2p2y, s2p1x, s2p1y, s1p1x, s1p1y, s1p2x, s1p2y);
      }
    }
  }
  return p;
}

// Determinant of matrix
//  | a  b |
//  | c  d |
function determinant2D(a, b, c, d) {
  return a * d - b * c;
}

// Source: Jonathan Shewchuk http://www.cs.berkeley.edu/~jrs/meshpapers/robnotes.pdf
function orient2D(x0, y0, x1, y1, x2, y2) {
  return determinant2D(x0 - x2, y0 - y2, x1 - x2, y1 - y2);
}

// atan2() makes this function fairly slow, replaced by ~2x faster formula
function innerAngle2(ax, ay, bx, by, cx, cy) {
  var a1 = Math.atan2(ay - by, ax - bx),
      a2 = Math.atan2(cy - by, cx - bx),
      a3 = Math.abs(a1 - a2);
  if (a3 > Math.PI) {
    a3 = 2 * Math.PI - a3;
  }
  return a3;
}

// Return angle abc in range [0, 2PI) or NaN if angle is invalid
// (e.g. if length of ab or bc is 0)
function signedAngle2(ax, ay, bx, by, cx, cy) {
  var a1 = Math.atan2(ay - by, ax - bx),
      a2 = Math.atan2(cy - by, cx - bx),
      a3 = a2 - a1;

  if (ax == bx && ay == by || bx == cx && by == cy) {
    a3 = NaN; // Use NaN for invalid angles
  } else if (a3 >= Math.PI * 2) {
    a3 = 2 * Math.PI - a3;
  } else if (a3 < 0) {
    a3 = a3 + 2 * Math.PI;
  }
  return a3;
}

function signedAngle(ax, ay, bx, by, cx, cy) {
  var abx = ax - bx,
      aby = ay - by,
      cbx = cx - bx,
      cby = cy - by,
      dotp = abx * cbx + aby * cby,
      crossp = abx * cby - aby * cbx;

  var a = Math.atan2(crossp, dotp);

  if (ax == bx && ay == by || bx == cx && by == cy) {
    a = NaN; // Use NaN for invalid angles
  } else if (a >= Math.PI * 2) {
    a = 2 * Math.PI - a;
  } else if (a < 0) {
    a = a + 2 * Math.PI;
  }
  return a;
}

// TODO: make this safe for small angles
function innerAngle(ax, ay, bx, by, cx, cy) {
  var ab = distance2D(ax, ay, bx, by),
      bc = distance2D(bx, by, cx, cy),
      theta, dotp;
  if (ab === 0 || bc === 0) {
    theta = 0;
  } else {
    dotp = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by)) / (ab * bc);
    if (dotp >= 1 - 1e-14) {
      theta = 0;
    } else if (dotp <= -1 + 1e-14) {
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

function cosine(ax, ay, bx, by, cx, cy) {
  var den = distance2D(ax, ay, bx, by) * distance2D(bx, by, cx, cy),
      cos = 0;
  if (den > 0) {
    cos = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by)) / den;
    if (cos > 1) cos = 1; // handle fp rounding error
    else if (cos < -1) cos = -1;
  }
  return cos;
}

function cosine3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var den = distance3D(ax, ay, az, bx, by, bz) * distance3D(bx, by, bz, cx, cy, cz),
      cos = 0;
  if (den > 0) {
    cos = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by) + (az - bz) * (cz - bz)) / den;
    if (cos > 1) cos = 1; // handle fp rounding error
    else if (cos < -1) cos = -1;
  }
  return cos;
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
  if (xmin > xmax || ymin > ymax) {
    error("#calcArcBounds() null bounds");
  }
  return [xmin, ymin, xmax, ymax];
};

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

// export functions so they can be tested
Utils.extend(geom, {
  getRoundingFunction: getRoundingFunction,
  segmentIntersection: segmentIntersection,
  distance3D: distance3D,
  innerAngle: innerAngle,
  innerAngle2: innerAngle2,
  signedAngle: signedAngle,
  signedAngle2: signedAngle2,
  innerAngle3D: innerAngle3D,
  triangleArea: triangleArea,
  triangleArea3D: triangleArea3D,
  cosine: cosine,
  cosine3D: cosine3D
});




// export for testing
MapShaper.ArcCollection = ArcCollection;
MapShaper.ArcIter = ArcIter;


// An interface for managing a collection of paths.
// Constructor signatures:
//
// ArcCollection(arcs)
//    arcs is an array of polyline arcs; each arc is an array of points: [[x0, y0], [x1, y1], ... ]
//
// ArcCollection(nn, xx, yy)
//    nn is an array of arc lengths; xx, yy are arrays of concatenated coords;
function ArcCollection() {
  var _xx, _yy,  // coordinates data
      _ii, _nn,  // indexes, sizes
      _zz, _zlimit = 0, // simplification
      _bb, _allBounds, // bounding boxes
      _arcIter, _filteredArcIter; // path iterators

  if (arguments.length == 1) {
    initLegacyArcs(arguments[0]);  // want to phase this out
  } else if (arguments.length == 3) {
    initXYData.apply(this, arguments);
  } else {
    error("ArcCollection() Invalid arguments");
  }

  function initLegacyArcs(arcs) {
    var xx = [], yy = [];
    var nn = arcs.map(function(points) {
      var n = points ? points.length : 0;
      for (var i=0; i<n; i++) {
        xx.push(points[i][0]);
        yy.push(points[i][1]);
      }
      return n;
    });
    initXYData(nn, xx, yy);
  }

  function initXYData(nn, xx, yy) {
    var size = nn.length;
    if (nn instanceof Array) nn = new Uint32Array(nn);
    if (xx instanceof Array) xx = new Float64Array(xx);
    if (yy instanceof Array) yy = new Float64Array(yy);
    _xx = xx;
    _yy = yy;
    _nn = nn;
    _zz = null;
    _filteredArcIter = null;

    // generate array of starting idxs of each arc
    _ii = new Uint32Array(size);
    for (var idx = 0, j=0; j<size; j++) {
      _ii[j] = idx;
      idx += nn[j];
    }

    if (idx != _xx.length || _xx.length != _yy.length) {
      error("ArcCollection#initXYData() Counting error");
    }

    initBounds();
    // Pre-allocate some path iterators for repeated use.
    _arcIter = new ArcIter(_xx, _yy);
    return this;
  }

  function initZData(zz) {
    if (!zz) {
      _zz = null;
      _filteredArcIter = null;
    } else {
      if (zz.length != _xx.length) error("ArcCollection#initZData() mismatched arrays");
      if (zz instanceof Array) zz = new Float64Array(zz);
      _zz = zz;
      _filteredArcIter = new FilteredArcIter(_xx, _yy, _zz);
    }
  }

  function initBounds() {
    var data = calcArcBounds(_xx, _yy, _nn);
    _bb = data.bb;
    _allBounds = data.bounds;
  }

  function calcArcBounds(xx, yy, nn) {
    var numArcs = nn.length,
        bb = new Float64Array(numArcs * 4),
        bounds = new Bounds(),
        arcOffs = 0,
        arcLen,
        j, b;
    for (var i=0; i<numArcs; i++) {
      arcLen = nn[i];
      if (arcLen > 0) {
        j = i * 4;
        b = MapShaper.calcArcBounds(xx, yy, arcOffs, arcLen);
        bb[j++] = b[0];
        bb[j++] = b[1];
        bb[j++] = b[2];
        bb[j] = b[3];
        arcOffs += arcLen;
        bounds.mergeBounds(b);
      }
    }
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
        arc, arcLen;
    for (var i=0; i<numArcs; i++) {
      arc = coords[i];
      if (arc.length != 2) error("#convertLegacyArcs() Expected array length == 2");
      arcLen = arc && arc[0].length || 0;
      nn[i] = arcLen;
      pointCount += arcLen;
      if (arcLen === 0) error("#convertArcArrays() Empty arc:", arc);
    }

    // Copy x, y coordinates into long arrays
    var xx = new Float64Array(pointCount),
        yy = new Float64Array(pointCount),
        offs = 0;
    coords.forEach(function(arc, arcId) {
      var xarr = arc[0],
          yarr = arc[1],
          n = nn[arcId];
      for (var j=0; j<n; j++) {
        xx[offs + j] = xarr[j];
        yy[offs + j] = yarr[j];
      }
      offs += n;
    });
    return {
      xx: xx,
      yy: yy,
      nn: nn
    };
  }

  this.updateVertexData = function(nn, xx, yy, zz) {
    initXYData(nn, xx, yy);
    initZData(zz || null);
  };

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
    var copy = new ArcCollection(new Int32Array(_nn), new Float64Array(_xx),
        new Float64Array(_yy));
    if (_zz) copy.setThresholds(new Float64Array(_zz));
    return copy;
  };

  function getFilteredPointCount() {
    var zz = _zz, z = _zlimit;
    if (!zz || !z) return this.getPointCount();
    var count = 0;
    for (var i=0, n = zz.length; i<n; i++) {
      if (zz[i] >= z) count++;
    }
    return count;
  }

  function getFilteredVertexData() {
    var len2 = getFilteredPointCount();
    var arcCount = _nn.length;
    var xx2 = new Float64Array(len2),
        yy2 = new Float64Array(len2),
        zz2 = new Float64Array(len2),
        nn2 = new Int32Array(arcCount),
        i=0, i2 = 0,
        n, n2;

    for (var arcId=0; arcId < arcCount; arcId++) {
      n2 = 0;
      n = _nn[arcId];
      for (var end = i+n; i < end; i++) {
        if (_zz[i] >= _zlimit) {
          xx2[i2] = _xx[i];
          yy2[i2] = _yy[i];
          zz2[i2] = _zz[i];
          i2++;
          n2++;
        }
      }
      if (n2 < 2) error("Collapsed arc"); // endpoints should be z == Infinity
      nn2[arcId] = n2;
    }
    return {
      xx: xx2,
      yy: yy2,
      zz: zz2,
      nn: nn2
    };
  }

  this.getFilteredCopy = function() {
    if (!_zz || _zlimit === 0) return this.getCopy();
    var data = getFilteredVertexData();
    var copy = new ArcCollection(data.nn, data.xx, data.yy);
    copy.setThresholds(data.zz);
    return copy;
  };

  // Return arcs as arrays of [x, y] points (intended for testing).
  this.toArray = function() {
    return Utils.range(this.size()).map(function(i) {
      return this.getArc(i).toArray();
    }, this);
  };

  this.toString = function() {
    return JSON.stringify(this.toArray());
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

  // Return average segment length (with simplification)
  this.getAvgSegment = function() {
    var sum = 0, count = 0;
    this.forEachSegment(function(i, j, xx, yy) {
      var dx = xx[i] - xx[j],
          dy = yy[i] - yy[j];
      sum += Math.sqrt(dx * dx + dy * dy);
      count++;
    });
    return sum / count || 0;
  };

  // Return average magnitudes of dx, dy (with simplification)
  this.getAvgSegment2 = function() {
    var dx = 0, dy = 0, count = 0;
    this.forEachSegment(function(i, j, xx, yy) {
      dx += Math.abs(xx[i] - xx[j]);
      dy += Math.abs(yy[i] - yy[j]);
      count++;
    });
    return [dx / count || 0, dy / count || 0];
  };

  this.forEachArcSegment = function(arcId, cb) {
    var fw = arcId >= 0,
        absId = fw ? arcId : ~arcId,
        zlim = this.getRetainedInterval(),
        n = _nn[absId],
        i = fw ? _ii[absId] : _ii[absId] + n - 1,
        step = fw ? 1 : -1,
        count = 0,
        prev;

    for (var j = 0; j < n; j++, i += step) {
      if (zlim === 0 || _zz[i] >= zlim) {
        if (count > 0) {
          cb(prev, i, _xx, _yy);
        }
        prev = i;
        count++;
      }
    }
  };

  this.forEachSegment = function(cb) {
    for (var i=0, n=this.size(); i<n; i++) {
      this.forEachArcSegment(i, cb);
    }
  };

  // Apply a linear transform to the data, with or without rounding.
  //
  this.applyTransform = function(t, round) {
    var xx = _xx, yy = _yy, x, y;
    if (round && typeof round != 'function') {
      round = Math.round;
    }
    if (!t) {
      t = new Transform(); // null transform
    }
    for (var i=0, n=xx.length; i<n; i++) {
      x = xx[i] * t.mx + t.bx;
      y = yy[i] * t.my + t.by;
      if (round) {
        x = round(x);
        y = round(y);
      }
      xx[i] = x;
      yy[i] = y;
    }
    initBounds();
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
      if (_zz) zz = _zz.subarray(start, end);
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
        if (_zz) copyElements(_zz, _ii[i], _zz, goodPoints, arcLen);
        _nn[k] = arcLen;
        goodPoints += arcLen;
        goodArcs++;
      }
    }

    initXYData(_nn.subarray(0, goodArcs), _xx.subarray(0, goodPoints),
        _yy.subarray(0, goodPoints));
    if (_zz) initZData(_zz.subarray(0, goodPoints));
  }

  this.dedupCoords = function() {
    var n, n2, arcLen,
        i = 0, i2 = 0,
        zz = _zz;
    for (var arcId=0, size = _nn.length; arcId < size; arcId++) {
      arcLen = _nn[arcId];
      n = 0;
      n2 = 0;
      while (n < arcLen) {
        if (n === 0 || _xx[i] != _xx[i-1] || _yy[i] != _yy[i-1]) {
          if (i != i2) {
            _xx[i2] = _xx[i];
            _yy[i2] = _yy[i];
            if (zz) zz[i2] = zz[i];
          }
          n2++;
          i2++;
        }
        i++;
        n++;
      }
      if (n2 == 1) {
        _nn[arcId] = 0;
        i2--;
      } else {
        _nn[arcId] = n2;
      }
      // if (n2 == 1) console.log(arcId)
    }
    var dupes = i - i2;
    if (dupes > 0) {
      initXYData(_nn, _xx.subarray(0, i2), _yy.subarray(0, i2));
      initZData(zz);
    }
    return dupes;
  };

  this.getVertex = function(arcId, nth) {
    var i = this.indexOfVertex(arcId, nth);
    return {
      x: _xx[i],
      y: _yy[i]
    };
  };

  this.indexOfVertex = function(arcId, nth) {
    var absId = arcId < 0 ? ~arcId : arcId,
        len = _nn[absId];
    if (nth < 0) nth = len + nth;
    if (absId != arcId) nth = len - nth - 1;
    if (nth < 0 || nth >= len) error("[ArcCollection] out-of-range vertex id");
    return _ii[absId] + nth;
  };

  // Test whether the vertex at index @idx is the endpoint of an arc
  this.pointIsEndpoint = function(idx) {
    var ii = _ii,
        nn = _nn;
    for (var j=0, n=ii.length; j<n; j++) {
      if (idx === ii[j] || idx === ii[j] + nn[j] - 1) return true;
    }
    return false;
  };

  // Tests if arc endpoints have same x, y coords
  // (arc may still have collapsed);
  this.arcIsClosed = function(arcId) {
    var i = this.indexOfVertex(arcId, 0),
        j = this.indexOfVertex(arcId, -1);
    return i != j && _xx[i] == _xx[j] && _yy[i] == _yy[j];
  };

  // Tests if first and last segments mirror each other
  // A 3-vertex arc with same endpoints tests true
  this.arcIsLollipop = function(arcId) {
    var len = this.getArcLength(arcId),
        i, j;
    if (len <= 2 || !this.arcIsClosed(arcId)) return false;
    i = this.indexOfVertex(arcId, 1);
    j = this.indexOfVertex(arcId, -2);
    return _xx[i] == _xx[j] && _yy[i] == _yy[j];
  };

  this.arcIsDegenerate = function(arcId) {
    var iter = this.getArcIter(arcId);
    var i = 0,
        x, y;
    while (iter.hasNext()) {
      if (i > 0) {
        if (x != iter.x || y != iter.y) return false;
      }
      x = iter.x;
      y = iter.y;
      i++;
    }
    return true;
  };

  this.getArcLength = function(arcId) {
    return _nn[absArcId(arcId)];
  };

  this.getArcIter = function(arcId) {
    var fw = arcId >= 0,
        i = fw ? arcId : ~arcId,
        iter = _zz && _zlimit ? _filteredArcIter : _arcIter;
    if (i >= _nn.length) {
      error("[#getArcId() out-of-range arc id:", arcId);
    }
    return iter.init(_ii[i], _nn[i], fw, _zlimit);
  };

  this.getShapeIter = function(ids) {
    return new ShapeIter(this).init(ids);
  };

  // Add simplification data to the dataset
  // @thresholds is an array of arrays of removal thresholds for each arc-vertex.
  //
  this.setThresholds = function(thresholds) {
    var zz;
    if (thresholds instanceof Float64Array) {
      zz = thresholds;
    } else if (thresholds.length == this.size()) {
      var i = 0;
      zz = new Float64Array(_xx.length);
      thresholds.forEach(function(arr) {
        for (var j=0, n=arr.length; j<n; i++, j++) {
          zz[i] = arr[j];
        }
      });
    } else {
      error("ArcCollection#setThresholds() Invalid threshold data.");
    }
    initZData(zz);
    return this;
  };

  // bake in current simplification level, if any
  this.flatten = function() {
    if (_zlimit > 0) {
      var data = getFilteredVertexData();
      this.updateVertexData(data.nn, data.xx, data.yy);
      _zlimit = 0;
    } else {
      _zz = null;
    }
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
    if (!_zz) error("ArcCollection#getRemovableThresholds() Missing simplification data.");
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
      error("ArcCollection#getArcThresholds() invalid arc id:", arcId);
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

  toString: function() {
    return JSON.stringify(this.toArray());
  },

  smallerThan: function(units) {
    return this.src.arcIsSmaller(this.id, units);
  }
};

//
function MultiShape(src) {
  this.singleShape = new SimpleShape(src);
}

MultiShape.prototype = {
  init: function(parts) {
    this.pathCount = parts ? parts.length : 0;
    this.parts = parts || [];
    return this;
  },
  getPathIter: function(i) {
    return this.getPath(i).getPathIter();
  },
  getPath: function(i) {
    if (i < 0 || i >= this.parts.length) error("MultiShape#getPart() invalid part id:", i);
    return this.singleShape.init(this.parts[i]);
  },
  // Return array of SimpleShape objects, one for each path
  getPaths: function() {
    return this.parts.map(function(ids) {
      return this.singleShape.init(ids);
    }, this);
  }
};

function SimpleShape(src) {
  this.pathIter = new ShapeIter(src);
  this.ids = null;
}

SimpleShape.prototype = {
  pathCount: 1,
  init: function(ids) {
    this.pathIter.init(ids);
    this.ids = ids; // kludge for TopoJSON export -- rethink
    return this;
  },
  getPathIter: function() {
    return this.pathIter;
  }
};

// Constructor takes arrays of coords: xx, yy, zz (optional)
//
// Iterate over the points of an arc
// properties: x, y
// method: hasNext()
// usage:
//   while (iter.hasNext()) {
//     iter.x, iter.y; // do something w/ x & y
//   }
//
function ArcIter(xx, yy) {
  var _i = 0,
      _inc = 1,
      _stop = 0;

  this.init = function(i, len, fw) {
    if (fw) {
      _i = i;
      _inc = 1;
      _stop = i + len;
    } else {
      _i = i + len - 1;
      _inc = -1;
      _stop = i - 1;
    }
    return this;
  };

  this.hasNext = function() {
    var i = _i;
    if (i == _stop) return false;
    _i = i + _inc;
    this.x = xx[i];
    this.y = yy[i];
    this.i = i;
    return true;
  };
}

function FilteredArcIter(xx, yy, zz) {
  var _zlim = 0,
      _i = 0,
      _inc = 1,
      _stop = 0;

  this.init = function(i, len, fw, zlim) {
    _zlim = zlim || 0;
    if (fw) {
      _i = i;
      _inc = 1;
      _stop = i + len;
    } else {
      _i = i + len - 1;
      _inc = -1;
      _stop = i - 1;
    }
    return this;
  };

  this.hasNext = function() {
    // using local vars is significantly faster when skipping many points
    var zarr = zz,
        i = _i,
        j = i,
        zlim = _zlim,
        stop = _stop,
        inc = _inc;
    if (i == stop) return false;
    do {
      j += inc;
    } while (j != stop && zarr[j] < zlim);
    _i = j;
    this.x = xx[i];
    this.y = yy[i];
    this.i = i;
    return true;
  };
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
    return this;
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




// Utility functions for working with ArcCollection and arrays of arc ids.

// @counts A typed array for accumulating count of each abs arc id
//   (assume it won't overflow)
MapShaper.countArcsInShapes = function(shapes, counts) {
  MapShaper.traverseShapes(shapes, null, function(obj) {
    var arcs = obj.arcs,
        id;
    for (var i=0; i<arcs.length; i++) {
      id = arcs[i];
      if (id < 0) id = ~id;
      counts[id]++;
    }
  });
};

// @shp An element of the layer.shapes array
//   (may be null, or, depending on layer type, an array of points or an array of arrays of arc ids)
MapShaper.cloneShape = function(shp) {
  if (!shp) return null;
  return shp.map(function(part) {
    return part.concat();
  });
};

MapShaper.cloneShapes = function(arr) {
  return arr.map(cloneShape);
};

// a and b are arrays of arc ids
MapShaper.pathsAreIdentical = function(a, b) {
  if (a.length != b.length) return false;
  for (var i=0, n=a.length; i<n; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
};

MapShaper.reversePath = function(ids) {
  ids.reverse();
  for (var i=0, n=ids.length; i<n; i++) {
    ids[i] = ~ids[i];
  }
};

MapShaper.clampIntervalByPct = function(z, pct) {
  if (pct <= 0) z = Infinity;
  else if (pct >= 1) z = 0;
  return z;
};

// Return id of the vertex between @start and @end with the highest
// threshold that is less than @zlim, or -1 if none
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

MapShaper.forEachPoint = function(lyr, cb) {
  if (lyr.geometry_type != 'point') {
    error("[forEachPoint()] Expects a point layer");
  }
  lyr.shapes.forEach(function(shape) {
    var n = shape ? shape.length : 0;
    for (var i=0; i<n; i++) {
      cb(shape[i]);
    }
  });
};

// Visit each arc id in a shape (array of array of arc ids)
// Use non-undefined return values of callback @cb as replacements.
MapShaper.forEachArcId = function(arr, cb) {
  var retn, item;
  for (var i=0; i<arr.length; i++) {
    item = arr[i];
    if (item instanceof Array) {
      MapShaper.forEachArcId(item, cb);
    } else if (Utils.isInteger(item)) {
      var val = cb(item);
      if (val !== void 0) {
        arr[i] = val;
      }
    } else if (item) {
      error("Non-integer arc id in:", arr);
    }
  }
};

MapShaper.forEachPath = function(paths, cb) {
  MapShaper.editPaths(paths, cb);
};

MapShaper.editPaths = function(paths, cb) {
  var nulls = 0,
      retn;
  if (!paths) return null; // null shape
  if (!Utils.isArray(paths)) error("[editPaths()] Expected an array, found:", arr);

  for (var i=0; i<paths.length; i++) {
    retn = cb(paths[i], i);
    if (retn === null) {
      nulls++;
      paths[i] = null;
    } else if (Utils.isArray(retn)) {
      paths[i] = retn;
    }
  }
  return nulls > 0 ? paths.filter(function(ids) {return !!ids;}) : paths;
};

MapShaper.forEachPathSegment = function(shape, arcs, cb) {
  MapShaper.forEachArcId(shape, function(arcId) {
    arcs.forEachArcSegment(arcId, cb);
  });
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

      if (cbArc) {
        for (var j=0, n=arcIds.length; j<n; j++, segId++) {
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

MapShaper.arcHasLength = function(id, coords) {
  var iter = coords.getArcIter(id), x, y;
  if (iter.hasNext()) {
    x = iter.x;
    y = iter.y;
    while (iter.hasNext()) {
      if (iter.x != x || iter.y != y) return true;
    }
  }
  return false;
};

MapShaper.filterEmptyArcs = function(shape, coords) {
  if (!shape) return null;
  var shape2 = [];
  Utils.forEach(shape, function(ids) {
    var path = [];
    for (var i=0; i<ids.length; i++) {
      if (MapShaper.arcHasLength(ids[i], coords)) {
        path.push(ids[i]);
      }
    }
    if (path.length > 0) shape2.push(path);
  });
  return shape2.length > 0 ? shape2 : null;
};

// Bundle holes with their containing rings for Topo/GeoJSON polygon export.
// Assumes outer rings are CW and inner (hole) rings are CCW.
// @paths array of objects with path metadata -- see MapShaper.exportPathData()
//
// TODO: Improve reliability. Currently uses winding order, area and bbox to
//   identify holes and their enclosures -- could be confused by strange
//   geometry.
//
MapShaper.groupPolygonRings = function(paths) {
  var pos = [],
      neg = [];
  Utils.forEach(paths, function(path) {
    if (path.area > 0) {
      pos.push(path);
    } else if (path.area < 0) {
      neg.push(path);
    } else {
      // verbose("Zero-area ring, skipping");
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
          contained = part.bounds.contains(hole.bounds) && part.area > -hole.area;
      if (contained && (containerArea === 0 || part.area < containerArea)) {
        containerArea = part.area;
        containerId = i;
      }
    }
    if (containerId == -1) {
      verbose("[groupPolygonRings()] polygon hole is missing a containing ring, dropping.");
    } else {
      output[containerId].push(hole);
    }
  });
  return output;
};

MapShaper.getPathMetadata = function(shape, arcs, type) {
  var iter = new ShapeIter(arcs);
  return Utils.map(shape, function(ids) {
    if (!Utils.isArray(ids)) throw new Error("expected array");
    iter.init(ids);
    return {
      ids: ids,
      area: type == 'polygon' ? geom.getPathArea(iter) : 0,
      bounds: arcs.getSimpleShapeBounds(ids)
    };
  });
};





// Converts all polygon and polyline paths in a dataset to a topological format,
// (in-place);
api.buildTopology = function(dataset) {
  if (!dataset.arcs) return;
  var raw = dataset.arcs.getVertexData(),
      cooked = MapShaper.buildPathTopology(raw.nn, raw.xx, raw.yy);
  dataset.arcs.updateVertexData(cooked.nn, cooked.xx, cooked.yy);
  dataset.layers.forEach(function(lyr) {
    if (lyr.geometry_type == 'polyline' || lyr.geometry_type == 'polygon') {
      lyr.shapes = MapShaper.replaceArcIds(lyr.shapes, cooked.paths);
    }
  });
};

// buildPathTopology() converts non-topological paths into
// a topological format
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
//    xx, yy, nn:      // coordinate data, same format as input
//    paths: [Array]   // Paths are arrays of one or more arc id.
// }                   // Arc ids use the same numbering scheme as TopoJSON --
//       Ids in the paths array are indices of paths in the ArcCollection
//       Negative ids signify that the arc coordinates are in reverse sequence.
//       Negative ids are converted to array indices with the fornula fwId = ~revId.
//       E.g. -1 is arc 0 reversed, -2 is arc 1 reversed, etc.
//
MapShaper.buildPathTopology = function(nn, xx, yy) {
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

  var chainIds = initPointChains(xx, yy, !"verbose");
  var pointId = 0;
  var paths = Utils.map(nn, function(pathLen) {
    var arcs = pathLen < 2 ? null : convertPath(pointId, pointId + pathLen - 1);
    pointId += pathLen;
    return arcs;
  });
  var obj = index.getVertexData();
  obj.paths = paths;
  return obj;

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
};

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
  if (verbose) message(Utils.format("#initPointChains() collision rate: %.3f", collisions / pointCount));
  return chainIds;
}

//
//
function ArcIndex(pointCount, xyToUint) {
  var hashTableSize = Math.ceil(pointCount * 0.25);
  var hashTable = new Int32Array(hashTableSize),
      hash = function(x, y) {
        return xyToUint(x, y) % hashTableSize;
      },
      chainIds = [],
      arcs = [],
      arcPoints = 0;

  Utils.initializeArray(hashTable, -1);

  this.addArc = function(xx, yy) {
    var end = xx.length - 1,
        key = hash(xx[end], yy[end]),
        chainId = hashTable[key],
        arcId = arcs.length;

    hashTable[key] = arcId;
    arcs.push([xx, yy]);
    arcPoints += xx.length;
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

  this.getVertexData = function() {
    var xx = new Float64Array(arcPoints),
        yy = new Float64Array(arcPoints),
        nn = new Uint32Array(arcs.length),
        copied = 0;
    arcs.forEach(function(arc, i) {
      var len = arc[0].length;
      MapShaper.copyElements(arc[0], 0, xx, copied, len);
      MapShaper.copyElements(arc[1], 0, yy, copied, len);
      nn[i] = len;
      copied += len;
    });
    return {
      xx: xx,
      yy: yy,
      nn: nn
    };
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

MapShaper.replaceArcIds = function(src, replacements) {
  return src.map(function(shape) {
    return replaceArcsInShape(shape, replacements);
  });

  function replaceArcsInShape(shape, replacements) {
    if (!shape) return null;
    return shape.map(function(path) {
      return replaceArcsInPath(path, replacements);
    });
  }

  function replaceArcsInPath(path, replacements) {
    return path.reduce(function(memo, id) {
      var abs = absArcId(id);
      var topoPath = replacements[abs];
      if (topoPath) {
        if (id < 0) {
          topoPath = topoPath.concat(); // TODO: need to copy?
          MapShaper.reversePath(topoPath);
        }
        for (var i=0, n=topoPath.length; i<n; i++) {
          memo.push(topoPath[i]);
        }
      }
      return memo;
    }, []);
  }
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
      bx = xx[i];
      cx = xx[i+1];
      ay = yy[i-1];
      by = yy[i];
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

Visvalingam.weightedMetric = function(ax, ay, bx, by, cx, cy) {
  var area = triangleArea(ax, ay, bx, by, cx, cy),
      cos = cosine(ax, ay, bx, by, cx, cy);
  return Visvalingam.weight(cos) * area;
};

Visvalingam.weightedMetric3D = function(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var area = triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz),
      cos = cosine3D(ax, ay, az, bx, by, bz, cx, cy, cz);
  return Visvalingam.weight(cos) * area;
};

// Functions for weighting triangle area

// The original Flash-based Mapshaper (ca. 2006) used a step function to
// underweight more acute triangles.
Visvalingam.weight_v1 = function(cos) {
  var angle = Math.acos(cos),
      weight = 1;
  if (angle < 0.5) {
    weight = 0.1;
  } else if (angle < 1) {
    weight = 0.3;
  }
  return weight;
};

// v2 weighting: underweight polyline vertices at acute angles in proportion to 1 - cosine
Visvalingam.weight_v2 = function(cos) {
  return cos > 0 ? 1 - cos : 1;
};

// v3 weighting: weight by inverse cosine
// Standard weighting favors 90-deg angles; this curve peaks at 120 deg.
Visvalingam.weight_v3 = function(cos) {
  var k = 0.7;
  return -cos * k + 1;
};

Visvalingam.weight = Visvalingam.weight_v3;




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




// utility functions for datasets and layers

// make a modified copy of a layer
MapShaper.updateLayer = function(lyr, update, opts) {
  // var newLyr = Utils.defaults(obj, lyr);
};

MapShaper.getDatasetBounds = function(data) {
  var bounds = new Bounds();
  data.layers.forEach(function(lyr) {
    bounds.mergeBounds(MapShaper.getLayerBounds(lyr, data.arcs));
  });
  return bounds;
};

MapShaper.getFeatureCount = function(lyr) {
  var count = 0;
  if (lyr.data) {
    count = lyr.data.size();
  } else if (lyr.shapes) {
    count = lyr.shapes.length;
  }
  return count;
};

MapShaper.getLayerBounds = function(lyr, arcs) {
  var bounds = null;
  if (lyr.geometry_type == 'point') {
    bounds = new Bounds();
    MapShaper.forEachPoint(lyr, function(p) {
      bounds.mergePoint(p[0], p[1]);
    });
  } else if (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline') {
    bounds = MapShaper.getPathBounds(lyr.shapes, arcs);
  } else {
    error("Layer is missing a valid geometry type");
  }
  return bounds;
};

MapShaper.getPathBounds = function(shapes, arcs) {
  var bounds = new Bounds();
  MapShaper.forEachArcId(shapes, function(id) {
    arcs.mergeArcBounds(id, bounds);
  });
  return bounds;
};

// replace cut layers in-sequence (to maintain layer indexes)
// append any additional new layers
MapShaper.replaceLayers = function(dataset, cutLayers, newLayers) {
  // modify a copy in case cutLayers == dataset.layers
  var currLayers = dataset.layers.concat();
  Utils.repeat(Math.max(cutLayers.length, newLayers.length), function(i) {
    var cutLyr = cutLayers[i],
        newLyr = newLayers[i],
        idx = cutLyr ? currLayers.indexOf(cutLyr) : currLayers.length;

    if (cutLyr) {
      currLayers.splice(idx, 1);
    }
    if (newLyr) {
      currLayers.splice(idx, 0, newLyr);
    }
  });
  dataset.layers = currLayers;
};

/*
MapShaper.validateLayer = function(lyr, arcs) {
  var type = lyr.geometry_type;
  if (!Utils.isArray(lyr.shapes)) {
    error("Layer is missing shapes property");
  }
  if (lyr.data && lyr.data.size() != lyr.shapes.length) {
    error("Layer contains mismatched data table and shapes");
  }
  if (arcs && arcs instanceof ArcCollection === false) {
    error("Expected an ArcCollection");
  }
  if (type == 'polygon' || type == 'polyline') {
    if (!arcs) error("Missing ArcCollection for a", type, "layer");
    // TODO: validate shapes, make sure ids are w/in arc range
  } else if (type == 'point') {
    // TODO: validate shapes
  } else if (type === null) {
    // TODO: make sure shapes are all null
  }
};

// Simple integrity checks
MapShaper.validateDataset = function(data) {
  if (!data) invalid("Missing dataset object");
  if (!Utils.isArray(data.layers) || data.layers.length > 0 === false)
    invalid("Missing layers");
  data.layers.forEach(function(lyr) {
    try {
      MapShaper.validateLayer(lyr, data.arcs);
    } catch (e) {
      invalid(e.message);
    }
  });

  function invalid(msg) {
    error("[validateDataset()] " + msg);
  }
};
*/




api.simplify = function(arcs, opts) {
  if (!arcs) stop("[simplify] Missing path data");
  T.start();
  MapShaper.simplifyPaths(arcs, opts);

  if (utils.isNumber(opts.pct)) {
    arcs.setRetainedPct(opts.pct);
  } else if (utils.isNumber(opts.interval)) {
    arcs.setRetainedInterval(opts.interval);
  } else {
    stop("[simplify] missing pct or interval parameter");
  }
  T.stop("Calculate simplification");

  if (!opts.no_repair) {
    var info = api.findAndRepairIntersections(arcs);
    cli.printRepairMessage(info);
  }
};

// @paths ArcCollection object
MapShaper.simplifyPaths = function(paths, opts) {
  var method = opts.method || 'mapshaper';
  var decimalDegrees = MapShaper.probablyDecimalDegreeBounds(paths.getBounds());
  var simplifyPath = MapShaper.simplifiers[method] || error("Unknown simplification method:", method);
  paths.setThresholds(new Float64Array(paths.getPointCount()));
  if (decimalDegrees && !opts.cartesian) {
    MapShaper.simplifyPaths3D(paths, simplifyPath);
    MapShaper.protectWorldEdges(paths);
  } else {
    MapShaper.simplifyPaths2D(paths, simplifyPath);
  }
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
  visvalingam: Visvalingam.getArcCalculator(Visvalingam.standardMetric, Visvalingam.standardMetric3D, 0.65),
  mapshaper_v1: Visvalingam.getArcCalculator(Visvalingam.weightedMetric_v1, Visvalingam.weightedMetric3D_v1, 0.65),
  mapshaper: Visvalingam.getArcCalculator(Visvalingam.weightedMetric, Visvalingam.weightedMetric3D, 0.65),
  dp: DouglasPeucker.calcArcData
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




// Calculations for planar geometry of shapes
// TODO: consider 3D versions of some of these

geom.getShapeArea = function(shp, arcs) {
  return Utils.reduce(shp, function(area, ids) {
    return area + geom.getPathArea4(ids, arcs);
  }, 0);
};

geom.getSphericalShapeArea = function(shp, arcs) {
  if (!MapShaper.probablyDecimalDegreeBounds(arcs.getBounds())) {
    error("[getSphericalShapeArea()] Function requires decimal degree coordinates");
  }
  return Utils.reduce(shp, function(area, ids) {
    var iter = arcs.getShapeIter(ids);
    return area + geom.getSphericalPathArea(iter);
  }, 0);
};

// alternative using equal-area projection
geom.getSphericalShapeArea2 = function(shp, arcs) {
  return Utils.reduce(shp, function(total, ids) {
    var iter = arcs.getShapeIter(ids);
    iter = geom.wrapPathIter(iter, geom.projectGall);
    return total + geom.getPathArea(iter);
  }, 0);
};

// Return path with the largest (area) bounding box
// @shp array of array of arc ids
// @arcs ArcCollection
geom.getMaxPath = function(shp, arcs) {
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

// @ids array of arc ids
// @arcs ArcCollection
geom.getAvgPathXY = function(ids, arcs) {
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

geom.getPathCentroid = function(ids, arcs) {
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
    return geom.getAvgPathXY(ids, arcs);
  } else return {
    x: sumX / (6 * area),
    y: sumY / (6 * area)
  };
};

geom.getShapeCentroid = function(shp, arcs) {
  var maxPath = geom.getMaxPath(shp, arcs);
  return maxPath ? geom.getPathCentroid(maxPath, arcs) : null;
};

// Return true if point is inside or on boundary of a shape
//
geom.testPointInShape = function(x, y, shp, arcs) {
  var isIn = false,
      isOn = false;

  Utils.forEach(shp, function(ids) {
    var inRing = geom.testPointInRing(x, y, ids, arcs);
    if (inRing == 1) {
      isIn = !isIn;
    } else if (inRing == -1) {
      isOn = true;
    }
  });
  return isOn || isIn;
};

// Get a point suitable for anchoring a label
// Method:
// - find centroid
// - ...
//
geom.getInteriorPoint = function(shp, arcs) {

};

geom.getPointToPathDistance = function(px, py, ids, arcs) {
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

geom.getYIntercept = function(x, ax, ay, bx, by) {
  return ay + (x - ax) * (by - ay) / (bx - ax);
};

geom.getXIntercept = function(y, ax, ay, bx, by) {
  return ax + (y - ay) * (bx - ax) / (by - ay);
};

// Return signed distance of a point to a shape
//
geom.getPointToShapeDistance = function(x, y, shp, arcs) {
  var minDist = Utils.reduce(shp, function(minDist, ids) {
    var pathDist = geom.getPointToPathDistance(x, y, ids, arcs);
    return Math.min(minDist, pathDist);
  }, Infinity);
  return minDist;
};

// Test if point (x, y) is inside, outside or on the boundary of a polygon ring
// Return 0: outside; 1: inside; -1: on boundary
//
geom.testPointInRing = function(x, y, ids, arcs) {
  /*
  // arcs.getSimpleShapeBounds() doesn't apply simplification, can't use here
  if (!arcs.getSimpleShapeBounds(ids).containsPoint(x, y)) {
    return false;
  }
  */
  var isIn = false,
      isOn = false;
  MapShaper.forEachPathSegment(ids, arcs, function(a, b, xx, yy) {
    var result = geom.testRayIntersection(x, y, xx[a], yy[a], xx[b], yy[b]);
    if (result == 1) {
      isIn = !isIn;
    } else if (isNaN(result)) {
      isOn = true;
    }
  });
  return isOn ? -1 : (isIn ? 1 : 0);
};


// test if a vertical ray originating at (x, y) intersects a segment
// returns 1 if intersection, 0 if no intersection, NaN if point touches segment
// (Special rules apply to endpoint intersections, to support point-in-polygon testing.)
geom.testRayIntersection = function(x, y, ax, ay, bx, by) {
  var hit = 0, // default: no hit
      yInt;

  // case: p is entirely above, left or right of segment
  if (x < ax && x < bx || x > ax && x > bx || y > ay && y > by) {
      // no intersection
  }
  // case: px aligned with a segment vertex
  else if (x === ax || x === bx) {
    // case: vertical segment or collapsed segment
    if (x === ax && x === bx) {
      // p is on segment
      if (y == ay || y == by || y > ay != y > by) {
        hit = NaN;
      }
      // else: no hit
    }
    // case: px equal to ax (only)
    else if (x === ax) {
      if (y === ay) {
        hit = NaN;
      } else if (bx < ax && y < ay) {
        // only score hit if px aligned to rightmost endpoint
        hit = 1;
      }
    }
    // case: px equal to bx (only)
    else {
      if (y === by) {
        hit = NaN;
      } else if (ax < bx && y < by) {
        // only score hit if px aligned to rightmost endpoint
        hit = 1;
      }
    }
  // case: px is between endpoints
  } else {
    yInt = geom.getYIntercept(x, ax, ay, bx, by);
    if (yInt > y) {
      hit = 1;
    } else if (yInt == y) {
      hit = NaN;
    }
  }
  return hit;
};

geom.getSphericalPathArea = function(iter) {
  var sum = 0,
      started = false,
      deg2rad = Math.PI / 180,
      x, y, xp, yp;
  while (iter.hasNext()) {
    x = iter.x * deg2rad;
    y = Math.sin(iter.y * deg2rad);
    if (started) {
      sum += (x - xp) * (2 + y + yp);
    } else {
      started = true;
    }
    xp = x;
    yp = y;
  }
  return sum / 2 * 6378137 * 6378137;
};

geom.wrapPathIter = function(iter, project) {
  return {
    hasNext: function() {
      if (iter.hasNext()) {
        project(iter.x, iter.y, this);
        return true;
      }
      return false;
    }
  };
};

geom.projectGall = (function() {
  var R = 6378137;
  var deg2rad = Math.PI / 180;
  var kx = R * deg2rad / Math.sqrt(2);
  var ky = R * Math.sqrt(2);
  return function(x, y, p) {
    p = p || {};
    p.x = x * kx;
    p.y = ky * Math.sin(deg2rad * y);
    return p;
  };
}());

// Get path area from a point iterator
geom.getPathArea = function(iter) {
  var sum = 0,
      ax, ay, bx, by, dx, dy;
  if (iter.hasNext()) {
    ax = 0;
    ay = 0;
    dx = -iter.x;
    dy = -iter.y;
    while (iter.hasNext()) {
      bx = ax;
      by = ay;
      ax = iter.x + dx;
      ay = iter.y + dy;
      sum += ax * by - bx * ay;
    }
  }
  return sum / 2;
};


// Get path area from an array of [x, y] points
// TODO: consider removing duplication with getPathArea(), e.g. by
//   wrapping points in an iterator.
//
geom.getPathArea2 = function(points) {
  var sum = 0,
      ax, ay, bx, by, dx, dy, p;
  for (var i=0, n=points.length; i<n; i++) {
    p = points[i];
    if (i === 0) {
      ax = 0;
      ay = 0;
      dx = -p[0];
      dy = -p[1];
    } else {
      ax = p[0] + dx;
      ay = p[1] + dy;
      sum += ax * by - bx * ay;
    }
    bx = ax;
    by = ay;
  }
  return sum / 2;
};

// DEPRECATED -- was used for finding path area from raw shapefile input
// TODO: enhance precision if used again
geom.getPathArea3 = function(xx, yy, start, len) {
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
};

// TODO: consider replacing geom.getPathArea() with algo. using ArcCollection#forEachSegment()
geom.getPathArea4 = function(ids, arcs) {
  var iter = arcs.getShapeIter(ids);
  return geom.getPathArea(iter);
};

geom.getPathBounds = function(points) {
  var bounds = new Bounds();
  for (var i=0, n=points.length; i<n; i++) {
    bounds.mergePoint(points[i][0], points[i][1]);
  }
  return bounds;
};

/*
geom.transposeXYCoords = function(xx, yy) {
  var points = [];
  for (var i=0, len=xx.length; i<len; i++) {
    points.push([xx[i], yy[i]]);
  }
  return points;
};
*/

geom.transposePoints = function(points) {
  var xx = [], yy = [], n=points.length;
  for (var i=0; i<n; i++) {
    xx.push(points[i][0]);
    yy.push(points[i][1]);
  }
  return [xx, yy];
};




MapShaper.getHighPrecisionSnapInterval = function(arcs) {
  var bb = arcs.getBounds();
  if (!bb.hasBounds()) return 0;
  var maxCoord = Math.max(Math.abs(bb.xmin), Math.abs(bb.ymin),
      Math.abs(bb.xmax), Math.abs(bb.ymax));
  return maxCoord * 1e-14;
};

MapShaper.snapCoords = function(arcs, threshold) {
    var avgDist = arcs.getAvgSegment(),
        autoSnapDist = avgDist * 0.0025,
        snapDist = autoSnapDist;

  if (threshold > 0) {
    if (threshold > avgDist) {
      message(Utils.format("Snapping interval is larger than avg. segment length (%.5f) -- using auto-snap instead", avgDist));
    } else {
      snapDist = threshold;
      message(Utils.format("Applying snapping threshold of %s -- %.6f times avg. segment length", threshold, threshold / avgDist));
    }
  }

  var snapCount = MapShaper.snapCoordsByInterval(arcs, snapDist);
  if (snapCount > 0) arcs.dedupCoords();
  message(Utils.format("Snapped %s point%s", snapCount, "s?"));
};

// Snap together points within a small threshold
//
MapShaper.snapCoordsByInterval = function(arcs, snapDist) {
  var snapCount = 0,
      data = arcs.getVertexData();

  // Get sorted coordinate ids
  // Consider: speed up sorting -- try bucket sort as first pass.
  //
  var ids = utils.sortCoordinateIds(data.xx);
  for (var i=0, n=ids.length; i<n; i++) {
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
};

utils.sortCoordinateIds = function(a) {
  var n = a.length,
      ids = new Uint32Array(n);
  for (var i=0; i<n; i++) {
    ids[i] = i;
  }
  utils.quicksortIds(a, ids, 0, ids.length-1);
  return ids;
};

/*
// Returns array of array ids, in ascending order.
// @a array of numbers
//
utils.sortCoordinateIds = function(a) {
  return utils.bucketSortIds(a);
};

// This speeds up sorting of large datasets (~2x faster for 1e7 values)
// worth the additional code?
utils.bucketSortIds = function(a, n) {
  var len = a.length,
      ids = new Uint32Array(len),
      bounds = Utils.getArrayBounds(a),
      buckets = Math.ceil(n > 0 ? n : len / 10),
      counts = new Uint32Array(buckets),
      offsets = new Uint32Array(buckets),
      i, j, offs, count;

  // get bucket sizes
  for (i=0; i<len; i++) {
    j = bucketId(a[i], bounds.min, bounds.max, buckets);
    counts[j]++;
  }

  // convert counts to offsets
  offs = 0;
  for (i=0; i<buckets; i++) {
    offsets[i] = offs;
    offs += counts[i];
  }

  // assign ids to buckets
  for (i=0; i<len; i++) {
    j = bucketId(a[i], bounds.min, bounds.max, buckets);
    offs = offsets[j]++;
    ids[offs] = i;
  }

  // sort each bucket with quicksort
  for (i = 0; i<buckets; i++) {
    count = counts[i];
    if (count > 1) {
      offs = offsets[i] - count;
      utils.quicksortIds(a, ids, offs, offs + count - 1);
    }
  }
  return ids;

  function bucketId(val, min, max, buckets) {
    var id = (buckets * (val - min) / (max - min)) | 0;
    return id < buckets ? id : buckets - 1;
  }
};
*/

utils.quicksortIds = function (a, ids, lo, hi) {
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
    if (j > lo) utils.quicksortIds(a, ids, lo, j);
    if (i < hi) utils.quicksortIds(a, ids, i, hi);
  } else {
    utils.insertionSortIds(a, ids, lo, hi);
  }
};

utils.insertionSortIds = function(arr, ids, start, end) {
  var id, i, j;
  for (j = start + 1; j <= end; j++) {
    id = ids[j];
    for (i = j - 1; i >= start && arr[id] < arr[ids[i]]; i--) {
      ids[i+1] = ids[i];
    }
    ids[i+1] = id;
  }
};




MapShaper.NodeCollection = NodeCollection;

// @arcs ArcCollection
// @filter Optional filter function, arcIds that return false are excluded
//
function NodeCollection(arcs, filter) {
  if (Utils.isArray(arcs)) {
    arcs = new ArcCollection(arcs);
  }
  var arcData = arcs.getVertexData(),
      nn = arcData.nn,
      xx = arcData.xx,
      yy = arcData.yy;

  var nodeData = MapShaper.findNodeTopology(arcs, filter);

  if (nn.length * 2 != nodeData.chains.length) error("[NodeCollection] count error");

  // TODO: could check that arc collection hasn't been modified, using accessor function
  Object.defineProperty(this, 'arcs', {value: arcs});

  this.toArray = function() {
    var flags = new Uint8Array(nodeData.xx.length),
        nodes = [];

    Utils.forEach(nodeData.chains, function(next, i) {
      if (flags[i] == 1) return;
      nodes.push([nodeData.xx[i], nodeData.yy[i]]);
      while (flags[next] != 1) {
        flags[next] = 1;
        next = nodeData.chains[next];
      }
    });
    return nodes;
  };

  this.debugNode = function(arcId) {
    if (!MapShaper.TRACING) return;
    var ids = [arcId];
    this.forEachConnectedArc(arcId, function(id) {
      ids.push(id);
    });

    message("node ids:",  ids);
    ids.forEach(printArc);

    function printArc(id) {
      var str = id + ": ";
      var len = arcs.getArcLength(id);
      if (len > 0) {
        var p1 = arcs.getVertex(id, -1);
        str += Utils.format("[%f, %f]", p1.x, p1.y);
        if (len > 1) {
          var p2 = arcs.getVertex(id, -2);
          str += Utils.format(", [%f, %f]", p2.x, p2.y);
          if (len > 2) {
            var p3 = arcs.getVertex(id, 0);
            str += Utils.format(", [%f, %f]", p3.x, p3.y);
          }
          str += " len: " + distance2D(p1.x, p1.y, p2.x, p2.y);
        }
      } else {
        str = "[]";
      }
      message(str);
    }
  };

  this.forEachConnectedArc = function(arcId, cb) {
    var nextId = nextConnectedArc(arcId),
        i = 0;
    while (nextId != arcId) {
      cb(nextId, i++);
      nextId = nextConnectedArc(nextId);
    }
  };

  // Returns the id of the first identical arc or @arcId if none found
  // TODO: find a better function name
  this.findMatchingArc = function(arcId) {
    var verbose = arcId ==  -12794 || arcId == 19610;
    var nextId = nextConnectedArc(arcId),
        match = arcId;
    while (nextId != arcId) {
      if (testArcMatch(arcId, nextId)) {
        if (absArcId(nextId) < absArcId(match)) match = nextId;
      }
      nextId = nextConnectedArc(nextId);
    }
    if (match != arcId) {
      trace("found identical arc:", arcId, "->", match);
      // this.debugNode(arcId);
    }
    return match;
  };

  function testArcMatch(a, b) {
    var absA = a >= 0 ? a : ~a,
        absB = b >= 0 ? b : ~b,
        lenA = nn[absA];
    if (lenA < 2) {
      // Don't throw error on collapsed arcs -- assume they will be handled
      //   appropriately downstream.
      // error("[testArcMatch() defective arc; len:", lenA);
      return false;
    }
    if (lenA != nn[absB]) return false;
    if (testVertexMatch(a, b, -1) &&
        testVertexMatch(a, b, 1) &&
        testVertexMatch(a, b, -2)) {
      return true;
    }
    return false;
  }

  function testVertexMatch(a, b, i) {
    var ai = arcs.indexOfVertex(a, i),
        bi = arcs.indexOfVertex(b, i);
    return xx[ai] == xx[bi] && yy[ai] == yy[bi];
  }

  // return arcId of next arc in the chain, pointed towards the shared vertex
  function nextConnectedArc(arcId) {
    var fw = arcId >= 0,
        absId = fw ? arcId : ~arcId,
        nodeId = fw ? absId * 2 + 1: absId * 2, // if fw, use end, if rev, use start
        chainedId = nodeData.chains[nodeId],
        nextAbsId = chainedId >> 1,
        nextArcId = chainedId & 1 == 1 ? nextAbsId : ~nextAbsId;

    if (chainedId < 0 || chainedId >= nodeData.chains.length) error("out-of-range chain id");
    if (absId >= nn.length) error("out-of-range arc id");
    if (nodeData.chains.length <= nodeId) error("out-of-bounds node id");
    return nextArcId;
  }

  // expose for testing
  this.internal = {
    testArcMatch: testArcMatch,
    testVertexMatch: testVertexMatch
  };
}

MapShaper.findNodeTopology = function(arcs, filter) {
  var n = arcs.size() * 2,
      xx2 = new Float64Array(n),
      yy2 = new Float64Array(n),
      ids2 = new Int32Array(n);

  arcs.forEach2(function(i, n, xx, yy, zz, arcId) {
    if (filter && !filter(arcId)) {
      return;
    }
    var start = i,
        end = i + n - 1,
        start2 = arcId * 2,
        end2 = start2 + 1;
    xx2[start2] = xx[start];
    yy2[start2] = yy[start];
    ids2[start2] = arcId;
    xx2[end2] = xx[end];
    yy2[end2] = yy[end];
    ids2[end2] = arcId;
  });

  var chains = initPointChains(xx2, yy2);
  return {
    xx: xx2,
    yy: yy2,
    ids: ids2,
    chains: chains
  };
};




// PolygonIndex indexes the coordinates in one polygon feature for efficient
// point-in-polygon tests

MapShaper.PolygonIndex = PolygonIndex;

function PolygonIndex(shape, arcs) {
  var data = arcs.getVertexData();
  var polygonBounds = arcs.getMultiShapeBounds(shape),
      boundsLeft;
  var p1Arr, p2Arr,
      bucketCount,
      bucketOffsets,
      indexWidth,
      // bucketSizes,
      bucketWidth;

  init();

  // Return 0 if outside, 1 if inside, -1 if on boundary
  this.pointInPolygon = function(x, y) {
    if (!polygonBounds.containsPoint(x, y)) {
      return false;
    }
    var bucketId = getBucketId(x);
    var count = countCrosses(x, y, bucketId);
    if (bucketId > 0) {
      count += countCrosses(x, y, bucketId - 1);
    }
    if (bucketId < bucketCount - 1) {
      count += countCrosses(x, y, bucketId + 1);
    }
    count += countCrosses(x, y, bucketCount); // check oflo bucket
    if (isNaN(count)) return -1;
    return count % 2 == 1 ? 1 : 0;
  };

  function init() {
    var xx = data.xx;
    // get sorted array of segment ids
    var segCount = 0;
    MapShaper.forEachPathSegment(shape, arcs, function() {
      segCount++;
    });
    var segments = new Uint32Array(segCount * 2),
        i = 0;
    MapShaper.forEachPathSegment(shape, arcs, function(a, b, xx, yy) {
      if (xx[a] < xx[b]) {
        segments[i++] = a;
        segments[i++] = b;
      } else {
        segments[i++] = b;
        segments[i++] = a;
      }
    });
    MapShaper.sortSegmentIds(xx, segments);

    // populate buckets
    p1Arr = new Uint32Array(segCount);
    p2Arr = new Uint32Array(segCount);
    bucketCount = Math.ceil(segCount / 100);
    bucketOffsets = new Uint32Array(bucketCount + 1);
    // bucketSizes = new Uint32Array(bucketCount + 1);


    boundsLeft = xx[segments[0]]; // xmin of first segment
    var lastX = xx[segments[segments.length - 2]]; // xmin of last segment
    var head = 0, tail = segCount - 1;
    var bucketId = 0,
        bucketLeft = boundsLeft,
        segId = 0,
        a, b, j, xmin, xmax;

    indexWidth = lastX - boundsLeft;
    bucketWidth = indexWidth / bucketCount;

    while (bucketId < bucketCount && segId < segCount) {
      j = segId * 2;
      a = segments[j];
      b = segments[j+1];
      xmin = xx[a];
      xmax = xx[b];

      if (xmin > bucketLeft + bucketWidth && bucketId < bucketCount - 1) {
        bucketId++;
        bucketLeft = bucketId * bucketWidth + boundsLeft;
        bucketOffsets[bucketId] = head;
      } else {
        var bucket2 = getBucketId(xmin);
        if (bucket2 != bucketId) console.log("wrong bucket");
        if (xmin < bucketLeft) error("out-of-range");
        if (xmax - xmin >= 0 === false) error("invalid segment");
        if (xmax > bucketLeft + 2 * bucketWidth) {
          p1Arr[tail] = a;
          p2Arr[tail] = b;
          tail--;
        } else {
          p1Arr[head] = a;
          p2Arr[head] = b;
          head++;
        }
        segId++;
        // bucketSizes[bucketId]++;
      }
    }
    bucketOffsets[bucketCount] = head;
    if (head != tail + 1) error("counting error; head:", head, "tail:", tail);
  }

  function countCrosses(x, y, bucketId) {
    var offs = bucketOffsets[bucketId],
        n = (bucketId == bucketCount) ? p1Arr.length - offs : bucketOffsets[bucketId + 1] - offs,
        count = 0,
        xx = data.xx,
        yy = data.yy,
        a, b;

    for (var i=0; i<n; i++) {
      a = p1Arr[i + offs];
      b = p2Arr[i + offs];
      count += geom.testRayIntersection(x, y, xx[a], yy[a], xx[b], yy[b]);
    }
    return count;
  }

  function getBucketId(x) {
    var i = Math.floor((x - boundsLeft) / bucketWidth);
    if (i < 0) i = 0;
    if (i >= bucketCount) i = bucketCount - 1;
    return i;
  }

}




MapShaper.PathIndex = PathIndex;

function PathIndex(shapes, arcs) {
  var _index;
  // var totalArea = arcs.getBounds().area();
  var totalArea = MapShaper.getPathBounds(shapes, arcs).area();
  init(shapes);

  function init(shapes) {
    var boxes = [];

    shapes.forEach(function(shp, shpId) {
      var n = shp ? shp.length : 0;
      for (var i=0; i<n; i++) {
        addPath(shp[i], shpId);
      }
    });

    _index = require('rbush')();
    _index.load(boxes);

    function addPath(ids, shpId) {
      var bounds = arcs.getSimpleShapeBounds(ids);
      var bbox = bounds.toArray();
      bbox.ids = ids;
      bbox.bounds = bounds;
      bbox.id = shpId;
      boxes.push(bbox);
      // TODO: Better test for whether or not to index a path
      if (bounds.area() > totalArea * 0.02) {
        bbox.index = new PolygonIndex([ids], arcs);
      }
    }
  }

  this.findEnclosingShape = function(p) {
    var shpId = -1;
    var shapes = findPointHitShapes(p);
    shapes.forEach(function(paths) {
      if (testPointInRings(p, paths)) {
        shpId = paths[0].id;
      }
    });
    return shpId;
  };

  this.pointIsEnclosed = function(p) {
    return testPointInRings(p, findPointHitRings(p));
  };

  this.arcIsEnclosed = function(arcId) {
    return this.pointIsEnclosed(getTestPoint(arcId));
  };

  // Test if a polygon ring is contained within an indexed ring
  // Not a true polygon-in-polygon test
  // Assumes that the target ring does not cross an indexed ring at any point
  // or share a segment with an indexed ring. (Intersecting rings should have
  // been detected previously).
  //
  this.pathIsEnclosed = function(pathIds) {
    // TODO: handle irregular paths
    var p = getTestPoint(pathIds[0]);
    return this.pointIsEnclosed(p);
  };

  // return array of paths that are contained within a path, or null if none
  // @pathIds Array of arc ids comprising a closed path
  this.findEnclosedPaths = function(pathIds) {
    var pathBounds = arcs.getSimpleShapeBounds(pathIds),
        cands = _index.search(pathBounds.toArray()),
        paths = [],
        index;

    if (cands.length > 6) {
      index = new PolygonIndex([pathIds], arcs);
    }

    cands.forEach(function(cand) {
      var p = getTestPoint(cand.ids[0]);
      var isEnclosed = index ?
        index.pointInPolygon(p[0], p[1]) : pathContainsPoint(pathIds, pathBounds, p);
      if (isEnclosed) {
        paths.push(cand.ids);
      }
    });
    return paths.length > 0 ? paths : null;
  };

  this.findPathsInsideShape = function(shape) {
    var paths = [];
    shape.forEach(function(ids) {
      var enclosed = this.findEnclosedPaths(ids);
      if (enclosed) {
        paths = xorArrays(paths, enclosed);
      }
    }, this);
    return paths.length > 0 ? paths : null;
  };

  function testPointInRings(p, cands) {
    var count = 0,
        isOn = false,
        isIn = false;
    cands.forEach(function(cand) {
      var inRing = cand.index ?
        cand.index.pointInPolygon(p[0], p[1]) :
        pathContainsPoint(cand.ids, cand.bounds, p);
      if (inRing == -1) {
        isOn = true;
      } else if (inRing == 1) {
        isIn = !isIn;
      }
    });
    return isOn || isIn;
  }

  function findPointHitShapes(p) {
    var rings = findPointHitRings(p),
        shapes = [],
        shape, bbox;
    if (rings.length > 0) {
      rings.sort(function(a, b) {return a.id - b.id;});
      for (var i=0; i<rings.length; i++) {
        bbox = rings[i];
        if (i === 0 || bbox.id != rings[i-1].id) {
          shapes.push(shape=[]);
        }
        shape.push(bbox);
      }
    }
    return shapes;
  }

  function findPointHitRings(p) {
    var x = p[0],
        y = p[1];
    return _index.search([x, y, x, y]);
  }

  function getTestPoint(arcId) {
    // test point halfway along first segment because ring might still be
    // enclosed if a segment endpoint touches an indexed ring.
    var p0 = arcs.getVertex(arcId, 0),
        p1 = arcs.getVertex(arcId, 1);
    return [(p0.x + p1.x) / 2, (p0.y + p1.y) / 2];
  }

  function pathContainsPoint(pathIds, pathBounds, p) {
    if (pathBounds.containsPoint(p[0], p[1]) === false) return 0;
    // A contains B iff some point on B is inside A
    return geom.testPointInRing(p[0], p[1], pathIds, arcs);
  }

  function xorArrays(a, b) {
    var xor = [];
    a.forEach(function(el) {
      if (b.indexOf(el) == -1) xor.push(el);
    });
    b.forEach(function(el) {
      if (xor.indexOf(el) == -1) xor.push(el);
    });
    return xor;
  }
}




// Convert an array of intersections into an ArcCollection (for display)
//
MapShaper.getIntersectionPoints = function(intersections) {
  return Utils.map(intersections, function(obj) {
        return [obj.x, obj.y];
      });
};

// Identify intersecting segments in an ArcCollection
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
        stripeCount = MapShaper.calcSegmentIntersectionStripeCount(arcs),
        stripeSizes = new Uint32Array(stripeCount),
        i;

    function stripeId(y) {
      return Math.floor((stripeCount-1) * (y - ymin) / yrange);
    }

    // Count segments in each stripe
    arcs.forEachSegment(function(id1, id2, xx, yy) {
      var s1 = stripeId(yy[id1]),
          s2 = stripeId(yy[id2]);
      while (true) {
        stripeSizes[s1] = stripeSizes[s1] + 2;
        if (s1 == s2) break;
        s1 += s2 > s1 ? 1 : -1;
      }
    });

    // Allocate arrays for segments in each stripe
    var stripeData = getUint32Array(Utils.sum(stripeSizes)),
        offs = 0;
    var stripes = Utils.map(stripeSizes, function(stripeSize) {
      var start = offs;
      offs += stripeSize;
      return stripeData.subarray(start, offs);
    });
    // Assign segment ids to each stripe
    Utils.initializeArray(stripeSizes, 0);

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
        count = stripeSizes[s1];
        stripeSizes[s1] = count + 2;
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
      if (arr.length > 0) {
        extendIntersections(intersections, arr, i);
      }
    }

    // T.stop("Intersections: " + intersections.length + " stripes: " + stripeCount);
    return intersections;

    // Add intersections from a bin, but avoid duplicates.
    function extendIntersections(intersections, arr, stripeId) {
      Utils.forEach(arr, function(obj, i) {
        var key = MapShaper.getIntersectionKey(obj.a, obj.b);
        if (key in index === false) {
          intersections.push(obj);
          index[key] = true;
        }
      });
    }
  };

})();

MapShaper.calcSegmentIntersectionStripeCount = function(arcs) {
  var yrange = arcs.getBounds().height(),
      segLen = arcs.getAvgSegment2()[1],
      count = 1;
  if (segLen > 0 && yrange > 0) {
    count = Math.ceil(yrange / segLen / 20);
  }
  return count || 1;
};

// Get an indexable key that is consistent regardless of point sequence
// @a, @b endpoint ids in format [i, j]
MapShaper.getIntersectionKey = function(a, b) {
  return a.concat(b).sort().join(',');
};

// Find intersections among a group of line segments
// TODO: handle case where a segment starts and ends at the same point (i.e. duplicate coords);
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
      m1, m2,
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

      if (s1p2x < s2p1x) break; // x extent of seg 2 is greater than seg 1: done with seg 1
      //if (s1p2x <= s2p1x) break; // this misses point-segment intersections when s1 or s2 is vertical

      s2p1y = yy[s2p1];
      s2p2 = ids[j+1];
      s2p2x = xx[s2p2];
      s2p2y = yy[s2p2];

      // skip segments with non-overlapping y ranges
      if (s1p1y >= s2p1y) {
        if (s1p1y > s2p2y && s1p2y > s2p1y && s1p2y > s2p2y) continue;
      } else {
        if (s1p1y < s2p2y && s1p2y < s2p1y && s1p2y < s2p2y) continue;
      }

      // skip segments that share an endpoint
      if (s1p1x == s2p1x && s1p1y == s2p1y || s1p1x == s2p2x && s1p1y == s2p2y ||
          s1p2x == s2p1x && s1p2y == s2p1y || s1p2x == s2p2x && s1p2y == s2p2y) {
        // TODO: don't reject segments that share exactly one endpoint and fold back on themselves
        continue;
      }

      // test two candidate segments for intersection
      hit = segmentIntersection(s1p1x, s1p1y, s1p2x, s1p2y,
          s2p1x, s2p1y, s2p2x, s2p2y);

      if (hit) {
        intersections.push({
          x: hit[0],
          y: hit[1],
          a: getEndpointIds(s1p1, s1p2, hit),
          b: getEndpointIds(s2p1, s2p2, hit)
        });
      }
    }
    i += 2;
  }
  return intersections;

  // @p is an [x, y] location along a segment defined by ids @id1 and @id2
  // return array [i, j] where i and j are the same endpoint ids with i <= j
  // if @p coincides with an endpoint, return the id of that endpoint twice
  function getEndpointIds(id1, id2, p) {
    var i = id1 < id2 ? id1 : id2,
        j = i === id1 ? id2 : id1;
    if (xx[i] == p[0] && yy[i] == p[1]) {
      j = i;
    } else if (xx[j] == p[0] && yy[j] == p[1]) {
      i = j;
    }
    return [i, j];
  }
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




// Functions for dividing polygons and polygons at points where arc-segments intersect

// Divide a collection of arcs at points where segments intersect
// and re-index the paths of all the layers that reference the arc collection.
// (in-place)
MapShaper.divideArcs = function(dataset) {
  var arcs = dataset.arcs;
  T.start();
  T.start();
  var snapDist = MapShaper.getHighPrecisionSnapInterval(arcs);
  var snapCount = MapShaper.snapCoordsByInterval(arcs, snapDist);
  var dupeCount = arcs.dedupCoords();
  T.stop('snap points');
  if (snapCount > 0 || dupeCount > 0) {
    T.start();
    api.buildTopology(dataset);
    T.stop('rebuild topology');
  }

  // clip arcs at points where segments intersect
  T.start();
  var map = MapShaper.insertClippingPoints(arcs);
  T.stop('insert clipping points');
  T.start();
  // update arc ids in arc-based layers and clean up arc geometry
  // to remove degenerate arcs and duplicate points
  var nodes = new NodeCollection(arcs);
  dataset.layers.forEach(function(lyr) {
    if (MapShaper.layerHasPaths(lyr)) {
      MapShaper.updateArcIds(lyr.shapes, map, nodes);
      // TODO: consider alternative -- avoid creating degenerate arcs
      // in insertClippingPoints()
      MapShaper.cleanShapes(lyr.shapes, arcs, lyr.geometry_type);
    }
  });
  T.stop('update arc ids / clean geometry');
  T.stop("divide arcs");
  return nodes;
};

MapShaper.updateArcIds = function(shapes, map, nodes) {
  var arcCount = nodes.arcs.size(),
      shape2;
  for (var i=0; i<shapes.length; i++) {
    shape2 = [];
    MapShaper.forEachPath(shapes[i], remapPathIds);
    shapes[i] = shape2;
  }

  function remapPathIds(ids) {
    if (!ids) return; // null shape
    var ids2 = [];
    for (var j=0; j<ids.length; j++) {
      remapArcId(ids[j], ids2);
    }
    shape2.push(ids2);
  }

  function remapArcId(id, ids) {
    var rev = id < 0,
        absId = rev ? ~id : id,
        min = map[absId],
        max = (absId >= map.length - 1 ? arcCount : map[absId + 1]) - 1,
        id2;
    do {
      if (rev) {
        id2 = ~max;
        max--;
      } else {
        id2 = min;
        min++;
      }
      // If there are duplicate arcs, always use the same one
      if (nodes) {
        id2 = nodes.findMatchingArc(id2);
      }
      ids.push(id2);
    } while (max - min >= 0);
  }
};

// divide a collection of arcs at points where line segments cross each other
// @arcs ArcCollection
// returns array that maps original arc ids to new arc ids
MapShaper.insertClippingPoints = function(arcs) {
  var points = MapShaper.findClippingPoints(arcs),
      p;

  // TODO: avoid some or all of the following if no points need to be added

  // original arc data
  var pointTotal0 = arcs.getPointCount(),
      arcTotal0 = arcs.size(),
      data = arcs.getVertexData(),
      xx0 = data.xx,
      yy0 = data.yy,
      nn0 = data.nn,
      i0 = 0,
      n0, arcLen0;

  // new arc data
  var pointTotal1 = pointTotal0 + points.length * 2,
      arcTotal1 = arcTotal0 + points.length,
      xx1 = new Float64Array(pointTotal1),
      yy1 = new Float64Array(pointTotal1),
      nn1 = [],  // number of arcs may vary
      i1 = 0,
      n1;

  var map = new Uint32Array(arcTotal0);

  // sort from last point to first point
  points.sort(function(a, b) {
    return b.i - a.i || b.pct - a.pct;
  });
  p = points.pop();

  for (var id0=0, id1=0; id0 < arcTotal0; id0++) {
    arcLen0 = nn0[id0];
    map[id0] = id1;
    n0 = 0;
    n1 = 0;
    while (n0 < arcLen0) {
      n1++;
      xx1[i1] = xx0[i0];
      yy1[i1++] = yy0[i0];
      while (p && p.i === i0) {
        xx1[i1] = p.x;
        yy1[i1++] = p.y;
        n1++;
        nn1[id1++] = n1; // end current arc at intersection
        n1 = 0;          // begin new arc

        xx1[i1] = p.x;
        yy1[i1++] = p.y;
        n1++;
        p = points.pop();
      }
      n0++;
      i0++;
    }
    nn1[id1++] = n1;
  }

  if (i1 != pointTotal1) error("[insertClippingPoints()] Counting error");
  arcs.updateVertexData(nn1, xx1, yy1, null);

  // segment-point intersections create duplicate points
  // TODO: consider removing call to dedupCoords() -- empty arcs are removed by cleanShapes()
  arcs.dedupCoords();
  return map;
};

MapShaper.findClippingPoints = function(arcs) {
  var intersections = MapShaper.findSegmentIntersections(arcs),
      data = arcs.getVertexData(),
      xx = data.xx,
      yy = data.yy,
      points = [];

  intersections.forEach(function(o) {
    var p1 = getSegmentIntersection(o.x, o.y, o.a),
        p2 = getSegmentIntersection(o.x, o.y, o.b);
    if (p1) points.push(p1);
    if (p2) points.push(p2);
  });

  // remove 1. points that are at arc endpoints and 2. duplicate points
  // (kludgy -- look into preventing these cases, which are caused by T intersections)
  var index = {};
  return Utils.filter(points, function(p) {
    var key = p.i + "," + p.pct;
    if (key in index) return false;
    index[key] = true;
    if (p.pct <= 0 && arcs.pointIsEndpoint(p.i) ||
        p.pct >= 1 && arcs.pointIsEndpoint(p.j)) {
      return false;
    }
    return true;
  });

  function getSegmentIntersection(x, y, ids) {
    var i = ids[0],
        j = ids[1],
        dx = xx[j] - xx[i],
        dy = yy[j] - yy[i],
        pct;
    if (i > j) error("[findClippingPoints()] Out-of-sequence arc ids");
    if (dx === 0 && dy === 0) {
      pct = 0;
    } else if (Math.abs(dy) > Math.abs(dx)) {
      pct = (y - yy[i]) / dy;
    } else {
      pct = (x - xx[i]) / dx;
    }

    if (pct < 0 || pct > 1) {
      verbose("[findClippingPoints()] Off-segment intersection (caused by rounding error");
      trace("pct:", pct, "dx:", dx, "dy:", dy, 'x:', x, 'y:', y, 'xx[i]:', xx[i], 'xx[j]:', xx[j], 'yy[i]:', yy[i], 'yy[j]:', yy[j]);
      trace("xpct:", (x - xx[i]) / dx, 'ypct:', (y - yy[i]) / dy);
      if (pct < 0) pct = 0;
      if (pct > 1) pct = 1;
    }

    return {
        pct: pct,
        i: i,
        j: j,
        x: x,
        y: y
      };
  }
};




// Return function for splitting self-intersecting polygon rings
// Returned function receives a single path, returns an array of paths
// Assumes that any intersections occur at vertices, not along segments
// (requires that MapShaper.divideArcs() has already been run)
//
MapShaper.getSelfIntersectionSplitter = function(nodes) {

  function contains(arr, el) {
    for (var i=0, n=arr.length; i<n; i++) {
      if (arr[i] === el) return true;
    }
    return false;
  }

  // If arc @enterId enters a node with more than one open routes leading out:
  //   return array of sub-paths
  // else return null
  function dividePathAtNode(path, enterId) {
    var count = 0,
        subPaths = null,
        exitIds, firstExitId;
    nodes.forEachConnectedArc(enterId, function(arcId) {
      var exitId = ~arcId;
      // TODO: remove performance bottleneck
      // contains() is faster than native array.indexOf(), could do better.
      // if (path.indexOf(exitId) > -1) { // ignore arcs that are not on this path
      if (contains(path, exitId)) { // ignore arcs that are not on this path
        if (count === 0) {
          firstExitId = exitId;
        } else if (count === 1) {
          exitIds = [firstExitId, exitId];
        } else {
          exitIds.push(exitId);
        }
        count++;
      }
    });
    if (exitIds) {
      subPaths = MapShaper.splitPathByIds(path, exitIds);
      // recursively divide each sub-path
      return subPaths.reduce(function(memo, subPath) {
        return memo.concat(dividePath(subPath));
      }, []);
    }
    return null;
  }

  function dividePath(path) {
    var subPaths = null;
    for (var i=0; i<path.length - 1; i++) { // don't need to check last arc
      subPaths = dividePathAtNode(path, path[i]);
      if (subPaths) {
        return subPaths;
      }
    }
    // indivisible path -- remove any spikes
    MapShaper.removeSpikesInPath(path);
    return path.length > 0 ? [path] : [];
  }

  return dividePath;
};

// @path An array of arc ids
// @ids An array of two or more start ids
MapShaper.splitPathByIds = function(path, ids) {
  var n = ids.length;
  var ii = ids.map(function(id) {
    var idx = path.indexOf(id);
    if (idx == -1) error("[splitPathByIds()] Path is missing id:", id);
    return idx;
  });
  Utils.genericSort(ii, true);
  var subPaths = ii.map(function(idx, i) {
    var split;
    if (i == n-1) {
      // place first path item first
      split = path.slice(0, ii[0]).concat(path.slice(idx));
    } else {
      split = path.slice(idx, ii[i+1]);
    }
    return split;
  });

  // make sure first sub-path starts with arc at path[0]
  if (ii[0] !== 0) {
    subPaths.unshift(subPaths.pop());
  }
  if (subPaths[0][0] !== path[0]) {
    error("[splitPathByIds()] Indexing error");
  }
  return subPaths;
};




// Functions for redrawing polygons for clipping / erasing / flattening / division

MapShaper.setBits = function(src, flags, mask) {
  return (src & ~mask) | (flags & mask);
};

MapShaper.andBits = function(src, flags, mask) {
  return src & (~mask | flags);
};

MapShaper.setRouteBits = function(bits, id, flags) {
  var abs = absArcId(id),
      mask;
  if (abs == id) { // fw
    mask = ~3;
  } else {
    mask = ~0x30;
    bits = bits << 4;
  }
  flags[abs] &= (bits | mask);
};

MapShaper.getRouteBits = function(id, flags) {
  var abs = absArcId(id),
      bits = flags[abs];
  if (abs != id) bits = bits >> 4;
  return bits & 7;
};


// enable arc pathways in a single shape or array of shapes
// Uses 8 bits to control traversal of each arc
// 0-3: forward arc; 4-7: rev arc
// 0: fw path is visible
// 1: fw path is open for traversal
// ...
//
MapShaper.openArcRoutes = function(arcIds, arcs, flags, fwd, rev, dissolve, orBits) {
  MapShaper.forEachArcId(arcIds, function(id) {
    var isInv = id < 0,
        absId = isInv ? ~id : id,
        currFlag = flags[absId],
        openFwd = isInv ? rev : fwd,
        openRev = isInv ? fwd : rev,
        newFlag = currFlag;

    // error condition: lollipop arcs can cause problems; ignore these
    if (arcs.arcIsLollipop(id)) {
      trace('lollipop');
      newFlag = 0; // unset (i.e. make invisible)
    } else {
      if (openFwd) {
        newFlag |= 3; // visible / open
      }
      if (openRev) {
        newFlag |= 0x30; // visible / open
      }

      // placing this in front of dissolve - dissolve has to be able to hide
      // arcs that are set to visible
      if (orBits > 0) {
        newFlag |= orBits;
      }

      // dissolve hides arcs that have both fw and rev pathways open
      if (dissolve && (newFlag & 0x22) === 0x22) {
        newFlag &= ~0x11; // make invisible
      }
    }

    flags[absId] = newFlag;
  });
};

MapShaper.closeArcRoutes = function(arcIds, arcs, flags, fwd, rev, hide) {
  MapShaper.forEachArcId(arcIds, function(id) {
    var isInv = id < 0,
        absId = isInv ? ~id : id,
        currFlag = flags[absId],
        mask = 0xff,
        closeFwd = isInv ? rev : fwd,
        closeRev = isInv ? fwd : rev;

    if (closeFwd) {
      if (hide) mask &= ~1;
      mask ^= 0x2;
    }
    if (closeRev) {
      if (hide) mask &= ~0x10;
      mask ^= 0x20;
    }

    flags[absId] = currFlag & mask;
  });
};


// Return a function for generating a path across a field of intersecting arcs
MapShaper.getPathFinder = function(nodes, useRoute, routeIsVisible, chooseRoute) {
  var arcs = nodes.arcs,
      coords = arcs.getVertexData(),
      xx = coords.xx,
      yy = coords.yy,
      nn = coords.nn,
      splitter;

  function getNextArc(prevId) {
    var ai = arcs.indexOfVertex(prevId, -2),
        ax = xx[ai],
        ay = yy[ai],
        bi = arcs.indexOfVertex(prevId, -1),
        bx = xx[bi],
        by = yy[bi],
        nextId = NaN,
        nextAngle = 0;

    nodes.forEachConnectedArc(prevId, function(candId) {
      if (!routeIsVisible(~candId)) return;
      if (arcs.getArcLength(candId) < 2) error("[pathfinder] defective arc");

      var ci = arcs.indexOfVertex(candId, -2),
          cx = xx[ci],
          cy = yy[ci],

          // sanity check: make sure both arcs share the same vertex;
          di = arcs.indexOfVertex(candId, -1),
          dx = xx[di],
          dy = yy[di],
          candAngle;
      if (dx !== bx || dy !== by) {
        message("cd:", cx, cy, dx, dy, 'arc:', candId);
        error("Error in node topology");
      }

      candAngle = signedAngle(ax, ay, bx, by, cx, cy);

      if (candAngle > 0) {
        if (nextAngle === 0) {
          nextId = candId;
          nextAngle = candAngle;
        } else {
          var choice = chooseRoute(~nextId, nextAngle, ~candId, candAngle, prevId);
          if (choice == 2) {
            nextId = candId;
            nextAngle = candAngle;
          }
        }
      } else {
        // candAngle is NaN or 0
        trace("#getNextArc() Invalid angle; id:", candId, "angle:", candAngle);
        nodes.debugNode(prevId);
      }
    });

    if (nextId === prevId) {
      // TODO: confirm that this can't happen
      nodes.debugNode(prevId);
      error("#getNextArc() nextId === prevId");
    }
    return ~nextId; // reverse arc to point onwards
  }

  return function(startId) {
    var path = [],
        nextId, msg,
        candId = startId,
        verbose = false;

    do {
      if (verbose) msg = (nextId === undefined ? " " : "  " + nextId) + " -> " + candId;
      if (useRoute(candId)) {
        path.push(candId);
        nextId = candId;
        if (verbose) message(msg);
        candId = getNextArc(nextId);
        if (verbose && candId == startId ) message("  o", geom.getPathArea4(path, arcs));
      } else {
        if (verbose) message(msg + " x");
        return null;
      }

      if (candId == ~nextId) {
        trace("dead-end"); // TODO: handle or prevent this error condition
        return null;
      }
    } while (candId != startId);
    return path.length === 0 ? null : path;
  };
};

// types: "dissolve" "flatten"
// Returns a function for flattening or dissolving a collection of rings
// Assumes rings are oriented in CW direction
//
MapShaper.getRingIntersector = function(nodes, type, flags) {
  var arcs = nodes.arcs;
  var findPath = MapShaper.getPathFinder(nodes, useRoute, routeIsActive, chooseRoute);
  flags = flags || new Uint8Array(arcs.size());

  return function(rings) {
    var dissolve = type == 'dissolve',
        openFwd = true,
        openRev = type == 'flatten',
        output;
    // even single rings get transformed (e.g. to remove spikes)
    if (rings.length > 0) {
      output = [];
      MapShaper.openArcRoutes(rings, arcs, flags, openFwd, openRev, dissolve);
      MapShaper.forEachPath(rings, function(ids) {
        var path;
        for (var i=0, n=ids.length; i<n; i++) {
          path = findPath(ids[i]);
          if (path) {
            output.push(path);
          }
        }
      });
      MapShaper.closeArcRoutes(rings, arcs, flags, openFwd, openRev, true);
    } else {
      output = rings;
    }
    return output;
  };

  function chooseRoute(id1, angle1, id2, angle2, prevId) {
    var route = 1;
    if (angle1 == angle2) {
      trace("[chooseRoute()] parallel routes, unsure which to choose");
      //MapShaper.debugRoute(id1, id2, nodes.arcs);
    } else if (angle2 < angle1) {
      route = 2;
    }
    return route;
  }

  function routeIsActive(arcId) {
    var bits = MapShaper.getRouteBits(arcId, flags);
    return (bits & 1) == 1;
  }

  function useRoute(arcId) {
    var route = MapShaper.getRouteBits(arcId, flags),
        isOpen = false;

    if (route == 3) {
      isOpen = true;
      MapShaper.setRouteBits(1, arcId, flags); // close the path, leave visible
    }

    return isOpen;
  }
};

MapShaper.debugFlags = function(flags) {
  var arr = Utils.map(flags, function(flag) {
    return bitsToString(flag);
  });
  message(arr);

  function bitsToString(bits) {
    var str = "";
    for (var i=0; i<8; i++) {
      str += (bits & (1 << i)) > 0 ? "1" : "0";
      if (i < 7) str += ' ';
      if (i == 3) str += ' ';
    }
    return str;
  }
};

/*
// Print info about two arcs whose first segments are parallel
//
MapShaper.debugRoute = function(id1, id2, arcs) {
  var n1 = arcs.getArcLength(id1),
      n2 = arcs.getArcLength(id2),
      len1 = 0,
      len2 = 0,
      p1, p2, pp1, pp2, ppp1, ppp2,
      angle1, angle2;

      console.log("chooseRoute() lengths:", n1, n2, 'ids:', id1, id2);
  for (var i=0; i<n1 && i<n2; i++) {
    p1 = arcs.getVertex(id1, i);
    p2 = arcs.getVertex(id2, i);
    if (i === 0) {
      if (p1.x != p2.x || p1.y != p2.y) {
        error("chooseRoute() Routes should originate at the same point)");
      }
    }

    if (i > 1) {
      angle1 = signedAngle(ppp1.x, ppp1.y, pp1.x, pp1.y, p1.x, p1.y);
      angle2 = signedAngle(ppp2.x, ppp2.y, pp2.x, pp2.y, p2.x, p2.y);

      console.log("angles:", angle1, angle2, 'lens:', len1, len2);
      // return;
    }

    if (i >= 1) {
      len1 += distance2D(p1.x, p1.y, pp1.x, pp1.y);
      len2 += distance2D(p2.x, p2.y, pp2.x, pp2.y);
    }

    if (i == 1 && (n1 == 2 || n2 == 2)) {
      console.log("arc1:", pp1, p1, "len:", len1);
      console.log("arc2:", pp2, p2, "len:", len2);
    }

    ppp1 = pp1;
    ppp2 = pp2;
    pp1 = p1;
    pp2 = p2;
  }
  return 1;
};
*/




// Returns a function that separates rings in a polygon into space-enclosing rings
// and holes. Also fixes self-intersections.
//
MapShaper.getHoleDivider = function(nodes) {
  var split = MapShaper.getSelfIntersectionSplitter(nodes);

  return function(rings, cw, ccw) {
    MapShaper.forEachPath(rings, function(ringIds) {
      var splitRings = split(ringIds);
      if (splitRings.length === 0) {
        trace("[getRingDivider()] Defective path:", ringIds);
      }
      splitRings.forEach(function(ringIds, i) {
        var ringArea = geom.getPathArea4(ringIds, nodes.arcs);
        if (ringArea > 0) {
          cw.push(ringIds);
        } else if (ringArea < 0) {
          ccw.push(ringIds);
        }
      });
    });
  };
};




// clean polygon or polyline shapes, in-place
//
MapShaper.cleanShapes = function(shapes, arcs, type) {
  for (var i=0, n=shapes.length; i<n; i++) {
    shapes[i] = MapShaper.cleanShape(shapes[i], arcs, type);
  }
};

// Remove defective arcs and zero-area polygon rings
// Don't remove duplicate points
// Don't remove spikes (between arcs or within arcs)
// Don't check winding order of polygon rings
MapShaper.cleanShape = function(shape, arcs, type) {
  return MapShaper.editPaths(shape, function(path) {
    var cleaned = MapShaper.cleanPath(path, arcs);
    if (type == 'polygon' && cleaned) {
      MapShaper.removeSpikesInPath(cleaned); // assumed by divideArcs()
      if (geom.getPathArea4(cleaned, arcs) === 0) {
        cleaned = null;
      }
    }
    return cleaned;
  });
};

MapShaper.cleanPath = function(path, arcs) {
  var nulls = 0;
  for (var i=0, n=path.length; i<n; i++) {
    if (arcs.arcIsDegenerate(path[i])) {
      nulls++;
      path[i] = null;
    }
  }
  return nulls > 0 ? path.filter(function(id) {return id !== null;}) : path;
};

// Remove pairs of ids where id[n] == ~id[n+1] or id[0] == ~id[n-1];
// (in place)
MapShaper.removeSpikesInPath = function(ids) {
  var n = ids.length;
  if (n >= 2) {
    if (ids[0] == ~ids[n-1]) {
      ids.pop();
      ids.shift();
    } else {
      for (var i=1; i<n; i++) {
        if (ids[i-1] == ~ids[i]) {
          ids.splice(i-1, 2);
          break;
        }
      }
    }
    if (ids.length < n) {
      MapShaper.removeSpikesInPath(ids);
    }
  }
};


// TODO: Need to rethink polygon repair: these function can cause problems
// when part of a self-intersecting polygon is removed
//
MapShaper.repairPolygonGeometry = function(layers, dataset, opts) {
  var nodes = MapShaper.divideArcs(dataset);
  layers.forEach(function(lyr) {
    MapShaper.repairSelfIntersections(lyr, nodes);
  });
  return layers;
};

// Remove any small shapes formed by twists in each ring
// // OOPS, NO // Retain only the part with largest area
// // this causes problems when a cut-off hole has a matching ring in another polygon
// TODO: consider cases where cut-off parts should be retained
//
MapShaper.repairSelfIntersections = function(lyr, nodes) {
  var splitter = MapShaper.getSelfIntersectionSplitter(nodes);

  lyr.shapes = lyr.shapes.map(function(shp, i) {
    return cleanPolygon(shp);
  });

  function cleanPolygon(shp) {
    var cleanedPolygon = [];
    MapShaper.forEachPath(shp, function(ids) {
      // TODO: consider returning null if path can't be split
      var splitIds = splitter(ids);
      if (splitIds.length === 0) {
        error("[cleanPolygon()] Defective path:", ids);
      } else if (splitIds.length == 1) {
        cleanedPolygon.push(splitIds[0]);
      } else {
        var shapeArea = geom.getPathArea4(ids, nodes.arcs),
            sign = shapeArea > 0 ? 1 : -1,
            mainRing;

        var maxArea = splitIds.reduce(function(max, ringIds, i) {
          var pathArea = geom.getPathArea4(ringIds, nodes.arcs) * sign;
          if (pathArea > max) {
            mainRing = ringIds;
            max = pathArea;
          }
          return max;
        }, 0);

        if (mainRing) {
          cleanedPolygon.push(mainRing);
        }
      }
    });
    return cleanedPolygon.length > 0 ? cleanedPolygon : null;
  }
};




// Import path data from a non-topological source (Shapefile, GeoJSON, etc)
// in preparation for identifying topology.
//
function PathImporter(reservedPoints, opts) {
  opts = opts || {};
  var shapes = [],
      collectionType = null,
      round = null,
      xx, yy, nn, buf;

  if (reservedPoints > 0) {
    nn = [];
    xx = new Float64Array(reservedPoints);
    yy = new Float64Array(reservedPoints);
    buf = new Float64Array(1024);
  }

  if (opts.precision) {
    round = getRoundingFunction(opts.precision);
  }

  var pathId = -1,
      shapeId = -1,
      pointId = 0,
      dupeCount = 0,
      skippedPathCount = 0;

  function addShapeType(t) {
    if (!collectionType) {
      collectionType = t;
    } else if (t != collectionType) {
      collectionType = "mixed";
    }
  }

  function getPointBuf(n) {
    var len = n * 2;
    if (buf.length < len) {
      buf = new Float64Array(Math.ceil(len * 1.3));
    }
    return buf;
  }

  this.startShape = function() {
    shapes[++shapeId] = null;
  };

  function appendToShape(part) {
    var currShape = shapes[shapeId] || (shapes[shapeId] = []);
    currShape.push(part);
  }

  function appendPath(n, type) {
    addShapeType(type);
    pathId++;
    nn[pathId] = n;
    appendToShape([pathId]);
  }

  function roundPoints(points, round) {
    points.forEach(function(p) {
      p[0] = round(p[0]);
      p[1] = round(p[1]);
    });
  }

  /*
  this.roundCoords = function(arr, round) {
    for (var i=0, n=arr.length; i<n; i++) {
      arr[i] = round(arr[i]);
    }
  };
  */

  // Import coordinates from an array with coordinates in format: [x, y, x, y, ...]
  //
  this.importPathFromFlatArray = function(arr, type, len, start) {
    var i = start || 0,
        end = i + (len || arr.length),
        n = 0,
        x, y, prevX, prevY;

    while (i < end) {
      x = arr[i++];
      y = arr[i++];
      if (round) {
        x = round(x);
        y = round(y);
      }
      if (i > 0 && x == prevX && y == prevY) {
        dupeCount++;
      } else {
        xx[pointId] = x;
        yy[pointId] = y;
        pointId++;
        n++;
      }
      prevY = y;
      prevX = x;
    }

    /*
    var valid = false;
    if (type == 'polyline') {
      valid = n > 1;
    } else if (type == 'polygon') {
      valid = n > 3 && geom.getPathArea3(xx, yy, pointId-n, n) !== 0;
    } else {
      error("[importPathFromFlatArray() Unexpected type:", type);
    }

    if (valid) {
      appendPath(n, type);
    } else {
      pointId -= n;
      skippedPathCount++;
    }
    */
    appendPath(n, type);

  };

  // Import an array of [x, y] Points
  //
  this.importPath = function(points, type) {
    var n = points.length,
        buf = getPointBuf(n),
        j = 0;
    for (var i=0; i < n; i++) {
      buf[j++] = points[i][0];
      buf[j++] = points[i][1];
    }
    this.importPathFromFlatArray(buf, type, j, 0);
  };

  this.importPoints = function(points) {
    addShapeType('point');
    if (round) {
      roundPoints(points, round);
    }
    points.forEach(appendToShape);
  };

  this.importLine = function(points) {
    this.importPath(points, 'polyline');
  };

  this.importPolygon = function(points, isHole) {
    var area = geom.getPathArea2(points);

    if (isHole === true && area > 0 || isHole === false && area < 0) {
      verbose("Warning: reversing", isHole ? "a CW hole" : "a CCW ring");
      points.reverse();
    }
    this.importPath(points, 'polygon');
  };

  // Return topological shape data
  // Apply any requested snapping and rounding
  // Remove duplicate points, check for ring inversions
  //
  this.done = function() {
    var arcs;

    // possible values: polygon, polyline, point, mixed, null
    if (collectionType == 'mixed') {
      stop("[PathImporter] Mixed feature types are not allowed");
    } else if (collectionType == 'polygon' || collectionType == 'polyline') {

      if (dupeCount > 0) {
        verbose(Utils.format("Removed %,d duplicate point%s", dupeCount, "s?"));
      }
      if (skippedPathCount > 0) {
        // TODO: consider showing details about type of error
        message(Utils.format("Removed %,d path%s with defective geometry", skippedPathCount, "s?"));
      }

      if (pointId > 0) {
       if (pointId < xx.length) {
          xx = xx.subarray(0, pointId);
          yy = yy.subarray(0, pointId);
        }
        arcs = new ArcCollection(nn, xx, yy);

        // TODO: move shape validation after snapping (which may corrupt shapes)
        if (opts.auto_snap || opts.snap_interval) {
          T.start();
          MapShaper.snapCoords(arcs, opts.snap_interval);
          T.stop("Snapping points");
        }

        MapShaper.cleanShapes(shapes, arcs, collectionType);
      } else {
        message("No geometries were imported");
        collectionType = null;
      }
    } else if (collectionType == 'point' || collectionType === null) {
      // pass
    } else {
      error("Unexpected collection type:", collectionType);
    }

    // TODO: remove empty arcs, collapsed arcs
    // ...

    return {
      arcs: arcs || null,
      info: {},
      layers: [{
        name: '',
        geometry_type: collectionType,
        shapes: shapes
      }]
    };
  };
}




MapShaper.exportPointData = function(points) {
  var data, path;
  if (!points || points.length === 0) {
    data = {partCount: 0, pointCount: 0};
  } else {
    path = {
      points: points,
      pointCount: points.length,
      bounds: geom.getPathBounds(points)
    };
    data = {
      bounds: path.bounds,
      pathData: [path],
      partCount: 1,
      pointCount: path.pointCount
    };
  }
  return data;
};

// TODO: remove duplication with MapShaper.getPathMetadata()
MapShaper.exportPathData = function(shape, arcs, type) {
  // kludge until Shapefile exporting is refactored
  if (type == 'point') return MapShaper.exportPointData(shape);

  var pointCount = 0,
      bounds = new Bounds(),
      paths = [];

  if (type == 'polyline' || type == 'polygon') {
    Utils.forEach(shape, function(arcIds, i) {
      var iter = arcs.getShapeIter(arcIds),
          path = MapShaper.exportPathCoords(iter),
          valid = true;
      if (type == 'polygon') {
        path.area = geom.getPathArea2(path.points);
        valid = path.pointCount > 3 && path.area !== 0;
      } else if (type == 'polyline') {
        valid = path.pointCount > 1;
      }
      if (valid) {
        pointCount += path.pointCount;
        path.bounds = geom.getPathBounds(path.points);
        bounds.mergeBounds(path.bounds);
        paths.push(path);
      } else {
        verbose("Skipping a collapsed", type, "path");
      }
    });
  }

  return {
    pointCount: pointCount,
    pathData: paths,
    pathCount: paths.length,
    bounds: bounds
  };
};

MapShaper.exportPathCoords = function(iter) {
  var points = [],
      i = 0,
      x, y, prevX, prevY;
  while (iter.hasNext()) {
    x = iter.x;
    y = iter.y;
    if (i === 0 || prevX != x || prevY != y) {
      points.push([x, y]);
      i++;
    }
    prevX = x;
    prevY = y;
  }
  return {
    points: points,
    pointCount: points.length
  };
};




MapShaper.getEncodings = function() {
  var iconv = require('iconv-lite');
  iconv.encodingExists('ascii'); // make iconv load its encodings
  return Utils.filter(Utils.keys(iconv.encodings), function(name) {
    //return !/^(internal|singlebyte|table|cp)/.test(name);
    return !/^(_|cs|internal|singlebyte|table|[0-9]|windows)/.test(name);
  });
};

MapShaper.requireConversionLib = function(encoding) {
  return require('iconv-lite');
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
      stop("DBF file contains non-ascii text data. You need to specify an encoding.\n" +
          "Some common character encodings:\n" +
          "  latin1\n  utf8\n" +
          "  gb2312    (simplified Chinese)\n" +
          "  big5      (traditional Chinese)\n" +
          "  shiftjis  (Japanese)\n" +
          "Run mapshaper -encodings for a list of supported encodings");
    }
    return Utils.trim(str);
  };
};

Dbf.getStringReaderEncoded = function(size, encoding) {
  var iconv = MapShaper.requireConversionLib(encoding),
      buf = new Buffer(size),
      isUtf8 = RE_UTF8.test(encoding);
  return function(bin) {
    var eos = false,
        i, c, str;
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
    names = Utils.map(fields, function(f) {return f.name;}),
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
  while (bin.peek() != 0x0D && bin.peek() != 0x0A) { // ascii newline or carriage return
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
MapShaper.Dbf = Dbf;
MapShaper.DbfReader = DbfReader;




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
        // trace ("#getNumericFieldInfo() Number field overflow; value:", val);
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

  // TODO: a version of this for DBF so only specified fields are unpacked
  //
  filterFields: function(map) {
    var records = this.getRecords(),
        fields = Utils.getKeys(map),
        src;

    for (var i=0, n=records.length; i<n; i++) {
      src = records[i];
      records[i] = Utils.reduce(fields, f, {});
    }

    function f(dest, name) {
      dest[map[name]] = src[name];
      return dest;
    }
  },

  clone: function() {
    var records2 = this.getRecords().map(function(rec) {
      return Utils.extend({}, rec);
    });
    return new DataTable(records2);
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
MapShaper.DataTable = DataTable;
MapShaper.ShapefileTable = ShapefileTable;




MapShaper.importGeoJSON = function(obj, opts) {
  if (Utils.isString(obj)) {
    obj = JSON.parse(obj);
  }
  var supportedGeometries = Utils.getKeys(GeoJSON.pathImporters);

  // Convert single feature or geometry into a collection with one member
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

  if (obj.type != 'FeatureCollection' && obj.type != 'GeometryCollection') {
    error("[importGeoJSON()] Unsupported GeoJSON type:", obj.type);
  }

  var properties = null, geometries;
  if (obj.type == 'FeatureCollection') {
    properties = [];
    geometries = obj.features.map(function(feat) {
      var rec = feat.properties;
      if (opts.id_field) {
        rec[opts.id_field] = feat.id || null;
      }
      properties.push(rec);
      return feat.geometry;
    });
  } else {
    geometries = obj.geometries;
  }

  // Count points in dataset (PathImporter needs total points to initialize buffers)
  //
  var pathPoints = Utils.reduce(geometries, function(sum, geom) {
    if (geom && geom.type in GeoJSON.geometryDepths) {
      sum += GeoJSON.countNestedPoints(geom.coordinates, GeoJSON.geometryDepths[geom.type]);
    }
    return sum;
  }, 0);

  // Import GeoJSON geometries
  //
  var importer = new PathImporter(pathPoints, opts);
  geometries.forEach(function(geom) {
    importer.startShape();
    if (geom) {
      GeoJSON.importGeometry(geom.type, geom.coordinates, importer);
    }
  });

  var importData = importer.done();
  if (properties) {
    importData.layers[0].data = new DataTable(properties);
  }
  return importData;
};

var GeoJSON = MapShaper.geojson = {};

GeoJSON.translateGeoJSONType = function(type) {
  return GeoJSON.typeLookup[type] || null;
};

GeoJSON.typeLookup = {
  LineString: 'polyline',
  MultiLineString: 'polyline',
  Polygon: 'polygon',
  MultiPolygon: 'polygon',
  Point: 'point',
  MultiPoint: 'point'
};

GeoJSON.importGeometry = function(type, coords, importer) {
  if (type in GeoJSON.pathImporters) {
    GeoJSON.pathImporters[type](coords, importer);
  } else {
    verbose("TopoJSON.importGeometryCollection() Unsupported geometry type:", geom.type);
  }
};

// Functions for importing geometry coordinates using a PathImporter
//
GeoJSON.pathImporters = {
  LineString: function(coords, importer) {
    importer.importLine(coords);
  },
  MultiLineString: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      GeoJSON.pathImporters.LineString(coords[i], importer);
    }
  },
  Polygon: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      importer.importPolygon(coords[i], i > 0);
    }
  },
  MultiPolygon: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      GeoJSON.pathImporters.Polygon(coords[i], importer);
    }
  },
  Point: function(coord, importer) {
    importer.importPoints([coord]);
  },
  MultiPoint: function(coords, importer) {
    importer.importPoints(coords);
  }
};

// Nested depth of GeoJSON Points in coordinates arrays
//
GeoJSON.geometryDepths = {
  //Point: 0,
  //MultiPoint: 1,
  LineString: 1,
  MultiLineString: 2,
  Polygon: 2,
  MultiPolygon: 3
};

// Sum points in a GeoJSON coordinates array
GeoJSON.countNestedPoints = function(coords, depth) {
  var tally = 0;
  if (depth == 1) {
    tally = coords.length;
  } else if (depth > 1) {
    for (var i=0, n=coords.length; i<n; i++) {
      tally += GeoJSON.countNestedPoints(coords[i], depth-1);
    }
  } else if (depth === 0 && coords) {
    tally = 1;
  }
  return tally;
};

MapShaper.exportGeoJSON = function(dataset, opts) {
  var extension = '.' + (opts.output_extension || "json");
  return dataset.layers.map(function(lyr) {
    return {
      content: MapShaper.exportGeoJSONString(lyr, dataset.arcs, opts),
      filename: lyr.name ? lyr.name + extension : ""
    };
  });
};

MapShaper.exportGeoJSONString = function(lyr, arcs, opts) {
  opts = opts || {};
  var type = lyr.geometry_type,
      properties = lyr.data && lyr.data.getRecords() || null,
      useProperties = !!properties && !(opts.cut_table || opts.drop_table),
      useFeatures = useProperties || opts.id_field;

  if (properties && properties.length !== lyr.shapes.length) {
    error("#exportGeoJSON() Mismatch between number of properties and number of shapes");
  }

  var objects = Utils.reduce(lyr.shapes, function(memo, shape, i) {
    var obj = MapShaper.exportGeoJSONGeometry(shape, arcs, type),
        str;
    if (useFeatures) {
      obj = {
        type: "Feature",
        properties: useProperties && properties[i] || null,
        geometry: obj
      };
    } else if (obj === null) {
      return memo; // null geometries not allowed in GeometryCollection, skip them
    }
    if (properties && opts.id_field) {
      obj.id = properties[i][opts.id_field] || null;
    }
    str = JSON.stringify(obj);
    return memo === "" ? str : memo + ",\n" + str;
  }, "");

  var output = useFeatures ? {
    type: "FeatureCollection",
    features: ["$"]
  } : {
    type: "GeometryCollection",
    geometries: ["$"]
  };

  if (opts.bbox) {
    var bounds = MapShaper.getLayerBounds(lyr, arcs);
    if (bounds.hasBounds()) {
      output.bbox = bounds.toArray();
    }
  }

  var parts = JSON.stringify(output).split('"$"');
  return parts[0] + objects + parts[1];
};

MapShaper.exportGeoJSONObject = function(lyr, arcs, opts) {
  return JSON.parse(MapShaper.exportGeoJSONString(lyr, arcs, opts));
};

// export GeoJSON or TopoJSON point geometry
GeoJSON.exportPointGeom = function(points, arcs) {
  var geom = null;
  if (points.length == 1) {
    geom = {
      type: "Point",
      coordinates: points[0]
    };
  } else if (points.length > 1) {
    geom = {
      type: "MultiPoint",
      coordinates: points
    };
  }
  return geom;
};

GeoJSON.exportLineGeom = function(ids, arcs) {
  var obj = MapShaper.exportPathData(ids, arcs, "polyline");
  if (obj.pointCount === 0) return null;
  var coords = obj.pathData.map(function(path) {
    return path.points;
  });
  return coords.length == 1 ? {
    type: "LineString",
    coordinates: coords[0]
  } : {
    type: "MultiLineString",
    coordinates: coords
  };
};

GeoJSON.exportPolygonGeom = function(ids, arcs) {
  var obj = MapShaper.exportPathData(ids, arcs, "polygon");
  if (obj.pointCount === 0) return null;
  var groups = MapShaper.groupPolygonRings(obj.pathData);
  var coords = groups.map(function(paths) {
    return paths.map(function(path) {
      return path.points;
    });
  });
  return coords.length == 1 ? {
    type: "Polygon",
    coordinates: coords[0]
  } : {
    type: "MultiPolygon",
    coordinates: coords
  };
};

MapShaper.exportGeoJSONGeometry = function(shape, arcs, type) {
  return shape ? GeoJSON.exporters[type](shape, arcs) : null;
};

GeoJSON.exporters = {
  polygon: GeoJSON.exportPolygonGeom,
  polyline: GeoJSON.exportLineGeom,
  point: GeoJSON.exportPointGeom
};



var TopoJSON = {};

// Iterate over all arrays of arc is in a geometry object
// @cb callback: function(ids)
// callback returns undefined or an array of replacement ids
//
TopoJSON.forEachPath = function forEachPath(obj, cb) {
  var iterators = {
        GeometryCollection: function(o) {o.geometries.forEach(eachGeom);},
        LineString: function(o) {
          var retn = cb(o.arcs);
          if (retn) o.arcs = retn;
        },
        MultiLineString: function(o) {eachMultiPath(o.arcs);},
        Polygon: function(o) {eachMultiPath(o.arcs);},
        MultiPolygon: function(o) {o.arcs.forEach(eachMultiPath);}
      };

  eachGeom(obj);

  function eachGeom(o) {
    if (o.type in iterators) {
      iterators[o.type](o);
    }
  }

  function eachMultiPath(arr) {
    var retn;
    for (var i=0; i<arr.length; i++) {
      retn = cb(arr[i]);
      if (retn) arr[i] = retn;
    }
  }
};

TopoJSON.forEachArc = function forEachArc(obj, cb) {
  TopoJSON.forEachPath(obj, function(ids) {
    var retn;
    for (var i=0; i<ids.length; i++) {
      retn = cb(ids[i]);
      if (Utils.isInteger(retn)) {
        ids[i] = retn;
      }
    }
  });
};





TopoJSON.decodeArcs = function(arcs, transform) {
  var mx = transform.scale[0],
      my = transform.scale[1],
      bx = transform.translate[0],
      by = transform.translate[1];

  Utils.forEach(arcs, function(arc) {
    var prevX = 0,
        prevY = 0,
        xy, x, y;
    for (var i=0, len=arc.length; i<len; i++) {
      xy = arc[i];
      x = xy[0] + prevX;
      y = xy[1] + prevY;
      xy[0] = x * mx + bx;
      xy[1] = y * my + by;
      prevX = x;
      prevY = y;
    }
  });
};

// TODO: consider removing dupes...
TopoJSON.roundCoords = function(arcs, precision) {
  var round = getRoundingFunction(precision),
      p;
  Utils.forEach(arcs, function(arc) {
    for (var i=0, len=arc.length; i<len; i++) {
      p = arc[i];
      p[0] = round(p[0]);
      p[1] = round(p[1]);
    }
  });
};

TopoJSON.importObject = function(obj, opts) {
  if (obj.type != 'GeometryCollection') {
    obj = {
      type: "GeometryCollection",
      geometries: [obj]
    };
  }
  return TopoJSON.importGeometryCollection(obj, opts);
};

TopoJSON.importGeometryCollection = function(obj, opts) {
  var importer = new TopoJSON.GeometryImporter(opts);
  Utils.forEach(obj.geometries, importer.addGeometry, importer);
  return importer.done();
};

//
//
TopoJSON.GeometryImporter = function(opts) {
  var idField = opts && opts.id_field || null,
      properties = [],
      shapes = [], // topological ids
      collectionType = null;

  this.addGeometry = function(geom) {
    var type = GeoJSON.translateGeoJSONType(geom.type),
        shapeId = shapes.length,
        rec;
    this.updateCollectionType(type);

    if (idField || geom.properties) {
      rec = geom.properties || {};
      if (idField) {
        rec[idField] = geom.id || null;
      }
      properties[shapeId] = rec;
    }

    var shape = null;
    if (type == 'point') {
      shape = this.importPointGeometry(geom);
    } else if (geom.type in TopoJSON.pathImporters) {
      shape = TopoJSON.pathImporters[geom.type](geom.arcs);
    } else {
      if (geom.type) {
        verbose("[TopoJSON] Unknown geometry type:", geom.type);
      }
      // null geometry -- ok
    }
    shapes.push(shape);
  };

  this.importPointGeometry = function(geom) {
    var shape = null;
    if (geom.type == 'Point') {
      shape = [geom.coordinates];
    } else if (geom.type == 'MultiPoint') {
      shape = geom.coordinates;
    } else {
      stop("Invalid TopoJSON point geometry:", geom);
    }
    return shape;
  };

  this.updateCollectionType = function(type) {
    if (!collectionType) {
      collectionType = type;
    } else if (type && collectionType != type) {
      collectionType = 'mixed';
    }
  };

  this.done = function() {
    var lyr = {
      shapes: shapes,
      geometry_type: collectionType
    };
    if (properties.length > 0) {
      lyr.data = new DataTable(properties);
    }
    // console.log(lyr.shapes)
    return lyr;
  };
};

TopoJSON.pathImporters = {
  LineString: function(arcs) {
    return [arcs];
  },
  MultiLineString: function(arcs) {
    return arcs;
  },
  Polygon: function(arcs) {
    return arcs;
  },
  MultiPolygon: function(arcs) {
    return Utils.reduce(arcs, function(memo, arr) {
      return memo ? memo.concat(arr) : arr;
    }, null);
  }
};




// remove arcs that are not referenced or have collapsed
// update ids of the remaining arcs
TopoJSON.pruneArcs = function(topology) {
  var arcs = topology.arcs;
  var retained = new Uint32Array(arcs.length);

  Utils.forEach(topology.objects, function(obj, name) {
    TopoJSON.forEachArc(obj, function(arcId) {
      // TODO: skip collapsed arcs
      if (arcId < 0) arcId = ~arcId;
      retained[arcId] = 1;
    });
  });

  var filterCount = Utils.reduce(retained, function(count, flag) {
    return count + flag;
  }, 0);

  if (filterCount < arcs.length) {
    // filter arcs and remap ids
    topology.arcs = Utils.reduce(arcs, function(arcs, arc, i) {
      if (arc && retained[i] === 1) { // dissolved-away arcs are set to null
        retained[i] = arcs.length;
        arcs.push(arc);
      } else {
        retained[i] = -1;
      }
      return arcs;
    }, []);

    // Re-index
    Utils.forEach(topology.objects, function(obj) {
      TopoJSON.reindexArcIds(obj, retained);
    });
  }
};

// @map is an array of replacement arc ids, indexed by original arc id
// @geom is a TopoJSON Geometry object (including GeometryCollections, Polygons, etc)
TopoJSON.reindexArcIds = function(geom, map) {
  TopoJSON.forEachArc(geom, function(id) {
    var rev = id < 0,
        idx = rev ? ~id : id,
        replacement = map[idx];
    if (replacement < 0) { // -1 in arc map indicates arc has been removed
      error("[reindexArcIds()] invalid arc id");
    }
    return rev ? ~replacement : replacement;
  });
};




// Divide a TopoJSON topology into multiple topologies, one for each
// named geometry object.
// Arcs are filtered and arc ids are reindexed as needed.
//
TopoJSON.splitTopology = function(topology) {
  var topologies = {};
  Utils.forEach(topology.objects, function(obj, name) {
    var split = {
      arcs: topology.arcs,
      // bbox: obj.bbox || null,
      objects: {}
    };
    split.objects[name] = obj;
    Opts.copyNewParams(split, topology);
    TopoJSON.pruneArcs(split);
    topologies[name] = split;
  });
  return topologies;
};

/*
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
*/




api.convertPolygonsToInnerLines = function(lyr, arcs) {
  if (lyr.geometry_type != 'polygon') {
    stop("[innerlines] Layer not polygon type");
  }
  var arcs2 = MapShaper.convertShapesToArcs(lyr.shapes, arcs.size(), 'inner'),
      lyr2 = MapShaper.convertArcsToLineLayer(arcs2);
  lyr2.name = lyr.name;
  return lyr2;
};

api.convertPolygonsToTypedLines = function(lyr, arcs, fields) {
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
      var dissolved = api.dissolvePolygons(lyr, arcs, {field: field}),
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
  var counts = new Uint8Array(arcCount),
      arcs = [],
      count;

  MapShaper.countArcsInShapes(shapes, counts);

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




// Dissolve arcs that can be merged without affecting topology of @layers
// (in-place)
MapShaper.dissolveArcs = function(layers, arcs) {
  layers = layers.filter(MapShaper.layerHasPaths);
  var test = MapShaper.getArcDissolveTest(layers, arcs);
  var groups = [];
  var totalPoints = 0;
  var arcIndex = new Int32Array(arcs.size()); // maps old arc ids to new ids
  var arcStatus = new Uint8Array(arcs.size());
  // arcStatus: 0 = unvisited, 1 = dropped, 2 = remapped, 3 = remapped + reversed

  layers.forEach(function(lyr) {
    // modify copies of the original shapes; original shapes should be unmodified
    // (need to test this)
    lyr.shapes = lyr.shapes.map(function(shape) {
      return MapShaper.editPaths(shape && shape.concat(), translatePath);
    });
  });
  MapShaper.dissolveArcCollection(arcs, groups, totalPoints);

  function translatePath(path) {
    var pointCount = 0;
    var path2 = [];
    var group, arcId, absId, arcLen, fw, arcId2;

    for (var i=0, n=path.length; i<n; i++) {
      arcId = path[i];
      absId = absArcId(arcId);
      fw = arcId === absId;

      if (arcs.arcIsDegenerate(arcId)) {
        // skip
      } else if (arcStatus[absId] === 0) {
        arcLen = arcs.getArcLength(arcId);

        if (group && test(path[i-1], arcId)) {
          if (arcLen > 0) {
            arcLen--; // shared endpoint not counted;
          }
          group.push(arcId);  // arc data is appended to previous arc
          arcStatus[absId] = 1; // arc is dropped from output
        } else {
          // new group (i.e. new dissolved arc)
          group = [arcId];
          arcIndex[absId] = groups.length;
          groups.push(group);
          arcStatus[absId] = fw ? 2 : 3; // 2: unchanged; 3: reversed
        }
        pointCount += arcLen;
      } else {
        group = null;
      }

      if (arcStatus[absId] > 1) {
        // arc is retained (and renumbered) in the dissolved path.
        arcId2 = arcIndex[absId];
        if (fw && arcStatus[absId] == 3 || !fw && arcStatus[absId] == 2) {
          arcId2 = ~arcId2;
        }
        path2.push(arcId2);
      }
    }
    totalPoints += pointCount;
    return path2;
  }
};

MapShaper.dissolveArcCollection = function(arcs, groups, len2) {
  var nn2 = new Uint32Array(groups.length),
      xx2 = new Float64Array(len2),
      yy2 = new Float64Array(len2),
      src = arcs.getVertexData(),
      zz2 = src.zz ? new Float64Array(len2) : null,
      offs = 0;

  groups.forEach(function(group, newId) {
    group.forEach(function(oldId, i) {
      extendDissolvedArc(oldId, newId);
    });
  });

  arcs.updateVertexData(nn2, xx2, yy2, zz2);

  function extendDissolvedArc(oldId, newId) {
    var absId = absArcId(oldId),
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
      if (zz2) MapShaper.copyElements(src.zz, i, zz2, offs, n, rev);
      nn2[newId] += n;
      offs += n;
    }
  }
};

MapShaper.getArcDissolveTest = function(layers, arcs) {
  var nodes = MapShaper.getFilteredNodeCollection(layers, arcs),
      count = 0,
      lastId;

  return function(id1, id2) {
    if (id1 == id2 || id1 == ~id2) return false; // error condition; throw error?
    count = 0;
    nodes.forEachConnectedArc(id1, countArc);
    return count == 1 && lastId == ~id2;
  };

  function countArc(arcId, i) {
    count++;
    lastId = arcId;
  }
};

MapShaper.getFilteredNodeCollection = function(layers, arcs) {
  var counts = MapShaper.countArcReferences(layers, arcs),
      test = function(arcId) {
        return counts[absArcId(arcId)] > 0;
      };
  return new NodeCollection(arcs, test);
};

MapShaper.countArcReferences = function(layers, arcs) {
  var counts = new Uint32Array(arcs.size());
  layers.forEach(function(lyr) {
    MapShaper.countArcsInShapes(lyr.shapes, counts);
  });
  return counts;
};




api.explodeFeatures = function(lyr, arcs, opts) {
  var properties = lyr.data ? lyr.data.getRecords() : null,
      explodedProperties = properties ? [] : null,
      explodedShapes = [],
      explodedLyr = Utils.extend({}, lyr);

  lyr.shapes.forEach(function(shp, shpId) {
    var exploded;
    if (!shp) {
      explodedShapes.push(null);
    } else {
      if (lyr.geometry_type == 'polygon' && shp.length > 1) {
        exploded = MapShaper.explodePolygon(shp, arcs);
      } else {
        exploded = MapShaper.explodeShape(shp);
      }
      Utils.merge(explodedShapes, exploded);
    }

    explodedLyr.shapes = explodedShapes;
    if (explodedProperties) {
      for (var i=0, n=exploded ? exploded.length : 1; i<n; i++) {
        explodedProperties.push(MapShaper.cloneProperties(properties[shpId]));
      }
    }
  });

  explodedLyr.shapes = explodedShapes;
  if (explodedProperties) {
    explodedLyr.data = new DataTable(explodedProperties);
  }
  return explodedLyr;
};

MapShaper.explodeShape = function(shp) {
  return shp.map(function(part) {
    return [part.concat()];
  });
};

MapShaper.explodePolygon = function(shape, arcs) {
  var paths = MapShaper.getPathMetadata(shape, arcs, "polygon");
  var groups = MapShaper.groupPolygonRings(paths);
  return groups.map(function(shape) {
    return shape.map(function(path) {
      return path.ids;
    });
  });
};

MapShaper.cloneProperties = function(obj) {
  var clone = {};
  for (var key in obj) {
    clone[key] = obj[key];
  }
  return clone;
};




TopoJSON.getPresimplifyFunction = function(width) {
  var quanta = 10000,  // enough resolution for pixel-level detail at 1000px width and 10x zoom
      k = quanta / width;
  return function(z) {
    // could substitute a rounding function with decimal precision
    return z === Infinity ? 0 : Math.ceil(z * k);
  };
};




TopoJSON.exportTopology = function(layers, arcData, opts) {
  var topology = {type: "Topology"},
      bounds = new Bounds(),
      filteredArcs,
      transform, invTransform;

  // some datasets may lack arcs -- e.g. only point layers
  if (arcData && arcData.size() > 0) {
    // get a copy of arc data (coords are modified for topojson export)
    filteredArcs = arcData.getFilteredCopy();

    if (opts.presimplify && !filteredArcs.getVertexData().zz) {
      // Calculate simplification thresholds if none exist
      MapShaper.simplifyPaths(filteredArcs, opts);
    }

    if (opts.no_quantization) {
      // no transform
    } else if (opts.topojson_precision) {
      transform = TopoJSON.getExportTransform(filteredArcs, null, opts.topojson_precision);
    } else if (opts.quantization > 0) {
      transform = TopoJSON.getExportTransform(filteredArcs, opts.quantization);
    } else if (opts.precision > 0) {
      transform = TopoJSON.getExportTransformFromPrecision(filteredArcs, opts.precision);
    } else {
      // default -- auto quantization
      transform = TopoJSON.getExportTransform(filteredArcs);
    }

    if (transform) {
      if (transform.isNull()) {
        // kludge: null transform likely due to collapsed shape(s)
        // using identity transform as a band-aid, need to rethink this.
        transform = new Transform();
      }
      invTransform = transform.invert();
      topology.transform = {
        scale: [invTransform.mx, invTransform.my],
        translate: [invTransform.bx, invTransform.by]
      };

      filteredArcs.applyTransform(transform, !!"round");
    }

    // dissolve arcs for more compact output
    // make shallow copy of layers, so arc ids of original layer.shapes
    // don't change
    layers = layers.map(function(lyr) {
      var shapes = lyr.shapes ? lyr.shapes.concat() : null;
      return utils.defaults({shapes: shapes}, lyr);
    });
    MapShaper.dissolveArcs(layers, filteredArcs);
  }

  topology.objects = layers.reduce(function(objects, lyr, i) {
    var name = lyr.name || "layer" + (i + 1),
        obj = TopoJSON.exportGeometryCollection(lyr.shapes, filteredArcs, lyr.geometry_type);

    bounds.mergeBounds(MapShaper.getLayerBounds(lyr, filteredArcs));
    if (lyr.data) {
      TopoJSON.exportProperties(obj.geometries, lyr.data.getRecords(), opts);
    }
    objects[name] = obj;
    return objects;
  }, {});

  // replaced by dissolveArcs() above
  // if (filteredArcs) {
    // TopoJSON.pruneArcs(topology);
  // }

  if (invTransform) {
    bounds.transform(invTransform);
  }

  if (opts.bbox && bounds.hasBounds()) {
    topology.bbox = bounds.toArray();
  }

  if (filteredArcs && filteredArcs.size() > 0) {
    topology.arcs = TopoJSON.exportArcsWithPresimplify(filteredArcs, opts.presimplify && bounds.width());
    if (transform) {
      TopoJSON.deltaEncodeArcs(topology.arcs);
    }
  } else {
    topology.arcs = []; // spec seems to require an array
  }

  return topology;
};

// Export arcs as arrays of [x, y] coords without delta encoding
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

// Export arcs as arrays of [x, y] coords without delta encoding
TopoJSON.exportArcsWithPresimplify = function(arcData, width) {
  var fromZ = width ? TopoJSON.getPresimplifyFunction(width) : null,
      arcs = [];

  arcData.forEach2(function(i, n, xx, yy, zz) {
    var arc = [],
        useZ = zz && fromZ,
        p;
    for (var j=i + n; i<j; i++) {
      p = [xx[i], yy[i]];
      if (useZ) {
        p.push(fromZ(zz[i]));
      }
      arc.push(p);
    }
    arcs.push(arc.length > 1 ? arc : null);
  });
  return arcs;
};

// Apply delta encoding in-place to an array of topojson arcs
TopoJSON.deltaEncodeArcs = function(arcs) {
  arcs.forEach(function(arr) {
    var ax, ay, bx, by, p;
    for (var i=0, n=arr.length; i<n; i++) {
      p = arr[i];
      bx = p[0];
      by = p[1];
      if (i > 0) {
        p[0] = bx - ax;
        p[1] = by - ay;
      }
      ax = bx;
      ay = by;
    }
  });
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
  var xy = arcData.getAvgSegment2(),
      k = parseFloat(precision) || 0.02;
  return [xy[0] * k, xy[1] * k];
};

TopoJSON.exportProperties = function(geometries, records, opts) {
  var idField = opts.id_field || null;
  geometries.forEach(function(geom, i) {
    var properties = records[i];
    if (properties) {
      if (!(opts.cut_table || opts.drop_table)) {
        geom.properties = properties;
      }
      if (idField && idField in properties) {
        geom.id = properties[idField];
      }
    }
  });
};

TopoJSON.exportGeometryCollection = function(shapes, coords, type) {
  var exporter = TopoJSON.exporters[type];
  var obj = {
      type: "GeometryCollection"
    };
  if (exporter) {
    obj.geometries = Utils.map(shapes, function(shape, i) {
      if (shape && shape.length > 0) {
        return exporter(shape, coords);
      }
      return {type: null};
    });
  } else {
    obj.geometries = [];
  }
  return obj;
};

TopoJSON.exportPolygonGeom = function(shape, coords) {
  var geom = {};
  shape = MapShaper.filterEmptyArcs(shape, coords);
  if (!shape || shape.length === 0) {
    geom.type = null;
  } else if (shape.length > 1) {
    geom.arcs = MapShaper.explodePolygon(shape, coords);
    if (geom.arcs.length == 1) {
      geom.arcs = geom.arcs[0];
      geom.type = "Polygon";
    } else {
      geom.type = "MultiPolygon";
    }
  } else {
    geom.arcs = shape;
    geom.type = "Polygon";
  }
  return geom;
};

TopoJSON.exportLineGeom = function(shape, coords) {
  var geom = {};
  shape = MapShaper.filterEmptyArcs(shape, coords);
  if (!shape || shape.length === 0) {
    geom.type = null;
  } else if (shape.length == 1) {
    geom.type = "LineString";
    geom.arcs = shape[0];
  } else {
    geom.type = "MultiLineString";
    geom.arcs = shape;
  }
  return geom;
};

TopoJSON.exporters = {
  polygon: TopoJSON.exportPolygonGeom,
  polyline: TopoJSON.exportLineGeom,
  point: GeoJSON.exportPointGeom
};




MapShaper.topojson = TopoJSON;

// Convert a TopoJSON topology into mapshaper's internal format
// Side-effect: data in topology is modified
//
MapShaper.importTopoJSON = function(topology, opts) {
  var layers = [],
      arcs;

  if (Utils.isString(topology)) {
    topology = JSON.parse(topology);
  }

  if (topology.arcs && topology.arcs.length > 0) {
    // TODO: apply transform to ArcCollection, not input arcs
    if (topology.transform) {
      TopoJSON.decodeArcs(topology.arcs, topology.transform);
    }

    if (opts && opts.precision) {
      TopoJSON.roundCoords(topology.arcs, opts.precision);
    }

    arcs = new ArcCollection(topology.arcs);
  }

  Utils.forEach(topology.objects, function(object, name) {
    var lyr = TopoJSON.importObject(object, opts);

    if (MapShaper.layerHasPaths(lyr)) {
      MapShaper.cleanShapes(lyr.shapes, arcs, lyr.geometry_type);
    }

    lyr.name = name;
    layers.push(lyr);
  });

  var dataset = {
    layers: layers,
    arcs: arcs,
    info: {}
  };

  return dataset;
};

MapShaper.exportTopoJSON = function(dataset, opts) {
  var topology = TopoJSON.exportTopology(dataset.layers, dataset.arcs, opts);
  var filename = "output.json", // default
  name;
  if (opts.output_file) {
    filename = opts.output_file;
  } else if (dataset.info && dataset.info.input_files) {
    name = MapShaper.getCommonFileBase(dataset.info.input_files);
    if (name) filename = name + ".json";
  }
  // TODO: consider supporting this option again
  /*
  if (opts.topojson_divide) {
    topologies = TopoJSON.splitTopology(topology);
    files = Utils.map(topologies, function(topo, name) {
      return {
        content: JSON.stringify(topo),
        name: name
      };
    });
  }
  */
  return [{
    content: JSON.stringify(topology),
    filename: filename
  }];
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

ShpType.isPolygonType = function(t) {
  return t == 5 || t == 15 || t == 25;
};

ShpType.isPolylineType = function(t) {
  return t == 3 || t == 13 || t == 23;
};

ShpType.isMultiPartType = function(t) {
  return ShpType.isPolygonType(t) || ShpType.isPolylineType(t);
};

ShpType.isMultiPointType = function(t) {
  return t == 8 || t == 18 || t == 28;
};

ShpType.isZType = function(t) {
  return Utils.contains([11,13,15,18], t);
};

ShpType.isMType = function(t) {
  return ShpType.isZType(t) || Utils.contains([21,23,25,28], t);
};

ShpType.hasBounds = function(t) {
  return ShpType.isMultiPartType(t) || ShpType.isMultiPointType(t);
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
//      var coords = s.readCoords(); // [[x,y,x,y,...], ...] Array of parts
//      var zdata = s.readZ();  // [z,z,...]
//      var mdata = s.readM();  // [m,m,...] or null
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
  if (this instanceof ShpReader === false) {
    return new ShpReader(src);
  }

  var file = Utils.isString(src) ? new FileBytes(src) : new BufferBytes(src);
  var header = parseHeader(file.readBytes(100, 0));
  var RecordClass = ShpReader.getRecordClass(header.type);
  var recordOffs = 100;

  this.header = function() {
    return header;
  };

  this.reset = function() {
    RecordClass = this.getRecordClass();
  };

  // return data as nested arrays of shapes > parts > points > [x,y(,z,m)]
  this.read = function() {
    var shapes = [];
    this.forEachShape(function(shp) {
      shapes.push(shp.isNull ? null : shp.read(format));
    });
    return shapes;
  };

  // Callback interface: for each record in a .shp file, pass a
  //   record object to a callback function
  //
  this.forEachShape = function(callback) {
    var shape = this.nextShape();
    while (shape) {
      callback(shape);
      shape = this.nextShape();
    }
  };

  // Iterator interface for reading shape records
  this.nextShape = function() {
    var fileSize = file.size(),
        recordSize,
        shape = null,
        bin;

    if (recordOffs + 8 < fileSize) {
      bin = file.readBytes(8, recordOffs);
      // byteLen is bytes in content section + 8 header bytes
      recordSize = bin.bigEndian().skipBytes(4).readUint32() * 2 + 8;
      // todo: what if size is 0
      if (recordOffs + recordSize <= fileSize && recordSize >= 12) {
        bin = file.readBytes(recordSize, recordOffs);
        recordOffs += recordSize;
        shape = new RecordClass(bin);
      } else {
        trace("Unaccounted bytes in .shp file -- possible corruption");
      }
    }

    if (shape === null) {
      file.close();
      recordOffs = 100;
    }

    return shape;
  };

  function finishReading() {

  }

  function parseHeader(bin) {
    var header = {
      signature: bin.bigEndian().readUint32(),
      byteLength: bin.skipBytes(20).readUint32() * 2,
      version: bin.littleEndian().readUint32(),
      type: bin.readUint32(),
      bounds: bin.readFloat64Array(4), // xmin, ymin, xmax, ymax
      zbounds: bin.readFloat64Array(2),
      mbounds: bin.readFloat64Array(2)
    };

    if (header.signature != 9994)
      error("Not a valid .shp file");

    var supportedTypes = [1,3,5,8,11,13,15,18,21,23,25,28];
    if (!Utils.contains(supportedTypes, header.type))
      error("Unsupported .shp type:", header.type);

    if (header.byteLength != file.size())
      error("File size doesn't match size in header");

    return header;
  }
}

ShpReader.prototype.type = function() {
  return this.header().type;
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
//   read(), readPoints() (all types)
//   readBounds(), readCoords()  (all but single point types)
//   readPartSizes() (polygon and polyline types)
//   readZBounds(), readZ() (Z types except POINTZ)
//   readMBounds(), readM(), hasM() (M and Z types, except POINT[MZ])
//
ShpReader.getRecordClass = function(type) {
  var hasBounds = ShpType.hasBounds(type),
      hasParts = ShpType.isMultiPartType(type),
      hasZ = ShpType.isZType(type),
      hasM = ShpType.isMType(type),
      singlePoint = !hasBounds,
      mzRangeBytes = singlePoint ? 0 : 16;

  // @bin is a BinArray set to the first byte of a shape record
  //
  var constructor = function ShapeRecord(bin) {
    var pos = bin.position();
    this.id = bin.bigEndian().readUint32();
    this.byteLength = bin.readUint32() * 2 + 8; // bytes in content section + 8 header bytes
    this.type = bin.littleEndian().readUint32();
    this.isNull = this.type === 0;
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
    };
  };

  // functions for all types
  var proto = {
    // return offset of [x, y] point data in the record
    _xypos: function() {
      var offs = 12; // skip header & record type
      if (!singlePoint) offs += 4; // skip point count
      if (hasBounds) offs += 32;
      if (hasParts) offs += 4 * this.partCount + 4; // skip part count & index
      return offs;
    },

    readCoords: function() {
      if (this.pointCount === 0) return null;
      var partSizes = this.readPartSizes(),
          xy = this._data().skipBytes(this._xypos());

      return partSizes.map(function(pointCount) {
        return xy.readFloat64Array(pointCount * 2);
      });
    },

    readXY: function() {
      if (this.pointCount === 0) return null;
      return this._data().skipBytes(this._xypos()).readFloat64Array(this.pointCount * 2);
    },

    readPoints: function() {
      var xy = this.readXY(),
          zz = hasZ ? this.readZ() : null,
          mm = hasM && this.hasM() ? this.readM() : null,
          points = [], p;

      for (var i=0, n=xy.length / 2; i<n; i++) {
        p = [xy[i*2], xy[i*2+1]];
        if (zz) p.push(zz[i]);
        if (mm) p.push(mm[i]);
        points.push(p);
      }
      return points;
    },

    read: function() {
      return this.readPoints();
    },

    readPartSizes: function() {
      if (this.pointCount === 0) return null;
      if (this.partCount == 1) return [this.pointCount];
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
    }
  };

  var singlePointProto = {
    /*
    hasM: function() {
      return this.byteLength == 12 + (hasZ ? 30 : 24); // size with M
    },
    */

    read: function() {
      var n = 2;
      if (hasZ) n++;
      if (this.hasM()) n++;
      return this._data().skipBytes(12).readFloat64Array(n);
    }
  };

  var multiCoordProto = {
    readBounds: function() {
      return this._data().skipBytes(12).readFloat64Array(4);
    },

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
      if (hasZ) {
        pos += this.pointCount * 8 + mzRangeBytes;
      }
      return pos;
    },

    readMBounds: function() {
      return this.hasM() ? this._data().skipBytes(this._mpos()).readFloat64Array(2) : null;
    },

    // TODO: group into parts, like readCoords()
    readM: function() {
      return this.hasM() ? this._data().skipBytes(this._mpos() + mzRangeBytes).readFloat64Array(this.pointCount) : null;
    },

    // Test if this record contains M data
    // (according to the Shapefile spec, M data is optional in a record)
    //
    hasM: function() {
      var bytesWithoutM = this._mpos(),
          bytesWithM = bytesWithoutM + this.pointCount * 8 + mzRangeBytes;
      if (this.byteLength == bytesWithoutM) {
        return false;
      } else if (this.byteLength == bytesWithM) {
        return true;
      } else {
        error("#hasM() Counting error");
      }
    }
  };

  var zProto = {
    _zpos: function() {
      return this._xypos() + this.pointCount * 16;
    },

    readZBounds: function() {
      return this._data().skipBytes(this._zpos()).readFloat64Array(2);
    },

    // TODO: group into parts, like readCoords()
    readZ: function() {
      return this._data().skipBytes(this._zpos() + mzRangeBytes).readFloat64Array(this.pointCount);
    }
  };

  if (singlePoint) {
    Utils.extend(proto, singlePointProto);
  } else {
    Utils.extend(proto, multiCoordProto);
  }
  if (hasZ) Utils.extend(proto, zProto);
  if (hasM) Utils.extend(proto, mProto);

  constructor.prototype = proto;
  proto.constructor = constructor;
  return constructor;
};

function BufferBytes(buf) {
  var bin = new BinArray(buf),
      bufSize = bin.size();
  this.readBytes = function(len, offset) {
    if (bufSize < offset + len) error("Out-of-range error");
    bin.position(offset);
    return bin;
  };

  this.size = function() {
    return bufSize;
  };

  this.close = function() {};
}

function FileBytes(path) {
  var DEFAULT_BUF_SIZE = 0xffffff, // 16 MB
      fs = require('fs'),
      fileSize = Node.fileSize(path),
      cacheOffs = 0,
      cache, fd;

  this.readBytes = function(len, start) {
    if (fileSize < start + len) error("Out-of-range error");
    if (!cache || start < cacheOffs || start + len > cacheOffs + cache.size()) {
      updateCache(len, start);
    }
    cache.position(start - cacheOffs);
    return cache;
  };

  this.size = function() {
    return fileSize;
  };

  this.close = function() {
    if (fd) {
      fs.closeSync(fd);
      fd = null;
      cache = null;
      cacheOffs = 0;
    }
  };

  function updateCache(len, start) {
    var headroom = fileSize - start,
        bufSize = Math.min(headroom, Math.max(DEFAULT_BUF_SIZE, len)),
        buf = new Buffer(bufSize),
        bytesRead;
    if (!fd) fd = fs.openSync(path, 'r');
    bytesRead = fs.readSync(fd, buf, 0, bufSize, start);
    if (bytesRead < bufSize) error("Error reading file");
    cacheOffs = start;
    cache = new BinArray(buf);
  }
}




MapShaper.translateShapefileType = function(shpType) {
  if (Utils.contains([ShpType.POLYGON, ShpType.POLYGONM, ShpType.POLYGONZ], shpType)) {
    return 'polygon';
  } else if (Utils.contains([ShpType.POLYLINE, ShpType.POLYLINEM, ShpType.POLYLINEZ], shpType)) {
    return 'polyline';
  } else if (Utils.contains([ShpType.POINT, ShpType.POINTM, ShpType.POINTZ,
      ShpType.MULTIPOINT, ShpType.MULTIPOINTM, ShpType.MULTIPOINTZ], shpType)) {
    return 'point';
  }
  return null;
};

MapShaper.getShapefileType = function(type) {
  if (type === null) return ShpType.NULL;
  return {
    polygon: ShpType.POLYGON,
    polyline: ShpType.POLYLINE,
    point: ShpType.MULTIPOINT  // TODO: use POINT when possible
  }[type] || null;
};

// Read Shapefile data from an ArrayBuffer or Buffer
// Build topology
//
MapShaper.importShp = function(src, opts) {
  var reader = new ShpReader(src);
  var shpType = reader.type();
  var type = MapShaper.translateShapefileType(shpType);
  if (!type) {
    stop("Unsupported Shapefile type:", shpType);
  }
  if (ShpType.isZType(shpType)) {
    verbose("Warning: Z data is being removed.");
  } else if (ShpType.isMType(shpType)) {
    verbose("Warning: M data is being removed.");
  }

  var pathPoints = type == 'point' ? 0 : reader.getCounts().pointCount;
  var importer = new PathImporter(pathPoints, opts);

  // TODO: test cases: null shape; non-null shape with no valid parts
  reader.forEachShape(function(shp) {
    importer.startShape();
    if (shp.isNull) return;
    if (type == 'point') {
      importer.importPoints(shp.readPoints());
    } else {
      var xy = shp.readXY(),
          parts = shp.readPartSizes(),
          start = 0,
          len;
      for (var i=0; i<parts.length; i++) {
        len = parts[i] * 2;
        importer.importPathFromFlatArray(xy, type, len, start);
        start += len;
      }
    }
  });

  return importer.done();
};

// Convert topological data to buffers containing .shp and .shx file data
MapShaper.exportShapefile = function(dataset, opts) {
  var files = [];
  dataset.layers.forEach(function(layer) {
    var data = layer.data,
        name = layer.name,
        obj, dbf;
    T.start();
    obj = MapShaper.exportShpAndShx(layer, dataset.arcs);
    T.stop("Export .shp file");
    T.start();
    data = layer.data;
    // create empty data table if missing a table or table is being cut out
    if (!data || opts.cut_table || opts.drop_table) {
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
        filename: name + ".shp"
      }, {
        content: obj.shx,
        filename: name + ".shx"
      }, {
        content: dbf,
        filename: name + ".dbf"
      });

    // Copy prj file, if Shapefile import and running in Node.
    if (Env.inNode && dataset.info.input_files && dataset.info.input_format == 'shapefile') {
      var prjFile = cli.replaceFileExtension(dataset.info.input_files[0], 'prj');
      if (cli.isFile(prjFile)) {
        files.push({
          content: cli.readFile(prjFile, 'utf-8'),
          filename: name + ".prj"
        });
      }
    }
  });
  return files;
};

MapShaper.exportShpAndShx = function(layer, arcData) {
  var geomType = layer.geometry_type;

  var shpType = MapShaper.getShapefileType(geomType);
  if (shpType === null)
    error("[exportShpAndShx()] Unable to export geometry type:", geomType);

  var fileBytes = 100;
  var bounds = new Bounds();
  var shapeBuffers = layer.shapes.map(function(shape, i) {
    var pathData = MapShaper.exportPathData(shape, arcData, geomType);
    var rec = MapShaper.exportShpRecord(pathData, i+1, shpType);
    fileBytes += rec.buffer.byteLength;
    if (rec.bounds) bounds.mergeBounds(rec.bounds);
    return rec.buffer;
  });

  // write .shp header section
  var shpBin = new BinArray(fileBytes, false)
    .writeInt32(9994)
    .skipBytes(5 * 4)
    .writeInt32(fileBytes / 2)
    .littleEndian()
    .writeInt32(1000)
    .writeInt32(shpType);

  if (bounds.hasBounds()) {
    shpBin.writeFloat64(bounds.xmin || 0) // using 0s as empty value
      .writeFloat64(bounds.ymin || 0)
      .writeFloat64(bounds.xmax || 0)
      .writeFloat64(bounds.ymax || 0);
  } else {
    // no bounds -- assume no shapes or all null shapes -- using 0s as bbox
    shpBin.skipBytes(4 * 8);
  }

  shpBin.skipBytes(4 * 8); // skip Z & M type bounding boxes;

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
MapShaper.exportShpRecord = function(data, id, shpType) {
  var bounds = null,
      bin = null;
  if (data.pointCount > 0) {
    var multiPart = ShpType.isMultiPartType(shpType),
        partIndexIdx = 52,
        pointsIdx = multiPart ? partIndexIdx + 4 * data.pathCount : 48,
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
      .writeFloat64(bounds.ymax);

    if (multiPart) {
      bin.writeInt32(data.pathCount);
    } else {
      if (data.pathData.length > 1) {
        error("[exportShpRecord()] Tried to export multiple paths as type:", shpType);
      }
    }

    bin.writeInt32(data.pointCount);

    data.pathData.forEach(function(path, i) {
      if (multiPart) {
        bin.position(partIndexIdx + i * 4).writeInt32(pointCount);
      }
      bin.position(pointsIdx + pointCount * 16);

      var points = path.points;
      for (var j=0, len=points.length; j<len; j++) {
        bin.writeFloat64(points[j][0]);
        bin.writeFloat64(points[j][1]);
      }
      pointCount += j;
    });
    if (data.pointCount != pointCount)
      error("Shp record point count mismatch; pointCount:",
          pointCount, "data.pointCount:", data.pointCount);

  } else {
    // no data -- export null record
    bin = new BinArray(12, false)
      .writeInt32(id)
      .writeInt32(2)
      .littleEndian()
      .writeInt32(0);
  }

  return {bounds: bounds, buffer: bin.buffer()};
};




api.dissolvePolygons2 = function(lyr, dataset, opts) {
  MapShaper.requirePolygonLayer(lyr, "[dissolve] only supports polygon type layers");
  var nodes = MapShaper.divideArcs(dataset);
  return MapShaper.dissolvePolygonLayer(lyr, nodes, opts);
};

MapShaper.dissolvePolygonLayer = function(lyr, nodes, opts) {
  opts = opts || {};
  var getGroupId = MapShaper.getCategoryClassifier(opts.field, lyr.data);
  var lyr2 = {data: null};
  var groups = lyr.shapes.reduce(function(groups, shape, i) {
    var i2 = getGroupId(i);
    if (i2 in groups === false) {
      groups[i2] = [];
    }
    MapShaper.extendShape(groups[i2], shape);
    return groups;
  }, []);

  T.start();
  var dissolve = MapShaper.getPolygonDissolver(nodes);
  lyr2.shapes = groups.map(function(group) {
    return dissolve(group);
  });
  T.stop('dissolve2');

  if (lyr.data) {
    lyr2.data = new DataTable(MapShaper.calcDissolveData(lyr.data.getRecords(), getGroupId, opts));
  }
  return Utils.defaults(lyr2, lyr);
};

MapShaper.concatShapes = function(shapes) {
  return shapes.reduce(function(memo, shape) {
    MapShaper.extendShape(memo, shape);
    return memo;
  }, []);
};

MapShaper.extendShape = function(dest, src) {
  if (src) {
    for (var i=0, n=src.length; i<n; i++) {
      dest.push(src[i]);
    }
  }
};

MapShaper.getPolygonDissolver = function(nodes) {
  var flags = new Uint8Array(nodes.arcs.size());
  var divide = MapShaper.getHoleDivider(nodes);
  var flatten = MapShaper.getRingIntersector(nodes, 'flatten', flags);
  var dissolve = MapShaper.getRingIntersector(nodes, 'dissolve', flags);

  return function(shp) {
    if (!shp) return null;
    var cw = [],
        ccw = [];

    divide(shp, cw, ccw);
    cw = flatten(cw);
    ccw.forEach(MapShaper.reversePath);
    ccw = flatten(ccw);
    ccw.forEach(MapShaper.reversePath);

    var shp2 = MapShaper.appendHolestoRings(cw, ccw);
    var dissolved = dissolve(shp2);
    return dissolved.length > 0 ? dissolved : null;
  };
};

// TODO: to prevent invalid holes,
// could erase the holes from the space-enclosing rings.
MapShaper.appendHolestoRings = function(cw, ccw) {
  for (var i=0, n=ccw.length; i<n; i++) {
    cw.push(ccw[i]);
  }
  return cw;
};




MapShaper.setCoordinatePrecision = function(dataset, precision) {
  var round = geom.getRoundingFunction(precision),
      dissolvePolygon;

  if (dataset.arcs) {
    // need to discard z data if present (it doesn't survive cleaning)
    dataset.arcs.flatten();
    // round coords
    dataset.arcs.applyTransform(null, round);

    var nodes = MapShaper.divideArcs(dataset);
    dissolvePolygon = MapShaper.getPolygonDissolver(nodes);
  }

  dataset.layers.forEach(function(lyr) {
    if (MapShaper.layerHasPoints(lyr)) {
      MapShaper.roundPoints(lyr, round);
    } else if (lyr.geometry_type == 'polygon' && dissolvePolygon) {
      // clean each polygon -- use dissolve function remove spikes
      // TODO implement proper clean/repair function
      lyr.shapes = lyr.shapes.map(dissolvePolygon);
    }
  });
};

MapShaper.roundPoints = function(lyr, round) {
  MapShaper.forEachPoint(lyr, function(p) {
    p[0] = round(p[0]);
    p[1] = round(p[1]);
  });
};




// Return an array of objects with "filename" "filebase" "extension" and
// "content" attributes.
//
MapShaper.exportFileContent = function(dataset, opts) {
  var exporter = MapShaper.exporters[opts.format],
      layers = dataset.layers,
      files = [];

  if (!opts.format) {
    error("[o] Missing output format");
  } else if (!exporter) {
    error("[o] Unknown export format:", opts.format);
  }

  if (opts.output_file && opts.format != 'topojson') {
    opts.output_extension = utils.getFileExtension(opts.output_file);
    layers.forEach(function(lyr) {
      lyr.name = utils.getFileBase(opts.output_file);
    });
  }

  if (opts.precision) {
    MapShaper.setCoordinatePrecision(dataset, opts.precision);
  }

  MapShaper.validateLayerData(layers);
  MapShaper.assignUniqueLayerNames(layers);

  if (opts.cut_table) {
    files = MapShaper.exportDataTables(layers, opts).concat(files);
  }

  files = exporter(dataset, opts).concat(files);

  // If rounding or quantization are applied during export, bounds may
  // change somewhat... consider adding a bounds property to each layer during
  // export when appropriate.
  if (opts.bbox_index) {
    files.push(MapShaper.createIndexFile(dataset));
  }

  MapShaper.validateFileNames(files);
  return files;
};

MapShaper.exporters = {
  geojson: MapShaper.exportGeoJSON,
  topojson: MapShaper.exportTopoJSON,
  shapefile: MapShaper.exportShapefile
};

// Generate json file with bounding boxes and names of each export layer
// TODO: consider making this a command, or at least make format settable
//
MapShaper.createIndexFile = function(dataset) {
  var index = Utils.map(dataset.layers, function(lyr) {
    var bounds = MapShaper.getLayerBounds(lyr, dataset.arcs);
    return {
      bbox: bounds.toArray(),
      name: lyr.name
    };
  });

  return {
    content: JSON.stringify(index),
    filename: "bbox-index.json"
  };
};

MapShaper.validateLayerData = function(layers) {
  Utils.forEach(layers, function(lyr) {
    if (!Utils.isArray(lyr.shapes)) {
      error ("[export] A layer is missing shape data");
    }
    // allowing null-type layers
    if (lyr.geometry_type === null) {
      if (Utils.some(lyr.shapes, function(o) {
        return !!o;
      })) {
        error("[export] A layer contains shape records and a null geometry type");
      }
    } else if (!Utils.contains(['polygon', 'polyline', 'point'], lyr.geometry_type)) {
      error ("[export] A layer has an invalid geometry type:", lyr.geometry_type);
    }
  });
};

MapShaper.validateFileNames = function(files) {
  var index = {};
  files.forEach(function(file, i) {
    var filename = file.filename;
    if (!filename) error("[o] Missing a filename for file" + i);
    if (filename in index) error("[o] Duplicate filename", filename);
    index[filename] = true;
  });
};

MapShaper.assignUniqueLayerNames = function(layers) {
  var names = layers.map(function(lyr) {
    return lyr.name || "layer";
  });
  var uniqueNames = MapShaper.uniqifyNames(names);
  layers.forEach(function(lyr, i) {
    lyr.name = uniqueNames[i];
  });
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
      tables.push({
        content: lyr.data.exportAsJSON(), // TODO: other formats
        filename: (lyr.name ? lyr.name + '-' : '') + 'table.json'
      });
    }
  });
  return tables;
};

MapShaper.uniqifyNames = function(names) {

  var counts = Utils.getValueCounts(names),
      index = {},
      suffix;
  return names.map(function(name) {
    var count = counts[name],
        i = 1;
    if (count > 1 || name in index) {
      do {
        suffix = String(i);
        if (/[0-9]$/.test(name)) {
          suffix = '-' + suffix;
        }
        i++;
      } while ((name + suffix) in index);
      name = name + suffix;
    }
    index[name] = true;
    return name;
  });
};




// Combine detection and repair for cli
//
api.findAndRepairIntersections = function(arcs) {
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
// @arcs ArcCollection object
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
    var i = MapShaper.findNextRemovableVertex(zz, zlim, obj.a[0], obj.a[1]),
        j = MapShaper.findNextRemovableVertex(zz, zlim, obj.b[0], obj.b[1]),
        zi = i == -1 ? Infinity : zz[i],
        zj = j == -1 ? Infinity : zz[j],
        tmp;

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
      tmp = obj.a;
      obj.a = obj.b;
      obj.b = tmp;
      // obj.ids = [ids[2], ids[3], ids[0], ids[1]];
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
        verbose("Caught an infinite loop at intersection:", intersection);
        return 0;
      }
    }

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
    var start = obj.a[0],
        end = obj.a[1],
        middle = obj.newId;
    if (!(start < middle && middle < end || start > middle && middle > end)) {
      error("[splitSegment()] Indexing error --", obj);
    }
    return [
      getSegmentPair(start, middle, obj.b[0], obj.b[1]),
      getSegmentPair(middle, end, obj.b[0], obj.b[1])
    ];
  }

  function getSegmentPair(s1p1, s1p2, s2p1, s2p2) {
    return {
      a: xx[s1p1] > xx[s1p2] ? [s1p2, s1p1] : [s1p1, s1p2],
      b: [s2p1, s2p2]
    };
  }

  function getIntersectionCandidates(obj) {
    var segments = [];
    addSegmentVertices(segments, obj.a);
    addSegmentVertices(segments, obj.b);
    return segments;
  }

  // Gat all segments defined by two endpoints and the vertices between
  // them that are at or above the current simplification threshold.
  // @ids Accumulator array
  function addSegmentVertices(ids, seg) {
    var start, end, prev;
    if (seg[0] <= seg[1]) {
      start = seg[0];
      end = seg[1];
    } else {
      start = seg[1];
      end = seg[0];
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




api.keepEveryPolygon =
MapShaper.keepEveryPolygon = function(arcData, layers) {
  T.start();
  Utils.forEach(layers, function(lyr) {
    if (lyr.geometry_type == 'polygon') {
      MapShaper.protectLayerShapes(arcData, lyr.shapes);
    }
  });
  T.stop("Protect shapes");
};

MapShaper.protectLayerShapes = function(arcData, shapes) {
  Utils.forEach(shapes, function(shape) {
    MapShaper.protectShape(arcData, shape);
  });
};

// Protect a single shape from complete removal by simplification
// @arcData an ArcCollection
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
    verbose("[protectShape()] Invalid shape:", shape);
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
  if (added < 2) verbose("[protectIslandRing()] Failed on ring:", ring);
};

MapShaper.protectMultiRing = function(arcData, ring) {
  var zlim = arcData.getRetainedInterval(),
      minArea = 0, // 0.00000001, // Need to handle rounding error?
      iter, area, added;
  arcData.setRetainedInterval(Infinity);
  iter = arcData.getShapeIter(ring);
  area = geom.getPathArea(iter);
  while (area <= minArea) {
    added = MapShaper.lockMaxThreshold(arcData, ring);
    if (added === 0) {
      verbose("[protectMultiRing()] Failed on ring:", ring);
      break;
    }
    iter.reset();
    area = geom.getPathArea(iter);
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
    return MapShaper.replaceInArray(raw.zz, targZ, Infinity, start, end);
  }
  return 0;
};

MapShaper.replaceInArray = function(zz, value, replacement, start, end) {
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
MapShaper.importFileContent = function(content, fileType, opts) {
  var dataset, fileFmt;
  opts = opts || {};
  T.start();
  if (fileType == 'shp') {
    dataset = MapShaper.importShp(content, opts);
    fileFmt = 'shapefile';
  } else if (fileType == 'json') {
    var jsonObj = JSON.parse(content);
    if (jsonObj.type == 'Topology') {
      dataset = MapShaper.importTopoJSON(jsonObj, opts);
      fileFmt = 'topojson';
    } else if ('type' in jsonObj) {
      dataset = MapShaper.importGeoJSON(jsonObj, opts);
      fileFmt = 'geojson';
    } else if (Utils.isArray(jsonObj)) {
      dataset = {
        layers: [{
          geometry_type: null,
          data: new DataTable(jsonObj)
        }]
      };
      fileFmt = 'json';
    } else {
      stop("Unrecognized JSON format");
    }
  } else if (fileType == 'text') {
    dataset = MapShaper.importDelimitedRecords();
  } else {
    stop("Unsupported file type:", fileType);
  }
  T.stop("Import " + fileFmt);

  // topology; TODO -- consider moving this
  if ((fileFmt == 'shapefile' || fileFmt == 'geojson') && !opts.no_topology) {
    T.start();
    api.buildTopology(dataset);
    T.stop("Process topology");
  }

  if (dataset.layers.length == 1) {
    MapShaper.setLayerName(dataset.layers[0], opts.files ? opts.files[0] : "layer1");
  }
  dataset.info.input_files = opts.files;
  dataset.info.input_format = fileFmt;
  return dataset;
};


MapShaper.importJSONRecords = function(arr, opts) {
  return {
    layers: [{
      name: "",
      data: new DataTable(arr),
      geometry_type: null
    }]
  };
};


// initialize layer name using filename
MapShaper.setLayerName = function(lyr, path) {
  if (!lyr.name) {
    lyr.name = utils.getFileBase(path);
  }
};




MapShaper.importDataTable = function(fname, opts) {
  var table;
  if (utils.endsWith(fname.toLowerCase(), '.dbf')) {
    table = MapShaper.importDbfTable(fname, opts.encoding);
  } else {
    // assume delimited text file
    // unsupported file types can be detected earlier, during
    // option validation, using filename extensions
    table = MapShaper.importDelimTable(fname);
  }
  return table;
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
  if (!Node.fileExists(dbfName)) {
    stop("File not found:", dbfName);
  }
  return new ShapefileTable(Node.readFile(dbfName), encoding);
};

MapShaper.importDelimTable = function(file) {
  var records, str;
  try {
    str = Node.readFile(file, 'utf-8');
    records = MapShaper.parseDelimString(str);
    if (!records || records.length === 0) {
      throw new Error();
    }
  } catch(e) {
    stop("Unable to", (str ? "read" : "parse"), "file:", file);
  }
  return new DataTable(records);
};

MapShaper.parseDelimString = function(str) {
  var dsv = require("./lib/d3/d3-dsv.js").dsv,
      delim = MapShaper.guessDelimiter(str),
      records = dsv(delim).parse(str);
  return records;
};

//
MapShaper.guessDelimiter = function(content) {
  var delimiters = ['|', '\t', ','];
  return Utils.find(delimiters, function(delim) {
    var rxp = MapShaper.getDelimiterRxp(delim);
    return rxp.test(content);
  }) || ',';
};

// Get RegExp to test for a delimiter before first line break of a string
// Assumes that first line contains field headers and that header names do not include delim char
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
      if (Utils.isString(val) && utils.stringIsNumeric(val)) {
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

utils.stringIsNumeric = function(str) {
  str = utils.cleanNumber(str);
  // Number() accepts empty strings
  // parseFloat() accepts a number followed by other content
  // Using both for stricter check. TODO consider using regex
  return !isNaN(parseFloat(str)) && !isNaN(Number(str));
};

utils.cleanNumber = function(str) {
  return str.replace(/,/g, '');
};

utils.parseNumber = function(str) {
  return Number(utils.cleanNumber(str));
};

MapShaper.convertRecordTypes = function(records, typeIndex) {
  var typedFields = Utils.keys(typeIndex),
      converters = {
        'string': String,
        'number': utils.parseNumber
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




api.importFile = function(path, opts) {
  var fileType = MapShaper.guessFileType(path),
      content, dataset;

  cli.checkFileExists(path);

  opts = opts || {};
  if (!opts.files && path != "/dev/stdin") {
    opts.files = [path];
  }

  if (fileType == 'shp') {
    content = path; // pass path to shp reader to read in chunks
  } else {
    content = MapShaper.readGeometryFile(path, fileType);
  }

  dataset = MapShaper.importFileContent(content, fileType, opts);
  if (fileType == 'shp' && dataset.layers.length == 1) {
    var lyr0 = dataset.layers[0],
        data = MapShaper.importDbfTable(path, opts.encoding);
    if (data) {
      if (lyr0.shapes.length != data.size()) {
        stop(Utils.format("[%s] Different record counts in .shp and .dbf (%d and %d)",
          path, lyr0.shapes.length, data.size()));
      }
      lyr0.data = data;
    }
  }
  return dataset;
};

MapShaper.readGeometryFile = function(path, fileType) {
  var rw = require('rw');
  var content;
  if (fileType == 'shp') {
    content = rw.readFileSync(path);
  } else if (fileType == 'json') {
    content = rw.readFileSync(path, 'utf-8');
  } else {
    error("Unexpected input file:", path);
  }
  return content;
};




MapShaper.getOutputPaths = function(files, opts) {
  var paths =  files.map(function(file) {
    return Node.path.join(opts.output_dir || '', file);
  });
  if (!opts.force) {
    paths = resolveFileCollisions(paths);
  }
  return paths;
};

// Avoid naming conflicts with existing files
// by adding file suffixes to output filenames: -ms, -ms2, -ms3 etc.
function resolveFileCollisions(candidates) {
  var i = 0,
      suffix = "",
      paths = candidates.concat();

  while (testFileCollision(paths)) {
    i++;
    suffix = "-ms";
    if (i > 1) suffix += String(i);
    paths = addFileSuffix(candidates, suffix);
  }
  return paths;
}

function addFileSuffix(paths, suff) {
  return paths.map(function(path) {
     return utils.getPathBase(path) + suff + '.' + utils.getFileExtension(path);
  });
}

function testFileCollision(paths, suff) {
  return utils.some(paths, function(path) {
    return cli.isFile(path) || cli.isDirectory(path);
  });
}




// Generate a dissolved layer
// @opts.field (optional) name of data field (dissolves all if falsy)
// @opts.sum-fields (Array) (optional)
// @opts.copy-fields (Array) (optional)
api.dissolvePolygons = function(lyr, arcs, opts) {
  MapShaper.requirePolygonLayer(lyr, "[dissolve] only supports polygon type layers");
  var getGroupId = MapShaper.getCategoryClassifier(opts.field, lyr.data),
      dissolveShapes = dissolvePolygonGeometry(lyr.shapes, getGroupId),
      dissolveData = null;

  if (lyr.data) {
    dissolveData = MapShaper.calcDissolveData(lyr.data.getRecords(), getGroupId, opts);
    // replace missing shapes with nulls
    for (var i=0, n=dissolveData.length; i<n; i++) {
      if (!dissolveShapes[i]) {
        dissolveShapes[i] = null;
      }
    }
  }
  return Utils.defaults({
      shapes: dissolveShapes,
      data: dissolveData ? new DataTable(dissolveData) : null
    }, lyr);
};

// Get a function to convert original feature ids into ids of combined features
// Use categorical classification (a different id for each unique value)
MapShaper.getCategoryClassifier = function(field, data) {
  if (!field) return function(i) {return 0;};
  if (!data || !data.fieldExists(field)) {
    stop("[dissolve] Data table is missing field:", field);
  }
  var index = {},
      count = 0,
      records = data.getRecords();
  return function(i) {
    var val = String(records[i][field]);
    if (val in index === false) {
      index[val] = count++;
    }
    return index[val];
  };
};

function dissolvePolygonGeometry(shapes, getGroupId) {
  var segments = dissolveFirstPass(shapes, getGroupId);
  return dissolveSecondPass(segments, shapes, getGroupId);
}

// First pass -- identify pairs of segments that can be dissolved
function dissolveFirstPass(shapes, getGroupId) {
  var groups = [],
      largeGroups = [],
      segments = [],
      ids = shapes.map(function(shp, i) {
        return getGroupId(i);
      });

  MapShaper.traverseShapes(shapes, procArc);
  Utils.forEach(largeGroups, splitGroup);
  return segments;

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
    return arc1.arcId === ~arc2.arcId && ids[arc1.shapeId] ===
        ids[arc2.shapeId];
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
}

// Second pass -- generate dissolved shapes
//
function dissolveSecondPass(segments, shapes, getGroupId) {
  var dissolveShapes = [];
  segments.forEach(procSegment);
  return dissolveShapes;

  // @obj is an arc instance
  function procSegment(obj) {
    if (obj.used) return;
    var match = findDissolveArc(obj);
    if (!match) buildRing(obj);
  }

  function addRing(arcs, i) {
    if (i in dissolveShapes === false) {
      dissolveShapes[i] = [];
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
    addRing(newArcs, getGroupId(firstArc.shapeId));
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
    var dissolveId = getGroupId(obj.shapeId), // obj.shape.dissolveKey,
        match, matchId;
    matchId = Utils.find(obj.group, function(i) {
      var a = obj,
          b = segments[i];
      if (a == b ||
          b.used ||
          getGroupId(b.shapeId) !== dissolveId ||
          // don't prevent rings from dissolving with themselves (risky?)
          // a.shapeId == b.shapeId && a.partId == b.partId ||
          a.arcId != ~b.arcId) return false;
      return true;
    });
    match = matchId === null ? null : segments[matchId];
    return match;
  }
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
// @properties original records
// @index hash of dissolve shape ids, indexed on dissolve keys
//
MapShaper.calcDissolveData = function(properties, getGroupId, opts) {
  var arr = [];
  var sumFields = opts.sum_fields || [],
      copyFields = opts.copy_fields || [];

  if (opts.field) {
    copyFields.push(opts.field);
  }

  properties.forEach(function(rec, i) {
    if (!rec) return;
    var idx = getGroupId(i),
        dissolveRec;

    if (idx in arr) {
      dissolveRec = arr[idx];
    } else {
      arr[idx] = dissolveRec = {};
      copyFields.forEach(function(f) {
        dissolveRec[f] = rec[f];
      });
    }

    sumFields.forEach(function(f) {
      // TODO: handle strings
      dissolveRec[f] = (rec[f] || 0) + (dissolveRec[f] || 0);
    });
  });
  return arr;
};





api.splitLayer = function(lyr0, arcs, splitField) {
  var dataTable = lyr0.data;
  if (splitField && (!dataTable || !dataTable.fieldExists(splitField))) stop("[split] Missing attribute field:", splitField);

  var index = {},
      properties = splitField ? dataTable.getRecords() : null,
      shapes = lyr0.shapes,
      splitLayers = [];

  shapes.forEach(function(shp, i) {
    var key = String(splitField ? properties[i][splitField] : i),
        lyr;

    if (key in index === false) {
      index[key] = splitLayers.length;
      lyr = Utils.defaults({
        name: MapShaper.getSplitLayerName(lyr0.name, key),
        data: properties ? new DataTable() : null,
        shapes: []
      }, lyr0);
      splitLayers.push(lyr);
    } else {
      lyr = splitLayers[index[key]];
    }
    lyr.shapes.push(shapes[i]);
    if (properties) {
      lyr.data.getRecords().push(properties[i]);
    }
  });
  return splitLayers;
};

MapShaper.getSplitLayerName = function(base, key) {
  return (base || 'split') + '-' + (key || '');
};




// Split the shapes in a layer according to a grid
// Return array of layers and an index with the bounding box of each cell
//
api.splitLayerOnGrid = function(lyr, arcs, rows, cols) {
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

  shapes.forEach(function(shp, i) {
    var bounds = arcs.getMultiShapeBounds(shp),
        idx = groupId(bounds),
        group = groups[idx];
    if (!group) {
      group = groups[idx] = {
        shapes: [],
        properties: properties ? [] : null,
        bounds: new Bounds(),
        name: MapShaper.getSplitLayerName(lyr.name, groupName(idx))
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




MapShaper.compileLayerExpression = function(exp) {
  var env = new LayerExpressionContext(),
      func;
  try {
    func = new Function("env", "with(env){return " + exp + ";}");
  } catch(e) {
    message('Error compiling expression "' + exp + '"');
    stop(e);
  }

  return function(lyr, arcs) {
    var value;
    env.__init(lyr, arcs);
    try {
      value = func.call(null, env);
    } catch(e) {
      stop(e);
    }
    return value;
  };
};

MapShaper.compileFeatureExpression = function(exp, lyr, arcs) {
  var RE_ASSIGNEE = /[A-Za-z_][A-Za-z0-9_]*(?= *=[^=])/g,
      newFields = exp.match(RE_ASSIGNEE) || null,
      env = {},
      records,
      func;

  if (newFields && !lyr.data) {
    lyr.data = new DataTable(MapShaper.getFeatureCount(lyr));
  }
  if (lyr.data) records = lyr.data.getRecords();

  hideGlobals(env);
  env.$ = new FeatureExpressionContext(lyr, arcs);
  try {
    func = new Function("record,env", "with(env){with(record) { return " +
        MapShaper.removeExpressionSemicolons(exp) + ";}}");
  } catch(e) {
    message('Error compiling expression "' + exp + '"');
    stop(e);
  }

  return function(recId) {
    var record = records ? records[recId] || (records[recId] = {}) : {},
        value, f;

    // initialize new fields to null so assignments work
    if (newFields) {
      for (var i=0; i<newFields.length; i++) {
        f = newFields[i];
        if (f in record === false) {
          record[f] = null;
        }
      }
    }
    env.$.__setId(recId);
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

function FeatureExpressionContext(lyr, arcs) {
  var hasData = !!lyr.data,
      hasPoints = MapShaper.layerHasPoints(lyr),
      hasPaths = arcs && MapShaper.layerHasPaths(lyr),
      _shp,
      _isLatLng,
      _self = this,
      _centroid, _innerXY,
      _record, _records,
      _id, _ids, _bounds;

  if (hasData) {
    _records = lyr.data.getRecords();
    Object.defineProperty(this, 'properties',
      {set: function(obj) {
        if (Utils.isObject(obj)) {
          _records[_id] = obj;
        } else {
          stop("Can't assign non-object to $.properties");
        }
      }, get: function() {
        var rec = _records[_id];
        if (!rec) {
          rec = _records[_id] = {};
        }
        return rec;
      }});
  }

  if (hasPaths) {
    _shp = new MultiShape(arcs);
    _isLatLng = MapShaper.probablyDecimalDegreeBounds(arcs.getBounds());
    addGetters(this, {
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
      height: function() {
        return shapeBounds().height();
      },
      width: function() {
        return shapeBounds().width();
      }
    });

    if (lyr.geometry_type == 'polygon') {
      addGetters(this, {
        area: function() {
          return _isLatLng ? geom.getSphericalShapeArea(_ids, arcs) : geom.getShapeArea(_ids, arcs);
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
        // not implemented
        interiorX: function() {
          var p = innerXY();
          return p ? p.x : null;
        },
        interiorY: function() {
          var p = innerXY();
          return p ? p.y : null;
        }
      });
    }

  } else if (hasPoints) {
    // TODO: add functions like bounds, isNull, pointCount
    Object.defineProperty(this, 'coordinates',
      {set: function(obj) {
        if (!obj || Utils.isArray(obj)) {
          lyr.shapes[_id] = obj || null;
        } else {
          stop("Can't assign non-array to $.coordinates");
        }
      }, get: function() {
        return lyr.shapes[_id] || null;
      }});
  }

  // all contexts have $.id
  addGetters(this, {id: function() { return _id; }});

  this.__setId = function(id) {
    _id = id;
    if (hasPaths) {
      _bounds = null;
      _centroid = null;
      _innerXY = null;
      _ids = lyr.shapes[id];
      _shp.init(_ids);
    }
    if (hasData) {
      _record = _records[id];
    }
  };

  function centroid() {
    _centroid = _centroid || geom.getShapeCentroid(_ids, arcs);
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

function LayerExpressionContext() {
  var lyr, arcs;
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
    var sum = this.sum(exp);
    return sum / MapShaper.getFeatureCount(lyr);
  };

  this.median = function(exp) {
    var arr = values(exp);
    return Utils.findMedian(arr);
  };

  this.__init = function(l, a) {
    lyr = l;
    arcs = a;
  };

  function values(exp) {
    var compiled = MapShaper.compileFeatureExpression(exp, lyr, arcs);
    return Utils.repeat(MapShaper.getFeatureCount(lyr), compiled);
  }

  function reduce(exp, initial, func) {
    var val = initial,
        compiled = MapShaper.compileFeatureExpression(exp, lyr, arcs),
        n = MapShaper.getFeatureCount(lyr);
    for (var i=0; i<n; i++) {
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




api.evaluateEachFeature = function(lyr, arcs, exp) {
  var n = MapShaper.getFeatureCount(lyr),
      compiled;

  // TODO: consider not creating a data table -- not needed if expression only references geometry
  if (n > 0 && !lyr.data) {
    lyr.data = new DataTable(n);
  }
  compiled = MapShaper.compileFeatureExpression(exp, lyr, arcs);
  // call compiled expression with id of each record
  Utils.repeat(n, compiled);
};





// Recursively divide a layer into two layers until a (compiled) expression
// no longer returns true. The original layer is split along the long side of
// its bounding box, so that each split-off layer contains half of the original
// shapes (+/- 1).
//
api.subdivideLayer = function(lyr, arcs, exp) {
  return MapShaper.subdivide(lyr, arcs, MapShaper.compileLayerExpression(exp));
};

MapShaper.subdivide = function(lyr, arcs, compiled) {
  var divide = compiled(lyr, arcs),
      subdividedLayers = [],
      tmp, bounds, lyr1, lyr2;

  if (!Utils.isBoolean(divide)) {
    stop("--subdivide expressions must return true or false");
  }
  if (divide) {
    bounds = MapShaper.getLayerBounds(lyr, arcs);
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

  subdividedLayers.forEach(function(lyr2, i) {
    lyr2.name = MapShaper.getSplitLayerName(lyr.name, i + 1);
    Opts.copyNewParams(lyr2, lyr);
  });
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
    geometry_type: lyr.geometry_type,
    shapes: [],
    data: properties ? [] : null
  };
  lyr2 = {
    geometry_type: lyr.geometry_type,
    shapes: [],
    data: properties ? [] : null
  };

  var useX = bounds && bounds.width() > bounds.height();
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




// filter and rename data fields; see mapshaper -fields option

api.filterFields = function(lyr, names) {
  var fields, fieldMap, missingFields;
  if (!lyr.data) {
    stop("[filter-fields] Layer is missing a data table");
  } else if (!Utils.isArray(names)) {
    stop("[filter-fields] Expected an array of field names; found:", names);
  }

  fieldMap = utils.reduce(names, function(memo, str) {
      var parts = str.split('=');
      var dest = parts[0],
          src = parts[1] || dest;
      if (!src || !dest) stop("[fields] Invalid field description:", str);
      memo[src] = dest;
      return memo;
    }, {});
  fields = lyr.data.getFields();
  missingFields = Utils.difference(Utils.getKeys(fieldMap), fields);

  if (missingFields.length > 0) {
    message("[filter-fields] Table is missing one or more specified fields:", missingFields);
    message("Existing fields:", fields);
    stop();
  } else {
    lyr.data.filterFields(fieldMap);
  }
};




api.filterFeatures = function(lyr, arcs, exp) {
  var records = lyr.data ? lyr.data.getRecords() : null,
      compiled = MapShaper.compileFeatureExpression(exp, lyr, arcs);

  var selectedShapes = [],
      selectedRecords = [];

  Utils.forEach(lyr.shapes, function(shp, shapeId) {
    var rec = records ? records[shapeId] : null,
        result = compiled(shapeId);

    if (!Utils.isBoolean(result)) {
      stop("[filter] Expressions must return true or false");
    }
    if (result) {
      selectedShapes.push(shp);
      if (records) selectedRecords.push(rec);
    }
  });

  lyr.shapes = selectedShapes;
  if (records) {
    lyr.data = new DataTable(selectedRecords);
  }
};

MapShaper.filterDataTable = function(data, exp) {
  var compiled = MapShaper.compileFeatureExpression(exp, {data: data}, null),
      filtered = Utils.filter(data.getRecords(), function(rec, i) {
        return compiled(i);
      });
  return new DataTable(filtered);
};




// Merge similar layers in a dataset, in-place
api.mergeLayers = function(layers) {
  var index = {},
      merged = [];

  // layers with same key can be merged
  function layerKey(lyr) {
    var key = lyr.geometry_type || '';
    if (lyr.data) {
      key += '~' + lyr.data.getFields().sort().join(',');
    }
    return key;
  }

  layers.forEach(function(lyr) {
    var key = layerKey(lyr),
        indexedLyr,
        records;
    if (key in index === false) {
      index[key] = lyr;
      merged.push(lyr);
    } else {
      indexedLyr = index[key];
      indexedLyr.name = MapShaper.mergeNames(indexedLyr.name, lyr.name);
      indexedLyr.shapes = indexedLyr.shapes.concat(lyr.shapes);
      if (indexedLyr.data) {
        records = indexedLyr.data.getRecords().concat(lyr.data.getRecords());
        indexedLyr.data = new DataTable(records);
      }
    }
  });

  return merged;
};




MapShaper.mergeDatasets = function(arr) {
  var arcSources = [],
      arcCount = 0,
      mergedLayers = [],
      mergedArcs;

  arr.forEach(function(data) {
    var n = data.arcs ? data.arcs.size() : 0;
    if (n > 0) {
      arcSources.push(data.arcs);
    }
    data.layers.forEach(function(lyr) {
      if (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline') {
        // reindex arc ids
        MapShaper.forEachArcId(lyr.shapes, function(id) {
          return id < 0 ? id - arcCount : id + arcCount;
        });
      }
      mergedLayers.push(lyr);
    });
    arcCount += n;
  });

  mergedArcs = MapShaper.mergeArcs(arcSources);
  if (mergedArcs.size() != arcCount) {
    error("[mergeDatasets()] Arc indexing error");
  }

  return {
    arcs: mergedArcs,
    layers: mergedLayers
  };
};

MapShaper.mergeArcs = function(arr) {
  var dataArr = arr.map(function(arcs) {
    var data = arcs.getVertexData();
    if (data.zz) {
      error("[mergeArcs()] Merging arcs with z data is not supported");
    }
    return data;
  });

  var xx = utils.mergeArrays(Utils.pluck(dataArr, 'xx'), Float64Array),
      yy = utils.mergeArrays(Utils.pluck(dataArr, 'yy'), Float64Array),
      nn = utils.mergeArrays(Utils.pluck(dataArr, 'nn'), Int32Array);

  return new ArcCollection(nn, xx, yy);
};

utils.countElements = function(arrays) {
  return arrays.reduce(function(memo, arr) {
    return memo + (arr.length || 0);
  }, 0);
};

utils.mergeArrays = function(arrays, TypedArr) {
  var size = utils.countElements(arrays),
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




api.mergeFiles = function(files, opts) {
  var datasets = files.map(function(fname) {
    var importOpts = Utils.defaults({no_topology: true, files: [fname]}, opts);  // import without topology
    return api.importFile(fname, importOpts);
  });

  // Don't allow multiple input formats
  var formats = datasets.map(function(d) {
    return d.info.input_format;
  });
  if (Utils.uniq(formats).length != 1) {
    stop("[mergeFiles()] Importing files with different formats is not supported");
  }

  var merged = MapShaper.mergeDatasets(datasets);
  // kludge -- using info property of first dataset
  merged.info = datasets[0].info;
  merged.info.input_files = files;

  // Don't try to re-build topology of TopoJSON files
  // TODO: consider updating topology of TopoJSON files instead of concatenating arcs
  // (but problem of mismatched coordinates due to quantization in input files.)
  if (!opts.no_topology && merged.info.input_format != 'topojson') {
    api.buildTopology(merged);
  }

  if (opts.merge_files) {
    merged.layers = api.mergeLayers(merged.layers);
  }
  return merged;
};




api.importJoinTable = function(file, opts) {
  var table = MapShaper.importDataTable(file, opts),
      fields = opts.fields || table.getFields(),
      keys = opts.keys;

  if (!utils.isArray(keys) || keys.length != 2) {
    stop("[join] Invalid join keys:", keys);
  }
  // this may cause duplicate field name with inconsistent type hints
  // adjustRecordTypes() should handle this case
  fields.push(opts.keys[1]);
  // convert data types based on type hints and numeric csv fields
  // side effect: type hints are removed from field names
  // TODO: remove side effect
  fields = MapShaper.adjustRecordTypes(table.getRecords(), fields);
  // replace foreign key in case original contained type hint
  opts.keys[1] = fields.pop();
  opts.fields = fields;
  return table;
};

api.joinAttributesToFeatures = function(lyr, table, opts) {
  var localKey = opts.keys[0],
      foreignKey = opts.keys[1],
      joinFields = opts.fields,
      typeIndex = {};

  if (table.fieldExists(foreignKey) === false) {
    stop("[join] External table is missing a field named:", foreignKey);
  }

  if (opts.where) {
    table = MapShaper.filterDataTable(table, opts.where);
  }

  if (!joinFields || joinFields.length === 0) {
    joinFields = Utils.difference(table.getFields(), [foreignKey]);
  }

  // var index = Utils.indexOn(table.getRecords(), foreignKey);

  if (!lyr.data || !lyr.data.fieldExists(localKey)) {
    stop("[join] Target layer is missing field:", localKey);
  }

  if (!MapShaper.joinTables(lyr.data, localKey, joinFields, table, foreignKey,
      joinFields)) stop("[join] No records could be joined");
  // TODO: better handling of failed joins
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




api.printInfo = function(dataset, opts) {
  // str += Utils.format("Number of layers: %d\n", dataset.layers.length);
  // if (dataset.arcs) str += Utils.format("Topological arcs: %'d\n", dataset.arcs.size());
  var str = dataset.layers.map(function(lyr) {
    return MapShaper.getLayerInfo(lyr, dataset.arcs);
  }).join('\n\n');
  message(str);
};

// TODO: consider polygons with zero area or other invalid geometries
MapShaper.countNullShapes = function(shapes) {
  var count = 0;
  for (var i=0; i<shapes.length; i++) {
    if (!shapes[i] || shapes[i].length === 0) count++;
  }
  return count;
};

MapShaper.getLayerInfo = function(lyr, arcs) {
  var str = "Layer: " + (lyr.name || "[unnamed]") + "\n";
  str += "Geometry: " + (lyr.geometry_type || "[none]") + "\n";
  if (lyr.shapes) {
    str += Utils.format("Records: %'d (null shapes: %'d)\n",
        lyr.shapes.length, MapShaper.countNullShapes(lyr.shapes));

    str += "Bounds: " + MapShaper.getLayerBounds(lyr, arcs).toArray().join(' ') + "\n";
  }
  if (lyr.data && lyr.data.size() > 0 && lyr.data.getFields().length > 0) {
    str += MapShaper.getTableInfo(lyr.data);
  } else {
    str += "Missing attribute data";
  }
  return str;
};

MapShaper.getTableInfo = function(data) {
  var fields = data.getFields().sort();
  var col1Chars = fields.reduce(function(memo, name) {
    return Math.max(memo, name.length);
  }, 5) + 2;
  var vals = fields.map(function(fname) {
    return data.getRecords()[0][fname];
  });
  var digits = vals.map(function(val, i) {
    return Utils.isNumber(vals[i]) ? (val + '.').indexOf('.') + 1 :  0;
  });
  var maxDigits = Math.max.apply(null, digits);
  var table = vals.map(function(val, i) {
    var str = '  ' + Utils.rpad(fields[i], col1Chars, ' ');
    if (Utils.isNumber(val)) {
      str += Utils.lpad("", maxDigits - digits[i], ' ') + val;
    } else {
      str += "'" + val + "'";
    }
    return str;
  }).join('\n');
  return "Data table\n  " +
      Utils.rpad('Field', col1Chars, ' ') + "First value\n" + table;
};




// Flatten overlapping polygon shapes
// (Unfinished)
api.flattenLayer = function(lyr, dataset, opts) {
  var nodes = MapShaper.divideArcs(dataset);
  var flatten = MapShaper.getPolygonFlattener(nodes);
  var lyr2 = {data: null};
  lyr2.shapes = lyr.shapes.map(flatten);
  // TODO: copy data over
  return Utils.defaults(lyr2, lyr);
};

MapShaper.getPolygonFlattener = function(nodes) {
  var flags = new Uint8Array(nodes.arcs.size());
  var divide = MapShaper.getHoleDivider(nodes);
  var flatten = MapShaper.getRingIntersector(nodes, 'flatten', flags);

  return function(shp) {
    if (!shp) return null;
    var cw = [],
        ccw = [];

    divide(shp, cw, ccw);
    cw = flatten(cw);
    ccw.forEach(MapShaper.reversePath);
    ccw = flatten(ccw);
    ccw.forEach(MapShaper.reversePath);

    var shp2 = MapShaper.appendHolestoRings(cw, ccw);
    return shp2 && shp2.length > 0 ? shp2 : null;
  };
};



// assumes layers and arcs have been prepared for clipping
MapShaper.clipPolygons = function(targetShapes, clipShapes, nodes, type) {
  var arcs = nodes.arcs;
  var clipFlags = new Uint8Array(arcs.size());
  var routeFlags = new Uint8Array(arcs.size());
  var clipArcTouches = 0;
  var clipArcUses = 0;
  var usedClipArcs = [];
  var dividePath = MapShaper.getPathFinder(nodes, useRoute, routeIsActive, chooseRoute);
  var dissolvePolygon = MapShaper.getPolygonDissolver(nodes);

  // clean each target polygon by dissolving its rings
  targetShapes = targetShapes.map(dissolvePolygon);
  // merge rings of clip/erase polygons and dissolve them all
  clipShapes = [dissolvePolygon(MapShaper.concatShapes(clipShapes))];

  // Open pathways in the clip/erase layer
  // Need to expose clip/erase routes in both directions by setting route
  // in both directions to visible -- this is how cut-out shapes are detected
  // Or-ing with 0x11 makes both directions visible (so reverse paths will block)
  MapShaper.openArcRoutes(clipShapes, arcs, clipFlags, type == 'clip', type == 'erase', !!"dissolve", 0x11);

  var index = new PathIndex(clipShapes, arcs);
  var clippedShapes = targetShapes.map(function(shape) {
    if (shape) {
      return clipPolygon(shape, type, index);
    }
    return null;
  });

  // add clip/erase polygons that are fully contained in a target polygon
  // need to index only non-intersecting clip shapes
  // (Intersecting shapes have one or more arcs that have been scanned)
  //
  var undividedClipShapes = findUndividedClipShapes(clipShapes);

  MapShaper.closeArcRoutes(clipShapes, arcs, routeFlags, true, true); // not needed?
  index = new PathIndex(undividedClipShapes, arcs);
  targetShapes.forEach(function(shape, shapeId) {
    var paths = shape ? findInteriorPaths(shape, type, index) : null;
    if (paths) {
      clippedShapes[shapeId] = (clippedShapes[shapeId] || []).concat(paths);
    }
  });

  return clippedShapes;

  function clipPolygon(shape, type, index) {
    var dividedShape = [],
        clipping = type == 'clip',
        erasing = type == 'erase';

    // open pathways for entire polygon rather than one ring at a time --
    // need to create polygons that connect positive-space rings and holes
    MapShaper.openArcRoutes(shape, arcs, routeFlags, true, false, false);

    MapShaper.forEachPath(shape, function(ids) {
      var path;
      for (var i=0, n=ids.length; i<n; i++) {
        clipArcTouches = 0;
        clipArcUses = 0;
        path = dividePath(ids[i]);

        if (path) {
          // if ring doesn't touch/intersect a clip/erase polygon, check if it is contained
          // if (clipArcTouches === 0) {
          // if ring doesn't incorporate an arc from the clip/erase polygon,
          // check if it is contained (assumes clip shapes are dissolved)
          if (clipArcTouches === 0 || clipArcUses === 0) { //
            var contained = index.pathIsEnclosed(path);
            if (clipping && contained || erasing && !contained) {
              dividedShape.push(path);
            }
            // TODO: Consider breaking if polygon is unchanged
          } else {
            dividedShape.push(path);
          }
        }
      }
    });

    // Clear pathways of current target shape to hidden/closed
    MapShaper.closeArcRoutes(shape, arcs, routeFlags, true, true, true);
    // Also clear pathways of any clip arcs that were used
    if (usedClipArcs.length > 0) {
      MapShaper.closeArcRoutes(usedClipArcs, arcs, routeFlags, true, true, true);
      usedClipArcs = [];
    }

    return dividedShape.length === 0 ? null : dividedShape;
  }

  function routeIsActive(id) {
    var fw = id >= 0,
        abs = fw ? id : ~id,
        visibleBit = fw ? 1 : 0x10,
        targetBits = routeFlags[abs],
        clipBits = clipFlags[abs];

    if (clipBits > 0) clipArcTouches++;
    return (targetBits & visibleBit) > 0 || (clipBits & visibleBit) > 0;
  }

  function useRoute(id) {
    var fw = id >= 0,
        abs = fw ? id : ~id,
        targetBits = routeFlags[abs],
        clipBits = clipFlags[abs],
        targetRoute, clipRoute;

    if (fw) {
      targetRoute = targetBits;
      clipRoute = clipBits;
    } else {
      targetRoute = targetBits >> 4;
      clipRoute = clipBits >> 4;
    }
    targetRoute &= 3;
    clipRoute &= 3;

    var usable = false;
    // var usable = targetRoute === 3 || targetRoute === 0 && clipRoute == 3;
    if (targetRoute == 3) {
      // special cases where clip route and target route both follow this arc
      if (clipRoute == 1) {
        // 1. clip/erase polygon blocks this route, not usable
      } else if (clipRoute == 2 && type == 'erase') {
        // 2. route is on the boundary between two erase polygons, not usable
      } else {
        usable = true;
      }

    } else if (targetRoute === 0 && clipRoute == 3) {
      usedClipArcs.push(id);
      usable = true;
    }

    if (usable) {
      if (clipRoute == 3) {
        clipArcUses++;
      }
      // Need to close all arcs after visiting them -- or could cause a cycle
      //   on layers with strange topology
      if (fw) {
        targetBits = MapShaper.setBits(targetBits, 1, 3);
      } else {
        targetBits = MapShaper.setBits(targetBits, 0x10, 0x30);
      }
    }

    targetBits |= fw ? 4 : 0x40; // record as visited
    routeFlags[abs] = targetBits;
    return usable;
  }

  function chooseRoute(id1, angle1, id2, angle2, prevId) {
    var selection = 1;
    if (angle1 == angle2) {
      // less likely now that congruent arcs are prevented in updateArcIds()
      var bits2 = MapShaper.getRouteBits(id2, routeFlags);
      if (bits2 == 3) { // route2 follows a target layer arc; prefer it
        selection = 2;
      }
    } else {
      // prefer right-hand angle
      if (angle2 < angle1) {
        selection = 2;
      }
    }
    return selection;
  }

  // Filter a collection of shapes to exclude paths that contain clip/erase arcs
  // and paths that are hidden (e.g. internal boundaries)
  function findUndividedClipShapes(clipShapes) {
    return clipShapes.map(function(shape) {
      var usableParts = [];
      MapShaper.forEachPath(shape, function(ids) {
        var pathIsClean = true,
            pathIsVisible = false;
        for (var i=0; i<ids.length; i++) {
          // check if arc was used in fw or rev direction
          if (!arcIsUnused(ids[i], routeFlags)) {
            pathIsClean = false;
            break;
          }
          // check if clip arc is visible
          if (!pathIsVisible && arcIsVisible(ids[i], clipFlags)) {
            pathIsVisible = true;
          }
        }
        if (pathIsClean && pathIsVisible) usableParts.push(ids);
      });
      return usableParts.length > 0 ? usableParts : null;
    });
  }

  // Test if arc is unused in both directions
  // (not testing open/closed or visible/hidden)
  function arcIsUnused(id, flags) {
    var abs = absArcId(id),
        flag = flags[abs];
        return (flag & 0x44) === 0;
  }

  function arcIsVisible(id, flags) {
    var flag = flags[absArcId(id)];
    return (flag & 0x11) > 0;
  }

  // search for indexed clipping paths contained in a shape
  // dissolve them if needed
  function findInteriorPaths(shape, type, index) {
    var enclosedPaths = index.findPathsInsideShape(shape),
        dissolvedPaths = [];
    if (!enclosedPaths) return null;
    // ...
    if (type == 'erase') enclosedPaths.forEach(MapShaper.reversePath);
    if (enclosedPaths.length <= 1) {
      dissolvedPaths = enclosedPaths; // no need to dissolve single-part paths
    } else {
      MapShaper.openArcRoutes(enclosedPaths, arcs, routeFlags, true, false, true);
      enclosedPaths.forEach(function(ids) {
        var path;
        for (var j=0; j<ids.length; j++) {
          path = dividePath(ids[j]);
          if (path) {
            dissolvedPaths.push(path);
          }
        }
      });
    }

    return dissolvedPaths.length > 0 ? dissolvedPaths : null;
  }
}; // end clipPolygons()




// Assumes: Arcs have been divided
//
MapShaper.clipPolylines = function(targetShapes, clipShapes, nodes, type) {
  var index = new PathIndex(clipShapes, nodes.arcs);

  return targetShapes.map(function(shp) {
    return clipPolyline(shp);
  });

  function clipPolyline(shp) {
    var clipped = shp.reduce(clipPath, []);
    return clipped.length > 0 ? clipped : null;
  }

  function clipPath(memo, path) {
    var clippedPath = null,
        arcId, enclosed;
    for (var i=0; i<path.length; i++) {
      arcId = path[i];
      enclosed = index.arcIsEnclosed(arcId);
      if (enclosed && type == 'clip' || !enclosed && type == 'erase') {
        if (!clippedPath) {
          memo.push(clippedPath = []);
        }
        clippedPath.push(arcId);
      } else {
        clippedPath = null;
      }
    }
    return memo;
  }
};




//
MapShaper.clipPoints = function(points, clipShapes, arcs, type) {
  var index = new PathIndex(clipShapes, arcs);

  var points2 = points.reduce(function(memo, feat) {
    var n = feat ? feat.length : 0,
        feat2 = [],
        enclosed;

    for (var i=0; i<n; i++) {
      enclosed = index.findEnclosingShape(feat[i]) > -1;
      if (type == 'clip' && enclosed || type == 'erase' && !enclosed) {
        feat2.push(feat[i].concat());
      }
    }

    memo.push(feat2.length > 0 ? feat2 : null);
    return memo;
  }, []);

  return points2;
};




api.clipLayers = function(target, clipLyr, dataset, opts) {
  return MapShaper.clipLayers(target, clipLyr, dataset, "clip", opts);
};

api.eraseLayers = function(target, clipLyr, dataset, opts) {
  return MapShaper.clipLayers(target, clipLyr, dataset, "erase", opts);
};

api.clipLayer = function(targetLyr, clipLyr, dataset, opts) {
  return api.clipLayers([targetLyr], clipLyr, dataset, opts)[0];
};

api.eraseLayer = function(targetLyr, clipLyr, dataset, opts) {
  return api.eraseLayers([targetLyr], clipLyr, dataset, opts)[0];
};

// @target: a single layer or an array of layers
// @type: 'clip' or 'erase'
MapShaper.clipLayers = function(targetLayers, clipLyr, dataset, type, opts) {
  MapShaper.requirePolygonLayer(clipLyr, "[" + type + "] Requires a polygon clipping layer");

  // If clipping layer was imported from a second file, it won't be included in
  // dataset
  // (assuming that clipLyr arcs have been merged with dataset.arcs)
  //
  if (Utils.contains(dataset.layers, clipLyr) === false) {
    dataset = {
      layers: [clipLyr].concat(dataset.layers),
      arcs: dataset.arcs
    };
  }

  var nodes;
  var output = targetLayers.map(function(targetLyr) {
    var clippedShapes, clippedLyr;
    if (targetLyr === clipLyr) {
      stop('[' + type + '] Can\'t clip a layer with itself');
    } else if (MapShaper.layerHasPoints(targetLyr)) {
      // clip point layer
      clippedShapes = MapShaper.clipPoints(targetLyr.shapes, clipLyr.shapes, dataset.arcs, type);
    } else if (MapShaper.layerHasPaths(targetLyr)) {
      // clip polygon or polyline layer
      if (!nodes) nodes = MapShaper.divideArcs(dataset);
      var clip = targetLyr.geometry_type == 'polygon' ? MapShaper.clipPolygons : MapShaper.clipPolylines;
      clippedShapes = clip(targetLyr.shapes, clipLyr.shapes, nodes, type);
    } else {
      // unknown layer type
      stop('[' + type + '] Invalid target layer:', targetLyr.name);
    }

    clippedLyr = Utils.defaults({shapes: clippedShapes, data: null}, targetLyr);
    if (targetLyr.data) {
      clippedLyr.data = opts.no_replace ? targetLyr.data.clone() : targetLyr.data;
    }
    return clippedLyr;
  });
  return output;
};




// Assumes layers and arcs have been processed with divideArcs()
/*
api.dividePolygonLayer = function(lyrA, lyrB, arcs) {
  if (lyrA.geometry_type != 'polygon') {
    stop("[dividePolygonLayer()] Expected polygon layer, received:", lyrA.geometry_type);
  }
  var flags = new Uint8Array(arcs.size());
  MapShaper.openArcRoutes(lyrA.shapes, arcs, flags, true, false, false);
  MapShaper.openArcRoutes(lyrB.shapes, arcs, flags, true, true, false);

  var dividedShapes = MapShaper.dividePolygons(lyrA.shapes, arcs, flags);
  return Utils.defaults({shapes: dividedShapes, data: null}, lyrA);
};

MapShaper.dividePolygons = function(shapes, arcs, flags) {
  var divide = MapShaper.getPathFinder(nodes, flags);
  return shapes.map(function(shape, i) {
    var dividedShape = [];
    MapShaper.forEachPath(shape, function(ids) {
      var path;
      for (var i=0; i<ids.length; i++) {
        path = divide(ids[i]);
        if (path) {
          dividedShape.push(path);
        }
      }
    });
    return dividedShape.length === 0 ? null : dividedShape;
  });
};
*/




/*
MapShaper.repairPolygonGeometry2 = function(layers, arcs) {
  var nodes = MapShaper.divideArcs(layers, arcs);
  layers.forEach(function(lyr) {
    lyr.shapes = MapShaper.repairPolygons(lyr.shapes, nodes);
  });
  return layers;
};

// assumes that arcs have been divided and rings have been cleaned
//
MapShaper.repairPolygons = function(shapes, nodes) {
  var flags = new Uint8Array(nodes.arcs.size());
  var splitter = MapShaper.getPathSplitter(nodes, flags);
  var dissolver = MapShaper.getRingDissolver(nodes, flags, true);

  return shapes.map(function(shp, i) {
    return MapShaper.dissolvePolygon(shp, splitter, dissolver);
  });

};
*/




api.renameLayers = function(layers, names) {
  if (!names || names.length > 0 === false) {
    names = ['layer'];
  }
  var layerCount = layers.length,
      nameCount = names && names.length;

  layers.forEach(function(lyr, i) {
    var name = i < nameCount - 1 ? names[i] : names[nameCount - 1];
    if (nameCount < layerCount && i >= nameCount - 2) {
      name += i - nameCount + 2;
    }
    lyr.name = name;
  });
};




// parse command line args into commands and run them
api.runShellArgs = function(argv, done) {
  var commands;
  try {
    commands = MapShaper.parseCommands(argv);
  } catch(e) {
    return done(e);
  }
  if (commands.length === 0) {
    return done(new APIError("Missing an input file"));
  }

  // if there's a -i command, no -o command and no -info command,
  // append a generic -o command.
  if (!utils.some(commands, function(cmd) { return cmd.name == 'o'; }) &&
      !utils.some(commands, function(cmd) { return cmd.name == 'info'; }) &&
      utils.some(commands, function(cmd) {return cmd.name == 'i'; })) {
    commands.push({name: "o", options: {}});
  }

  T.start("Start timing");
  api.runCommands(commands, function(err, dataset) {
    T.stop("Total time");
    done(err);
  });
};

// Execute a sequence of commands
// Signature: function(commands, [dataset,] done)
// @commands either a string of commands or an array of parsed commands
//
api.runCommands = function(commands) {
  var dataset = null,
      done, args;

  if (utils.isFunction(arguments[1])) {
    done = arguments[1];
  } else if (utils.isFunction(arguments[2])) {
    dataset = arguments[1];
    done = arguments[2];
  } else {
    error("Missing callback");
  }

  if (utils.isString(commands)) {
    try {
      args = require('shell-quote').parse(commands);
      commands = MapShaper.parseCommands(args);
    } catch(e) {
      return done(e);
    }
  }

  commands = MapShaper.runAndRemoveInfoCommands(commands);
  if (commands.length === 0) {
    return done(null, dataset);
  }
  commands = MapShaper.divideImportCommand(commands);
  if (commands[0].name != 'i' && !dataset) {
    return done(new APIError("Missing a -i command"));
  }

  utils.reduceAsync(commands, dataset, function(dataset, cmd, nextCmd) {
    api.runCommand(cmd, dataset, nextCmd);
  }, done);
};

// TODO: consider refactoring to allow modules
// @cmd  example: {name: "dissolve", options:{field: "STATE"}}
// @dataset  format: {arcs: <ArcCollection>, layers:[]}
// @done callback: function(err, dataset)
//
api.runCommand = function(cmd, dataset, cb) {
  var name = cmd.name,
      opts = cmd.options,
      targetLayers,
      newLayers,
      sourceLyr,
      arcs;

  try { // catch errors from synchronous functions

    T.start();
    if (dataset) {
      arcs = dataset.arcs;
      if (opts.target) {
        targetLayers = MapShaper.findMatchingLayers(dataset.layers, opts.target);
      } else {
        targetLayers = dataset.layers; // default: all layers
      }
      if (targetLayers.length === 0) {
        message("[-" + name + "] Command is missing target layer(s).");
        MapShaper.printLayerNames(dataset.layers);
      }
    }

    if (name == 'clip') {
      sourceLyr = MapShaper.getSourceLayer(opts.source, dataset, opts);
      newLayers = api.clipLayers(targetLayers, sourceLyr, dataset, opts);

    } else if (name == 'each') {
      MapShaper.applyCommand(api.evaluateEachFeature, targetLayers, arcs, opts.expression);

    } else if (name == 'dissolve') {
      newLayers = MapShaper.applyCommand(api.dissolvePolygons, targetLayers, arcs, opts);

    } else if (name == 'dissolve2') {
      newLayers = MapShaper.applyCommand(api.dissolvePolygons2, targetLayers, dataset, opts);

    } else if (name == 'erase') {
      sourceLyr = MapShaper.getSourceLayer(opts.source, dataset, opts);
      newLayers = api.eraseLayers(targetLayers, sourceLyr, dataset, opts);

    } else if (name == 'explode') {
      newLayers = MapShaper.applyCommand(api.explodeFeatures, targetLayers, arcs, opts);

    } else if (name == 'filter-fields') {
      MapShaper.applyCommand(api.filterFields, targetLayers, opts.fields);

    /*
    } else if (name == 'fill-holes') {
      MapShaper.applyCommand(api.fillHoles, targetLayers, opts);
    */

    } else if (name == 'filter') {
      MapShaper.applyCommand(api.filterFeatures, targetLayers, arcs, opts.expression);

    } else if (name == 'flatten') {
      newLayers = MapShaper.applyCommand(api.flattenLayer, targetLayers, dataset, opts);

    } else if (name == 'i') {
      dataset = api.importFiles(cmd.options);

    } else if (name == 'info') {
      api.printInfo(dataset);

    } else if (name == 'innerlines') {
      newLayers = MapShaper.applyCommand(api.convertPolygonsToInnerLines, targetLayers, arcs);

    } else if (name == 'join') {
      var table = api.importJoinTable(opts.source, opts);
      MapShaper.applyCommand(api.joinAttributesToFeatures, targetLayers, table, opts);

    } else if (name == 'layers') {
      newLayers = MapShaper.applyCommand(api.filterLayers, dataset.layers, opts.layers);

    } else if (name == 'lines') {
      newLayers = MapShaper.applyCommand(api.convertPolygonsToTypedLines, targetLayers, arcs, opts.fields);

    } else if (name == 'merge-layers') {
      // careful, returned layers are modified input layers
      newLayers = api.mergeLayers(targetLayers);

    } else if (name == 'o') {
      api.exportFiles(Utils.defaults({layers: targetLayers}, dataset), opts);

    } else if (name == 'rename-layers') {
      api.renameLayers(targetLayers, opts.names);

    } else if (name == 'repair') {
      newLayers = MapShaper.repairPolygonGeometry(targetLayers, dataset, opts);

    } else if (name == 'simplify') {
      api.simplify(arcs, opts);
      if (opts.keep_shapes) {
        api.keepEveryPolygon(arcs, targetLayers);
      }

    } else if (name == 'split') {
      newLayers = MapShaper.applyCommand(api.splitLayer, targetLayers, arcs, opts.field);

    } else if (name == 'split-on-grid') {
      newLayers = MapShaper.applyCommand(api.splitLayerOnGrid, targetLayers, arcs, opts.rows, opts.cols);

    } else if (name == 'subdivide') {
      newLayers = MapShaper.applyCommand(api.subdivideLayer, targetLayers, arcs, opts.expression);

    } else {
      error("Unhandled command: [" + name + "]");
    }

    if (opts.name) {
      (newLayers || targetLayers).forEach(function(lyr) {
        lyr.name = opts.name;
      });
    }

    if (newLayers) {
      if (opts.no_replace) {
        dataset.layers = dataset.layers.concat(newLayers);
      } else {
        // TODO: consider replacing old layers as they are generated, for gc
        MapShaper.replaceLayers(dataset, targetLayers, newLayers);
      }
    }
    done(null, dataset);

  } catch(e) {
    done(e, null);
  }

  function done(err, dataset) {
    T.stop('-' + name);
    cb(err, dataset);
  }
};

// Apply a command to an array of target layers
MapShaper.applyCommand = function(func, targetLayers) {
  var args = Utils.toArray(arguments).slice(2);
  return targetLayers.reduce(function(memo, lyr) {
    var result = func.apply(null, [lyr].concat(args));
    if (Utils.isArray(result)) { // some commands return an array of layers
      memo = memo.concat(result);
    } else if (result) { // assuming result is a layer
      memo.push(result);
    }
    return memo;
  }, []);
};

MapShaper.divideImportCommand = function(commands) {
  var firstCmd = commands[0],
      opts = firstCmd.options,
      files = opts.files || [];

  if (firstCmd.name != 'i' || files.length <= 1 || opts.stdin || opts.merge_files || opts.combine_files) {
    return commands;
  }
  return files.reduce(function(memo, file) {
    var importCmd = {
      name: 'i',
      options: Utils.defaults({files:[file]}, opts)
    };
    memo.push(importCmd);
    memo.push.apply(memo, commands.slice(1));
    return memo;
  }, []);
};

api.exportFiles = function(dataset, opts) {
  if (!opts.format) {
    if (opts.output_file) {
      opts.format = MapShaper.guessFileFormat(opts.output_file, dataset.info.input_format);
    } else {
      opts.format = dataset.info.input_format;
    }
  }
  var exports = MapShaper.exportFileContent(dataset, opts);
  if (exports.length > 0 === false) {
    message("No files to save");
  } else if (opts.stdout) {
    Node.writeFile('/dev/stdout', exports[0].content);
  } else {
    var paths = MapShaper.getOutputPaths(Utils.pluck(exports, 'filename'), opts);
    exports.forEach(function(obj, i) {
      var path = paths[i];
      Node.writeFile(path, obj.content);
      message("Wrote " + path);
    });
  }
};

api.importFiles = function(opts) {
  var files = opts.files,
      dataset;
  if ((opts.merge_files || opts.combine_files) && files.length > 1) {
    dataset = api.mergeFiles(files, opts);
  } else if (files && files.length == 1) {
    dataset = api.importFile(files[0], opts);
  } else if (opts.stdin) {
    dataset = api.importFile('/dev/stdin', opts);
  } else {
    // err
  }
  return dataset;
};

// Call @iter on each member of an array (similar to Array#reduce(iter))
//    iter: function(memo, item, callback)
// Call @done when all members have been processed or if an error occurs
//    done: function(err, memo)
// @memo: Initial value
//
utils.reduceAsync = function(arr, memo, iter, done) {
  var i=0;
  next(null, memo);

  function next(err, memo) {
    // Detach next operation from call stack to prevent overflow
    // Don't use setTimeout(, 0) -- this can introduce a long delay if
    //   previous operation was slow, as of Node 0.10.32
    if (err) {
      done(err, null);
    } else if (i < arr.length === false) {
      done(null, memo);
    } else {
      setImmediate(function() {
        iter(memo, arr[i++], next);
      });
    }
  }
};

// Handle information commands and remove them from the list
MapShaper.runAndRemoveInfoCommands = function(commands) {
  return Utils.filter(commands, function(cmd) {
    if (cmd.name == 'version') {
      console.error(getVersion());
    } else if (cmd.name == 'encodings') {
      MapShaper.printEncodings();
    } else if (cmd.name == 'help') {
      MapShaper.printHelp(cmd.options.commands);
    } else if (cmd.name == 'verbose') {
      MapShaper.VERBOSE = true;
    } else if (cmd.name == 'tracing') {
      MapShaper.TRACING = true;
    } else {
      return true;
    }
    return false;
  });
};

MapShaper.printHelp = function(commands) {
  MapShaper.getOptionParser().printHelp(commands);
};

// @src: a layer identifier or a filename
// if file -- import layer(s) from the file, merge arcs into @dataset,
//   but don't add source layer(s) to the dataset
//
MapShaper.getSourceLayer = function(src, dataset, opts) {
  var match = MapShaper.findMatchingLayers(dataset.layers, src),
      lyr;
  if (match.length > 1) {
    stop("[" + name + "] command received more than one source layer");
  } else if (match.length == 1) {
    lyr = match[0];
  } else {
    // assuming src is a filename
    var clipData = api.importFile(src, opts);
    // merge arcs from source data, but don't merge layer(s)
    dataset.arcs = MapShaper.mergeDatasets([dataset, clipData]).arcs;
    // TODO: handle multi-layer sources, e.g. TopoJSON files
    lyr = clipData.layers[0];
  }
  return lyr || null;
};

// @target is a layer identifier or a comma-sep. list of identifiers
// an identifier is a literal name, a name containing "*" wildcard or
// a 0-based array index
MapShaper.findMatchingLayers = function(layers, target) {
  var ii = [];
  target.split(',').forEach(function(id) {
    var i = Number(id),
        rxp = utils.wildcardToRegExp(id);
    if (Utils.isInteger(i)) {
      ii.push(i); // TODO: handle out-of-range index
    } else {
      layers.forEach(function(lyr, i) {
        if (rxp.test(lyr.name)) ii.push(i);
      });
    }
  });

  ii = Utils.uniq(ii); // remove dupes
  return Utils.map(ii, function(i) {
    return layers[i];
  });
};

utils.wildcardToRegExp = function(name) {
  var rxp = name.split('*').map(function(str) {
    return utils.regexEscape(str);
  }).join('.*');
  return new RegExp(rxp);
};

MapShaper.printLayerNames = function(layers) {
  var max = 10;
  message("Available layers:");
  if (layers.length === 0) {
    message("[none]");
  } else {
    for (var i=0; i<layers.length; i++) {
      if (i <= max) {
        message("... " + (layers.length - max) + " more");
        break;
      }
      message("[-" + i + "]  " + (layers[i].name || "[unnamed]"));
    }
  }
};




var cli = api.cli = {};

function getVersion() {
  var v;
  try {
    var packagePath = Node.resolvePathFromScript("../package.json"),
        obj = JSON.parse(Node.readFile(packagePath, 'utf-8'));
    v = obj.version;
  } catch(e) {}
  return v || "";
}

cli.isFile = Node.fileExists;
cli.isDirectory = Node.dirExists;
cli.readFile = Node.readFile;
cli.writeFile = Node.writeFile;

cli.validateFileExtension = function(path) {
  var type = MapShaper.guessFileType(path),
      valid = type == 'shp' || type == 'json';
  return valid;
};

cli.replaceFileExtension = function(path, ext) {
  var info = utils.parseLocalPath(path);
  return info.pathbase + '.' + ext;
};

cli.validateInputFiles = function(arr) {
  var files = Utils.map(arr, cli.validateInputFile);
  if (files.length === 0) error("Missing an input file");
  return files;
};

cli.validateInputFile = function(ifile) {
  var opts = {};
  cli.checkFileExists(ifile);
  if (!cli.validateFileExtension(ifile)) {
     error("File has an unsupported extension:", ifile);
  }
  return ifile;
};

cli.checkFileExists = function(path) {
  var stat = Node.statSync(path);
  if (!stat || stat.isDirectory()) {
    stop("File not found (" + path + ")");
  }
};

cli.printRepairMessage = function(info) {
  if (info.intersections_initial > 0) {
    message(Utils.format(
        "Repaired %'i intersection%s; unable to repair %'i intersection%s.",
        info.intersections_repaired, "s?", info.intersections_remaining, "s?"));
    /*
    if (info.intersections_remaining > 10) {
      if (!opts.snapping) {
        message("Tip: use --auto-snap to fix minor topology errors.");
      }
    }*/
  }
};

cli.validateEncoding = function(raw) {
  var enc = raw.replace(/-/, '').toLowerCase();
  if (!Utils.contains(MapShaper.getEncodings(), enc)) {
    console.error("[Unsupported encoding:", raw + "]");
    MapShaper.printEncodings();
    process.exit(0);
  }
  return enc;
};


Utils.extend(api.internal, {
  BinArray: BinArray,
  DouglasPeucker: DouglasPeucker,
  Visvalingam: Visvalingam,
  ShpReader: ShpReader,
  ShpType: ShpType,
  Bounds: Bounds
});

api.T = T;
C.VERBOSE = false;

if (typeof define === "function" && define.amd) {
  define("mapshaper", api);
} else if (typeof module === "object" && module.exports) {
  module.exports = api;
}
this.mapshaper = api;

})();
