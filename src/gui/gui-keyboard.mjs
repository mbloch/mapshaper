import { utils } from './gui-core';
import { EventDispatcher } from './gui-events';
import { GUI } from './gui-lib';

export function KeyboardEvents(gui) {
  var self = this;
  var shiftDown = false;
  var ctrlDown = false;
  var metaDown = false;
  var altDown = false;
  var spaceDown = false;

  function updateControlKeys(e, evtName) {
    shiftDown = e.shiftKey;
    ctrlDown = e.ctrlKey;
    metaDown = e.metaKey;
    altDown = e.altKey;
    if (e.keyCode == 32) {
      spaceDown = evtName == 'keydown';
    }
  }

  function mouseIsPressed() {
    return gui.map.getMouse().isDown();
  }

  document.addEventListener('keyup', function(e) {
    if (!GUI.isActiveInstance(gui) || e.repeat && e.keyCode == 32) return;
    updateControlKeys(e, 'keyup');
    self.dispatchEvent('keyup', getEventData(e));
  });

  document.addEventListener('keydown', function(e) {
    if (!GUI.isActiveInstance(gui) || e.repeat && e.keyCode == 32) return;
    updateControlKeys(e, 'keyup');
    self.dispatchEvent('keydown', getEventData(e));
  });

  document.addEventListener('mousemove', function(e) {
    // refreshing these here to prevent problems when context menu opens
    updateControlKeys(e);
  });

  this.shiftIsPressed = () => shiftDown;
  this.ctrlIsPressed = () => ctrlDown;
  this.altIsPressed = () => altDown;
  this.metaIsPressed = () => metaDown;
  this.spaceIsPressed = () => spaceDown;

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
