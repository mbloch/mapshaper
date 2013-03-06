(function(){

var A = this.A || {}; // global application parameters
var C = this.C || {}; // global constants



var Env = (function() {
  var inNode = typeof module !== 'undefined' && !!module.exports;
  var inPhantom = !inNode && !!(window.phantom && window.phantom.exit);
  var inBrowser = !inNode; // phantom?
  var ieVersion = inBrowser && /MSIE ([0-9]+)/.exec(navigator.appVersion) && parseInt(RegExp.$1) || NaN;

  return {
    iPhone : inBrowser && !!(navigator.userAgent.match(/iPhone/i)),
    iPad : inBrowser && !!(navigator.userAgent.match(/iPad/i)),
    ieEvents : inBrowser && !!window.attachEvent && !window.addEventListener,
    touchEnabled : inBrowser && ("ontouchstart" in window),
    // canvas: inBrowser && !!Browser.createElement('canvas').getContext,
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
    
  reduce: function(arr, val, func, ctx) {
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

  map: function(src, func, ctx) {
    var dest, val;
    if (Utils.isArray(src) || Utils.isNumber(src.length)) { // try to support arguments object
      dest = [];
      for (var i = 0, len = src.length; i < len; i++) {
        val = func.call(ctx, src[i], i);
        dest.push(val);
      }
    } else {
      dest = {};
      for (var key in src) {
        if (src.hasOwnProperty(key)) {
          dest[key] = func.call(ctx, src[key], key); 
        }
      }
    }
    return dest;
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
    return toString.call(obj) == '[object Number]';
  },

  isString: function(obj) {
    return obj != null && obj.constructor === String; // TODO: replace w/ something better.
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
    else if (type == 'object' && obj.hasOwnProperty && !obj.hasOwnProperty('toString') && !obj.constructor.prototype.hasOwnProperty("toString")) {
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



var Opts = {
  copyNewParams : function(targ, src) { return Opts.__copyParams(targ, src, false); },
  copyAllParams : function(targ, src) { return Opts.__copyParams(targ, src, true); },
  updateParams : function(targ, src) { return Opts.__copyParams(targ, src, true, true); },
  __copyParams : function(targ, src, replace, updateOnly) {
    if (!src || !targ) {
      return src || targ;
    }
    for (var key in src) {
      if (!src.hasOwnProperty(key)) {
        continue;
      }
      if (replace || targ[key] === undefined) {
        var val = src[key];
        // Ignore functions added to Object.prototype by old prototype.js or others
        if (Object.prototype[key] === val) {
          continue;
        }

        if (!updateOnly || targ[key] !== undefined) {
          targ[key] = val;
        }
      }
    }
    return targ;
  },


  /**
   * Extends a function's prototype by mixing in objects/functions from a second function.
   */
  extendPrototype : function(targ, src) {
    // Copy src functions/params to targ prototype
    // If there's a collision, retain targ param
    Opts.copyNewParams(targ.prototype, src.prototype || src);
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
    targ.prototype = Opts.copyAllParams(new f(), targ.prototype); // 
    targ.prototype.constructor = targ;
    targ.prototype.__super__ = f;
  },

  /*
  subclass : function(src) {
    var f = function() {};
    Opts.inherit(f, src);
    return f;
  },*/

  namespaceExists : function(name) {
    var node = window;
    var parts = name.split('.');
    var exists = Utils.reduce(parts, true, function(part, val) {
      if (val !== false) {
        if (node[part] == null) { // match null or undefined
          val = false;
        }
        else {
          node = node[part];
        }
      }
      return val;
    });
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

var assert = function(ok) {
  if (!ok) {
    error.apply(null, Array.prototype.slice.call(arguments, 1));
  }
}


/**
 * Support for timing using T.start() and T.stop("message")
 */
var T = {
  stack: [],
  verbose: true,

  /**
   * Start timing.
   */
  start: function(msg) {
    if (T.verbose && msg) trace(T.prefix() + msg);
    T.stack.push(+new Date);
  },

  /**
   * Stop timing.
   * @param {string=} note Optional comment appended to timing message.
   * @return {number} Time elapsed in milliseconds
   */
  stop: function(note) {
    var startTime = T.stack.pop();
    var elapsed = (+new Date - startTime);
    if (T.verbose) {
      var msg =  T.prefix() + elapsed + 'ms';
      if (note) {
        // msg = note + ' ' + msg;
        msg += " " + note;
      }
      trace(msg);      
    }

    return elapsed;
  },

  prefix: function() {
    var str = "- ",
        level = this.stack.length;
    while (level--) {
      str = "-" + str;
    }
    return str;
  }
};




/** @requires core */

/**
 * An event object, used by EventDispatcher, passed to event handlers.
 * @param {string} type Event name.
 * @param {*} target Object dispatching the event.
 * @param {function(BoundEvent)} callback Event handler function.
 * @param {*} context Execution context of the callback.
 * @param {number} priority Priority of the event.
 * @constructor
 */
function BoundEvent(type, target, callback, context, priority) {
  this.type = type;
  this.target = target;
  this.callback = callback;
  this.context = context;
  this.priority = priority | 0;

  if (typeof(callback) != 'function') {
    trace("[BoundEvent] Error: callback is not a function; event:", this, "target:", target, "Callback:", callback);
  }
}

/**
 * Call a single, bound event handler.
 * @param {object=} obj Optional data to send with the event.
 */
BoundEvent.prototype.trigger = function(obj) {
  // Merge any data into the event object for handler to use (if present).
  if (obj) {
    // TODO: Protect basic BoundEvent properties like target, etc.
    Opts.copyAllParams(this, obj);  // mix in the data; update params; WARNING: breaks when mixing in another event
    this.data = obj;  // Also add data as a property; for tracing, also makes it easy to proxy events.
  }
  this.callback.call(this.context, this);
};


/**
 * Returns debugging string.
 * @return {string} String.
 */
/* */
BoundEvent.prototype.toString = function() {
  var str = 'type:' + this.type + ', target: ' + Utils.strval(this.target);
  if (this.data) {
    str += ', data:' + Utils.strval(this.data);
  }
  str = '[BoundEvent]: {' + str + '}';
  return str;
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
EventDispatcher.prototype.dispatchEvent = EventDispatcher.prototype.trigger = function(type, obj, ctx) {

  if (typeof type != 'string') {
    trace('[dispatchEvent()] requires a string argument; type:', type, "data:", obj, "target:", ctx);
    return;
  }

  // (this._firedTypes || (this._firedTypes = {}))[type] = true;

  var listeners = this._listeners;
  if (listeners) {
    for (var i = 0, len = listeners.length; i < len; i++) {
      var evt = listeners[i];
      if (evt.type == type && (!ctx || evt.context == ctx)) {
        evt.trigger(obj);
        /*
        try {
          evt.trigger(obj);
        }
        catch (err) {
          trace("[EventDispatcher.dispatchEvent()]: ## Error in", evt.context, "--", err, "-- Event:", type, " Handler:\n", evt.callback.toString(), "hander context:",  "data:", obj);
        }
        */
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
EventDispatcher.prototype.on = EventDispatcher.prototype.addEventListener =
  function(type, callback, context, priority) {
  if (!context) {
    //trace('[EventDispatcher.addEventListener()] Warning, called without context; type:',
    //  type + ' this: ' + Utils.strval(this));
    context = this;
  }

  priority = priority || 0;
  var evt = new BoundEvent(type, this, callback, context, priority);

  // Special case: 'ready' handler fires immediately if target is already ready.
  // (Applicable to Waiter class objects)
  //
  if (type == 'ready' && this._ready) {
    // trace("Warning: Waiter.waitFor() no longer uses this; this:", this, "handler ctx:", context);
    evt.trigger();
    return this;
  }

  // Insert the new event in the array of listeners according to its priority.
  //
  var listeners = this._listeners || (this._listeners = []);
  var idx = 0;
  for (var i = 0, len = listeners.length; i < len; i++) {
    var priorEvent = listeners[i];
    if (priorEvent.type == evt.type && priorEvent.callback == evt.callback &&
      priorEvent.context == evt.context) {
      trace("*** [EventDispatcher.addEventListener()] Found duplicate event, skipping. Type:", type, "ctx:", context, "this:", this );
      return this;
    }
    if (evt.priority <= priorEvent.priority) {
      idx = i + 1;
    }
  }
  listeners.splice(idx, 0, evt);
  return this;
};


EventDispatcher.prototype.countEventListeners = function(type) {
  var listeners = this._listeners,
    len = listeners && listeners.length || 0,
    count = 0;
  if (!type) return len;
  for (var i = 0; i < len; i++) {
    if (listeners[i].type === type) count++;
  }
  return count;
};

/**
 * Remove an event listener.
 * @param {string} type Event type to match.
 * @param {function(BoundEvent)} callback Event handler function to match.
 * @param {*=} context Execution context of the event handler to match.
 * @return {number} Returns number of listeners removed (expect 0 or 1).
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
 * @return {number} Number of listeners removed.
 */
EventDispatcher.prototype.removeEventListeners =
  function(type, callback, context) {
  var listeners = this._listeners;
  var newArr = [];
  var count = 0;
  for (var i = 0; listeners && i < listeners.length; i++) {
    var evt = listeners[i];
    if ((!type || type == evt.type) &&
      (!callback || callback == evt.callback) &&
      (!context || context == evt.context)) {
      count += 1;
    }
    else {
      newArr.push(evt);
    }
  }
  this._listeners = newArr;
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
  else if (Utils.isArray(container)) {
    return Utils.indexOf(container, item) != -1;
  }
  error("Expected Array or String argument");
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
}

Utils.range = function(len, start, inc) {
  start = start || 0;
  inc = inc || 1;
  var arr = [];
  for (var i=0; i<len; i++) {
    arr.push(start + i * inc);
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
    nan = 0;
  for (var i=0, len=arr.length; i<len; i++) {
    var val = arr[i];
    if (val !== val) {
      nan++;
    }
    else if (val < min) {
      min = val;
    } else if (val > max) {
      max = val;
    } 
  }

  var retn = {}; // [min, max];
  retn.min = min;
  retn.max = max;
  retn.nan = nan;
  return retn;
};

Utils.average = function(arr) {
  assert(arr.length > 0, "Tried to find average of empty array");
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
};



Utils.arrayToIndex = function(arr, arg2) {
  var obj = {},
    haveVals = false,
    haveKey = false;

  if (arg2) {
    if (Utils.isArray(arg2)) {
      haveVals = true;
    }
    else if (Utils.isString(arg2)) {
      haveKey = true;
    }
  }
  
  for (var i=0, len=arr.length; i<len; i++) {
    var arrval = arr[i];
    if (haveVals) {
      obj[arrval] = arg2[i];
    }
    else if (haveKey) {
      var key = arrval[arg2];
      if (key in obj) {
        trace("[Utils.arrayToIndex()] Warning: duplicate key:", key);
      }
      obj[key] = arr[i];
    }
    else {
      obj[arrval] = true;
    }
  }
  return obj;
};


Utils.forEach = function(obj, func, ctx) {
  if (!obj) {
    // ignore null objects
  }
  else if (Utils.isArray(obj) || obj.length) {  // treat objects with "length" property as arrays, e.g. dom element list, Uint32Array
    for (var i = 0, len = obj.length; i < len; i++) {
      func.call(ctx, obj[i], i);
    }
  }
  else {
    for (var key in obj) {
      obj.hasOwnProperty(key) && func.call(ctx, obj[key], key);
    }
  }
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



Utils.createRandomArray = function(size, values) {
  var len = values.length;
  var func = function(i) { return values[Math.floor(Math.random() * len)] };
  return Utils.createArray(size, func);
};


Utils.initializeArray = function(arr, init) {
  assert(typeof init != "function", "[initializeArray()] removed function initializers");
  for (var i=0, len=arr.length; i<len; i++) {
    arr[i] = init;
  }
  return arr;
}


Utils.createArray = function(size, init) {
  return Utils.initializeArray(new Array(size), init);
}; /* */


Utils.createIndexArray = function(size, func) {
  var arr = new Array(size);
  for (var i=0; i<size; i++) {
    arr[i] = func ? func(i) : i;
  }
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
    assert(idx >= 0 && idx < len, "Out-of-bounds array idx");
    arr2[i] = arr[idx];
  }
  Utils.replaceArray(arr, arr2);
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

  // path is relative to the node script;
  // get the absolute path to it.
  //
  Node.absPath = function(path) {
    var scriptDir = Node.getFileInfo(require.main.filename).directory;
    return require('path').join(scriptDir, path);
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
    // TODO: give meaningful output if fpath is a directory
    var path = require('path'),
        info = {};
    info.file = path.basename(fpath);
    info.path = path.resolve(fpath);
    info.ext = path.extname(fpath).toLowerCase().slice(1);
    info.base = info.ext.length > 0 ? info.file.slice(0, -info.ext.length - 1) : info.file;
    info.directory = path.dirname(info.path);
    return info;
  };

  Node.getFileInfo = function(fpath) {
    var info = Node.parseFilename(fpath);
    info.exists = Node.fileExists(fpath);
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
    Node.fs.writeFile(path, content, function(err) {
      if (err) {
        trace("[Node.writeFile()] Failed to write to file:", path);
      }
    });
  };

  Node.copyFile = function(src, dest) {
    assert(Node.fileExists(src), "[copyFile()] File not found:", src);
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
        flags = Utils.isString(o.flags) ? o.flags.split('') : [],
        currOpt;

    Node.arguments.splice(1).forEach(function(arg) {
      var match;
      if (match = /^-(.)/.exec(arg)) {
        currOpt = match[1];
        if (Utils.contains(flags, currOpt)) {
          opts[currOpt] = true; 
        }
      } else if (currOpt) {
        opts[currOpt] = Utils.isNumber(arg) ? parseFloat(arg) : arg;
        currOpt = null;
      } else {
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

/** @requires core */

/**
 * "C" object contains global constants.
 */
Opts.copyNewParams(C, {

  // alignment constants
  N: 'n',
  E: 'e',
  W: 'w',
  S: 's',
  NW: 'nw',
  NE: 'ne',
  SE: 'se',
  SW: 'sw',
  TOP: 'top',
  LEFT: 'left',
  RIGHT: 'right',
  BOTTOM: 'bottom',
  CENTER: 'c'

});


/**
 * Basic 2-d point class.
 * @constructor
 * @param {number=} x X coordinate.
 * @param {number=} y Y coordinate.
 */
function Point(x, y) {
  this.x = x;
  this.y = y;
}

Point.prototype.clone = function() {
  return new Point(this.x, this.y);
};

Point.prototype.toString = function() {
  return "{x:" + this.x + ", y:" + this.y + "}";
};

Point.prototype.distanceToXY = function(x, y) {
  return Point.distance(this.x, this.y, x, y);
};

Point.prototype.distanceToPoint = function(p) {
  return Point.distance(this.x, this.y, p.x, p.y);
};

Point.distance = function(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
};

Point.prototype.equals = function(p) {
  return this.x === p.x && this.y === p.y;
};



/**
 * Lat lon coordinate class.
 * @param {number} lat Latitude.
 * @param {number} lng Longitude.
 * @constructor
 */
function GeoPoint(lat, lng) {
  this.lat = lat;
  this.lng = lng;
}

GeoPoint.prototype.clone = function() {
  return new GeoPoint(this.lat, this.lng);
};

/**
 * Return a string representation for debugging.
 * @return {string} String.
 */
GeoPoint.prototype.toString = function() {
  var str = '[GeoPoint]: {lat:' + this.lat + ', lng:' + this.lng + '}';
  return str;
};



function FourSides(l, t, r, b) {
  this.left = l || 0;
  this.top = t || 0;
  this.right = r || 0;
  this.bottom = b || 0;
}


/**
 * View bounds as string.
 * @return {string} String.
 */
FourSides.prototype.toString = function() {
  return '{l:' + this.left + ', t:' + this.top + ', r:' +
    this.right + ', b:' + this.bottom + '}';
};


/**
 * A rectangle class for projected coordinates, where 
 * b.left <= b.right == true and b.top >= b.bottom == true
 * @constructor
 */
function BoundingBox() {
  // this._flipped = false;
  if (arguments.length == 4) {
    this.setBounds.apply(this, arguments);
  }
}

BoundingBox.prototype.toString = FourSides.prototype.toString;


/**
 * Test whether bounds have been set.
 * @return {boolean} True or false.
 */
BoundingBox.prototype.hasBounds = function() {
  return this.left !== undefined;
};


/**
 * Test for identical bounds.
 * @param {FourSides} bb Seconds bounding box.
 * @return {boolean} True or false.
 */
BoundingBox.prototype.hasSameBounds = function(bb) {
  return this.left == bb.left && this.top == bb.top &&
    this.right == bb.right && this.bottom == bb.bottom;
};

/**
 * Get width of bounding box.
 * @return {number} Width (in meters).
 */
BoundingBox.prototype.width = function() {
  return (this.right - this.left) || 0;
};

/**
 * Get height of bounding box.
 * @return {number} Height (in meters).
 */
BoundingBox.prototype.height = function() {
  return Math.abs(this.top - this.bottom) || 0; // handle flipped v bounds.
};

//BoundingBox.prototype.area = function() {
//  return this.width() * this.height();
//};


/**
 * Init bounding box with bounds.
 * @param {number} l Left bound or BoundingBox
 * @param {number} t Top bound or undefined.
 * @param {number} r Right bound or undefined.
 * @param {number} b Bottom bound or undefined.
 */
BoundingBox.prototype.setBounds = function(l, t, r, b) {
  if (arguments.length == 1) {
    // assume first arg is a BoundingBox
    b = l.bottom;
    r = l.right;
    t = l.top;
    l = l.left;
  }
  this.left = l;
  this.top = t;
  this.right = r;
  this.bottom = b;
  // this._flipped = b > t;
  return this;
};

/**
 * Get x, y coords of box center.
 * @return {Point} Center point.
 */
BoundingBox.prototype.getCenterPoint = function() {
  assert(this.hasBounds(), "Missing bounds");
  return new Point(this.centerX(), this.centerY());
};

/**
 * Get x coord of center point.
 * @return {number} X coordinate.
 */
BoundingBox.prototype.centerX = function() {
  var x = (this.left + this.right) * 0.5;
  return x;
};

/**
 * Get y coord of center point.
 * @return {number} Y coordinate.
 */
BoundingBox.prototype.centerY = function() {
  var y = (this.top + this.bottom) * 0.5;
  return y;
};


/**
 * Is an x, y point inside or on the edge of the bounding box?
 * @param {number} x X coord.
 * @param {number} y Y coord.
 * @return {boolean} True or false.
 */
BoundingBox.prototype.containsPoint = function(x, y) {
  if (x >= this.left && x <= this.right &&
    y <= this.top && y >= this.bottom) {
    return true;
  }
  return false;
};

// intended to speed up slightly bubble symbol detection; could use intersects() instead
// * FIXED * may give false positives if bubbles are located outside corners of the box
//
BoundingBox.prototype.containsBufferedPoint = function( x, y, buf ) {
  if ( x + buf > this.left && x - buf < this.right ) {
    if ( y - buf < this.top && y + buf > this.bottom ) {
      return true;
    }
  }
  return false;
}		


/**
 * Tests whether a second BoundingBox intersect this bb.
 * TODO: Handle case where argument is not a valid bb.
 * @param {BoundingBox} bb Bounding box to test.
 * @return {boolean} True or false.
 */
BoundingBox.prototype.intersects = function(bb) {
  if (bb.left < this.right && bb.right > this.left &&
    bb.top > this.bottom && bb.bottom < this.top) {
    return true;
  }
  return false;
};


BoundingBox.prototype.contains = function(bb) {
  if (bb.left >= this.left && bb.top <= this.top &&
    bb.right <= this.right && bb.bottom >= this.bottom) {
    return true;
  }
  return false;
};


/**
 * Shift (translates) the bounding box.
 * @param {number} x Amount to shift horizontally.
 * @param {number} y Amount to shift vertically.
 */
BoundingBox.prototype.translate = function(x, y) {
  this.setBounds(this.left + x, this.top + y, this.right + x,
    this.bottom + y);
};

BoundingBox.prototype.padBounds = function(l, t, r, b) {
  this.left -= l;
  this.top += t;
  this.right += r;
  this.bottom -= b;
}


/**
 * Rescale the bounding box by a fraction. TODO: implement focus.
 * @param {number} pct Fraction of original extents
 * @param {number} pctY Optional amount to scale Y
 */
BoundingBox.prototype.scale = function(pct, pctY) { /*, focusX, focusY*/
  var halfWidth = (this.right - this.left) * 0.5;
  var halfHeight = (this.top - this.bottom) * 0.5;
  var kx = pct - 1;
  var ky = pctY === undefined ? kx : pctY - 1;
  this.left -= halfWidth * kx;
  this.top += halfHeight * ky;
  this.right += halfWidth * kx;
  this.bottom -= halfHeight * ky;
};

/**
 * Return a bounding box with the same extent as this one.
 * @return {BoundingBox} Cloned bb.
 */
BoundingBox.prototype.cloneBounds = function() {
  var bb = new BoundingBox();
  if (this.hasBounds()) {
    bb.setBounds(this.left, this.top, this.right, this.bottom);
  }
  return bb;
};

BoundingBox.prototype.clearBounds = function() {
  this.setBounds(new BoundingBox());
}

/**
 * Enlarge this bb to incorporate a point.
 * @param {number} x X coord.
 * @param {number} y Y coord.
 */
BoundingBox.prototype.mergePoint = function(x, y) {
  if (this.left === undefined) {
    this.setBounds(x, y, x, y);
  }
  else {
    // this works even if x,y are NaN
    if (x < this.left)  this.left = x;
    else if (x > this.right)  this.right = x;

    if (y < this.bottom) this.bottom = y;
    else if (y > this.top) this.top = y;
  }
};


/**
 * Modify this bb to include a second bounding box.
 * @param {BoundingBox} bb Second bounding box.
 */
BoundingBox.prototype.mergeBounds = function(bb) {

  if (arguments.length == 0 || bb.left === void 0) {
    return;
  }

  if (this.left !== void 0) {
    if (bb.left < this.left) {
      this.left = bb.left;
    }
    if (bb.right > this.right) {
      this.right = bb.right;
    }
    if (bb.top > this.top) {
      this.top = bb.top;
    }
    if (bb.bottom < this.bottom) {
      this.bottom = bb.bottom;
    }
  }
  else {
    this.left = bb.left;
    this.top = bb.top;
    this.right = bb.right;
    this.bottom = bb.bottom;
    // this.setBounds(bb.left, bb.top, bb.right, bb.bottom);
  }
};


function Transform() {
  this.mx = this.my = 1;
  this.bx = this.by = 0;
}


Transform.prototype = {
  useTileBounds: function(wPix, hPix, bb) {
    var ppm = wPix / (bb.right - bb.left);
    this.mx = ppm;
    this.my = hPix / (bb.bottom - bb.top);
    this.bx = -ppm * bb.left;
    this.by = -this.my * bb.top;
    return this;
  },

  fromPixels: function(x, y, xy) {
    xy = xy || [];
    xy[0] = (x - this.bx) / this.mx;
    xy[1] = (y - this.by) / this.my;
    return xy;
  },

  toPixels: function(x, y, xy) {
    xy = xy || [];
    xy[0] = x * this.mx + this.bx;
    xy[1] = y * this.my + this.by;
    return xy;
  }

  /*
  toString: function() {
    return "[Transform: " + Utils.toString({mx:mx, my:my, bx:by, by:by}) + "]";
  }*/
};

/**
 * TODO: remove 256
 */
function TileExtent(w, h) {
  this.mx = this.my = 1;
  this.bx = this.by = 0;
  this.widthInPixels = w || 256;
  this.heightInPixels = h || 256;
}

Opts.inherit(TileExtent, BoundingBox);

// Adapted from MapExtent()
TileExtent.prototype.setBounds =  function(bb, t, r, b) {
  if (b) {
    // accept four coords (instead of one BoundingBox)
    bb = new BoundingBox().setBounds(bb, t, r, b);
  }

  this.mergeBounds(this, bb);

  var ppm = this.widthInPixels / (bb.right - bb.left);
  this.mx = ppm;
  //this.my = -ppm;
  this.my = this.heightInPixels / (bb.bottom - bb.top);
  this.bx = -ppm * bb.left;
  this.by = -this.my * bb.top;
  this.metersPerPixel = 1 / ppm; // 
};


TileExtent.prototype.updateBounds = TileExtent.prototype.setBounds; // TODO: remove updateBounds

/**
 * // apply after bounds have been set...
 */
TileExtent.prototype.addPixelMargins = function(l, t, r, b) {
  //trace(arguments);
  this.bx += l;
  this.by -= b;
  this.mx *= 1 - (l + r) / this.widthInPixels;
  this.my *= 1 - (t + b) / this.heightInPixels;
};

TileExtent.prototype.transformXY = function(x, y, xy) {
  xy = xy || new Point();
  var xPix = x * this.mx + this.bx;
  var yPix = y * this.my + this.by;
  xy.x = xPix;
  xy.y = yPix;
  return xy;
};

TileExtent.prototype.clone = function() {
  var ext = new TileExtent(this.widthInPixels, this.heightInPixels);
  ext.setBounds(this);
  return ext;
};



/* @requires arrayutils, core.geo */

var MapShaper = {};


MapShaper.importFromFile = function(fname) {
  var info = Node.getFileInfo(fname);
  if (!info.exists) error("File not found.");
  if (info.ext != 'shp' && info.ext != 'json', "Expected *.shp or *.json file; found:", fname);

  if (info.ext == 'json') {
    return MapShaper.importJSON(JSON.parse(Node.readFile(fname, 'utf8')));
  }
  return MapShaper.importShpFromBuffer(Node.readFile(fname));
};


// assumes Shapefile, TopoJSON or GeoJSON
//
MapShaper.importFromStream = function(sname) {
  assert("/dev/stdin", "[importFromStream()] requires /dev/stdin; received:", sname);
  var buf = Node.readFile(sname);
  if (buf.readUInt32BE(0) == 9994) {
    return MapShaper.importShpFromBuffer(buf);
  }
  var obj = JSON.parse(buf.toString());
  return MapShaper.importJSON(obj);
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
  if (!bb) bb = new BoundingBox();
  var xbounds = Utils.getArrayBounds(xx),
      ybounds = Utils.getArrayBounds(yy);
  assert(xbounds.nan == 0 && ybounds.nan == 0, "[calcXYBounds()] Data contains NaN; xbounds:", xbounds, "ybounds:", ybounds);
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
MapShaper.convertTopoShape = function(shape, arcs) {
  var parts = [],
      pointCount = 0,
      bounds = new BoundingBox();

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
    if (xx.length > 0) {
      parts.push([xx, yy]);
      pointCount += xx.length;
      MapShaper.calcXYBounds(xx, yy, bounds);
    }
  }

  return {parts: parts, bounds: bounds, pointCount: pointCount, partCount: parts.length};
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
  var ab = Point.distance(ax, ay, bx, by),
      bc = Point.distance(bx, by, cx, cy),
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


// export functions so they can be tested
MapShaper.geom = {
  distance3D: distance3D,
  innerAngle: innerAngle,
  innerAngle3D: innerAngle3D,
  triangleArea: triangleArea,
  triangleArea3D: triangleArea3D,
  msRingArea: msRingArea,
  msSignedRingArea: msSignedRingArea,
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
  // assert(len > 1, "Arc length must be 2 or greater");

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
  assert(!!obj.shapes && !!obj.arcs, "Missing 'shapes' and/or 'arcs' properties.");

  var features = Utils.map(obj.shapes, function(topoShape) {
    assert(topoShape && Utils.isArray(topoShape), "[exportGeoJSON()] Missing or invalid param/s");
    var data = MapShaper.convertTopoShape(topoShape, obj.arcs);
    return MapShaper.getGeoJSONPolygonFeature(data.parts);      
  });

  var root = {
    type: "FeatureCollection",
    features: features
  };

  return JSON.stringify(root);
};

// TODO: Implement the GeoJSON spec for holes.
//
MapShaper.getGeoJSONPolygonFeature = function(ringsIn) {
  //error(ringsIn);
  var rings = Utils.map(ringsIn, MapShaper.transposeXYCoords),
      ringCount = rings.length,
      geom = {};
  if (ringCount == 0) {
    // null shape; how to represent?
    geom.type = "Polygon";
    geom.coordinates = [[]];
  } else if (ringCount == 1) {
    geom.type = "Polygon";
    geom.coordinates = rings;
  } else {
    geom.type = "MultiPolygon";
    geom.coordinates = Utils.map(rings, function(ring) {return [ring]});
  }

  var feature = {
    type: "Feature",
    properties: {},
    geometry: geom
  };

  return feature;
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

  //
  // PUBLIC METHODS
  //

  this.addValues = function(values, start, end) {
    var minId = start | 0,
        maxId = end == null ? values.length - 1 : end | 0;
        maxItems = maxId - minId + 1;
    dataOffs = minId,
    dataArr = values;
    reserveSpace(maxItems);
    itemsInHeap = 0;
    for (var i=0; i<maxItems; i++) {
      itemsInHeap++;
      // add item to bottom of heap and restore order
      updateHeap(i, i + dataOffs);
      reHeap(i);
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
      updateHeap(0, heapArr[lastIdx]);// copy last item in heap into root position
      reHeap(0);
    }
    poppedVal = dataArr[minValId];
    return minValId;
  };

  //
  // PRIVATE
  //

  function reserveSpace(heapSize) {
    if (!heapArr || heapSize > heapArr.length) {
      var bufLen = heapSize * 1.2 | 0;
      heapArr = new Int32Array(bufLen);
      indexArr = new Int32Array(bufLen); 
    }
  };

  // Associate a heap idx with the id of a value in valuesArr
  function updateHeap(heapIdx, valId) {
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

  function getMinChildIdx(i, j) {
    if (i >= itemsInHeap) error("Heap index error");
    return j >= itemsInHeap || dataArr[heapArr[i]] <= dataArr[heapArr[j]] ? i : j;
  }

  // Function restores order to the heap (lesser values towards the top of the heap)
  // Receives the idx of a heap item that has just been changed or added.
  // (Assumes the rest of the heap is ordered, this item may be out-of-order)
  //
  function reHeap(currIdx) {
    var valId, currVal,
        parentIdx,
        parentValId,
        parentVal;

    if (currIdx < 0 || currIdx >= itemsInHeap) error("Out-of-bounds heap idx passed to reHeap()");
    valId = heapArr[currIdx];
    currVal = dataArr[valId];

    // Bubbling phase:
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
      updateHeap(currIdx, parentValId);
      updateHeap(parentIdx, valId);
      currIdx = parentIdx;
      // if (dataArr[heapArr[currIdx]] !== currVal) error("Lost value association");
    }

    // Percolating phase:
    // Item gets swapped with any lighter children
    //
    var firstChildIdx = 2 * currIdx + 1,
        minChildIdx, childValId, childVal;

    while (firstChildIdx < itemsInHeap) {
      minChildIdx = getMinChildIdx(firstChildIdx, firstChildIdx + 1);
      childValId = heapArr[minChildIdx];
      childVal = dataArr[childValId];

      if (currVal <= childVal) {
        break;
      }

      // swap curr item and child w/ lesser value
      updateHeap(currIdx, childValId);
      updateHeap(minChildIdx, valId);

      // descend in the heap:
      currIdx = minChildIdx;
      firstChildIdx = 2 * currIdx + 1;
    }
  };
}

/* @requires mapshaper-common */

MapShaper.importKML = function(obj) {
  error("TODO: KML import.")
};

/* @requires mapshaper-common */

//
//
//
//

MapShaper.repairTopology = function(obj, chainedIds, bb, resolution) {


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
 * Import an array of objects and an (optional) object of field types
 * @param arr Array of object records (i.e. each property:value is a fieldname:value pair)
 * @param schema Object of field types; each property:value is a fieldname:type pair. Valid types include double, integer, string, object
 */
DataTable.prototype.importObjectRecords = function(arr, schema) {
  assert(arr && arr.length > 0, "Missing array of data values");
  var rec0 = arr[0];
  assert(Utils.isObject(rec0), "Expected an array of objects");

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
  assert(arr && arr.length > 0, "Missing array of data values");

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
    assert(types.length == fields.length, "Mismatched types and fields; types:", types, "fields:", fields);
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
  assert(!!schema, "Missing schema object");

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
  assert(this.fieldExists(fname), "Missing field:", fname);
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
    while(this.hasNext()) {
      func.call(ctx, this.nextRecord);
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
  var obj = Utils.map(this._data, function(arr) { return arr[this.id]; }, this);
  return obj;
};


/* @requires core, nodejs */

// Wrapper for DataView class for more convenient sequential reading and writing of
//   numbers; Remembers endianness and read/write position.
// Has convenience methods for copying from buffers, etc.
//
function BinArray(buf, le) {
  assert(buf instanceof ArrayBuffer || buf instanceof Buffer, "[BinArray()] requires ArrayBuffer or Buffer object");
  this._buffer = buf;
  this._view = new DataView(buf);
  this._idx = 0;
  this.littleEndian = !!le;
}

BinArray.bufferSize = function(buf) {
  return (buf instanceof Buffer ? buf.length : buf.byteLength)
};

BinArray.prototype = {
  buffer: function() {
    return this._buffer;
  },

  dataView: function() {
    return this._view;
  },

  bytesLeft: function() {
    return BinArray.bufferSize(this._buffer) - this._idx;
  },

  readUint8: function() {
    var val = this._view.getUint8(this._idx);
    this._idx++;
    return val;
  },

  readInt8: function() {
    var val = this._view.getInt8(this._idx);
    this._idx++;
    return val; 
  },

  readInt32: function() {
    var val = this._view.getInt32(this._idx, this.littleEndian);
    this._idx += 4;
    return val;
  },

  readUint32: function() {
    var val = this._view.getUint32(this._idx, this.littleEndian);
    this._idx += 4;
    return val;
  },

  writeUint32: function(val) {
    this._view.setUint32(this._idx, val, this.littleEndian);
    this._idx += 4;
  },

  writeInt32: function(val) {
    this._view.setInt32(this._idx, val, this.littleEndian);
    this._idx += 4;
  },

  /*
  readInt16: function(le) {
    var val = this._view.getInt16(this._idx, this.littleEndian);
    this._idx += 2;
    return val;
  },

  readUint16: function(le) {
    var val = this._view.getUint16(this._idx, this.littleEndian);
    this._idx += 2;
    return val;
  },*/

  readUint32Array: function(len) {
    var arr = [];
    for (var i=0; i<len; i++) {
      arr.push(this.readUint32());
    }
    return arr;
  },

  skipBytes: function(bytes) {
    this._idx += (bytes + 0);
    return true;
  },

  clearBytes: function(bytes, clearVal) {
    clearVal = clearVal | 0;
    while (bytes--) {
      this._buffer[this._idx++] = clearVal;
    }
  },

  readFloat64: function() {
    var val = this._view.getFloat64(this._idx, this.littleEndian); 
    this._idx += 8;
    return val;
  },

  writeFloat64: function(val) {
    this._view.setFloat64(this._idx, val, this.littleEndian);
    this._idx += 8;
  },

  readFloat64Array: function(len) {
    var arr = [];
    // TODO: optimize by reading directly from DataView
    for (var i=0; i<len; i++) {
      arr.push(this.readFloat64());
    }
    return arr;
  },

  readPoint: function() {
    return [this.readFloat64(), this.readFloat64()];
  },

  readPointArray: function(len) {
    var arr = [];
    for (var i=0; i<len; i++) {
      arr.push([this.readFloat64(), this.readFloat64()]);
    }
    return arr;
  },

  writePointArray: function(arr) {
    var view = this._view,
        idx = this._idx;
    for (var i=0, len=arr.length; i<len; i++, idx += 8) {
      view.setFloat64(idx, arr[i][0], this.littleEndian);
      view.setFloat64(idx + 4, arr[i][1], this.littleEndian);
    }
    this._idx = idx;
  },

  peek: function() {
    return this._view.getUint8(this._idx);
  },

  position: function(i) {
    if (i != null) {
      this._idx = i;
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

  identical: function(buf) {
    var bufLen = BinArray.bufferSize(buf);
    var thisLen = BinArray.bufferSize(this._buffer);

    if (thisLen != bufLen) {
      trace("[identical()] Buffers are different sizes.");
      return false;
    }

    for (var i=0; i<bufLen; i++) {
      if (this._buffer[i] !== buf[i]) {
        return false;
      }
    }

    return true;
  },

  writeBuffer: function(src, bytes, readIdx) {
    readIdx = readIdx | 0;
    bytes = bytes || BinArray.bufferSize(src);
    var writeIdx = this._idx;

    if (this.bytesLeft() < bytes) error("[writeBuffer()] Buffer overflow; bytesLeft:", this.bytesLeft(), "bytes to write:", bytes);
    while (bytes--) {
      this._buffer[writeIdx++] = src[readIdx++];
    }
    this._idx = writeIdx;
  }
};



/* @requires data, dataview */

var Shapefile = {
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
  MULTIPATCH: 31
};


var DBF = {

};


/*
  @param buff {}

*/
DBF.importFromBuffer = function(buff) {
  var byteLength = buff.byteLength;
  var view = new DataView(buff);
}

/* @requires core.geo */

/**
 * A polygon or polyline shape containing 0 or more parts (e.g. polygon rings).
 * @param {number} id Integer id of the shape.
 * @param {*} vertexSet Vertex set representing the first part in the shape.
 * @constructor
 */
function ShapeVector(id, vertexSet) {
  this.id = id;
  this.parts = [];
  if (vertexSet) {
    this.addPartData(vertexSet);
  }
  this.sortKey = "";
  this.reset();
}

Opts.extendPrototype(ShapeVector, BoundingBox);

ShapeVector.prototype.addPartData = function(vertexSet) {
  this.parts.push(vertexSet);
  this.mergeBounds(vertexSet);
};


ShapeVector.prototype.drawPath = function drawPath(context, ext) {
  var numParts = this.parts.length;
  for (var j = 0; j < numParts; j++) {
    var vec = this.parts[j];
    vec.draw(context, ext);
  }
};

ShapeVector.prototype.getSortKey = function() {
  return this.sortKey;
};


// Bolted-on iterator methods to implement MultiPath interface (fastmap-shapes.js)
//
ShapeVector.prototype.reset = function() {
  this.__setPart(-1);
}

ShapeVector.prototype.__setPart = function(i) {
  this._currPart = this.parts[i] || null;
  this._partId = i;
  this._pointId = 0;
}

ShapeVector.prototype.nextPart = function() {
  var partId = this._partId + 1;
  if (partId >= this.parts.length) {
    this.reset();
    return false;
  }
  this.__setPart(partId);
  return true;
};

ShapeVector.prototype.nextPoint = function() {
  var vec = this._currPart;
  if (!vec || !vec.hasNext()) {
    return false;
  }
  this.x = vec.nextX;
  this.y = vec.nextY;
  this.i = this._pointId++;
  return true;
};

ShapeVector.prototype.hasNext = function() {
  return this.nextPoint() || this.nextPart() && this.nextPoint();
};


/**
 * Sequence of x,y coordinates describing a polyline or polygon ring.
 * @param {Array} xx Array of x coordinates.
 * @param {Array} yy Array of y coordinates.
 * @constructor
 */
function VertexSet(xx, yy) {
  this.xx = xx;
  this.yy = yy;
  //this._size = xx.length;

  this._idx = 0;
  this.nextX = 0;
  this.nextY = 0;
}

VertexSet.prototype = new BoundingBox();


/**
 * Returns number of vertices in the collection.
 * @return {number} Length of VertexSet.
 */
VertexSet.prototype.size = function() {
  return this.xx && this.xx.length || 0; // this._size;
};


/**
 * Iterator test; also advances cursor or resets if at end of sequence.
 * @return {boolean} True or false.
 */
VertexSet.prototype.hasNext = function() {
  var idx = this._idx;
  if (idx >= this.xx.length) {// this._size) {
    this._idx = 0;
    return false;
  }
  this.nextX = this.xx[idx];
  this.nextY = this.yy[idx];
  this._idx = idx + 1;
  return true;
};

VertexSet.prototype.calcBounds = function calcBounds() {
  var len = this.size(); // this._size;
  if (len == 0) {
    return;
  }
  var xx = this.xx;
  var yy = this.yy;
  var maxx = xx[0];
  var maxy = yy[0];
  var minx = maxx;
  var miny = maxy;

  /* This is up to 2x faster than using Array.max() and Array.min() */
  /*  */
  for (var i=1; i<len; i++) {
    var x = xx[i];
    var y = yy[i];

    if (x > maxx) maxx = x;
    else if (x < minx) minx = x;
    if (y > maxy) maxy = y;
    else if (y < miny) miny = y;
  }

  /*
  minx = Math.min.apply(Math, xx);
  maxx = Math.max.apply(Math, xx);
  miny = Math.min.apply(Math, yy);
  maxy = Math.max.apply(Math, yy);
  */
  
  // this.setBounds(minx, maxy, maxx, miny);
  this.left = minx;
  this.top = maxy;
  this.right = maxx;
  this.bottom = miny;
};

VertexSet.prototype.addPoint = function(x, y) {
  this.xx.push(x);
  this.yy.push(y);
};


/**
 * Draw vertices using the canvas drawing API.
 * @param {*} context 2D canvas context.
 * @param {MapExtent} ext MapExtent object.
 */
VertexSet.prototype.draw = function(context, ext) {
  var x, y,
    mx = ext.mx,
    my = ext.my,
    bx = ext.bx,
    by = ext.by,
    first = true;
  
  while (this.hasNext()) {
    x = this.nextX * mx + bx;
    y = this.nextY * my + by;

    if (first) {
      first = false;
      context.moveTo(x, y);
    }
    else {
      context.lineTo(x, y);
    }
  }
};

/* @requires core */

/**
 * Left-pad a string.
 * @param {string} str Input string.
 * @param {number} size Minimum number of characters in output string.
 * @param {string} pad Character to use as padding.
 * @return {string} Padded string.
 */
Utils.leftPad = function(str, size, pad) {
  str = String(str);
  var chars = size - str.length;
  while (chars-- > 0) {
    str = pad + str;
  }
  return str;
};


/**
 * Trim whitespace from around a string.
 * @param {string} str Raw string.
 * @return {string} Trimmed string.
 */
Utils.trim = function(str) {
  return str.replace(/^\s+|\s+$/g, '');
};

Utils.capitalizeWord = function(w) {
  return w ? w.charAt(0).toUpperCase() + w.substr(1) : '';
};


/**
 * Formats an integer or decimal number.
 * @param {number} n Number to format.
 * @param {number=} decimals Number of decimals for rounding.
 * @param {string=} nullStr String to display for invalid numbers.
 * @param {boolean=} showPos If true, prefix positive numbers with '+'.
 * @return {string} Formatted number.
 */
Utils.formatNumber = function(n, decimals, nullStr, showPos) {
  decimals = decimals || 0;
  nullStr = nullStr || '';
  showPos = showPos || false;

  // Handle NaN and infinity.
  if (n == !n || n == Infinity || n == -Infinity) {
    return nullStr;
  }

  // get integer and decimal parts of the number
  var iPartStr = '';
  var dPartStr = '';
  var rawDigits = 0;

  if (decimals > 0) {
    // power of 10 for shifting decimals into integer range, for rounding.
    var pow10 = Math.pow(10, decimals);

    // Adding small number to avoid rounding errors, e.g., 1.005 -> 1.00
    var sugar = 0.0000001;
    rawDigits = Math.round(Math.abs(n) * pow10 + sugar);
    iPartStr = String(Math.floor(rawDigits / pow10));
    dPartStr = String(rawDigits % pow10);
    // left-pad the decimal string, if needed
    while (dPartStr.length < decimals) {
      dPartStr = '0' + dPartStr;
    }
    dPartStr = '.' + dPartStr;
  }
  else {
    rawDigits = Math.round(Math.abs(n));
    iPartStr = String(rawDigits);
  }

  // Format zero without decimals.
  if (iPartStr == '0' && !dPartStr) {
    return '0';
  }

  var posStr = showPos ? '+' : '';
  var negStr = '-'; //  EN_DASH;
  var signStr = (n < 0) ? negStr : posStr;

  // Add thousands delimiter (,) if needed
  if (iPartStr.length > 3) {
    var count = iPartStr.length;  // number of unprocessed digits
    var delimitedStr = '';
    while (count > 3) {
      delimitedStr = ',' + iPartStr.substr(count - 3 , 3) + delimitedStr;
      count -= 3;
    }
    iPartStr = iPartStr.substr(0, count) + delimitedStr;
  }

  return signStr + iPartStr + dPartStr;
};



/* @requires dataview */


function DbfReader(buf) {
  var bin = this._bin = new BinArray(buf);
  this.header = this.readHeader(bin);
}

DbfReader.prototype.readAsArray = function() {
  var header = this.header,
    bin = this._bin,
    fields = header.fields,
    rows = header.recordCount;

  bin.position(header.headerSize);
  var src = this.getRecordSection();
  var offs = 0;
  var arr = [];
  for (var i=0; i<rows; i++) {
    var rec = {};
    offs += 1;
    arr.push(rec);
    for (var j=0, fieldCount=fields.length; j<fieldCount; j++) {
      var field = fields[j];
      var str = this.readFieldString(src, offs, field.length);
      offs += field.length;
      var val = this.parseField(str, field.parseType);
      rec[field.name] = val;
    }
  }

  return arr;
};

DbfReader.prototype.readAsDataTable = function() {
  var fields = this.header.fields;
  var table = new DataTable().startWaiting(); // set table to READY

  for (var i=0; i<fields.length; i++) {
    var field = fields[i];
    if (field.parseType) {
      var col = this.readColumn(field);
      table.insertFieldData(field.name, field.parseType, col);
    }
  }

  return table;
}


DbfReader.prototype.readColumn = function(field) {
  var byteArr = this.getRecordSection();
  var header = this.header,
    rows = header.recordCount,
    parseType = field.parseType,
    flen = field.length,
    recSize = header.recordSize;

  var col = [];
  var offs = field.columnOffset;
  for (var i=0; i<rows; i++, offs += recSize) {
    var str = this.readFieldString(byteArr, offs, flen);
    var val = this.parseField(str, parseType);
    col.push(val);
  }
  return col;
};


DbfReader.prototype.readFieldString = function(arr, start, len) {
  var str = "";
  for (var i=0; i<len; i++) {
    str += String.fromCharCode(arr[i + start]);
  }
  return str;
};



DbfReader.prototype.getRecordSection = function() {
  var buf = this._bin.buffer();
  var arr = new Uint8Array(buf, this.header.headerSize);
  return arr;
};

DbfReader.prototype.readRecord = function(i) {
  var offs = this.header.headerSize + i * this.header.recordSize;
  var bin = this._bin;
  bin.position(offs);
  var rec = bin.getCString(this.header.recordSize);
  return rec;
};

DbfReader.prototype.parseField = function(str, type) {
  str = Utils.trim(str);
  var val = null;
  if (type == C.STRING) {
    val = str;
  }
  else if (type == C.DOUBLE) {
    val = parseFloat(str);
  }
  else if (type == C.INTEGER) {
    val = parseInt(str, 10);
  }
  return val;
};

DbfReader.prototype.readHeader = function(bin) {
  var header = {
    version: bin.getInt8(),
    updateYear: bin.getUint8(),
    updateMonth: bin.getUint8(),
    updateDay: bin.getUint8(),
    recordCount: bin.getUint32(true),
    headerSize: bin.getUint16(true),
    recordSize: bin.getUint16(true),
    incompleteTransaction: bin.skipBytes(2) && bin.getUint8(),
    encrypted: bin.getUint8(),
    mdx: bin.skipBytes(12) && bin.getUint8(),
    language: bin.getUint8()
  };

  bin.skipBytes(2);

  header.fields = [];
  var colOffs = 1; // first column starts on second byte of record
  while(bin.peek() != 0x0D) {
    var field = this.readFieldHeader(bin);
    field.columnOffset = colOffs;
    colOffs += field.length;
    header.fields.push(field);
  }

  bin.position(header.headerSize);
  return header;
};


DbfReader.prototype.readFieldHeader = function(bin) {
  var field = {
    name: bin.getCString(11),
    type: String.fromCharCode(bin.getUint8()),
    address: bin.getUint32(true),
    length: bin.getUint8(),
    decimals: bin.getUint8(),
    id: bin.skipBytes(2) && bin.getUint8(),
    position: bin.skipBytes(2) && bin.getUint8(),
    indexFlag: bin.skipBytes(7) && bin.getUint8()
  };

  if (field.type == 'C') {
    field.parseType = C.STRING;
  } else if (field.type == 'N' && field.decimals > 0) {
    field.parseType = C.DOUBLE;
  } else if (field.type == 'I' || field.type == 'N') {
    field.parseType = C.INTEGER;
  }

  return field;
}

/* @requires nodejs, events, shapefile, shapes, textutils, data, dbf-import, dataview */

//
Shapefile.importShpFromFile = function(fname) {
  error("Not Implemented.");
};


Shapefile.importShpFromUrl = function(url, callback) {
  Utils.loadArrayBuffer(url, function(buffer) {
    var obj = Shapefile.importShpFromArrayBuffer(buffer);
    callback(obj);
  })
};


Shapefile.importShpFromArrayBuffer = function(buf) {
  //T.start();
  var obj = new ShapefileReader(buf).read();
  // T.stop("importShpFromBuffer()")
  return obj;
};


Shapefile.importDbfFromUrl = function(url, callback) {
  Utils.loadArrayBuffer(url, function(buffer) {
    var obj = Shapefile.importDbfFromArrayBuffer(buffer);
    callback(obj);
  })
};

Shapefile.importDbfFromArrayBuffer = function(buf) {
  T.start();
  //var obj = new DbfReader(buf).readAsDataTable();
  var obj = new DbfReader(buf).readAsArray();
  T.stop();

  trace("table:", obj);
  return obj;
};


/**
/ use js File api to read and parse a shapefile

<input type="file" id="files" name="files[]" multiple />
Browser.on("files", ShapefileImport.onLoad(callback));  // TODO: make Browser.on() work with object id

 */
Shapefile.handleFileSelect = function(el, callback) {
  if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
    trace("[ShapefielImport.onLoad()] File api not supported.");
    throw "MissingFileAPI";
    return;
  }

  Browser.on('change', el, function(evt) {
    var files = evt.target.files;
  });

};


Utils.loadArrayBuffer = function(url, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'arraybuffer';
  xhr.onload = function(e) {
    callback(xhr.response);
  };
  xhr.send();
};


/**
 * Create a ShapefileReader (new ShapefileReader) to start reading a Shapefile
 * @param buf An ArrayBuffer or nodejs Buffer object
 * 
 * Used by Shapefile methods (see below)
 */
function ShapefileReader(buf) {
  this._bin = new BinArray(buf);
  this.header = this.readHeader(this._bin);
}


ShapefileReader.prototype.read = function() {
  var bin = this._bin,
    header = this.header,
    shapes = [],
    pointCount = 0

  bin.position(100); // make sure we're reading from shape data section
  while(this.hasNext()) {
    var meta = this.readShapeMetadata(bin, header);
    var shp = this.readShape(bin, meta);
    shapes.push(shp);
    pointCount += meta.pointCount;
  }
  header.pointCount = pointCount;
  return {header:header, shapes:shapes};
}

ShapefileReader.prototype.hasNext = function() {
  return this._bin.bytesLeft() > 0;
};


ShapefileReader.prototype.readShapeMetadata = function(bin, header) {
  bin.littleEndian = false;
  var partCount = 0,
    pointCount = 0,
    shapeOffset = bin.position(),
    shapeNum = bin.readUint32(),
    contentWords = bin.readUint32();

  bin.littleEndian = true;
  var type = bin.readUint32();

  if (type == Shapefile.NULL) {
    trace("[ShapefileReader.readNext()] shape no.", shapeNum, "is NULL");
  }
  else if (type != header.type) {
    trace(">>> recType:", recType, "fileType:", header.type);
    throw "Record/Shapefile type mismatch";
  }
  else {
    var bounds = bin.readFloat64Array(4);
    partCount = bin.readUint32();
    pointCount = bin.readUint32();
    var pointOffsets = bin.readUint32Array(partCount);
    var partSizes = [];
    for (var i = 0; i<partCount; i++) {
      var pointsInPart = i < partCount-1 ? pointOffsets[i+1] - pointOffsets[i] : pointCount - pointOffsets[i];

      // Empty parts would be removed here
      if (pointsInPart > 0) { // 
        partSizes.push(pointsInPart); 
      }
    }
  }

  var meta = {
    shapeOffset: shapeOffset,
    coordOffset: bin.position(),
    shapeNum: shapeNum,
    partSizes: partSizes || null,
    bounds: bounds || null,
    partCount: partSizes ? partSizes.length : 0,
    pointCount: pointCount,
    type: type
  };

  return meta;
};

/**
 * Default shape reader; override to change format
 */
ShapefileReader.prototype.readShape = function(bin, meta) {
  var arr = meta.partSizes.map(function(len) {
    var xx = [], yy = [];
    var view = bin.dataView();
    for (var idx=bin.position(), end=idx + 16 * len; idx < end; idx += 16) {
      xx.push(view.getFloat64(idx, true));
      yy.push(view.getFloat64(idx + 8, true));
    }
    bin.position(idx);
    return [xx, yy];
  });
  return arr;
};

ShapefileReader.readShapeAsPointArrays = function(bin, meta) {
  var arr = meta.partSizes.map(function(len) {
    var coords = [];
    for (var i=0; i<len; i++) {
      coords.push(bin.readFloat64Array(2));
    }
    return [xx, yy];
  });
  return arr;
};

ShapefileReader.readShapeAsShapeVector = function(bin, meta) {
  var shp = new ShapeVector(meta.shapeNum - 1);
  shp.setBounds(meta.bounds[0], meta.bounds[3], meta.bounds[2], meta.bounds[1]);
  var parts = ShapefileReader.readShapeAsArray(bin, meta);
  parts.forEach(function(partArr) {
    var vec = new VertexSet(partArr[0], partArr[1]);
    shp.addPartData(vec);
  });
  return shp;
};


ShapefileReader.prototype.readHeader = function(bin) {
  bin.littleEndian = false;
  var fileCode = bin.readUint32();
  bin.skipBytes(4*5);
  var wordsInFile = bin.readUint32();
  bin.littleEndian = true;
  var meta = {
    byteCount: wordsInFile * 2,
    version: bin.readUint32(),
    type: bin.readUint32(),
    xmin: bin.readFloat64(),
    ymin: bin.readFloat64(),
    xmax: bin.readFloat64(),
    ymax: bin.readFloat64(),
    zmin: bin.readFloat64(),
    zmax: bin.readFloat64(),
    mmin: bin.readFloat64(),
    mmax: bin.readFloat64()
  };

  if (!(meta.type == Shapefile.POLYGON || meta.type == Shapefile.POLYLINE)) {
    error("Unsupported Shapefile Type:", meta.type);
  }

  return meta;
};



/* @requires shapefile-import */


/**
 * This replaces the default ShapefileReader.read() function.
 * Data is stored in a format used by MapShaper for topology building.
 */
ShapefileReader.prototype.read = function() {
  var bin = this._bin,
      shapes = [],
      pointCount = 0,
      partCount = 0,
      shapeCount = 0;

  var rememberHoles = true,
      rememberMaxParts = true;

  bin.position(100); // skip to the shape data section

  // FIRST PASS
  // get metadata about each shape and get total point count in file
  // (need total point count to instantiate typed arrays)
  //
  while(this.hasNext()) {
    var meta = this.readShapeMetadata(bin, this.header);
    bin.skipBytes(meta.pointCount * 16);
    // TODO: update to support M and Z types

    shapes.push(meta);
    pointCount += meta.pointCount;
    partCount += meta.partCount;
    shapeCount++;
  }


  // SECOND PASS
  // Read coordinates and other data into buffers
  // TODO (?) Identify polygon holes...
  //

  // Typed arrays tested ~2x faster than new Array(pointCount) in node;
  // 
  var xx = new Float64Array(pointCount);
      yy = new Float64Array(pointCount),
      partIds = new Uint32Array(pointCount),   
      shapeIds = [];

  // Experimental: Adding arrays for part-level data: bounding boxes,
  //   ids of max part in each shape (for shape preservation)
  //
  if (rememberMaxParts) {
    var maxPartFlags = new Uint8Array(partCount);
  }
  if (rememberHoles) {
    var holeFlags = new Uint8Array(partCount);
  }

  var x, y,
    pointId = 0, 
    partId = 0,
    shapeId = 0,
    dataView = bin.dataView(),
    signedPartArea, partArea, maxPartId, maxPartArea;

  for (var shpId=0; shpId < shapes.length; shpId++) {
    var shp = shapes[shpId];
    var offs = shp.coordOffset;
    var partsInShape = shp.partCount;
    for (var i=0; i<partsInShape; i++) {
      shapeIds.push(shapeId);
      partSize = shp.partSizes[i];

      for (var j=0; j<partSize; j++) {
        // DataView at least as fast as Buffer API in nodejs
        x = dataView.getFloat64(offs, true);
        y = dataView.getFloat64(offs + 8, true);
        xx[pointId] = x;
        yy[pointId] = y;
        offs += 16;
        partIds[pointId] = partId;
        pointId++;       
      }

      signedPartArea = msSignedRingArea(xx, yy, pointId - partSize, partSize);

      if (rememberMaxParts) {
        partArea = Math.abs(signedPartArea);
        if (i === 0 || partArea > maxPartArea) {
          if (i > 0) {
            maxPartFlags[maxPartId] = 0;
          }
          maxPartFlags[partId] = 1;
          maxPartId = partId;
          maxPartArea = partArea;
        }
      }

      if (rememberHoles) {
        if (signedPartArea == 0) error("A ring in shape", shapeId, "has zero area or is not closed");
        if (signedPartArea == -1 && partsInShape == 1) error("Shape", shapeId, "only contains a hole");
        holeFlags[partId] = signedPartArea < 0 ? 1 : 0;
      }
      partId++;
    }
    shapeId++;
  }


  this.header.pointCount = pointCount;
  return {
    xx: xx,
    yy: yy,
    partIds: partIds,
    shapeIds: shapeIds,
    header: this.header,
    maxPartFlags: maxPartFlags || null,
    holeFlags: holeFlags || null
  };
};


// Reads Shapefile data from an ArrayBuffer or Buffer
// Converts to format used for identifying topology.
//
MapShaper.importShpFromBuffer = function(buf) {
  return new ShapefileReader(buf).read();
};

// Convert topological data to buffers containing .shp and .shx file data
//
MapShaper.exportShp = function(obj) {
  assert(Utils.isArray(obj.arcs) && Utils.isArray(obj.shapes), "Missing exportable data.");

  var fileBytes = 100;
  var bounds = new BoundingBox();
  var shapeBuffers = Utils.map(obj.shapes, function(shape, i) {
    var shpObj = MapShaper.exportShpRecord(shape, obj.arcs, i+1);
    fileBytes += shpObj.buffer.byteLength;
    shpObj.bounds && bounds.mergeBounds(shpObj.bounds);
    return shpObj.buffer;
  });

  var bufClass = Node.inNode ? Buffer : ArrayBuffer;
  var shpBin = new BinArray(new bufClass(fileBytes), false),
      shpBuf = shpBin.buffer(),
      shxBytes = 100 + shapeBuffers.length * 8
      shxBin = new BinArray(new bufClass(shxBytes), false),
      shxBuf = shxBin.buffer();

  // write .shp header section
  shpBin.writeInt32(9994);
  shpBin.clearBytes(5 * 4);
  shpBin.writeInt32(fileBytes / 2);
  shpBin.littleEndian = true;
  shpBin.writeInt32(1000);
  shpBin.writeInt32(Shapefile.POLYGON);
  shpBin.writeFloat64(bounds.left);
  shpBin.writeFloat64(bounds.bottom);
  shpBin.writeFloat64(bounds.right);
  shpBin.writeFloat64(bounds.top);
  // skip Z & M type bounding boxes;
  shpBin.clearBytes(4 * 8);

  // write .shx header
  shxBin.writeBuffer(shpBuf, 100); // copy .shp header to .shx
  shxBin.dataView().setInt32(24, shxBytes/2, false); // set .shx file size

  // write record sections of .shp and .shx
  Utils.forEach(shapeBuffers, function(buf) {
    shxBin.writeInt32(shpBin.position() / 2);
    //shxBin.writeBuffer(buf, 4, 4); // copy content length from shape record
    shxBin.writeInt32((buf.byteLength - 8) / 2); // copy content length from shape record
    shpBin.writeBuffer(buf);
  });

  return {shp: shpBuf, shx: shxBuf}; // TODO: write shx
};

// Generate an ArrayBuffer containing a Shapefile record for one shape.
//
MapShaper.exportShpRecord = function(shape, arcs, id) {
  var bounds = null,
      buf, view;
  if (!shape || shape.length == 0) {
    buffer = new ArrayBuffer(12)
    view = new DataView(buffer);
    view.setInt32(0, id, false);
    view.setInt32(4, 2, false);
    view.setInt32(8, 0, true);
  } 
  else { // assume polygon record
    var data = MapShaper.convertTopoShape(shape, arcs),
        bounds = data.bounds,
        partsIdx = 5 * 4 + 4 * 8,
        pointsIdx = partsIdx + 4 * data.partCount,
        recordBytes = pointsIdx + 16 * data.pointCount,
        pointCount = 0;

    buffer = new ArrayBuffer(recordBytes);
    view = new DataView(buffer);
    view.setInt32(0, id, false);
    view.setInt32(4, (recordBytes - 8) / 2, false);
    view.setInt32(8, Shapefile.POLYGON, true);
    view.setFloat64(12, bounds.left, true);
    view.setFloat64(20, bounds.bottom, true);
    view.setFloat64(28, bounds.right, true);
    view.setFloat64(36, bounds.top, true);
    view.setInt32(44, data.partCount, true);
    view.setInt32(48, data.pointCount, true);

    Utils.forEach(data.parts, function(part, i) {
      view.setInt32(partsIdx + i * 4, pointCount, true);
      var xx = part[0], yy = part[1];
      for (var j=0, len=xx.length; j<len; j++, pointsIdx += 16) {
        view.setFloat64(pointsIdx, xx[j], true);
        view.setFloat64(pointsIdx + 8, yy[j], true);
      }
      pointCount += j;
    });

    assert(data.pointCount == pointCount, "Shp record point count mismatch; pointCount:", pointCount, "data.pointCount:", data.pointCount)
    assert(pointsIdx == recordBytes, "Shp record bytelen mismatch; pointsIdx:", pointsIdx, "recordBytes:", recordBytes, "pointCount:", pointCount)
  }
  return {bounds: bounds, buffer: buffer};
};



/* requires mapshaper-common, mapshaper-geom */

MapShaper.sortThresholds = function(arr) {
  var thresholds = [];
  var len = arr.length;
  var skipCount = 10; // only use every nth point, for speed
  for (var i=0; i<len; i++) {
    var src = arr[i];
    for (var j=1, maxj=src.length-2; j<=maxj; j+= skipCount) {
      thresholds.push(src[j]);
    }
  }

  Utils.sortNumbers(thresholds, false);
  return thresholds;
};


MapShaper.getThresholdByPct = function(arr, retainedPct) {
  assert(Utils.isArray(arr) && Utils.isNumber(retainedPct), "Invalid argument types; expected [Array], [Number]");
  assert(retainedPct >= 0 && retainedPct < 1, "Invalid pct:", retainedPct);

  var thresholds = MapShaper.sortThresholds(arr);
  var idx = Utils.clamp(Math.round(thresholds.length * retainedPct), 0, thresholds.length);
  return retainedPct >= 1 ? 0 : thresholds[idx];
};


MapShaper.thinArcsByPct = function(arcs, thresholds, retainedPct, opts) {
  assert(Utils.isArray(arcs) && Utils.isArray(thresholds) && arcs.length == thresholds.length
      && Utils.isNumber(retainedPct), "Invalid arguments; expected [Array], [Array], [Number]");
  T.start();
  var thresh = MapShaper.getThresholdByPct(thresholds, retainedPct);
  T.stop("getThresholdByPct()");

  T.start();
  var thinned = MapShaper.thinArcsByInterval(arcs, thresholds, thresh, opts);
  T.stop("Thin arcs");
  return thinned;
};


// Strip interior points from an arc.
// @retained gives the number of interior points to leave in (retains those
//    with the highest thresholds)
//
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


MapShaper.thinArcByInterval = function(xsrc, ysrc, uu, interval, retainedPoints) {
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

  if (xdest.length < retainedPoints + 2) { // minInteriorPoints doesn't include endpoints
    var stripped = MapShaper.stripArc(xsrc, ysrc, uu, retainedPoints);
    xdest = stripped[0];
    ydest = stripped[1];
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


MapShaper.thinArcsByInterval = function(arcs, thresholds, interval, opts) {
  if (!Utils.isArray(arcs) || arcs.length != thresholds.length)
    error("[thinArcsByInterval()] requires matching arrays of arcs and thresholds");
  if (!Utils.isNumber(interval))
    error("[thinArcsByInterval()] requires an interval");

  var retainPoints = !!opts.minPoints;
  if (retainPoints && opts.minPoints.length != arcs.length)
    error("[thinArcsByInterval()] Retained point array doesn't match arc length");

  var thinned = [];
  for (var i=0, l=arcs.length; i<l; i++) {
    var arc = MapShaper.thinArcByInterval(arcs[i][0], arcs[i][1], thresholds[i], interval, retainPoints ? minPoints[i] : 0);
    thinned.push(arc);
  }
  return thinned;
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
  if (opts && opts.spherical) {
    return MapShaper.simplifyArcsSph(arcs, simplify);
  }
  var data = Utils.map(arcs, function(arc) {
    return simplify(arc[0], arc[1]);
  });

  return data;  
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

/* @requires mapshaper-common, core.geo, arrayutils */

//
//

// Strings
// A simple json format for test data
// Examples:
//
/*

{
  "polygons":[
    "2,0 2,2 0,2 0,0 2,0"
  ]

}
    "2,0 2,2 0,2 0,0 2,0"
  ]

  {
    type: "polygon",
    coordinates: [
      "2,0 2,2 0,2 0,0 2,0"
    ]
  }

*/

var Testing = {};

Testing.importTestData = function(obj) {
  var data;
  if (Utils.isString(obj)) {
    obj = JSON.parse(obj);
  }

  if (Utils.isArray(obj)) {
    data = MapShaper.importTestDataPolygons(obj);
  } else if (obj.type == 'polygon' && 'coordinates' in obj) {
    data = MapShaper.importTestDataPolygons(obj.coordinates);
  } else {
    error("[importTestData()] Missing parsable data.");
  }

  return data;
};



Testing.parseStringData = function(arr) {
  var shapeIds = [],
      partIds = [],
      xx = [],
      yy = [],
      shapeId = 0,
      partId = 0;

  var coordRxp = /(-?[\d]+(?:\.[\d]+)?), ?(-?[\d]+(?:\.[\d]+)?))/g;

  Utils.forEach(arr, function(str) {
    var parts = str.split(';');
    Utils.forEach(parts, function(partStr) {
      var match;
      while (match = coordRxp.exec(partStr)) {
        partIds.push(partId);
        xx.push(parseFloat(match[1]));
        yy.push(parseFloat(match[2]));
      }
      shapeIds.push(shapeId);
      partId++;
    });
    shapeId++;
  });
  return {shapeIds: shapeIds, partIds: partIds, xx: xx, yy: yy};
};


// Receive: array of array/s of points
//
//
Testing.generateAsciiDiagram = function(lines) {
  var labelIndex = {},
      left = "//   ",
      pre = "//\n",
      post = "//\n",
      MAX_LINE = "82";

  // get extents
  var bb = new BoundingBox();
  Utils.forEach(lines, function(line) {
    Utils.forEach(line, function(p) {
      bb.mergePoint(p[0], p[1])
    });
  });

  trace(bb);

};



/* @requires mapshaper-common */

MapShaper.exportTopoJSON = function(obj) {

};


MapShaper.importTopoJSON = function(obj) {
  var mx = 1, my = 1, bx = 0, by = 0;
  if (obj.transform) {
    var scale = obj.transform.scale, 
        translate = obj.transform.translate;
    mx = scale[0];
    my = scale[1];
    bx = translate[0];
    by = translate[1];
  }

  var arcs = Utils.map(obj.arcs, function(arc) {
    var xx = [], yy = [];
    for (var i=0, len=arc.length; i<len; i++) {
      var p = arc[i];
      xx.push(p[0] * mx + bx);
      yy.push(p[1] * my + by);
    }
    return [xx, yy];
  });

  return {arcs: arcs, objects: null};
};



/* @requires shapefile-import, arrayutils, mapshaper-common */

// buildArcTopology() converts non-topological polygon data into a topological format
// 
// Input format: 
// {
//    xx: [Array],      // x-coords of each point in the dataset (coords of all shapes are concatenated)
//    yy: [Array],      // y-coords of each point
//    partIds: [Array],   // Part ids of each point (part ids are 0-indexed and consecutive)
//    shapeIds: [Array]   // Shape ids indexed by part id (shape ids are 0-indexed and consecutive)
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
  assert(obj.xx && obj.yy && obj.partIds && obj.shapeIds, "[buildArcTopology()] Missing required param/s");

  var xx = obj.xx, 
      yy = obj.yy,
      partIds = obj.partIds,
      shapeIds = obj.shapeIds,
      pointCount = xx.length,
      partCount = partIds[pointCount-1] + 1,
      shapeCount = shapeIds[shapeIds.length - 1] + 1,
      maxPartFlags = obj.maxPartFlags || null;

  assert(pointCount > 0 && yy.length == pointCount && partIds.length == pointCount, "Mismatched array lengths");
  assert(shapeIds.length == partCount, "[buildArcTopology()] Size mismatch; shapeIds array should match partCount");

  var bbox = MapShaper.calcXYBounds(xx, yy);

  // Create chains of vertices that hash to the same place.
  // (some points in a chain will have identical coords, others represent a hash collision)
  //
  T.start();
  var chainedIds = MapShaper.buildHashChains(xx, yy, partIds, bbox);
  T.stop("Vertex hashing");


  // Loop through all the points in the dataset, identifying arcs.
  //  
  T.start();  
  var arcTable = new ArcTable(xx, yy, bbox),
      inArc = false;

  for (var i=0; i < pointCount; i++) {
    if (pointIsArcEndpoint(i)) {

      // If we're in an arc, then end it.
      if (inArc) {
        if (partIds[i] !== partIds[i-1]) error("Encountered a new ring while building an arc; i:", i, "partId:", partId);
        arcTable.finishArc(i);
      }

      // Start a new arc, if this node is the first point of a new arc.
      // (returns true if node at i starts a new arc)
      inArc = arcTable.newArc(i);
    }
  }
  T.stop("Identifying shared segments.");

  return arcTable.exportData();

  function sameXY(id1, id2) {
    return xx[id1] === xx[id2] && yy[id1] === yy[id2];
  }

  // Tests whether a point is a node (i.e. the endpoint of an arc).
  //
  function pointIsArcEndpoint(id) {
    var isNode = false,
        x = xx[id],
        y = yy[id],    
        partId = partIds[id],
        isPartEndpoint = partId !== partIds[id-1] || partId !== partIds[id+1];
    // trace("partIsArcEndpoint()", id, "x, y:", x, y);

    if (isPartEndpoint) {
      // case -- if point is endpoint of a non-topological ring, then point is a node.
      // TODO: some nodes formed with this rule might be removed if arcs on either side
      //   of the node belong to the same shared boundary.
      //
      isNode = true;
    }
    else {
      // Count number of points with the same (x, y) coords as this point.
      //
      var matchCount = 0,
          nextId = chainedIds[id],
          nextX, nextY,
          matchId, matchPartId;

      while (nextId != id) {
        nextX = xx[nextId];
        nextY = yy[nextId];
        if (nextX == x && nextY == y) {
          matchCount++;
          if (matchCount == 1) {
            // If this point matches only one other point, we'll need the id of 
            //   the matching point.
            matchId = nextId;
          }
        }
        nextId = chainedIds[nextId];
      }

      if (matchCount > 1) {
        // case -- if point matches several other points, then point is a node.
        isNode = true;
      }
      else if (matchCount == 1) {
        // case -- point matches exactly one other point in the dataset
        // TODO: test with edge cases: several identical points clustered together,
        //   case where matching point is on the same ring, etc.
        //         
        // if matching point is an endpoint, then curr point is (also) a node.
        var matchIsPartEndpoint = partIds[matchId] !== partIds[matchId + 1] || partIds[matchId] !== partIds[matchId - 1];
        if (matchIsPartEndpoint) {
          isNode = true;
        }
        // if prev and next points don't match next and prev points on other ring, then point is a node
        else if (!sameXY(id+1, matchId-1) || !sameXY(id-1, matchId+1)) {
          isNode = true;
        }
      }
    }
    return isNode;
  }

  //
  //
  function ArcTable(xx, yy, bb) {
    var numPoints = xx.length,
        hashTableSize = Math.round(numPoints * 0.2),
        hash = MapShaper.getXYHashFunction(bb, hashTableSize),
        hashTable = new Int32Array(hashTableSize),
        typedArrays = !!xx.subarray;

    var buildingArc = false,
        arcStartId = -1;

    Utils.initializeArray(hashTable, -1);
    assert(numPoints > 0 && numPoints == yy.length, "[ArcTable] invalid vertex data.");

    var arcs = [],
        chainIds = [],
        sharedArcs = [],
        parts = [],
        currPartId = -1;

    var maxPartSize,
      maxPartId;

    // End the current arc
    // Receives id of end point
    //
    this.finishArc = function(endId) {
      if (buildingArc == false || arcStartId >= endId || arcStartId < 0) error("[ArcTable.finishArc()] invalid arc index.");

      // Creating subarrays on xx and yy creates many fewer objects for memory
      //   management to track than creating new x and y Array objects for each arc.
      //   With 846MB ZCTA file, gc() time reduced from 580ms to 65ms,
      //   topology time from >26s to ~17s, subsequent processing much faster.
      //   Negligible improvement on smaller files.
      //
      var xarr, yarr, lim = endId + 1;
          if (typedArrays) {
            xarr = xx.subarray(arcStartId, lim),
            yarr = yy.subarray(arcStartId, lim);
          } else {
            xarr = xx.slice(arcStartId, lim),
            yarr = yy.slice(arcStartId, lim);
          }
          
      var arc = [xarr, yarr];

      // Hash the last point in the arc, so this new arc can be found when we
      //   encounter the first point of a matching line-string.
      var x = xx[endId],
          y = yy[endId],
          key = hash(x, y),
          chainId = hashTable[key],
          arcId = arcs.length;

      hashTable[key] = arcId;

      // arc.chainedId = chainedId;
      // pushing chained id onto array instead of 
      // adding as property of arc Array
      chainIds.push(chainId);
      arcs.push(arc);
      buildingArc = false;
      arcStartId = -1;
    };

    // Tests whether the sequence of points starting with point @id matches
    //   the reverse-ordered coordinates of an arc.
    //
    function checkMatch(id, arc) {
      var xarr = arc[0], yarr = arc[1];
      for (var arcId = xarr.length - 1; arcId >= 0; arcId--, id++) {
        if (xarr[arcId] !== xx[id] || yarr[arcId] !== yy[id]) {
          return false;
        }
      }
      return true;
    }
  

    // Try to start a new arc starting with point at @startId.
    // Returns true if a new arc was started.
    // Returns false if the arc matches a previously identified arc or if
    //   the point otherwise does not begin a new arc.
    //
    // @startId Index of an arc endpoint.
    //
    this.newArc = function(startId) {
      if (buildingArc || arcStartId != -1) error("[ArcTable.newArc()] Tried to create a new arc while extending previous arc.");

      var partId = partIds[startId];
      if (partId !== partIds[startId + 1]) {
        // case -- point is the last point in a ring -- no arc
        return false;
      }

      var x = xx[startId],
          y = yy[startId],
          key = hash(x, y),
          chainedArcId = hashTable[key],
          matchId = -1,
          arcId = arcs.length; // anticipating a new arc

      // Check to see if this point is the first point in an arc that matches a 
      //   previously found arc.
      while (chainedArcId != -1) {
        var chainedArc = arcs[chainedArcId];
        if (checkMatch(startId, chainedArc)) {
          matchId = chainedArcId;
          arcId = -1 - chainedArcId;
          break;
        }
        //chainedArcId = prevArc.chainedId;
        chainedArcId = chainIds[chainedArcId];
        // if (chainedArcId == null) error("Arc is missing valid chain id")
      }

      // Add arc id to a topological part
      //
      if (partId !== currPartId) {
        parts[partId] = [arcId];
        currPartId = partId;
      }
      else {
        parts[partId].push(arcId);
      }

      // Start a new arc if we didn't find a matching arc in reversed sequence.
      //
      if (arcId >= 0) {
        buildingArc = true;
        arcStartId = startId;
        sharedArcs[arcId] = 0;
        return true;
      } 
      sharedArcs[matchId] = 1;
      return false;
    };

    // Returns topological data for the entire dataset.
    //
    this.exportData = function() {

      // export shared-arc flags
      if (sharedArcs.length !== arcs.length) error("Shared arc array doesn't match arc count");
      var sharedArcFlags = new Uint8Array(sharedArcs); // convert to typed array to reduce memory mgmt overhead.

      // export retained point data for preventing null shapes
      //
      var arcMinPointCounts = null;
      if (!!maxPartFlags) {
        var arcMinPointCounts = new Uint8Array(arcs.length);
        Utils.forEach(parts, function(part, partId) {
          // calculate minPointCount for each arc
          // (to protect largest part of each shape from collapsing)
          var partLen = part.length;

          // if a part has 3 or more arcs, assume it won't collapse...
          // TODO: look into edge cases where this isn't true

          if (maxPartFlags[partId] == 1 && partLen <= 2) { 
            for (var i=0; i<partLen; i++) {
              var arcId = part[i];
              if (arcId < 1) arcId = -1 - arcId;
              if (partLen == 1) { // one-arc polygon (e.g. island) -- save two interior points
                arcMinPointCounts[arcId] = 2;
              }
              else if (sharedArcFlags[arcId] != 1) {
                arcMinPointCounts[arcId] = 1; // non-shared member of two-arc polygon: save one point
                // TODO: improve the logic here
              }
            }
          }
        });
      }

      // Group topological shape-parts by shape
      var shapes = [];
      Utils.forEach(parts, function(part, partId) {
        var shapeId = shapeIds[partId];
        if (shapeId >= shapes.length) {
          shapes[shapeId] = [part]; // first part in a new shape
        } else {
          shapes[shapeId].push(part);
        }
      });

      return {shapes: shapes, arcs:arcs, arcMinPointCounts: arcMinPointCounts, sharedArcFlags: sharedArcFlags};
    };

  }
};


// Generates a hash function to convert an x,y coordinate into an index in a 
//   hash table.
// @bbox A BoundingBox giving the extent of the dataset.
//
MapShaper.getXYHashFunction = function(bbox, hashTableSize) {
  hashTableSize |= 0;
  if (!bbox.hasBounds() || hashTableSize <= 0) error("Invalid hash function parameters; bbox:", bb, "table size:", hashTableSize);
  var mask = (1 << 29) - 1,
      kx = (1e8 * Math.E / bbox.width()),
      ky = (1e8 * Math.PI / bbox.height()),
      bx = -bbox.left,
      by = -bbox.bottom;

  return function(x, y) {
    // transform coords to integer range and scramble bits a bit
    var key = x * kx + bx;
    key ^= y * ky + by;
    // key ^= Math.PI * 1e9;
    key &= 0x7fffffff; // mask as positive integer
    key %= hashTableSize;
    return key;
  };
};


//
//
MapShaper.buildHashChains = function(xx, yy, partIds, bbox) {
  var pointCount = xx.length,
      hashTableSize = Math.floor(pointCount * 1.6);
  // hash table larger than ~1.5 * point count doesn't improve performance much.

  // Hash table for coordinates; contains the id of the first point in each chain, indexed by hash key
  var hashChainIds = new Int32Array(hashTableSize);
  Utils.initializeArray(hashChainIds, -1);

  // Function to convert x, y coordinates to indexes in hash table.
  var hash = MapShaper.getXYHashFunction(bbox, hashTableSize);

  // Ids of next point in each chain, indexed by point id
  var nextIds = new Int32Array(pointCount);
  // Utils.initializeArray(nextIds, -1);
 
  var key, headId, tailId;

  for (var i=0; i<pointCount; i++) {
    key = hash(xx[i], yy[i]);
    headId = hashChainIds[key];
    // case -- first coordinate in chain: start new chain, point to self
    if (headId == -1) {
      hashChainIds[key] = i;
      nextIds[i] = i;
    }
    // case -- adding to a chain: place new coordinate at end of chain, point it to head of chain to create cycle
    else {
      tailId = headId;
      while (nextIds[tailId] != headId) {
        tailId = nextIds[tailId];
      }
      nextIds[i] = headId;
      nextIds[tailId] = i;
    }
  }
  return nextIds;
};


/* @requires mapshaper-common, mapshaper-geom, mapshaper-heap, core.geo */

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

    // Initialize the heap with thresholds; don't add first and last point
    heap.addValues(values, 1, arcLen-2);
    prevArr[arcLen-1] = arcLen - 2;
    nextArr[0] = 1;

    // Calculate removal thresholds for each internal point in the arc
    //
    var idx, nextIdx, prevIdx;
    var arr = [];
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



/* @requires core, nodejs, mapshaper-* */

var api = Opts.copyAllParams(MapShaper, {
  Node: Node,
  Utils: Utils,
  trace: trace,
  error: error,
  assert: assert,
  T: T,
  BinArray: BinArray,
  DouglasPeucker: DouglasPeucker,
  Visvalingam: Visvalingam
});

if (Node.inNode) {
  module.exports = api;
} else {
  Opts.extendNamespace("mapshaper", api);
}

T.verbose = false; // timing messages off by default (e.g. for testing)

})();
