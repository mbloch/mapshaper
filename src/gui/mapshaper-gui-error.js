/* @requires mapshaper-gui-lib */

function ErrorMessages(model) {
  var el;
  model.addMode('alert', function() {}, turnOff);

  function turnOff() {
    if (el) {
      el.remove();
      el = null;
    }
  }

  return function(str) {
    var infoBox;
    if (el) return;
    el = El('div').appendTo('body').addClass('error-wrapper');
    infoBox = El('div').appendTo(el).addClass('error-box info-box');
    El('p').addClass('error-message').appendTo(infoBox).html(str);
    El('div').addClass("btn dialog-btn").appendTo(infoBox).html('close').on('click', model.clearMode);
    model.enterMode('alert');
  };
}
