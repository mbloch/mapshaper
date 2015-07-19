/* @requires mapshaper-gui-lib */

gui.showProgressMessage = function(msg) {
  if (!gui.progressMessage) {
    gui.progressMessage = El('div').id('progress-message')
      .appendTo('body');
  }
  El('<div>').text(msg).appendTo(gui.progressMessage.empty().show());
};

gui.clearProgressMessage = function() {
  if (gui.progressMessage) gui.progressMessage.hide();
};
