import { Buffer } from '../utils/mapshaper-node-buffer';
import { error, stop } from '../utils/mapshaper-logging';

// Export all the functions in this module as the default export
// So other modules can do: 'import utils from '../mapshaper-utils''
import * as utils from '../utils/mapshaper-utils';
export default utils;

var uniqCount = 0;
export function getUniqueName(prefix) {
  return (prefix || "__id_") + (++uniqCount);
}

export function isFunction(obj) {
  return typeof obj == 'function';
}

export function isPromise(arg) {
  return arg ? isFunction(arg.then) : false;
}

export function isObject(obj) {
  return obj === Object(obj); // via underscore
}

export function clamp(val, min, max) {
  return val < min ? min : (val > max ? max : val);
}

export function isArray(obj) {
  return Array.isArray(obj);
}

// Is obj a valid number or NaN? (test if obj is type number)
export function isNumber(obj) {
  return obj != null && obj.constructor == Number;
}

export function isValidNumber(val) {
  return isNumber(val) && !isNaN(val);
}

// Similar to isFinite() but does not coerce strings or other types
export function isFiniteNumber(val) {
  return isValidNumber(val) && val !== Infinity && val !== -Infinity;
}

// This uses type conversion
// export function isFiniteNumber(val) {
//   return val > -Infinity && val < Infinity;
// }

export function isNonNegNumber(val) {
  return isNumber(val) && val >= 0;
}

export function isInteger(obj) {
  return isNumber(obj) && ((obj | 0) === obj);
}

export function isEven(obj) {
  return (obj % 2) === 0;
}

export function isOdd(obj) {
  return (obj % 2) === 1;
}

export function isString(obj) {
  return obj != null && obj.toString === String.prototype.toString;
  // TODO: replace w/ something better.
}

export function isDate(obj) {
  return !!obj && obj.getTime === Date.prototype.getTime;
}

export function isBoolean(obj) {
  return obj === true || obj === false;
}

export function formatDateISO(d) {
  if (!isDate(d)) return '';
  return d.toISOString().replace(':00.000Z', 'Z');
}

// Convert an array-like object to an Array, or make a copy if @obj is an Array
export function toArray(obj) {
  var arr;
  if (!isArrayLike(obj)) error("toArray() requires an array-like object");
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
}

// Array like: has length property, is numerically indexed and mutable.
// TODO: try to detect objects with length property but no indexed data elements
export function isArrayLike(obj) {
  if (!obj) return false;
  if (isArray(obj)) return true;
  if (isString(obj)) return false;
  if (obj.length === 0) return true;
  if (obj.length > 0) return true;
  return false;
}

// See https://raw.github.com/kvz/phpjs/master/functions/strings/addslashes.js
export function addslashes(str) {
  return (str + '').replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0');
}

// Escape a literal string to use in a regexp.
// Ref.: http://simonwillison.net/2006/Jan/20/escape/
export function regexEscape(str) {
  return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}


// See https://github.com/janl/mustache.js/blob/master/mustache.js
var entityMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;'
};
export function htmlEscape(s) {
  return String(s).replace(/[&<>"'/]/g, function(s) {
    return entityMap[s];
  });
}

export function defaults(dest) {
  for (var i=1, n=arguments.length; i<n; i++) {
    var src = arguments[i] || {};
    for (var key in src) {
      if (key in dest === false && src.hasOwnProperty(key)) {
        dest[key] = src[key];
      }
    }
  }
  return dest;
}

export function extend(o) {
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
}

// Pseudoclassical inheritance
//
// Inherit from a Parent function:
//    inherit(Child, Parent);
// Call parent's constructor (inside child constructor):
//    this.__super__([args...]);
export function inherit(targ, src) {
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
  targ.prototype = extend(new f(), targ.prototype); //
  targ.prototype.constructor = targ;
  targ.prototype.__super__ = f;
}

export function promisify(asyncFn) {
  return function() {
    var args = toArray(arguments);
    return new Promise((resolve, reject) => {
      var cb = function(err, data) {
        if (err) reject(err);
        else resolve(data);
      };
      args.push(cb);
      asyncFn.apply(this, args);
    });
  };
}

 function runAsync(fn, arg) {
    return new Promise((resolve, reject) => {
      fn(arg, function(err, data) {
        return err ? reject(err) : resolve(data);
      });
    });
  }

// Call @iter on each member of an array (similar to Array#reduce(iter))
//    iter: function(memo, item, callback)
// Call @done when all members have been processed or if an error occurs
//    done: function(err, memo)
// @memo: Initial value
//
export function reduceAsync(arr, memo, iter, done) {
  var call = typeof setImmediate == 'undefined' ? setTimeout : setImmediate;
  var i=0;
  next(null, memo);

  function next(err, memo) {
    // Detach next operation from call stack to prevent overflow
    // Don't use setTimeout(, 0) if setImmediate is available
    // (setTimeout() can introduce a long delay if previous operation was slow,
    //    as of Node 0.10.32 -- a bug?)
    if (err) {
      return done(err, null);
    }
    call(function() {
      if (i < arr.length === false) {
        done(null, memo);
      } else {
        iter(memo, arr[i++], next);
      }
    }, 0);
  }
}


// Append elements of @src array to @dest array
export function merge(dest, src) {
  if (!isArray(dest) || !isArray(src)) {
    error("Usage: merge(destArray, srcArray);");
  }
  for (var i=0, n=src.length; i<n; i++) {
    dest.push(src[i]);
  }
  return dest;
}

// Returns elements in arr and not in other
// (similar to underscore diff)
export function difference(arr, other) {
  var index = arrayToIndex(other);
  return arr.filter(function(el) {
    return !Object.prototype.hasOwnProperty.call(index, el);
  });
}

// Return the intersection of two arrays
export function intersection(a, b) {
  return a.filter(function(el) {
    return b.includes(el);
  });
}

export function indexOf(arr, item) {
  var nan = item !== item;
  for (var i = 0, len = arr.length || 0; i < len; i++) {
    if (arr[i] === item) return i;
    if (nan && arr[i] !== arr[i]) return i;
  }
  return -1;
}

// Test a string or array-like object for existence of substring or element
export function contains(container, item) {
  if (isString(container)) {
    return container.indexOf(item) != -1;
  }
  else if (isArrayLike(container)) {
    return indexOf(container, item) != -1;
  }
  error("Expected Array or String argument");
}

export function some(arr, test) {
  return arr.reduce(function(val, item) {
    return val || test(item); // TODO: short-circuit?
  }, false);
}

export function every(arr, test) {
  return arr.reduce(function(val, item) {
    return val && test(item);
  }, true);
}

export function find(arr, test, ctx) {
  var matches = arr.filter(test, ctx);
  return matches.length === 0 ? null : matches[0];
}

export function range(len, start, inc) {
  var arr = [],
      v = start === void 0 ? 0 : start,
      i = inc === void 0 ? 1 : inc;
  while(len--) {
    arr.push(v);
    v += i;
  }
  return arr;
}

export function repeat(times, func) {
  var values = [],
      val;
  for (var i=0; i<times; i++) {
    val = func(i);
    if (val !== void 0) {
      values[i] = val;
    }
  }
  return values.length > 0 ? values : void 0;
}

// Calc sum, skip falsy and NaN values
// Assumes: no other non-numeric objects in array
//
export function sum(arr, info) {
  if (!isArrayLike(arr)) error ("sum() expects an array, received:", arr);
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
}

// Calculate min and max values of an array, ignoring NaN values
export function getArrayBounds(arr) {
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
}

// export function uniq(src) {
//   var index = {};
//   return src.reduce(function(memo, el) {
//     if (el in index === false) {
//       index[el] = true;
//       memo.push(el);
//     }
//     return memo;
//   }, []);
// }

export function uniq(src) {
  var index = new Set();
  var arr = [];
  var item;
  for (var i=0, n=src.length; i<n; i++) {
    item = src[i];
    if (!index.has(item)) {
      arr.push(item);
      index.add(item);
    }
  }
  return arr;
}

export function pluck(arr, key) {
  return arr.map(function(obj) {
    return obj[key];
  });
}

export function countValues(arr) {
  return arr.reduce(function(memo, val) {
    memo[val] = (val in memo) ? memo[val] + 1 : 1;
    return memo;
  }, {});
}

export function indexOn(arr, k) {
  return arr.reduce(function(index, o) {
    index[o[k]] = o;
    return index;
  }, {});
}

export function groupBy(arr, k) {
  return arr.reduce(function(index, o) {
    var keyval = o[k];
    if (keyval in index) {
      index[keyval].push(o);
    } else {
      index[keyval] = [o];
    }
    return index;
  }, {});
}

export function arrayToIndex(arr, val) {
  var init = arguments.length > 1;
  return arr.reduce(function(index, key) {
    index[key] = init ? val : true;
    return index;
  }, {});
}

// Support for iterating over array-like objects, like typed arrays
export function forEach(arr, func, ctx) {
  if (!isArrayLike(arr)) {
    throw new Error("#forEach() takes an array-like argument. " + arr);
  }
  for (var i=0, n=arr.length; i < n; i++) {
    func.call(ctx, arr[i], i);
  }
}

export function forEachProperty(o, func, ctx) {
  Object.keys(o).forEach(function(key) {
    func.call(ctx, o[key], key);
  });
}

export function initializeArray(arr, init) {
  for (var i=0, len=arr.length; i<len; i++) {
    arr[i] = init;
  }
  return arr;
}

export function replaceArray(arr, arr2) {
  arr.splice(0, arr.length);
  for (var i=0, n=arr2.length; i<n; i++) {
    arr.push(arr2[i]);
  }
}

export function repeatString(src, n) {
  var str = "";
  for (var i=0; i<n; i++)
    str += src;
  return str;
}

export function splitLines(str) {
  return str.split(/\r?\n/);
}

export function pluralSuffix(count) {
  return count != 1 ? 's' : '';
}

export function endsWith(str, ending) {
    return str.indexOf(ending, str.length - ending.length) !== -1;
}

export function lpad(str, size, pad) {
  pad = pad || ' ';
  str = String(str);
  return repeatString(pad, size - str.length) + str;
}

export function rpad(str, size, pad) {
  pad = pad || ' ';
  str = String(str);
  return str + repeatString(pad, size - str.length);
}

export function trim(str) {
  return ltrim(rtrim(str));
}

var ltrimRxp = /^\s+/;
export function ltrim(str) {
  return str.replace(ltrimRxp, '');
}

var rtrimRxp = /\s+$/;
export function rtrim(str) {
  return str.replace(rtrimRxp, '');
}

export function addThousandsSep(str) {
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
}

export function numToStr(num, decimals) {
  return decimals >= 0 ? num.toFixed(decimals) : String(num);
}

export function formatNumber(val) {
  return val + '';
}

export function formatIntlNumber(val) {
  var str = formatNumber(val);
  return '"' + str.replace('.', ',') + '"'; // need to quote if comma-delimited
}

export function formatNumberForDisplay(num, decimals, nullStr, showPos) {
  var fmt;
  if (isNaN(num)) {
    fmt = nullStr || '-';
  } else {
    fmt = numToStr(num, decimals);
    fmt = addThousandsSep(fmt);
    if (showPos && parseFloat(fmt) > 0) {
      fmt = "+" + fmt;
    }
  }
  return fmt;
}

export function shuffle(arr) {
  var tmp, i, j;
  for (i = arr.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// Sort an array of objects based on one or more properties.
// Usage: sortOn(array, key1, asc?[, key2, asc? ...])
//
export function sortOn(arr) {
  var comparators = [];
  for (var i=1; i<arguments.length; i+=2) {
    comparators.push(getKeyComparator(arguments[i], arguments[i+1]));
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
}

// Sort array of values that can be compared with < > operators (strings, numbers)
// null, undefined and NaN are sorted to the end of the array
// default order is ascending
//
export function genericSort(arr, ascending) {
  var compare = getGenericComparator(ascending);
  Array.prototype.sort.call(arr, compare);
  return arr;
}

export function getSortedIds(arr, asc) {
  var ids = range(arr.length);
  sortArrayIndex(ids, arr, asc);
  return ids;
}

export function sortArrayIndex(ids, arr, asc) {
  var compare = getGenericComparator(asc);
  ids.sort(function(i, j) {
    // added i, j comparison to guarantee that sort is stable
    var cmp = compare(arr[i], arr[j]);
    return cmp > 0 || cmp === 0 && i > j ? 1 : -1;
  });
}

export function reorderArray(arr, idxs) {
  var len = idxs.length;
  var arr2 = [];
  for (var i=0; i<len; i++) {
    var idx = idxs[i];
    if (idx < 0 || idx >= len) error("Out-of-bounds array idx");
    arr2[i] = arr[idx];
  }
  replaceArray(arr, arr2);
}

export function getKeyComparator(key, asc) {
  var compare = getGenericComparator(asc);
  return function(a, b) {
    return compare(a[key], b[key]);
  };
}

export function getGenericComparator(asc) {
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
}


// Generic in-place sort (null, NaN, undefined not handled)
export function quicksort(arr, asc) {
  quicksortPartition(arr, 0, arr.length-1);
  if (asc === false) Array.prototype.reverse.call(arr); // Works with typed arrays
  return arr;
}

// Moved out of quicksort() (saw >100% speedup in Chrome with deep recursion)
export function quicksortPartition (a, lo, hi) {
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
    if (lo < j) quicksortPartition(a, lo, j);
    lo = i;
    j = hi;
  }
}


export function findRankByValue(arr, value) {
  if (isNaN(value)) return arr.length;
  var rank = 1;
  for (var i=0, n=arr.length; i<n; i++) {
    if (value > arr[i]) rank++;
  }
  return rank;
}

export function findValueByPct(arr, pct) {
  var rank = Math.ceil((1-pct) * (arr.length));
  return findValueByRank(arr, rank);
}

// See http://ndevilla.free.fr/median/median/src/wirth.c
// Elements of @arr are reordered
//
export function findValueByRank(arr, rank) {
  if (!arr.length || rank < 1 || rank > arr.length) error("[findValueByRank()] invalid input");

  rank = clamp(rank | 0, 1, arr.length);
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
}

export function findMedian(arr) {
  return findQuantile(arr, 0.5);
}

export function findQuantile(arr, k) {
  var n = arr.length,
      i1 = Math.floor((n - 1) * k),
      i2 = Math.ceil((n - 1) * k);
  if (i1 < 0 || i2 >= n) return NaN;
  var v1 = findValueByRank(arr, i1 + 1);
  if (i1 == i2) return v1;
  var v2 = findValueByRank(arr, i2 + 1);
  // use linear interpolation
  var w1 = i2 / (n - 1) - k;
  var w2 = k - i1 / (n - 1);
  var v = (v1 * w1 + v2 * w2) * (n - 1);
  return v;
}

export function mean(arr) {
  var count = 0,
      avg = NaN,
      val;
  for (var i=0, n=arr.length; i<n; i++) {
    val = arr[i];
    if (isNaN(val)) continue;
    avg = ++count == 1 ? val : val / count + (count - 1) / count * avg;
  }
  return avg;
}


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

// Usage: format(formatString, [values])
// Tip: When reusing the same format many times, use formatter() for 5x - 10x better performance
//
export function format(fmt) {
  var fn = formatter(fmt);
  var str = fn.apply(null, Array.prototype.slice.call(arguments, 1));
  return str;
}

function formatValue(val, matches) {
  var flags = matches[1];
  var padding = matches[2];
  var decimals = matches[3] ? parseInt(matches[3].substr(1)) : void 0;
  var type = matches[4];
  var isString = type == 's',
      isHex = type == 'x' || type == 'X',
      // isInt = type == 'd' || type == 'i',
      // isFloat = type == 'f',
      isNumber = !isString;

  var sign = "",
      padDigits = 0,
      isZero = false,
      isNeg = false;

  var str, padChar, padStr;
  if (isString) {
    str = String(val);
  }
  else if (isHex) {
    str = val.toString(16);
    if (type == 'X')
      str = str.toUpperCase();
  }
  else if (isNumber) {
    // str = formatNumberForDisplay(val, isInt ? 0 : decimals);
    str = numToStr(val, decimals);
    if (str[0] == '-') {
      isNeg = true;
      str = str.substr(1);
    }
    isZero = parseFloat(str) == 0;
    if (flags.indexOf("'") != -1 || flags.indexOf(',') != -1) {
      str = addThousandsSep(str);
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
      padChar = flags.indexOf('0') == -1 ? ' ' : '0';
      padStr = repeatString(padChar, padDigits);
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
export function formatter(fmt) {
  var codeRxp = /%([',+0]*)([1-9]?)((?:\.[1-9])?)([sdifxX%])/g;
  var literals = [],
      formatCodes = [],
      startIdx = 0,
      prefix = "",
      matches = codeRxp.exec(fmt),
      literal;

  while (matches) {
    literal = fmt.substring(startIdx, codeRxp.lastIndex - matches[0].length);
    if (matches[0] == '%%') {
      prefix += literal + '%';
    } else {
      literals.push(prefix + literal);
      prefix = '';
      formatCodes.push(matches);
    }
    startIdx = codeRxp.lastIndex;
    matches = codeRxp.exec(fmt);
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
}

export function wildcardToRegExp(name) {
  var rxp = name.split('*').map(function(str) {
    return regexEscape(str);
  }).join('.*');
  return new RegExp('^' + rxp + '$');
}

export function createBuffer(arg, arg2) {
  if (isInteger(arg)) {
    return Buffer.allocUnsafe ? Buffer.allocUnsafe(arg) : new Buffer(arg);
  } else {
    // check allocUnsafe to make sure Buffer.from() will accept strings (it didn't before Node v5.10)
    return Buffer.from && Buffer.allocUnsafe ? Buffer.from(arg, arg2) : new Buffer(arg, arg2);
  }
}

export function toBuffer(src) {
  if (src instanceof Buffer) return src;
  if (src instanceof ArrayBuffer) return Buffer.from(src);
  if (src instanceof Uint8Array) {
    return Buffer.from(src.buffer, src.byteOffset, src.byteLength);
  }
  error('Unexpected argument type');
}

export function expandoBuffer(constructor, rate) {
  var capacity = 0,
      k = rate >= 1 ? rate : 1.2,
      buf;
  return function(size) {
    if (size > capacity) {
      capacity = Math.ceil(size * k);
      buf = constructor ? new constructor(capacity) : createBuffer(capacity);
    }
    return buf;
  };
}

export function copyElements(src, i, dest, j, n, rev) {
  var same = src == dest || src.buffer && src.buffer == dest.buffer;
  var inc = 1,
      offs = 0,
      k;
  if (rev) {
    if (same) error('copy error');
    inc = -1;
    offs = n - 1;
  }
  if (same && j > i) {
    for (k=n-1; k>=0; k--) {
      dest[j + k] = src[i + k];
    }
  } else {
    for (k=0; k<n; k++, offs += inc) {
      dest[k + j] = src[i + offs];
    }
  }
}

export function extendBuffer(src, newLen, copyLen) {
  var len = Math.max(src.length, newLen);
  var n = copyLen || src.length;
  var dest = new src.constructor(len);
  copyElements(src, 0, dest, 0, n);
  return dest;
}

export function mergeNames(name1, name2) {
  var merged;
  if (name1 && name2) {
    merged = findStringPrefix(name1, name2).replace(/[-_]$/, '');
  }
  return merged || '';
}

export function findStringPrefix(a, b) {
  var i = 0;
  for (var n=a.length; i<n; i++) {
    if (a[i] !== b[i]) break;
  }
  return a.substr(0, i);
}

export function parsePercent(o) {
  var str = String(o);
  var isPct = str.indexOf('%') > 0;
  var pct;
  if (isPct) {
    pct = Number(str.replace('%', '')) / 100;
  } else {
    pct = Number(str);
  }
  if (!(pct >= 0 && pct <= 1)) {
    stop(format("Invalid percentage: %s", str));
  }
  return pct;
}

export function formatVersionedName(name, i) {
  var suffix = String(i);
  if (/[0-9]$/.test(name)) {
    suffix = '-' + suffix;
  }
  return name + suffix;
}

export function uniqifyNames(names, formatter) {
  var counts = countValues(names),
      format = formatter || formatVersionedName,
      names2 = [];

  names.forEach(function(name) {
    var i = 0,
        candidate = name,
        versionedName;
    while (
        names2.indexOf(candidate) > -1 || // candidate name has already been used
        candidate == name && counts[candidate] > 1 || // duplicate unversioned names
        candidate != name && counts[candidate] > 0) { // versioned name is a preexisting name
      i++;
      versionedName = format(name, i);
      if (!versionedName || versionedName == candidate) {
        throw new Error("Naming error"); // catch buggy versioning function
      }
      candidate = versionedName;
    }
    names2.push(candidate);
  });
  return names2;
}


// Assume: @raw is string, undefined or null
export function parseString(raw) {
  return raw ? raw : "";
}

// Assume: @raw is string, undefined or null
// Use null instead of NaN for unparsable values
// (in part because if NaN is used, empty strings get converted to "NaN"
// when re-exported).
export function parseNumber(raw) {
  return parseToNum(raw, cleanNumericString);
}

export function parseIntlNumber(raw) {
  return parseToNum(raw, convertIntlNumString);
}

function parseToNum(raw, clean) {
  var str = String(raw).trim();
  var parsed = str ? Number(clean(str)) : NaN;
  return isNaN(parsed) ? null : parsed;
}

// Remove comma separators from strings
export function cleanNumericString(str) {
  return (str.indexOf(',') > 0) ? str.replace(/,([0-9]{3})/g, '$1') : str;
}

function convertIntlNumString(str) {
  str = str.replace(/[ .]([0-9]{3})/g, '$1');
  return str.replace(',', '.');
}

export function trimQuotes(str) {
  var len = str.length, first, last;
  if (len >= 2) {
    first = str.charAt(0);
    last = str.charAt(len-1);
    if (first == '"' && last == '"' && !str.includes('","') ||
        first == "'" && last == "'" && !str.includes("','")) {
      str = str.substr(1, len-2);
      // remove string escapes
      str = str.replace(first == '"' ? /\\(?=")/g : /\\(?=')/g, '');
    }
  }
  return str;
}
