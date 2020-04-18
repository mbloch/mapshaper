import { Popup } from './gui-popup';
import { EventDispatcher } from './gui-events';

export function InspectionControl2(gui, hit) {
  var _popup = new Popup(gui, hit.getSwitchTrigger(1), hit.getSwitchTrigger(-1));
  var _self = new EventDispatcher();

  gui.on('interaction_mode_change', function(e) {
    if (e.mode == 'off') {
      inspect(-1); // clear the popup
    }
  });

  _popup.on('update', function(e) {
    _self.dispatchEvent('data_change', e.data); // let map know which field has changed
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
    return gui.interaction && gui.interaction.getMode() != 'off';
  }

  return _self;
}
