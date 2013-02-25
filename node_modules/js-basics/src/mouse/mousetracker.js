/* @require mouse2 */

/**
 * A wrapper for HybridMouse for use with charts.
 */
function MouseTracker(surface, opts) {
  this.__super__(opts);
  this.setMapContainer(surface);
  Browser.addEventListener(surface, 'mouseover', this.updateRegistration, this);
}

Opts.inherit(MouseTracker, MouseHandler);

MouseTracker.prototype.updateRegistration = function() {
  var el = this._mapContainer;
  var xy = Browser.getPageXY(el);
  var x = xy.x;
  var y = xy.y;
  var w = el.offsetWidth;
  var h = el.offsetHeight;
  this.updateContainerBounds(x, y + h, x + w, y);
};