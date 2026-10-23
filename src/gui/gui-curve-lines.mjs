import { internal } from './gui-core';
import { translateDisplayPoint, projectDataPoint } from './gui-display-utils';
import { showPopupAlert } from './gui-alert';
import { GUI } from './gui-lib';
import { runGuiEditCommand } from './gui-edit-command';
import { getAddShapeCommand, getUpdateLineCommand } from './gui-draw-commands';
import {
  getNewShapeStyle, getNewShapeCommandStyle, getPendingPathStyle
} from './gui-shape-style-state';
import { layerHasDrawableStyle } from './gui-layer-styler';
import { POLYLINE_HIT_DISTANCE } from './gui-shape-hit';
import { addStyleClipboardItems } from './gui-style-clipboard-menu';
import { isSelectAllObjectsKey } from './gui-keyboard';
import {
  createCurveState, removeLastKnot, curveIsComplete, findKnotNear,
  handleClick, getDblclickAction, clearGesture,
  MIN_KNOT_DISTANCE, KNOT_HIT_THRESHOLD
} from './gui-label-curve-state';
import {
  createKnotCache, addKnotVersion, findKnotVersion, getLinePathCoords,
  moveCurveKnot, curveKnotsAreClosed, getCurveFlattenTolerance,
  makeKnot, knotIsCorner, toggleCurveKnotCorner, getKnotCorners,
  findCurveEndNear, knotIsCurveEnd, reverseCurveKnots
} from './gui-curve-line-knots';

var ALT_KEY_CODE = 18;

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
// knots are kept after the tool closes, but only for a line whose path is
// still the one they produced (see gui-curve-line-knots.mjs); any other line
// is selected for styling, as in the Draw tool.
//
// Alt-click (Option-click) places a corner knot, where the curve turns
// sharply, and on a knot of a selected curve switches it between a corner and
// a smooth knot, as another -update-line command. Corner knots are drawn as
// squares.
//
// A click on an end knot of an open curve with knots, which is marked as the
// Draw tool marks the end of a line it would extend, goes on drawing that
// curve: the clicks after it add knots, and the curve is refitted through
// all of them, as one -update-line command when it is finished.
export function initCurveLineTool(gui, ext, hit) {
  var _active = false;
  var curve = createCurveState(); // the curve being drawn
  // the curve being drawn is an existing curve being extended: {id, reversed,
  // baseCount}, where @baseCount is the number of knots it had
  var extending = null;
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
  var hoverId = -1; // the line under the pointer
  // the end of a curve that a click would extend: {id, knots, index}, or null
  var extendTarget = null;
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
    shown = null;
    shownKey = null;
    hoverKnot = -1;
    hoverPoint = null;
    hoverId = -1;
    setExtendTarget(null);
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
    var alt = GUI.getAltKeyName();
    alert = showPopupAlert('Click to place the nodes of a smooth curve; ' + alt +
      '-click for a corner node. Select a curve to edit its nodes: drag a node to reshape the curve, or ' +
      alt + '-click it to toggle between smooth and corner.',
      null, {non_blocking: true, max_width: '350px'});
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
      if (pointerClosesCurve(p)) {
        // the curve closes at a corner if the click that closes it is one
        if (cornerKeyDown()) curve.knots[0] = makeKnot(curve.knots[0], true);
        finishCurve(true);
      } else {
        extendCurve(p, cornerKeyDown());
      }
      return;
    }
    hoverPoint = p;
    hoverId = e.id;
    updateHoverKnot();
    if (extendTarget) {
      startExtension(extendTarget, cornerKeyDown());
    } else if (hoverKnot > -1) {
      // a press on a knot is the start of a drag, not a new curve
      if (cornerKeyDown()) toggleCorner(hoverKnot);
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
    if (!_active) return;
    if (!drawing()) {
      // two quick clicks on a knot, e.g. toggling a corner twice, are not a zoom
      if (hoverKnot > -1) e.originalEvent.stopPropagation();
      return;
    }
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
      hoverId = e.id;
      updateHoverKnot();
    }
    updateCursor();
  }, null, 100);

  hit.on('change', function(e) {
    if (!_active) return;
    refreshShownCurve(false);
    // The hit id is one event behind on 'hover' -- the control dispatches the
    // event and then tests the new position -- so the end of a curve under
    // the pointer is settled here, before the line under it is highlighted.
    if (!drawing() && !drag && e.id !== hoverId) {
      hoverId = e.id;
      updateHoverKnot();
    }
  });

  hit.on('contextmenu', function(e) {
    if (!_active || drawing() || drag) return;
    addStyleClipboardItems(gui, e, hit.getHitTarget());
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
    setExtendTarget(null);
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
    hit.setPendingPath(fitDisplayPath(o.knots), getPendingPathStyle(getLineStyle(o.id)));
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

  // Alt draws the curve through the pointer as if a click there would place a
  // corner, which it would
  gui.keyboard.on('keydown', onAltKey);
  gui.keyboard.on('keyup', onAltKey);

  function onAltKey(e) {
    if (_active && drawing() && e.keyCode == ALT_KEY_CODE) refreshCurve();
  }

  // Esc and Enter finish the curve being drawn; Backspace takes back its last
  // knot
  gui.keyboard.on('keydown', function(e) {
    if (!_active || !drawing()) return;
    if (isSelectAllObjectsKey(e.originalEvent)) {
      consume(e); // selecting the layer is not part of placing knots
    } else if (e.keyName == 'esc' || e.keyName == 'enter') {
      finishCurve(false);
      consume(e);
    } else if (e.keyName == 'delete') {
      if (atExtensionStart()) {
        abandonCurve();
      } else {
        removeLastKnot(curve);
        clearGesture(curve);
        redoKnots = [];
        if (drawing()) refreshCurve(); else abandonCurve();
      }
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

  // Goes on drawing curve @t.id from its end knot @t.index. The end becomes a
  // knot inside the curve, a corner if @corner (or if it was one already).
  function startExtension(t, corner) {
    var reversed = t.index === 0;
    var knots = reversed ? reverseCurveKnots(t.knots) : t.knots.map(function(k) {
      return makeKnot(k, knotIsCorner(k));
    });
    var n = knots.length;
    if (corner) knots[n - 1] = makeKnot(knots[n - 1], true);
    setExtendTarget(null);
    hit.clearSelection();
    curve = createCurveState();
    curve.knots = knots;
    extending = {id: t.id, reversed: reversed, baseCount: n};
    redoKnots = [];
    previewPoint = hoverPoint;
    // the curve is drawn as the preview, and the original as a plain outline
    hit.setHiddenShapes([t.id]);
    hideInstructions();
    refreshCurve();
    updateCursor();
  }

  // Taking back a knot now would take back one of the curve's own knots
  function atExtensionStart() {
    return !!extending && curve.knots.length <= extending.baseCount;
  }

  function extendCurve(p, corner) {
    var n;
    if (handleClick(curve, p, scaleThreshold(KNOT_HIT_THRESHOLD),
        scaleThreshold(MIN_KNOT_DISTANCE)) != 'added') return;
    n = curve.knots.length;
    if (corner) curve.knots[n - 1] = makeKnot(curve.knots[n - 1], true);
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
    var style = getPendingPathStyle(extending ? getLineStyle(extending.id) : getNewCurveStyle());
    var corner = cornerKeyDown();
    var first;
    if (previewPoint && pointerClosesCurve(previewPoint)) {
      first = corner ? makeKnot(knots[0], true) : knots[0];
      knots = [first].concat(knots.slice(1), [first]);
    } else if (previewPoint) {
      knots = knots.concat([makeKnot(previewPoint, corner)]);
    }
    hit.setPendingPath(knots.length > 1 ? fitDisplayPath(knots) : null, style);
    hit.setPendingKnots(curve.knots);
  }

  function pointerClosesCurve(p) {
    return curve.knots.length >= 3 &&
      findKnotNear(curve, p, scaleThreshold(KNOT_HIT_THRESHOLD)) === 0;
  }

  function abandonCurve() {
    clearCurve();
    hit.setPendingPath(null);
    hit.setPendingKnots(null);
    hit.setHiddenShapes([]);
    refreshShownCurve(true);
    updateCursor();
  }

  function clearCurve() {
    curve = createCurveState();
    extending = null;
    redoKnots = [];
    previewPoint = null;
  }

  // closed: end the curve where it began
  function finishCurve(closed) {
    var knots = curve.knots.slice();
    var complete = curveIsComplete(curve);
    var target = hit.getHitTarget();
    var coords;
    if (extending) {
      finishExtension(closed);
      return;
    }
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

  // A curve that no knots were added to is left as it was
  function finishExtension(closed) {
    var o = extending;
    var knots = curve.knots.slice();
    if (knots.length <= o.baseCount || !hit.getHitTarget()) {
      abandonCurve();
      return;
    }
    clearCurve();
    if (closed) knots.push(knots[0].slice());
    if (o.reversed) knots = reverseCurveKnots(knots);
    // the preview stands in for the line until the command replaces it
    showDragPreview({id: o.id, knots: knots});
    commitKnotMove({id: o.id, knots: knots}, 'Extend curve');
    updateCursor();
  }

  // Takes back the last knot of the curve being drawn. Taking back its first
  // knot abandons the curve, as does taking back the last knot added to a
  // curve being extended. Returns false if no curve is being drawn, so that
  // Undo goes on to the undo history.
  function pendingUndo() {
    if (drag) return true;
    if (!drawing()) return false;
    if (atExtensionStart()) {
      abandonCurve();
      return true;
    }
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
      layerHasDrawableStyle(target));
  }

  // --- knots of finished curves

  // The knots of line @id, if its path is one the tool drew, in display
  // coordinates
  function findKnots(id) {
    var target = hit.getHitTarget();
    var knots;
    if (!target || target.geometry_type != 'polyline' || !target.shapes) return null;
    knots = findKnotVersion(knotCache, getLinePathCoords(target.shapes[id],
      target.gui.source.dataset.arcs));
    return knots ? toDisplayKnots(target, knots) : null;
  }

  // Keeps @knots as the knots of line @id, as it now is. A command that
  // finishes after the tool has closed still records them.
  function recordKnots(id, knots) {
    var target = hit.getHitTarget();
    if (!target || !target.shapes) return;
    addKnotVersion(knotCache, toDataKnots(target, knots),
      getLinePathCoords(target.shapes[id], target.gui.source.dataset.arcs));
    if (_active) refreshShownCurve(true);
  }

  function toDataKnots(target, knots) {
    return knots.map(function(k) {
      return makeKnot(translateDisplayPoint(target, k), knotIsCorner(k));
    });
  }

  // null if a knot does not project, e.g. after the display projection has
  // changed to one that does not show it
  function toDisplayKnots(target, knots) {
    var out = [];
    var p;
    for (var i = 0; i < knots.length; i++) {
      p = projectDataPoint(target, knots[i]);
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) return null;
      out.push(makeKnot(p, knotIsCorner(knots[i])));
    }
    return out;
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
    setExtendTarget(findExtendTarget());
    updateCursor();
  }

  // The end knot under the pointer of the selected curve, or of the curve
  // under the pointer. An end is found as far away as the line is, so that
  // the pointer approaching it does not highlight the line on the way.
  function findExtendTarget() {
    var threshold = scaleThreshold(POLYLINE_HIT_DISTANCE);
    var id, knots, i;
    if (!_active || drawing() || drag || !hoverPoint) return null;
    if (shown && hoverKnot > -1 && !knotIsCurveEnd(shown.knots, hoverKnot)) {
      return null; // a knot to drag
    }
    if (shown) {
      id = shown.id;
      knots = shown.knots;
      i = findCurveEndNear(knots, hoverPoint, threshold);
    }
    if (!(i > -1) && hoverId > -1 && !(shown && hoverId == shown.id)) {
      id = hoverId;
      knots = findKnots(id);
      i = knots ? findCurveEndNear(knots, hoverPoint, threshold) : -1;
    }
    return i > -1 ? {id: id, knots: knots, index: i} : null;
  }

  // The end is marked as the Draw tool marks the end of a line it would extend
  function setExtendTarget(t) {
    var marked = !!extendTarget;
    extendTarget = t;
    if (t) {
      hit.setHoverVertex(t.knots[t.index], 'vertex');
    } else if (marked) {
      hit.clearHoverVertex();
    }
  }

  function toggleCorner(index) {
    var knots = toggleCurveKnotCorner(shown.knots, index);
    if (knots) commitKnotMove({id: shown.id, knots: knots});
  }

  // The drag preview stands in for the line until the command replaces it,
  // so the command is what changes the data, and undo has a step that undoes
  // something.
  function commitKnotMove(o, title) {
    var target = hit.getHitTarget();
    var coords = toDataCoords(target, fitDisplayPath(o.knots));
    shown = {id: o.id, knots: o.knots};
    hit.setPendingKnots(o.knots);
    runGuiEditCommand(gui, getUpdateLineCommand(coords, o.id), {
      title: title || 'Reshape curve',
      changesEditTarget: true,
      onSuccess: function() {
        if (_active) hit.setSelectionIds([o.id]);
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
      curveKnotsAreClosed(knots), getKnotCorners(knots));
  }

  function cornerKeyDown() {
    return gui.keyboard.altIsPressed();
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
    el.classed('curve-select', _active && !drawing() && !onKnot && !extendTarget && overShape);
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
