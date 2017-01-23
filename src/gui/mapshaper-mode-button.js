/* @requires mapshaper-gui-lib */

function ModeButton(el, name) {
  var btn = El(el),
      active = false;
  gui.on('mode', function(e) {
    active = e.name == name;
    if (active) {
      btn.addClass('active');
    } else {
      btn.removeClass('active');
    }
  });

  btn.on('click', function() {
    gui.enterMode(active ? null : name);
  });
}
