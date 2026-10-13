import { translateDisplayPoint } from './gui-display-utils';
import { showPopupAlert } from './gui-alert';
import { runGuiEditCommand } from './gui-edit-command';
import { getAddShapeCommand } from './gui-draw-commands';
import { getUpdatePointCommand, getSymbolDeleteCommand } from './gui-symbol-commands';
import { isTextInput } from './gui-panel-focus';

// Adding, moving and deleting points, in the point mode ('point_style'): a
// drag moves a point, and a right-click removes it. On a layer of plain
// points (tool mode 'edit_points') a click on empty map adds a point, and
// nothing is selected; on a layer of circles, the Delete key removes the
// selected circles.
//
// Every edit is a command (-add-shape, -update-point, -filter), which is what
// gives it an undo step and a line in the session history.
export function initPointEditing(gui, ext, hit) {
  var drag = null; // {id, target, startShape, start, moved}
  var alert = null;

  function toolMode() {
    return gui.interaction.getToolMode();
  }

  function active() {
    var mode = toolMode();
    return mode == 'edit_points' || mode == 'point_style';
  }

  function adding() {
    return toolMode() == 'edit_points';
  }

  function overPoint(e) {
    return active() && e.id > -1;
  }

  gui.on('interaction_mode_change', function(e) {
    if (e.tool_mode == 'edit_points') {
      showInstructions();
    } else {
      hideInstructions();
    }
    updateCursor();
  });

  function showInstructions() {
    hideInstructions();
    alert = showPopupAlert('Click on the map to add points.<br>Move points by dragging.',
      null, {non_blocking: true, max_width: '290px'});
  }

  function hideInstructions() {
    if (!alert) return;
    alert.close('fade');
    alert = null;
  }

  function updateCursor() {
    gui.container.findChild('.map-layers').classed('add-points',
      adding() && hit.getHitId() == -1);
  }

  hit.on('change', function() {
    updateCursor();
  });

  hit.on('contextmenu', function(e) {
    var target = hit.getHitTarget();
    var id = e.id;
    if (!active()) return;
    if (id > -1) {
      e.deletePoint = function() {
        deletePoints([id]);
      };
    }
    gui.contextMenu.open(e, target);
  });

  gui.keyboard.on('keydown', function(e) {
    var ids;
    if (!active() || e.keyName != 'delete' || isTextInput(document.activeElement)) return;
    ids = hit.getSelectionIds();
    if (ids.length === 0) return;
    deletePoints(ids);
    e.stopPropagation();
    if (e.originalEvent) e.originalEvent.preventDefault();
  }, null, 10);

  hit.on('click', function(e) {
    var target, p;
    if (!adding() || overPoint(e)) return;
    hideInstructions();
    target = hit.getHitTarget();
    p = translateDisplayPoint(target, ext.pixCoordsToMapCoords(e.x, e.y));
    runGuiEditCommand(gui, getAddShapeCommand([p], {geometryType: 'point'}), {
      title: 'Add point'
    });
  });

  hit.on('dragstart', function(e) {
    var target = hit.getHitTarget();
    var shapes;
    if (!overPoint(e) || !target) return;
    hideInstructions();
    shapes = target.gui.displayLayer.shapes;
    // The drag moves a copy: the display layer and the data can share their
    // coordinate arrays, and the command is what changes the data.
    drag = {id: e.id, target: target, startShape: shapes[e.id],
      start: ext.pixCoordsToMapCoords(e.x, e.y), moved: false};
    shapes[e.id] = cloneShape(drag.startShape);
  });

  hit.on('drag', function(e) {
    var p, dx, dy;
    if (!drag) return;
    p = ext.pixCoordsToMapCoords(e.x, e.y);
    dx = p[0] - drag.start[0];
    dy = p[1] - drag.start[1];
    drag.target.gui.displayLayer.shapes[drag.id] = drag.startShape.map(function(q) {
      return [q[0] + dx, q[1] + dy];
    });
    drag.moved = true;
    gui.dispatchEvent('map-needs-refresh');
  });

  hit.on('dragend', function() {
    var o = drag;
    var shapes, coords;
    if (!o) return;
    drag = null;
    shapes = o.target.gui.displayLayer.shapes;
    coords = o.moved ? shapes[o.id].map(function(p) {
      return translateDisplayPoint(o.target, p);
    }) : null;
    shapes[o.id] = o.startShape;
    if (!coords) return;
    runGuiEditCommand(gui, getUpdatePointCommand(coords, o.id), {title: 'Move point'});
  });

  function deletePoints(ids) {
    hit.clearSelection();
    runGuiEditCommand(gui, getSymbolDeleteCommand(ids), {
      title: ids.length > 1 ? 'Delete points' : 'Delete point'
    });
  }

  function cloneShape(shp) {
    return shp.map(function(p) { return [p[0], p[1]]; });
  }
}
