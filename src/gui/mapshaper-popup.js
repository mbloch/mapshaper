/* @requires mapshaper-gui-lib */

function Popup() {

  var el = El('div').addClass('popup').appendTo('body').hide();

  this.show = function(rec) {
    render(rec, el);
    el.show();
  };

  this.hide = function() {
    el.hide();
  };

  function render(rec, el) {
    var html = "";
    utils.forEachProperty(rec, function(v, k) {
      var isNum = utils.isNumber(v),
          className = isNum ? 'num-field' : 'str-field';
      html += utils.format('<tr><td class="field-name">%s</td><td class="%s">%s</td>',
          k, className, utils.htmlEscape(v));
    });
    el.html('<table>' + html + '</table>');
  }

}