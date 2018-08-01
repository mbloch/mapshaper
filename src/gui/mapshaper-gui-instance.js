/* @requires
mapshaper-gui-modes
mapshaper-gui-proxy
mapshaper-keyboard
mapshaper-gui-model
mapshaper-map
*/

function GuiInstance(container, opts) {
  var gui = new ModeSwitcher();
  opts = utils.extend({
    // defaults
    inspector: true
  }, opts);

  gui.container = El(container);
  gui.model = new Model();
  gui.keyboard = new KeyboardEvents(gui);
  gui.map = new MshpMap(gui, opts);

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
