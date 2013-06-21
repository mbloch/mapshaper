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

