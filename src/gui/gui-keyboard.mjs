import { utils } from './gui-core';
import { EventDispatcher } from './gui-events';
import { GUI } from './gui-lib';

export function KeyboardEvents(gui) {
  var self = this;
  var shiftDown = false;
  var ctrlDown = false;
  document.addEventListener('keyup', function(e) {
    if (!GUI.isActiveInstance(gui)) return;
    if (e.keyCode == 16) shiftDown = false;
    if (e.keyCode == 17) ctrlDown = false;
    self.dispatchEvent('keyup', getEventData(e));
  });

  document.addEventListener('keydown', function(e) {
    if (!GUI.isActiveInstance(gui)) return;
    if (e.keyCode == 16) shiftDown = true;
    if (e.keyCode == 17) ctrlDown = true;
    self.dispatchEvent('keydown', getEventData(e));
  });

  this.shiftIsPressed = function() { return shiftDown; };
  this.ctrlIsPressed = function() { return ctrlDown; };

  this.onMenuSubmit = function(menuEl, cb) {
    gui.on('enter_key', function(e) {
      if (menuEl.visible()) {
        e.originalEvent.stopPropagation();
        cb();
      }
    });
  };
}

var names = {
  8: 'delete',
  9: 'tab',
  13: 'enter',
  16: 'shift',
  17: 'ctrl',
  27: 'esc',
  32: 'space',
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down'
};

function getEventData(originalEvent) {
  var keyCode = originalEvent.keyCode;
  var keyName = names[keyCode] || '';
  return {originalEvent, keyCode, keyName};
}

utils.inherit(KeyboardEvents, EventDispatcher);
