/* @requires mapshaper-gui-lib, mapshaper-popup */

function InfoControl(model, hit) {
  var _popup = new Popup();
  var btn = gui.addSidebarButton("#info-icon").on('click', function() {
    btn.toggleClass('selected');
    update();
  });

  model.on('select', update);

  hit.on('change', function(e) {
    if (e.properties) {
      _popup.show(e.properties);
    } else {
      _popup.hide();
    }
  });

  function isOn() {
    return btn.hasClass('selected');
  }

  function update() {
    if (isOn()) {
      hit.turnOn(model.getEditingLayer());
    } else {
      _popup.hide();
      hit.turnOff();
    }
  }

}
