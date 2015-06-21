/* @requires mapshaper-gui-lib */

function HighlightBox(el) {
  var stroke = 2,
      box = El('div').addClass('zoom-box').appendTo(el).hide();
  this.show = function(x1, y1, x2, y2) {
    var w = Math.abs(x1 - x2),
        h = Math.abs(y1 - y2);
    box.show();
    box.css({
      top: Math.min(y1, y2),
      left: Math.min(x1, x2),
      width: w - stroke * 2,
      height: h - stroke * 2
    });
  };
  this.hide = function() {
    box.hide();
  };
}
