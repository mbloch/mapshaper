import { ModeButton } from './gui-mode-button';
import { utils } from './gui-core';
import { EventDispatcher } from './gui-events';

export function ModeSwitcher() {
  var self = this;
  var mode = null;

  self.getMode = function() {
    return mode;
  };

  // return a function to trigger this mode
  self.addMode = function(name, enter, exit, btn) {
    self.on('mode', function(e) {
      if (e.prev == name) {
        exit();
      }
      if (e.name == name) {
        enter();
      }
    });
    if (btn) {
      new ModeButton(self, btn, name);
    }
  };

  self.addMode(null, function() {}, function() {}); // null mode

  self.clearMode = function() {
    self.enterMode(null);
  };

  self.enterMode = function(next) {
    var prev = mode;
    if (next != prev) {
      mode = next;
      self.dispatchEvent('mode', {name: next, prev: prev});
    }
  };
}

utils.inherit(ModeSwitcher, EventDispatcher);
