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

  _popup.on('update', function(e) {
    // data_change event no longer needed (update is handled below)
    // _self.dispatchEvent('data_change', e.data); // let map know which field has changed
    gui.session.dataValueUpdated(e.id, e.field, e.value);
    // Refresh the display if a style variable has been changed interactively
    if (internal.isSupportedSvgStyleProperty(e.field)) {
      // drawLayers();
      gui.dispatchEvent('map-needs-refresh');
    }
  });

  hit.on('change', function(e) {
    var ids;
    if (!inspecting()) return;
    ids = e.mode == 'selection' ? null : e.ids;
    inspect(e.id, e.pinned, ids);
  });

  // id: Id of a feature in the active layer, or -1
  function inspect(id, pin, ids) {
    var target = hit.getHitTarget();
    if (id > -1 && inspecting() && target && target.layer) {
      _popup.show(id, ids, target.layer, pin);
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
