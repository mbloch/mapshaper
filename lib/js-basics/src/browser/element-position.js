/* @requires elements, browser */

function ElementPosition(ref) {
  var self = this;
  var el = El(ref);
  var pageX = 0,
      pageY = 0,
      width = 0,
      height = 0;

  el.on('mouseover', update);
  window.onorientationchange && Browser.on(window, 'orientationchange', update);
  Browser.on(window, 'scroll', update);
  Browser.on(window, 'resize', update);

  // trigger an update, e.g. when map container is resized
  this.update = function() {
    update();
  };

  this.resize = function(w, h) {
    el.css('width', w).css('height', h);
    update();
  };

  this.width = function() { return width };
  this.height = function() { return height };
  //this.pageX = function() { return pageX };
  //this.pageY = function() { return pageY };

  this.position = function() {
    return {
      element: el.node(),
      pageX: pageX,
      pageY: pageY,
      width: width,
      height: height
    };
  }

  function update() {
    var div = el.node();
    var xy = Browser.getPageXY(div);
    var w = div.clientWidth,
        h = div.clientHeight,
        x = xy.x,
        y = xy.y;

    var resized = w != width || h != height,
        moved = x != pageX || y != pageY;
    if (resized || moved) {
      pageX = x, pageY = y, width = w, height = h;
      var pos = self.position();
      self.dispatchEvent('change', pos);
      resized && self.dispatchEvent('resize', pos);
    }
  }

  update();
}

Opts.inherit(ElementPosition, EventDispatcher);