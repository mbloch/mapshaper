import { HighlightBox } from './gui-highlight-box';
import { internal } from './gui-core';
import { setRectangleCoords } from './gui-drawing-utils';

export function RectangleControl(gui, hit) {
  var box = new HighlightBox(gui, {name: 'rectangle-tool', persistent: true, handles: true, classname: 'rectangles', draggable: false});
  var _on = false;
  var dragInfo;

  gui.addMode('rectangle_tool', turnOn, turnOff);

  gui.on('interaction_mode_change', function(e) {
    if (e.mode === 'rectangles') {
      gui.enterMode('rectangle_tool');
    } else if (gui.getMode() == 'rectangle_tool') {
      gui.clearMode();
    }
  });

  hit.on('change', function(e) {
    if (!_on) return;
    // TODO: handle multiple hits (see gui-inspection-control)
    var id = e.id;
    if (e.id > -1 && e.pinned) {
      var target = hit.getHitTarget();
      var path = target.layer.shapes[e.id][0];
      var bbox = target.arcs.getSimpleShapeBounds(path).toArray();
      box.setDataCoords(bbox);
      dragInfo = {
        id: e.id,
        target: target,
        ids: [],
        points: []
      };
      var iter = target.arcs.getShapeIter(path);
      while (iter.hasNext()) {
        dragInfo.points.push([iter.x, iter.y]);
        dragInfo.ids.push(iter._arc.i);
      }
      gui.container.findChild('.map-layers').classed('dragging', true);

    } else if (dragInfo) {
      gui.dispatchEvent('rectangle_dragend', dragInfo); // save undo state
      gui.container.findChild('.map-layers').classed('dragging', false);
      reset();
    } else {
      box.hide();
    }

  });

  box.on('handle_drag', function(e) {
    if (!_on || !dragInfo) return;
    var coords = internal.bboxToCoords(box.getDataCoords());
    setRectangleCoords(dragInfo.target, dragInfo.ids, coords);
    gui.dispatchEvent('map-needs-refresh');
  });

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
    dragInfo = null;
  }
}
