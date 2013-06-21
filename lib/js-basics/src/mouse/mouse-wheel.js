/** @requires browser, events, arrayutils, tweening */

// @mouse: MouseArea object
//
function MouseWheel(mouse) {
  var self = this,
      prevWheelTime = 0,
      currDirection = 0,
      scrolling = false;
  init();

  function init() {
    // reference: http://www.javascriptkit.com/javatutors/onmousewheel.shtml
    if (window.onmousewheel !== undefined) { // ie, webkit
      Browser.on(window, 'mousewheel', handleWheel);
    }
    else { // firefox
      Browser.on(window, 'DOMMouseScroll', handleWheel);
    }
    FrameCounter.addEventListener('tick', handleTimer, self);
  }

  function handleTimer(evt) {
    var sustainTime = 80;
    var fadeTime = 60;
    var elapsed = evt.time - prevWheelTime;
    if (currDirection == 0 || elapsed > sustainTime + fadeTime || !mouse.isOver()) {
      currDirection = 0;
      scrolling = false;
      return;
    }

    var multiplier = evt.interval / evt.period; // 1;
    var fadeElapsed = elapsed - sustainTime;
    if (fadeElapsed > 0) {
      // Adjust multiplier if the timer fires during 'fade time' (for smoother zooming)
      multiplier *= Tween.quadraticOut((fadeTime - fadeElapsed) / fadeTime);
    }

    var obj = mouse.mouseData();
    obj.direction = currDirection;
    obj.multiplier = multiplier;
    if (!scrolling) {
      self.dispatchEvent('mousewheelstart', obj);
    }
    scrolling = true;
    self.dispatchEvent('mousewheel', obj);
  }

  function handleWheel(evt) {
    if (mouse.isOver()) {
      evt.preventDefault();
      var direction = 0; // 1 = zoom in / scroll up, -1 = zoom out / scroll down
      if (evt.wheelDelta) {
        direction = evt.wheelDelta > 0 ? 1 : -1;
      }
      if (evt.detail) {
        direction = evt.detail > 0 ? -1 : 1;
      }

      prevWheelTime = +new Date;
      currDirection = direction;
    }
  }
}

Opts.inherit(MouseWheel, EventDispatcher);