/* @requires mapshaper-gui-lib, mapshaper-popup */

function InfoControl(model, hit) {
  var _popup = new Popup();
  var btn = gui.addSidebarButton("#info-icon").on('click', function() {
    btn.toggleClass('selected');
    if (btn.hasClass('selected')) {
      turnOn();
    } else {
      turnOff();
    }
  });

  hit.on('change', function(e) {
    if (e.properties) {
      _popup.show(e.properties);
    } else {
      _popup.hide();
    }
  });

  function turnOn() {
    hit.turnOn(model.getEditingLayer());
  }

  function turnOff() {
    _popup.hide();
    hit.turnOff();
  }

}
