import { utils } from './gui-core';
import { EventDispatcher } from './gui-events';
import { GUI } from './gui-lib';

export function KeyboardEvents(gui) {
  var self = this;
  document.addEventListener('keydown', function(e) {
    if (!GUI.isActiveInstance(gui)) return;
    self.dispatchEvent('keydown', {originalEvent: e});
  });

  this.onMenuSubmit = function(menuEl, cb) {
    gui.on('enter_key', function(e) {
      if (menuEl.visible()) {
        e.originalEvent.stopPropagation();
        cb();
      }
    });
  };
}

utils.inherit(KeyboardEvents, EventDispatcher);
