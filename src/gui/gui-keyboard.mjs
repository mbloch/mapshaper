import { utils } from './gui-core';
import { EventDispatcher } from './gui-events';
import { GUI } from './gui-lib';

// export var ESC = 27;
export var SPACE = 32;

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
    if (e.keyCode == SPACE) {
      spaceDown = evtName == 'keydown';
    }
  }

  function mouseIsPressed() {
    return gui.map.getMouse().isDown();
  }

  document.addEventListener('keyup', function(e) {
    if (!GUI.isActiveInstance(gui) || e.repeat && e.keyCode == SPACE) return;
    updateControlKeys(e, 'keyup');
    self.dispatchEvent('keyup', getEventData(e));
  });

  document.addEventListener('keydown', function(e) {
    if (!GUI.isActiveInstance(gui) || e.repeat && e.keyCode == SPACE) return;
    updateControlKeys(e, 'keydown');
    self.dispatchEvent('keydown', getEventData(e));
    // The editing tools that have something to select take Cmd-A first. Anywhere
    // else, the browser's own select-all would select the text of the whole
    // page -- panels, menus, the console -- which is never what it means here.
    // In a text field it selects the field's text, as it does everywhere.
    if (isSelectAllKey(e) && !e.defaultPrevented && !focusIsInTextField()) {
      e.preventDefault();
    }
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

// Cmd-A on a Mac, Ctrl-A elsewhere. Read from the key rather than the keyCode,
// as undo and redo are.
//   evt: a native keyboard event
export function isSelectAllKey(evt) {
  if (!evt || !(evt.metaKey || evt.ctrlKey) || evt.shiftKey || evt.altKey) return false;
  return (evt.key || '').toLowerCase() == 'a';
}

// Whether the keyboard is typing into a text field -- the console's command
// line, a panel's field, a label being edited -- where Cmd-A selects the
// field's text, as it does anywhere else
export function focusIsInTextField() {
  var el = document.activeElement;
  if (!el) return false;
  if (el.isContentEditable || el.nodeName == 'TEXTAREA') return true;
  return el.nodeName == 'INPUT' &&
    !/^(button|checkbox|radio|submit|range|color|file)$/.test(el.type);
}

// Cmd-A that selects objects in an editing tool, rather than text in a field
export function isSelectAllObjectsKey(evt) {
  return isSelectAllKey(evt) && !focusIsInTextField();
}

function getEventData(originalEvent) {
  var keyCode = originalEvent.keyCode;
  var keyName = names[keyCode] || '';
  return {originalEvent, keyCode, keyName};
}

utils.inherit(KeyboardEvents, EventDispatcher);
