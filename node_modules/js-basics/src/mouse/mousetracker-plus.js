/* @require mousetracker, browser, core.geo */

/**
 * This class extends MouseTracker with the ability to wrap mouseover and mouseout events on DOM elements
 * so that mouseout events are postponed until either the mouse has traveled a certain distance from the mouseout
 * location or a mouseover occurs on another node. This can reduce flickering on charts with rollover
 * symbols with gaps between them.
 *
 * TODO: allow events to be removed
 * TODO: inhibit mouseout and mouseover if rolling back onto the same node
 */
function MouseTrackerPlus(surface, opts) {
  opts = Opts.copyAllParams({buffer:10, bufferX:0, bufferY:0}, opts);
  this.__super__(surface, opts);
  var _proxyOutHandler;
  var _outXY;

  function triggerOut() {
    if (_proxyOutHandler) {
      _proxyOutHandler();
    }
    _proxyOutHandler = null;
    _outXY = null;
  }

  this.addEventListener('mousemove', function(evt) {
    if (_outXY) {
      var bufX = opts.bufferX || buffer || 0;
      var bufY = opts.bufferY || buffer || 0;
      if (Math.abs(evt.pageX - _outXY.x) > bufX || Math.abs(evt.pageY - _outXY.y) > bufY) {
        triggerOut();
      }
    }
  });

  this.addElementListener = function(el, type, handler, ctx) {

    if (type == 'mouseover') {
      var overProxy = function(evt) {
        triggerOut();
        handler.call(ctx, evt);
      };
      Browser.addEventListener(el, type, overProxy);
    }
    else if (type == 'mouseout') {
      var outProxy = function(evt) {
        // copy event properties to an object
        // (can't pass the original MouseEvent object, because
        // currentTarget becomes null)
        var proxyEvt = {
          currentTarget: evt.currentTarget,
          pageX: evt.pageX,
          pageY: evt.pageY
        };
        var targ = evt.currentTarget;
        _outXY = new Point(evt.pageX, evt.pageY);
        _proxyOutHandler = function() {
          evt.currentTarget = targ;
          handler.call(ctx, proxyEvt);
        };
      };
      Browser.addEventListener(el, type, outProxy);
    }
    else {
      Browser.addEventListener(el, type, handler, ctx);
    }
  };
}

Opts.inherit(MouseTrackerPlus, MouseTracker);
