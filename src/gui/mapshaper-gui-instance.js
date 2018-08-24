/* @requires
mapshaper-gui-modes
mapshaper-gui-proxy
mapshaper-keyboard
mapshaper-gui-model
mapshaper-map
*/

GUI.isActiveInstance = function(gui) {
  return gui == GUI.__active;
};

function GuiInstance(container, opts) {
  var gui = new ModeSwitcher();
  opts = utils.extend({
    // defaults
    inspector: true,
    focus: true
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

  // Make this instance interactive and editable
  gui.focus = function() {
    var curr = GUI.__active;
    if (curr == gui) return;
    if (curr) {
      curr.blur();
    }
    GUI.__active = gui;
    MessageProxy(gui);
    ImportFileProxy(gui);
    WriteFilesProxy(gui);
    gui.dispatchEvent('active');
  };

  gui.blur = function() {
    if (GUI.isActiveInstance(gui)) {
      GUI.__active = null;
      gui.dispatchEvent('inactive');
    }
  };

  // switch between multiple gui instances on mouse click
  gui.container.node().addEventListener('mouseup', function(e) {
    if (GUI.isActiveInstance(gui)) return;
    e.stopPropagation();
    gui.focus();
  }, true); // use capture

  if (opts.focus) {
    gui.focus();
  }

  return gui;
}
