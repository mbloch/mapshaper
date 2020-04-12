import { El } from './gui-el';

export function AlertControl(gui) {
  var el;
  gui.addMode('alert', function() {}, turnOff);

  gui.alert = function(str) {
    var infoBox;
    if (!el) {
      el = El('div').appendTo('body').addClass('error-wrapper');
      infoBox = El('div').appendTo(el).addClass('error-box info-box selectable');
      El('p').addClass('error-message').appendTo(infoBox);
      El('div').addClass("btn dialog-btn").appendTo(infoBox).html('close').on('click', gui.clearMode);
    }
    el.findChild('.error-message').html(str);
    gui.enterMode('alert');
  };

  function turnOff() {
    if (el) {
      el.remove();
      el = null;
    }
  }
}
