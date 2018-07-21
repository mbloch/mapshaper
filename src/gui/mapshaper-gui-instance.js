/* @requires
mapshaper-gui-modes
mapshaper-gui-proxy
mapshaper-keyboard
mapshaper-gui-model

*/

function GuiInstance(container) {
  var gui = new ModeSwitcher();

  gui.container = El(container);
  gui.model = new Model();
  gui.keyboard = new KeyboardEvents(gui);

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

  gui.consoleIsOpen = function() {
    return gui.container.hasClass('console-open');
  };
  GUI.setActiveInstance(gui);

  return gui;
}
