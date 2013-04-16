(function(){

var C = this.C || {}; // global constants
var A = this.A || {};

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

  repeat: function(func, times) {
    times = times > 0 && times || 1;
    while(times--) {
      func();
    }
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
  isArrayLike: function(obj) {
    // approximate test
    return Utils.isArray(obj) || obj.length > 0 && obj[obj.length-1] !== void 0 && !Utils.isString(obj);
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
    if (typeof console != "undefined" && console.log) {
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

  getNamespace : function(name) {
    var node = window; 
    //var node = typeof Node != "undefined" && Node.inNode ? global : window;
    var parts = name.split('.');

    for (var i=0, len=parts.length; i<len; i++) {
      var part = parts[i];
      if (!part) {
        continue;
      }
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

  exportObject : function(fullname, obj) {
    var parts = fullname.split('.');
    var oname = parts.pop();
    if (oname) {
      var ns = Opts.getNamespace(parts.join('.'));
      ns[oname] = obj;
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
 *
 * @constructor
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
  if (this._handlers) {
    for (var i = 0, len = this._handlers.length; i < len; i++) {
      var handler = this._handlers[i];
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



/** @requires core */

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

/*
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
}*/

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

/*
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
};*/

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

Utils.forEach = function(obj, callback, ctx) {
  Utils.map(obj, callback, ctx);
};

Utils.multiMap = function(callback) {
  var usage = "Usage: Utils.multiMap(callback, arr1, [arr2, ...])";
  if (!Utils.isFunction(callback)) error(usage)
  var sources = Array.prototype.slice.call(arguments, 1),
      isArray = Utils.map(sources, Utils.isArray),
      sourceLen = 0;
  Utils.forEach(sources, function(src, i) {
    if (isArray[i]) {
      if (sourceLen == 0) {
        sourceLen = src.length;
      } else if (src.length != sourceLen) {
        error("#multiMap() mismatched source arrays");
      }
    }
  });

  var arr = [],
      args = [],
      argLen = sources.length,
      retn;
  for (var i=0; i<sourceLen; i++) {
    for (var j=0; j<argLen; j++) {
      args[j] = isArray[j] ? sources[j][i] : sources[j];
    }
    retn = callback.apply(null, args);
    if (retn !== void 0) arr[i] = retn;
  }
  return arr;
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



/*
Utils.createIndexArray = function(size, func) {
  var arr = new Array(size);
  for (var i=0; i<size; i++) {
    arr[i] = func ? func(i) : i;
  }
  return arr;
};
*/

/**
 * This is much faster than Array.prototype.sort(<callback>) when "getter" returns a
 * precalculated sort string. Unpredictable if number is returned.
 * 
 * @param {Array} arr Array of objects to sort.
 * @param {function} getter Function that returns a sort key (string) for each object.
 */
 /*
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
*/

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

/* */
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

/* @requires events, core, arrayutils */

var inNode = typeof module !== 'undefined' && !!module.exports;
var Node = {
  // TODO: remove redundancy w/ browser.js
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

  Node.toArrayBuffer = function(src) {
    var dest = new ArrayBuffer(src.length);
    for (var i = 0, n=src.length; i < n; i++) {
      dest[i] = src[i];
    }
    return dest;
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

  Node.loadUrl = function(url) {
    return new NodeUrlLoader(url);
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
      if (!e || !(e.pageX || e.touches)) { // kludge to handle touch and mouse events
       // trace("[Browser.addEventListener()] using proxy object", e.pageX);
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
      trace("[Browser.removeEventListener()] Event not found; ignoring.");
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
   // return document.documentElement.clientWidth || document.body.clientWidth;
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

  elementIsFixed : function(el) {
    // get top-level offsetParent that isn't body (cf. Firefox)
    var body = document.body;
    while (el && el != body) {
      var parent = el;
      el = el.offsetParent;
    }

    // Look for position:fixed in the computed style of the top offsetParent.
    var styleObj = parent && (parent.currentStyle || window.getComputedStyle && window.getComputedStyle(parent, '')) || {};
    var fixed = styleObj['position'] == 'fixed';
    return fixed;
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
    var match = /^[^?]+\?(.*)/.exec(url);
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
    }
    else if (Utils.isObject(obj)) {
      var parts = [];
      Utils.forEach(obj, function(val, key) {
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(val));
      });
      extended += parts.join('&');
    }
    else {
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
    if (!el) {
      trace("[Browser.addClass()] null object; class:", cname);
      return;
    }

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

  makeUnselectable : function(el) {
    var noSel = "-webkit-user-select:none;-khtml-user-select:none;-moz-user-select:none;-moz-user-focus:ignore;-o-user-select:none;user-select: none;";
    noSel += "-webkit-tap-highlight-color: rgba(0,0,0,0);"
    //div.style.cssText = Browser.mergeCSS(div.style.cssText, noSel);
    Browser.addCSS(el, noSel);
    el.onselectstart = function(){return false;};
  },

  makeUndraggable : function(el) {
    el.ondragstart = function(){return false;};
    el.draggable = false;
  },

  /**
   *  Loads a css file and applies it to the current page.
   */
  loadStylesheet : function(cssUrl) {
    trace("loadStylesheet:", cssUrl);
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
  navigateToURL : function(url) {
    window.location.href = url;
  }

};

Browser.onload = function(handler, ctx) {
  Browser.on(window, 'load', handler, ctx); // handles case when page is already loaded.
};

// Add environment information to Browser
//
Opts.copyAllParams(Browser, Env);


/* @requires core, nodejs, browser, arrayutils */

var fs = require('fs');

function Catty() {
  // default options; updated in bundleFile();
  var CattyOpts = {
    closure: true,
    follow: false
  };

  var filePathIndex = {},   // paths of known js files indexed by name
      monitoredFiles = {},  // SourceFile objects indexed by name
      outFile,              // set in bundleFile()
      inFiles,              //  array, set in bundleFile()
      started = false;

  var keyCommands = {};

  //
  this.addLibrary = function(path) {
    addLibrary(Node.resolvePathFromScript(path));
  };

  this.options = function(opts) {
    return getCmdOpts(opts);
  };

  this.bundleFile = function(src, dest, opts) {
    Opts.copyAllParams(CattyOpts, opts);
    // get absolute paths to the src and dest files
    var ofile = Node.resolvePathFromScript(dest),
        sources = Utils.isString(src) && [src] || src,
        ifiles = Utils.map(sources, function(path) {
          return Node.resolvePathFromScript(path);
        });
    bundleFile(ifiles, ofile);
  };

  this.bundleFiles = this.bundleFile; // alias, for multiple files

  this.addKeyCommand = function(flag, description, cmd) {
    if (!Utils.isString(flag) || flag.length != 1) {
      error ("Add a key command: catty.addShellCommand(key, description, command)");
    }

    var callback;
    if (Utils.isFunction(cmd)) {
      callback = cmd;
    } else if (Utils.isString(cmd)) {
      callback = function() {
        console.log(description);
        Node.shellExec(cmd); // TODO: handle errors; try...catch doesn't seem to work
      };
    } else {
      error("catty#addKeyCommand() requires a function or a shell command");
    }

    addKeyCommand(flag, description, callback);
  };

  function addKeyCommand(flag, description, callback) {
    keyCommands[flag] = {callback: callback, description: description};
  }

  function listKeyCommands() {
    var msg = "Key commands:";
    Utils.forEach(keyCommands, function(cmd, k) {
      var cmd = keyCommands[k];
      msg += "\n  " + k + ": " + cmd.description;
    });
    console.log(msg);
  }

  function runKeyCommand(c) {
    var obj = keyCommands[c];
    if (obj) {
      obj.callback();
    }
  }

  function initKeyCommands() {
    process.stdin.resume(); 
    process.stdin.setEncoding('utf8'); 
    process.stdin.setRawMode(true); 
    process.stdin.on('data', function(char) { 
      if (char == '\3') { 
        process.exit();
      } else if (char in keyCommands) { 
        runKeyCommand(char);
      } else {
        process.stdout.write(char);
      } 
    });

    addKeyCommand('q', 'quit', function() { process.exit(); });
    addKeyCommand('b', 'trigger bundle', function() { bundle('Re-catting'); });
    addKeyCommand('h', 'list commands', function() { listKeyCommands(); });
  }


  function getCmdOpts(opts) {
    return Node.options(Opts.copyAllParams({flags:"f", aliases:"f:follow"}, opts));
  }

  this.bundle = function() {
    var opts = getCmdOpts();
    if (opts._.length != 2) {
      trace("Usage: $ catty [-f] [-d directories] input output")
      process.exit();
    }

    var lib = opts.d || opts.l
    if (lib) {
      var libs = lib.split(",");
      Utils.forEach(libs, function(dir) {
        var info = Node.getFileInfo(dir);
        addLibrary(info.path);
      });
    }

    var ifile = Node.getFileInfo(opts._[0]).path,
        ofile = Node.getFileInfo(opts._[1]).path;

    bundleFile([ifile], ofile);
  };


  function bundleFile(sources, dest) {
    if (!Utils.isArray(sources) || !Utils.isString(dest)) error("[bundleFile(sources:array, output:string)");
    var cmdOpts = getCmdOpts();
    if (cmdOpts.f) {
      CattyOpts.follow = true;
    }

    if (inFiles) {
      trace("Catty currently generates one bundle at a time; skipping:", src);
      return;
    }
    inFiles = sources;
    outFile = dest;

    Utils.forEach(inFiles, function(ifile) {
      if (ifile == outFile) error("[bundleFile()] Tried to overwrite a source file:", ifile);
      if (!Node.fileExists(ifile)) error("[bundleFile()] Source file not found:", ifile);
      var name = indexFile(ifile);
      includeFile(name);
    });

    var destInfo = Node.getFileInfo(outFile);
    if(!Node.dirExists(destInfo.directory)) error("[bundleFile()] Destination directory not found:", destInfo.directory);

    bundle("Wrote file: " + outFile);
    started = true;

    if (CattyOpts.follow) {
      initKeyCommands();
    }
  }


  function bundle(msg) {
    var js = catFiles();
    if (CattyOpts.closure) {
      js = "(function(){\n" + js + "\n})();\n"
    }
    Node.writeFile(outFile, js);
    console.log(msg || "Catting");
  }

  /*
  function findNodesByDep(name) {
    var nodes = Utils.filter(Utils.getValues(monitoredFiles), function(node) {
      trace(node.getDeps());
      return Utils.some(node.getDeps(), function(dep) {dep == name});
    });
    return nodes;
  }
  */

  function sortNodes(nodes) {
    var startId = 0,
        len = nodes.length,
        sorted = {},
        nodeName;

    while(startId < len-1) {
      var startNode = nodes[startId],
          reqId = -1;
      if (startNode.name() in sorted == false) {
        for (var i=startId+1; i<len; i++) {
          nodeName = nodes[i].name();
          if (nodeName in sorted == false && startNode.requiresFile(nodeName)) {
            reqId = i;
          }
        }
      }
      if (reqId > 0) {
        nodes.splice(startId, 1);
        nodes.splice(reqId, 0, startNode);
      } else {
        startId++;
      }
      sorted[startNode.name()] = true;
    }
  }


  function catFiles() {
    var nodes = Utils.getValues(monitoredFiles);
    sortNodes(nodes);
    Utils.forEach(nodes, function(node) {
      // trace(">>>", node.name());
    })
    var js = Utils.map(nodes, function(node) { return node.content(); }).join('\n\n');
    return js;
  }


  // Add file to index of known files;
  // Assumes @path exists.
  //
  function indexFile(path) {
    var name = Node.parseFilename(path).base;
    if (!name) {
      error("Invalid path:", path);
    } else if (name in filePathIndex == false) {
      filePathIndex[name] = path;
    } else if (filePathIndex[name] !== path) {
      trace("File name collision.");
      trace("Using:", filePathIndex[name]);
      trace("Ignoring:", path);
    } else {
      // path is already in index
    }
    return name;
  }

  function includeFile(key) {
    var path = filePathIndex[key];
    if (!path) {
      // TODO: identify files with this dependency...
      die("Unknown dependency --", key);
    }

    if (key in monitoredFiles) {
      return false;
    }
    var node = monitoredFiles[key] = new SourceFile();
    node.setPath(path);

    var deps = node.getDeps();
    Utils.forEach(deps, includeFile);
    if (CattyOpts.follow) {
      node.startMonitoring(function(node) {
        bundle("Re-catting -- change in " + node.filename());
      });
    }
    return true;
  }

  function die() {
    trace.apply(null, arguments);
    process.exit(1);
  }

  //
  //
  this.addFile = function(path) {
    addFile(Node.resolvePathFromScript(path));
  };

  function addFile(absPath) {
    if (started) die("Called [catty.addFile()] before bundling.");
    if (!Node.fileExists(absPath)) error("[addFile()] File not found:", absPath);
    indexFile(absPath);
  }


  function addLibrary(absPath) {
    if (started) die("Call [catty.addLibrary()] before bundling.");
    if (!Node.dirExists(absPath)) error("Not a valid directory:", absPath);
    var results = walkSync(absPath);
    var jsFiles = getSourceFilesInDir(absPath);
    Utils.forEach(jsFiles, indexFile);
  };


  function SourceFile() {
    var _monitoring = false,
        _self = this,
        _id = SourceFile.count ? ++SourceFile.count : (SourceFile.count = 1),
        _deps = [],
        _js = "";
    var _name, _path, _filename;

    this.setPath = function(path) {
      var info = Node.getFileInfo(path);
      if (!info.exists || info.ext != 'js', "Invalid source file:", path);
      _name = info.base,
      _path = path,
      _filename = info.file,
      update(); // initialize
    };

    this.name = function() { return _name; };
    this.filename = function() { return _filename; };
    this.path = function() { return _path; };
    this.content = function() { return _js; };
    this.id = function() { return _id; };
    this.getDeps = function() { return _deps; };

    this.requiresFile = function(targName, visited) {
      visited = visited || {};
      visited[this.name()] = true;
      var reqs = this.getDeps();

      if (Utils.contains(reqs, targName)) {
        return true;
      }

      for (var i=0; i<reqs.length; i++) {
        var reqName = reqs[i];
        if (reqName in visited == false) {
          var reqNode = monitoredFiles[reqName];
          if (reqNode.requiresFile(targName, visited)) {
            return true;
          }
        }
      }
      return false;
    };

    function update() {
      var js = Node.readFile(_path, "utf8"); // Needs charset to return string.
      if (js.length == 0) {
        // When editor opens file to write, file is empty.
        return false;
      } else if (js === _js) {
        // don't trigger update if contents not changed (e.g. when users saves w/o changes)
        return false;
      }
      _js = js;
      _deps = parseSource(js);
      
      var newDeps = Utils.filter(_deps, function(dep) {
        return dep != _name && includeFile(dep);
      });
      return true;
    }

    function expandDepName(name) {
      var src = name.replace("*", ".*");
      var rxp = new RegExp(src), 
          names = Utils.getKeys(filePathIndex);
      var deps = Utils.filter(names, function(name) {
        return rxp.test(name);
      })
      return deps;
    }


    function parseSource(js) {
      var requiresRxp = /(?:\/\*+|\/\/)\s*@requires?\b([\s,;_0-9A-Za-z.*-]+)/g,
          fileRxp = /\*?[_0-9a-z](?:[.-]?[_0-9a-z*])*/ig,  // careful, don't match "*/"
          deps = [], match, match2, allNames;
      while(match = requiresRxp.exec(js)) {
        var requireStr = match[1];
        while(match2 = fileRxp.exec(requireStr)) {
          var dep = match2[0];
          if (dep.indexOf("*") != -1) {
            deps.push.apply(deps, expandDepName(dep));
          } else {
            deps.push(dep);
          }
        }
      }
      return deps;
    }


    this.startMonitoring = function(callback) {
      if (_monitoring) {
        trace("[startMonitoring()] File already being monitored.");
        return;
      }

      _monitoring = true;
      var timeout = null;

      fs.watch(_path, function(evt) {
        if (evt == "change" || evt == "rename") {
          // make sure file has actually changed
          // Avoid i/o problems (os x), e.g. by using a timeout
          // var thisUpdate = ++updateCount;
          timeout && clearTimeout(timeout);
          timeout = setTimeout(function() {
            if (update()) callback(_self);
          }, 150);
        } else {
          trace("Unknown watch event:", evt);
        }
      });
    };
  }
}


// Assumes @dirPath is the path to a directory
//
function getSourceFilesInDir(dirPath) {
  var results = walkSync(dirPath);
  return Utils.filter(results, function(filePath) {
    return /\.js$/.test(filePath);
  });
}

function walkSync(dir, results) {
  results = results || [];
  var list = fs.readdirSync(dir);
  Utils.forEach(list, function(file) {
    var path = dir + "/" + file;
    var stat = Node.statSync(path);
    if (stat && stat.isDirectory()) {
      walkSync(path, results);
    }
    else {
      results.push(path);
    }
  });
  return results;
}

module.exports = new Catty();

})();
