/* @requires gui-lib, gui-popup */

function InspectionControl2(gui, hit) {
  var model = gui.model;
  var _popup = new Popup(gui, hit.getSwitchHandler(1), hit.getSwitchHandler(-1));
  var _self = new EventDispatcher();

  // state variables
  var _pinned = false;
  var _highId = -1;

  gui.on('interaction_mode_change', function(e) {
    if (e.mode == 'off') {
      turnOff();
    }
    // TODO: update popup if currently pinned
  });

  // inspector and label editing aren't fully synced - stop inspecting if label editor starts
  // REMOVED
  // gui.on('label_editor_on', function() {
  // });

  _popup.on('update', function(e) {
    var d = e.data;
    d.i = _highId; // need to add record id
    _self.dispatchEvent('data_change', d);
  });

  // replace cli inspect command
  // TODO: support multiple editors on the page
  // REMOVING gui output for -inspect command
  /*
  api.inspect = function(lyr, arcs, opts) {
    var ids;
    if (!_target) return; // control is disabled (selected layer is hidden, etc)
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
  */

  gui.keyboard.on('keydown', function(evt) {
    var e = evt.originalEvent;
    var kc = e.keyCode, n, id;
    if (!inspecting() || !hit.getHitTarget()) return;

    // esc key closes (unless in an editing mode)
    if (e.keyCode == 27 && inspecting() && !gui.getMode()) {
      turnOff();
      return;
    }

    if (_pinned && !GUI.getInputElement()) {
      // an element is selected and user is not editing text

      if (kc == 37 || kc == 39) {
        // arrow keys advance pinned feature
        n = internal.getFeatureCount(hit.getHitTarget().layer);
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

  hit.on('change', function(e) {
    var ids;
    if (!inspecting()) return;
    ids = e.mode == 'selection' ? null : e.ids;
    inspect(e.id, e.pinned, ids);
  });

  function showInspector(id, ids, pinned) {
    var target = hit.getHitTarget();
    var editable = pinned && gui.interaction.getMode() == 'data';
    // if (target && target.layer.data) {
    if (target && target.layer) { // show popup even if layer has no attribute data
      _popup.show(id, ids, target.layer.data, pinned, editable);
    }
  }

  // @id Id of a feature in the active layer, or -1
  function inspect(id, pin, ids) {
    _pinned = pin;
    if (id > -1 && inspecting()) {
      showInspector(id, ids, pin);
    } else {
      _popup.hide();
    }
  }

  // does the attribute inspector appear on rollover
  function inspecting() {
    return gui.interaction && gui.interaction.getMode() != 'off';
  }

  function turnOff() {
    inspect(-1); // clear the map
  }

  function deletePinnedFeature() {
    var lyr = model.getActiveLayer().layer;
    console.log("delete; pinned?", _pinned, "id:", _highId);
    if (!_pinned || _highId == -1) return;
    lyr.shapes.splice(_highId, 1);
    if (lyr.data) lyr.data.getRecords().splice(_highId, 1);
    inspect(-1);
    model.updated({flags: 'filter'});
  }

  return _self;
}
