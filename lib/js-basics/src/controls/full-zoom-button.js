/** @requires basic-button, browser */

//function FullZoomButton(imageUrl, map, opts) {
function FullZoomButton(btn, map, opts) {
  //this.__super__(imageUrl, opts);
  this.__super__(btn.div || btn.el || btn, opts);
  //Opts.copyAllParams(this, btn);
  this.map = map;

  var opts = this._opts;
  var left = opts.left || 5;
  var top = opts.top || 5;
  
  var css = opts.css || ""; // "position:absolute;"; // initial ',' because appending to cssText and ie8- cssText missing final ';'
  
  //this.div.style.cssText = Browser.mergeCSS(this.div.style.cssText, css);
  Browser.addCSS(this.div, css);

  this.hide();

  map.addEventListener('navigate', this.handleMapNav, this);
  map.addEventListener('ready', this.updateVisibility, this);
  this.addEventListener('click', this.handleButtonClick, this, 1);
}

//Opts.inherit(FullZoomButton, ImageButton);
Opts.inherit(FullZoomButton, BasicButton);

FullZoomButton.prototype.handleMapNav = function(evt) {
  this.updateVisibility();
};

FullZoomButton.prototype.updateVisibility = function() {
  var scale = this.map.getScale();
  var initScale = this.map.getInitialScale();
  if (scale > initScale * 0.95 || isNaN(scale)) {  // KLUDGE: NaN when no flash / fallback image mode
    this.isHidden() || this.hide();
  }
  else {
    this.isHidden() && this.show();
  }
};


FullZoomButton.prototype.handleButtonClick = function(evt) {
  var map = this.map;
  var currZoom = map.getZoom();
  //trace("[FZB.handleButtonClick()] currZoom:", currZoom, "ready?", map.isReady());
  if (!map.isReady() || currZoom == 1) {
    return;
  }
  var opts = {zoom:1, tween:!!this._opts.tween};

  map.zoom(opts);
};