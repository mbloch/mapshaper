import { El } from './gui-el';
import { EventDispatcher } from './gui-events';

export function ModeButton(modes, el, name) {
  var btn = El(el),
      active = false;
  modes.on('mode', function(e) {
    active = e.name == name;
    if (active) {
      btn.addClass('active');
    } else {
      btn.removeClass('active');
    }
  });

  btn.on('click', function() {
    modes.enterMode(active ? null : name);
  });
}

export function ToggleButton(el) {
  var btn = El(el),
      self = new EventDispatcher(),
      on = false;

  btn.on('click', function(e) {
    on = !on;
    btn.classed('active', on);
    self.dispatchEvent('click', {on: on, active: on});
  });

  self.turnOff = function() {
    on = false;
    btn.removeClass('active');
  };

  self.turnOn = function() {
    on = true;
    btn.addClass('active');
  };

  return self;
}
