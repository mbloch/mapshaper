/* @requires mapshaper-gui-lib, mapshaper-popup */

function InfoControl(model, hit) {
  var _popup = new Popup();
  var _pinId = -1;
  var _hoverId = -1;
  var btn = gui.addSidebarButton("#info-icon").on('click', function() {
    btn.toggleClass('selected');
    update();
  });

  model.on('select', update);

  hit.on('change', function(e) {
    if (_pinId == -1) {
      if (e.properties) {
        _popup.show(e.properties);
      } else {
        _popup.hide();
      }
    }
    _hoverId = e.id;
  });

  hit.on('click', function(e) {
    if (e.id == _pinId) {
      _pinId = -1;
    } else {
      _popup.show(e.properties);
      _pinId = e.id;
    }
  });

  function isOn() {
    return btn.hasClass('selected');
  }

  function pin() {
    _pinId = _hoverId;
  }

  function unPin() {
    _pinId = -1;
  }

  function update() {
    if (isOn()) {
      hit.turnOn(model.getEditingLayer());
    } else {
      _pinId = -1;
      _hoverId = -1;
      _popup.hide();
      hit.turnOff();
    }
  }

}
