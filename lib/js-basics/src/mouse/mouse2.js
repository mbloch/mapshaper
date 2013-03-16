/** @requires core.geo, browser, hybrid-touch */

/**
 * A branch of HybridMouse for the graphviz medals chart
 *
 * TODO: Look into merging back to HybridMouse
 */
function MouseHandler(opts) {
  this._opts = Opts.copyAllParams({throttled:true}, opts);
  this._ignoredElements = [];
  this.dragging = false;
  this._overMap = false;
  this._boundsOnPage = new BoundingBox();

  if (!Browser.touchEnabled) {
  
      // Changed from window.onmousemove; ie8- doesn't support mousemove on window
      //Browser.addEventListener(document, 'mousemove', this.handleMouseMove, this);
      var moveHandler = this._opts.throttled ? this.throttledMouseMove : this.handleMouseMove;
      Browser.addEventListener(document, 'mousemove', moveHandler, this);
      //Browser.addEventListener(document, 'mouseout', function() { trace("out"); });
      //Browser.addEventListener(window, 'resize', this.updateDivBounds, this);

      // using body instead of window; window is triggered by interaction with browser scrollbars.
      Browser.addEventListener(document.body, 'mousedown', this.handleMouseDown, this);
      Browser.addEventListener(document, 'mouseup', this.handleMouseUp, this);
  }
}

Opts.inherit(MouseHandler, EventDispatcher);

MouseHandler.prototype.ignoreElement = function(el) {
  if (!el || Utils.contains(this._ignoredElements, el) != -1) {
    return;
  }
  this._ignoredElements.push(el);
};


MouseHandler.prototype.setMapContainer = function(surface) {
  if (!surface) {
    trace("!!! [MouseHandler.setMapContainer()] surface is empty");
    return;
  }
  if (this._mapContainer) {
    return;
  }
  this._mapContainer = surface;
  var self = this;

  if (Browser.iPhone || Browser.touchEnabled) {
    var touch = new TouchHandler(surface, this._boundsOnPage);
    touch.addEventListener('touchstart', this.handleTouchStart, this);
    touch.addEventListener('touchend', this.handleTouchEnd, this);
    this.touch = touch;
  }


  Browser.addEventListener(surface, 'mouseover', handleMouseOver, this);
  //  Moved adding mouseout handler to handleMouseOver()
  //  Browser.addEventListener(surface, 'mouseout', handleMouseOut, this);
  Browser.addEventListener(surface, 'dblclick', handleDoubleClick, this);

  function handleMouseOver(e) {
    //trace("[MouseHandler.handleMouseOver()]");
    self.triggerMouseOver();
  }


  function handleDoubleClick(e) {
    if (self.overMap()) {
      // DOESNT WORK (Chrome) // e.preventDefault(); // Prevent map element from being selected in the browser.
      var obj = self.getStandardMouseData(e);
      self.dispatchEvent('dblclick', obj);
    }
  }
};


MouseHandler.prototype.overMap = function() {
  return this._overMap;
};

MouseHandler.prototype.mouseDown = function() {
  return !!this._mouseDown;
};

MouseHandler.prototype.handleTouchStart = function(evt) {
  this.triggerMouseOver();
  this.handleMouseMove(evt);
};

MouseHandler.prototype.handleTouchEnd = function(evt) {
  this.triggerMouseOut();
  //this.handleMouseMove(evt); // KLUDGE: this should go away
};

/** 
 * Now fired on body -> mouseover
 */
MouseHandler.prototype.handleMouseOut = function(e) {
  // Don't fire mouseout if we are rolling around inside the map container.
  // ... or have rolled over a popup, etc...
  //
  //var target = (e.target) ? e.target : e.srcElement;
  if (this._ignoredElements.length > 0) {
    var rel = e.relatedTarget;
    while (rel && rel.nodeName != 'BODY') {
      if (Utils.contains(this._ignoredElements, rel)) {
        return;
      }
      rel = rel.parentNode;
    } 
  }
  this.triggerMouseOut();
}

MouseHandler.prototype.triggerMouseOut = function() {

  if (this._overMap) {
    this._overMap = false;
    //Browser.removeEventListener(document.body, 'mouseover', this.handleMouseOut, this);
    //Browser.removeEventListener(window, 'mouseout', this.handleMouseOut, this);
    Browser.removeEventListener(this._mapContainer, 'mouseout', this.handleMouseOut, this);

    this.dispatchEvent('mouseout');
  }
};

MouseHandler.prototype.triggerMouseOver = function() {

  if (!this._overMap) {
    this._overMap = true;
    //this._mapContainer != document.body && Browser.addEventListener(document.body, 'mouseover', this.handleMouseOut, this);
    //Browser.addEventListener(window, 'mouseout', this.handleMouseOut, this);
    Browser.addEventListener(this._mapContainer, 'mouseout', this.handleMouseOut, this);

    this.dispatchEvent('mouseover');
  }
};


MouseHandler.prototype.updateDragging = function(obj) {
  var overMap = this.overMap();
  var mouseDown = this.mouseDown();

  if (!this.dragging) {
    if (mouseDown && overMap) {
      this._dragStartData = obj;
      this.dragging = true;
      this._prevX = obj.pageX;
      this._prevY = obj.pageY;
      this.dispatchEvent('dragstart', obj);
    }
  }
  else if (!mouseDown) {
    this.dragging = false;
    this.dispatchEvent('dragend', obj);
  }
  else {
    obj.shiftX = obj.pageX - this._dragStartData.pageX;
    obj.shiftY = obj.pageY - this._dragStartData.pageY;
    obj.deltaX = obj.pageX - this._prevX;
    obj.deltaY = obj.pageY - this._prevY;
    this.dispatchEvent('drag', obj);
    this._prevX = obj.pageX;
    this._prevY = obj.pageY;
  }
};

MouseHandler.prototype.handleMouseDown = function(e) {
  this._mouseDown = true;

  if (this.overMap()) {
    // e.preventDefault && e.preventDefault(); // try to prevent selection
    var data = this.getStandardMouseData(e);
    data.downTime = (new Date()).getTime();
    this._downData = data;
    this.updateDragging(data);
  }
};

MouseHandler.prototype.handleMouseUp = function(e) {
  //trace("[MouseHandler.handleMouseUp(); over map?", this.overMap());
  this._mouseDown = false;
  var upData = this.getStandardMouseData(e);
  this.updateDragging(upData);
  
  var downData = this._downData;
  if (downData && this.overMap()) {
    if (Math.abs(downData.pageX - upData.pageX) + Math.abs(downData.pageY - upData.pageY) < 6) {
      var elapsed = (new Date()).getTime() - downData.downTime;
      if (elapsed < 500) {
        this.dispatchEvent('click', upData);
      }
    }
  }
};


MouseHandler.prototype.updateContainerBounds = function(l, t, r, b) {
  this._boundsOnPage.setBounds(l, t, r, b);
};

MouseHandler.prototype.getStandardMouseData = function(e) {
  // Get x, y pixel location of mouse relative to t, l corner of the page.
  e = this.standardizeMouseEvent(e);
  var pageX = e.pageX;
  var pageY = e.pageY;
  
  var bounds = this._boundsOnPage;
  var mapX = pageX - bounds.left;
  var mapY = pageY - bounds.bottom; // bottom is actually the upper bound

  return { pageX:pageX, pageY:pageY, mapX:mapX, mapY:mapY, centerX:bounds.centerX(), centerY:bounds.centerY(), deltaX:0, deltaY:0, deltaScale:1 };
};

MouseHandler.prototype.getCurrentMouseData = function() {
  var obj = {};
  if (this._moveData) {
    Opts.copyAllParams(obj, this._moveData);
  }
  return obj;
};

MouseHandler.prototype.pageX = function() {
  return this._moveData.pageX;
};

MouseHandler.prototype.pageY = function() {
  return this._moveData.pageY;
};


var moveCount = 0;
var moveSecond = 0;

MouseHandler.prototype.standardizeMouseEvent = function(e) {
  if (e && e.pageX !== void 0) {
    return e;
  }
  e = e || window.event;
  var o = {
    pageX : e.pageX || e.clientX + document.body.scrollLeft +
      document.documentElement.scrollLeft,
    pageY : e.pageY || e.clientY + document.body.scrollTop +
      document.documentElement.scrollTop
  };
  return o;
};


MouseHandler.prototype.throttledMouseMove = function(e) {
  var minInterval = 40;
  var now = (new Date).getTime();
  var elapsed = now - (this._prevMoveTime || 0);
  if (elapsed > minInterval) {
    this._prevMoveTime = now;
    this.handleMouseMove(e);
  }
};

MouseHandler.prototype.handleMouseMove = function(e) {

  this._moveData = this.getStandardMouseData(e);
  this.triggerMouseMove();
};

MouseHandler.prototype.triggerMouseMove = function() {
  var obj = this._moveData;
  if (!obj) {
    return;
  }

  // var isOver = this._boundsOnPage.containsPoint(obj.pageX, obj.pageY) && this._overMap;
  // var isOver = true;
  var isOver = this._boundsOnPage.containsPoint(obj.pageX, obj.pageY);
  if (!isOver) {
    //trace("not over; _overMap?", this._overMap);
  }

  //trace("[MouseHandler.triggerMouseMove()] over?", isOver);
  // Fallback over / out events if map container hasn't been registered
  //
  if (!this._mapContainer) {
    var wasOver = this._overMap;
    if (isOver && !wasOver) {
      this.triggerMouseOver();
    }
    else if (!isOver && wasOver) {
      this.triggerMouseOut();
    }
  }

  if (isOver) {
    this.dispatchEvent('mousemove', obj);
  }


  this.updateDragging(obj);
};


