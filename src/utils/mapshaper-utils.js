/* @requires mbloch-utils */

var Buffer = require('buffer').Buffer; // works with browserify

utils.createBuffer = function(arg, arg2) {
  if (utils.isInteger(arg)) {
    return Buffer.allocUnsafe ? Buffer.allocUnsafe(arg) : new Buffer(arg);
  } else {
    // check allocUnsafe to make sure Buffer.from() will accept strings (it didn't before Node v5.10)
    return Buffer.from && Buffer.allocUnsafe ? Buffer.from(arg, arg2) : new Buffer(arg, arg2);
  }
};

utils.wildcardToRegExp = function(name) {
  var rxp = name.split('*').map(function(str) {
    return utils.regexEscape(str);
  }).join('.*');
  return new RegExp('^' + rxp + '$');
};

utils.expandoBuffer = function(constructor, rate) {
  var capacity = 0,
      k = rate >= 1 ? rate : 1.2,
      buf;
  return function(size) {
    if (size > capacity) {
      capacity = Math.ceil(size * k);
      buf = new constructor(capacity);
    }
    return buf;
  };
};

utils.copyElements = function(src, i, dest, j, n, rev) {
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

utils.extendBuffer = function(src, newLen, copyLen) {
  var len = Math.max(src.length, newLen);
  var n = copyLen || src.length;
  var dest = new src.constructor(len);
  utils.copyElements(src, 0, dest, 0, n);
  return dest;
};

utils.mergeNames = function(name1, name2) {
  var merged;
  if (name1 && name2) {
    merged = utils.findStringPrefix(name1, name2).replace(/[-_]$/, '');
  }
  return merged || '';
};

utils.findStringPrefix = function(a, b) {
  var i = 0;
  for (var n=a.length; i<n; i++) {
    if (a[i] !== b[i]) break;
  }
  return a.substr(0, i);
};

// Similar to isFinite() but does not convert strings or other types
utils.isFiniteNumber = function(val) {
  return val === 0 || !!val && val.constructor == Number && val !== Infinity && val !== -Infinity;
};

utils.isNonNegNumber = function(val) {
  return val === 0 || val > 0 && val.constructor == Number;
};

utils.parsePercent = function(o) {
  var str = String(o);
  var isPct = str.indexOf('%') > 0;
  var pct;
  if (isPct) {
    pct = Number(str.replace('%', '')) / 100;
  } else {
    pct = Number(str);
  }
  if (!(pct >= 0 && pct <= 1)) {
    stop(utils.format("Invalid percentage: %s", str));
  }
  return pct;
};

utils.formatVersionedName = function(name, i) {
  var suffix = String(i);
  if (/[0-9]$/.test(name)) {
    suffix = '-' + suffix;
  }
  return name + suffix;
};

utils.uniqifyNames = function(names, formatter) {
  var counts = utils.countValues(names),
      format = formatter || utils.formatVersionedName,
      blacklist = {};

  Object.keys(counts).forEach(function(name) {
    if (counts[name] > 1) blacklist[name] = true; // uniqify all instances of a name
  });
  return names.map(function(name) {
    var i = 1, // first version id
        candidate = name,
        versionedName;
    while (candidate in blacklist) {
      versionedName = format(name, i);
      if (!versionedName || versionedName == candidate) {
        throw new Error("Naming error"); // catch buggy versioning function
      }
      candidate = versionedName;
      i++;
    }
    blacklist[candidate] = true;
    return candidate;
  });
};
