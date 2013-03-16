/* @requires elements, core, browser */


function Button(el) {
  el = el || "div";
  this.__super__(el);
  //Browser.addEventListener(this.el, 'click', function() {this.dispatchEvent('click');}, this);
}

Opts.inherit(Button, El);

Button.prototype.label = function(text) {
  var txt = this.child('div');
  txt.text(text);
  return txt;
};

