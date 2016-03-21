/* @requires mapshaper-gui-lib, mapshaper-popup */

function InfoControl(model, hit) {
  var _popup = new Popup();
  var btn = gui.addSidebarButton("#info-icon2").on('click', function() {
    btn.toggleClass('selected');
    reset();
  });

  model.on('update', function(e) {
    if (isOn()) {
      if (e.flags.select) {
        // hide popup if new layer has been selected
        _popup.hide();
      }
      // hit detection receives current data elsewhere
      // hit.start(model.getEditingLayer());
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.keyCode == 27 && isOn() && !model.getMode()) { // esc key closes
      btn.toggleClass('selected');
      reset();
    }
  });

  hit.on('change', function(e) {
    var types;
    if (e.properties) {
      _popup.show(e.properties, e.table, !!e.pinned);
    } else {
      _popup.hide();
    }
  });

  function isOn() {
    return btn.hasClass('selected');
  }

  function reset() {
    _popup.hide();
    if (isOn()) {
      hit.start();
    } else {
      hit.stop();
    }
  }
}
