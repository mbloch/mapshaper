import { HighlightBox } from './gui-highlight-box';
import { internal } from './gui-core';
import { SimpleButton } from './gui-elements';

export function SelectionTool(gui, ext, hit) {
  var popup = gui.container.findChild('.selection-tool-options');
  var box = new HighlightBox('body');
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
  });

  gui.on('box_drag_end', function(e) {
    if (!_on) return;
    box.hide();
    var bboxPixels = e.map_bbox;
    var bbox = bboxToCoords(bboxPixels);
    var active = gui.model.getActiveLayer();
    var ids = internal.findShapesIntersectingBBox(bbox, active.layer, active.dataset.arcs);
    if (!ids.length) return;
    hit.addSelectionIds(ids);
  });

  function turnOn() {
    _on = true;
  }

  function bboxToCoords(bbox) {
    var a = ext.translatePixelCoords(bbox[0], bbox[1]);
    var b = ext.translatePixelCoords(bbox[2], bbox[3]);
    return [a[0], b[1], b[0], a[1]];
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
    var cmd = '-filter "' + getFilterExp(hit.getSelectionIds(), true) + '"';
    runCommand(cmd);
    hit.clearSelection();
  });

  new SimpleButton(popup.findChild('.filter-btn')).on('click', function() {
    var cmd = '-filter "' + getFilterExp(hit.getSelectionIds(), false) + '"';
    runCommand(cmd);
    hit.clearSelection();
  });

  new SimpleButton(popup.findChild('.split-btn')).on('click', function() {
    var cmd = '-each "split_id = ' + getFilterExp(hit.getSelectionIds(), false) +
      ' ? \'1\' : \'2\'" -split split_id';
    runCommand(cmd);
    hit.clearSelection();
  });

  new SimpleButton(popup.findChild('.cancel-btn')).on('click', function() {
    hit.clearSelection();
  });

  function getFilterExp(ids, invert) {
    return JSON.stringify(ids) + '.indexOf(this.id) ' + (invert ? '== -1' : '> -1');
  }

  function runCommand(cmd) {
    if (gui.console) gui.console.runMapshaperCommands(cmd, function(err) {});
    reset();
  }
}
