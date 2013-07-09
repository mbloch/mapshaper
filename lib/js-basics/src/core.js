
var C = C || {}; // global constants

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
      val = func.call(ctx || null, arr[i], val, i);
    }
    return val;
  },


  mapObjectToArray: function(obj, func, ctx) {
    var i = 0,
        arr = null,
        retn;
    if (!Utils.isString(obj) && Utils.isObject(obj)) {
      arr = [];
      for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
          retn = func.call(ctx, obj[key], key)
          if (retn !== void 0) arr[i++] = retn;
        }
      }
    }
    return arr;
  },

  mapObjectToObject: function(src, func, ctx) {
    var dest = {};
    for (var key in src) {
      if (src.hasOwnProperty(key)) {
        dest[key] = func.call(ctx, src[key], key)
      }
    }
    return dest;
  },

  map: function(obj, func, ctx) {
    if (!Utils.isArrayLike(obj))
      return Utils.mapObjectToArray(obj, func, ctx);

    var arr = [], retn;
    for (var i=0, n = obj.length; i < n; i++) {
      retn = func.call(ctx, obj[i], i);
      if (retn !== void 0) arr[i] = retn;
    }
    return arr.length == obj.length ? arr : null;
  },

  // Array like: has length property, is numerically indexed and mutable.
  //
  isArrayLike: function(obj) {
    // approximate test
    return obj && (Utils.isArray(obj) || (obj.length === 0 || obj.length > 0 && obj[obj.length-1] !== void 0) && !Utils.isString(obj));
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

  /**
   * from underscore.js; NaN -> true
   */
  isNumber: function(obj) {
    // return toString.call(obj) == '[object Number]'; // ie8 breaks?
    return obj != null && obj.constructor == Number;
  },

  isString: function(obj) {
    return obj != null && obj.toString === String.prototype.toString; // TODO: replace w/ something better.
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

  getConstructorName: function(obj) {
    var matches = String(obj.constructor).match(/^function ([^(]+)\(/);
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
  // @param validJS Strings are quoted and escaped; if false or undefined, quotes are left
  //   off for cleaner-looking output and long strings are truncated.
  //
  toString: function(obj, validJS) {
    validJS = validJS !== false;
    var type = typeof obj,
        str;

    if (type == 'function') {
      str = '"[function]"';
    } else if (obj == null) { // null or undefined
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
      str = '"[' + (Utils.getConstructorName(obj) || "unknown object") + ']"';
    } else {
      // strings, numbers and objects with own "toString" methods.
      // TODO: make sure that strings made by toString methods are quoted for js.
      str = String(obj);
      if (Utils.isString(obj)) {
        if (validJS) {
          str = '"' + Utils.addslashes(str) + '"';
        } else if (str.length > 400) {
          str = str.substr(0, 400) + " ...";
        }
      }
    }
    return str;
  },

  strval: function(o) {
    return Utils.toString(o, false);
  },

  serialize: function(o) {
    return Utils.toString(o, true);
  },

  // See https://raw.github.com/kvz/phpjs/master/functions/strings/addslashes.js
  //
  addslashes: function(str) {
    return (str + '').replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0');
  }
};

Utils.extend = function(dest, src, noreplace) {
  var replace = !noreplace;
  dest = dest || {};
  if (src) {
    // Copy everything, including objects from prototypes...
    // (Adding hasOwnProperty() will break some things in Opts)
    for (var key in src) {
      if (replace || dest[key] === void 0) {
        dest[key] = src[key];
      }
    }
  }
  return dest;
};

var Opts = {
  copyAllParams: Utils.extend,

  copyNewParams: function(dest, src) {
    return Utils.extend(dest, src, true);
  },

  // Copy src functions/params to targ prototype
  // If there's a collision, retain targ param
  extendPrototype : function(targ, src) {
    Utils.extend(targ.prototype, src.prototype || src);
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
  inherit : function(targ, src) {
    var f = function() {
      // replaced: // if (this.constructor === targ) {
      if (this.__super__ == f) {
        // add __super__ of parent to front of lookup chain
        // so parent class constructor can call its parent using this.__super__
        //
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

  subclass : function(parent) {
    var child = function() {
      this.__super__.apply(this, arguments);
    };
    Opts.inherit(child, parent);
    return child;
  },

  namespaceExists : function(name) {
    var node = window;
    var parts = name.split('.');
    var exists = Utils.reduce(parts, function(part, val) {
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

  getNamespace : function(name, root) {
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
    if (!name) error("Opts.exportObject() Invalid name:", path);
    if (name) {
      var ns = Opts.getNamespace(parts.join('.'), root);
      ns[name] = obj;
    }
  }
};

var trace = function() {
  if (!Env.inBrowser || (typeof Browser) == 'undefined' || Browser.traceEnabled()) {
    Utils.log(Utils.map(arguments, Utils.strval).join(' '));
  }
};

var error = function() {
  var msg = Utils.map(arguments, Utils.strval).join(' ');
  throw new Error(msg);
};

var warn = function() {
  Utils.log(Utils.map(arguments, Utils.strval).join(' '));
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
