(function(){

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
      matches = /^(http):\/\/([^\/]+)(.*)/.exec(url); // TODO: improve
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
    return obj && (Utils.isArray(obj) || obj.length > 0 && obj[obj.length-1] !== void 0 && !Utils.isString(obj));
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



function Transform() {
  this.mx = this.my = 1;
  this.bx = this.by = 0;
}

Transform.prototype.invert = function() {
  var inv = new Transform();
  inv.mx = 1 / this.mx;
  inv.my = 1 / this.my;
  inv.bx = -this.bx / this.mx;
  inv.by = -this.by / this.my;
  return inv;
};


/*
Transform.prototype.useTileBounds = function(wPix, hPix, bb) {
  var ppm = wPix / (bb.right - bb.left);
  this.mx = ppm;
  this.my = hPix / (bb.bottom - bb.top);
  this.bx = -ppm * bb.left;
  this.by = -this.my * bb.top;
  return this;
};
*/

Transform.prototype.transform = function(x, y, xy) {
  xy = xy || [];
  xy[0] = x * this.mx + this.bx;
  xy[1] = y * this.my + this.by;
  return xy;
};

// Transform.prototype.toString = function() {};

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
  return !isNaN(this.ymax);
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
// * FIXED * may give false positives if bubbles are located outside corners of the box
//
Bounds.prototype.containsBufferedPoint = function( x, y, buf ) {
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

/**
 * Rescale the bounding box by a fraction. TODO: implement focus.
 * @param {number} pct Fraction of original extents
 * @param {number} pctY Optional amount to scale Y
 */
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

/**
 * Return a bounding box with the same extent as this one.
 */
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

// TODO: pick a better name
// expands either x or y dimension to match @aspect (width/height ratio)
// @focusX, @focusY (optional): expansion focus, as a fraction of width and height
//
Bounds.prototype.fillOut = function(aspect, focusX, focusY) {
  if (arguments.length < 3) {
    focusX = 0.5;
    focusY = 0.5;
  }
  var w = this.width(),
      h = this.height(),
      currAspect = w / h,
      pad;
  if (currAspect < aspect) { // fill out x dimension
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


/** @requires core */

function Handler(type, target, callback, listener, priority) {
  this.type = type;
  this.callback = callback;
  this.context = listener || null;
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
  this.callback.call(this.context, evt);
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
  var str = 'type:' + this.type + ', target: ' + Utils.strval(this.target);
  if (this.data) {
    str += ', data:' + Utils.strval(this.data);
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
EventDispatcher.prototype.dispatchEvent =
EventDispatcher.prototype.trigger = function(type, obj, ctx) {
  var evt;
  // TODO: check for bugs if handlers are removed elsewhere while firing
  var handlers = this._handlers;
  if (handlers) {
    for (var i = 0, len = handlers.length; i < len; i++) {
      var handler = handlers[i];
      if (handler.type == type && (!ctx || handler.context == ctx)) {
        if (!evt) {
          evt = new EventData(type, this, obj);
        }
        else if (evt.__stop__) {
            break;
        }
        handler.trigger(evt);
      }
    }

    if (type == 'ready') {
      this.removeEventListeners(type, null, ctx);
    }
  }
};


/**
 * Test whether a type of event has been fired.
 * @param {string} type Event type.
 * @return {boolean} True if event was fired else false.
 */
/*
EventDispatcher.prototype.eventHasFired = function(type) {
  return !!this._firedTypes && this._firedTypes[type] == true;
};
*/

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

  // Special case: 'ready' handler fires immediately if target is already ready.
  // (Applicable to Waiter class objects)
  if (type == 'ready' && this._ready) {
    // trace("Warning: Waiter.waitFor() no longer uses this; this:", this, "handler ctx:", context);
    handler.trigger();
    return this;
  }

  // Insert the new event in the array of handlers according to its priority.
  //
  var handlers = this._handlers || (this._handlers = []);
  var i = handlers.length;
  while(--i >= 0 && handlers[i].priority > handler.priority) {}
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
EventDispatcher.prototype.removeEventListener =
  function(type, callback, context) {
  // using "this" if called w/o context (see addEventListener())
  context = context || this;
  return this.removeEventListeners(type, callback, context);
};

/**
 * Remove event handlers that match function arguments.
 * @param {string=} type Event type to match.
 * @param {function(BoundEvent)=} callback Event handler function to match.
 * @param {*=} context Execution context of the event handler to match.
 * @return {number} Number of handlers removed.
 */
EventDispatcher.prototype.removeEventListeners =
  function(type, callback, context) {
  var handlers = this._handlers;
  var newArr = [];
  var count = 0;
  for (var i = 0; handlers && i < handlers.length; i++) {
    var evt = handlers[i];
    if ((!type || type == evt.type) &&
      (!callback || callback == evt.callback) &&
      (!context || context == evt.context)) {
      count += 1;
    }
    else {
      newArr.push(evt);
    }
  }
  this._handlers = newArr;
  return count;
};


/**
 * Support for handling asynchronous dependencies.
 * Waiter becomes READY and fires 'ready' after any/all dependents are READY.
 * Instantiate directly or use as a base class.
 * Public interface:
 *   waitFor()
 *   startWaiting()
 *   isReady()
 *
 */
function Waiter() {}
Opts.inherit(Waiter, EventDispatcher);

/**
 * Test whether all dependencies are complete, enter ready state if yes.
 */
Waiter.prototype._testReady = function() {
  if (!this._ready && !this._waitCount && this._started) {
    this._ready = true;

    // Child classes can implement handleReadyState()
    this.handleReadyState && this.handleReadyState();
    this.dispatchEvent('ready');
  }
};


/* */
Waiter.prototype.callWhenReady = function(func, args, ctx, priority) {
  this.addEventListener('ready', function(evt) {func.apply(ctx, args);}, ctx, priority);
};


/**
 * Event handler, fired when dependent is ready.
 * @param {BoundEvent} evt Event object.
 */
Waiter.prototype._handleDependentReady = function(evt) {
  if (! this._waitCount) {
    trace('[Waiter.onDependendReady()]',
    'Counting error. Event: ' + Utils.strval(evt) + '; ready? ' + this._ready);
    return;
  }
  this._waitCount -= 1;
  this._testReady();
};


/**
 * Checks if Waiter-enabled object is READY.
 * @return {boolean} True if READY event has fired, else false.
 */
Waiter.prototype.isReady = function() {
  return this._ready == true;
};

/**
 * Wait for a dependent object to become READY.
 * @param {*} obj Class object that implements EventDispatcher.
 * @param {string=} type Event to wait for (optional -- default is 'ready').
 */
Waiter.prototype.waitFor = function(dep, type) {
  if (!dep) {
    trace("[Waiter.waitFor()] missing object; this:", this);
    return this;
  }
  else if (!dep.addEventListener) {
    trace("[Waiter.waitFor()] Need an EventDispatcher; this:", this);
    return this;
  }

  if (!type) {
    type = 'ready';
  }

  // Case: .waitFor() called after this.isReady() becomes true
  if (this._ready) {
    // If object is already READY, ignore....
    if (type == 'ready' && dep.isReady()) {
      return;
    }
    trace("[Waiter.waitFor()] already READY; resetting to isReady() == false;");
    this._ready = false;
    // return this;
    // TODO: prepare test cases to check for logic errors.
  }

  if (type != 'ready'  || dep.isReady() == false) {
    this._waitCount = this._waitCount ? this._waitCount + 1 : 1;
    dep.addEventListener(type, this._handleDependentReady, this);
  }

  return this;
};

/**
 * Start waiting for any dependents to become ready.
 * Should be called after all waitFor() calls.
 */
Waiter.prototype.startWaiting = function(callback, ctx) {
  // KLUDGE: callback may be an BoundEvent if startWaiting is used as an event handler.
  typeof(callback) == 'function' && this.addEventListener('ready', callback, ctx);
  this._started = true;
  this._testReady();
  return this; // for chaining
};



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

/* @requires core, sorting */

Utils.contains = function(container, item) {
  if (Utils.isString(container)) {
    return container.indexOf(item) != -1;
  }
  else if (Utils.isArrayLike(container)) {
    return Utils.indexOf(container, item) != -1;
  }
  error("Expected Array or String argument");
};

// transposes an object of (assumed equal-size) column arrays to an array of object-records
//
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

/* */
Utils.findInArray = function(obj, arr, prop) {
  return Utils.indexOf(arr, obj, prop);
};

Utils.toArray = function(obj) {
  if (!Utils.isArrayLike(obj)) error("Utils.toArray() requires an array-like object");
  return Array.apply([], obj);
  /*
  var arr = [];
  for (var i=0, n=obj.length; i<n; i++) {
    arr.push(obj[i]);
  }
  return arr;*/
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

/*
Utils.sum = function(arr) {
  var tot = 0;
  for (var i=0, len=arr.length; i<len; i++) {
    var val = arr[i];
    if (val !== val) error("Utils#sum() Array contains NaN");
    tot += val;
  }
  return tot;
};
*/

// Calc sum, skip falsy and NaN values
// Assumes: no other non-summable objects in array
//
Utils.sum = function(arr) {
  var tot = 0,
      val;
  for (var i=0, n=arr.length; i<n; i++) {
    val = arr[i];
    if (val) {
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


/* @requires events, core, arrayutils */

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

  Node.toBuffer = function(src) {
    if (src instanceof Buffer) return src;
    var dest = new Buffer(src.byteLength);
    for (var i = 0, n=dest.length; i < n; i++) {
      dest[i] = src[i];
    }
    return dest;
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

  //Node.resolvePathFromFile = function(path) {
  //  return Node.path.join(__dirname, path);
  //}
  Node.pathIsAbsolute = function(path) {
    return (path[0] == '/' || path[0] == "~");
  };

  Node.resolvePathFromShell = function(path) {
    if (Node.pathIsAbsolute(path))
      return path;
    return Node.path.join(process.cwd(), path);
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
    if (filename.lastIndexOf('/') == filename.length - 1) {
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
    Opts.copyAllParams(info, {exists: false, is_directory: false, is_file: false});
    if (stat = Node.statSync(fpath)) {
      if (stat.isFile()) {
        info.exists = true;
        info.is_file = true;
      } else {
        info.is_directory = true;
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
      trace("[Node.readFile()] Error reading file:", fname, "err:", e);
    }
    return content;
  };

  Node.writeFile = function(path, content) {
    if (content instanceof ArrayBuffer)
      content = Node.toBuffer(content);
    Node.fs.writeFile(path, content, function(err) {
      if (err) {
        trace("[Node.writeFile()] Failed to write to file:", path);
      }
    });
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
      if (!str) {
        callback(null);
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
        error("Node#readJson() Error reading from url:", url, "--", e);
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

    var aliases = Utils.reduce((o.aliases || "").split(','), function(item, obj) {
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
    return opts;
  };
}


/*
Node.loadUrl = function(url) {
  return new NodeUrlLoader(url);
};



function NodeUrlLoader(url) {
  var self = this,
    body = "",
    output,
    opts = Utils.parseUrl(url);
  delete opts.protocol;
  opts.port = 80;

  require('http').get(opts, function(resp) {
    if (resp.headers['content-encoding'] == 'gzip') {
      var gzip = zlib.createGunzip();
      resp.pipe(gzip);
      output = gzip;
    } else {
      output = resp;
    }
    output.on('data', function(chunk) {
      body += chunk;
    });
    output.on('end', function() {
      self.data = body;
      self.startWaiting();
    });

  }).on("error", function(e){
    trace("[NodeUrlLoader] error: " + e.message);
  });
}

Opts.inherit(NodeUrlLoader, Waiter);
*/

/* @requires core */

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
  this._view = new DataView(buf);
  this._idx = 0;
  this._le = le !== false;
  this._words = buf.byteLength % 4 == 0 ? new Uint32Array(buf) : null;
}

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

BinArray.buffersAreIdentical = function(a, b) {
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

  readInt8: function() {
    return this._view.getInt8(this._idx++);
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
        i = this._idx;
    var arr = i % 8 === 0 ?
      // Inconsistent: first is a view, second a copy...
      new Float64Array(this._buffer, i, len) :
      new Float64Array(this._buffer.slice(i, i + bytes));
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
    return this._buffer[this._idx];
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

  writeBuffer: function(src, bytes, startIdx) {
    var srcIdx, dest, destIdx, endIdx, count;
    bytes = bytes || BinArray.bufferSize(src);
    startIdx = startIdx | 0;
    if (this.bytesLeft() < bytes)
      error("Buffer overflow; available bytes:", this.bytesLeft(), "tried to write:", bytes);

    // When possible, copy buffer data in 4-byte chunks... Added this for faster copying of
    // shapefile data, which is aligned to 32 bits.
    var useChunks = this._words && bytes > 300 && this._idx % 4 == 0 && startIdx % 4 === 0 && bytes % 4 === 0;
    if (useChunks) {
      dest = this._words;
      src = new Uint32Array(src);
      srcIdx = startIdx / 4;
      destIdx = this._idx / 4;
      count = bytes / 4;
    } else {
      dest = this._buffer;
      srcIdx = startIdx;
      destIdx = this._idx;
      count = bytes;
    }
    while (count--) {
      dest[destIdx++] = src[srcIdx++];
    }
    this._idx += bytes;
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



/** // required by DataTable */


function joinDataTables(dest, destKey, src, srcKey, srcFilter) {
  if (!dest.isReady() || !src.isReady()) {
    trace("[JoinedTable.joinTables()] Source or destination table is not ready; src:", src.isReady(), "dest:", dest.isReady());
    return;
  }

  if (!dest.fieldExists(destKey)) {
    trace("[JoinedTable.joinTable()] destination table is missing its key field: ", destKey);
    return;    
  }
  
  if (!src.fieldExists(srcKey)) {
    trace("[JoinedTable.joinTable()] source table is missing its key field:", srcKey);
    return;
  }

  var filtered = srcFilter && typeof srcFilter == 'function';
  var destSchema = dest.schema;
  var srcSchema = src.schema;
  var destLen = dest.size();
  var srcLen = src.size();

  var keyArr = Utils.getKeys(srcSchema);
  //keyArr = Utils.filter(keyArr, function(val) { return !(val in destSchema)});
  keyArr = Utils.filter(keyArr, function(fieldName) { return !(fieldName == destKey)});

  var fieldCount = keyArr.length;
  var destDataArr = Utils.createArray(fieldCount, function() {return new Array(destLen);});
  var srcDataArr = Utils.map(keyArr, function(key) {return src.getFieldData(key);});

  var index = dest.__getIndex(destKey);
  var srcKeyArr = src.getFieldData(srcKey);
  var lookup = new Array(destLen);

  var filterRec = src.getRecordById(0);
  for (var i=0; i<srcLen; i++) {
    if (filtered) {
      filterRec.id = i;
      if (!srcFilter(filterRec)) {
        continue;
      }
    }
    var val = srcKeyArr[i];
    var destId = index[val];
    lookup[i] = destId; //  === undefined ? -1 : destId;
  }

  for (var i=0; i<fieldCount; i++) {
    var destArr = destDataArr[i];
    var srcArr = srcDataArr[i];
    for (var j=0; j<srcLen; j++) {
      var destId = lookup[j];
      if (destId !== undefined) {
        destArr[destId] = srcArr[j];
      }
    }
  }

  var schema = {};
  var data = {};
  Opts.copyAllParams(schema, destSchema);
  Opts.copyAllParams(data, dest.data);

  Opts.copyNewParams(schema, srcSchema);
  Opts.copyAllParams(data, Utils.arrayToIndex(keyArr, destDataArr));

  dest.populate(data, schema);
};

/*

JoinedTable.prototype.joinTablesV1 = function(dest, destKey, src, srcKey) {
  if (!dest.fieldExists(destKey) || !src.fieldExists(srcKey)) {
    trace("[JoinedTable] missing one or more key fields:", srcKey, destKey);
    return;
  }
  
  var destSchema = dest.schema;
  var srcSchema = src.schema;
  
  var keyArr = Utils.getKeys(srcSchema);

  keyArr = Utils.filter(keyArr, function(val) { return !(val in destSchema)});

  var fieldCount = keyArr.length;
  var destDataArr = Utils.createArray(fieldCount, Array);
  var srcDataArr = Utils.map(keyArr, function(key) {return src.getFieldData(key);});

  var nullVal = null;
  var index = src.indexOnField(srcKey);
  var destKeyData = dest.getFieldData(destKey);

  for (var i=0, len=destKeyData.length; i<len; i++) {
    var destVal = destKeyData[i];
    var srcId = index[destVal];
    var isNull = srcId === undefined;
    for (var j=0; j<fieldCount; j++) {
      destDataArr[j].push( isNull ? nullVal : srcDataArr[j][srcId]);
    }
  }


  var schema = {};
  var data = {};
  Opts.copyAllParams(schema, destSchema);
  Opts.copyAllParams(data, dest.data);

  Opts.copyNewParams(schema, srcSchema);
  Opts.copyAllParams(data, Utils.arrayToIndex(keyArr, destDataArr));

  this.populate(data, schema);

  //trace("[destData]", destDataArr[0]);

};

*/

/* @requires core, events, arrayutils, table-join */

Opts.copyAllParams(C, { 
  INTEGER: 'integer',
  STRING: 'string',
  DOUBLE: 'double',
  OBJECT: 'object'
});


/**
 * DataTable is a js version of the as3 DataTable class.
 * @constructor
 */
function DataTable() {
  if (arguments.length > 0) {
    var arg0 = arguments[0];
    if (arg0 == null) {
      error("Received empty data object -- check data source");
    }
    // (optional) Initialize table w/ js object.
    if (arg0 && arg0.schema) {
      this.populate(arg0.data || null, arg0.schema);
    }
  }
  else {
    this.__initEmptyTable();
  }
}

Opts.inherit(DataTable, Waiter);


DataTable.validateFieldType = function(raw) {
  raw = raw.toLowerCase();
  var type = C.STRING; // default type
  switch (raw) {
    case 'string':
    case 'str':
      type = C.STRING;
      break;
    case 'int':
    case 'integer':
      type = C.INTEGER;
      break;
    case 'double':
    case 'decimal':
    case 'number':
      type = C.DOUBLE;
      break;
    case 'obj':
    case 'object':
      type = C.OBJECT;
      break;
  }
  return type;
};

DataTable.prototype.toString = function() {
  var str = "[DataTable length:" + this.size() + ", schema:" + Utils.toString(this.schema) + "]";
  return str;
};


DataTable.prototype.handleReadyState = function() {
  this._indexedField && this.indexOnField(this._indexedField); // Build index, if deferred.
};


/**
 * Returns the number of rows in the table.
 */
DataTable.prototype.size = function() {
  return this.length;
};


DataTable.prototype.joinTableByKey = function(localKey, otherTable, otherKey, filter) {
  this.waitFor(otherTable);
  this.addEventListener('ready', callback, this, 999);
  function callback() {
    joinDataTables(this, localKey, otherTable, otherKey, filter);
  };
  return this;
};


/**
 * Import an array of objects and an o(ptional) object of field types
 * @param arr Array of object records (i.e. each property:value is a fieldname:value pair)
 * @param schema Object of field types; each property:value is a fieldname:type pair. Valid types include double, integer, string, object
 */
DataTable.prototype.importObjectRecords = function(arr, schema) {
  if (!arr || arr.length == 0) error("Missing array of data values");
  var rec0 = arr[0];
  if (!Utils.isObject(rec0)) error("Expected an array of objects");

  var fields, types;
  if (schema) {
    types = [];
    fields = [];
    Utils.forEach(schema, function(val, key) {
      types.push(val);
      fields.push(val);
    });
  }
  else {
    fields = Utils.getKeys(rec0);
  }

  return this.importArrayRecords(arr, fields, types);
};


/**
 * Import an array of records.
 * @param arr Array of Objects or Arrays
 * @param fields Array of field names
 * @param types Array of field types (optional).
 */
DataTable.prototype.importArrayRecords = function(arr, fields, types) {
  if (!arr || arr.length == 0) error("Missing array of data values");

  var rec0 = arr[0];
  var fieldIndex;
  if (Utils.isObject(rec0)) {
    fieldIndex = fields;
  }
  else if (Utils.isArray(rec0)) {
    fieldIndex = Utils.map(fields, function(val, i) {
      return i;
    });
  }
  else {
    error("Invalid record type; expected Arrays or Objects");
  }

  // if missing types, try to identify them
  if (!types) {
    types = [];
    Utils.forEach(fieldIndex, function(fieldId, i) {
      var val = rec0[fieldId];
      if (Utils.isString(val)) {
        types.push('string');
      }
      else if (!isNaN(val)) {
        types.push('double');
      }
      else {
        trace("[DataTable.importArrayRecords()] unrecognized type of field:", fields[i], "-- using 'object' type");
        types.push('object');
      }
    });
  }
  else {
    if (types.length != fields.length) error("Mismatched types and fields; types:", types, "fields:", fields);
  }


  var columns = Utils.map(fields, function() {
    return [];
  });

  for (var rid=0, len=arr.length; rid<len; rid++) {
    var rec = arr[rid];
    for (var j=0, numFields = fields.length; j<numFields; j++) {
      columns[j].push(rec[fieldIndex[j]]);
    }
  }

  // generate schema and data objects
  var data = {}, schema = {};
  Utils.forEach(fields, function(fname, i) {
    data[fname] = columns[i];
    schema[fname] = types[i];
  });

  this.populate(data, schema);

  return this;
};

/*
DataTable.prototype.importData = function(loader, parser, filter) {

  var handler = function() {
    var content = parser.parse(loader.data);

    if (filter) {
      var proxy = new DataTable();
      proxy.populate(content.data, content.schema);
      var proxy = proxy.filter(filter);
      content.data = proxy.data;
      content.schema = proxy.schema;
    }

    this.populate(content.data, content.schema);
  };

  loader.addEventListener('ready', handler, this);
  return this;
};
*/

DataTable.prototype.getFields = function() {
  return Utils.getKeys(this.data);
};

DataTable.prototype.__initEmptyTable = function(rawSchema) {
  this.data = {};
  this.length = 0;
  this.schema = {};
  this._rec = new Record(this, -1);
  //this._index = {};
  if (rawSchema) {
    for (var key in rawSchema) {
      if (!rawSchema.hasOwnProperty(key)) {
        continue;
      }

      var type = DataTable.validateFieldType(rawSchema[key]);
      if (!type) {
        trace("[DataTable.__initEmptyTable()] invalid type for field: ", key, ":", rawSchema[key]);
        continue;
      }

      this.schema[key] = type;
      this.data[key] = [];
    }
  }
};


/**
 * Import a dataset into the table.
 *
 * @param {object} data Object containing data arrays, indexed by field name.
 * @param {object} schema Object containing field types, indexed by field name.
 */
DataTable.prototype.populate = function(data, schema) {

  // case: missing a schema object -- error condition.
  if (!schema) error("Missing schema object");

  // case: no date -- initalize empty table
  if (!data) {
    this.__initEmptyTable(schema);
  }

  // case: array of objects (common format for json data)
  // case: array of arrays plus array of fields
  // TODO: detect field types, if schema is missing
  //
  else if (Utils.isArray(data)) {
    this.__initEmptyTable(schema);
    for (var i=0, len=data.length; i<len; i++) {
      this.appendRecordData(data[i]);
    }
  }

  // case: optimal format: one data array per column
  else {
    this.__initEmptyTable();
    var len = 0;
    for (var key in schema) {
      if (!schema.hasOwnProperty(key)) {
        continue;
      }

      // initialize empty table, if data is missing...
      if (!data) {
        this.data[key] = [];
        continue;
      }

      this.schema[key] = DataTable.validateFieldType(schema[key]);

      if (!data[key]) {
        trace("[DataTable.populate()] Missing data for field:", key, "schema:", schema);
        continue;
      }
      var thisLen = data[key].length;
      this.data[key] = data[key];
      if (len > 0 && thisLen != len) {
        trace("[DataTable.populate()] Warning: inconsistent field length. Expected length:", len, "Field name:", key, "Field length:", thisLen);
      }
      else {
        len = thisLen;
      }
    }

    this.length = len;
  }

  if (this.isReady()) {
    // if indexed, rebuild index; TODO: remove redundancy with appendRecordData() (above)
    if (this._indexedField) {
      this.indexOnField(this._indexedField);
    }
    this.dispatchEvent('change');
  }
  else {
    this.startWaiting();
  }

  return this; // for chaining
};


/**
 * Returns a Record pointing to the table with a particular id.
 *
 * @param {number} id Id of the row (Tables are 0-indexed, like arrays).
 * @return {Record} Record.
 */
DataTable.prototype.getRecordById = function(id) {
  this._rec.id = id;
  return this._rec;
};

/**
 * Tests whether the table contains a particular field.
 * @param {string} f Name of a field.
 * @return {boolean} True or false.
 */
DataTable.prototype.fieldExists = function(f) {
  return !!(this.schema && this.schema[f]);
};

DataTable.prototype.getFieldType = function(f) {
  return this.schema[f];
};

/**
 * Returns a Record pointing to the row containing an indexed value.
 *
 * @param {*} v Value in an indexed column.
 * @return {Record} Record pointing to indexed row, or a null record.
 */
DataTable.prototype.getIndexedRecord = function(v, fast) {
  var rec = fast ? this._rec : new Record(this, -1);
  var idx = this._index[v];
  if (idx == null) {
    idx = -1;
  }
  rec.id = idx;
  return rec;
};


/**
 * Indexes the table on the contents of one field.
 * Overwrites any previous index.
 * Assumes the field values are unique.
 *
 * @param {string} fname Name of field to index on.
 */
DataTable.prototype.indexOnField = function(fname) {
  this._indexedField = fname;
  if (!this.isReady()) {
    trace("[DataTable.indexOnField()] Table not READY; deferring indexing.]");
    return;
  }
  this._index = this.__getIndex(fname);
  //return this._index;
};


DataTable.prototype.__getIndex = function(fname) {
  if (!this.fieldExists(fname)) error("Missing field:", fname);
  var index = {};
  var arr = this.data[fname];
  for (var i = 0, len = this.size(); i < len; i++) {
    index[arr[i]] = i;
  }
  return index;
};



/**
 * Returns an array of all data values in a column.
 *
 * @param {string} f Name of field.
 * @return {Array} Column of data.
 */
DataTable.prototype.getFieldData = function(f) {
  var arr = this.data[f];
  return arr ? arr : [];
};

DataTable.prototype.addField = function(f, type, def) {
  var arr = Utils.createArray(this.size(), def);
  this.insertFieldData(f, type, arr);
};

/**
 * TODO: accept function
 */
DataTable.prototype.initField = function(f, val) {
  if (this.fieldExists(f) == false) {
    trace("[DataTAble.initField()] field does not exists:", f);
    return;
  }
  var arr = Utils.createArray(this.size(), val);
  this.insertFieldData(f, this.getFieldType(f), arr);
};

DataTable.prototype.deleteField = function(f) {
  if (this._indexedField == f) {
    this._indexedField = null;
  }
  delete this.schema[f];
  delete this.data[f];
  // If deleting last field, set length to 0
  if (Utils.getKeys(this.schema).length == 0) {
    this.length = 0;
  }
};

/**
 * Insert an array of values into the table.
 * @param {string} f Field name.
 * @param {string} type Field type.
 * @param {Array} arr Array of values.
 */
DataTable.prototype.insertFieldData = function(f, type, arr) {
  type = DataTable.validateFieldType(type);
  this.schema[f] = type;
  this.data[f] = arr;

  if (this.length == 0) {
    this.length == arr.length;
  }
  else if (arr.length != this.length) {
    trace("[DataTable.insertFieldData() Warning: column size mismatch");
  }

  // TODO: add integrity checks
  if (this._indexedField == f) {
    this.indexOnField(f);
  }
};

DataTable.prototype.getNullValueForType = function(type) {
  var nullVal = null;
  if (type == C.INTEGER) {
    nullVal = 0;
  } 
  else if (type == C.STRING) {
    nullVal = '';
  }
  else if (type == C.DOUBLE) {
    nullVal = NaN;
  }
  return nullVal;
};

DataTable.prototype.forEach = function(func, ctx) {
  this.getRecordSet().forEach(func, ctx);
};

DataTable.prototype.appendRecordData = function(obj, niceNull) {
  var dest = this.data;
  var ifield = this._indexedField || void 0;
  for (var fname in dest) {
    var val = obj[fname]; // TODO: validate? convert undefined to null?
    
    if (val === void 0 && niceNull) {
      var type = this.schema[fname];
      val = this.getNullValueForType(type);
      if (type == 'double' && isNaN(val)) {
        val = 0.0; // kludge for olympics graphic; need to fix
      }
    }

    dest[fname].push(val);

    // Update index, if field is indexed.
    if (fname === ifield) {
      this._index[val] = this.length;
    }
  }
  this.length += 1;
  return new Record(this, this.length - 1);
};

/**
 * Insert The output of a function into a column of the table.
 *
 * @param {string} f Field name.
 * @param {string} type Field type, e.g. C.DOUBLE.
 * @param {Function(Record)} func Function object.
 */
DataTable.prototype.insertMappedValues = function(f, type, func, ctx) {
  var arr = this.map(func, ctx);
  this.insertFieldData(f, type, arr);
};

DataTable.prototype.updateField = function(f, func, ctx) {
  if (this.fieldExists(f)) {
    var type = this.getFieldType(f);
    this.insertMappedValues(f, type, func, ctx);
  } else {
    trace("[DataTable.updateField()] Field not found:", f);
  }
}

DataTable.prototype.updateValue = function(f, id, val) {
  // TODO: make safer
  if (id < 0 || id >= this.length || !this.data[f]) {
    error("[DataTable.updateValue()] invalid field or id:", f, id);
  }
  this.data[f][id] = val;
  if (this._indexedField === f) {
    this._index[val] = id;
  }
};

DataTable.prototype.map = function(func, ctx) {
  var arr = [];
  var rec = this._rec;
  for (var rid = 0, len = this.size(); rid < len; rid++) {
    rec.id = rid;
    arr.push(func.call(ctx, rec));
  }
  return arr;
};

DataTable.prototype.insertMappedFields = function(fields, types, func) {
  var numFields = fields.length;
  var dataArr = Utils.createArray(numFields, Array); // Array() returns a new Array, just like new Array()
  var rec = this._rec;
  var tmp = [];
  for (var rid = 0, len = this.size(); rid < len; rid++) {
    rec.id = rid;
    func(rec, tmp);
    for (var j=0, len2=numFields; j<numFields; j++) {
      dataArr[j].push(tmp[j]);
    }
  }

  var schema = Utils.arrayToIndex(fields, types);
  var data = Utils.arrayToIndex(fields, dataArr);
  this.populate(data, schema);
};


/**
 * Get a RecordSet containing all rows.
 * @return {RecordSet} RecordSet object.
 */
DataTable.prototype.getRecordSet = function() {
  var ids = Utils.range(this.size());
  return new RecordSet(this, ids);
};

DataTable.prototype.records = DataTable.prototype.getRecordSet;

/**
 * Wrapper for getMatchingRecordSet that returns a single Record object.
 * @return {Record} Matching record or null record.
 */
DataTable.prototype.getMatchingRecord = function() {
  var set = this.getMatchingRecordSet.apply(this, arguments);
  var rec = set.hasNext() ? set.nextRecord : new Record(null, -1);
  return rec;
};


DataTable.prototype.filter = function(func, ctx) {
  return this.getFilteredCopy(this.getRecordSet().filter(func, ctx).getIds());
};

DataTable.prototype.copyFields = function(fields) {
  var src = this;
  var dest = new DataTable();
  Utils.forEach(fields, function(f) {
    if (!src.fieldExists(f)) {
      trace("[DataTable.copyFields()] Missing field:", f);
      return;
    }
    dest.insertFieldData(f, src.getFieldType(f), src.getFieldData(f));
  });

  return dest.startWaiting();
};

/*
DataTable.prototype.getFilteredCopy = function(ids) {
  var dest = {};
  var schema = {};
  Opts.copyAllParams(schema, this.schema);
  
  var newLen = ids.length;
  var src = this.data;
  for (var fname in src) {
    if (!src.hasOwnProperty(fname)) {
      continue;
    }
    var oldArr = src[fname];
    var newArr = [];
    dest[fname] = newArr;

    for (var i=0; i<newLen; i++) {
      var oldId = ids[i];
      newArr.push(oldArr[oldId]);
    }
  }

  var newTable = new DataTable();
  newTable.populate(dest, schema);
  if (this._indexedField) {
    newTable.indexOnField(this._indexedField);
  }
  return newTable;
};
*/

DataTable.prototype.getFilteredCopy = function(ids) {
  var schema = Opts.copyAllParams({}, this.schema);
  
  var newLen = ids.length;
  var dest = Utils.map(this.data, function(arr, key) {
    return Utils.getFilteredCopy(arr, ids);
  });

  var newTable = new DataTable().populate(dest, schema);
  if (this._indexedField) {
    newTable.indexOnField(this._indexedField);
  }
  return newTable;
};

/**
 *  @param f Field name
 *  @param v Field value or array of values
 *
 */
DataTable.prototype.getMatchingIds = function(f, v, ids) {
  /*
  if (Utils.isArray(v)) {
    trace("[DataTable.getMatcingIds()] Arrays no longer accepted.");
    throw "TypeError";
  }
  */
  var matching = [],
    data = this.getFieldData(f),
    func = typeof v == 'function',
    indexed = !!ids,
    matchArr = Utils.isArray(v),
    len = indexed ? ids.length : this.size();

  for (var i=0; i<len; i++) {
    var idx = indexed ? ids[i] : i;
    var val = data[idx];
    if (matchArr) {
      Utils.indexOf(v, val) != -1 && matching.push(idx);
    }
    else if (func ? v(val) : val === v) {
      matching.push(idx);
    }
  }
  return matching;
};


DataTable.prototype.getMatchingRecordSet = function() {
  var ids, f, v;

  for (var i=0; i<arguments.length; i+= 2) {
    f = arguments[i];
    v = arguments[i+1];
    ids = this.getMatchingIds(f, v, ids);
  }

  return new RecordSet(this, ids || []);
};




/**
 * An iterator class containing a subset of rows in a DataTable.
 * @constructor
 * @param {DataTable} table DataTable.
 * @param {Array} ids Array of ids of each record in the RecordSet.
 */
function RecordSet(table, ids) {
  this._idx = 0;
  this.nextRecord = new Record(table, -1);

  this.size = function() {
    return ids.length;
  };

  this.hasNext = function() {
    if (this._idx >= ids.length) {
      this.nextRecord.id = -1;
      this._idx = 0;
      return false;
    }
    this.nextRecord.id = ids[this._idx++];
    return true;
  };

  this.getIds = function() {
    return ids;
  };

  this.getFieldData = function(f) {
    var o = [];
    var data = table.getFieldData(f);
    for (var i=0, len=ids.length; i<len; i++) {
      o.push(data[ids[i]]);
    }
    return o;
  };

  this.sortOnField = function(f, asc) {
    Utils.sortArrayIndex(ids, table.getFieldData(f), asc);
    return this;
  };

  this.filter = function(func, ctx) {
    var rec = new Record(table, -1);
    var oldIds = ids.splice(0, ids.length);
    for (var i=0, len=oldIds.length; i<len; i++) {
      var id = oldIds[i];
      rec.id = id;
      func.call(ctx, rec) && ids.push(id);
    }
    return this;
  };

  this.forEach = function(func, ctx) {
    var i = 0;
    while(this.hasNext()) {
      func.call(ctx, this.nextRecord, i++);
    }
  };

  this.toTable = function() {
    return table.getFilteredCopy(ids);
  };
}



/**
 * A cursor with access to one row of a DataTable.
 *
 * @param {DataTable} table DataTable object.
 * @param {number} rid Id of a row in a DataTable.
 */
function Record(table, rid) {
  this.id = rid;
  this._table = table;
  this._data = table ? table.data : {}; // assume data is never replaced.
}

function NullRecord() {
  this.__super__(null, -1);
}

Opts.inherit(NullRecord, Record);

/**
 * Return a string representation, for debugging.
 * @return {string} String.
 */
Record.prototype.toString = function() {
  var obj = this.getDataAsObject();
  obj.id = this.id;
  return "[Record" + Utils.strval(obj) + "]";
};



/**
 * Test if record is null / points to a valid table row.
 * @return {boolean} True or false.
 */
Record.prototype.isNull = function() {
  return this.id < 0;
};


/**
 * Return a new Record pointing to the same table row as this one.
 * @return {Record} Cloned record.
 */
Record.prototype.clone = function() {
  return new Record(this._table, this.id);
};


/**
 * Return value of a string (C.STRING) field.
 * @param {string} f Field name.
 * @return {string} String value.
 */
Record.prototype.getString = function(f) {
  return this.get(f) || '';
};


/**
 * Return value of a number (C.DOUBLE) field.
 * @param {string} f Field name.
 * @return {number} Numeric value.
 */
Record.prototype.getNumber = function(f) {
  return this.get(f) * 1.0;
};


/**
 * Get value of an integer field (or coerce other type to integer).
 * @param {string} f Field name.
 * @return {number} Integer value.
 */
Record.prototype.getInteger = function(f) {
  return this.get(f) << 0;
};


/**
 * Return a data value of any type.
 * @param {string} f Field name.
 * @return {*} Data of any type.
 */
Record.prototype.get = function(f) {
  var arr = this._data[f];
  var val = arr && arr[this.id];
  return val;
};

Record.prototype.set = function(f, v) {
  // TODO: Make safer. Validate field name, object type, record index.
  /*
  var arr = this._data[f]; // this._table.getFieldData(f);
  if (arr) {
    arr[this.id] = v;
  }
  */
  this._table.updateValue(f, this.id, v);
};


/**
 * Fetches all the data from a Record.
 * Optionally copy data into passed-in object, to avoid {} overhead.
 *
 * @param {object=} objRef Optional parameter.
 * @return {object} Object containing record data, indexed by field name.
 */
Record.prototype.getDataAsObject = function(objRef) {
  var obj = objRef || {};
  Utils.forEach(this._data, function(val, key) {
    obj[key] = val[this.id];
  }, this);
  return obj;
};


/* @requires core */

Utils.leftPad = function(str, size, pad) {
  pad = pad || ' ';
  str = String(str);
  var chars = size - str.length;
  while (chars-- > 0) {
    str = pad + str;
  }
  return str;
};

Utils.trim = function(str) {
  return str.replace(/^\s+|\s+$/g, '');
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


/* @requires dataview, data, textutils */

// DBF file format:
// http://www.dbf2002.com/dbf-file-format.html
// http://www.digitalpreservation.gov/formats/fdd/fdd000325.shtml
// http://www.dbase.com/Knowledgebase/INT/db7_file_fmt.htm
//
// TODO: handle non-ascii characters, e.g. multibyte encodings
// cf. http://code.google.com/p/stringencoding/


// @src is a Buffer or ArrayBuffer or filename
//
function DbfReader(src) {
  if (Utils.isString(src)) {
    src = Node.readFile(src);
  }
  var bin = new BinArray(src);
  this.header = this.readHeader(bin);
  this.records = new Uint8Array(bin.buffer(), this.header.headerSize);
}


DbfReader.prototype.read = function(format) {
  format = format || "rows";
  if (format == "rows") {
    read = this.readRows;
  } else if ( format == "cols") {
    read = this.readCols;
  } else if (format == "table") {
    read = this.readAsDataTable;
  } else {
    error("[DbfReader.read()] Unknown format:", format);
  }
  return read.call(this);
};

DbfReader.prototype.readCol = function(c) {
  var rows = this.header.recordCount,
      col = [];
  for (var r=0; r<rows; r++) {
    col[r] = this.getItemAtRowCol(r, c);
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
      rec[names[c]] = this.getItemAtRowCol(r, c);
    }
  }
  return data;
};

DbfReader.prototype.readAsDataTable = function() {
  var data = this.readCols();
  var schema = Utils.reduce(this.header.fields, {}, function(f, obj) {
    obj[f.name] = f.parseType;
    return obj;
  })
  return new DataTable({schema: schema, data: data});
};

DbfReader.prototype.getItemAtRowCol = function(r, c) {
  var field = this.header.fields[c],
      offs = this.header.recordSize * r + field.columnOffset,
      str = "";
  for (var i=0, n=field.length; i < n; i++) {
    str += String.fromCharCode(this.records[i + offs]);
  }

  var val = field.parser(str);
  return val;
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
    colOffs += field.length;
    header.fields.push(field);
  }

  if (colOffs != header.recordSize)
    error("Record length mismatch; header:", header.recordSize, "detected:", rowSize);
  return header;
};

DbfReader.prototype.readFieldHeader = function(bin) {
  var field = {
    name: bin.readCString(11),
    type: String.fromCharCode(bin.readUint8()),
    address: bin.readUint32(),
    length: bin.readUint8(),
    decimals: bin.readUint8(),
    id: bin.skipBytes(2).readUint8(),
    position: bin.skipBytes(2).readUint8(),
    indexFlag: bin.skipBytes(7).readUint8()
  };

  if (field.type == 'C') {
    field.parseType = C.STRING;
    field.parser = Utils.trim;
  } else if (field.type == 'F' || field.type == 'N' && field.decimals > 0) {
    field.parseType = C.DOUBLE;
    field.parser = parseFloat;
  } else if (field.type == 'I' || field.type == 'N') {
    field.parseType = C.INTEGER;
    field.parser = parseInt;
  } else {
    error("Unsupported DBF field type:", field.type);
  }
  return field;
};


/* @requires arrayutils, core */

// TODO: adapt to run in browser
function stop(msg) {
  msg && trace(msg);
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
    obj.ext = name.substr(i);
    obj.basename = name.substr(0, i);
  }
  obj.filename = name;
  return obj;
};


MapShaper.extendPartCoordinates = function(xdest, ydest, xsrc, ysrc, reversed) {
  var len=xsrc.length;
  (!len || len < 2) && error("[MapShaper.extendShapePart()] invalid arc length:", len);
  if (reversed) {
    var inc = -1;
    var startId = len - 1;
    var stopId = -1;
  } else {
    inc = 1;
    startId = 0;
    stopId = len;
  }

  if (xdest.length > 0) {
    startId += inc; // skip first point of arc if part has been started
  }

  for (var i=startId; i!=stopId; i+=inc) {
    xdest.push(xsrc[i]);
    ydest.push(ysrc[i]);
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

MapShaper.transposeXYCoords = function(arr) {
  var xx = arr[0],
      yy = arr[1],
      points = [];
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
      if (arc[0].length > 1) {
        MapShaper.extendPartCoordinates(xx, yy, arc[0], arc[1], reversed);
      }
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




/* @requires core, dataview */

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


/* requires mapshaper-common */

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
  if (ab == 0 || bc == 0) {
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
  if (ab == 0 || bc == 0) {
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
  if (ac2 == 0.0) {
    dist2 = ab2;
  } else if (ab2 >= bc2 + ac2) {
    dist2 = bc2;
  } else if (bc2 >= ab2 + ac2) {
    dist2 = ab2;
  } else {
    var dval = (ab2 + ac2 - bc2);
    dist2 = ab2 -  dval * dval / ac2  * 0.25;
  }
  if (dist2 < 0.0) {
    dist2 = 0.0;
  }
  return dist2;
}


function msSignedRingArea(xx, yy, start, len) {
  var sum = 0,
      start = start | 0,
      end = start + (len == null ? xx.length - start : len | 0) - 1;

  if (start < 0 || end >= xx.length) {
    error("Out-of-bounds array index");
  }
  for (var i=start; i < end; i++) {
    sum += xx[i+1] * yy[i] - xx[i] * yy[i+1];
  }
  return sum / 2;
}

function msRingArea(xx, yy, start, len) {
  return Math.abs(msSignedRingArea(xx, yy, start, len));
}

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
  distance3D: distance3D,
  innerAngle: innerAngle,
  innerAngle3D: innerAngle3D,
  triangleArea: triangleArea,
  triangleArea3D: triangleArea3D,
  msRingArea: msRingArea,
  msSignedRingArea: msSignedRingArea,
  probablyDecimalDegreeBounds: probablyDecimalDegreeBounds
};

/* @requires shp-reader, dbf-reader, mapshaper-common, mapshaper-geom */

MapShaper.importDbf = function(src) {
  T.start();
  var data = new DbfReader(src).read("table");
  T.stop("[importDbf()]");
  return data;
};

// Reads Shapefile data from an ArrayBuffer or Buffer
// Converts to format used for identifying topology.
//

MapShaper.importShp = function(src) {
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

  var counts = reader.getCounts(),
      xx = new Float64Array(counts.pointCount),
      yy = new Float64Array(counts.pointCount),
      shapeIds = [];

  var expectRings = Utils.contains([5,15,25], reader.type()),
      findMaxParts = expectRings,
      findHoles = expectRings,
      pathData = [];

  var pointId = 0,
      partId = 0,
      shapeId = 0;

  reader.forEachShape(function(shp) {
    var maxPartId = -1,
        maxPartArea = 0,
        signedPartArea, partArea, startId;

    var partsInShape = shp.partCount,
        pointsInShape = shp.pointCount,
        partSizes = shp.readPartSizes(),
        coords = shp.readCoords(),
        pointsInPart, validPointsInPart,
        pathObj,
        x, y, prevX, prevY;

    if (partsInShape != partSizes.length) error("Shape part mismatch");

    for (var j=0, offs=0; j<partsInShape; j++) {
      pointsInPart = partSizes[j];
      startId = pointId;
      for (var i=0; i<pointsInPart; i++) {
        x = coords[offs++];
        y = coords[offs++];
        if (i == 0 || prevX != x || prevY != y) {
          xx[pointId] = x;
          yy[pointId] = y;
          pointId++;
        }
        prevX = x, prevY = y;
      }

      validPointsInPart = pointId - startId;

      pathObj = {
        size: validPointsInPart,
        isHole: false,
        isPrimary: false,
        isNull: false,
        isRing: expectRings,
        shapeId: shapeId
      }

      // TODO: check for too-small polylines
      //
      if (expectRings) {
        signedPartArea = msSignedRingArea(xx, yy, startId, pointsInPart);
        if (signedPartArea == 0 || validPointsInPart < 4 || xx[startId] != xx[pointId-1] || yy[startId] != yy[pointId-1]) {
          trace("A ring in shape", shapeId, "has zero area or is not closed; pointsInPart:", pointsInPart, 'parts:', partsInShape);
          pathObj.isNull = true;
          continue;
        }
        if (findMaxParts) {
          partArea = Math.abs(signedPartArea);
          if (partArea > maxPartArea) {
            maxPartId = partId;
            maxPartArea = partArea;
          }
        }

        if (findHoles) {
          if (signedPartArea < 0) {
            if (partsInShape == 1) error("Shape", shapeId, "only contains a hole");
            pathObj.isHole = true;
          }
        }
      }
      shapeIds.push(shapeId);
      pathData.push(pathObj);
      partId++;
    }  // forEachPart()

    if (maxPartId > -1) {
      pathObj.isPrimary = true;
    }
    shapeId++;
  });  // forEachShape()

  var skippedPoints = counts.pointCount - pointId,
      skippedParts = counts.partCount - partId;
  if (counts.shapeCount != shapeId || skippedPoints < 0 || skippedParts < 0)
    error("Counting problem");

  if (skippedPoints > 0) {
    trace("Truncating point arrays; skipped:", skippedPoints)
    xx = xx.subarray(0, pointId);
    yy = yy.subarray(0, pointId);
  }

  var info = {
    input_bounds: reader.header().bounds,
    input_point_count: pointId,
    input_part_count: partId,
    input_shape_count: shapeId,
    input_skipped_points: skippedPoints,
    input_skipped_parts: skippedParts,
    input_geometry_type: expectRings ? "polygon" : "polyline"
  };
  T.stop("Import Shapefile");
  return {
    xx: xx,
    yy: yy,
    pathData: pathData,
    info: info
  };
};

// Convert topological data to buffers containing .shp and .shx file data
//
MapShaper.exportShp = function(arcs, shapes, shpType) {
  if (!Utils.isArray(arcs) || !Utils.isArray(shapes)) error("Missing exportable data.");
  T.start();
  T.start();

  var fileBytes = 100;
  var bounds = new Bounds();
  var shapeBuffers = Utils.map(shapes, function(shape, i) {
    var shpObj = MapShaper.exportShpRecord(shape, arcs, i+1, shpType);
    fileBytes += shpObj.buffer.byteLength;
    shpObj.bounds && bounds.mergeBounds(shpObj.bounds);
    return shpObj.buffer;
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
    shxBin.writeInt32(shpOff)
    shxBin.writeInt32(shpSize);
    shpBin.writeBuffer(buf);
  });

  var shxBuf = shxBin.buffer(),
      shpBuf = shpBin.buffer();

  T.stop("convert to binary");
  T.stop("Export Shapefile");
  return {shp: shpBuf, shx: shxBuf};
};


// Returns an ArrayBuffer containing a Shapefile record for one shape
//   and the bounding box of the shape.
// TODO: remove collapsed rings, convert to null shape if necessary
//
MapShaper.exportShpRecord = function(shape, arcs, id, shpType) {
  var bounds = null,
      bin = null;
  if (shape && shape.length > 0) {
    var data = MapShaper.convertTopoShape(shape, arcs, ShpType.polygonType(shpType)),
        partsIdx = 52,
        pointsIdx = partsIdx + 4 * data.partCount,
        recordBytes = pointsIdx + 16 * data.pointCount,
        pointCount = 0;

    data.pointCount == 0 && trace("Empty shape; data:", data)
    if (data.pointCount > 0) {
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
        .writeInt32(data.partCount)
        .writeInt32(data.pointCount);

      Utils.forEach(data.parts, function(part, i) {
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
        error("Shp record point count mismatch; pointCount:"
          , pointCount, "data.pointCount:", data.pointCount);
    }

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


/* @requires mapshaper-common */

MapShaper.importJSON = function(obj) {
  if (obj.type == "Topology") {
    error("TODO: TopoJSON import.")
    return MapShaper.importTopoJSON(obj);
  }
  return MapShaper.importGeoJSON(obj);
};

MapShaper.importGeoJSON = function(obj) {
  error("TODO: implement GeoJSON importing.")
};

MapShaper.exportGeoJSON = function(obj) {
  T.start();
  if (!obj.shapes) error("#exportGeoJSON() Missing 'shapes' param.");
  if (obj.type != "MultiPolygon") error("#exportGeoJSON() Unsupported type:", obj.type)
  var output = {
    type: "FeatureCollection"
  };
  output.features = Utils.map(obj.shapes, function(shape) {
    if (!shape || !Utils.isArray(shape)) error("[exportGeoJSON()] Missing or invalid param/s");
    return MapShaper.exportGeoJSONPolygon(shape)
  });

  T.stop("Export GeoJSON");
  return JSON.stringify(output);
};

//
MapShaper.exportGeoJSONPolygon = function(ringGroups) {
  var geom = {};
  if (ringGroups.length == 0) {
    // null shape; how to represent?
    geom.type = "Polygon";
    geom.coordinates = [];
  } else if (ringGroups.length == 1) {
    geom.type = "Polygon";
    geom.coordinates = exportCoordsForGeoJSON(ringGroups[0]);
  } else {
    geom.type = "MultiPolygon";
    geom.coordinates = Utils.map(ringGroups, exportCoordsForGeoJSON);
  }

  var feature = {
    type: "Feature",
    properties: {},
    geometry: geom
  };
  return feature;
};


function exportCoordsForGeoJSON(paths) {
  return Utils.map(paths, function(path) {
    return path.toArray();
  });
}


/* @requires mapshaper-common, mapshaper-shapefile, mapshaper-geojson, nodejs */

var cli = MapShaper.cli = {};

MapShaper.validateArgv = function(argv) {
  var opts = {};
  cli.validateInputOpts(opts, argv);
  cli.validateOutputOpts(opts, argv);
  cli.validateSimplifyOpts(opts, argv);

  if (argv['shp-test']) {
    if (opts.input_format != 'shapefile') error("--shp-test option requires shapefile input");
    if (opts.use_simplification) console.log("--shp-test ignores simplification")
    opts.shp_test = true;
    opts.use_simplification = false;
  }
  else {
    if (!opts.use_simplification) error("Missing simplification parameters")
  }

  opts.timing = !!argv.t;
  return opts;
};

cli.validateInputOpts = function(opts, argv) {
  var ifile = argv._[0];
  if (!ifile) error("Missing an input file");

  var ifileInfo = Node.getFileInfo(ifile);
  if (!ifileInfo.exists) error("File not found (" + ifile + ")");
  if (ifileInfo.ext != 'shp') error("Input filename must match *.shp");

  opts.input_file = ifile;
  opts.input_format = "shapefile";
  opts.input_file_base = ifileInfo.base;
  opts.input_directory = ifileInfo.relative_dir;
  opts.input_path_base = Node.path.join(opts.input_directory, opts.input_file_base);
  return opts;
};

cli.validateOutputOpts = function(opts, argv) {
  // output format -- only shapefile for now
  if (argv.f && argv.f != "shapefile") error("Unsupported output format:", argv.f);
  opts.output_format = "shapefile";

  var obase = opts.input_file_base + "-mshp"; // default
  if (argv.o) {
    if (!Utils.isString(argv.o)) {
      error("-o option needs a file name");
    }
    var ofileInfo = Node.getFileInfo(argv.o);
    if (ofileInfo.is_directory) {
      error("-o should be a file, not a directory");
    }
    if (ofileInfo.ext && ofileInfo.ext != "shp") {
      error("Output option looks like an unsupported file type:", ofileInfo.file);
    }
    if (!Node.dirExists(ofileInfo.relative_dir)) {
      error("Output directory not found");
    }
    obase = Node.path.join(ofileInfo.relative_dir, ofileInfo.base);

    if (opts.input_format == opts.output_format && obase == Node.path.join(opts.input_directory, opts.input_file_base)) {
      // TODO: overwriting is possible users types absolute path for input or output path...
      error("Output file shouldn't overwrite source file");
    }
  }

  opts.output_path_base = obase;
  return opts;
};

cli.validateSimplifyOpts = function(opts, argv) {
  if (argv.i != null) {
    if (!Utils.isNumber(argv.i) || argv.i < 0) error("-i (--interval) option should be a non-negative number");
    opts.simplify_interval = argv.i;
  }
  else if (argv.p != null) {
    if (!Utils.isNumber(argv.p) || argv.p <= 0 || argv.p >= 1) error("-p (--pct) option should be in the range (0,1)");
    opts.simplify_pct = argv.p;
  }

  opts.use_simplification = !!(opts.simplify_pct || opts.simplify_interval);
  opts.keep_shapes = !!argv.k;

  if (argv.dp)
    opts.simplify_method = "dp";
  else if (argv.vis)
    opts.simplify_method = "vis";
  else
    opts.simplify_method = "mod";

  return opts;
};


MapShaper.gc = function() {
  T.start();
  Node.gc();
  T.stop("gc()");
};


MapShaper.importFromFile = function(fname) {
  var info = Node.getFileInfo(fname);
  if (!info.exists) error("File not found.");
  if (info.ext != 'shp') error("Expected *.shp file; found:", fname);

  // TODO: json importing
  // data = MapShaper.importJSON(JSON.parse(Node.readFile(fname, 'utf8')));
  return MapShaper.importShp(fname);
};

/*
MapShaper.importFromStream = function(sname) {
  assert("/dev/stdin", "[importFromStream()] requires /dev/stdin; received:", sname);
  var buf = Node.readFile(sname);
  if (buf.readUInt32BE(0) == 9994) {
    return MapShaper.importShpFromBuffer(buf);
  }
  var obj = JSON.parse(buf.toString());
  return MapShaper.importJSON(obj);
};
*/


/* @requires core */

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


/* @requires mapshaper-common, mapshaper-geom, median, sorting */

// TODO; calculate pct based on distinct points in the dataset
// TODO: pass number of points as a parameter instead of calculating it
MapShaper.getThresholdByPct = function(arr, retainPct) {
  if (retainPct <= 0 || retainPct >= 1) error("Invalid simplification pct:", retainPct);
  var tmp = MapShaper.getInnerThresholds(arr, 2);
  var k = Math.floor((1 - retainPct) * tmp.length);
  return Utils.findValueByRank(tmp, k + 1); // rank start at 1
};

// Receive: array of arrays of simplification thresholds arcs[vertices[]]
// Return: one array of all thresholds, sorted in ascending order
//
MapShaper.getDescendingThresholds = function(arr, skip) {
  var merged = MapShaper.getInnerThresholds(arr, skip);
  Utils.quicksort(merged, false);
  return merged;
};

MapShaper.countInnerPoints = function(arr, skip) {
  var count = 0,
      nth = skip || 1;
  for (var i=0, n = arr.length; i<n; i++) {
    count += Math.ceil((arr[i].length - 2) / nth);
  }
  return count;
};

MapShaper.getInnerThresholds = function(arr, skip) {
  var nth = skip || 1,
      count = MapShaper.countInnerPoints(arr, skip),
      tmp = new Float64Array(count),
      idx = 0;
  for (i=0, n=arr.length; i<n; i++) {
    var thresholds = arr[i];
    for (var j=1, lim=thresholds.length - 1; j < lim; j+= nth) {
      tmp[idx++] = thresholds[j];
    }
  }
  if (idx != count) error("Counting error");
  return tmp;
};

MapShaper.thinArcsByPct = function(arcs, thresholds, retainedPct) {
  if (!Utils.isArray(arcs) || !Utils.isArray(thresholds) ||
      arcs.length != thresholds.length  || !Utils.isNumber(retainedPct))
    error("Invalid arguments; expected [Array], [Array], [Number]");
  T.start();
  var thresh = MapShaper.getThresholdByPct(thresholds, retainedPct);
  T.stop("Find simplification interval");

  T.start();
  var thinned = MapShaper.thinArcsByInterval(arcs, thresholds, thresh);
  T.stop("Remove vertices");
  return thinned;
};

MapShaper.protectPoints = function(thresholds, lockCounts) {
  var n;
  for (var i=0, len=thresholds.length; i<len; i++) {
    n = lockCounts[i];
    if (n > 0) {
      MapShaper.lockMaxThreshold(thresholds[i], n);
    }
  }
};

MapShaper.lockMaxThreshold = function(zz, n) {
  var max = 0,
      lockVal = Infinity,
      maxId, z;
  for (var i=1, len = zz.length - 1; i<len; i++) {
    z = zz[i];
    if (z > max && z !== lockVal) {
      max = z
      maxId = i;
    }
  }
  if (max > 0) {
    zz[maxId] = lockVal;
    if (n > 1) {
      MapShaper.lockMaxThreshold(zz, n - 1);
    }
  }
  return zz;
}


// Strip interior points from an arc.
// @retained gives the number of interior points to leave in (retains those
//    with the highest thresholds)
//
/*
MapShaper.stripArc = function(xx, yy, uu, retained) {
  var data = [],
      len = xx.length,
      min, u, xx2, yy2;
  if (len < 2) error("Invalid arc");

  if (retained > 0) {
    for (var i=1, lim=len-1; i<lim; i++) {
      u = uu[i];
      if (data.length < retained) {
        data.push({i:i, u:u});
      } else if ((min=data[0]).u < u) {
        min.u = u;
        min.i = i;
      }
      if (retained > 1) Utils.sortOn(data, 'u', true);
    }
    Utils.sortOn(data, 'i', true);
  }
  xx2 = [xx[0]];
  yy2 = [yy[0]];
  Utils.forEach(data, function(obj) {
    xx2.push(xx[obj.i]);
    yy2.push(yy[obj.i]);
  })
  xx2.push(xx[len-1]);
  yy2.push(yy[len-1]);
  return [xx2, yy2];
};
*/

MapShaper.thinArcByInterval = function(xsrc, ysrc, uu, interval) {
  var xdest = [],
      ydest = [],
      srcLen = xsrc.length,
      destLen;

  if (ysrc.length != srcLen || uu.length != srcLen || srcLen < 2)
    error("[thinArcByThreshold()] Invalid arc data");

  for (var i=0; i<srcLen; i++) {
    if (uu[i] > interval) {
      xdest.push(xsrc[i]);
      ydest.push(ysrc[i]);
    }
  }

  // remove island rings that have collapsed (i.e. fewer than 4 points)
  // TODO: make sure that other kinds of collapsed rings are handled
  //    (maybe during topology phase, via minPoints array)
  //
  destLen = xdest.length;
  if (destLen < 4 && xdest[0] == xdest[destLen-1] && ydest[0] == ydest[destLen-1]) {
    xdest = [];
    ydest = [];
  }

  return [xdest, ydest];
};


MapShaper.thinArcsByInterval = function(srcArcs, thresholds, interval) {
  if (!Utils.isArray(srcArcs) || srcArcs.length != thresholds.length)
    error("[thinArcsByInterval()] requires matching arrays of arcs and thresholds");
  if (!Utils.isNumber(interval))
    error("[thinArcsByInterval()] requires an interval");

  var arcs = [],
      fullCount = 0,
      thinnedCount = 0;
  for (var i=0, l=srcArcs.length; i<l; i++) {
    var srcArc = srcArcs[i];
    var arc = MapShaper.thinArcByInterval(srcArc[0], srcArc[1], thresholds[i], interval);
    fullCount += srcArc[0].length;
    thinnedCount += arc[0].length;
    arcs.push(arc);
  }
  return {
    arcs: arcs,
    info: {
      original_arc_points: fullCount,
      thinned_arc_points: thinnedCount
    }
  };
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
}

// Apply a simplification function to each arc in an array, return simplified arcs.
//
// @simplify: function(xx:array, yy:array, [zz:array], [length:integer]):array
//
MapShaper.simplifyArcs = function(arcs, simplify, opts) {
  T.start();
  var arcs;
  if (opts && opts.spherical) {
    arcs = MapShaper.simplifyArcsSph(arcs, simplify);
  } else {
    arcs = Utils.map(arcs, function(arc) {
      return simplify(arc[0], arc[1]);
    });
  }
  T.stop("Calculate simplification data");
  return arcs
};


MapShaper.simplifyArcsSph = function(arcs, simplify) {
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

/* @requires events, core */

var pageEvents = (new function() {
  var ieEvents = typeof window != 'undefined' && !!window.attachEvent && !window.addEventListener,
    index = {};

  function __getNodeListeners(el) {
    var id = __getNodeKey(el);
    var listeners = index[id] || (index[id] = []);
    return listeners;
  }

  function __removeDOMListener(el, type, func) {
    if (ieEvents) {
      el.detachEvent('on' + type, func);
    }
    else {
      el.removeEventListener(type, func, false);
    }
  }

  function __findNodeListener(listeners, type, func, ctx) {
    for (var i=0, len = listeners.length; i < len; i++) {
      var evt = listeners[i];
      if (evt.type == type && evt.callback == func && evt.context == ctx) {
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
    if (el === window && 'mousemove,mousedown,mouseup,mouseover,mouseout'.indexOf(type) != -1) {
      trace("[Browser.addEventListener()] In ie8-, window doesn't support mouse events");
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

    if (ieEvents) {
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

/** @requires events, core, page-events */


var Browser = {

  getIEVersion: function() {
    return this.ieVersion;
  },

  traceEnabled: function() {
    var debug = Browser.getQueryVar('debug');
    if (Env.inBrowser && (debug == null || debug == "false")) {
      return false;
    }
    return true;
  },

  /*getPageWidth : function() {
   return document.documentElement.clientWidth || document.body.clientWidth;
  },*/

  getViewportWidth : function() {
    return document.documentElement.clientWidth;
  },

  getViewportHeight : function() {
    return document.documentElement.clientHeight;
  },

  createElement : function(type, css, classes) {
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
  getElement : function(ref) {
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

  removeElement : function(el) {
    el && el.parentNode && el.parentNode.removeChild(el);
  },

  getElementStyle: function(el) {
    return el.currentStyle || window.getComputedStyle && window.getComputedStyle(el, '') || {};
  },

  elementIsFixed : function(el) {
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

  getElementFromPageXY : function(x, y) {
    var viewX = this.pageXToViewportX(x);
    var viewY = this.pageYToViewportY(y);
    return document.elementFromPoint(viewX, viewY);
  },

  getPageXY : function(el) {
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
  __getIEPageElement : function() {
    var d = document.documentElement;
    return d.clientHeight ? d : document.body;
  },

  pageXToViewportX : function(x) {
    var xOffs = window.pageXOffset;
    if (xOffs === undefined) {
      xOffs = Browser.__getIEPageElement().scrollLeft;
    }
    return x - xOffs;
  },

  pageYToViewportY : function(y) {
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

  getPageUrl : function() {
    return Browser.inNode ? "" : window.location.href.toString();
  },

  getQueryString : function(url) {
    var match = /^[^?]+\?([^#]*)/.exec(url);
    return match && match[1] || "";
  },

  /**
   *  Add a query variable to circumvent browser caching.
   *  Value is calculated from UTC minutes, so the server does not see a large
   *  number of different values.
   */
  cacheBustUrl : function(url, minutes) {
    minutes = minutes || 1; // default: 60 seconds
    var minPerWeek = 60*24*7;
    var utcMinutes = (+new Date) / 60000;
    var code = Math.round((utcMinutes % minPerWeek) / minutes);
    url = Browser.extendUrl(url, "c=" + code);
    return url;
  },

  extendUrl : function(url, obj) {
    var extended = url + (url.indexOf("?") == -1 ? "?" : "&");
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

  parseUrl : Utils.parseUrl,
  /**
   * Return query-string (GET) data as an object.
   */
  getQueryVars : function() {
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

  getQueryVar : function(name) {
    return Browser.getQueryVars()[name];
  },


  /**
   * TODO: memoize?
   */
  getClassNameRxp : function(cname) {
    return new RegExp("(^|\\s)" + cname + "(\\s|$)");
  },

  hasClass : function(el, cname) {
    var rxp = this.getClassNameRxp(cname);
    return el && rxp.test(el.className);
  },

  addClass : function(el, cname) {
    var classes = el.className;
    if (!classes) {
      classes = cname;
    }
    else if (!this.hasClass(el, cname)) {
      classes = classes + ' ' + cname;
    }
    el.className = classes;
  },

  removeClass : function(el, cname) {
    var rxp = this.getClassNameRxp(cname);
    el.className = el.className.replace(rxp, "$2");
  },

  replaceClass : function(el, c1, c2) {
    var r1 = this.getClassNameRxp(c1);
    el.className = el.className.replace(r1, '$1' + c2 + '$2');
  },

  mergeCSS : function(s1, s2) {
    var div = this._cssdiv;
    if (!div) {
      div = this._cssdiv = Browser.createElement('div');
    }
    div.style.cssText = s1 + ";" + s2; // extra ';' for ie, which may leave off final ';'
    return div.style.cssText;
  },

  addCSS : function(el, css) {
    el.style.cssText = Browser.mergeCSS(el.style.cssText, css);
  },

  unselectable : function(el) {
    var noSel = "-webkit-user-select:none;-khtml-user-select:none;-moz-user-select:none;-moz-user-focus:ignore;-o-user-select:none;user-select: none;";
    noSel += "-webkit-tap-highlight-color: rgba(0,0,0,0);"
    //div.style.cssText = Browser.mergeCSS(div.style.cssText, noSel);
    Browser.addCSS(el, noSel);
    el.onselectstart = function(e){
      e && e.preventDefault();
      return false;
    };
  },

  undraggable : function(el) {
    el.ondragstart = function(){return false;};
    el.draggable = false;
  },

  /**
   *  Loads a css file and applies it to the current page.
   */
  loadStylesheet : function(cssUrl) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = cssUrl;
    Browser.appendToHead(link);
  },

  appendToHead : function(el) {
    var head = document.getElementsByTagName("head")[0];
    head.appendChild(el);
  },

  /**
   * TODO: Option to supply a "target" attribute for opening in another window.
   */
  //navigateToURL : function(url) {
  navigateTo : function(url) {
    window.location.href = url;
  }

};

Browser.onload = function(handler, ctx) {
  Browser.on(window, 'load', handler, ctx); // handles case when page is already loaded.
};

// Add environment information to Browser
//
Opts.copyAllParams(Browser, Env);


/* @requires core, browser, textutils */

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
      if (flags.indexOf("'") != -1) {
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

  var codeRxp = /%([\'+0]*)([1-9]?)((?:\.[1-9])?)([sdifxX%])/g;

  return function format(s) {
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
}());


/* @requires arrayutils, format, mapshaper-common */

// buildArcTopology() converts non-topological polygon data into a topological format
//
// Input format:
// {
//    xx: [Array],      // x-coords of each point in the dataset (coords of all paths are concatenated)
//    yy: [Array],      // y-coords of each point
//    pathData: [Array] // array of path data records, e.g.: {size: 20, shapeId: 3, isHole: false, isNull: false, isPrimary: true}
// }
//
// Output format:
// {
//    arcs: [Array],   // Arcs are represented as two-element arrays
//                     //   arc[0] is an array of x-coords, arc[1] is an array of y-coords
//    shapes: [Array]  // Shapes are arrays of one or more parts; Parts are arrays of one or more arc id.
// }                   //   negative arc ids indicate reverse direction, using the same indexing scheme as TopoJSON.
//
MapShaper.buildArcTopology = function(obj) {
  if (!(obj.xx && obj.yy && obj.pathData)) error("[buildArcTopology()] Missing required param/s");

  T.start();
  var topoData = new ArcEngine(obj.xx, obj.yy, obj.pathData).buildTopology();
  topoData.arcMinPointCounts = calcMinPointCounts(topoData.paths, obj.pathData, topoData.arcs, topoData.sharedArcFlags);
  topoData.shapes = groupPathsByShape(topoData.paths, obj.pathData);
  delete topoData.paths;
  T.stop("Process topology");
  return topoData;
};

// Returns a function that translates (x,y) coords into unsigned ints for hashing
// @bbox A Bounds object giving the extent of the dataset.
//
MapShaper.getPointToUintHash = function(bbox) {
  var mask = (1 << 29) - 1,
      kx = (1e8 * Math.E / bbox.width()),
      ky = (1e8 * Math.PI / bbox.height()),
      bx = -bbox.xmin,
      by = -bbox.ymin;

  return function(x, y) {
    // transform coords to integer range and scramble bits a bit
    var key = x * kx + bx;
    key ^= y * ky + by;
    // key ^= Math.PI * 1e9;
    key &= 0x7fffffff; // mask as positive integer
    return key;
  };
};


//
//
function ArcIndex(hashTableSize, xyToUint) {
  hashTableSize |= 0; // make sure we have an integer size
  var hashTable = new Int32Array(hashTableSize),
      hash = function(x, y) {
        return xyToUint(x, y) % hashTableSize;
      },
      chainIds = [],
      arcs = [],
      sharedArcs = [];

  Utils.initializeArray(hashTable, -1);

  this.addArc = function(xx, yy) {
    var end = xx.length - 1,
        key = hash(xx[end], yy[end]),
        chainId = hashTable[key],
        arcId = arcs.length;
    hashTable[key] = arcId;
    arcs.push([xx, yy]);
    sharedArcs.push(0);
    chainIds.push(chainId);
    return arcId;
  };

  // Look for a previously generated arc with the same sequence of coords, but in the
  // opposite direction. (This program uses the convention of CW for space-enclosing rings, CCW for holes,
  // so coincident boundaries should contain the same points in reverse sequence).
  //
  this.findArcNeighbor = function(xx, yy, start, end, getNext) {
    var next = getNext(start),
        arcId = hashTable[hash(xx[start], yy[start])],
        arcX, arcY, len;

    while (arcId != -1) {
      // check endpoints and one segment...
      // it would be more rigorous but slower to identify a match
      // by comparing all segments in the coordinate sequence
      arcX = arcs[arcId][0];
      arcY = arcs[arcId][1];
      len = arcX.length;
      if (arcX[0] === xx[end] && arcX[len-1] === xx[start] && arcX[len-2] === xx[next]
          && arcY[0] === yy[end] && arcY[len-1] === yy[start] && arcY[len-2] === yy[next]) {
        sharedArcs[arcId] = 1;
        return arcId;
      }
      arcId = chainIds[arcId];
    }
    return -1;
  };

  this.getArcs = function() {
    return arcs;
  };

  this.getSharedArcFlags = function() {
    return new Uint8Array(sharedArcs);
  }
}


// Transform spaghetti shapes into topological arcs
// ArcEngine has one method: #buildTopology()
//
function ArcEngine(xx, yy, pathData) {
  var pointCount = xx.length,
      xyToUint = MapShaper.getPointToUintHash(MapShaper.calcXYBounds(xx, yy)),
      index = new ArcIndex(pointCount * 0.2, xyToUint),
      slice = xx.subarray && yy.subarray || xx.slice;

  var pathIds = initPathIds(pointCount, pathData);
  var paths;

  T.start();
  var chainIds = initPointChains(xx, yy, pathIds, xyToUint);
  T.stop("Find matching vertices");

  if (!(pointCount > 0 && yy.length == pointCount && pathIds.length == pointCount && chainIds.length == pointCount)) error("Mismatched array lengths");

  function nextPoint(id) {
    var partId = pathIds[id];
    if (pathIds[id+1] !== partId) {
      return id - pathData[partId].size + 2;
    }
    return id + 1;
  }

  function prevPoint(id) {
    var partId = pathIds[id];
    if (pathIds[id - 1] !== partId) {
      return id + pathData[partId].size - 2;
    }
    return id - 1;
  }

  // Test whether point is unique
  // Endpoints of polygon rings are counted as unique
  //
  function pointIsSingleton(id) {
    var chainId = chainIds[id],
        partId, chainPartId;

    while (chainId != id) {
      partId = pathIds[id];
      if (pathIds[chainId] != partId) {
        return false;
      }
      chainPartId = pathIds[chainId];
      // if either point or chained point is not an endpoint, point is not singleton
      if (pathIds[id-1] == partId && pathIds[id+1] == partId
        || pathIds[chainId-1] == chainPartId && pathIds[chainId+1] == chainPartId) {
        return false;
      }
      chainId = chainIds[chainId];
    }
    return true;
  }


  // TODO: better handling of edge cases
  // If point at @id matches one or more points on another path, return id of any of the matching points
  // If point at @id matches points on two or more different paths, return -2
  // If point at @id matches no other paths, return -1
  //
  function findSharedPoint(id) {
    var neighborPartId,
        neighborId = -1,
        chainPartId,
        partId = pathIds[id],
        chainId = chainIds[id];

    while (chainId != id) {
      chainPartId = pathIds[chainId];
      if (chainPartId == partId) {
        // chained point is on point's own ring -- ignore
      }
      else if (neighborId == -1) {
        // first chained point on a different path -- remember it
        neighborId = chainId;
        neighborPartId = chainPartId;
      }
      else if (chainPartId != neighborPartId) {
        // chain contains more than one other path -- return -2
        return -2;
      }
      chainId = chainIds[chainId];
    }
    return neighborId;
  }

  //
  //
  function procOpenPath(pathStartId, pathId, pathObj) {
    var arcIds = [],
        pathEndId = pathStartId + pathObj.size - 1,
        arcStartId = pathStartId,
        xarr, yarr;

    for (var i=pathStartId + 1; i<=pathEndId; i++) {
      if (!pointIsSingleton(i) || i == pathEndId) {
        xarr = slice.call(xx, arcStartId, i + 1);
        yarr = slice.call(yy, arcStartId, i + 1);
        arcIds.push(index.addArc(xarr, yarr));
        arcStartId = i;
      }
    }
    return arcIds;
  }


  // Convert a closed path to one or more arcs
  //
  function procClosedPath(pathStartId, pathId, pathObj) {
    var arcIds = [],
        pathLen = pathObj.size,
        pathEndId = pathStartId + pathLen - 1,
        prevId, nextId;
    var inArc = false,
        firstNodeId = -1,
        arcStartId,
        sharedId;

    if (pathObj.isNull) return;

    // Visit each point in the path, up to but not including the endpoint
    //
    for (var i = pathStartId; i < pathEndId; i++) {
      prevId = i == pathStartId ? pathEndId - 1 : i - 1;
      nextId = i + 1;

      if (pointIsNode(i, prevId, nextId)) {
        if (inArc) {
          arcIds.push(addEdge(arcStartId, i));
        } else {
          firstNodeId = i;
        }
        arcStartId = i;
        inArc = true;
      }
    }

    // Identify the final arc in the path
    //
    if (inArc) {
      if (firstNodeId == pathStartId) {
        // path endpoint is a node;
        if (!pointIsNode(pathEndId, pathEndId - 1, pathStartId + 1)) {
          error("Topology error"); // TODO: better error handling
        }
        arcIds.push(addEdge(arcStartId, i));
      } else {
        // final arc wraps around
        arcIds.push(addEdge(arcStartId, pathEndId, pathStartId + 1, firstNodeId))
      }
    }
    else {
      // Not in an arc, i.e. no nodes have been found...
      // Path is either an island or a pair of matching paths
      sharedId = findSharedPoint(pathStartId);
      if (sharedId >= 0) {
        // island-in-hole or hole-around-island pair
        var pairedPathId = pathIds[sharedId];
        if (pairedPathId < pathId) {
          // counterpart has already been converted to an arc; use reversed arc
          var pairedPath = paths[pairedPathId];
          if (pairedPath.length != 1) {
            error("ArcEngine error:", pairedPath);
          }

          arcIds.push(-1 -pairedPath[0]);
        }
        else {
          // first of two paths: treat like an island
          arcIds.push(addEdge(pathStartId, pathEndId));
        }
      }
      else {
        // independent island
        arcIds.push(addEdge(pathStartId, pathEndId));
      }
    }
    return arcIds;
  };


  // Test if a point on a path is at the junction between
  // two or more topological edges (arcs)
  // Special case: If two coinciding paths form an island-in-hole relationship,
  //    none of their points are identified as nodes.
  // Edge case: if three or more paths share an edge, each point along the edge is
  //    identified as a node. This won't happen in a clean layer, but should probably be handled better.
  //
  function pointIsNode(id, prev, next) {
    var xarr = xx, yarr = yy; // local vars: faster
    var sharedId, sharedNext, sharedPrev;

    if (pointIsSingleton(id)) return false;

    sharedId = findSharedPoint(id);
    if (sharedId < 0) {
      return true;
    }

    sharedNext = nextPoint(sharedId);
    sharedPrev = prevPoint(sharedId);

    if (xarr[sharedNext] != xarr[prev] || xarr[sharedPrev] != xarr[next] ||
      yarr[sharedNext] != yarr[prev] || yarr[sharedPrev] != yarr[next]) {
      return true;
    }
    return false;
  }


  function mergeArcParts(src, startId, endId, startId2, endId2) {
    var len = endId - startId + endId2 - startId2 + 2,
        dest = new Float64Array(len),
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

  function addEdge(startId, endId, startId2, endId2) {
    var arcId, xarr, yarr, i;
    var splitArc = endId2 != null;
    var matchId = index.findArcNeighbor(xx, yy, startId, splitArc ? endId2 : endId, nextPoint);
    if (matchId == -1) {
      if (splitArc) {
        xarr = mergeArcParts(xx, startId, endId, startId2, endId2);
        yarr = mergeArcParts(yy, startId, endId, startId2, endId2);
      } else {
        xarr = slice.call(xx, startId, endId + 1);
        yarr = slice.call(yy, startId, endId + 1);
      }

      arcId = index.addArc(xarr, yarr);
    } else {
      arcId = -1 - matchId;
    }
    return arcId;
  }

  this.buildTopology = function() {
    var pointId = 0,
        procPath;
    paths = [];

    T.start();
    Utils.forEach(pathData, function(pathObj, pathId) {
      procPath = pathObj.isRing ? procClosedPath : procOpenPath;
      paths[pathId] = procPath(pointId, pathId, pathObj);
      pointId += pathObj.size;
    });
    T.stop("Find topological boundaries")

    return {
      paths: paths,
      arcs: index.getArcs(),
      sharedArcFlags: index.getSharedArcFlags()
    };
  };
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
function initPointChains(xx, yy, pathIds, hash) {
  var pointCount = xx.length,
      hashTableSize = Math.floor(pointCount * 1.5);
  // A hash table larger than ~1.5 * point count doesn't seem to improve performance much.

  // Each hash bin contains the id of the first point in a chain of points.
  var hashChainIds = new Int32Array(hashTableSize);
  Utils.initializeArray(hashChainIds, -1);

  var chainIds = new Int32Array(pointCount);
  var key, headId, tailId, x, y, partId;

  for (var i=0; i<pointCount; i++) {
    if (pathIds[i] == -1) {
      chainIds[i] = -1;
      continue;
    }
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
        // case -- adding to a chain: place new coordinate at end of chain, point it to head of chain to create cycle
        tailId = headId;
        while (chainIds[tailId] != headId) {
          tailId = chainIds[tailId];
        }
        chainIds[i] = headId;
        chainIds[tailId] = i;
        break;
      }
      // case -- this bin is used by another coord, try the next bin
      key = (key + 1) % hashTableSize;
    }
  }
  return chainIds;
};


// Calculate number of interior points to preserve in each arc
// to protect selected rings from collapsing.
//
function calcMinPointCounts(paths, pathData, arcs, sharedArcFlags) {
  var arcMinPointCounts = new Uint8Array(arcs.length);
  Utils.forEach(paths, function(path, pathId) {
    // if a part has 3 or more arcs, assume it won't collapse...
    // TODO: look into edge cases where this isn't true
    if (path.length <= 2 && pathData[pathId].isPrimary) {
      protectPath(path, arcs, sharedArcFlags, arcMinPointCounts)
    }
  });
  return arcMinPointCounts;
}

function protectPath(path, arcs, sharedArcFlags, minArcPoints) {
  var arcId;
  for (var i=0, arcCount=path.length; i<arcCount; i++) {
    arcId = path[i];
    if (arcId < 1) arcId = -1 - arcId;
    if (arcCount == 1) { // one-arc polygon (e.g. island) -- save two interior points
      minArcPoints[arcId] = 2;
    }
    else if (sharedArcFlags[arcId] != 1) {
      minArcPoints[arcId] = 1; // non-shared member of two-arc polygon: save one point
      // TODO: improve the logic here
    }
  }
}

// Use shapeId property of @pathData objects to group paths by shape
//
function groupPathsByShape(paths, pathData) {
  var shapes = [];
  Utils.forEach(paths, function(path, pathId) {
    var shapeId = pathData[pathId].shapeId;
    if (shapeId >= shapes.length) {
      shapes[shapeId] = [path]; // first part in a new shape
    } else {
      shapes[shapeId].push(path);
    }
  });
  return shapes;
}

// export functions for testing
MapShaper.topology = {
  ArcEngine: ArcEngine,
  ArcIndex: ArcIndex,
  groupPathsByShape: groupPathsByShape,
  protectPath: protectPath,
  initPathIds: initPathIds
};

/* @requires core */

// A heap data structure used for computing Visvalingam simplification data.
//
function Heap() {
  var maxItems,
      dataOffs, dataArr,
      itemsInHeap,
      poppedVal,
      heapArr, indexArr;

  this.addValues = function(values, start, end) {
    var minId = start | 0,
        maxItems = (end == null ? values.length : end + 1) - minId;
    dataOffs = minId,
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
    if (heapIdx == null || heapIdx >= itemsInHeap) error("[updateValue()] out-of-range heap index.");
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
  };


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


/* @requires mapshaper-common, mapshaper-geom, mapshaper-heap */

var Visvalingam = {};

MapShaper.Heap = Heap; // export Heap for testing

Visvalingam.getArcCalculator = function(metric2D, metric3D, scale) {
  var bufLen = 0,
      heap = new Heap(),
      prevArr, nextArr,
      scale = scale || 1;

  // Calculate Visvalingam simplification data for an arc
  // Receives arrays of x- and y- coordinates, optional array of z- coords
  // Returns an array of simplification thresholds, one per arc vertex.
  //
  var calcArcData = function(xx, yy, zz, len) {
    var arcLen = len || xx.length,
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
    var values = new Float64Array(arcLen);

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

      values[i] = threshold;
      nextArr[i] = i + 1;
      prevArr[i] = i - 1;
    }
    prevArr[arcLen-1] = arcLen - 2;
    nextArr[0] = 1;

    // Initialize the heap with thresholds; don't add first and last point
    heap.addValues(values, 1, arcLen-2);

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
      values[j] = Math.sqrt(values[j]) * scale;
    }
    values[0] = values[arcLen-1] = Infinity; // arc endpoints
    return values;
  };

  return calcArcData;
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



/* @requires arrayutils, mapshaper-common, mapshaper-geom */

var DouglasPeucker = {};

DouglasPeucker.simplifyArcs = function(arcs, opts) {
  return MapShaper.simplifyArcs(arcs, DouglasPeucker.calcArcData, opts);
}

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

DouglasPeucker.calcArcData = function(xx, yy, zz, len) {
  var len = len || xx.length, // kludge: 3D data gets passed in buffers, so need len parameter.
      useZ = !!zz;

  var dpArr = new Array(len); // new Float64Array(len);
  Utils.initializeArray(dpArr, 0);

  dpArr[0] = dpArr[len-1] = Infinity;

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
      az = zz[startIdx]
      cz = zz[endIdx];
    }

    (startIdx < endIdx) || error("[procSegment()] inverted idx");

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

    dpArr[maxIdx] = dist;
    return maxDistance;
  }

  return dpArr;
};


/*
@requires
core,
bounds,
nodejs,
dbf-reader,
mapshaper-cli,
mapshaper-shapefile,
mapshaper-simplify,
mapshaper-topology,
mapshaper-visvalingam,
mapshaper-dp
*/

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
  DbfReader: DbfReader,
  Bounds: Bounds
});

if (Node.inNode) {
  module.exports = api;
} else {
  Opts.extendNamespace("mapshaper", api);
}

T.verbose = false; // timing messages off by default (e.g. for testing)

})();
