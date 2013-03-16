/** @requires events, browser */

/**
 * Interface for handling touch events, used internally by HybridMouse.
 * Events
 *  'touchstart' Fires when down-up occurs rapidly, like a 'click'. 
 *  'touchend'   Fires once after a 'touchstart' event, if user slides a finger or 
 *               if finger is lifted after being down for a while.
 *  'dragstart'
 *  'drag'
 *  'dragend'
 *  'pinchstart'
 *  'pinch'
 *  'pinchend'
 *
 * Event data
 *  'pageX'
 *  'pageY'
 *  'mapX'
 *  'mapY'
 *  'centerX' (drag,pinch) REMOVE center of the map, in pixels
 *  'centerY'
 *  'time'
 *  'zoomRatio' (pinch) REMOVE ratio of current pinch radius to starting radius
 *  'deltaScale'
 *  'shiftX'  (drag,pinch) REMOVE distance shifted since beginning of pinch or drag
 *  'shiftY'  (drag,pinch) REMOVE
 *  'deltaX'
 *  'deltaY'
 *
 * @param {*} surface DOM element to listen for touches.
 * @param {BoundingBox} mapBounds Bounds of graphic frame, on page
 * @constructor
 */
function TouchHandler(surface, mapBounds) {
  var downOverMap = false;
  var touchOff = false;
  var numTouches = 0;
  var globalX, globalY, pristineTouch;

  var captureTouches = A.captureTouches !== false;
  var DOUBLE_TAP_TIMEOUT = 600;
  var SINGLE_TAP_TIMEOUT = 400;

  var self = this,
    isActive = false, // like 'down'
    doubleTapStarted = false,
    singleTapStartTime = 0,
    singleTapStartData,
    singleTapStarted = false,
    prevTouchCount = 0;

  var pinching = false;
  var pinchStartX,
    pinchStartY,
    pinchStartRadius;
  var pinchData;

  var dragging = false;
  var dragStartX,
    dragStartY;

  var touchId = 1; // An integer id, incremented when a new pinchstart or dragstart event fires.

  var prevX, prevY, prevRadius;


  Browser.addEventListener(surface, 'touchstart', handleTouchStart);
  Browser.addEventListener(document, 'touchstart', handleGlobalStart);
  Browser.addEventListener(document, 'touchend', handleTouchEnd);
  Browser.addEventListener(document, 'touchmove', handleTouchMove);


  self.on('touchoff', function() {
    // zero touches
  });

  function getTouchData(touches) {
    var obj = {zoomRatio:1, deltaScale:1, deltaX:0, deltaY:0, shiftX:0, shiftY:0};

    var len = touches.length;
    var touchCenterX = 0, touchCenterY = 0;
    var i, touch;
    var insideCount = 0;
    for (i=0; i<len; i++) {
      touch = touches[i];
      var weight = 1/(i+1);
      var pageX = touch.pageX;
      var pageY = touch.pageY;
      if (mapBounds.containsPoint(pageX, pageY)) {
        insideCount += 1;
      }

      touchCenterX = weight * pageX + (1 - weight) * touchCenterX;
      touchCenterY = weight * pageY + (1 - weight) * touchCenterY;      
    }

    obj.inside = insideCount;

    var dist = 0;
    if (len > 0) {
      for (i=0; i<len; i++) {
        touch = touches[i];
        dist += Point.distance(touchCenterX, touchCenterY, touch.pageX, touch.pageY);
      }
      dist /= len;
    }

    obj.pageX = touchCenterX;
    obj.pageY = touchCenterY;
    obj.mapX = touchCenterX - mapBounds.left;
    obj.mapY = touchCenterY - mapBounds.bottom; // mapBounds.bottom is actually the top, in screen space.
    obj.centerX = mapBounds.centerX();
    obj.centerY = mapBounds.centerY();
    obj.radius = dist;
    obj.time = now();
    return obj;
  };


  function handleTouchChange(e) {

    var touches = e.touches;
    numTouches = touches.length;
    var prevTouches = prevTouchCount;

    if (numTouches != 1 && dragging) {
      dragging = false;
      self.dispatchEvent('dragend');
    }

    if (numTouches < 2 && pinching) {
      pinching = false;
      self.dispatchEvent('pinchend');
    }

    if (numTouches == 0) {
      if (doubleTapStarted) {
        if (prevTouches == 1) {
          //trace("[handleTouchChange()] doubletap");
          self.dispatchEvent('doubletap', singleTapStartData);
        }
        doubleTapStarted = false;
      }

      // check for ... double tap
      if (singleTapStarted) {
        if (prevTouches == 1) { 
          doubleTapStarted = true;
        }
        // could fire event here
        singleTapStarted = false;
      }

      prevTouchCount = numTouches;
      return;
    }

    var obj = getTouchData(touches);
    // Attach dom event object, to allow preventDefault() to be called in event handlers.
    obj.touchEvent = e;
    obj.touchId = touchId;

    var pageX = obj.pageX;
    var pageY = obj.pageY;

    // Ignore new touches when all fingers are outside the map
    // (experimental)
    if (numTouches > prevTouches && obj.inside == 0) {
     // trace("[HybridTouch.handleTouchChange()] no inside touches");
      return;
    }

    if (numTouches == 1) { // Single finger touches the screen
      if (prevTouches == 0) { // ... after no fingers were touching -- i.e. a 'tap'.

        if (doubleTapStarted) {
          // Cancel a double-tap if too much time has elapsed or if finger has  moved.
          var dist = Point.distance(pageX, pageY, singleTapStartData.pageX, singleTapStartData.pageY);
          var timeElapsed = obj.time - singleTapStartData.time;
          if ( timeElapsed > DOUBLE_TAP_TIMEOUT || dist > 12 ) {
            doubleTapStarted = false;
          }
          else {
            // Prevent mobile safari page zoom
            // when second touch starts (experimental)
            // Problem: page zoom is blocked even if double-tap is disabled on the map...
            //
            if (numTouches == 1 && doubleTapStarted) {
              //trace("[HybridTouch.handleTouches()] blocking second tap");
              e.preventDefault();
            }
          }
        }

        // Unless a double tap is underway, initiate a new single tap.
        if (doubleTapStarted == false) {
          singleTapStarted = true;
          singleTapStartData = obj;
          singleTapStartTime = obj.time;
        }
      }

      if (!dragging) {
        prevX = dragStartX = pageX;
        prevY = dragStartY = pageY;
        dragging = true;
        touchId += 1;
        obj.touchId = touchId;
        self.dispatchEvent('dragstart', obj);
      }
      else {
        obj.shiftX = pageX - dragStartX;
        obj.shiftY = pageY - dragStartY;
        obj.deltaX = pageX - prevX;
        obj.deltaY = pageY - prevY;
        self.dispatchEvent('drag', obj);
        prevX = pageX;
        prevY = pageY;
      }
    }
    else if (numTouches > 1 ) {
      if (!pinching) {
        pinching = true;
        prevRadius = pinchStartRadius = obj.radius;
        prevX = pinchStartX = obj.pageX;
        prevY = pinchStartY = obj.pageY;
        pinchData = obj;
        touchId += 1;
        obj.touchId = touchId;
        self.dispatchEvent('pinchstart', obj);
      }
      else {
        obj.startX = pinchStartX;
        obj.startY = pinchStartY;
        obj.zoomRatio = obj.radius / pinchStartRadius;
        obj.deltaScale = obj.radius / prevRadius;
        obj.shiftX = obj.pageX - obj.startX;
        obj.shiftY = obj.pageY - obj.startY;
        obj.deltaX = obj.pageX - prevX;
        obj.deltaY = obj.pageY - prevY;
        pinchData = obj;
        self.dispatchEvent('pinch', obj);
        prevX = obj.pageX;
        prevY = obj.pageY;
        prevRadius = obj.radius;
      }
    }
    
    if (numTouches == 0) {
      // self.dispatchEvent('touchoff');
    }

    prevTouchCount = numTouches;


  }

  function start() {
    isActive = true;
    // 'touchstart' event similar to rollover; used to initiate hover-like effect
    singleTapStartData && self.dispatchEvent('touchstart', {pageX:singleTapStartData.pageX, pageY:singleTapStartData.pageY});
  }

  function end() {
    
    if (isActive) {
      isActive = false;
      // 'touchend' event similar to rollout or mouseout...
      self.dispatchEvent('touchend');
    }
  }

  function now() {
    return new Date().getTime();
  }

  function handleGlobalStart(e) {
    var touches = e.touches;
    numTouches = touches.length;
    if (numTouches == 1) {
      var obj = getTouchData(touches);
      globalX = obj.pageX;
      globalY = obj.pageY;
      pristineTouch = true;
    }
  }


  function handleTouchStart(e) {
    // e.preventDefault() stops the page from scrolling along with the map, which 
    // may not be desirable, especially when map is zoomed-out...
    //e.stopPropagation();
    //trace("[] handleTouchStart()");

    // mobile safari: e.targetTouches seems to include all current touches, not just new ones.
    /*
    if (Browser.iPhone) {
      e.preventDefault(); // added for politics app; kludge
    }
    else if (e.targetTouches.length != 1) {
      e.preventDefault();
      return;
    }*/

    // test
    downOverMap = true;
    handleTouchChange(e);
    //return false; // this was triggering preventDefault() in Browser.addEventListener()
  }

  // Lifting a finger: Either a click or ends interaction.
  function handleTouchEnd(e) {
    // REMOVED: preventDefault() could cause problems, as this handler is registered on the window.
    //e.preventDefault();
    //e.stopPropagation();
    //trace("[] handleTouchEnd()");

    if (downOverMap) {
      handleTouchChange(e);
    }

    elapsed = now() - singleTapStartTime;
    if (downOverMap && elapsed < SINGLE_TAP_TIMEOUT) {
      start();
    }
    else {
      if (pristineTouch) {
        end();
      }
      // end();
    }

    if (numTouches == 0) {
      downOverMap = false;
    }  

  }

  function handleTouchMove(e) {
    //end(); // Dragging ends interaction.
    pristineTouch = false;
    if (!downOverMap) {
      return;
    }
    handleTouchChange(e);
  };
}

Opts.extendPrototype(TouchHandler, EventDispatcher);
