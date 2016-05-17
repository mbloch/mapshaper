/* @requires mapshaper-gui-lib, mapshaper-popup */

function InspectionControl(model, hit) {
  var _popup = new Popup();
  var _inspecting = false;
  var _pinned = false;
  var _highId = -1;
  var _selectionIds = null;
  var btn = gui.addSidebarButton("#info-icon2").on('click', function() {
    if (_inspecting) turnOff(); else turnOn();
  });
  var _self = new EventDispatcher();
  var _shapes, _lyr;

  _self.updateLayer = function(o) {
    var shapes = o.getDisplayLayer().layer.shapes;
    if (_inspecting) {
      // kludge: check if shapes have changed
      if (_shapes == shapes) {
        // kludge: re-display the inspector, in case data changed
        inspect(_highId, _pinned);
      } else {
        _selectionIds = null;
        inspect(-1, false);
      }
    }
    hit.setLayer(o);
    _shapes = shapes;
    _lyr = o;
  };

  // replace cli inspect command
  api.inspect = function(lyr, arcs, opts) {
    var ids;
    if (lyr != model.getEditingLayer().layer) {
      error("Only the active layer can be targeted");
    }
    ids = MapShaper.selectFeatures(lyr, arcs, opts);
    if (ids.length === 0) {
      message("No features were selected");
      return;
    }
    _selectionIds = ids;
    turnOn();
    inspect(ids[0], true);
  };

  document.addEventListener('keydown', function(e) {
    var kc = e.keyCode, n, id;
    if (!_inspecting) return;

    // esc key closes (unless in an editing mode)
    if (e.keyCode == 27 && _inspecting && !model.getMode()) {
      turnOff();

    // arrow keys advance pinned feature unless user is editing text.
    } else if ((kc == 37 || kc == 39) && _pinned && !gui.getInputElement()) {
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
    inspect(id, pin, e.ids);
  });

  hit.on('hover', function(e) {
    var id = e.id;
    if (!_inspecting || _pinned) return;
    inspect(id, false, e.ids);
  });

  function showInspector(id, editable) {
    var o = _lyr.getDisplayLayer();
    var table = o.layer.data || null;
    var rec = table ? table.getRecordAt(id) : {};
    _popup.show(rec, table, editable);
  }

  // @id Id of a feature in the active layer, or -1
  function inspect(id, pin, ids) {
    if (!_inspecting) return;
    if (id > -1) {
      showInspector(id, pin);
    } else {
      _popup.hide();
    }
    _highId = id;
    _pinned = pin;
    _self.dispatchEvent('change', {
      selection_ids: _selectionIds || [],
      hover_ids: ids || [],
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
    _selectionIds = null;
    inspect(-1); // clear the map
    _inspecting = false;
  }

  return _self;
}
