
var error = function() {
  var msg = Utils.toArray(arguments).join(' ');
  throw new Error(msg);
};

var Utils = {
  getUniqueName: function(prefix) {
    var n = Utils.__uniqcount || 0;
    Utils.__uniqcount = n + 1;
    return (prefix || "__id_") + n;
  },

  isFunction: function(obj) {
    return typeof obj == 'function';
  },

  isObject: function(obj) {
    return obj === Object(obj); // via underscore
  },

  clamp: function(val, min, max) {
    return val < min ? min : (val > max ? max : val);
  },

  interpolate: function(val1, val2, pct) {
    return val1 * (1-pct) + val2 * pct;
  },

  isArray: function(obj) {
    return Array.isArray(obj);
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

  // See https://raw.github.com/kvz/phpjs/master/functions/strings/addslashes.js
  addslashes: function(str) {
    return (str + '').replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0');
  },

  // Escape a literal string to use in a regexp.
  // Ref.: http://simonwillison.net/2006/Jan/20/escape/
  regexEscape: function(str) {
    return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
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

  extend: function(o) {
    var dest = o || {},
        n = arguments.length,
        key, i, src;
    for (i=1; i<n; i++) {
      src = arguments[i] || {};
      for (key in src) {
        if (src.hasOwnProperty(key)) {
          dest[key] = src[key];
        }
      }
    }
    return dest;
  },

  // Pseudoclassical inheritance
  //
  // Inherit from a Parent function:
  //    Utils.inherit(Child, Parent);
  // Call parent's constructor (inside child constructor):
  //    this.__super__([args...]);
  inherit: function(targ, src) {
    var f = function() {
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

  // Inherit from a parent, call the parent's constructor, optionally extend
  // prototype with optional additional arguments
  subclass: function(parent) {
    var child = function() {
      this.__super__.apply(this, Utils.toArray(arguments));
    };
    Utils.inherit(child, parent);
    for (var i=1; i<arguments.length; i++) {
      Utils.extend(child.prototype, arguments[i]);
    }
    return child;
  }

};



var Env = (function() {
  var inNode = typeof module !== 'undefined' && !!module.exports;
  var inBrowser = typeof window !== 'undefined' && !inNode;
  var inPhantom = inBrowser && !!(window.phantom && window.phantom.exit);
  var ieVersion = inBrowser && /MSIE ([0-9]+)/.exec(navigator.appVersion) && parseInt(RegExp.$1) || NaN;

  return {
    iPhone : inBrowser && !!(navigator.userAgent.match(/iPhone/i)),
    iPad : inBrowser && !!(navigator.userAgent.match(/iPad/i)),
    canvas: inBrowser && !!document.createElement('canvas').getContext,
    inNode : inNode,
    inPhantom : inPhantom,
    inBrowser: inBrowser,
    ieVersion: ieVersion,
    ie: !isNaN(ieVersion)
  };
})();


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




// Append elements of @src array to @dest array
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
  return arr.filter(function(el) {
    return !Object.prototype.hasOwnProperty.call(index, el);
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
  return arr.reduce(function(val, item) {
    return val || test(item); // TODO: short-circuit?
  }, false);
};

Utils.every = function(arr, test) {
  return arr.reduce(function(val, item) {
    return val && test(item);
  }, true);
};

Utils.find = function(arr, test, ctx) {
  var matches = arr.filter(test, ctx);
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

// Calculate min and max values of an array, ignoring NaN values
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

Utils.uniq = function(src) {
  var index = {};
  return src.reduce(function(memo, el) {
    if (el in index === false) {
      index[el] = true;
      memo.push(el);
    }
    return memo;
  }, []);
};

Utils.pluck = function(arr, key) {
  return arr.map(function(obj) {
    return obj[key];
  });
};

Utils.countValues = function(arr) {
  return arr.reduce(function(memo, val) {
    memo[val] = (val in memo) ? memo[val] + 1 : 1;
    return memo;
  }, {});
};

Utils.indexOn = function(arr, k) {
  return arr.reduce(function(index, o) {
    index[o[k]] = o;
    return index;
  }, {});
};

Utils.groupBy = function(arr, k) {
  return arr.reduce(function(index, o) {
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
  return arr.reduce(function(index, key) {
    index[key] = init ? val : true;
    return index;
  }, {});
};

// Support for iterating over array-like objects, like typed arrays
Utils.forEach = function(arr, func, ctx) {
  if (!Utils.isArrayLike(arr)) {
    throw new Error("#forEach() takes an array-like argument. " + arr);
  }
  for (var i=0, n=arr.length; i < n; i++) {
    func.call(ctx, arr[i], i);
  }
};

Utils.forEachProperty = function(o, func, ctx) {
  Object.keys(o).forEach(function(key) {
    func.call(ctx, o[key], key);
  });
};

Utils.initializeArray = function(arr, init) {
  for (var i=0, len=arr.length; i<len; i++) {
    arr[i] = init;
  }
  return arr;
};

Utils.replaceArray = function(arr, arr2) {
  arr.splice(0, arr.length);
  arr.push.apply(arr, arr2);
};




Utils.repeatString = function(src, n) {
  var str = "";
  for (var i=0; i<n; i++)
    str += src;
  return str;
};

Utils.pluralSuffix = function(count) {
  return count != 1 ? 's' : '';
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




// Sort an array of objects based on one or more properties.
// Usage: Utils.sortOn(array, key1, asc?[, key2, asc? ...])
//
Utils.sortOn = function(arr) {
  var comparators = [];
  for (var i=1; i<arguments.length; i+=2) {
    comparators.push(Utils.getKeyComparator(arguments[i], arguments[i+1]));
  }
  arr.sort(function(a, b) {
    var cmp = 0,
        i = 0,
        n = comparators.length;
    while (i < n && cmp === 0) {
      cmp = comparators[i](a, b);
      i++;
    }
    return cmp;
  });
  return arr;
};

// Sort array of values that can be compared with < > operators (strings, numbers)
// null, undefined and NaN are sorted to the end of the array
//
Utils.genericSort = function(arr, asc) {
  var compare = Utils.getGenericComparator(asc);
  Array.prototype.sort.call(arr, compare);
  return arr;
};

Utils.sortOnKey = function(arr, getter, asc) {
  var compare = Utils.getGenericComparator(asc !== false) // asc is default
  arr.sort(function(a, b) {
    return compare(getter(a), getter(b));
  });
};

// Stashes keys in a temp array (better if calculating key is expensive).
Utils.sortOnKey2 = function(arr, getKey, asc) {
  Utils.sortArrayByKeys(arr, arr.map(getKey), asc);
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
  var compare = Utils.getGenericComparator(asc);
  ids.sort(function(i, j) {
    // added i, j comparison to guarantee that sort is stable
    var cmp = compare(arr[i], arr[j]);
    return cmp > 0 || cmp === 0 && i < j ? 1 : -1;
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

Utils.getKeyComparator = function(key, asc) {
  var compare = Utils.getGenericComparator(asc);
  return function(a, b) {
    return compare(a[key], b[key]);
  };
};

Utils.getGenericComparator = function(asc) {
  asc = asc !== false;
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





// Generic in-place sort (null, NaN, undefined not handled)
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
};




/*
A simplified version of printf formatting
Format codes: %[flags][width][.precision]type

supported flags:
  +   add '+' before positive numbers
  0   left-pad with '0'
  '   Add thousands separator
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
Utils.formatter = function(fmt) {
  var codeRxp = /%([\',+0]*)([1-9]?)((?:\.[1-9])?)([sdifxX%])/g;
  var literals = [],
      formatCodes = [],
      startIdx = 0,
      prefix = "",
      literal,
      matches;

  while (matches=codeRxp.exec(fmt)) {
    literal = fmt.substring(startIdx, codeRxp.lastIndex - matches[0].length);
    if (matches[0] == '%%') {
      prefix += literal + '%';
    } else {
      literals.push(prefix + literal);
      prefix = '';
      formatCodes.push(matches);
    }
    startIdx = codeRxp.lastIndex;
  }
  literals.push(prefix + fmt.substr(startIdx));

  return function() {
    var str = literals[0],
        n = arguments.length;
    if (n != formatCodes.length) {
      error("[format()] Data does not match format string; format:", fmt, "data:", arguments);
    }
    for (var i=0; i<n; i++) {
      str += formatValue(arguments[i], formatCodes[i]) + literals[i+1];
    }
    return str;
  };
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
    Utils.defaults(this, data);
    this.data = data;
  }
}

EventData.prototype.stopPropagation = function() {
  this.__stop__ = true;
};

//  Base class for objects that dispatch events
function EventDispatcher() {}


// @obj (optional) data object, gets mixed into event
// @listener (optional) dispatch event only to this object
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

EventDispatcher.prototype.addEventListener =
EventDispatcher.prototype.on = function(type, callback, context, priority) {
  context = context || this;
  priority = priority || 0;
  var handler = new Handler(type, this, callback, context, priority);
  // Insert the new event in the array of handlers according to its priority.
  var handlers = this._handlers || (this._handlers = []);
  var i = handlers.length;
  while (--i >= 0 && handlers[i].priority < handler.priority) {}
  handlers.splice(i+1, 0, handler);
  return this;
};

// Remove an event handler.
// @param {string} type Event type to match.
// @param {function(BoundEvent)} callback Event handler function to match.
// @param {*=} context Execution context of the event handler to match.
// @return {number} Returns number of handlers removed (expect 0 or 1).
EventDispatcher.prototype.removeEventListener = function(type, callback, context) {
  context = context || this;
  var count = this.removeEventListeners(type, callback, context);
  return count;
};

// Remove event handlers; passing arguments can limit which listeners to remove
// Returns nmber of handlers removed.
EventDispatcher.prototype.removeEventListeners = function(type, callback, context) {
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




var Browser = {
  getPageXY: function(el) {
    var x = 0, y = 0;
    if (el.getBoundingClientRect) {
      var box = el.getBoundingClientRect();
      x = box.left - Browser.pageXToViewportX(0);
      y = box.top - Browser.pageYToViewportY(0);
    }
    else {
      var fixed = Browser.elementIsFixed(el);

      while (el) {
        x += el.offsetLeft || 0;
        y += el.offsetTop || 0;
        el = el.offsetParent;
      }

      if (fixed) {
        var offsX = -Browser.pageXToViewportX(0);
        var offsY = -Browser.pageYToViewportY(0);
        x += offsX;
        y += offsY;
      }
    }

    var obj = {x:x, y:y};
    return obj;
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

  pageXToViewportX: function(x) {
    return x - window.pageXOffset;
  },

  pageYToViewportY: function(y) {
    return y - window.pageYOffset;
  },

  getElementStyle: function(el) {
    return el.currentStyle || window.getComputedStyle && window.getComputedStyle(el, '') || {};
  },

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
      div = this._cssdiv = document.createElement('div');
    }
    div.style.cssText = s1 + ";" + s2; // extra ';' for ie, which may leave off final ';'
    return div.style.cssText;
  },

  addCSS: function(el, css) {
    el.style.cssText = Browser.mergeCSS(el.style.cssText, css);
  },

  // Return: HTML node reference or null
  // Receive: node reference or id or "#" + id
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

  undraggable: function(el) {
    el.ondragstart = function(){return false;};
    el.draggable = false;
  }

};

Browser.onload = function(handler) {
  if (document.readyState == 'complete') {
    handler();
  } else {
    window.addEventListener('load', handler);
  }
};




// See https://github.com/janl/mustache.js/blob/master/mustache.js
Utils.htmlEscape = (function() {
  var entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;'
  };
  return function(s) {
    return String(s).replace(/[&<>"'\/]/g, function(s) {
      return entityMap[s];
    });
  };
}());




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
  } else {
    error("This browser doesn't support CSS query selectors");
  }
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
  var jsName = El.toCamelCase(name);
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
      node = Browser.getElement(ref) || document.createElement(ref); // TODO: detect type of argument
    } else {
      node = Elements.__select(ref)[0];
    }
  } else if (ref.tagName) {
    node = ref;
  }
  if (!node) error("Unmatched element selector:", ref);
  this.el = node;
}

Utils.inherit(El, EventDispatcher); //

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
      Utils.forEachProperty(css, function(val, key) {
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

  addClass: function(className) {
    Browser.addClass(this.el, className);
    return this;
  },

  removeClass: function(className) {
    Browser.removeClass(this.el, className);
    return this;
  },

  classed: function(className, b) {
    this[b ? 'addClass' : 'removeClass'](className);
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

  html: function(html) {
    if (arguments.length == 0) {
      return this.el.innerHTML;
    } else {
      this.el.innerHTML = html;
      return this;
    }
  },

  text: function(str) {
    this.html(Utils.htmlEscape(str));
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

  nextSibling: function() {
    return this.el.nextSibling ? new El(this.el.nextSibling) : null;
  },

  newSibling: function(tagName) {
    var el = this.el,
        sib = document.createElement(tagName),
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
    var ch = document.createElement(tagName);
    this.el.appendChild(ch);
    return new El(ch);
  },

  // Traverse to parent node
  parent: function() {
    var p = this.el && this.el.parentNode;
    return p ? new El(p) : null;
  },

  findParent: function(tagName) {
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
  if (ctx) {
    error("[El#on()] Third argument no longer supported.");
  }
  if (this.constructor == El) {
    this.el.addEventListener(type, func);
  } else {
    this.__on.apply(this, arguments);
  }
  return this;
};

El.prototype.__removeEventListener = El.prototype.removeEventListener;
El.prototype.removeEventListener = function(type, func) {
  if (this.constructor == El) {
    this.el.removeEventListener(type, func);
  } else {
    this.__removeEventListener.apply(this, arguments);
  }
  return this;
};




function ElementPosition(ref) {
  var self = this,
      el = El(ref),
      pageX = 0,
      pageY = 0,
      width = 0,
      height = 0;

  el.on('mouseover', update);
  window.onorientationchange && window.addEventListener('orientationchange', update);
  window.addEventListener('scroll', update);
  window.addEventListener('resize', update);

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
  this.position = function() {
    return {
      element: el.node(),
      pageX: pageX,
      pageY: pageY,
      width: width,
      height: height
    };
  };

  function update() {
    var div = el.node(),
        xy = Browser.getPageXY(div),
        w = div.clientWidth,
        h = div.clientHeight,
        x = xy.x,
        y = xy.y,
        resized = w != width || h != height,
        moved = x != pageX || y != pageY;
    if (resized || moved) {
      pageX = x, pageY = y, width = w, height = h;
      self.dispatchEvent('change', self.position());
      if (resized) {
        self.dispatchEvent('resize', self.position());
      }
    }
  }
  update();
}

Utils.inherit(ElementPosition, EventDispatcher);




function getTimerFunction() {
  return typeof requestAnimationFrame == 'function' ?
    requestAnimationFrame : function(cb) {setTimeout(cb, 25);};
}

function Timer() {
  var self = this,
      running = false,
      busy = false,
      tickTime, startTime, duration;

  this.start = function(ms) {
    var now = +new Date();
    duration = ms;
    startTime = now;
    running = true;
    if (!busy) startTick(now);
  };

  this.stop = function() {
    running = false;
  };

  function startTick(now) {
    busy = true;
    tickTime = now;
    getTimerFunction()(onTick);
  }

  function onTick() {
    var now = +new Date(),
        elapsed = now - startTime,
        pct = Math.min((elapsed + 10) / duration, 1),
        done = pct >= 1;
    if (!running) { // interrupted
      busy = false;
      return;
    }
    if (done) running = false;
    self.dispatchEvent('tick', {
      elapsed: elapsed,
      pct: pct,
      done: done,
      time: now,
      tickTime: now - tickTime
    });
    busy = false;
    if (running) startTick(now);
  }
}

Utils.inherit(Timer, EventDispatcher);

function Tween(ease) {
  var self = this,
      timer = new Timer(),
      start, end;

  timer.on('tick', onTick);

  this.start = function(a, b, duration) {
    start = a;
    end = b;
    timer.start(duration || 500);
  };

  function onTick(e) {
    var pct = ease ? ease(e.pct) : e.pct,
        val = end * pct + start * (1 - pct);
    self.dispatchEvent('change', {value: val});
  }
}

Utils.inherit(Tween, EventDispatcher);

Tween.sineInOut = function(n) {
  return 0.5 - Math.cos(n * Math.PI) / 2;
};

Tween.quadraticOut = function(n) {
  return 1 - Math.pow((1 - n), 2);
};




// @mouse: MouseArea object
function MouseWheel(mouse) {
  var self = this,
      prevWheelTime = 0,
      currDirection = 0,
      timer = new Timer().addEventListener('tick', onTick),
      sustainTime = 60,
      fadeTime = 80;

  if (window.onmousewheel !== undefined) { // ie, webkit
    window.addEventListener('mousewheel', handleWheel);
  } else { // firefox
    window.addEventListener('DOMMouseScroll', handleWheel);
  }

  function handleWheel(evt) {
    var direction;
    if (evt.wheelDelta) {
      direction = evt.wheelDelta > 0 ? 1 : -1;
    } else if (evt.detail) {
      direction = evt.detail > 0 ? -1 : 1;
    }
    if (!mouse.isOver() || !direction) return;
    evt.preventDefault();
    prevWheelTime = +new Date();
    if (!currDirection) {
      self.dispatchEvent('mousewheelstart');
    }
    currDirection = direction;
    timer.start(sustainTime + fadeTime);
  }

  function onTick(evt) {
    var elapsed = evt.time - prevWheelTime,
        fadeElapsed = elapsed - sustainTime,
        scale = evt.tickTime / 25,
        obj;
    if (evt.done) {
      currDirection = 0;
    } else {
      if (fadeElapsed > 0) {
        // Decelerate if the timer fires during 'fade time' (for smoother zooming)
        scale *= Tween.quadraticOut((fadeTime - fadeElapsed) / fadeTime);
      }
      obj = utils.extend({direction: currDirection, multiplier: scale}, mouse.mouseData());
      self.dispatchEvent('mousewheel', obj);
    }
  }
}

Utils.inherit(MouseWheel, EventDispatcher);




function MouseArea(element) {
  var pos = new ElementPosition(element),
      _areaPos = pos.position(),
      _self = this,
      _dragging = false,
      _isOver = false,
      _prevEvt,
      // _moveEvt,
      _downEvt;

  pos.on('change', function() {_areaPos = pos.position()});
  // TODO: think about touch events
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  element.addEventListener('mouseover', onAreaEnter);
  element.addEventListener('mousemove', onAreaEnter);
  element.addEventListener('mouseout', onAreaOut);
  element.addEventListener('mousedown', onAreaDown);
  element.addEventListener('dblclick', onAreaDblClick);

  function onAreaDown(e) {
    e.preventDefault(); // prevent text selection cursor on drag
  }

  function onAreaEnter() {
    if (!_isOver) {
      _isOver = true;
      _self.dispatchEvent('enter');
    }
  }

  function onAreaOut(e) {
    _isOver = false;
    _self.dispatchEvent('leave');
  }

  function onMouseUp(e) {
    var evt = procMouseEvent(e),
        elapsed, dx, dy;
    if (_dragging) {
      _dragging = false;
      _self.dispatchEvent('dragend', evt);
    }
    if (_downEvt) {
      elapsed = evt.time - _downEvt.time;
      dx = evt.pageX - _downEvt.pageX;
      dy = evt.pageY - _downEvt.pageY;
      if (_isOver && elapsed < 500 && Math.sqrt(dx * dx + dy * dy) < 6) {
        _self.dispatchEvent('click', evt);
      }
      _downEvt = null;
    }
  }

  function onMouseDown(e) {
   if (e.button != 2 && e.which != 3) { // ignore right-click
      _downEvt = procMouseEvent(e);
    }
  }

  function onMouseMove(e) {
    var evt = procMouseEvent(e);
    if (!_dragging && _downEvt && _downEvt.hover) {
      _dragging = true;
      _self.dispatchEvent('dragstart', evt);
    }

    if (_dragging) {
      var obj = {
        dragX: evt.pageX - _downEvt.pageX,
        dragY: evt.pageY - _downEvt.pageY
      };
      _self.dispatchEvent('drag', Utils.extend(obj, evt));
    } else {
      _self.dispatchEvent('hover', evt);
    }
  }

  function onAreaDblClick(e) {
    if (_isOver) _self.dispatchEvent('dblclick', procMouseEvent(e));
  }

  function procMouseEvent(e) {
    var pageX = e.pageX,
        pageY = e.pageY,
        prev = _prevEvt;
    _prevEvt = {
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
    return _prevEvt;
  }

  this.isOver = function() {
    return _isOver;
  }

  this.isDown = function() {
    return !!_downEvt;
  }

  this.mouseData = function() {
    return Utils.extend({}, _prevEvt);
  }
}

Utils.inherit(MouseArea, EventDispatcher);


