/* @requires browser */

function Fixed(div, opts) {
  if (Browser.touchEnabled) {
    return; // Fixed positioning tricky on mobile safari, etc; don't even try
  }

  this.div = div;
  this.divPosition = div.style.position;

  var xy = Browser.getPageXY(this.div);
  this.divY = xy.y;
  this.divX = xy.x;
  this.divLeft = div.style.left || "0";
  this.divTop = div.style.top || "0";

  this._opts = {
    x: this.divX,
    y: 0
  };

  Opts.copyAllParams(this._opts, opts);
  Browser.addEventListener(window, 'scroll', this.handleWindowScroll, this);

  this.isFixed = false;
  this.evaluate();
}


Fixed.prototype.handleWindowScroll = function(evt) {
  this.evaluate();
};


Fixed.prototype.evaluate = function() {
  var opts = this._opts;
  var viewportY = Browser.pageYToViewportY(this.divY);
  if (this.isFixed) {
    if (viewportY > opts.y) {
      var css = "top:" + this.divTop + "; left:" + this.divLeft + "px;";
      Browser.addCSS(this.div, css);
      this.div.style.position = this.divPosition || null;
      this.isFixed = false;
    }
  }
  else {
    if (viewportY < this._opts.y) {
      var css = "position:fixed; left:" + opts.x + "px; top:" + opts.y + "px;";
      Browser.addCSS(this.div, css);
      this.isFixed = true;
    }
  }
};

