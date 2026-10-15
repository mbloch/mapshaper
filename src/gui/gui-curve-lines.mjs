import { internal } from './gui-core';
import { translateDisplayPoint } from './gui-display-utils';
import { showPopupAlert } from './gui-alert';
import { runGuiEditCommand } from './gui-edit-command';
import { getAddShapeCommand, getUpdateLineCommand } from './gui-draw-commands';
import {
  getNewShapeStyle, getNewShapeCommandStyle, getPendingPathStyle
} from './gui-shape-style-state';
import { layerHasDrawableStyle } from './gui-layer-styler';
import {
  createCurveState, removeLastKnot, curveIsComplete, findKnotNear,
  handleClick, getDblclickAction, clearGesture,
  MIN_KNOT_DISTANCE, KNOT_HIT_THRESHOLD
} from './gui-label-curve-state';
import {
  createKnotCache, addKnotVersion, findKnotVersion, getLinePathCoords,
  moveCurveKnot, curveKnotsAreClosed, getCurveFlattenTolerance
} from './gui-curve-line-knots';

// The curve tool, armed from the line style mode's toolbar ('curve_lines',
// see getToolMode() in gui-interaction-mode-control.mjs).
//
// Clicks place knots, and the line is a smooth curve through them (see
// fitCurveThroughKnots()). As in the Draw tool, the curve being drawn belongs
// to the tool until it is finished, and then becomes an ordinary line, added
// by an -add-shape command: one undo step and one line of session history.
// While it is being drawn, Undo and Redo take back and restore its knots.
//
// A line drawn with the tool can be reshaped by dragging its knots, which are
// shown while the line is selected. Each drag is an -update-line command. The
// knots are kept only while the tool is open, and only for a line whose path
// is still the one they produced (see gui-curve-line-knots.mjs); any other
// line is selected for styling, as in the Draw tool.
export function initCurveLineTool(gui, ext, hit) {
  var _active = false;
  var curve = createCurveState(); // the curve being drawn
  var redoKnots = []; // knots taken back by Undo while drawing
  // the pointer's position while a curve is being drawn, which the curve is
  // drawn through but which is not a knot yet
  var previewPoint = null;
  var knotCache = createKnotCache();
  // the selected line whose knots are shown: {id, knots}, or null
  var shown = null;
  var shownKey = null; // the selection that @shown was found for
  var hoverKnot = -1; // index of the knot of @shown under the pointer
  var hoverPoint = null;
  var overShape = false;
  // a knot drag in progress: {id, index, knots, offset, moved}
  var drag = null;
  // the line whose knots were shown before an undo or redo, which clears the
  // selection
  var restoreId = -1;
  var shownInstructions = false;
  var alert = null;
  var mouse = gui.map.getMouse();

  gui.addMode('curve_tool', turnOn, turnOff);

  // higher priority than hit control, so turnOff() has the correct hit target
  gui.on('interaction_mode_change', onToolModeChange, null, 10);
  gui.on('interaction_tool_change', onToolModeChange, null, 10);

  function onToolModeChange(e) {
    if (e.tool_mode == 'curve_lines') {
      gui.enterMode('curve_tool');
    } else if (gui.getMode() == 'curve_tool') {
      gui.clearMode();
    }
  }

  gui.on('new_shape_style_change', function() {
    if (drawing()) refreshCurve();
  });

  gui.undo.addInterceptor({
    undo: pendingUndo,
    redo: pendingRedo
  });

  gui.on('undo_redo_pre', function() {
    restoreId = _active && shown ? shown.id : -1;
  }, null, 1); // before the hit control clears the selection

  gui.on('undo_redo_post', function() {
    var id = restoreId;
    restoreId = -1;
    if (_active && id > -1 && !drawing() && findKnots(id)) {
      hit.setSelectionIds([id]);
    }
  });

  gui.model.on('update', function() {
    if (_active) refreshShownCurve(true);
  }, null, -1); // after the hit control has the updated layer

  function turnOn() {
    if (_active) return;
    _active = true;
    showInstructions();
    refreshShownCurve(true);
    updateCursor();
  }

  function turnOff() {
    if (!_active) return;
    finishCurve(false);
    drag = null;
    knotCache = createKnotCache();
    shown = null;
    shownKey = null;
    hoverKnot = -1;
    hoverPoint = null;
    hit.setPendingPath(null);
    hit.setPendingKnots(null);
    hit.setHiddenShapes([]);
    hideInstructions();
    _active = false;
    if (gui.interaction.getArmedTool() == 'curve') {
      // another GUI mode took over -- disarm (see turnOff() in
      // gui-draw-lines2.mjs)
      gui.interaction.setArmedTool(null);
    }
    updateCursor();
  }

  function drawing() {
    return curve.knots.length > 0;
  }

  // shown the first time the tool is used
  function showInstructions() {
    if (shownInstructions) return;
    shownInstructions = true;
    alert = showPopupAlert('Click to place the points of a curve. Double-click or type Enter to finish, ' +
      'or click the first point to close the curve. Backspace removes the last point. ' +
      'Select a curve to drag its points.', null, {non_blocking: true, max_width: '350px'});
  }

  function hideInstructions() {
    if (!alert) return;
    alert.close('fade');
    alert = null;
  }

  // --- events

  hit.on('click', function(e) {
    var p;
    if (!_active || drag) return;
    p = pixToMapCoords(e.x, e.y);
    if (drawing()) {
      if (curve.knots.length >= 3 && findKnotNear(curve, p, scaleThreshold(KNOT_HIT_THRESHOLD)) === 0) {
        finishCurve(true);
      } else {
        extendCurve(p);
      }
      return;
    }
    hoverPoint = p;
    updateHoverKnot();
    if (hoverKnot > -1) {
      // a press on a knot is the start of a drag, not a new curve
    } else if (e.id > -1) {
      selectShape(e.id);
    } else if (hit.getSelectionIds().length > 0) {
      // a click off the selection only deselects, as in the Draw tool
      hit.setSelectionIds([], {keepHover: true});
    } else {
      startCurve(p);
    }
  });

  hit.on('dblclick', function(e) {
    var o;
    if (!_active || !drawing()) return;
    e.originalEvent.stopPropagation(); // prevent dblclick zoom
    o = getDblclickAction(curve, pixToMapCoords(e.x, e.y), scaleThreshold(KNOT_HIT_THRESHOLD));
    if (o.action == 'finish') finishCurve(false);
  });

  hit.on('hover', function(e) {
    var p;
    if (!_active || drag) return;
    p = e.overMap ? pixToMapCoords(e.x, e.y) : null;
    overShape = e.id > -1;
    if (drawing()) {
      if (!samePoint(p, previewPoint)) {
        previewPoint = p;
        refreshCurve();
      }
    } else {
      hoverPoint = p;
      updateHoverKnot();
    }
    updateCursor();
  }, null, 100);

  hit.on('change', function() {
    if (_active) refreshShownCurve(false);
  });

  hit.on('contextmenu', function(e) {
    if (!_active || drawing() || drag) return;
    gui.contextMenu.open(e, hit.getHitTarget());
  });

  // Knot drags are taken from the map's mouse, ahead of the hit control
  // (priority 3), because a knot handle can be beyond the reach of the hit
  // test, which only reports a drag over a feature.
  mouse.on('dragstart', function(e) {
    if (!_active || drawing() || !shown || hoverKnot < 0 || !hoverPoint) return;
    e.stopPropagation(); // prevent panning
    drag = {
      id: shown.id,
      index: hoverKnot,
      knots: shown.knots,
      // the knot does not jump to the pointer on the first move
      offset: [shown.knots[hoverKnot][0] - hoverPoint[0], shown.knots[hoverKnot][1] - hoverPoint[1]],
      moved: false
    };
    // The line is drawn as the preview from the start of the drag, and the
    // original as a plain outline (see setHiddenShapes())
    showDragPreview(drag);
    hit.setHiddenShapes([drag.id]);
    hideInstructions();
    updateCursor();
  }, null, 3);

  mouse.on('drag', function(e) {
    var p, knots;
    if (!drag) return;
    e.stopPropagation();
    p = pixToMapCoords(e.x, e.y);
    p = [p[0] + drag.offset[0], p[1] + drag.offset[1]];
    knots = moveCurveKnot(drag.knots, drag.index, p, scaleThreshold(MIN_KNOT_DISTANCE));
    if (!knots) return;
    drag.knots = knots;
    drag.moved = true;
    showDragPreview(drag);
  }, null, 3);

  mouse.on('dragend', function(e) {
    var o = drag;
    if (!o) return;
    e.stopPropagation();
    drag = null;
    if (o.moved) {
      commitKnotMove(o);
    } else {
      clearDragPreview();
      hit.setPendingKnots(shown ? shown.knots : null);
    }
    updateCursor();
  }, null, 3);

  function showDragPreview(o) {
    hit.setPendingPath(fitDisplayPath(o.knots),
      getPendingPathStyle(getLineStyle(o.id), !!gui.state.dark_basemap));
    hit.setPendingKnots(o.knots);
  }

  function clearDragPreview() {
    hit.setPendingPath(null);
    hit.setHiddenShapes([]);
  }

  gui.keyboard.on('keydown', function(e) {
    if (_active && drawing() && e.keyName == 'space') {
      e.stopPropagation(); // prevent console from opening if shift-panning
    }
  }, null, 1);

  // Esc and Enter finish the curve being drawn; Backspace takes back its last
  // knot
  gui.keyboard.on('keydown', function(e) {
    if (!_active || !drawing()) return;
    if (e.keyName == 'esc' || e.keyName == 'enter') {
      finishCurve(false);
      consume(e);
    } else if (e.keyName == 'delete') {
      removeLastKnot(curve);
      clearGesture(curve);
      redoKnots = [];
      if (drawing()) refreshCurve(); else abandonCurve();
      consume(e);
    }
  }, null, 10);

  // With no curve being drawn, Esc clears the selection, and then disarms the
  // tool
  gui.keyboard.on('keydown', function(e) {
    if (e.keyName != 'esc' || !_active || drawing() || drag) return;
    e.stopPropagation();
    if (hit.getSelectionIds().length > 0) {
      hit.setSelectionIds([], {keepHover: true});
    } else {
      gui.interaction.setArmedTool(null);
    }
  }, null, 9);

  function consume(e) {
    e.stopPropagation();
    if (e.originalEvent) e.originalEvent.preventDefault();
  }

  // As in the Draw tool, shift-click adds to or removes from the selection
  function selectShape(id) {
    var ids = hit.getSelectionIds();
    if (gui.keyboard.shiftIsPressed()) {
      ids = ids.includes(id) ? ids.filter(function(id2) { return id2 != id; }) : ids.concat(id);
    } else {
      ids = [id];
    }
    hit.setSelectionIds(ids, {keepHover: true});
  }

  // --- the curve being drawn

  function startCurve(p) {
    hit.clearSelection();
    extendCurve(p);
  }

  function extendCurve(p) {
    if (handleClick(curve, p, scaleThreshold(KNOT_HIT_THRESHOLD),
        scaleThreshold(MIN_KNOT_DISTANCE)) != 'added') return;
    redoKnots = [];
    hideInstructions();
    refreshShownCurve(true);
    refreshCurve();
    updateCursor();
  }

  // Draws the curve through the pointer, as if it were the next knot. Near the
  // first knot, the pointer closes the curve, as a click there would.
  function refreshCurve() {
    var knots = curve.knots;
    var style = getPendingPathStyle(getNewCurveStyle(), !!gui.state.dark_basemap);
    if (previewPoint && pointerClosesCurve(previewPoint)) {
      knots = knots.concat([knots[0]]);
    } else if (previewPoint) {
      knots = knots.concat([previewPoint]);
    }
    hit.setPendingPath(knots.length > 1 ? fitDisplayPath(knots) : null, style);
    hit.setPendingKnots(curve.knots);
  }

  function pointerClosesCurve(p) {
    return curve.knots.length >= 3 &&
      findKnotNear(curve, p, scaleThreshold(KNOT_HIT_THRESHOLD)) === 0;
  }

  function abandonCurve() {
    curve = createCurveState();
    redoKnots = [];
    previewPoint = null;
    hit.setPendingPath(null);
    hit.setPendingKnots(null);
    refreshShownCurve(true);
    updateCursor();
  }

  // closed: end the curve where it began
  function finishCurve(closed) {
    var knots = curve.knots.slice();
    var complete = curveIsComplete(curve);
    var target = hit.getHitTarget();
    var coords;
    abandonCurve();
    if (!complete || !target || target.geometry_type != 'polyline') return;
    if (closed) knots.push(knots[0].slice());
    coords = toDataCoords(target, fitDisplayPath(knots));
    runGuiEditCommand(gui, getAddShapeCommand(coords, {
      geometryType: 'polyline',
      style: getNewCurveStyle()
    }), {
      title: 'Draw curve',
      changesEditTarget: true,
      onSuccess: function() {
        var lyr = hit.getHitTarget();
        if (lyr) recordKnots(internal.getFeatureCount(lyr) - 1, knots);
      }
    });
  }

  // Takes back the last knot of the curve being drawn. Taking back its first
  // knot abandons the curve. Returns false if no curve is being drawn, so that
  // Undo goes on to the undo history.
  function pendingUndo() {
    if (drag) return true;
    if (!drawing()) return false;
    redoKnots.push(curve.knots.pop());
    clearGesture(curve);
    if (drawing()) {
      refreshCurve();
    } else {
      abandonCurve();
    }
    return true;
  }

  // Restores the last knot taken back. Redo does nothing else while a curve is
  // being drawn (see pendingRedo() in gui-draw-lines2.mjs).
  function pendingRedo() {
    if (drag) return true;
    if (!drawing()) return false;
    if (redoKnots.length > 0) {
      curve.knots.push(redoKnots.pop());
      clearGesture(curve);
      refreshCurve();
    }
    return true;
  }

  // The style the panel gives new shapes (see gui-shape-style-state.mjs)
  function getNewCurveStyle() {
    var target = hit.getHitTarget();
    return getNewShapeCommandStyle(getNewShapeStyle(gui, 'polyline'),
      layerHasDrawableStyle(target), !!gui.state.dark_basemap);
  }

  // --- knots of finished curves

  // The knots of line @id, if its path is one the tool drew
  function findKnots(id) {
    var target = hit.getHitTarget();
    if (!target || target.geometry_type != 'polyline' || !target.shapes) return null;
    return findKnotVersion(knotCache, getLinePathCoords(target.shapes[id],
      target.gui.source.dataset.arcs));
  }

  // Keeps @knots as the knots of line @id, as it now is
  function recordKnots(id, knots) {
    var target = hit.getHitTarget();
    if (!_active || !target || !target.shapes) return;
    addKnotVersion(knotCache, knots, getLinePathCoords(target.shapes[id],
      target.gui.source.dataset.arcs));
    refreshShownCurve(true);
  }

  // Shows the knots of the selected line, if one line is selected and it has
  // knots
  // force: look again even if the selection has not changed, e.g. after a
  //   command has changed the line
  function refreshShownCurve(force) {
    var ids = hit.getSelectionIds();
    var key = ids.join(',');
    var knots;
    if (drag || !force && key === shownKey) return;
    shownKey = key;
    knots = _active && !drawing() && ids.length == 1 ? findKnots(ids[0]) : null;
    shown = knots ? {id: ids[0], knots: knots} : null;
    updateHoverKnot();
    if (!drawing()) hit.setPendingKnots(shown ? shown.knots : null);
  }

  // The knot under the pointer, found on hover rather than at dragstart:
  // dragstart arrives after the pointer has moved, often off a small handle.
  function updateHoverKnot() {
    hoverKnot = shown && hoverPoint ?
      findKnotNear(shown, hoverPoint, scaleThreshold(KNOT_HIT_THRESHOLD)) : -1;
    updateCursor();
  }

  // The drag preview stands in for the line until the command replaces it,
  // so the command is what changes the data, and undo has a step that undoes
  // something.
  function commitKnotMove(o) {
    var target = hit.getHitTarget();
    var coords = toDataCoords(target, fitDisplayPath(o.knots));
    shown = {id: o.id, knots: o.knots};
    hit.setPendingKnots(o.knots);
    runGuiEditCommand(gui, getUpdateLineCommand(coords, o.id), {
      title: 'Reshape curve',
      changesEditTarget: true,
      onSuccess: function() {
        if (!_active) return;
        hit.setSelectionIds([o.id]);
        recordKnots(o.id, o.knots);
      },
      onError: function() {
        refreshShownCurve(true);
      },
      onDone: function() {
        if (!drag) clearDragPreview();
      }
    });
  }

  // The style of line @id, which a drag preview is drawn in
  function getLineStyle(id) {
    var target = hit.getHitTarget();
    var records = target.data ? target.data.getRecords() : [];
    return layerHasDrawableStyle(target) && records[id] || {};
  }

  // --- utilities

  function fitDisplayPath(knots) {
    return internal.fitCurveThroughKnots(knots, getCurveFlattenTolerance(knots),
      curveKnotsAreClosed(knots));
  }

  function toDataCoords(target, displayCoords) {
    return displayCoords.map(function(p) {
      return translateDisplayPoint(target, p);
    });
  }

  function updateCursor() {
    var el = gui.container.findChild('.map-layers');
    var onKnot = _active && !drawing() && (hoverKnot > -1 || !!drag);
    el.classed('curve-tool', _active);
    // a drag would move the knot
    el.classed('curve-handle', onKnot);
    // a click would select the line under the pointer
    el.classed('curve-select', _active && !drawing() && !onKnot && overShape);
    if (_active) el.classed('drawing', drawing());
  }

  function pixToMapCoords(x, y) {
    return ext.pixCoordsToMapCoords(x, y);
  }

  function scaleThreshold(px) {
    return px * ext.getPixelSize();
  }

  function samePoint(a, b) {
    if (!a || !b) return a === b;
    return a[0] === b[0] && a[1] === b[1];
  }
}
