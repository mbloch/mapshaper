import { El } from './gui-el';

export function AlertControl(gui) {
  var el;
  gui.addMode('alert', function() {}, turnOff);

  gui.alert = function(str, title) {
    var infoBox, html = '';
    if (!el) {
      el = El('div').appendTo('body').addClass('error-wrapper');
      infoBox = El('div').appendTo(el).addClass('error-box info-box selectable');
      El('div').appendTo(infoBox).addClass('error-content');
      El('div').addClass("btn dialog-btn").appendTo(infoBox).html('close').on('click', gui.clearMode);
    }
    if (title) {
      html += `<div class="error-title">${title}</div>`;
    }
    html += `<p class="error-message">${str}</p>`;
    el.findChild('.error-content').html(html);
    gui.enterMode('alert');
  };

  function turnOff() {
    if (el) {
      el.remove();
      el = null;
    }
  }
}
