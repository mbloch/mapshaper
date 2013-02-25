/* @requires browser */

var DomEvents = {
  ieEvents : !!window.attachEvent && !window.addEventListener,
  _nativeMouseLeave : typeof window.onmouseleave != 'undefined',
  _proxyHandlers : {
    'mouseleave' : function(evt) {

    },

    'mouseenter' : function(evt) {

    }
  },

  _mozillaHandlers : {
    'mousewheel' : function(evt) {

    }
  },

  // supported event properties
  // 
  //

  // 
  //
  _ieSupportedEvents : "mousemove,mouseover,mouseout,mouseenter,mouseleave,mousedown,mouseup,dblclick,scroll,resize",

  _handleIEEvent : function(handler) {
    var e = window.event;
    var o = {
      // relatedTarget : e.fromElement || e.toElement || null,
      // preventDefault : function() { e.returnValue = false; },
      target : e.srcElement,
      pageX : e.clientX + document.body.scrollLeft +
        document.documentElement.scrollLeft,
      pageY : e.clientY + document.body.scrollTop +
        document.documentElement.scrollTop
    };

    handler(o);
  },

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

  /**
   *  Add a DOM event handler.
   */
  addEventListener : function(el, type, func, ctx) {
    // function BoundEvent(type, target, callback, context, priority)
    var listeners = this.__getNodeListeners(el);
    if (listeners.length > 0) {
      if (this.__findNodeListener(listeners, type, func, ctx) != -1) {
        trace("[DomEvents.addEventListener()] event already added; skipping.");
        return;
      }
    }

    var evt = new BoundEvent(type, el, func, ctx);
    var handler = ctx ? function(e) {func.call(ctx, e);} : func;
    evt.handler = handler;
    listeners.push(evt);

    if (DomEvents.ieEvents) {

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
      trace("[DomEvents.removeEventListener()] Event not found; ignoring.");
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
    if (DomEvents.ieEvents) {
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


};