/* @requires mapshaper-gui-lib, mapshaper-popup */

function InfoControl(model, hit) {
  var _popup = new Popup();
  var btn = gui.addSidebarButton("#info-icon").on('click', function() {
    btn.toggleClass('selected');
    reset();
  });

  model.on('update', function(e) {
    if (isOn()) {
      if (e.flags.select) {
        reset();
      } else {
        hit.refresh();
      }
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

  function reset() {
    _popup.hide();
    if (isOn()) {
      hit.start(model.getEditingLayer());
    } else {
      hit.stop();
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
