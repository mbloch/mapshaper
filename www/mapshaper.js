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
    var ns = Opts.getNamespace("nytg.map");
    var count = ns.__unique || 0;
    ns.__unique = count + 1;
    return (prefix || "__id_") + count;
  },

  parseUrl: function parseUrl(url) {
    var obj,
      matches = /^(http|file|https):\/\/([^\/]+)(.*)/.exec(url); // TODO: improve
    if (matches) {
      obj = {
        protocol: matches[1],
        host: matches[2],
        path: matches[3]
      };
    }
    else {
      trace("[Utils.parseUrl()] unable to parse:", url);
    }
    return obj;
  },

  reduce: function(arr, func, val, ctx) {
    for (var i = 0, len = arr.length; i < len; i++) {
      val = func.call(ctx, val, arr[i]);
    }
    return val;
  },

  mapFilter: function(obj, func, ctx) {
    // if (!Utils.isArrayLike(obj)) return [];
    var arr = [],
        retn;
    for (var i=0, n = obj.length; i < n; i++) {
      retn = func.call(ctx, obj[i], i);
      if (retn !== void 0) arr.push(retn);
    }
    return arr;
  },

  map: function(obj, func, ctx) {
    if (!Utils.isArrayLike(obj)) error("Utils.map() requires an array");
    var retn = Utils.mapFilter(obj, func, ctx);
    if (retn.length !== obj.length) error("Utils.map() Sparse array");
    return retn;
  },

  // Convert an array-like object to an Array
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
  isArrayLike: function(obj) {
    if (!obj) return false;
    if (Utils.isArray(obj)) return true;
    if (Utils.isString(obj)) return false;
    if (obj.length === 0) return true;
    if (obj.length > 0) return true;
    return false;
    // TODO: eliminate objects with length property that are not numerically indexed.
  },

  isFunction: function(obj) {
    return typeof obj == 'function';
  },

  isObject: function(obj) {
    return obj === Object(obj); // via underscore
  },

  isArray: function(obj) {
    return obj instanceof Array; // breaks across frames and windows
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
    // TODO: extend targ prototype instead of wiping it out --
    //   in case inherit() is called after targ.prototype = {stuff}; statement
    targ.prototype = Utils.extend(new f(), targ.prototype); //
    targ.prototype.constructor = targ;
    targ.prototype.__super__ = f;
  },

  // @constructor Optional constructor function for child class
  //
  subclass: function(parent) {
    var child = function() {
      this.__super__.apply(this, Utils.toArray(arguments));
    };
    Opts.inherit(child, parent);
    var args = arguments;
    if (args.length > 1) {
      Utils.forEach(Utils.range(args.length, 1), function(i) {
        Utils.extend(child.prototype, args[i]);
      });
    }
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

/**
 * Support for timing using T.start() and T.stop("message")
 */
var T = {
  stack: [],
  verbose: true,

  start: function(msg) {
    if (T.verbose && msg) trace(T.prefix() + msg);
    T.stack.push(+new Date);
  },

  // Stop timing, print a message if T.verbose == true
  //
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

Utils.invert = function(obj) {
  var inv = {};
  for (var key in obj) {
    inv[obj[key]] = key;
  }
  return inv;
};

Utils.keys =
Utils.getKeys = function(obj) {
  var arr = [];
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      arr.push(key);
    }
  }
  return arr;
};

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
  return Utils.filterMap(src, function(el) {
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
  return Utils.mapFilter(arr, function(obj) {
    if (func.call(ctx, obj)) return obj;
  });
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

Utils.arrayToIndex = function(arr) {
  if (arguments.length > 1) error("#arrayToIndex() Use #indexOn() instead");
  return Utils.reduce(arr, function(index, key) {
    if (key in index) {
      trace("#arrayToIndex() Duplicate key:", key);
    }
    index[key] = true;
    return index;
  }, {});
};

Utils.forEach = function(obj, func, ctx) {
  if (Utils.isArrayLike(obj)) {
    Utils.mapFilter(obj, func, ctx);
  } else {
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        func.call(ctx, obj[key], key);
      }
    }
  }
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




Utils.lpad = function(str, size, pad) {
  pad = pad || ' ';
  str = String(str);
  var chars = size - str.length;
  while (chars-- > 0) {
    str = pad + str;
  }
  return str;
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

  /**
   * @param charset (optional) 'utf8' to read a string; if undefined, returns Buffer
   * @returns String if charset is provided, *** else Buffer object (node-specific object) ****
   */
  Node.readFile = function(fname, charset) {
    try {
      var content = Node.fs.readFileSync(fname, charset || void 0);
    } catch(e) {
      content = "";
      trace("[Node.readFile()] Error reading file:", fname, "\n\t", e);
    }
    return content;
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
  // Also supports old signature: function(url, callback, opts)
  //    callback: function(body)
  //
  Node.request = function(opts, callback, old_opts) {
    var url, receive;
    if (Utils.isString(opts)) { // @opts is string -> assume url & old interface
      url = opts;
      opts = old_opts || {};
      receive = function(err, resp, data) {
        if (err) {
          error(err);
        } else {
          callback(data);
        }
      };
    } else {
      url = opts.url;
      receive = callback;
    }

    var o = require('url').parse(url),
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
    }

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
        receive("Node.request() Unexpected status: " + res.statusCode + " url: " + url, res, null);
      }
      Node.readResponse(res, receive, 'utf8');
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
    //Node.readUrl(url, function(str) {
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
      var data;
      if (err) {
        trace("Node.request() error:", err);
        callback(null);
        return;
      }
      if (!str) {
        trace("Node.request() empty response()");
        callback(null);
        return;
      }
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
      callback(data);
    }, opts);
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
    if (Utils.isString(el)) { // if el is a string, treat as id
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
      })
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

  appendChild: function(el) {
    this.el.appendChild(el.el || el);
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
    trace("Use El.newChild or El.firstChild instead of El.child()");
    return arg ? this.newChild(arg) : this.firstChild();
  },

  firstChild: function() {
    var ch = this.el.firstChild;
    while (ch.nodeType != 1) { // skip text nodes
      ch = ch.nextSibling;
    }
    return new El(ch);
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
  return [this.xmin, this.ymin, this.xmax, this.ymax];
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
  return this.width * this.height() || 0;
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
  if (a > c || b > d) error("Bounds#setBounds() min/max reversed:", a, b, c, d);
  this.xmin = a;
  this.ymin = b;
  this.xmax = c;
  this.ymax = d;
  return this;
};

/*
Bounds.prototype.getCenterPoint = function() {
  if (!this.hasBounds()) error("Missing bounds");
  return new Point(this.centerX(), this.centerY());
};
*/

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

Bounds.prototype.mergeBounds = function(bb) {
  var a, b, c, d;
  if (bb.xmin !== void 0) {
    a = bb.xmin, b = bb.ymin, c = bb.xmax, d = bb.ymax;
  } else if (bb.length == 4) {
    a = bb[0], b = bb[1], c = bb[2], d = bb[3]; // expects array: [xmin, ymin, xmax, ymax]
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

  // @allDone Called when all tasks complete, with return values of task callbacks:
  //    allDone(val1, ...)
  // @error TODO: call optional error handler function if one or more tasks fail to complete
  //
  this.run = function(allDone, error) {
    var tasks = _tasks,
        values = [],
        needed = tasks.length;
    _tasks = []; // reset
    Utils.forEach(tasks, function(task, i) {
      function taskDone(data) {
        values[i] = data;
        if (--needed === 0) {
          allDone.apply(null, values);
        }
      }
      task(taskDone);
    });
    return this;
  };
}




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
      _self.dispatchEvent('dragend');
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
      _self.dispatchEvent('dragstart');
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

BinArray.maxCopySize = function(len, i) {
  return Math.min(len & 1 || len & 2 || 4, i & 1 || i & 2 || 4);
};

BinArray.bufferCopy = function(dest, destId, src, srcId, bytes) {
  srcId = srcId || 0;
  bytes = bytes || src.byteLength - srcId;
  if (dest.byteLength - destId < bytes)
    error("Buffer overflow; tried to write:", bytes);

  // When possible, copy buffer data in multi-byte chunks... Added this for faster copying of
  // shapefile data, which is aligned to 32 bits.
  var wordSize = Math.min(BinArray.maxCopySize(bytes, srcId), BinArray.maxCopySize(bytes, destId)),
      srcArr = BinArray.bufferToUintArray(src, wordSize),
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
  var dest = new ArrayBuffer(src.length);
  for (var i = 0, n=src.length; i < n; i++) {
    dest[i] = src[i];
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
    return this._view.getUint8(this._idx++);
  },

  writeUint8: function(val) {
    this._view.setUint8(this._idx++, val);
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

  readCString: function(fixedLen) {
    var str = "";
    var count = 0;
    while(!fixedLen || count < fixedLen) {
      var byteVal = this.readUint8();
      count ++;
      if (byteVal == 0) {
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

Utils.format = (function() {
  function getPadString(len, c) {
    var str = "";
    for (var i=0; i<len; i++)
      str += c;
    return str;
  }

  function formatValue(matches, val) {
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
        var padStr = getPadString(padDigits, padChar);
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

  var codeRxp = /%([\',+0]*)([1-9]?)((?:\.[1-9])?)([sdifxX%])/g;

  var format = function(s) {
    var arr = Array.prototype.slice.call(arguments, 1);
    var ostr = "";
    for (var startIdx=0, i=0, len=arr.length, matches; i<len && (matches=codeRxp.exec(s)); i++) {
      ostr += s.substring(startIdx, codeRxp.lastIndex - matches[0].length);
      ostr += formatValue(matches, arr[i]);
      startIdx = codeRxp.lastIndex;
    }
    codeRxp.lastIndex = 0;

    if (i != len) {
      error("[Utils.format()] formatting codes did not match inputs; string:", s);
    }
    ostr += s.substr(startIdx);
    return ostr;
  };

  // Returns a formatter function if called with one argument.
  // Returns a formatted string if called with two or more arguments.
  return function(fmt) {
    if (!Utils.isString(fmt)) {
      error("#format() Usage: Utils.format(format, [data ...])");
    } else if (arguments.length == 1) {
      return function() {
        var args = Utils.toArray(arguments);
        args.unshift(fmt);
        return format.apply(null, args);
      };
    } else {
      return format.apply(null, arguments);
    }
  };

}());







// TODO: adapt to run in browser
function stop(msg) {
  if (msg) trace(msg);
  process.exit(1);
}

var MapShaper = {};

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


function triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var area = 0.5 * Math.sqrt(detSq(ax, ay, bx, by, cx, cy) +
    detSq(ax, az, bx, bz, cx, cz) + detSq(ay, az, by, bz, cy, cz));
  return area;
}


// Given a triangle with vertices abc, return the distSq of the shortest segment
//   with one endpoint at b and the other on the line intersecting a and c.
//   If a and c are coincident, return the distSq between b and a/c
//
// Receive the distSq of the triangle's three sides.
//
function triangleHeightSq(ab2, bc2, ac2) {
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
    var data = calcArcBounds(_xx, _yy, _ii, _nn);
    _bb = data.bb;
    _allBounds = data.bounds;
  }

  function calcArcBounds(xx, yy, ii, nn) {
    var numArcs = ii.length,
        bb = new Float64Array(numArcs * 4),
        j, b;
    for (var i=0; i<numArcs; i++) {
      b = MapShaper.calcArcBounds(xx, yy, ii[i], nn[i]);
      j = i * 4;
      bb[j++] = b[0];
      bb[j++] = b[1];
      bb[j++] = b[2];
      bb[j] = b[3];
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
    Utils.forEach(coords, function(arc, arcId) {
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
    return Utils.map(Utils.range(this.size()), function(i) {
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

  // Return average magnitudes of dx, dy
  //
  this.getAverageSegment = function(max) {
    var count = 0,
        dx = 0,
        dy = 0,
        lim = max || Infinity;
    this.forEachSegment(function(i1, i2, xx, yy) {
      dx += Math.abs(xx[i1] - xx[i2]);
      dy += Math.abs(yy[i1] - yy[i2]);
      count++;
      if (count >= lim) return false;
    });
    return [dx / count, dy / count];
  };

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

  this.forEachSegment = function(cb) {
    var zlim = _zlimit,
        filtered = zlim > 0,
        nextArcStart = 0,
        arcId = -1,
        id1, id2, retn;
    for (var k=0, n=this.getPointCount(); k<n; k++) {
      if (!filtered || _zz[k] >= zlim) { // check: > or >=
        id1 = id2;
        id2 = k;
        if (k < nextArcStart) {
          retn = cb(id1, id2, _xx, _yy);
          if (retn === false) break;
        } else {
          do {
            arcId++;
            nextArcStart += _nn[arcId];
          } while (nextArcStart <= k);
        }
      }
    }
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

  function copyElements(src, i, dest, j, n) {
    if (src === dest && j > i) error ("copy error");
    var copied = 0;
    for (var k=0; k<n; k++) {
      copied++;
      dest[k + j] = src[k + i];
    }
  }

  function condenseArcs(map) {
    var goodPoints = 0,
        goodArcs = 0,
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
    Utils.forEach(thresholds, function(arr) {
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
    if (pct <= 0 || pct >= 1) error("Invalid simplification pct:", pct);
    var tmp = this.getRemovableThresholds();
    var k = Math.floor((1 - pct) * tmp.length);
    return Utils.findValueByRank(tmp, k + 1); // rank starts at 1
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
    this.pathCount = parts.length;
    this.parts = parts;
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
    return Utils.map(this.parts, function(ids) {
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
  this.hasNext = null;

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
    i = -1;
    n = ids.length;
    _arc = nextArc();
  };

  function nextArc() {
    i += 1;
    return (i < n) ? arcs.getArcIter(_ids[i]) : null;
  }

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




function draggable(ref) {
  var xdown, ydown;
  var el = El(ref),
      dragging = false,
      obj = new EventDispatcher();
  Browser.undraggable(el.node());
  el.on('mousedown', function(e) {
    xdown = e.pageX;
    ydown = e.pageY;
    Browser.on(window, 'mousemove', onmove);
    Browser.on(window, 'mouseup', onrelease);
  });

  function onrelease(e) {
    Browser.removeEventListener(window, 'mousemove', onmove);
    Browser.removeEventListener(window, 'mouseup', onrelease);
    if (dragging) {
      dragging = false;
      obj.dispatchEvent('dragend');
    }
  }

  function onmove(e) {
    if (!dragging) {
      dragging = true;
      obj.dispatchEvent('dragstart');
    }
    obj.dispatchEvent('drag', {dx: e.pageX - xdown, dy: e.pageY - ydown});
  }
  return obj;
}

function Slider(ref, opts) {
  var _el = El(ref);
  var _self = this;
  var defaults = {
    space: 7
  };
  opts = Opts.copyAllParams(defaults, opts);

  var _pct = 0;
  var _track,
      _handle,
      _handleLeft = opts.space;

  function size() {
    return _track ? _track.width() - opts.space * 2 : 0;
  }

  this.track = function(ref) {
    if (ref && !_track) {
      _track = El(ref);
      _handleLeft = _track.el.offsetLeft + opts.space;
      updateHandlePos();
    }
    return _track;
  };

  this.handle = function(ref) {
    var startX;
    if (ref && !_handle) {
      _handle = El(ref);
      draggable(_handle)
        .on('drag', function(e) {
          setHandlePos(startX + e.dx, true);
        })
        .on('dragstart', function(e) {
          startX = position();
          _self.dispatchEvent('start');
        })
        .on('dragend', function(e) {
          _self.dispatchEvent('end');
        });
      updateHandlePos();
    }
    return _handle;
  };

  function position() {
    return Math.round(_pct * size());
  }

  this.pct = function(pct) {
    if (pct >= 0 && pct <= 1) {
      _pct = pct;
      updateHandlePos();
    }
    return _pct;
  };

  function setHandlePos(x, fire) {
    x = Utils.clamp(x, 0, size());
    var pct = x / size();
    if (pct != _pct) {
      _pct = pct;
      _handle.css('left', _handleLeft + x);
      _self.dispatchEvent('change', {pct: _pct});
    }
  }

  function updateHandlePos() {
    var x = _handleLeft + Math.round(position());
    if (_handle) _handle.css('left', x);
  }
}

Opts.inherit(Slider, EventDispatcher);


function ClickText(ref) {
  var _el = El(ref);
  var _max = Infinity,
      _min = -Infinity,
      _formatter = function(v) {return String(v);},
      _validator = function(v) {return !isNaN(v);},
      _parser = function(s) {return parseFloat(s);},
      _value = 0;

  _el.on('blur', onblur, this);
  _el.on('keydown', onpress, this);

  function onpress(e) {
    if (e.keyCode == 27) { // esc
      this.value(_value); // reset input field to current value
      _el.el.blur();
    } else if (e.keyCode == 13) { // enter
      _el.el.blur();
    }
  }

  // Validate input contents.
  // Update internal value and fire 'change' if valid
  //
  function onblur() {
    var val = _parser(_el.el.value);
    if (val === _value) {
      // return;
    }
    if (_validator(val)) {
      this.value(val);
      this.dispatchEvent('change', {value:this.value()});
    } else {
      this.value(_value);
      this.dispatchEvent('error'); // TODO: improve
    }
  }

  this.bounds = function(min, max) {
    _min = min;
    _max = max;
    return this;
  };

  this.validator = function(f) {
    _validator = f;
    return this;
  };

  this.formatter = function(f) {
    _formatter = f;
    return this;
  };

  this.parser = function(f) {
    _parser = f;
    return this;
  };

  this.value = function(arg) {
    if (arg == void 0) {
      // var valStr = this.el.value;
      // return _parser ? _parser(valStr) : parseFloat(valStr);
      return _value;
    }
    var val = Utils.clamp(arg, _min, _max);
    if (!_validator(val)) {
      error("ClickText#value() invalid value:", arg);
    } else {
      _value = val;
    }
    _el.el.value = _formatter(val);
    return this;
  };
}

Opts.inherit(ClickText, EventDispatcher);


function Checkbox(ref) {
  var _el = El(ref);
}

Opts.inherit(Checkbox, EventDispatcher);

function SimpleButton(ref) {
  var _el = El(ref),
      _active = _el.hasClass('active');

  _el.on('click', function(e) {
    if (_active) this.dispatchEvent('click');
    return false;
  }, this);

  this.active = function(a) {
    if (a === void 0) return _active;
    if (a !== _active) {
      _active = a;
      _el.toggleClass('active');
    }
    return this;
  };
}

Opts.inherit(SimpleButton, EventDispatcher);

function FileChooser(el) {

  var input = El('form')
    .addClass('g-file-control').appendTo('body')
    .newChild('input')
    .attr('type', 'file')
    .attr('multiple', 'multiple')
    .on('change', onchange, this);
  /* input element properties:
    disabled
    name
    value  (path to the file)
    multiple  ('multiple' or '')
  */
  var btn = El(el).on('click', function() {
    input.el.click();
  });

  function onchange(e) {
    var files = e.target.files;
    // files may be undefined (e.g. if user presses 'cancel' after a file has been selected)
    if (files) {
      // disable the button while files are being processed
      btn.addClass('selected');
      input.attr('disabled', true);
      this.dispatchEvent('select', {files:files});
      btn.removeClass('selected');
      input.attr('disabled', false);
    }
  }
}

Opts.inherit(FileChooser, EventDispatcher);




var SimplifyControl = function() {
  var _value = 1;
  El('#g-simplify-control').show();
  var slider = new Slider("#g-simplify-control .g-slider");
  slider.handle("#g-simplify-control .g-handle");
  slider.track("#g-simplify-control .g-track");
  slider.on('change', function(e) {
    var pct = fromSliderPct(e.pct);
    text.value(pct);
    onchange(pct);
  });
  slider.on('start', function(e) {
    control.dispatchEvent('simplify-start');
  }).on('end', function(e) {
    control.dispatchEvent('simplify-end');
  });

  var text = new ClickText("#g-simplify-control .g-clicktext");
  text.bounds(0, 1);
  text.formatter(function(val) {
    if (isNaN(val)) return '-';

    var pct = val * 100;
    var decimals = 0;
    if (pct <= 0) decimals = 1;
    else if (pct < 0.001) decimals = 4;
    else if (pct < 0.01) decimals = 3;
    else if (pct < 1) decimals = 2;
    else if (pct < 100) decimals = 1;
    return Utils.formatNumber(pct, decimals) + "%";
  });

  text.parser(function(s) {
    return parseFloat(s) / 100;
  });

  text.value(0);
  text.on('change', function(e) {
    var pct = e.value;
    slider.pct(toSliderPct(pct));
    control.dispatchEvent('simplify-start');
    onchange(pct);
    control.dispatchEvent('simplify-end');
  });

  function toSliderPct(p) {
    p = Math.sqrt(p);
    var pct = 1 - p;
    return pct;
  }

  function fromSliderPct(p) {
    var pct = 1 - p;
    return pct * pct;
  }

  function onchange(val) {
    if (_value != val) {
      _value = val;
      control.dispatchEvent('change', {value:val});
    }
  }

  var control = new EventDispatcher();
  control.value = function(val) {
    if (!isNaN(val)) {
      // TODO: validate
      _value = val;
      slider.pct(toSliderPct(val));
      text.value(val);
    }
    return _value;
  };

  control.value(_value);
  return control;
};




// Convert path data from a non-topological source (Shapefile, GeoJSON, etc)
// to the format used for topology processing (see mapshaper-topology.js)
//
function PathImporter(pointCount, opts) {
  var xx = new Float64Array(pointCount),
      yy = new Float64Array(pointCount),
      buf = new Float64Array(1024),
      round = null;

  if (opts && opts.precision) {
    round = getRoundingFunction(opts.precision);
  }

  var paths = [],
      pointId = 0,
      openPaths = 0,
      shapeId = -1,
      pathsInShape,
      primaryPath,
      primaryPathArea;

  function endPrevShape() {
    if (primaryPathArea > 0) {
      primaryPath.isPrimary = true;
    }
  }

  this.startShape = function() {
    endPrevShape();
    shapeId++;
    primaryPath = null;
    primaryPathArea = 0;
    pathsInShape = 0;
  };

  // Import coordinates from an array with coordinates in format: [x, y, x, y, ...]
  // @offs Array index of first coordinate
  //
  this.importCoordsFromFlatArray = function(arr, offs, pointCount, isRing, isHole) {
    var findMaxParts = isRing,
        detectHoles = isRing && isHole === void 0,
        startId = pointId,
        x, y, prevX, prevY;

    for (var i=0; i<pointCount; i++) {
      x = arr[offs++];
      y = arr[offs++];

      if (round !== null) {
        x = round(x);
        y = round(y);
      }

      if (i === 0 || prevX != x || prevY != y) {
        xx[pointId] = x;
        yy[pointId] = y;
        pointId++;
      }
      prevX = x;
      prevY = y;
    }

    var validPoints = pointId - startId;
    var path = {
      size: validPoints,
      isHole: false,
      isPrimary: false,
      shapeId: shapeId
    };

    if (isRing) {
      var signedArea = msSignedRingArea(xx, yy, startId, validPoints);
      var err = null;
      if (validPoints < 4) {
        err = "Only " + validPoints + " valid points in ring";
      } else if (signedArea === 0) {
        err = "Zero-area ring";
      } else if (xx[startId] != xx[pointId-1] || yy[startId] != yy[pointId-1]) {
        err = "Open path";
      }

      if (err) {
        trace("Invalid ring in shape:", shapeId, "--", err);
        // pathObj.isNull = true;
        pointId -= validPoints; // backtrack...
        return false;
      }

      if (detectHoles) {
        if (signedArea < 0) {
          path.isHole = true;
        }
      } else {
        path.isHole = isHole;
        if (isHole && signedArea > 0 || !isHole && signedArea < 0) {
          // reverse coords
          MapShaper.reversePathCoords(xx, startId, validPoints);
          MapShaper.reversePathCoords(yy, startId, validPoints);
          signedArea *= -1;
        }
      }

      if (signedArea > primaryPathArea) {
        primaryPath = path;
        primaryPathArea = signedArea;
      }

      // TODO: detect shapes that only contain holes

    } else { // no rings (i.e. polylines)
      openPaths++;
      if (validPoints < 2) {
        trace("Collapsed path in shape:", shapeId, "-- skipping");
        pointId -= validPoints;
        return false;
      }
    }

    paths.push(path);
    pathsInShape++;
    return true;
  };


  // Import an array of [x, y] Points
  //
  this.importPoints = function(points, isRing, isHole) {
    var n = points.length,
        size = n * 2,
        p;
    if (buf.length < size) buf = new Float64Array(Math.ceil(size * 1.3));
    for (var i=0, j=0; i < n; i++) {
      p = points[i];
      buf[j++] = p[0];
      buf[j++] = p[1];
    }
    this.importCoordsFromFlatArray(buf, 0, n, isRing, isHole);
  };


  // TODO: detect null shapes, shapes that only have holes (error condition)
  //
  this.done = function() {
    endPrevShape();

    var skippedPoints = xx.length - pointId;
    if (xx.length > pointId) {
      xx = xx.subarray(0, pointId);
      yy = yy.subarray(0, pointId);
    }

    var info = {
      input_point_count: xx.length,
      input_part_count: paths.length,
      input_skipped_points: skippedPoints,
      input_shape_count: shapeId + 1,
      input_geometry_type: openPaths > 0 ? 'polyline' : 'polygon'
    };

    return {
      pathData: paths,
      xx: xx,
      yy: yy,
      info: info
    };
  };

}



var Dbf = {};

Dbf.importRecords = function(src) {
  return new DbfReader(src).readRows();
};

// DBF format references:
// http://www.dbf2002.com/dbf-file-format.html
// http://www.digitalpreservation.gov/formats/fdd/fdd000325.shtml
//
// TODO: handle non-ascii characters, e.g. multibyte encodings
// cf. http://code.google.com/p/stringencoding/
//
// @src is a Buffer or ArrayBuffer or filename
//
function DbfReader(src) {
  if (Utils.isString(src)) {
    src = Node.readFile(src);
  }
  var bin = new BinArray(src).littleEndian();
  this.header = this.readHeader(bin);
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

DbfReader.prototype.readHeader = function(bin) {
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
    var field = this.readFieldHeader(bin);
    field.columnOffset = colOffs;
    colOffs += field.size;
    header.fields.push(field);
  }

  if (colOffs != header.recordSize)
    error("Record length mismatch; header:", header.recordSize, "detected:", colOffs);
  return header;
};

DbfReader.prototype.getNumberReader = function(size, decimals) {
  return function(bin) {
    var str = bin.readCString(size);
    return parseFloat(str);
  };
};

DbfReader.prototype.getIntegerReader = function() {
  return function(bin) {
    return bin.readInt32();
  };
};

DbfReader.prototype.getStringReader = function(size) {
  return function(bin) {
    var str = bin.readCString(size);
    return Utils.trim(str);
  };
};

DbfReader.prototype.readFieldHeader = function(bin) {
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
    field.reader = this.getStringReader(field.size);
  } else if (field.type == 'F' || field.type == 'N') {
    field.reader = this.getNumberReader(field.size, field.decimals);
  } else if (field.type == 'I') {
    field.reader = this.getIntegerReader();
  } else {
    error("Unsupported DBF field type:", field.type);
  }
  return field;
};




Dbf.exportRecords = function(arr) {
  var fields = Utils.keys(arr[0]);
  var rows = arr.length;
  var fieldData = Utils.map(fields, function(name) {
    return Dbf.getFieldInfo(arr, name);
  });

  var headerBytes = Dbf.getHeaderSize(fieldData.length),
      recordBytes = Dbf.getRecordSize(Utils.pluck(fieldData, 'size')),
      fileBytes = headerBytes + rows * recordBytes + 1;

  var buffer = new ArrayBuffer(fileBytes);
  var bin = new BinArray(buffer).littleEndian();
  var now = new Date();
  var writers = Utils.map(fieldData, function(obj) {
    return Dbf.getFieldWriter(obj, bin);
  });

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
    var start = bin.position(),
        info, writer;
    bin.writeUint8(0x20); // delete flag; 0x20 valid 0x2a deleted
    for (var i=0, n=fieldData.length; i<n; i++) {
      info = fieldData[i];
      writer = writers[i];
      writer(rec[info.name]);
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

Dbf.getFieldInfo = function(arr, name) {
  var type = this.discoverFieldType(arr, name),
      data,
      info = {
        name: name,
        decimals: 0
      };

  if (type == 'number') {
    var MAX_INT = Math.pow(2, 31) -1,
        MIN_INT = ~MAX_INT,
        MAX_NUM = 99999999999999999,
        MAX_FIELD_SIZE = 19;
    data = this.getNumericFieldInfo(arr, name);
    info.decimals = data.decimals;
    if (info.decimals > 0 || data.min < MIN_INT || data.max > MAX_INT) {
      info.type = 'N';
      var maxSize = data.max.toFixed(info.decimals).length,
          minSize = data.min.toFixed(info.decimals).length;
      info.size = Math.max(maxSize, minSize);
      if (info.size > MAX_FIELD_SIZE) {
        info.size = MAX_FIELD_SIZE;
        info.decimals -= info.size - MAX_FIELD_SIZE;
        if (info.decimals < 0) {
          error ("Dbf#getFieldInfo() Out-of-range error.");
        }
      }
    } else {
      info.type = 'I';
      info.size = 4;
    }
  } else if (type == 'string') {
    info.type = 'C';
    info.size = this.discoverStringFieldLength(arr, name);
  } else {
    error("#getFieldInfo() unsupported field type:", type);
  }
  return info;
};

Dbf.discoverFieldType = function(arr, name) {
  var val;
  for (var i=0, n=arr.length; i<n; i++) {
    val = arr[i][name];
    if (Utils.isString(val)) return "string";
    if (Utils.isNumber(val)) return "number";
    if (Utils.isBoolean(val)) return "boolean";
  }
  return "null" ;
};

Dbf.getFieldWriter = function(obj, bin) {
  var formatter,
      writer;
  if (obj.type == 'C') {
    writer = function(val) {
      var str = String(val);
      bin.writeCString(str, obj.size);
    };
  } else if (obj.type == 'N') {
    formatter = Dbf.getDecimalFormatter(obj.size, obj.decimals);
    writer = function(val) {
      var str = formatter(val);
      bin.writeString(str, obj.size);
    };
  } else if (obj.type == 'I') {
    writer = function(val) {
      bin.writeInt32(val | 0);
    };
  } else {
    error("Dbf#getFieldWriter() Unsupported DBF type:", obj.type);
  }
  return writer;
}

Dbf.getDecimalFormatter = function(size, decimals) {
  return function(val) {
    // TODO: handle invalid values better
    var val = isFinite(val) ? val.toFixed(decimals) : '';
    return Utils.lpad(val, size, ' ');
  };
};

Dbf.getNumericFieldInfo = function(arr, name) {
  var decimals = 0,
      limit = 15,
      min = Infinity,
      max = -Infinity,
      validCount = 0,
      k = 1,
      val;
  for (var i=0, n=arr.length; i<n; i++) {
    val = arr[i][name];
    if (!Number.isFinite(val)) {
      continue;
    }
    validCount++;
    if (val < min) min = val;
    if (val > max) max = val;
    while (val * k % 1 !== 0) {
      if (decimals == limit) {
        trace ("#getNumericFieldInfo() exceeded limit")
        break;
      }
      decimals++;
      k *= 10;
    }
  }

  return {
    decimals: decimals,
    min: min,
    max: max
  };
};

Dbf.discoverStringFieldLength = function(arr, name) {
  var maxlen = 0,
      len;
  for (var i=0, n=arr.length; i<n; i++) {
    len = String(arr[i][name]).length;
    if (len > maxlen) {
      maxlen = len;
    }
  }
  if (maxlen > 254) maxlen = 254;
  return maxlen + 1;
};




function DataTable(arr) {
  var records = arr || [];

  this.exportAsDbf = function() {
    return Dbf.exportRecords(records);
  };

  this.getRecords = function() {
    return records;
  };

  this.size = function() {
    return records.length;
  };

}

// Import, manipulate and export data from a DBF file
function ShapefileTable(buf) {
  var reader = new DbfReader(buf);
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

  this.exportAsDbf = function() {
    // export original dbf string if records haven't been touched.
    return buf || table.exportAsDbf();
  };

  this.getRecords = function() {
    return getTable().getRecords();
  };

  this.size = function() {
    return reader ? reader.recordCount : table.size();
  };
}




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
    geometries = Utils.map(obj.features, function(feat) {
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
  Utils.forEach(geometries, function(geom) {
    importer.startShape();
    var f = geom && GeoJSON.pathImporters[geom.type];
    if (f) f(geom.coordinates, importer);
  });

  var importData = importer.done();
  var topoData = MapShaper.buildTopology(importData);
  var layer = {
      name: '',
      shapes: topoData.shapes,
      geometry_type: importData.info.input_geometry_type
    };
  if (properties) {
    layer.data = new DataTable(properties);
  }

  return {
    arcs: topoData.arcs,
    layers: [layer]
  };
};


var GeoJSON = MapShaper.geojson = {};

// Functions for importing geometry coordinates using a PathImporter
//
GeoJSON.pathImporters = {
  LineString: function(coords, importer) {
    importer.importPoints(coords, false, false);
  },
  MultiLineString: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      GeoJSON.pathImporters.LineString(coords[i], importer);
    }
  },
  Polygon: function(coords, importer) {
    for (var i=0; i<coords.length; i++) {
      importer.importPoints(coords[i], true, i > 0);
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

MapShaper.exportGeoJSON = function(layers, arcData) {
  return Utils.map(layers, function(layer) {
    var obj = MapShaper.exportGeoJSONObject(layer, arcData);
    return {
      content: JSON.stringify(obj),
      name: layer.name
    };
  });
};

MapShaper.exportGeoJSONObject = function(layerObj, arcData) {
  var type = layerObj.geometry_type;
  if (type != "polygon" && type != "polyline") error("#exportGeoJSONObject() Unsupported geometry type:", type);

  var geomType = type == 'polygon' ? 'MultiPolygon' : 'MultiLineString',
      properties = layerObj.data && layerObj.data.getRecords() || null,
      useFeatures = !!properties;

  if (useFeatures && properties.length !== layerObj.shapes.length) {
    error("#exportGeoJSON() Mismatch between number of properties and number of shapes");
  }
  var exporter = new PathExporter(arcData, type == 'polygon');
  var objects = Utils.map(layerObj.shapes, function(shapeIds, i) {
    var shape = exporter.exportShapeForGeoJSON(shapeIds);
    if (useFeatures) {
      return MapShaper.exportGeoJSONFeature(shape, geomType, properties[i]);
    } else {
      return MapShaper.exportGeoJSONGeometry(shape, geomType);
    }
  });

  var output = {
    bbox: exporter.getBounds().toArray()
  };

  if (useFeatures) {
    output.type = 'FeatureCollection';
    output.features = objects;
  } else {
    output.type = 'GeometryCollection';
    // null geometries not allowed in GeometryCollection
    output.geometries = Utils.filter(objects, function(obj) {
      return !!obj;
    });
  }

  return output;
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




var TopoJSON = MapShaper.topojson = {};

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
    layers: layers
  };
};

// Converts arc coordinates from rounded, delta-encoded values to
// transposed arrays of geographic coordinates.
//
TopoJSON.importArcs = function(arcs, transform, round) {
  var mx = 1, my = 1, bx = 0, by = 0,
      useDelta = !!transform;
  if (transform) {
    mx = transform.scale[0];
    my = transform.scale[1];
    bx = transform.translate[0];
    by = transform.translate[1];
  }

  return Utils.map(arcs, function(arc) {
    var xx = [],
        yy = [],
        prevX = 0,
        prevY = 0,
        scaledX, scaledY, x, y;
    for (var i=0, len=arc.length; i<len; i++) {
      x = arc[i][0];
      y = arc[i][1];
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
      xx.push(scaledX);
      yy.push(scaledY);
      prevX = x;
      prevY = y;
    }
    return [xx, yy];
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

// Export a TopoJSON string containing a single object containing a GeometryCollection
// TODO: Support ids from attribute data
// TODO: Support properties
//
MapShaper.exportTopoJSON = function(layers, arcData, opts) {

  // KLUDGE: make a copy of layer objects, so layer properties can be replaced
  // without side-effects outside this function
  layers = Utils.map(layers, function(lyr) {
    return Utils.extend({}, lyr);
  });

  var filteredArcs = arcData.getFilteredCopy();
  var transform = null;
  if (opts.topojson_resolution === 0) {
    // no transform
  } else if (opts.topojson_resolution > 0) {
    transform = TopoJSON.getExportTransform(filteredArcs, opts.topojson_resolution);
  } else if (opts.precision > 0) {
    transform = TopoJSON.getExportTransformFromPrecision(filteredArcs, opts.precision);
  } else {
    transform = TopoJSON.getExportTransform(filteredArcs); // auto quantization
  }

  var arcs, map;
  if (transform) {
    filteredArcs.applyTransform(transform, !!"round");
    map = TopoJSON.filterExportArcs(filteredArcs);
    arcs = TopoJSON.exportDeltaEncodedArcs(filteredArcs);
  } else {
    map = TopoJSON.filterExportArcs(filteredArcs);
    arcs = TopoJSON.exportArcs(filteredArcs);
  }
  var objects = {};
  var bounds = new Bounds();
  Utils.forEach(layers, function(lyr, i) {
    var geomType = lyr.geometry_type == 'polygon' ? 'MultiPolygon' : 'MultiLineString';
    var exporter = new PathExporter(filteredArcs, lyr.geometry_type == 'polygon');
    if (map) lyr.shapes = TopoJSON.remapLayerArcs(lyr.shapes, map);
    var obj = exportTopoJSONObject(exporter, lyr, geomType);
    var name = lyr.name || "layer" + (i + 1);
    objects[name] = obj;
    bounds.mergeBounds(exporter.getBounds());
  });

  var obj = {
    type: "Topology",
    arcs: arcs,
    objects: objects
  };

  if (transform) {
    var inv = transform.invert();
    obj.transform = {
      scale: [inv.mx, inv.my],
      translate: [inv.bx, inv.by]
    };
    obj.bbox = bounds.transform(inv).toArray();
  } else {
    obj.bbox = bounds.toArray();
  }

  return [{
    content: JSON.stringify(obj),
    name: ""
  }];
};

TopoJSON.remapLayerArcs = function(shapes, map) {
  return Utils.map(shapes, function(shape) {
    return shape ? TopoJSON.remapShapeArcs(shape, map) : null;
  });
};

// Re-index the arcs in a shape to account for removal of collapsed arcs.
//
TopoJSON.remapShapeArcs = function(src, map) {
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
        y = 0;
    while (iter.hasNext()) {
      arc.push([iter.x - x, iter.y - y]);
      x = iter.x;
      y = iter.y;
    }
    arcs.push(arc.length > 1 ? arc : null);
  });
  return arcs;
};

// Return a Transform object for converting geographic coordinates to quantized
// integer coordinates.
//
TopoJSON.getExportTransform = function(arcData, quanta) {
  var srcBounds = arcData.getBounds(),
      destBounds, xmax, ymax;
  if (quanta) {
    xmax = quanta - 1;
    ymax = quanta - 1;
  } else {
    var resXY = TopoJSON.calcExportResolution(arcData);
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
TopoJSON.calcExportResolution = function(arcData) {
  var xy = arcData.getAverageSegment(),
      k = 0.02;
  return [xy[0] * k, xy[1] * k];
};

function exportTopoJSONObject(exporter, lyr, type) {
  var properties = lyr.data ? lyr.data.getRecords() : null,
      ids = lyr.ids,
      obj = {
        type: "GeometryCollection"
      };
  obj.geometries = Utils.map(lyr.shapes, function(shape, i) {
    var paths = exporter.exportShapeForTopoJSON(shape),
        geom = exportTopoJSONGeometry(paths, type);
    geom.id = ids ? ids[i] : i;
    if (properties) {
      geom.properties = properties[i] || null;
    }
    return geom;
  });
  return obj;
}

function exportTopoJSONGeometry(paths, type) {
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
    error ("#exportTopoJSONGeometry() unsupported type:", type);
  }
  return obj;
}




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




MapShaper.importDbf = function(src) {
  T.start();
  var data = new DbfReader(src).read("table");
  T.stop("[importDbf()]");
  return data;
};

// Read Shapefile data from an ArrayBuffer or Buffer
// Build topology
//
MapShaper.importShp = function(src, opts) {
  T.start();
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
  var expectRings = Utils.contains([5,15,25], reader.type());

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
      importer.importCoordsFromFlatArray(coords, offs, pointsInPart, expectRings);
      offs += pointsInPart * 2;
    }
  });
  var importData = importer.done();
  T.stop("Import Shapefile");
  var topoData = MapShaper.buildTopology(importData);
  var layer = {
      name: '',
      shapes: topoData.shapes,
      geometry_type: importData.info.input_geometry_type
    };

  return {
    arcs: topoData.arcs,
    layers: [layer]
  };
};

// Convert topological data to buffers containing .shp and .shx file data
//
MapShaper.exportShp = function(layers, arcData, opts) {
  if (arcData instanceof ArcDataset === false || !Utils.isArray(layers)) error("Missing exportable data.");

  var files = [];
  Utils.forEach(layers, function(layer) {
    var obj = MapShaper.exportShpFile(layer, arcData);
    files.push({
        content: obj.shp,
        name: layer.name,
        extension: "shp"
      }, {
        content: obj.shx,
        name: layer.name,
        extension: "shx"
      });
    if (layer.data) {
      files.push({
        content: layer.data.exportAsDbf(),
        name: layer.name,
        extension: "dbf"
      });
    }
  });
  return files;
};

MapShaper.exportShpFile = function(layer, arcData) {
  var geomType = layer.geometry_type;
  if (geomType != 'polyline' && geomType != 'polygon') error("Invalid geometry type:", geomType);

  var isPolygonType = geomType == 'polygon';
  var shpType = isPolygonType ? 5 : 3;

  T.start();

  var exporter = new PathExporter(arcData, isPolygonType);
  var fileBytes = 100;
  var bounds = new Bounds();
  var shapeBuffers = Utils.map(layer.shapes, function(shapeIds, i) {
    var shape = MapShaper.exportShpRecord(shapeIds, exporter, i+1, shpType);
    fileBytes += shape.buffer.byteLength;
    if (shape.bounds) bounds.mergeBounds(shape.bounds);
    return shape.buffer;
  });


  T.stop("export shape records");
  T.start();

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
  Utils.forEach(shapeBuffers, function(buf, i) {
    var shpOff = shpBin.position() / 2,
        shpSize = (buf.byteLength - 8) / 2; // alternative: shxBin.writeBuffer(buf, 4, 4);
    shxBin.writeInt32(shpOff);
    shxBin.writeInt32(shpSize);
    shpBin.writeBuffer(buf);
  });

  var shxBuf = shxBin.buffer(),
      shpBuf = shpBin.buffer();

  T.stop("convert to binary");
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

    Utils.forEach(data.paths, function(part, i) {
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




// @content: ArrayBuffer or String
// @type: 'shapefile'|'json'
//
MapShaper.importContent = function(content, fileType, opts) {
  var data,
      fileFmt;
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

  // Calculate data to use for shape preservation
  var numArcs = data.arcs.size();
  var retainedPointCounts = new Uint8Array(numArcs);
  Utils.forEach(data.layers, function(layer) {
    if (layer.geometry_type == 'polygon') {
      var arcCounts = MapShaper.getArcCountsInLayer(layer.shapes, numArcs);
      layer.arcCounts = arcCounts;
      MapShaper.calcPointRetentionData(layer.shapes, retainedPointCounts, arcCounts);
    }
  });

  data.info = {
    input_format: fileFmt
  };
  data.retainedPointCounts = retainedPointCounts;
  return data;
};


MapShaper.getArcCountsInLayer = function(shapes, numArcs) {
  var counts = new Uint8Array(numArcs);
  Utils.forEach(shapes, function(shape) {
    if (shape) MapShaper.calcArcCountsInShape(counts, shape);
  });
  return counts;
};

MapShaper.calcArcCountsInShape = function(counts, shape) {
  var arcId, arcs;
  for (var j=0, pathCount = shape.length; j<pathCount; j++) {
    arcs = shape[j];
    for (var i=0, n=arcs.length; i<n; i++) {
      arcId = arcs[i];
      if (arcId < 0) arcId = ~arcId;
      counts[arcId] += 1;
    }
  }
};

// Calculate number of interior points to preserve in each arc
// to protect 'primary' rings from collapsing.
//
MapShaper.calcPointRetentionData = function(shapes, retainedPointCounts, arcCounts) {
  Utils.forEach(shapes, function(shape, shapeId) {
    if (!shape) return;
    for (var i=0, n=shape.length; i<n; i++) {
      var arcs = shape[i];
      // if a part has 3 or more arcs, assume it won't collapse...
      // TODO: look into edge cases where this isn't true
      if (arcs.length <= 2) { // && pathData[pathId].isPrimary) {
        MapShaper.calcRetainedCountsForRing(arcs, retainedPointCounts, arcCounts);
      }
    }
  });
  return retainedPointCounts;
};


// Calculate number of interior points in each arc of a topological ring
// that should be preserved in order to prevent ring from collapsing
// @path an array of one or more arc ids making up the ring
// @sharedArcFlags
// @minArcPoints array of counts of interior points to retain, indexed by arc id
// TODO: improve; in some cases, this method could fail to prevent degenerate rings
//
MapShaper.calcRetainedCountsForRing = function(path, retainedPointCounts, arcCounts) {
  var arcId;
  for (var i=0, arcCount=path.length; i<arcCount; i++) {
    arcId = path[i];
    if (arcId < 0) arcId = ~arcId;
    if (arcCount == 1) { // one-arc polygon (e.g. island) -- save two interior points
      retainedPointCounts[arcId] = 2;
    }
    else if (arcCounts[arcId] < 2) {
      retainedPointCounts[arcId] = 1; // non-shared member of two-arc polygon: save one point
    }
  }
};




function ShapefileCRS(prj) {

  this.exportAsPrj = function() {
    return prj;
  };
}



function DropControl(importer) {
  var el = El('#page-wrapper');
  el.on('dragleave', ondrag);
  el.on('dragover', ondrag);
  el.on('drop', ondrop);

  function ondrag(e) {
    // blocking drag events enables drop event
    e.preventDefault();
  }

  function ondrop(e) {
    e.preventDefault();
    importer.readFiles(e.dataTransfer.files);
  }
}

function ImportControl(editor) {
  var precisionInput = new ClickText("#g-import-precision-opt")
    .bounds(0, Infinity)
    .formatter(function(str) {
      var val = parseFloat(str);
      return !val ? '' : String(val);
    })
    .validator(function(str) {
      return str === '' || Utils.isNumber(parseFloat(str));
    });

  // Receive: FileList
  this.readFiles = function(files) {
    Utils.forEach(files, this.readFile, this);
  };

  // Receive: File object
  this.readFile = function(file) {
    var name = file.name,
        info = MapShaper.parseLocalPath(name),
        type = MapShaper.guessFileType(name),
        reader;
    if (type) {
      reader = new FileReader();
      reader.onload = function(e) {
        inputFileContent(name, type, reader.result);
      };
      if (type == 'shp' || type == 'dbf') {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file, 'UTF-8');
      }
    }
  };

  this.loadFile = function(path) {
    var type = guessFileType(path);
    if (type) {
      Utils.loadBinaryData(path, function(buf) {
        inputFileContent(path, type, buf);
      });
    }
  };

  // Index of imported objects, indexed by path base and then file type
  // e.g. {"shapefiles/states": {"dbf": [obj], "shp": [obj]}}
  var fileIndex = {}; //
  function inputFileContent(path, type, content) {
    var fileInfo = MapShaper.parseLocalPath(path),
        pathbase = fileInfo.pathbase,
        fname = fileInfo.filename,
        index = fileIndex[pathbase],
        data;

    if (!index) {
      index = fileIndex[pathbase] = {};
    }
    if (type in index) {
      // TODO: improve; this can cause false conflicts,
      // e.g. states.json and states.topojson
      trace("inputFileContent() File has already been imported; skipping:", fname);
      return;
    }
    if (type == 'shp' || type == 'json') {
      var opts = {
        input_file: fname,
        precision: precisionInput.value()
      };
      data = MapShaper.importContent(content, type, opts);
      editor.addData(data, opts);
    } else if (type == 'dbf') {
      data = new ShapefileTable(content);
      // TODO: validate table (check that record count matches, etc)
      if ('shp' in index) {
        index.shp.layers[0].data = data;
      }
    } else {
      return; // ignore unsupported files
      // error("inputFileContent() Unexpected file type:", path);
    }

    // TODO: accept .prj files
    if (type == 'prj') {
      error("inputFileContent() .prj files not supported (yet)");
      data = new ShapefileCRS(content);
      if ('shp' in index) {
        index.shp.crs = data;
      }
    }

    // associate previously imported Shapefile files with a .shp file
    if (type == 'shp') {
      if ('dbf' in index) {
        data.layers[0].data = index.dbf;
      }
      if ('prj' in index) {
        data.crs = index.prj;
      }
    }

    index[type] = data;
  }
}

Opts.inherit(ImportControl, EventDispatcher);





MapShaper.getDefaultFileExtension = function(fileType) {
  var ext = "";
  if (fileType == 'shapefile') {
    ext = 'shp';
  } else if (fileType == 'geojson' || fileType == 'topojson') {
    ext = "json";
  }
  return ext;
};

// Return an array of objects with "filename" "filebase" "extension" and "content" attributes.
//
MapShaper.exportContent = function(layers, arcData, opts) {
  var exporter = MapShaper.exporters[opts.output_format];
  if (!exporter) error("exportContent() Unknown export format:", opts.output_format);
  if (!opts.output_extension) opts.output_extension = MapShaper.getDefaultFileExtension(opts.output_format);
  if (!opts.output_file_base) opts.output_file_base = "out";

  validateLayerData(layers);
  T.start();
  var files = exporter(layers, arcData, opts);
  T.stop("Export " + opts.output_format);

  assignFileNames(files, opts);
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

  function assignFileNames(files, opts) {
    var index = {};
    Utils.forEach(files, function(file) {
      file.extension = file.extension || opts.output_extension;
      var name = opts.output_file_base,
          i = 1,
          filebase, filename, ext;
      if (file.name) {
        name += "-" + file.name;
      }
      do {
        filebase = name;
        if (i > 1) {
          filebase = filebase + String(i);
        }
        filename = filebase + '.' + file.extension;
        i++;
      } while (filename in index);

      index[filename] = true;
      file.filebase = filebase;
      file.filename = filename;
    });
  }
};

MapShaper.exporters = {
  geojson: MapShaper.exportGeoJSON,
  topojson: MapShaper.exportTopoJSON,
  shapefile: MapShaper.exportShp
};

MapShaper.PathExporter = PathExporter; // for testing

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
  // Assume positive rings are CCW and negative rings are CW, like Shapefile
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
        // trace("Zero-area ring, skipping")
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
        // trace(paths)
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




// Export buttons and their behavior
//
var ExportControl = function(arcData, layers, options) {

  El('#g-export-control').show();

  // TODO: URL.createObjectURL() is available in Safari 7.0 but downloading
  // fails. Need to handle.
  // Consider: listening for window.onbeforeunload
  //
  if (typeof URL == 'undefined' || !URL.createObjectURL) {
    El('#g-export-control .g-label').text("Exporting is not supported in this browser");
    return;
  }

  var anchor = El('#g-export-control').newChild('a').attr('href', '#').node(),
      blobUrl;

  El('#g-export-buttons').css('display:inline');

  var geoBtn = exportButton("#g-geojson-btn", "geojson"),
      shpBtn = exportButton("#g-shapefile-btn", "shapefile"),
      topoBtn = exportButton("#g-topojson-btn", "topojson");

  function exportButton(selector, format) {

    function onClick(e) {
      btn.active(false);
      setTimeout(function() {
        exportAs(format, function() {
          btn.active(true);
        });
      }, 10);
    }

    var btn = new SimpleButton(selector).active(true).on('click', onClick);
    return btn;
  }

  function exportAs(format, done) {
    var opts = {
        output_format: format,
        output_extension: MapShaper.getDefaultFileExtension(format)
      },
      files, file;
    Utils.extend(opts, options);
    files = MapShaper.exportContent(layers, arcData, opts);

    if (!Utils.isArray(files) || files.length === 0) {
      error("exportAs() Export failed.");
    } else if (files.length == 1) {
      file = files[0];
      saveBlob(file.filename, new Blob([file.content]));
      done();
    } else {
      saveZipFile((opts.output_file_base || "out") + ".zip", files, done);
    }
  }


  function saveBlob(filename, blob) {
    if (window.navigator.msSaveBlob) {
      window.navigator.msSaveBlob(blob, filename);
      return;
    }

    try {
      // revoke previous download url, if any. TODO: do this when download completes (how?)
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(blob);
    } catch(e) {
      alert("Mapshaper can't export files from this browser. Try switching to Chrome or Firefox.");
      return;
    }

    anchor.href = blobUrl;
    anchor.download = filename;
    var clickEvent = document.createEvent("MouseEvent");
    clickEvent.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false,
        false, false, false, 0, null);
    anchor.dispatchEvent(clickEvent);
  }

  function saveZipFile(zipfileName, files, done) {
    var toAdd = files;
    try {
      zip.createWriter(new zip.BlobWriter("application/zip"), addFile, zipError);
    } catch(e) {
      if (Utils.parseUrl(Browser.getPageUrl()).protocol == 'file') {
        alert("This browser doesn't support offline .zip file creation.");
      } else {
        alert("This browser doesn't support .zip file creation.");
      }
    }

    function zipError(msg) {
      error(msg);
    }

    function addFile(archive) {
      if (toAdd.length === 0) {
        archive.close(function(blob) {
          saveBlob(zipfileName, blob);
          done();
        });
      } else {
        var obj = toAdd.pop(),
            blob = new Blob([obj.content]);
        archive.add(obj.filename, new zip.BlobReader(blob), function() {addFile(archive);});
      }
    }
  }

  /*
  function blobToDataURL(blob, cb) {
    var reader = new FileReader();
    reader.onload = function() {
      cb(reader.result);
    };
    reader.readAsDataURL(blob);
  }
  */
};




// buildTopology() converts non-topological polygon data into a topological format
//
// Input format:
// {
//    xx: [Array|Float64Array],   // x-coords of each point in the dataset
//    yy: [Array|Float64Array],   // y-coords "  "  "  "
//    pathData: [Array] // array of path data records, e.g.: {size: 20, shapeId: 3, isHole: false, isPrimary: true}
// }
// Note: x- and y-coords of all paths are concatenated into two long arrays, for easy indexing
// Note: Input coords can use typed arrays (better performance) or regular arrays (for testing)
//
// Output format:
// {
//    arcs: [Array],   // Arcs are represented as two-element arrays
//                     //   arc[0] and arc[1] are x- and y-coords in an Array or Float64Array
//    shapes: [Array]  // Shapes are arrays of one or more path; paths are arrays of one or more arc id.
// }                   //   Arc ids use the same numbering scheme as TopoJSON (see note).
// Note: Arc ids in the shapes array are indices of objects in the arcs array.
//       Negative ids signify that the arc coordinates are in reverse sequence.
//       Negative ids are converted to array indices with the fornula fwId = ~revId.
//       -1 is arc 0 reversed, -2 is arc 1 reversed, etc.
// Note: Arcs use typed arrays or regular arrays for coords, depending on the input array type.
//
MapShaper.buildTopology = function(obj) {
  if (!(obj.xx && obj.yy && obj.pathData)) error("#buildTopology() Missing required param/s");

  T.start();
  var topoData = buildPathTopology(obj.xx, obj.yy, obj.pathData);
  var shapes = groupPathsByShape(topoData.paths, obj.pathData, obj.info.input_shape_count);
  T.stop("Process topology");
  return {
    arcs: topoData.arcs,
    shapes: shapes
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


// Transform spaghetti paths into topological paths
//
function buildPathTopology(xx, yy, pathData) {

  // Hash an x, y point to a non-negative integer
  var hashXY = (function() {
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
  }());

  var pointCount = xx.length,
      index = new ArcIndex(pointCount, hashXY),
      typedArrays = !!(xx.subarray && yy.subarray),
      slice, array;

  var pathIds = initPathIds(pointCount, pathData);

  if (typedArrays) {
    array = Float64Array;
    slice = xx.subarray;
  } else {
    array = Array;
    slice = Array.prototype.slice;
  }

  T.start();
  var chainIds = initPointChains(xx, yy, hashXY, !"verbose");
  T.stop("Find matching vertices");

  T.start();
  var pointId = 0;
  var paths = Utils.map(pathData, function(pathObj) {
    var pathLen = pathObj.size,
        arcs = pathLen < 2 ? null : convertPath(pointId, pointId + pathLen - 1);
    pointId += pathLen;
    return arcs;
  });

  var arcs = new ArcDataset(index.getArcs());
  T.stop("Find topological boundaries");

  return {
    paths: paths,
    arcs: arcs
  };

  function nextPoint(id) {
    var partId = pathIds[id];
    if (pathIds[id+1] === partId) {
      return id + 1;
    }
    var len = pathData[partId].size;
    return sameXY(id, id - len + 1) ? id - len + 2 : -1;
  }

  function prevPoint(id) {
    var partId = pathIds[id];
    if (pathIds[id - 1] === partId) {
      return id - 1;
    }
    var len = pathData[partId].size;
    return sameXY(id, id + len - 1) ? id + len - 2 : -1;
  }

  function sameXY(a, b) {
    return xx[a] == xx[b] && yy[a] == yy[b];
  }


  // Convert a non-topological path to one or more topological arcs
  // @start, @end are ids of first and last points in the path
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

    error("Unmatched ring:", pathData[pathId]);
  }
}


// Create a lookup table for path ids; path ids are indexed by point id
//
function initPathIds(size, pathData) {
  var pathIds = new Int32Array(size),
      j = 0;
  for (var pathId=0, pathCount=pathData.length; pathId < pathCount; pathId++) {
    for (var i=0, n=pathData[pathId].size; i<n; i++, j++) {
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
function initPointChains(xx, yy, hash, verbose) {
  var pointCount = xx.length,
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

// Export functions for testing
MapShaper.topology = {
  buildPathTopology: buildPathTopology,
  ArcIndex: ArcIndex,
  groupPathsByShape: groupPathsByShape,
  initPathIds: initPathIds
};




function ShapeRenderer() {

  function drawCircle(x, y, size, col, ctx) {
    if (size > 0) {
      ctx.beginPath();
      ctx.fillStyle = col;
      ctx.arc(x, y, size * 0.5, 0, Math.PI * 2, true);
      ctx.fill();
    }
  }

  this.drawPoints = function(paths, style, ctx) {
    var midCol = style.dotColor || "rgba(255, 50, 50, 0.5)",
        endCol = style.nodeColor || midCol,
        midSize = style.dotSize || 4,
        endSize = style.nodeSize >= 0 ? style.nodeSize : midSize,
        prevX, prevY;

    paths.forEach(function(vec) {
      if (vec.hasNext()) {
        drawCircle(vec.x, vec.y, endSize, endCol, ctx);
      }
      if (vec.hasNext()) {
        prevX = vec.x;
        prevY = vec.y;
        while (vec.hasNext()) {
          drawCircle(prevX, prevY, midSize, midCol, ctx);
          prevX = vec.x;
          prevY = vec.y;
        }
        drawCircle(prevX, prevY, endSize, endCol, ctx);
      }
    });
  };

  this.drawShapes = function(paths, style, ctx) {
    var stroked = !!(style.strokeWidth && style.strokeColor),
        filled = !!style.fillColor;

    if (stroked) {
      ctx.lineWidth = style.strokeWidth;
      ctx.strokeStyle = style.strokeColor;
      //ctx.lineJoin = 'round';
    }
    if (filled) {
      ctx.fillStyle = style.fillColor;
    }
    if (!stroked && !filled) {
      trace("#drawLine() Line is missing stroke and fill; style:", style);
      return;
    }

    var pathCount = 0, segCount = 0;
    paths.forEach(function(vec) {
      if (vec.hasNext()) {
        ctx.beginPath();
        ctx.moveTo(vec.x, vec.y);
        pathCount++;

        while (vec.hasNext()) {
          ctx.lineTo(vec.x, vec.y);
          segCount++;
        }

        if (filled) ctx.fill();
        if (stroked) ctx.stroke();
      }
    });
    return {
      paths: pathCount,
      segments: segCount
    };
  };
}


function CanvasLayer() {

  var canvas = El('canvas').css('position:absolute;').node(),
      ctx = canvas.getContext('2d');

  this.getContext = function() {
    return ctx;
  };

  this.prepare = function(w, h) {
    if (w != canvas.width || h != canvas.height) {
      this.resize(w, h);
    } else {
      this.clear();
    }
  };

  this.resize = function(w, h) {
    canvas.width = w;
    canvas.height = h;
  };

  this.clear = function() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  this.getElement = function() {
    return El(canvas);
  };
}




// A collection of paths that can be filtered to exclude paths and points
// that can't be displayed at the current map scale. For drawing paths on-screen.
// TODO: Look into generalizing from Arc paths to SimpleShape and MultiShape
//
function FilteredPathCollection(unfilteredArcs, opts) {
  var defaults = {
        min_path: 0.9,   // min pixel size of a drawn path
        min_segment: 0.6 // min pixel size of a drawn segment
      };

  var _filterBounds,
      _transform,
      _sortedThresholds,
      filteredArcs,
      filteredSegLen,
      arcData,
      getPathWrapper;

  opts = Utils.extend(defaults, opts);
  init();

  function init() {
    // Sort simplification thresholds for all non-endpoint vertices
    // for quick conversion of simplification percentage to threshold value.
    // For large datasets, use every nth point, for faster sorting.
    var size = unfilteredArcs.getPointCount(),
        nth = Math.ceil(size / 5e5);
    _sortedThresholds = unfilteredArcs.getRemovableThresholds(nth);
    Utils.quicksort(_sortedThresholds, false);

    // For large datasets, create a filtered copy of the data for faster rendering
    if (size > 5e5) {
      initFilteredArcs();
    }
  }

  function initFilteredArcs() {
    var filterPct = 0.08;
    var filterZ = _sortedThresholds[Math.floor(filterPct * _sortedThresholds.length)];
    filteredArcs = unfilteredArcs.setRetainedInterval(filterZ).getFilteredCopy();
    unfilteredArcs.setRetainedPct(1); // clear simplification
    var avgXY = filteredArcs.getAverageSegment();
    filteredSegLen = avgXY[0] + avgXY[1]; // crude approximation of avg. segment length
  }

  this.update = function(arcs) {
    unfilteredArcs = arcs;
    init();
  };

  this.setRetainedPct = function(pct) {
    var z = _sortedThresholds[Math.floor(pct * _sortedThresholds.length)];
    this.setRetainedInterval(z);
  };

  this.setRetainedInterval = function(z) {
    unfilteredArcs.setRetainedInterval(z);
    if (filteredArcs) {
      filteredArcs.setRetainedInterval(z);
    }
  };

  this.reset = function() {
    _filterBounds = null;
    _transform = null;
    arcData = unfilteredArcs;
    getPathWrapper = getDrawablePathsIter;
    return this;
  };

  this.filterPaths = function(b) {
    _filterBounds = b;
    return this;
  };

  this.filterPoints = function(b) {
    _filterBounds = b;
    getPathWrapper = getDrawablePointsIter;
    return this;
  };

  this.transform = function(tr) {
    var unitsPerPixel = 1/tr.mx;
    _transform = tr;
    if (_filterBounds) {
      _filterBounds = _filterBounds.clone().transform(tr);
    }
    // Use a filtered version of the arcs at small scales
    if (filteredArcs && unitsPerPixel > filteredSegLen * 1.5) {
      arcData = filteredArcs;
    }

    return this;
  };

  // Wrap path iterator to filter out offscreen points
  //
  function getDrawablePointsIter() {
    var bounds = _filterBounds || error("#getDrawablePointsIter() missing bounds");
    var src = getDrawablePathsIter(),
        wrapped;
    var wrapper = {
      x: 0,
      y: 0,
      node: false,
      hasNext: function() {
        var path = wrapped;
        while (path.hasNext()) {
          if (bounds.containsPoint(path.x, path.y)) {
            this.x = path.x;
            this.y = path.y;
            this.node = path.node;
            return true;
          }
        }
        return false;
      }
    };

    return function(iter) {
      wrapped = iter;
      return wrapper;
    };
  }

  // Wrap vector path iterator to convert geographic coordinates to pixels
  //   and skip over invisible clusters of points (i.e. smaller than a pixel)
  //
  function getDrawablePathsIter() {
    var transform = _transform || error("#getDrawablePathsIter() Missing a Transform object; remember to call .transform()");
    var wrapped,
        _firstPoint,
        _minSeg = opts.min_segment;

    var wrapper = {
      x: 0,
      y: 0,
      hasNext: function() {
        var t = transform, mx = t.mx, my = t.my, bx = t.bx, by = t.by;
        var path = wrapped,
            isFirst = _firstPoint,
            x, y, prevX, prevY,
            i = 0;
        if (!isFirst) {
          prevX = this.x;
          prevY = this.y;
        }
        while (path.hasNext()) {
          i++;
          x = path.x * mx + bx;
          y = path.y * my + by;
          if (isFirst || Math.abs(x - prevX) > _minSeg || Math.abs(y - prevY) > _minSeg) {
            break;
          }
        }
        if (i === 0) return false;
        _firstPoint = false;
        this.x = x;
        this.y = y;
        return true;
      }
    };

    return function(iter) {
      _firstPoint = true;
      wrapped = iter;
      return wrapper;
    };
  }

  // TODO: refactor
  //
  this.forEach = function(cb) {
    var src = arcData;

    var allIn = true,
        filterOnSize = !!(_transform && _filterBounds),
        arc = new Arc(src),
        wrap = getPathWrapper(),
        minPathSize, geoBounds, geoBBox;

    if (filterOnSize) {
      minPathSize = opts.min_path / _transform.mx;
      geoBounds = _filterBounds.clone().transform(_transform.invert());
      geoBBox = geoBounds.toArray();
      allIn = geoBounds.contains(src.getBounds());
    }

    for (var i=0, n=src.size(); i<n; i++) {
      arc.init(i);
      if (filterOnSize && arc.smallerThan(minPathSize)) continue;
      if (!allIn && !arc.inBounds(geoBBox)) continue;
      cb(wrap(arc.getPathIter()));
    }
  };
}



// Group of one ore more layers sharing the same set of arcs
// @arcs a FilteredPathCollection object (mapshaper-gui-shapes.js)
//
function ArcLayerGroup(arcs, opts) {
  var _self = this;
  var _surface = new CanvasLayer();

  var _arcLyr = new ShapeLayer(arcs, _surface, opts),
      _layers = [_arcLyr],
      _map;

  var _visible = true;
  this.visible = function(b) {
    if (arguments.length === 0 ) return _visible;

    if (b) {
      _visible = true;
    } else {
      _visible = false;
      _surface.clear();
    }
  };

  this.refresh = function() {
    if (_map) drawLayers();
  };

  this.setMap = function(map) {
    _map = map;
    _surface.getElement().appendTo(map.getElement());
    map.on('refresh', drawLayers, this);
    map.getExtent().on('change', drawLayers, this);
  };

  function drawLayers() {
    if (!_self.visible()) return;
    var ext = _map.getExtent();
    _surface.prepare(ext.width(), ext.height());
    Utils.forEach(_layers, function(lyr) {
      lyr.draw(ext); // visibility handled by layer
    });
  }
}

// @shapes a FilteredPathCollection object
//
function ShapeLayer(shapes, surface, opts) {
  var renderer = new ShapeRenderer();
  var _visible = true;
  var style = {
    strokeWidth: 1,
    strokeColor: "#335",
    strokeAlpha: 1
  };

  Utils.extend(style, opts);

  this.visible = function(b) {
    return arguments.length === 0 ? _visible : _visible = !b, this;
  };

  this.draw = function(ext) {
    if (!this.visible()) return;
    //T.start();
    shapes.reset().filterPaths(ext.getBounds()).transform(ext.getTransform());
    var info = renderer.drawShapes(shapes, style, surface.getContext());

    if (style.dotSize) {
      shapes.reset().filterPaths(ext.getBounds()).transform(ext.getTransform());
      renderer.drawPoints(shapes, style, surface.getContext());
    }
    // TODO: find a way to enable circles at an appropriate zoom
    // if (ext.scale() > 0) renderer.drawPoints(src.shapes().filterPoints(ext.getBounds()).transform(ext.getTransform()), surface.getContext());
    // T.stop("- paths: " + info.paths + " segs: " + info.segments);
  };
}

Opts.inherit(ShapeLayer, Waiter);





function MshpMouse(ext) {
  var p = ext.position(),
      mouse = new MouseArea(p.element),
      _fx, _fy; // zoom foci, [0,1]

  var zoomTween = new NumberTween(function(scale, done) {
    ext.rescale(scale, _fx, _fy);
  });

  mouse.on('dblclick', function(e) {
    var from = ext.scale(),
        to = from * 3;
    _fx = e.x / ext.width();
    _fy = e.y / ext.height();
    zoomTween.start(from, to);
  });

  mouse.on('drag', function(e) {
    ext.pan(e.dx, e.dy);
  });

  var wheel = new MouseWheel(mouse);
  wheel.on('mousewheel', function(e) {
    var k = 1 + (0.11 * e.multiplier),
        delta = e.direction > 0 ? k : 1 / k;
    ext.rescale(ext.scale() * delta, e.x / ext.width(), e.y / ext.height());
  });
}




//
//
function MshpMap(el, opts_) {
  var defaults = {
    bounds: null,
    padding: 0 // margin around content at full extent, in pixels
  };
  var opts = Utils.extend(defaults, opts_);
  if (opts.bounds instanceof Bounds === false) {
    error("[MshpMap()] missing required bounds option");
  }

  var _root = El(el);
  var _slider,
      _groups = [];

  var _ext = new MapExtent(_root, opts.bounds).setContentPadding(opts.padding);
  var _mouse = new MshpMouse(_ext);
  initHomeButton();

  this.getExtent = function() {
    return _ext;
  };

  this.addLayerGroup = function(group) {
    group.setMap(this);
    _groups.push(group);
    this.dispatchEvent('refresh');
  };

  this.getElement = function() {
    return _root;
  };

  function initHomeButton() {
    var _full = null;
    var btn = El('div').addClass('g-home-btn').appendTo(_root)
      .on('click', function(e) {
        _ext.reset();
      })
      .newChild('img').attr('src', "images/home.png").parent();

    _ext.on('change', function() {
      var isFull = _ext.scale() === 1;
      if (isFull !== _full) {
        _full = isFull;
        if (!isFull) btn.addClass('active');
        else btn.removeClass('active');
      }
    });
  }
}

Opts.inherit(MshpMap, EventDispatcher);


function MapExtent(el, initialBounds) {
  var _position = new ElementPosition(el),
      _padPix = 0,
      _cx,
      _cy,
      _scale = 1;

  if (!initialBounds || !initialBounds.hasBounds()) {
    error("[MapExtent] Invalid bounds:", initialBounds);
  }

  _position.on('resize', function() {
    this.dispatchEvent('change');
    this.dispatchEvent('resize');
  }, this);

  this.reset = function() {
    this.recenter(initialBounds.centerX(), initialBounds.centerY(), 1);
  };

  this.recenter = function(cx, cy, scale) {
    if (!scale) scale = _scale;
    if (!(cx == _cx && cy == _cy && scale == _scale)) {
      _cx = cx;
      _cy = cy;
      _scale = scale;
      this.dispatchEvent('change');
    }
  };

  this.pan = function(xpix, ypix) {
    var t = this.getTransform();
    this.recenter(_cx - xpix / t.mx, _cy - ypix / t.my);
  };

  // Zoom to @scale (a multiple of the map's full scale)
  // @xpct, @ypct: optional focus, [0-1]...
  //
  this.rescale = function(scale, xpct, ypct) {
    if (arguments.length < 3) {
      xpct = 0.5;
      ypct = 0.5;
    }
    var b = this.getBounds(),
        fx = b.xmin + xpct * b.width(),
        fy = b.ymax - ypct * b.height(),
        dx = b.centerX() - fx,
        dy = b.centerY() - fy,
        ds = _scale / scale,
        dx2 = dx * ds,
        dy2 = dy * ds,
        cx = fx + dx2,
        cy = fy + dy2;
    this.recenter(cx, cy, scale);
  };

  this.resize = _position.resize;
  this.width = _position.width;
  this.height = _position.height;
  this.position = _position.position;

  this.scale = function() {
    return _scale;
  };

  this.setContentPadding = function(pix) {
    _padPix = pix;
    this.reset();
    return this;
  };

  // Get params for converting geographic coords to pixel coords
  this.getTransform = function() {
    // get transform (y-flipped);
    var viewBounds = new Bounds(0, 0, _position.width(), _position.height());
    return this.getBounds().getTransform(viewBounds, true);
  };

  this.getBounds = function() {
    return centerAlign(calcBounds(_cx, _cy, _scale));
  };

  function calcBounds(cx, cy, scale) {
    var w = initialBounds.width() / scale,
        h = initialBounds.height() / scale;
    return new Bounds(cx - w/2, cy - h/2, cx + w/2, cy + h/2);
  }

  // Receive: Geographic bounds of content to be centered in the map
  // Return: Geographic bounds of map window centered on @contentBounds,
  //    with padding applied
  function centerAlign(contentBounds) {
    var bounds = contentBounds.clone(),
        wpix = _position.width() - 2 * _padPix,
        hpix = _position.height() - 2 * _padPix,
        padGeo;
    if (wpix <= 0 || hpix <= 0) {
      return new Bounds(0, 0, 0, 0);
    }
    bounds.fillOut(wpix / hpix);
    padGeo = _padPix * bounds.width() / wpix; // per-pixel scale
    bounds.padBounds(padGeo, padGeo, padGeo, padGeo);
    return bounds;
  }

  this.reset(); // initialize map extent
}

Opts.inherit(MapExtent, EventDispatcher);




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
  return function(dest, xx, yy, zz) {
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


// The original mapshaper "modified Visvalingam" function uses a step function to
// underweight more acute triangles.
//
Visvalingam.specialMetric = function(ax, ay, bx, by, cx, cy) {
  var area = triangleArea(ax, ay, bx, by, cx, cy),
      angle = innerAngle(ax, ay, bx, by, cx, cy),
      weight = angle < 0.5 ? 0.1 : angle < 1 ? 0.3 : 1;
  return area * weight;
};

Visvalingam.specialMetric3D = function(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var area = triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz),
      angle = innerAngle3D(ax, ay, az, bx, by, bz, cx, cy, cz),
      weight = angle < 0.5 ? 0.1 : angle < 1 ? 0.3 : 1;
  return area * weight;
};

Visvalingam.standardMetric = triangleArea;
Visvalingam.standardMetric3D = triangleArea3D;

// Experimenting with a replacement for "Modified Visvalingam"
//
Visvalingam.specialMetric2 = function(ax, ay, bx, by, cx, cy) {
  var area = triangleArea(ax, ay, bx, by, cx, cy),
      standardLen = area * 1.4,
      hyp = Math.sqrt((ax + cx) * (ax + cx) + (ay + cy) * (ay + cy)),
      weight = hyp / standardLen;
  return area * weight;
};





var DouglasPeucker = {};

DouglasPeucker.simplifyArcs = function(arcs, opts) {
  return MapShaper.simplifyArcs(arcs, DouglasPeucker.calcArcData, opts);
};

DouglasPeucker.metricSq3D = function(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var ab2 = distanceSq3D(ax, ay, az, bx, by, bz),
      ac2 = distanceSq3D(ax, ay, az, cx, cy, cz),
      bc2 = distanceSq3D(bx, by, bz, cx, cy, cz);
  return triangleHeightSq(ab2, bc2, ac2);
};

DouglasPeucker.metricSq = function(ax, ay, bx, by, cx, cy) {
  var ab2 = distanceSq(ax, ay, bx, by),
      ac2 = distanceSq(ax, ay, cx, cy),
      bc2 = distanceSq(bx, by, cx, cy);
  return triangleHeightSq(ab2, bc2, ac2);
};

// @dest array to contain calculated data
// @xx, @yy arrays of x, y coords of a path
// @zz (optional) array of z coords for spherical simplification
//
DouglasPeucker.calcArcData = function(dest, xx, yy, zz) {
  var len = dest.length,
      useZ = !!zz;

  Utils.initializeArray(dest, 0);

  dest[0] = dest[len-1] = Infinity;

  if (len > 2) {
    procSegment(0, len-1, 1, Number.MAX_VALUE);
  }

  function procSegment(startIdx, endIdx, depth, lastDistance) {
    var thisDistance;
    var ax = xx[startIdx],
      ay = yy[startIdx],
      cx = xx[endIdx],
      cy = yy[endIdx],
      az, bz, cz;

    if (useZ) {
      az = zz[startIdx];
      cz = zz[endIdx];
    }

    if (startIdx >= endIdx) error("[procSegment()] inverted idx");

    var maxDistance = 0, maxIdx = 0;

    for (var i=startIdx+1; i<endIdx; i++) {
      if (useZ) {
        thisDistance = DouglasPeucker.metricSq3D(ax, ay, az, xx[i], yy[i], zz[i], cx, cy, cz);
      } else {
        thisDistance = DouglasPeucker.metricSq(ax, ay, xx[i], yy[i], cx, cy);
      }

      if (thisDistance >= maxDistance) {
        maxDistance = thisDistance;
        maxIdx = i;
      }
    }

    if (lastDistance < maxDistance) {
      maxDistance = lastDistance;
    }

    var lval=0, rval=0;
    if (maxIdx - startIdx > 1) {
      lval = procSegment(startIdx, maxIdx, depth+1, maxDistance);
    }
    if (endIdx - maxIdx > 1) {
      rval = procSegment(maxIdx, endIdx, depth+1, maxDistance);
    }

    if (depth == 1) {
      // case -- arc is an island polygon
      if (ax == cx && ay == cy) {
        maxDistance = lval > rval ? lval : rval;
      }
    }

    var dist = Math.sqrt(maxDistance);

    /*
    if ( maxSegmentLen > 0 ) {
      double maxLen2 = maxSegmentLen * maxSegmentLen;
      double acLen2 = (ax-cx)*(ax-cx) + (ay-cy)*(ay-cy);
      if ( maxLen2 < acLen2 ) {
        thresh = MAX_THRESHOLD - 2;  // mb //
      }
    }
    */

    dest[maxIdx] = dist;
    return maxDistance;
  }
};




MapShaper.protectRingsFromCollapse = function(arcData, lockCounts) {
  var n;
  for (var i=0, len=lockCounts.length; i<len; i++) {
    n = lockCounts[i];
    if (n > 0) {
      MapShaper.lockMaxThresholds(arcData.getArcThresholds(i), n);
    }
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

MapShaper.simplifyPaths = function(paths, method) {
  T.start();
  var bounds = paths.getBounds().toArray();
  var decimalDegrees = probablyDecimalDegreeBounds(bounds);
  var simplifyPath = MapShaper.simplifiers[method] || error("Unknown method:", method);
  if (decimalDegrees) {
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

// Apply a simplification function to each path in an array, return simplified path.
//
MapShaper.simplifyPaths_old = function(paths, method, bounds) {
  var decimalDegrees = probablyDecimalDegreeBounds(bounds);
  var simplifyPath = MapShaper.simplifiers[method] || error("Unknown method:", method),
      data;

  T.start();
  if (decimalDegrees) {
    data = MapShaper.simplifyPathsSph(paths, simplifyPath);
  } else {
    data = Utils.map(paths, function(path) {
      return simplifyPath(path[0], path[1]);
    });
  }

  if (decimalDegrees) {
    MapShaper.protectWorldEdges(paths, data, bounds);
  }
  T.stop("Calculate simplification data");
  return data;
};

// Path simplification functions
// Signature: function(xx:array, yy:array, [zz:array], [length:integer]):array
//
MapShaper.simplifiers = {
  vis: Visvalingam.getArcCalculator(Visvalingam.standardMetric, Visvalingam.standardMetric3D, 0.65),
  mod: Visvalingam.getArcCalculator(Visvalingam.specialMetric, Visvalingam.specialMetric3D, 0.65),
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
    arcs.forEachSegment(function(id1, id2, xx, yy, arcId) {
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
        avg = arcs.getAverageSegment(arcs.getPointCount() / 4); // don't bother sampling all segments
    return Math.ceil(yrange / avg[1] / 20);
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
      unfixable = MapShaper.repairIntersections(arcs, intersections);
  T.stop('Find and repair intersections');
  var info = {
    pre: intersections.length,
    post: unfixable.length
  };
  info.repaired = info.post < info.pre ? info.pre - info.post : 0;
  return info;
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




function RepairControl(map, lineLyr, arcData) {
  var el = El("#g-intersection-display").show(),
      readout = el.findChild("#g-intersection-count"),
      btn = el.findChild("#g-repair-btn");

  var _initialXX = MapShaper.findSegmentIntersections(arcData),
      _enabled = false,
      _currXX,
      _pointColl,
      _pointLyr;

  this.update = function(pct) {
    var XX;
    if (pct >= 1) {
      XX = _initialXX;
      enabled(false);
    } else {
      T.start();
      XX = MapShaper.findSegmentIntersections(arcData);
      T.stop("Find intersections");
      enabled(XX.length > 0);
    }
    showIntersections(XX);
  };

  this.update(1); // initialize at 100%

  btn.on('click', function() {
    if (!enabled()) return;
    T.start();
    var fixed = MapShaper.repairIntersections(arcData, _currXX);
    T.stop('Fix intersections');
    enabled(false);
    showIntersections(fixed);
    lineLyr.refresh();
  });

  this.clear = function() {
    _currXX = null;
    _pointLyr.visible(false);
  };

  function showIntersections(XX) {
    var points = MapShaper.getIntersectionPoints(XX);
    if (!_pointLyr) {
      _pointColl = new FilteredPathCollection(points, {
        min_segment: 0,
        min_path: 0
      });
      _pointLyr = new ArcLayerGroup(_pointColl, {
        dotSize: 5,
        dotColor: "#F24400"
      });
      map.addLayerGroup(_pointLyr);
    } else if (XX.length > 0) {
      _pointColl.update(points);
      _pointLyr.visible(true);
      _pointLyr.refresh();
    } else{
      _pointLyr.visible(false);
    }
    var msg = Utils.format("%s line intersection%s", XX.length, XX.length != 1 ? 's' : '');
    readout.text(msg);
    _currXX = XX;
  }

  function enabled(b) {
    if (arguments.length === 0) return _enabled;
    _enabled = !!b;
    if (b) {
      btn.removeClass('disabled');
    } else {
      btn.addClass('disabled');
    }
  }
}




var dropper,
    importer,
    editor;

if (Browser.inBrowser) {
  Browser.onload(function() {
    if (!browserIsSupported()) {
      El("#mshp-not-supported").show();
      return;
    }
    editor = new Editor();
    importer = new ImportControl(editor);
    dropper = new DropControl(importer);
    introPage();
  });
}

function introPage() {
  new FileChooser('#g-shp-import-btn').on('select', function(e) {
    importer.readFiles(e.files);
  });
  El('#mshp-import').show();
}

/*
function ImportPanel(importer) {
  var shpBtn = new FileChooser('#g-shp-import-btn');
  shpBtn.on('select', function(e) {
    importer.readFiles(e.files);
  });
}

Opts.inherit(ImportPanel, EventDispatcher);
*/

function browserIsSupported() {
  return Env.inBrowser &&
    Env.canvas &&
    typeof ArrayBuffer != 'undefined' &&
    typeof Blob != 'undefined' &&
    typeof File != 'undefined';
}

function Editor() {
  var map, slider;

  var importOpts = {
    simplifyMethod: "mod",
    preserveShapes: false,
    repairIntersections: false
  };

  function init(contentBounds) {
    El("#mshp-intro-screen").hide();
    El("#mshp-main-page").show();
    El("body").addClass('editing');

    importOpts.preserveShapes = !!El("#g-import-retain-opt").node().checked;
    importOpts.repairIntersections = !!El("#g-repair-intersections-opt").node().checked;
    importOpts.simplifyMethod = El('#g-simplification-menu input[name=method]:checked').attr('value');

    var mapOpts = {
      bounds: contentBounds,
      padding: 12
    };
    map = new MshpMap("#mshp-main-map", mapOpts);
    slider = new SimplifyControl();
  }

  this.addData = function(data, opts) {
    var arcData = data.arcs;
    if (!map) init(arcData.getBounds());

    MapShaper.simplifyPaths(arcData, importOpts.simplifyMethod);
    if (importOpts.preserveShapes) {
      MapShaper.protectRingsFromCollapse(arcData, data.retainedPointCounts);
    }

    var filteredArcs = new FilteredPathCollection(arcData);
    var group = new ArcLayerGroup(filteredArcs);

    map.addLayerGroup(group);

    // Intersections
    if (importOpts.repairIntersections) {
      var repair = new RepairControl(map, group, arcData);
      slider.on('simplify-start', function() {
        repair.clear();
      });
      slider.on('simplify-end', function() {
        repair.update(slider.value());
      });
    }

    slider.on('change', function(e) {
      filteredArcs.setRetainedPct(e.value);
      group.refresh();
    });

    var exportOpts = {
      precision: opts.precision || null,
      output_file_base: MapShaper.parseLocalPath(opts.input_file).basename || "out"
    };
    var exporter = new ExportControl(arcData, data.layers, exportOpts);
  };
}

var api = {
  ArcDataset: ArcDataset,
  Utils: Utils,
  trace: trace,
  error: error
};

Opts.extendNamespace("mapshaper", api);

})();
