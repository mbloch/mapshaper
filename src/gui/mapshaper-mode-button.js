/* @requires mapshaper-gui-lib */

function ModeButton(el, name, model) {
  var btn = El(el),
      active = false;
  model.on('mode', function(e) {
    active = e.name == name;
    if (active) {
      btn.addClass('active');
    } else {
      btn.removeClass('active');
    }
  });

  btn.on('click', function() {
    model.enterMode(active ? null : name);
  });
}
