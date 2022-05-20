import { HighlightBox } from './gui-highlight-box';
import { internal, utils } from './gui-core';
import { SimpleButton } from './gui-elements';


export function SelectionTool(gui, ext, hit) {
  var popup = gui.container.findChild('.selection-tool-options');
  var box = new HighlightBox();
  var _on = false;

  gui.addMode('selection_tool', turnOn, turnOff);

  gui.on('interaction_mode_change', function(e) {
    if (e.mode === 'selection') {
      gui.enterMode('selection_tool');
    } else if (gui.getMode() == 'selection_tool') {
      gui.clearMode();
    }
  });

  gui.on('box_drag', function(e) {
    if (!_on) return;
    var b = e.page_bbox;
    box.show(b[0], b[1], b[2], b[3]);
    updateSelection(e.map_data_bbox, true);
  });

  gui.on('box_drag_end', function(e) {
    if (!_on) return;
    box.hide();
    updateSelection(e.map_data_bbox);
  });

  function updateSelection(bbox, transient) {
    var active = gui.model.getActiveLayer();
    var ids = internal.findShapesIntersectingBBox(bbox, active.layer, active.dataset.arcs);
    if (transient) {
      hit.setTransientIds(ids);
    } else if (ids.length) {
      hit.addSelectionIds(ids);
    }
  }

  function turnOn() {
    _on = true;
  }

  function turnOff() {
    reset();
    _on = false;
    if (gui.interaction.getMode() == 'selection') {
      // mode change was not initiated by interactive menu -- turn off interactivity
      gui.interaction.turnOff();
    }
  }

  function reset() {
    popup.hide();
    hit.clearSelection();
  }

  function getIdsOpt() {
    return hit.getSelectionIds().join(',');
  }

  hit.on('change', function(e) {
    if (e.mode != 'selection') return;
    var ids = hit.getSelectionIds();
    if (ids.length > 0) {
      // enter this mode when we're ready to show the selection options
      // (this closes any other active mode, e.g. box_tool)
      gui.enterMode('selection_tool');
      popup.show();
    } else {
      popup.hide();
    }
  });

  new SimpleButton(popup.findChild('.delete-btn')).on('click', function() {
    var cmd = '-filter invert ids=' + getIdsOpt();
    runCommand(cmd);
  });

  new SimpleButton(popup.findChild('.filter-btn')).on('click', function() {
    var cmd = '-filter ids=' + getIdsOpt();
    runCommand(cmd);
  });

  new SimpleButton(popup.findChild('.split-btn')).on('click', function() {
    var cmd = '-split ids=' + getIdsOpt();
    runCommand(cmd);
  });

  new SimpleButton(popup.findChild('.cancel-btn')).on('click', function() {
    hit.clearSelection();
  });

  function runCommand(cmd) {
    popup.hide();
    if (gui.console) gui.console.runMapshaperCommands(cmd, function(err) {
      reset();
    });
  }
}
