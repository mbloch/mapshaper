import { HighlightBox } from './gui-highlight-box';
import { mapshaper, internal, utils } from './gui-core';
import { SimpleButton } from './gui-elements';
import { ToggleButton } from './gui-mode-button';
import { getBBoxCoords } from './gui-display-utils';
import { El } from './gui-el';
import { GUI } from './gui-lib';

export function SelectionTool(gui, ext, hit) {
  var popup = gui.container.findChild('.selection-tool-options');
  var box = new HighlightBox(gui);
  var coords = popup.findChild('.box-coords').hide();
  var _on = false;

  gui.addMode('selection_tool', turnOn, turnOff);

  gui.on('interaction_mode_change', function(e) {
    if (e.mode === 'selection') {
      gui.enterMode('selection_tool');
    } else if (gui.getMode() == 'selection_tool') {
      gui.clearMode();
    }
  });

  box.on('drag', function(e) {
    if (!_on) return;
    updateSelection(box.getDataCoords(), true);
  });

  box.on('dragend', function(e) {
    if (!_on) return;
    updateSelection(box.getDataCoords());
  });

  gui.on('selection_bridge', function(e) {
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
    box.turnOn();
    _on = true;
  }

  function turnOff() {
    dataBtn.turnOff();
    box.turnOff();
    reset();
    _on = false;
    if (gui.interaction.getMode() == 'selection') {
      // mode change was not initiated by interactive menu -- turn off interactivity
      gui.interaction.turnOff();
    }
  }

  function reset() {
    hidePopup();
    setPinning(false);
    hit.clearSelection();
  }

  function setPinning(on) {
    hit.setPinning(on);
    if (on) dataBtn.turnOn();
    else dataBtn.turnOff();
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
      updateCoords();
    } else {
      hidePopup();
    }
  });

  function hidePopup() {
    popup.hide();
    hideCoords();
  }

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

  var dataBtn = new ToggleButton(popup.findChild('.data-btn')).on('click', function(e) {
    setPinning(e.on);
  });

  new SimpleButton(popup.findChild('.duplicate-btn')).on('click', function() {
    var cmd = '-filter + name=selection ids=' + getIdsOpt();
    runCommand(cmd);
  });

  var coordsBtn = new SimpleButton(popup.findChild('.coords-btn')).on('click', function() {
    if (coords.visible()) hideCoords(); else showCoords();
  });

  new SimpleButton(popup.findChild('.cancel-btn')).on('click', function() {
    hit.clearSelection();
  });

  function getSelectionBounds() {
    var ids = hit.getSelectionIds();
    if (ids.length === 0) return null;
    var {layer, dataset} = gui.model.getActiveLayer();
    var filtered = {
      geometry_type: layer.geometry_type,
      shapes: ids.map(id => layer.shapes[id])
    };
    var bbox = internal.getLayerBounds(filtered, dataset.arcs).toArray();
    return internal.getRoundedCoords(bbox, internal.getBoundsPrecisionForDisplay(bbox));
  }

  function updateCoords() {
    if (coords.visible()) {
      showCoords();
    }
  }

  function showCoords() {
    var bbox = getSelectionBounds();
    if (!bbox) {
      hideCoords();
      return;
    }
    El(coordsBtn.node()).addClass('active');
    coords.text(bbox.join(','));
    coords.show();
    GUI.selectElement(coords.node());
  }

  function hideCoords() {
    El(coordsBtn.node()).removeClass('active');
    coords.hide();
  }

  function runCommand(cmd, turnOff) {
    hidePopup();
    gui.quiet(true);
    if (gui.console) gui.console.runMapshaperCommands(cmd, function(err) {
      gui.quiet(false);
      reset();
      if (turnOff) gui.clearMode();
    });
  }
}
