/* @requires browser, elements, core, events */



function Fixed(ref, opts) {
  if (Browser.touchEnabled) {
    return; // Fixed positioning tricky on mobile safari, etc; don't even try
  }

  var el = El(ref);
  var _self = this;
  var _disabled = false;
  var _fixed = false;
  var _style = el.computedStyle();
  var _position = _style.position;
  var xy = Browser.getPageXY(el.node());

  opts = Utils.extend({
    x: xy.x,
    y: 0
  }, opts);

  Browser.addEventListener(window, 'scroll', handleWindowScroll, this);

  this.disable = function() {
    _disabled = true;
    unfix();
  }

  this.enable = function() {
    _disabled = false;
    evaluate();
  }

  function handleWindowScroll(evt) {
    evaluate();
  }

  function fix() {
    if (!_fixed) {
      // don't set "left" (sticks to viewport when resized...)
      var css = "position:fixed; top:" + opts.y + "px;";
      el.css(css);
      _fixed = true;
      _self.dispatchEvent("fix");
    }
  }

  function unfix() {
    if (_fixed) {
      _fixed = false;
      // dont set left // left:" + (_style.left || '0') + "px;";
      var css = "top:" + (_style.top || '0') + ";";
      el.css(css);
      el.node().style.position = _position || null;
      _self.dispatchEvent("unfix");      
    }
  }

  function evaluate() {
    if (_disabled) {
      return;
    }
    var viewportY = Browser.pageYToViewportY(xy.y);
    var pageY = Browser.pageYToViewportY(0);
    _self.dispatchEvent('scroll', {scrollTop: pageY});

    if (viewportY >= opts.y) {
      unfix();
    } else {
      fix();
    }
  };

  evaluate();
}

Opts.inherit(Fixed, EventDispatcher);

