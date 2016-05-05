/* @requires mapshaper-gui-lib, mapshaper-popup */

function InspectionControl(model, hit) {
  var _popup = new Popup();
  var _cli_inspect = api.inspect;
  var _lyr;
  var _inspecting = false;
  var _pinned = false; // TODO: switch to flag
  var _highId = -1;
  var _highShape = null;
  var _selectionIds = [];
  var _self = new EventDispatcher();

  var btn = gui.addSidebarButton("#info-icon2").on('click', function() {
    if (_inspecting) turnOff(); else turnOn();
  });

  _self.updateLayer = function(o) {
    var newShape;
    if (_inspecting && _highId > -1) {
      newShape = getShapeById(_highId, o);
      if (newShape != _highShape) {
        inspect(-1, false);
      } else {
        // kludge: re-display the inspector, in case data changed
        inspect(_highId, _pinned);
      }
    }
    hit.setLayer(o);
    _lyr = o;
  };

  // replace cli inspect command
  api.inspect = function(lyr, arcs, opts) {
    // TODO: make sure that lyr is the same as the active layer
    // (If a different layer is targeted, output could be written to the console
    var ids = MapShaper.selectFeatures(lyr, arcs, opts);
    if (ids.length === 0) {
      message("No features were selected");
      return;
    }
    btn.addClass('selected');
    reset();
    inspect(ids[0], true); // TODO: multiple selection
  };

  document.addEventListener('keydown', function(e) {
    var kc = e.keyCode, n, id;
    // arrow keys advance pinned feature unless user is editing text.
    if (!gui.getInputElement() && _pinned && (kc == 37 || kc == 39)) {
      n = MapShaper.getFeatureCount(_lyr.getDisplayLayer().layer);
      if (n > 1) {
        if (kc == 37) {
          id = (_highId + n - 1) % n;
        } else {
          id = (_highId + 1) % n;
        }
        inspect(id, true);
        e.stopPropagation();
      }
    }
  }, !!'capture'); // preempt the layer control's arrow key handler

  document.addEventListener('keydown', function(e) {
    if (e.keyCode == 27 && isOn() && !model.getMode()) { // esc key closes
      btn.toggleClass('selected');
      reset();
    }
  });

  hit.on('click', function(e) {
    var id = e.id;
    var pin = false;
    if (_pinned && id == _highId) {
      // clicking on pinned shape: unpin
    } else if (!_pinned && id > -1) {
      // clicking on unpinned shape while unpinned: pin
      pin = true;
    } else if (_pinned && id > -1) {
      // clicking on unpinned shape while pinned: pin new shape
      pin = true;
    } else if (!_pinned && id == -1) {
      // clicking off the layer while pinned: unpin and deselect
    }
    inspect(id, pin);
  });

  hit.on('hover', function(e) {
    var id = e.id;
    if (!_inspecting || _pinned || id == _highId) return;
    inspect(id, false);
  });

  function getShapeById(id, lyr) {
    var shapes = lyr.getDisplayLayer().layer.shapes;
    return shapes ? shapes[id] : null;
  }

  function showInspector(id, editable) {
    var o = _lyr.getDisplayLayer();
    var rec = o.layer.data ? o.layer.data.getRecordAt(id) : {};
    _popup.show(rec, o.layer.data, editable);
  }

  // @id Id of a feature in the active layer, or -1
  function inspect(id, pin) {
    if (!_inspecting) return;
    if (id > -1) {
      showInspector(id, pin);
      _highShape = getShapeById(id, _lyr);
    } else {
      _popup.hide();
      _highShape = null;
    }
    _highId = id;
    _pinned = pin;
    _self.dispatchEvent('change', {
      id: id,
      pinned: pin
    });
  }

  function turnOn() {
    btn.addClass('selected');
    _inspecting = true;
    hit.start();
  }

  function turnOff() {
    btn.removeClass('selected');
    hit.stop();
    if (_highId > -1) {
      inspect(-1);
      _inspecting = false;
    }
  }

  return _self;
}
