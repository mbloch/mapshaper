import { HighlightBox } from './gui-highlight-box';
import { internal } from './gui-core';
import { setRectangleCoords, getVertexCoords } from './gui-drawing-utils';
import { translateDisplayPoint } from './gui-display-utils';
import { getCornerForRatio } from './gui-frame-aspect';
import { runGuiEditCommand } from './gui-edit-command';
import { getAddRectangleCommand } from './gui-draw-commands';
import { layerHasDrawableStyle } from './gui-layer-styler';
import { getNewShapeCommandStyle, getNewShapeStyleFields } from './gui-shape-style-state';

// The smallest rectangle a second click makes, in pixels on each side. A
// click closer to the first corner than this (the second click of a
// double-click, say) is ignored, and the rectangle goes on following the
// pointer.
var MIN_RECTANGLE_PX = 3;

// The 'rectangles' interaction mode, offered on a layer of rectangles and
// opened by the layer panel's Draw > rectangles. A click on a rectangle
// selects it, with handles for resizing it; a click on empty map starts a new
// rectangle, and a second click finishes it, so that a drag still pans the
// map. Shift makes a square.
//
// A drawn rectangle is an -add-shape command: one undo step and a line in the
// session history. A resize edits the vertices in place, and is an undo step
// of its own (see 'rectangle_dragend' in gui-undo.mjs).
export function RectangleControl(gui, hit) {
  var box = new HighlightBox(gui, {name: 'rectangle-tool', persistent: true, handles: true, classname: 'rectangles', draggable: false});
  var mouse = gui.map.getMouse();
  var _on = false;
  var dragInfo;
  var drawStart = null; // pixel location of the first corner, while drawing

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
    updateCursor(e);
    // TODO: handle multiple hits (see gui-inspection-control)
    if (e.id > -1 && e.pinned) {
      if (!dragInfo || dragInfo.id != e.id) {
        selectRectangle(e.id);
      }
    } else {
      reset();
    }
  });

  // Above the hit control, which takes a click on a rectangle, or off the
  // selected one, and lets a click on empty map through to the map
  mouse.on('click', function(e) {
    if (!_on || gui.keyboard.ctrlIsPressed()) return;
    if (drawStart) {
      e.stopPropagation();
      finishDrawing(e);
    } else if (hit.getHitId() == -1) {
      e.stopPropagation();
      drawStart = [e.x, e.y];
      updatePreview(e);
    }
  }, null, 3);

  // a double-click while drawing would otherwise zoom the map
  mouse.on('dblclick', function(e) {
    if (_on && drawStart) e.stopPropagation();
  }, null, 3);

  mouse.on('hover', function(e) {
    if (_on && drawStart) updatePreview(e);
  });

  gui.keyboard.on('keydown', function(e) {
    if (_on && drawStart && e.keyName == 'esc') {
      cancelDrawing();
      e.stopPropagation();
    }
  }, null, 10);

  if (gui.undo) {
    // undo takes back the first corner of a rectangle being drawn
    gui.undo.addInterceptor({
      undo: function() {
        if (!_on || !drawStart) return false;
        cancelDrawing();
        return true;
      }
    });
  }

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

  // The rectangle from the first corner to the pointer: {display, pixels},
  // its bounding box in display coordinates and its size in pixels
  function getDrawnBox(e) {
    var ext = gui.map.getExtent();
    var p = gui.keyboard.shiftIsPressed() ?
      getCornerForRatio(drawStart[0], drawStart[1], e.x, e.y, 1) : [e.x, e.y];
    var a = ext.pixCoordsToMapCoords(drawStart[0], drawStart[1]);
    var b = ext.pixCoordsToMapCoords(p[0], p[1]);
    return {
      display: [Math.min(a[0], b[0]), Math.min(a[1], b[1]),
        Math.max(a[0], b[0]), Math.max(a[1], b[1])],
      pixels: [Math.abs(p[0] - drawStart[0]), Math.abs(p[1] - drawStart[1])]
    };
  }

  function updatePreview(e) {
    hit.setPendingPath(internal.bboxToCoords(getDrawnBox(e).display));
  }

  function finishDrawing(e) {
    var drawn = getDrawnBox(e);
    var target = hit.getHitTarget();
    var bbox;
    if (drawn.pixels[0] < MIN_RECTANGLE_PX || drawn.pixels[1] < MIN_RECTANGLE_PX) {
      return;
    }
    cancelDrawing();
    bbox = target && toLayerBbox(target, drawn.display);
    if (!bbox) return;
    runGuiEditCommand(gui, getAddRectangleCommand(bbox, {style: getNewRectangleStyle(target)}), {
      title: 'Draw rectangle',
      changesEditTarget: true,
      onSuccess: selectNewRectangle
    });
  }

  function cancelDrawing() {
    drawStart = null;
    hit.setPendingPath(null);
    updateCursor(hit.getHitState());
  }

  // The new rectangle is the last feature in the layer
  function selectNewRectangle() {
    var target = hit.getHitTarget();
    var n = target ? internal.getFeatureCount(target) : 0;
    if (_on && n > 0) hit.pinFeature(n - 1);
  }

  // As the box tool does it (see translateCoordsToLayerCRS() in
  // gui-highlight-box.mjs): a layer drawn in another CRS gets the box around
  // the corners, which is a rectangle in the layer's own coordinates.
  function toLayerBbox(target, bbox) {
    var a = translateDisplayPoint(target, [bbox[0], bbox[1]]);
    var b = translateDisplayPoint(target, [bbox[2], bbox[3]]);
    if (!a || !b) return null;
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]),
      Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  }

  // A layer with a style of its own draws an unstyled shape as nothing, so a
  // new rectangle in a styled layer takes the style of the last one -- the
  // rectangles of one layer (map frames, say) are usually styled alike.
  function getNewRectangleStyle(target) {
    var styled = layerHasDrawableStyle(target);
    var records = styled && target.data ? target.data.getRecords() : [];
    var last = records[records.length - 1] || {};
    var style = {};
    getNewShapeStyleFields('polygon').forEach(function(field) {
      if (field in last) style[field] = last[field];
    });
    return getNewShapeCommandStyle(style, styled);
  }

  function updateCursor(e) {
    var el = gui.container.findChild('.map-layers');
    el.classed('rectangle-tool', _on);
    // a click would select the rectangle under the pointer
    el.classed('rectangle-select', _on && !drawStart && e.id > -1 && !e.pinned);
  }

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
    updateCursor(hit.getHitState());
  }

  function turnOff() {
    box.turnOff();
    if (gui.interaction.getMode() == 'rectangles') {
      // mode change was not initiated by interactive menu -- turn off interactivity
      gui.interaction.turnOff();
    }
    if (drawStart) cancelDrawing();
    _on = false;
    updateCursor({id: -1});
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
