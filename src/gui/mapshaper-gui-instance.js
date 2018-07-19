/* @requires mapshaper-gui-modes */

function GuiInstance(container) {
  var gui = new ModeSwitcher();

  gui.container = El(container);
  gui.model = new Model();

  gui.showProgressMessage = function(msg) {
    if (!gui.progressMessage) {
      gui.progressMessage = El('div').addClass('progress-message')
        .appendTo('body');
    }
    El('<div>').text(msg).appendTo(gui.progressMessage.empty().show());
  };

  gui.clearProgressMessage = function() {
    if (gui.progressMessage) gui.progressMessage.hide();
  };

  return gui;
}
