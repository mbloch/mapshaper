import { Popup } from './gui-popup';
import { EventDispatcher } from './gui-events';
import { internal } from './gui-core';

export function InspectionControl2(gui, hit) {
  var _popup = new Popup(gui, hit.getSwitchTrigger(1), hit.getSwitchTrigger(-1));
  var _self = new EventDispatcher();

  gui.on('interaction_mode_change', function(e) {
    if (!gui.interaction.modeUsesPopup(e.mode)) {
      inspect(-1); // clear the popup
    }
  });

  _popup.on('data_updated', function(e) {
    // data_change event no longer needed (update is handled below)
    // _self.dispatchEvent('data_change', e.data); // let map know which field has changed
    gui.session.dataValueUpdated(e.ids, e.field, e.value);
    // Refresh the display if a style variable has been changed interactively
    if (internal.isSupportedSvgStyleProperty(e.field)) {
      gui.dispatchEvent('map-needs-refresh');
    }
  });

  hit.on('contextmenu', function(e) {
    var target = hit.getHitTarget();
    if (!e.overMap || !target || e.mode == 'edit_lines' ||
        e.mode == 'edit_polygons' || e.mode == 'edit_points') {
      return;
    }
    gui.contextMenu.open(e, hit.getHitTarget());
  });

  hit.on('change', function(e) {
    if (!inspecting()) return;
    if (gui.keyboard.ctrlIsPressed()) return;
    var ids;
    if (e.mode == 'selection') {
      ids = e.pinned && e.ids || [];
    } else {
      ids = e.ids || [];
    }
    inspect(e.id, ids, e.pinned);
  });

  // id: Id of a feature in the active layer, or -1
  function inspect(id, ids, pin) {
    var target = hit.getHitTarget();
    if ((id > -1 || ids && ids.length > 0) && inspecting() && target && target) {
      _popup.show(id, ids, target, pin);
    } else {
      _popup.hide();
    }
  }

  // does the attribute inspector appear on rollover
  function inspecting() {
    return gui.interaction && gui.interaction.modeUsesPopup(gui.interaction.getMode());
  }

  return _self;
}
