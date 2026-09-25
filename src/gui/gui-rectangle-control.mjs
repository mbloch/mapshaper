import { HighlightBox } from './gui-highlight-box';
import { internal } from './gui-core';
import { setRectangleCoords, getVertexCoords } from './gui-drawing-utils';

export function RectangleControl(gui, hit) {
  var box = new HighlightBox(gui, {name: 'rectangle-tool', persistent: true, handles: true, classname: 'rectangles', draggable: false});
  var _on = false;
  var dragInfo;

  gui.addMode('rectangle_tool', turnOn, turnOff);

  gui.on('interaction_mode_change', function(e) {
    if (e.mode === 'rectangles') {
      gui.enterMode('rectangle_tool');
    } else if (gui.getMode() == 'rectangle_tool') {
      // Leave the gui mode rather than just calling turnOff(): a mode left
      // behind makes the next enterMode('rectangle_tool') a no-op, so the tool
      // would never turn back on.
      gui.clearMode();
    }
  });

  hit.on('change', function(e) {
    if (!_on) return;
    // TODO: handle multiple hits (see gui-inspection-control)
    if (e.id > -1 && e.pinned) {
      if (!dragInfo || dragInfo.id != e.id) {
        selectRectangle(e.id);
      }
    } else {
      reset();
    }
  });

  box.on('handle_drag', function(e) {
    if (!_on || !dragInfo) return;
    var coords = internal.bboxToCoords(box.getDataCoords());
    setRectangleCoords(dragInfo.target, dragInfo.ids, coords);
    dragInfo.moved = true;
    gui.dispatchEvent('map-needs-refresh');
  });

  // Each handle drag is one undo step, saved when it ends -- waiting until the
  // rectangle is deselected would lose the edit if the mode changes first.
  box.on('handle_up', function() {
    if (!_on || !dragInfo || !dragInfo.moved) return;
    gui.dispatchEvent('rectangle_dragend', {
      target: dragInfo.target,
      ids: dragInfo.ids,
      points: dragInfo.points
    });
    dragInfo.points = getDataPoints(dragInfo.target, dragInfo.ids);
    dragInfo.moved = false;
  });

  function selectRectangle(id) {
    var target = hit.getHitTarget();
    var path = target.shapes[id][0];
    var bbox = target.gui.displayArcs.getSimpleShapeBounds(path).toArray();
    var ids = [];
    var iter = target.gui.displayArcs.getShapeIter(path);
    while (iter.hasNext()) {
      ids.push(iter._arc.i);
    }
    box.setDataCoords(bbox);
    dragInfo = {
      id: id,
      target: target,
      ids: ids,
      points: getDataPoints(target, ids), // for undo
      moved: false
    };
    gui.container.findChild('.map-layers').classed('dragging', true);
  }

  function getDataPoints(target, ids) {
    return ids.map(function(id) {
      return getVertexCoords(target, id);
    });
  }

  function turnOn() {
    box.turnOn();
    _on = true;
  }

  function turnOff() {
    box.turnOff();
    if (gui.interaction.getMode() == 'rectangles') {
      // mode change was not initiated by interactive menu -- turn off interactivity
      gui.interaction.turnOff();
    }
    _on = false;
    reset();
  }

  function reset() {
    box.hide();
    if (dragInfo) {
      gui.container.findChild('.map-layers').classed('dragging', false);
    }
    dragInfo = null;
  }
}
