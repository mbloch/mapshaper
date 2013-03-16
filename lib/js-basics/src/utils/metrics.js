/* @requires browser, elements */

/* Text metrics */

var Metrics = new Element('div');

Metrics.getTextSize = function(str) {
  var el = this.el;
  if (!el.parentNode) {
    this.css('position:absolute;top:-500px;left: -500px;');
    this.appendTo('body');
  }
  else {
    el.style.display = "block";
  }

  this.text(str);
  var w = el.clientWidth;
  var h = el.clientHeight;
  el.style.display = 'none';
  return [w, h];
};



/*(function() {
  var obj = {};
  var index = {};
  var label = null;
  var _px = -1;
  
  obj.getTextSize = function(str, px) {
    px = px || 12;
    if (!label) {
      label = El('div').css('position:absolute;top:-500px;left: -500px;').appendTo('body');
    }
    else {
      label.el.style.display = 'block';
    }

    if (px != _px) {
      _px = px;
      label.el.style.fontSize = px + "px";
    }

    label.text(str);
    var w = label.el.clientWidth;
    var h = label.el.clientHeight;

    label.el.style.display = 'none';
    return [w, h];
  };

  return obj;
}());*/