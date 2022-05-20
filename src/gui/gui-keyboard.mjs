import { utils } from './gui-core';
import { EventDispatcher } from './gui-events';
import { GUI } from './gui-lib';

export function KeyboardEvents(gui) {
  var self = this;
  var shiftDown = false;
  document.addEventListener('keyup', function(e) {
    if (!GUI.isActiveInstance(gui)) return;
    if (e.keyCode == 16) shiftDown = false;
  });

  document.addEventListener('keydown', function(e) {
    if (!GUI.isActiveInstance(gui)) return;
    if (e.keyCode == 16) shiftDown = true;
    self.dispatchEvent('keydown', {originalEvent: e});
  });

  this.shiftIsPressed = function() { return shiftDown; };

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
