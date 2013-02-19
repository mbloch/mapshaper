(function(){

var A = this.A || {}; // global application parameters
var C = this.C || {}; // global constants

var Utils = {
  getUniqueName: function(prefix) {
    var ns = Opts.getNamespace("nytg.map");
    var count = ns.__unique || 0;
    ns.__unique = count + 1;
    return (prefix || "__id_") + count;
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
    if (Utils.isArray(src) || src.length) { // try to support arguments object
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

  /**
   * Display string representation of an object. 
   * Functions and some objects are converted into a string label.
   * TODO: Original purpose was to generate console log messages.
   *   Also useful for converting nested objects and arrays to js source
   *   code for embedding into scripts.
   * @param {boolean} validJS Default is 'js'.
   */
  toString: function(obj, validJS) {
    validJS = validJS !== false;
    var str;
    var type = typeof obj;

    if (type == 'function') {
      str = '"[function]"';
    }
    else if (obj === undefined || obj === null) {
      str = String(obj);
      //if (validJS) {
      //  str = "null"; // temporary kludge to output json
      //}
    }
    // else if (Utils.isArray(obj)) {
    else if (Utils.isArray(obj) || obj.byteLength > 0) { // handle typed arrays (with bytelength property)
      str = '[' + Utils.map(obj, function(o) {return Utils.toString(o, validJS);}).join(', ') + ']';
    }
    // Show properties of Object instances.
    else if (obj.constructor == Object) {
      var parts = [];
      for (var key in obj) {
        //parts.push( Utils.toString(key, validJS) + ':' + Utils.toString(obj[key], validJS));
        parts.push( '"' + key + '":' + Utils.toString(obj[key], validJS));
      }
      str = '{' + parts.join(', ') + '}';
    }
    else if (obj.nodeName) {
      var idStr = obj.id ? " id=" + obj.id : "";
      str = '"[' + obj.nodeName + idStr + ']"';
    }
    // User-defined objects without a toString() method: Try to get function name from constructor function.
    // Can't assume objects have hasOwnProperty() function (e.g. HTML nodes don't in ie <= 8)
    else if (type == 'object' && obj.hasOwnProperty && !obj.hasOwnProperty('toString') && !obj.constructor.prototype.hasOwnProperty("toString")) {
      str = '"[' + (Utils.getConstructorName(obj) || "unknown object") + ']"';
    }
    else {  
      // strings, numbers and objects with own "toString" methods. 
      // TODO: make sure that strings made by toString methods are quoted for js.
      str = String(obj);
      if (Utils.isString(obj)) {
        if (validJS) {
          str = '"' + Utils.addslashes(str) + '"';
        }
        else if (str.length > 400) { // Truncate long strings... for console logging.
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

  /**
   * See https://raw.github.com/kvz/phpjs/master/functions/strings/addslashes.js
   */
  addslashes: function(str) {
    return (str + '').replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0');
  }
};



var Opts = {
  copyNewParams : function(targ, src) { return Opts.__copyParams(targ, src, false); },
  copyAllParams : function(targ, src) { return Opts.__copyParams(targ, src, true); },
  updateParams : function(targ, src) { return Opts.__copyParams(targ, src, true, true); },
  /**
   *  // removed this: Warning: this will convert prototypal properties in the src object into own properties in the target.
   */
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
   * Mix in properties with renaming using a lookup table.
   * (To support ADVANCED_COMPILATION with Closure Compiler).
   */
  /*
  copyExternalParams : function(dest, src, table) {
    for (var key in src) {
      var newName = table[key];
      if (newName === undefined) {
        trace("[Opts.copyExternalParams()] Name is missing from parameter table:", key);
      }
      else {
        dest[newName] = src[key];
      }
    }
    return dest;
  }, */

  /**
   * Extends a function's prototype by mixing in objects/functions from a second function.
   */
  extendPrototype : function(targ, src) {
    // Copy src functions/params to targ prototype
    // If there's a collision, retain targ param
    //
    // // If there's a collision, copy original param to __super__
    // // (This is  quick-and-dirty way to override functions and have access
    // //   to the originals, without creating a child class)
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

    //  TODO: assign bound versions of src.prototype methods to f, to support this.__super__.method() syntax
    //  problem: need reference to "this" object, which is not known yet...
    //  
    //  f.methodName = function() {src.prototype.methodName.apply(targ, arguments)};
    //

    f.prototype = src.prototype || src; // added || src to allow inheriting from objects as well as functions
    targ.prototype = new f(); // 
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
  if (typeof Browser != 'undefined') {
    Browser.trace.apply(Browser, arguments);
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


/** @requires events, core */

var Browser = {
  /*
  ie : inBrowser && (function() { 
    var div = document.createElement('div');
    div.innerHTML = '<!--[if gt IE 5]><i></i><![endif]-->'
    return !!div.getElementsByTagName('i')[0];
    }()),

  ieVersion : inBrowser && (function() {
    // TODO: consider alternatives: conditional comments (not in ie10+); feature detection;
    var match = /MSIE ([0-9]+)/.exec(navigator.appVersion);
    return match && parseInt(match[1]) || 0;
    }()),
  */

  getIEVersion: function() {
    return this.ieVersion;
  },
 
  /*getPageWidth : function() {
   return document.documentElement.clientWidth || document.body.clientWidth;
  },*/

  log : function(msg) {
    //if (window.console && window.console.log) {
    if (typeof console != "undefined" && console.log) {
      if (console.log.call) {
        console.log.call(console, msg); // Why this? (forgot)
      }
      else {
        console.log(msg);
      }
    }
  },

  trace : function() {
    var debug = Browser.getQueryVar('debug');
    var enabled = Browser.inNode || Browser.inPhantom || debug != null && debug != "false";
    if (enabled) {
      Browser.log(Utils.map(arguments, Utils.strval).join(' '));
    }
  },
 
  getViewportWidth : function() {
   // return document.documentElement.clientWidth || document.body.clientWidth;
    return document.documentElement.clientWidth;
  },

  getViewportHeight : function() {
    return document.documentElement.clientHeight;
  },

  /* // TODO: implement this
  getViewportWidth : function() {
  }, */
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

  // TODO: also consider clientTop?
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
  
  /*
  getViewportXY : function(el) {
    var xy = Browser.getPageXY(el);
    var dx = window.pageXOffset || document.body.scrollTop || 0;
    var dy = window.pageYOffset || document.body.scrollLeft || 0;
    xy.x += dx;
    xy.y += dy;
    return xy;
    // w3: window.pageXOffset window.pageYOffset // ie: document.body.scrollLeft document.body.scrollTop
  },
  */

  _nodeIndex : {},

  __findNodeListener : function(listeners, type, func, ctx) {
    for (var i=0, len = listeners.length; i < len; i++) {
      var evt = listeners[i];
      if (evt.type == type && evt.callback == func && evt.context == ctx) {
        return i;
      }
    }
    return -1;
  },

  __touchSubs : {
   // 'move': 
  },

  __validateEventType : function(type) {
    if ('move,down,up'.indexOf(type) != -1) {
      
    }
    return type;
  },

  /**
   *  Add a DOM event handler.
   */
  addEventListener : function(el, type, func, ctx) {
    if (Utils.isString(el)) { // if el is a string, treat as id
      el = Browser.getElement(el);
    }
    if (el === window && 'mousemove,mousedown,mouseup,mouseover,mouseout'.indexOf(type) != -1) {
      trace("[Browser.addEventListener()] In ie8-, window doesn't support mouse events");
    }
    // function BoundEvent(type, target, callback, context, priority)
    var listeners = this.__getNodeListeners(el);
    if (listeners.length > 0) {
      if (this.__findNodeListener(listeners, type, func, ctx) != -1) {
        //trace("[Browser.addEventListener()] event already added; skipping.");
        return;
      }
    }

    var evt = new BoundEvent(type, el, func, ctx);
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

    if (this.ieEvents) {
      el.attachEvent('on' + type, handler);
    }
    else {
      el.addEventListener(type, handler, false);
    }
  },

  /**
   *  Remove a DOM event handler.
   */
  removeEventListener : function(el, type, func, ctx) {
    var listeners = this.__getNodeListeners(el);
    var idx = this.__findNodeListener(listeners, type, func, ctx);
    if (idx == -1) {
      trace("[Browser.removeEventListener()] Event not found; ignoring.");
      return;
    }
    var evt = listeners[idx];
    this.__removeDOMListener(el, type, evt.handler);
    listeners.splice(idx, 1);
  },

  __getNodeKey : function(el) {
    if (!el) {
      return '';
    }
    else if (el == window) {
      return '#';
    }
    return el.__evtid__ || (el.__evtid__ = Utils.getUniqueName());
  },

  __getNodeListeners : function(el) {
    var id = this.__getNodeKey(el);
    var index = this._nodeIndex;
    var listeners = index[id] || (index[id] = []);
    return listeners;
  },

  __removeDOMListener : function(el, type, func) {
    if (this.ieEvents) {
      el.detachEvent('on' + type, func);
    }
    else {
      el.removeEventListener(type, func, false);
    }
  },

  /**
   * 
   */
  removeEventListeners : function(el) {
    var listeners = this.__getNodeListeners(el);
    for (var i=0, len=listeners.length; i<len; i++) {
      var evt = listeners[i];
      this.__removeDOMListener(el, evt.type, evt.handler);
    }
    delete this._nodeIndex[this.__getNodeKey(el)];
  },

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

  parseUrl : function parseUrl(url) {
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
      trace("[Browser.parseUrl()] unable to parse:", url);
    }
    return obj;
  },

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

Browser.on = Browser.addEventListener; // on() an alias for addEventListener()
Browser.onload = function(handler, ctx) {
  Browser.on(window, 'load', handler, ctx); // handles case when page is already loaded.
};

/*
var inNode;
var inPhantom;
var inBrowser;
*/

var Environment = (function() {
  var inNode = typeof module !== 'undefined' && !!module.exports;
  var inPhantom = !inNode && !!(window.phantom && window.phantom.exit);
  var inBrowser = !inNode; // phantom?
  var ieVersion = inBrowser && /MSIE ([0-9]+)/.exec(navigator.appVersion) && parseInt(RegExp.$1) || NaN;

  var env = {
    iPhone : inBrowser && !!(navigator.userAgent.match(/iPhone/i)),
    iPad : inBrowser && !!(navigator.userAgent.match(/iPad/i)),
    ieEvents : inBrowser && !!window.attachEvent && !window.addEventListener,
    touchEnabled : inBrowser && ("ontouchstart" in window),
    //canvas : inBrowser && !!document.createElement('canvas').getContext,
    canvas: inBrowser && !!Browser.createElement('canvas').getContext,
    inNode : inNode,
    inPhantom : inPhantom,
    inBrowser: inBrowser,
    ieVersion: ieVersion,
    ie: !isNaN(ieVersion)
  }

  // Add Environment properties to Browser (legacy support)
  Opts.copyAllParams(Browser, env);  
  
  return env;
})();



/**
 * Other files in the node/ directory add functionality to Node object.
 */
var inNode = typeof module !== 'undefined' && !!module.exports;
var Node = {
  // TODO: remove redundancy w/ browser.js
  inNode: inNode,
  arguments: inNode ? process.argv.slice(1) : null // remove "node" from head of argv list
};


/**
 * Convenience functions for reading files and loading data.
 */
if (inNode) {
  Node.fs = require('fs'); // for local filesystem access

  Node.gc = function() {
    global.gc && global.gc();
  };

  Node.fileExists = function(fpath) {
    var exists = false;
    try {
      var stats = Node.fs.statSync(fpath);
      exists = stats.isFile();    
    } 
    catch(e) {
      trace(e);
    }

    return exists;
  };



  Node.getFileInfo = function(fpath) {
    var path = require('path');
    var info = {
      exists: Node.fileExists(fpath)
    }

    if (info.exists) {
      info.file = path.basename(fpath);
      info.path = path.resolve(fpath);
      info.ext = path.extname(fpath).toLowerCase().slice(1);
      info.base = info.ext.length > 0 ? info.file.slice(0, -info.ext.length - 1) : info.file;
      info.directory = path.dirname(info.path);
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
      /*
      // convert Node.js Buffer to ArrayBuffer
      if (content instanceof Buffer) {
        var buf = content;
        content = new ArrayBuffer(buf.length);
        var view = new Uint8Array(content);
        for (var i = 0; i < buf.length; ++i) {
          view[i] = buf[i];
        }
      }
      */
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
}

function NodeUrlLoader(url) {
  var self = this,
    body = "",
    output,
    opts = Browser.parseUrl(url);
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

  //return data;
}

Opts.inherit(NodeUrlLoader, Waiter);

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

/*
Utils.getValues = function(obj) {
  var arr = [];
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      arr.push(obj[key]);
    }
  }
  return arr;
};
*/

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

function BinArray(buf, le) {
  assert(buf instanceof ArrayBuffer || buf instanceof Buffer, "[BinArray()] requires ArrayBuffer or Buffer object");

  this._buffer = buf;
  // this._length = buf.byteLength;
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

  /*
  read: function(func) {
    var retn = func(this._view, this._idx);
    if (retn > 0) {
      this._idx = retn;
    }
  },


  extendXYArrays: function(len, xx, yy) {
    for (var i=0; i<len; i++) {
      xx.push(this.getFloat64());
      yy.push(this.getFloat64());
    }
  } */
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
/* @requires nodejs, polygons, events, shapefile, shapes, textutils, data, dbf-import, dataview */

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


/* @requires arrayutils, core.geo */

var MapShaper = {};

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
  var thresh = retainedPct >= 1 ? 0 : thresholds[idx];
  return thresh;
};

MapShaper.thinArcsByPct = function(arcs, thresholds, retainedPct) {
  assert(Utils.isArray(arcs) && Utils.isArray(thresholds) && arcs.length == thresholds.length && Utils.isNumber(retainedPct), "Invalid arguments; expected [Array], [Array], [Number]");
  T.start();
  var thresh = MapShaper.getThresholdByPct(thresholds, retainedPct);
  T.stop("getThresholdByPct()");

  T.start();
  var thinned = MapShaper.thinArcsByThreshold(arcs, thresholds, thresh);
  T.stop("thin arcs");
  return thinned;
};

MapShaper.thinArcsByThreshold = function(arcs, thresholds, thresh) {
  assert(Utils.isArray(arcs) && Utils.isArray(thresholds) && arcs.length == thresholds.length && Utils.isNumber(thresh), "Invalid arguments; expected [Array], [Array], [Number]");
  var arcs2 = [],
    originalPoints = 0,
    thinnedPoints = 0;

  for (var i=0, l=arcs.length; i<l; i++) {
    var arc = arcs[i],
      xsrc = arc[0],
      ysrc = arc[1],
      zz = thresholds[i],
      len = zz.length,
      xdest = [],
      ydest = [];

    (xsrc.length == len && ysrc.length == len && len > 1) || error("[thinArcsByThreshold()] Invalid arc len:", len);

    for (var j=0; j<len; j++) {
      originalPoints++;
      if (zz[j] >= thresh) {
        xdest.push(xsrc[j]);
        ydest.push(ysrc[j]);
        thinnedPoints++;
      }
    }

    // remove island rings that have collapsed (i.e. fewer than 4 points)
    //
    var len2 = xdest.length;
    if (len2 < 4 && xdest[0] == xdest[len2-1] && ydest[0] == ydest[len2-1]) {
      xdest = [];
      ydest = [];
    }

    arcs2.push([xdest, ydest]);
  }

  // trace("[thinArcsByThreshold()] thinned:", thinnedPoints, "original:", originalPoints);

  return arcs2;
};



MapShaper.getExportMetadata = function(obj) {
  var nulls = 0,
      points = 0,
      parts = 0,
      arcs = obj.arcs;

  Utils.forEach(obj.shapes, function(shape) {
    if (!shape || shape.length == 0) {
      nulls++;
    }
    else {
      for (var i=0; i<shape.length; i++) {
        var part = shape[i];
        for (var j=0; j<part.length; j++) {
          var arcId = part[j];
          //trace("arc:", arcId);
          if (arcId < 0) arcId = -1 - arcId;
          var arc = arcs[arcId];
          if (arc.length < 1) error("Defective arc.");
          points += arc[0].length - 1;
        }
        points++; // one extra point per ring
        parts++;
      }
    }
  });

  return {nullCount: nulls, pointCount: points, shapeCount: obj.shapes.length, partCount: parts};
};

MapShaper.importFromFile = function(fname) {
  var info = Node.getFileInfo(fname);
  assert(info.exists, "File not found.");
  assert(info.ext == 'shp' || info.ext == 'json', "Expected *.shp or *.json file; found:", fname);

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

MapShaper.calcBounds = function(xx, yy, bb) {
  if (!bb) bb = new BoundingBox();
  var xbounds = Utils.getArrayBounds(xx),
      ybounds = Utils.getArrayBounds(yy);
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
}

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
      MapShaper.calcBounds(xx, yy, bounds);
    }
  }

  return {parts: parts, bounds: bounds, pointCount: pointCount, partCount: parts.length};
};


/*
MapShaper.appendArcToPointArray = function(points, xx, yy, reversed) {
  var len=xx.length;
  (!len || len < 2) && error("[MapShaper.appendArcToPointArray()] invalid arc length:", len);
  if (reversed) {
    var inc = -1;
    var startId = len - 1;
    var stopId = -1;
  } else {
    inc = 1;
    startId = 0;
    stopId = len;
  }

  if (points.length > 0) {
    startId += inc; // skip first point of arc if ring has been started
  }

  for (var i=startId; i!=stopId; i+=inc) {
    points.push([xx[i], yy[i]]);
  }
};

MapShaper.exportShapeData = function(shape, arcs, bb) {
  var reversed, arcId;
  var rings = [];

  for (var i=0; i<shape.length; i++) {
    var points = [];
    var part = shape[i];
    for (var j=0; j<part.length; j++) {
      arcId = part[j];
      reversed = false;
      if (arcId < 0) {
        arcId = -1 - arcId;
        reversed = true;
      }
      //assert(!!arcs, "Missing arcs param:", arcs);
      //assert(arcId > 0 && arcId < arcs.length, "Out-of-bounds arc id; arcs:", arcs.length, "id:", arcId);
      //assert(arcId in arcs, "Missing arc id:", arcId);
      var arc = arcs[arcId],
          xx = arc[0],
          yy = arc[1];
      // assert(arc[0].length > 1, "Invalid arc length:", arc[0].length, "arcId:", arcId);
      if (arc[0].length > 1) {
        MapShaper.appendArcToPointArray(points, xx, yy, reversed);
        if (bb) {
          var xbounds = Utils.getArrayBounds(xx),
            ybounds = Utils.getArrayBounds(yy);
          bb.mergePoint(xbounds[0], ybounds[0]);
          bb.mergePoint(xbounds[1], ybounds[1]);
        }
      }

    }
    if (points.length > 0) {
      rings.push(points);
    }
  }

  return rings;
};

*/
/* @requires shapefile-import, arrayutils, mapshaper-common */



MapShaper.importJSON = function(obj) {
  if (obj.type == "Topology") {
    error("TODO: TopoJSON import.")
    return MapShaper.importTopoJSON(obj);
  }
  return MapShaper.importGeoJSON(obj);
};

MapShaper.importKML = function(obj) {
  error("TODO: KML import.")
}

MapShaper.importGeoJSON = function(obj) {

};

MapShaper.importTopoJSON = function(obj) {
  var mx = 1, my = 1, bx = 0, by = 0;
  if (obj.transform) {
    var scale = obj.transform.scale, translate = obj.transform.translate;
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

  return obj;
};

/*
MapShaper.importShpFromFile = function(fname) {
  assert(Node.fileExists(fname), "Missing file:", fname);
  var buf = Node.readFile(fname);
  return MapShaper.importShpFromBuffer(buf);
};
*/




MapShaper.evaluateHashDistribution = function(binCounts) {
  var tallyObj = {};
  Utils.forEach(binCounts, function(el) {
    tallyObj[el] = tallyObj[el] ? tallyObj[el] + 1 : 1;
  });
  trace("*** hash bin counts ***")
  trace(tallyObj);
};

MapShaper.getXYHashFunction = function(bb, hashTableSize) {
  assert(bb.hasBounds() && hashTableSize > 0, "Invalid hash function parameters; bbox:", bb, "table size:", hashTableSize);
  // Make hash function
  var kx = hashTableSize * 171 / bb.width();
  var ky = hashTableSize * 30269 / bb.height();
  var bx = -bb.left;
  var by = -bb.bottom;
  var hash = function(x, y) {
    var key = (((x + bx) * kx + (y + by) * ky) % hashTableSize) | 0;
    return key;
  };
  return hash;
}


MapShaper.getArcTopology = function(obj) {
  Node.gc(); // try to free up file buffer

  assert(obj.xx && obj.yy && obj.partIds && obj.shapeIds, "[getArcMapShaper()] Missing required param/s");
  var xx = obj.xx, yy = obj.yy, partIds = obj.partIds, shapeIds = obj.shapeIds;
  var pointCount = xx.length;
  assert(pointCount > 0 && yy.length == pointCount && partIds.length == pointCount, "Mismatch lengths; xx.length:", pointCount);

  var xbounds = Utils.getArrayBounds(xx);
  var ybounds = Utils.getArrayBounds(yy);
  assert(xbounds.nan == 0 && ybounds.nan == 0, "Data contains NaN; xbounds:", xbounds, "ybounds:", ybounds);

  var hashTableSize = Math.floor(pointCount * 1.5);

  var partCount = partIds[pointCount-1] + 1;
  assert(shapeIds.length == partCount, "[getArcMapShaper()] Size mismatch; shapeIds array should match partCount");

  var shapeCount = shapeIds[shapeIds.length - 1] + 1;

  var bbox = new BoundingBox().setBounds(xbounds.min, ybounds.max, xbounds.max, ybounds.min);
  var hash = MapShaper.getXYHashFunction(bbox, hashTableSize);

  // Ids of first point in each chain
  var hashChainIds = new Int32Array(hashTableSize);  // id of first point in chain
  Utils.initializeArray(hashChainIds, -1);

  // Ids of next point in each chain (-1 indicates end of chain)
  var chainedIds = new Int32Array(pointCount);  // id of next id in chain
  Utils.initializeArray(chainedIds, -1); // TODO: don't need to initialize if circular


  // FIRST PASS
  // Use a hash table to create chains of vertices with the same hash key
  // Also check for some MapShaper problems
  //
  var headId, x, y, partId;
  var nextX = xx[0], nextY = yy[0];
  var prevPartId = -1;
  for (var i=0; i<pointCount; i++) {
    // var key = hash(xx[i], yy[i]); 
    x = nextX;
    y = nextY;
    nextX = xx[i+1];
    nextY = yy[i+1];

    partId = partIds[i];
    var firstInPart = partId != prevPartId;

    var key = hash(x, y);
    var headId = hashChainIds[key];

    // case -- first coordinate in chain: start new chain, point to self
    if (headId == -1) {
      hashChainIds[key] = i;
      chainedIds[i] = i;
    }
    // case -- adding to a chain: place new coordinate at end of chain, point it to head of chain to create cycle
    // 
    else {
      var tailId = headId;
      while (chainedIds[tailId] != headId) {
        tailId = chainedIds[tailId];
      }
      chainedIds[i] = headId;
      chainedIds[tailId] = i;
    }
    prevPartId = partId;
  }

  // hashChainIds = null; // hash table no longer needed
  // Node.gc();  // not worth trying to reclaim this memory here...

  //MapShaper.evaluateHashDistribution(hashBinCounts);

  //  SECOND PASS: identify nodes and arcs
  //
  var nodeCount = 0;
  var pointInfo = new PointInfo();

  // init arc table
  var arcHashSize = Math.round(pointCount * 0.2);
  var arcTable = new ArcTable(xx, yy, bbox, arcHashSize);
  var currArc;
  
  for (var i=0; i < pointCount; i++) {
    pointInfo.setId(i);

    if (pointInfo.isNode) {
      nodeCount++;

      if (currArc && pointInfo.firstInPart == false) {
        currArc.done(i);
        currArc = null;
      }

      var partId = partIds[i];
     
      if (pointInfo.lastInPart === false) {
        currArc = arcTable.newArc(i, partId);
      }

    }
  }

  /*
  trace(">>> nodes:", nodeCount);
  trace("points:", pointCount, "parts:", partCount, "shapes:", shapeCount);
  trace( ">>>> arcs:", arcTable.size());
  */

  // extract data
  //
  // T.start();
  var retn = arcTable.exportData();
  // T.stop("exportData()");

  return retn;

  function ArcTable(xx, yy, bb, hashTableSize) {
    var numPoints = xx.length;
    hashTableSize = Math.round(hashTableSize || numPoints * 0.2);
    var hash = MapShaper.getXYHashFunction(bb, hashTableSize);
    // trace(">>>> ArcTable hash; bb:", bb, "table size:", hashTableSize);

    assert(numPoints > 0 && numPoints == yy.length, "[ArcTable] invalid vertex data.");

    var hashTable = new Int32Array(hashTableSize);
    Utils.initializeArray(hashTable, -1);

    var arcs = [];
    var parts = [];
    var shapes = [];
    var currPartId = -1;

    function Arc(startId) {
      this.startId = startId;
      this.length = 0;
      this.chainedId = -1;
    }
    /**
     * Returning separate xx and yy arrays instead of [x,y] points
     *   (Improved export time from 2400ms to 750ms for 75MB states layer in nodejs)
     *
     */
    Arc.prototype.getPoints = function() {
      //var xarr = new Float64Array(len); // no performance benefit in nodejs
      //var yarr = new Float64Array(len);
      var xarr = [],
        yarr = [];
      for (var i=0, len=this.length; i<len; i++) {
        xarr[i] = xx[i+this.startId];
        yarr[i] = yy[i+this.startId];
      }

      return [xarr, yarr];
    };

    Arc.prototype.done = function(endId) {
      this.length = endId - this.startId + 1;
      var x = xx[endId];
      var y = yy[endId];
      var key = hash(x, y);


      var arcId = arcs.length;

      arcs.push(this);

      if (hashTable[key] != -1) {
        this.chainedId = hashTable[key];
      }
      hashTable[key] = arcId;
    };

    Arc.prototype.checkMatch = function(thatId) {
      // assert(_length > 1, "[Arc.checkMatch()] comparing an incomplete Arc");

      for (var thisId = this.startId + this.length - 1; thisId >= this.startId; thisId--, thatId++) {
        if (xx[thisId] !== xx[thatId] || yy[thisId] !== yy[thatId]) {
          return false;
        }
      }
      return true;
    };
  

    this.newArc = function(startId, partId) {
      // check if this arc has been hashed...
      var x = xx[startId];
      var y = yy[startId];
      var key = hash(x, y);
      var newArcId = arcs.length;

      var chainedArcId = hashTable[key];
      while (chainedArcId != -1) {
        var currArc = arcs[chainedArcId];
        if (currArc.checkMatch(startId)) {
          newArcId = -1 - chainedArcId;
          // trace("[newArc] inverted match; id:", chainedArcId)
          break;
        }
        chainedArcId = currArc.chainedId;
      }

      var part, shape;
      if (partId != currPartId) {
        currPartId = partId;
        part = parts[partId] = [];
        // var shapeId = shapeIds[i];
        var shapeId = shapeIds[partId];
        var shape = shapes[shapeId] || (shapes[shapeId] = []);
        shape.push(part);
      }
      else {
        part = parts[partId];
      }

      part.push(newArcId);

      return newArcId < 0 ? null : new Arc(startId);
    };

    this.size = function() {
      return arcs.length;
    }

    this.exportData = function() {
      var arcCoords = [];
      // export arcs as arrays of points
      //
      for (var arcId = 0, len=arcs.length; arcId < len; arcId++) {
        var arc = arcs[arcId];
        arcCoords.push(arc.getPoints());
      }

      return {shapes: shapes, arcs:arcCoords};
    };
  }


  function PointInfo() {

    var _id, _x, _y;

    this.setId = function(id) {
      _id = id;
      _x = xx[id];
      _y = yy[id];

      this.partId = partIds[id];
      this.shapeId = shapeIds[id];
      this.sharedPartId = -1; // part id of other part, if sharedPoints == 1
      this.sharedShapeId = -1; // part id of other shape, if sharedPoints == 1

      // var hashKey = hashBinIds[id];
      var chainCount = 0;
      var sharedCount = 0;
      var sharedId, sharedPartId, sharedShapeId;
      var nextId = chainedIds[id];
      // while (nextId != -1) {
      while (nextId != id) {
        chainCount++;
        if (chainCount > 2000) {
          error("Chain overflow, id:", id, "hashKey:", hashKey, "tableSize:", hashTableSize);
        }

        var nextX = xx[nextId];
        var nextY = yy[nextId];
        if (nextX === _x && nextY === _y) {
          sharedCount++;
          if (sharedCount == 1) {
            sharedId = nextId;
          } 
        }
        nextId = chainedIds[nextId];
      }

      // is this point an endpoint
      //
      var firstInPart = partIds[id-1] !== this.partId;
      var lastInPart = partIds[id+1] !== this.partId;
      var isEndpoint = firstInPart || lastInPart; 

      // is this point a node?
      //
      var isNode = isEndpoint; // all endpoints are nodes
      if (isEndpoint == false) {
        if (sharedCount > 1) {
          isNode = true;
        } 
        else if (sharedCount == 1) {
          var otherPartId = partIds[sharedId];
          // if opposite point is not an endpoint, then not a node...
          if (otherPartId !== partIds[sharedId + 1] || otherPartId !== partIds[sharedId - 1]) {
            trace(">>> otherPartId:", otherPartId, "+1", partIds[sharedId + 1], "-1", partIds[sharedId - 1]);
            isNode = true;
          }
        }
      }

      this.isNode = isNode;
      this.sharedPoints = sharedCount;
      this.firstInPart = firstInPart;
      this.lastInPart = lastInPart;
      this.isEndpoint = isEndpoint;
      // trace(">> shared:", sharedCount, "chainCount:", chainCount, "endpoint:", isEndpoint);
    };

  }
}





/* @requires arrayutils, mapshaper-common */

var DouglasPeucker = {};
var LIMIT_VALUE = Infinity;
var MAX_ERROR = Number.MAX_VALUE;

DouglasPeucker.simplifyArcs = function(arcs, opts) {
  if (opts && opts.spherical) {
    return DouglasPeucker.simplifyArcsSph(arcs);
  }
  var data = Utils.map(arcs, function(arc) {
    return DouglasPeucker.calcArcData(arc[0], arc[1]);
  });
  // trace(">> dp calls / ms:", dpSegCount / ms);
  // trace(">> dp triangles / ms:", dpDistCount / ms);
  return data;
};

DouglasPeucker.simplifyArcsSph = function(arcs) {
  var bufSize = 0,
      xx, yy, zz; // buffers for x, y, z coords

  var data = Utils.map(arcs, function(arc) {
    var arcLen = arc[0].length;
    if (bufSize < arcLen) {
      bufSize = arcLen * 1.2;
      xx = new Float64Array(bufSize);
      yy = new Float64Array(bufSize);
      zz = new Float64Array(bufSize);
    }

    DouglasPeucker.calcXYZ(arc[0], arc[1], xx, yy, zz);
    var arr = DouglasPeucker.calcArcData(xx, yy, zz);
    // trace("3d:", arr);
    // trace("2d:", DouglasPeucker.calcArcData(arc[0], arc[1]));
    // error('STOP');
    return arr;
  });
  return data;
};

// Convert arrays of lng and lat coords (xsrc, ysrc) into 
// x, y, z coords on the surface of a sphere with radius == 1
//
DouglasPeucker.calcXYZ = function(xsrc, ysrc, xbuf, ybuf, zbuf) {
  var deg2rad = Math.PI / 180;
  for (var i=0, len=xsrc.length; i<len; i++) {
    var theta = xsrc[i] * deg2rad,
        lat = ysrc[i],
        phi = (lat > 0 ? 90 - lat : -90 - lat) * deg2rad;
        sinPhi = Math.sin(phi);

    xbuf[i] = sinPhi * Math.cos(theta);
    ybuf[i] = sinPhi * Math.sin(theta);
    zbuf[i] = Math.cos(phi);
  }
}

DouglasPeucker.getDistanceSq3D = function(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var dist2,
    ab2 = (ax - bx) * (ax - bx) + (ay - by) * (ay - by) + (az - bz) * (az - bz),
    ac2 = (ax - cx) * (ax - cx) + (ay - cy) * (ay - cy) + (az - cz) * (az - cz),
    bc2 = (bx - cx) * (bx - cx) + (by - cy) * (by - cy) + (bz - cz) * (bz - cz);

  if ( ac2 == 0.0 ) {
    dist2 = ab2;
  }
  else if ( ab2 >= bc2 + ac2 ) {
    dist2 = bc2;
  }
  else if ( bc2 >= ab2 + ac2 ) {
    dist2 = ab2;
  }
  else {
    var dval = ( ab2 + ac2 - bc2 );
    dist2 = ab2 -  dval * dval / ac2  * 0.25 ;
  }

  if ( dist2<0.0 ) {
    dist2 = 0.0;
  }

  return dist2;
};

DouglasPeucker.getDistanceSq = function(ax, ay, bx, by, cx, cy) {
  var ab2 = (ax - bx) * (ax - bx) + (ay - by) * (ay - by),
      ac2 = (ax - cx) * (ax - cx) + (ay - cy) * (ay - cy),
      bc2 = (bx - cx) * (bx - cx) + (by - cy) * (by - cy),
      dist2;

  if ( ac2 === 0 ) { // if first and last points are same, avoid div/0
    dist2 = ab2;
  }
  else if ( ab2 >= bc2 + ac2 ) {
    dist2 = bc2;
  }
  else if ( bc2 >= ab2 + ac2 ) {
    dist2 = ab2;
  }
  else {
    var dval = ( ab2 + ac2 - bc2 );
    dist2 = ab2 -  dval * dval / ac2  * 0.25 ;
  }

  if (dist2 < 0) {
    dist2 = 0;
  }

  return dist2;
};


var dpDistCount = 0;
var dpSegCount = 0;
DouglasPeucker.calcArcData = function(xx, yy, zz) {
  var len = xx.length,
      useZ = !!zz;
  // assert(len > 1, "Arc length must be 2 or greater");

  var dpArr = new Array(len); // new Float64Array(len);
  Utils.initializeArray(dpArr, 0);

  dpArr[0] = dpArr[len-1] = LIMIT_VALUE;

  if (len > 2) {
    procSegment(0, len-1, 1, MAX_ERROR);
  }

  function procSegment(startIdx, endIdx, depth, lastDistance) {
    dpSegCount++;
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
      dpDistCount++;
      if (useZ) {
        thisDistance = DouglasPeucker.getDistanceSq3D(ax, ay, az, xx[i], yy[i], zz[i], cx, cy, cz);
      } else {
        thisDistance = DouglasPeucker.getDistanceSq(ax, ay, xx[i], yy[i], cx, cy);
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
      // case: arc is an island polygon
      if (ax == cx && ay == cy) { 
        maxDistance = lval > rval ? lval : rval;
      }
    }

    var dist = Math.sqrt(maxDistance);
    if (useZ) {
      dist = dist * 180 / Math.PI;
    }
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

  // assert(dpArr.length == xx.length, "Length of DouglasPeucker threshold array doesn't match coordinate arrays.");
  // assert(dpArr[0] == LIMIT_VALUE && dpArr[len - 1] == LIMIT_VALUE, "DouglasPeucker endpoint value/s have changed; dp array:", dpArr);

  return dpArr;

};
/* @requires mapshaper-common, core.geo */

var Visvalingam = {};

Visvalingam.simplifyArcs = function(arcs, opts) {
  metric = opts && opts.metric || Visvalingam.standardMetric;
  var calculator = new VisvalingamCalculator(metric);
  var data = Utils.map(arcs, function(arc, i) {
    var thresholds = calculator.calcArcData(arc[0], arc[1]);
    assert(thresholds.length == arc[0].length);
    return thresholds;
  });
  return data;
};

// Calc area of triangle given coords of three vertices.
//
function calcTriangleArea(ax, ay, bx, by, cx, cy) {
  var area = ((ay - cy) * (bx - cx) + (by - cy) * (cx - ax)) / 2;
  return Math.abs(area);
}

// Calc angle in radians given three coordinates with (bx,by) at the vertex.
//
function calcInnerAngle(ax, ay, bx, by, cx, cy) {
  var a1 = Math.atan2(ay - by, ax - bx);
  var a2 = Math.atan2(cy - by, cx - bx);
  var a3 = Math.abs(a1 - a2);
  if (a3 > Math.PI) {
    a3 = 2 * Math.PI - a3;
  }
  return a3;
}

Visvalingam.standardMetric = calcTriangleArea;


// The original mapshaper "modified Visvalingam" function uses a step function to 
// underweight more acute triangles.
//
Visvalingam.specialMetric = function(ax, ay, bx, by, cx, cy) {
  var area = calcTriangleArea(ax, ay, bx, by, cx, cy),
      angle = calcInnerAngle(ax, ay, bx, by, cx, cy),
      weight = angle < 0.5 ? 0.1 : angle < 1 ? 0.3 : 1;
  return area * weight;
};

Visvalingam.specialMetric2 = function(ax, ay, bx, by, cx, cy) {
  var area = calcTriangleArea(ax, ay, bx, by, cx, cy),
      standardLen = area * 1.4,
      hyp = Math.sqrt((ax + cx) * (ax + cx) + (ay + cy) * (ay + cy)),
      weight = hyp / standardLen;
  return area * weight;
};



function VisvalingamCalculator(metric) {
  var bufLen = 0,
      heap = new VisvalingamHeap(),
      prevArr, nextArr;

  this.calcArcData = function(xx, yy) {
    var arcLen = xx.length;
    if (arcLen > bufLen) {
      bufLen = Math.round(arcLen * 1.2);
      prevArr = new Int32Array(bufLen);
      nextArr = new Int32Array(bufLen);
    }

    heap.init(arcLen);

    // Initialize "effective area" values and references to prev/next points for each point in arc.
    for (var i=1; i<arcLen-1; i++) {
      heap.addValue(i, metric(xx[i-1], yy[i-1], xx[i], yy[i], xx[i+1], yy[i+1]));
      nextArr[i] = i + 1;
      prevArr[i] = i - 1;
    }
    prevArr[arcLen-1] = arcLen - 2;
    nextArr[0] = 1;

    // 
    var idx, nextIdx, prevIdx, area;
    while(heap.size() > 0) {
      idx = heap.pop();
      if (idx < 1 || idx > arcLen - 2) {
        error("Popped first or last arc vertex (error condition); idx:", idx, "len:", len);
      }

      prevIdx = prevArr[idx];
      if (prevIdx > 0) {
        area = metric(xx[idx], yy[idx], xx[prevIdx], yy[prevIdx], xx[prevArr[prevIdx]], yy[prevArr[prevIdx]]);
        heap.updateValue(prevIdx, area);
      }

      nextIdx = nextArr[idx];
      if (nextIdx < arcLen-1) {
        area = metric(xx[idx], yy[idx], xx[nextIdx], yy[nextIdx], xx[nextArr[nextIdx]], yy[nextArr[nextIdx]]);
        heap.updateValue(nextIdx, area);
      }

      nextArr[prevIdx] = nextIdx;
      prevArr[nextIdx] = prevIdx;
    }

    return heap.values();
  };
}


function VisvalingamHeap() {
  var capacity = 0,
      initSize = 0,
      itemsInHeap = 0,
      poppedVal = 0,
      heapArr, indexArr, valueArr;

  this.init = function(size) {
    if (size > capacity) {
      capacity = Math.round(size * 1.2);
      heapArr = new Int32Array(capacity);
      indexArr = new Int32Array(capacity);
    }
    itemsInHeap = 0;
    valueArr = new Float64Array(size);
    valueArr[0] = valueArr[size-1] = Infinity;
    initSize = size;
  };

  // Add an item to the bottom of the heap and restore heap order.
  //
  this.addValue = function(valIdx, val) {
    var heapIdx = itemsInHeap++;
    assert(itemsInHeap < capacity, "Heap overflow");
    valueArr[valIdx] = val;
    heapArr[heapIdx] = valIdx
    indexArr[valIdx] = heapIdx;
    reHeap(heapIdx);
  };

  this.values = function() {
    return valueArr;
  }

  this.size = function() {
    return itemsInHeap;
  }

  this.updateValue = function(valIdx, val) {
    if (val < poppedVal) {
      // don't give updated values a lesser value than the last popped vertex...
      val = poppedVal;
    }
    valueArr[valIdx] = val;
    var heapIdx = indexArr[valIdx];
    assert(heapIdx >= 0 && heapIdx < itemsInHeap, "[updateValue()] out-of-range heap index.");
    reHeap(heapIdx);
  };

  // Check that heap is ordered starting at a given node
  // (traverses heap recursively)
  //
  function checkNode(heapIdx, parentVal) {
    if (heapIdx >= itemsInHeap) {
      return;
    }
    var valIdx = heapArr[heapIdx];
    var val = valueArr[valIdx];
    assert(parentVal <= val, "[checkNode()] heap is out-of-order at idx:", heapIdx, "-- parentVal:", parentVal, "nodeVal:", val);
    var childIdx = heapIdx * 2 + 1;
    checkNode(childIdx, val);
    checkNode(childIdx + 1, val);
  }

  function checkHeapOrder() {
    checkNode(0, -Infinity);
  }

  // Function restores order to the heap (lesser values towards the top of the heap)
  // Receives the idx of a heap item that has just been changed or added.
  // (Assumes the rest of the heap is ordered, this item may be out-of-order)
  //
  function reHeap(currIdx) {
    var currValIdx,
        currVal,
        parentIdx,
        parentValIdx,
        parentVal;

    assert(currIdx >= 0 && currIdx < itemsInHeap, "Out-of-bounds heap idx passed to reHeap()");
    currValIdx = heapArr[currIdx];
    currVal = valueArr[currValIdx];

    // Bubbling phase:
    // Move item up in the heap until it's at the top or is heavier than its parent
    //
    while (currIdx > 0) {
      parentIdx = (currIdx - 1) >> 1; // integer division by two gives idx of parent
      parentValIdx = heapArr[parentIdx];
      parentVal = valueArr[parentValIdx];

      if (parentVal <= currVal) {
        break;
      }

      // out-of-order; swap child && parent
      indexArr[parentValIdx] = currIdx;
      indexArr[currValIdx] = parentIdx;
      heapArr[parentIdx] = currValIdx;
      heapArr[currIdx] = parentValIdx;
      currIdx = parentIdx;
    }

    // Percolating phase:
    // Item gets swapped with any lighter children
    //
    var childIdx = 2 * currIdx + 1,
        childValIdx, childVal,
        otherChildIdx, otherChildValIdx, otherChildVal;

    while (childIdx < itemsInHeap) {
      childValIdx = heapArr[childIdx];
      childVal = valueArr[childValIdx];

      otherChildIdx = childIdx + 1;
      if (otherChildIdx < itemsInHeap) {
        otherChildValIdx = heapArr[otherChildIdx];
        otherChildVal = valueArr[otherChildValIdx];
        if (otherChildVal < childVal) {
          childIdx = otherChildIdx;
          childValIdx = otherChildValIdx;
          childVal = otherChildVal;
        }
      }

      if (currVal <= childVal) {
        break;
      }

      // swap curr item and child w/ lesser value
      heapArr[childIdx] = currValIdx;
      heapArr[currIdx] = childValIdx;
      indexArr[childValIdx] = currIdx;
      indexArr[currValIdx] = childIdx;

      // descend in the heap:
      currIdx = childIdx;
      childIdx = 2 * currIdx + 1;
    }
  };

  // Return the idx of the lowest-value item in the heap
  //
  this.pop = function() {
    if (itemsInHeap <= 0) error("Tried to pop from an empty heap.");
    var retnIdx = heapArr[0];
    itemsInHeap--;

    if (itemsInHeap > 0) {
      var lastValIdx = heapArr[itemsInHeap];
      heapArr[0] = lastValIdx; // copy last item in heap into root position
      //heapArr[itemsInHeap] = -1;
      indexArr[lastValIdx] = 0;
      reHeap(0);
    }

    // checkHeapOrder();
    poppedVal = valueArr[retnIdx];
    return retnIdx;
  };
}

/* @requires shapefile-import */


function ShapefileTopoReader(buf) {
  this.__super__(buf);
}

Opts.inherit(ShapefileTopoReader, ShapefileReader);

/**
 * This replaces the default ShapefileReader.read() function.
 * Data is stored in a format that enables efficient MapShaper recognition.
 */
ShapefileTopoReader.prototype.read = function() {
  var bin = this._bin,
  header = this.header,
    shapes = [],
    pointCount = 0;

  bin.position(100); // make sure we're reading from shape data section

  // FIRST PASS
  // get metadata about each shape and get total point count in file
  // (need total point count to instantiate typed arrays)
  //
  //T.start();
  var shapeCount = 0, partCount = 0;

  while(this.hasNext()) {
    shapeCount ++;
    var meta = this.readShapeMetadata(bin, header);
    bin.skipBytes(meta.pointCount * 16);
    // TODO: update to support M and Z types

    shapes.push(meta);
    pointCount += meta.pointCount;

  }
  // T.stop("[ShapefileTopoReader.read()] read shape metadata");

  // SECOND PASS
  // Read coordinates and other data into buffers
  // Identify polygon holes...
  //
  // T.start();

  // Typed arrays >2x faster than new Array(pointCount);
  // 
  var xx = new Float64Array(pointCount);
  var yy = new Float64Array(pointCount);
  var partIds = new Uint32Array(pointCount);    

  //var shapeIds = new Uint32Array(pointCount);
  var shapeIds = [];

  var x, y,
    pointId = 0, 
    partId = 0,
    shapeId = 0,
    dataView = bin.dataView();

  for (var shpId=0; shpId < shapes.length; shpId++) {
    var shp = shapes[shpId];
    var offs = shp.coordOffset;
    var partCount = shp.partCount;
    for (var i=0; i<partCount; i++) {
      var partSize = shp.partSizes[i];
      var partStartId = pointId;
      shapeIds.push(shapeId);

      for (var j=0; j<partSize; j++) {
        // getFloat64() is a bottleneck (uses ~90% of time in this section)
        // DataView seems to be slightly faster than Buffer in nodejs
        x = dataView.getFloat64(offs, true);
        y = dataView.getFloat64(offs + 8, true);
        offs += 16;
        assert(pointId < pointCount, "Too many points!");

        xx[pointId] = x;
        yy[pointId] = y;
        partIds[pointId] = partId;

        pointId++;       
      }

      /*
      if (partCount > 0 && ShapefileTopoReader.partIsCCW(xx, yy, partStartId, partSize) {
        trace(">>> got a hole!");
      }
      */

      partId++;
    }

    shapeId++;
  }


  // T.stop("[ShapefileTopoReader.read()] read coordinates.");
  // trace("**** parts:", partId, "shapes:", shapeId);

  // TODO
  // THIRD PASS (pseudocode)
  // associate holes with their surrounding polygon rings
  //
  /*
  // for each shape;
  //   if just one part:
  //     continue
  //   for each part:
  //     if counter-clockwise:
  //       for each clockwise part:
  //         ...
  //     
  */

  this.header.pointCount = pointCount;
  var data = {
    xx: xx,
    yy: yy,
    partIds: partIds,
    shapeIds: shapeIds,
    header: this.header
  };
  return data;
};


// Reads Shapefile data from an ArrayBuffer or Buffer
// Converts to format used as input to topology importer
//
MapShaper.importShpFromBuffer = function(buf) {
  // T.start();
  var obj = new ShapefileTopoReader(buf).read();
  // T.stop("importShpFromArrayBuffer()")
  return obj;
};

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
  // skip Z & M type bounding boxes (initialized to 0);
  shpBin.clearBytes(4 * 8);

  // write .shx header
  shxBin.writeBuffer(shpBuf, 100); // copy .shp header to .shx
  shxBin.dataView().setInt32(24, shxBytes/2, false); // set .shx file size

  // write record sections of .shp and .shx
  Utils.forEach(shapeBuffers, function(buf) {
    shxBin.writeInt32(shpBin.position() / 2);
    //shxBin.writeBuffer(buf, 4, 4); // copy content length from shape record
    shxBin.writeInt32((buf.byteLength - 8) / 2); // copy content length from shape record
    // trace(">>> rec number:", new DataView(buf).getInt32(0, false));
    shpBin.writeBuffer(buf);
  });

  return {shp: shpBuf, shx: shxBuf}; // TODO: write shx
};

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


/*
// Exports topological shape data as an ArrayBuffer containing .shp data.
//
var shpPoints = 0;
MapShaper.exportShpFromTopoData = function(obj) {
  assert(obj.arcs && obj.shapes, "Missing exportable data.");
  var meta = MapShaper.getExportMetadata(obj);
  var shpBytes = 100 // header
    + meta.shapeCount * 12 // record header + shape type, 3 integers
    + (meta.shapeCount - meta.nullCount) * 40 // bbox etc. for non-null shapes
    + meta.partCount * 4 // part index portion of shape data, 1 int per part
    + meta.pointCount * 16; // coordinate data, two doubles per point

  trace("meta:", meta, "shpBytes:", shpBytes);

  var buf = new ArrayBuffer(shpBytes);
  MapShaper.exportShpToBuffer(obj, buf);
  return buf;
};


// Exports .shp data to a pre-allocated ArrayBuffer.
//
MapShaper.exportShpToBuffer = function(obj, buf) {
  var bin = new BinArray(buf),
      view = bin.dataView(),
      arcs = obj.arcs,
      byteCount = 100;

  var bbox = new BoundingBox();
  bin.position(100); // skip header until we have bbox data

  Utils.forEach(obj.shapes, function(shape, i) {
    var startIdx = bin.position();
    bin.littleEndian = false;
    bin.writeInt32(i+1); // record id (1-indexed)

    if (!shape || shape.length == 0) { // null record
      bin.writeInt32(2, false); // content length in 16-bit words
      bin.littleEndian = true;
      bin.writeInt32(0, true);  // null shape type is 0
      byteCount += 12;
    }
    else { // assume polygon record
      bin.skipBytes(4); // skip content length for now
      bin.littleEndian = true;
      var contentBytes = MapShaper.exportShpPolygonRecord(bin, shape, arcs, bbox);
      view.setInt32(startIdx + 4, contentBytes / 2, false); // fill in content size
      byteCount += contentBytes + 8;
    }
  });

  trace(">>> written points:", shpPoints)
  assert(byteCount == buf.byteLength, "Precalculated byte length and written bytes don't match; precalc:", buf.byteLength, "written:", byteCount, "pos:", bin.position(), "bytesLeft:", bin.bytesLeft());
  // write the header
  //
  bin.position(0);
  bin.littleEndian = false;
  bin.writeInt32(9994);
  bin.skipBytes(5 * 4);
  bin.writeInt32(buf.byteLength / 2);
  bin.littleEndian = true;
  bin.writeInt32(1000);
  bin.writeInt32(Shapefile.POLYGON);
  bin.writeFloat64(bbox.left);
  bin.writeFloat64(bbox.bottom);
  bin.writeFloat64(bbox.right);
  bin.writeFloat64(bbox.top);
  // skip Z & M type bounding boxes (initialized to 0);
};

// 
// TODO: support other shape types
//
MapShaper.exportShpPolygonRecord = function(bin, shape, arcs, bounds) {
  var bbox = new BoundingBox(),
      view = bin.dataView(),
      pointCount = 0,
      partCount = shape.length,
      introBytes = 3 * 4 + 4 * 8, // 3 ints and 4 doubles
      partTableBytes = partCount * 4,
      startIdx = bin.position(),
      partsIdx = startIdx + introBytes,
      pointsIdx = partsIdx + partTableBytes;

  bin.littleEndian = true;
  bin.position(pointsIdx);
  var rings = MapShaper.exportShapeData(shape, arcs, bbox);

  Utils.forEach(rings, function(ring, i) {
    var ringLen = ring.length;
    view.setInt32(partsIdx++, pointCount, true);
    bin.writePointArray(ring);
    pointCount += ringLen;
    shpPoints += ringLen;
    //trace("  .. ringLen:", ringLen);
  });
  var contentBytes = introBytes + partTableBytes + pointCount * 16;
  bounds.mergeBounds(bbox);

  // fill in intro
  bin.position(startIdx);
  bin.writeInt32(Shapefile.POLYGON);
  bin.writeFloat64(bbox.left);
  bin.writeFloat64(bbox.bottom);
  bin.writeFloat64(bbox.right);
  bin.writeFloat64(bbox.top);
  bin.writeInt32(partCount);
  bin.writeInt32(pointCount);
  bin.position(startIdx + contentBytes);

  return contentBytes;
};
*/



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

  var json = JSON.stringify(root);
  return json;
};


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




MapShaper.exportTopoJSON = function(obj) {


};
/* @requires browser, nodejs, mapshaper-topology, mapshaper-dp, mapshaper-visvalingam, mapshaper-shapefile, mapshaper-geojson, mapshaper-topojson */

var api = {
  MapShaper: MapShaper,
  Node: Node,
  Utils: Utils,
  trace: trace,
  error: error,
  assert: assert,
  T: T,
  BinArray: BinArray,
  DouglasPeucker: DouglasPeucker,
  Visvalingam: Visvalingam
};

if (Node.inNode) {
  module.exports = api;
} else {
  Opts.extendNamespace("mapshaper", api);
}})();