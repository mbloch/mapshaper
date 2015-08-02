/* @requires mapshaper-gui-lib */

function Popup() {
  var maxWidth = 0;
  var el = El('div').addClass('popup').appendTo('#mshp-main-map').hide();
  var content = El('div').addClass('popup-content').appendTo(el);

  this.show = function(rec) {
    render(rec, content);
    el.show();
  };

  this.hide = function() {
    el.hide();
  };

  function render(rec, el) {
    var html = "", w;
    utils.forEachProperty(rec, function(v, k) {
      var isNum = utils.isNumber(v),
          className = isNum ? 'num-field' : 'str-field';
      html += utils.format('<tr><td class="field-name">%s</td><td class="%s">%s</td>',
          k, className, utils.htmlEscape(v));
    });
    if (html) {
      el.html('<table>' + html + '</table>');
    } else {
      el.html('<div class="note">This layer is missing attribute data.</div>');
    }
  }

}