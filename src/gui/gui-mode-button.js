import { El } from './gui-el';

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
