/* @requires mapshaper-gui-lib, mapshaper-popup */

function InfoControl(model, hit) {
  var _popup = new Popup();
  var btn = gui.addSidebarButton("#info-icon").on('click', function() {
    btn.toggleClass('selected');
    update();
  });

  model.on('select', update);

  hit.on('change', function(e) {
    var types;
    if (e.properties) {
      if (e.pinned) {
        types = MapShaper.getFieldEditorTypes(e.properties, e.table);
      }
      _popup.show(e.properties, types);
    } else {
      _popup.hide();
    }
  });

  function isOn() {
    return btn.hasClass('selected');
  }

  function update() {
    _popup.hide();
    if (isOn()) {
      hit.turnOn(model.getEditingLayer());
    } else {
      hit.turnOff();
    }
  }
}

MapShaper.getFieldEditorTypes = function(rec, table) {
  var index = {};
  utils.forEachProperty(rec, function(val, key) {
    var type;
    if (utils.isString(val)) {
      type = 'string';
    } else if (utils.isNumber(val)) {
      type = 'number';
    } else if (utils.isBoolean(val)) {
      type = 'boolean';
    }
    index[key] = type;
  });
  return index;
};
