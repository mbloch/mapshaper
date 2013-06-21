/* @requires tweening, elements, core */

// TODO: finish this

El.easeCSS = function(obj, opts) {
  var _opts = {
    duration: 300
  }

  var _style = this.computedStyle();

  opts && Utils.extend(_opts, Utils.isNumber(opts) ? {duration:opts} : opts);



};