/** @requires browser, events, arrayutils, tweening */

/**
 * 
 * @param {Mouse} 
 * @constructor
 */
function MouseWheelHandler(mouse) {
  var self = this;
  var prevWheelTime = 0;
  var currDirection = 0;
  var scrolling = false;
  init();

  function init() {
    // reference: http://www.javascriptkit.com/javatutors/onmousewheel.shtml
    if (window.onmousewheel !== undefined) { // ie, webkit
      Browser.on(window, 'mousewheel', handlePageScroll, self);
    }
    else { // firefox
      Browser.on(window, 'DOMMouseScroll', handlePageScroll, self);
    }
    FrameCounter.addEventListener('tick', handleTimer, self);
  }

  function handleTimer(evt) {
    var sustainTime = 80;
    var fadeTime = 60;
    var elapsed = evt.time - prevWheelTime;
    if (currDirection == 0 || elapsed > sustainTime + fadeTime || !mouse.overMap()) {
      currDirection = 0;
      scrolling = false;
      return;
    }

    // Assign a multiplier of (0-1) if the timer fires during 'fade time' (for smoother zooming)
    // TODO: consider moving this calculation to the navigation manager, where it is applied.
    var multiplier = 1;
    var fadeElapsed = elapsed - sustainTime;
    if (fadeElapsed > 0) {
      multiplier = Tween.quadraticOut((fadeTime - fadeElapsed) / fadeTime);
    }

    var obj = mouse.getCurrentMouseData();
    obj.direction = currDirection;
    obj.multiplier = multiplier;
    if (!scrolling) {
      self.dispatchEvent('mousewheelstart', obj);
    }
    scrolling = true;
    self.dispatchEvent('mousewheel', obj);
  }

  function handlePageScroll(evt) {
    if (mouse.overMap()) {
      evt.preventDefault();
      var direction = 0; // 1 = zoom in / scroll up, -1 = zoom out / scroll down
      if (evt.wheelDelta) {
        direction = evt.wheelDelta > 0 ? 1 : -1;
      }
      if (evt.detail) {
        direction = evt.detail > 0 ? -1 : 1;
      }

      prevWheelTime = (new Date()).getTime();
      currDirection = direction;
    }
  }
}

Opts.inherit(MouseWheelHandler, EventDispatcher);