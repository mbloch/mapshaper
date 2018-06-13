/* @requires mapshaper-gui-lib, mapshaper-popup, mapshaper-hit-control */

function InspectionControl(model, hit) {
  var _popup = new Popup(getSwitchHandler(1), getSwitchHandler(-1));
  var _inspecting = false;
  var _pinned = false;
  var _highId = -1;
  var _hoverIds = null;
  var _selectionIds = null;
  var btn = gui.addSidebarButton("#info-icon2").on('click', function() {
    gui.dispatchEvent('inspector_toggle');
  });
  var _self = new EventDispatcher();
  var _shapes, _lyr;

  gui.on('inspector_toggle', function() {
    if (_inspecting) turnOff(); else turnOn();
  });

  // inspector and label editing aren't fully synced - stop inspecting if label editor starts
  gui.on('label_editor_on', function() {
    if (_inspecting) turnOff();
  });

  _popup.on('update', function(e) {
    var d = e.data;
    d.i = _highId; // need to add record id
    _self.dispatchEvent('data_change', d);
  });

  _self.updateLayer = function(o, style) {
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
    hit.setLayer(o, style);
    _shapes = shapes;
    _lyr = o;
  };

  // replace cli inspect command
  api.inspect = function(lyr, arcs, opts) {
    var ids;
    if (lyr != model.getActiveLayer().layer) {
      error("Only the active layer can be targeted");
    }
    ids = internal.selectFeatures(lyr, arcs, opts);
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
    if (e.keyCode == 27 && _inspecting && !gui.getMode()) {
      turnOff();
      return;
    }


    if (_pinned && !gui.getInputElement()) {
      // an element is selected and user is not editing text

      if (kc == 37 || kc == 39) {
        // arrow keys advance pinned feature
        n = internal.getFeatureCount(_lyr.getDisplayLayer().layer);
        if (n > 1) {
          if (kc == 37) {
            id = (_highId + n - 1) % n;
          } else {
            id = (_highId + 1) % n;
          }
          inspect(id, true);
          e.stopPropagation();
        }
      } else if (kc == 8) {
        // delete key
        // to help protect against inadvertent deletion, don't delete
        // when console is open or a popup menu is open
        if (!gui.getMode() && !gui.consoleIsOpen()) {
          deletePinnedFeature();
        }
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

  function getSwitchHandler(diff) {
    return function() {
      var i = (_hoverIds || []).indexOf(_highId);
      var nextId;
      if (i > -1) {
        nextId = _hoverIds[(i + diff + _hoverIds.length) % _hoverIds.length];
        inspect(nextId, true, _hoverIds);
      }
    };
  }

  function showInspector(id, ids, pinned) {
    var o = _lyr.getDisplayLayer();
    var table = o.layer.data || null;
    _popup.show(id, ids, table, pinned);
  }

  // @id Id of a feature in the active layer, or -1
  function inspect(id, pin, ids) {
    if (!_inspecting) return;
    if (id > -1) {
      showInspector(id, ids, pin);
    } else {
      _popup.hide();
    }
    _highId = id;
    _hoverIds = ids;
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
    gui.dispatchEvent('inspector_on');
  }

  function turnOff() {
    btn.removeClass('selected');
    hit.stop();
    _selectionIds = null;
    inspect(-1); // clear the map
    _inspecting = false;
  }

  function deletePinnedFeature() {
    var lyr = model.getActiveLayer().layer;
    if (!_pinned || _highId == -1) return;
    lyr.shapes.splice(_highId, 1);
    if (lyr.data) lyr.data.getRecords().splice(_highId, 1);
    inspect(-1);
    model.updated({flags: 'filter'});
  }

  return _self;
}
