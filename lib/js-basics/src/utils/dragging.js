/* @requires elements, browser */


El.prototype.draggable = function(arg, follow) {
  var yes = arg !== false;
  if (yes == this._draggable) return;

  if (yes) {
    Browser.on(this.el, 'mousedown', this.__ondown, this);
  } else {
    Browser.on(this.el, 'mousedown', this.__ondown, this);
  }
  this._draggable = yes;
  return this;
};

El.prototype.__onmove = function(e) {
    this.dispatchEvent('drag', {dx: e.pageX - this._xdown, dy: e.pageY - this._ydown});
};


El.prototype.__onrelease = function(e) {
  Browser.removeEventListener(window, 'mousemove', this.__onmove, this);
  Browser.removeEventListener(window, 'mouseup', this.__onrelease, this);
  this.dispatchEvent('dragend');
};

El.prototype.__ondown = function(e) {
  this._xdown = e.pageX;
  this._ydown = e.pageY;
  this.dispatchEvent('dragstart');
  Browser.on(window, 'mousemove', this.__onmove, this);
  Browser.on(window, 'mouseup', this.__onrelease, this);
};

El.prototype.follow = function() {
  if (!this._follow) {
    this._follow = true;
    this.on('dragstart', function(e) {
      this._x0 = this.el.offsetLeft; // TODO: fix...
      this._y0 = this.el.offsetTop;
    }, this);
    this.on('drag', function(e) {
      var x = this._x0 + e.dx,
          y = this._y0 + e.dy;
      this.css('left', x).css('top', y);
    }, this);
    this.on('dragend', function(e) {
      trace(this.el.offsetLeft + ", " + this.el.offsetTop);
    }, this);
  }
  return this;
};