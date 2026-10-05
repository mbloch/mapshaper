import { internal } from './gui-core';
import { LabelSelection } from './gui-label-selection';

// Hover and selection cues for labels in the inspect and selection modes, in
// the same boxes the label tool draws, so that a label looks the same when it
// is pointed at or selected whichever mode does it. The canvas overlay leaves
// these labels alone (see gui-overlay-styler.mjs).
export function initLabelHitCues(gui, ext, hit) {
  var cues = new LabelSelection(gui, ext, hit, null, null, function() {
    return getLabelCueState(hit.getHitState());
  });
  var on = false;

  gui.on('interaction_mode_change', function() { update(true); });
  hit.on('change', function() { update(false); });
  // A redraw replaces the layer's markup and the cues with it, except for a
  // 'hover' draw, which leaves the SVG alone. This also catches a change of
  // target layer, which comes with a redraw.
  gui.on('map_rendered', function(e) {
    update(!e || e.action != 'hover');
  });

  function update(force) {
    var want = labelCuesApply(gui.interaction.getMode(), hit.getHitTarget());
    if (want && !on) {
      on = true;
      cues.turnOn();
    } else if (!want && on) {
      on = false;
      cues.turnOff();
    } else if (on) {
      cues.refresh(force);
    }
  }
}

export function labelCuesApply(mode, lyr) {
  return (mode == 'info' || mode == 'selection') && !!lyr &&
    !lyr.hidden && internal.layerHasLabels(lyr);
}

// Which labels are selected and which one is hovered, from the hit control's
// state. In selection mode the selected set is the hit ids, which include the
// labels inside a box being dragged. In inspect mode the hit ids are only what
// is under the pointer, and the one selected label is the pinned one.
export function getLabelCueState(o) {
  var id = o.id >= 0 ? o.id : -1;
  var selected;
  if (o.mode == 'selection') {
    selected = o.ids || [];
  } else {
    selected = o.pinned && id > -1 ? [id] : [];
  }
  return {
    selected: selected,
    hoverId: id > -1 && selected.indexOf(id) == -1 ? id : -1
  };
}
