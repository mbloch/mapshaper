/* @requires mapshaper-gui-lib, mapshaper-popup */

function InfoControl(model, hit) {
  var _popup = new Popup();

  new ModeButton('#select-btn', 'select', model);
  model.addMode('select', turnOn, turnOff);

  /*
  model.on('mode', function(e) {
    active = !e.name; // active in null mode
  });
  */

  model.on('select', function(e) {
    // TODO: update hit layer
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
