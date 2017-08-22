
/* @require mapshaper-gui-lib */

// Replace error function in mapshaper lib
var error = internal.error = function() {
  stop.apply(null, utils.toArray(arguments));
};

// replace stop function
var stop = internal.stop = function() {
  // Show a popup error message, then throw an error
  var msg = gui.formatMessageArgs(arguments);
  gui.alert(msg);
  throw new Error(msg);
};


function AlertControl() {
  var el;
  gui.addMode('alert', function() {}, turnOff);

  function turnOff() {
    if (el) {
      el.remove();
      el = null;
    }
  }

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
}
