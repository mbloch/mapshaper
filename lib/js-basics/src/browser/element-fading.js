/* @requires elements, tweening */


El.fade = function(el, to, ms, delay) {
  ms = ms || 300;
  delay = delay || 0;
  var vis = el.visible();
  if (!vis && to <= 0) return; // don't try to fade out invisible elements

  var from = el.el.style.opacity || 1 - to; // current opacity
  var startTime = +new Date + delay;

  El.clearFader(el);
  el._fader = function(e) {
    var pct = (e.time - startTime) / ms,
        done = pct >= 1;
    if (pct > 1) pct = 1;
    if (pct > 0) {
      var o = Utils.interpolate(from, to, pct);
      el.css('opacity', o);
    }
    if (pct == 1) { // done... fire event?
      El.clearFader(el);
      if (to == 0) {
        el.hide();
      }
    }
  };

  el.css('opacity', from);
  if (!vis) el.show();
  FrameCounter.on('tick', el._fader, el);
};

El.clearFader = function(el) {
  if (el._fader) {
    FrameCounter.removeEventListener('tick', el._fader, el);
    el._fader = null;
  }
};


El.prototype.fadeIn = function(ms, delay) {
  El.fade(this, 1, ms, delay);
};


El.prototype.fadeOut = function(ms, delay) {
  El.fade(this, 0, ms, delay);
};
