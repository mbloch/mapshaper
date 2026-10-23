import { internal } from './gui-core';
import { translateDisplayPoint } from './gui-display-utils';
import { addEmptyLayer } from './gui-add-layer';
import { showPopupAlert } from './gui-alert';
import { runGuiEditCommand } from './gui-edit-command';
import { FloatingToolbar } from './gui-floating-toolbar';
import {
  getSymbolTarget, getAddSymbolCommand, getUpdateSymbolCommand, getUpdatePointCommand,
  getSymbolDeleteCommand
} from './gui-symbol-commands';
import { getAddLabelCommand, getUpdateLabelCommand } from './gui-label-commands';
import { getNewLabelFontName, getNearestFontStyleVariant } from './gui-label-fonts';
import { pointIsUnstyled } from './gui-unstyled-points';
import {
  getAddIconOptions, getAddCurveOptions, getDefaultIconStyle, getDefaultCurveStyle,
  getIconShape, curveShapeIsClosed
} from './gui-symbol-style';
import { syncSymbolStyle } from './gui-selection-style';
import {
  getDefaultMarkerTextStyle, getAddMarkerFields, getNextMarkerText
} from './gui-marker-style';
import { SymbolSelection, getDisplayShapes } from './gui-symbol-selection';
import { SymbolPanel } from './gui-symbol-panel';
import { findNearestKnot, knotMoveIsValid } from './gui-label-knots';
import {
  setPendingLabelPath, clearPendingLabelPath, getPendingLabelPath
} from './gui-label-path-guide';
import {
  createCurveState, removeLastKnot, curveIsComplete, findKnotNear,
  handleClick, getDblclickAction, clearGesture,
  MIN_KNOT_DISTANCE, KNOT_HIT_THRESHOLD
} from './gui-label-curve-state';

// The symbol tool: placing icons and drawing curves as -symbols commands, and
// selecting, moving, reshaping, restyling and deleting them.
//
// See docs/development/symbol-tool-design.md.

export function initSymbolTool(gui, ext, hit) {
  // what a click on empty map creates: null, 'icon' or 'curve'
  var armed = null;
  var curve = createCurveState();
  // the pointer's position while a curve is being drawn, which the curve is
  // drawn through but which is not a knot yet
  var previewPoint = null;
  // a drag in progress: {kind: 'move'|'knot', id, index, target, startShape,
  //   offset, start, moved}
  var drag = null;
  // the knot of a selected curve under the pointer, from the last hover
  var hoverKnot = null;
  var hoverPoint = null;
  // the style of the next symbol placed, which the panel sets while nothing
  // is selected
  var newStyle = {icon: getDefaultIconStyle(), curve: getDefaultCurveStyle(),
    text: Object.assign(getDefaultMarkerTextStyle(), {autoNumber: false})};
  var toolbar, iconBtn, curveBtn, stylesBtn, alert;
  // the panel's toggle, kept from one session to the next, as the line and
  // polygon panels keep theirs
  var panelHidden = false;
  var selection = new SymbolSelection(gui, ext, hit, getCueState, isSymbol);
  var panel = new SymbolPanel(gui, {
    getTarget: getTarget,
    getSelectedIds: getSelectedSymbols,
    getAllIds: getAllSymbols,
    getArmed: function() { return armed; },
    getNewStyle: function() { return newStyle; },
    getMarkerTextStyle: getMarkerTextStyle,
    isCurve: isCurve,
    deselect: deselect,
    close: function() { setPanelShown(false); }
  });

  gui.addMode('symbol_tool', turnOn, turnOff);

  gui.on('interaction_mode_change', function(e) {
    if (e.mode == 'symbols') {
      addTargetLayerIfMissing();
      gui.enterMode('symbol_tool');
    } else if (gui.getMode() == 'symbol_tool') {
      gui.clearMode();
    }
  }, null, 10);

  // As the label tool does: a session with no layer has nowhere to put a
  // symbol, so the tool makes the layer a symbol would have gone into.
  function addTargetLayerIfMissing() {
    if (gui.model.getActiveLayer()) return;
    addEmptyLayer(gui, 'symbols', 'point');
  }

  function turnOn() {
    getToolbar().show();
    setArmed(getInitialTool());
    selection.turnOn();
    if (!panelHidden) panel.show();
    updateStylesButton();
  }

  // A layer with no symbols in it has nothing to select, so the tool starts
  // ready to place one.
  function getInitialTool() {
    var lyr = getTarget();
    var n = lyr ? internal.getFeatureCount(lyr) : 0;
    for (var i = 0; i < n; i++) {
      if (isSymbol(lyr, i)) return null;
    }
    return 'icon';
  }

  function turnOff() {
    abandonCurve();
    deselect();
    selection.turnOff();
    panel.hide();
    armed = null;
    drag = null;
    hoverKnot = null;
    hoverPoint = null;
    updateButtons();
    hideInstructions();
    if (toolbar) toolbar.hide();
    if (gui.interaction.getMode() == 'symbols') {
      gui.interaction.turnOff();
    }
  }

  function active() {
    return gui.getMode() == 'symbol_tool';
  }

  function drawingCurve() {
    return curve.knots.length > 0;
  }

  function getToolbar() {
    if (toolbar) return toolbar;
    toolbar = new FloatingToolbar(gui, {name: 'symbol-toolbar'});
    iconBtn = toolbar.addButton('#symbol-tool-icon', {tooltip: 'Add a symbol'})
      .on('click', function() {
        setArmed(armed == 'icon' ? null : 'icon');
      });
    curveBtn = toolbar.addButton('#curve-tool-icon', {tooltip: 'Draw a curve or an arrow'})
      .on('click', function() {
        setArmed(armed == 'curve' ? null : 'curve');
      });
    // The style panel's toggle, and Done, which leaves the tool -- with the
    // panel hidden, its close button is not there to do that
    toolbar.addSeparator();
    stylesBtn = toolbar.addButton('#style-panel-icon', {tooltip: 'Hide style panel'})
      .on('click', function() { setPanelShown(panelHidden); });
    toolbar.addTextButton('Done', {tooltip: 'Stop adding and editing symbols'})
      .on('click', function() {
        gui.interaction.turnOff();
      });
    return toolbar;
  }

  function setPanelShown(shown) {
    panelHidden = !shown;
    if (shown) panel.show(); else panel.hide();
    updateStylesButton();
  }

  function updateStylesButton() {
    if (!stylesBtn) return;
    stylesBtn.setSelected(!panelHidden);
    stylesBtn.setTooltip(panelHidden ? 'Show style panel' : 'Hide style panel');
  }

  function setArmed(mode) {
    if (armed == mode) return;
    if (drawingCurve()) abandonCurve();
    armed = mode;
    updateButtons();
    showInstructions();
    panel.update();
  }

  function updateButtons() {
    if (!toolbar) return;
    iconBtn.setSelected(armed == 'icon');
    curveBtn.setSelected(armed == 'curve');
    updateCursor();
  }

  function updateCursor() {
    var el = gui.container.findChild('.map-layers');
    var onKnot = active() && !!hoverKnot;
    var onSymbol = active() && !onKnot && hit.getHitId() > -1;
    el.classed('symbol-tool', active() && !!armed && !onKnot && !onSymbol);
    el.classed('symbol-handle', onKnot);
    el.classed('symbol-move', onSymbol && !drawingCurve());
  }

  function showInstructions() {
    var msg;
    hideInstructions();
    if (armed == 'icon') {
      msg = 'Click on the map to place a symbol.';
    } else if (armed == 'curve') {
      msg = 'Click to draw a curve. Double-click or type Enter to finish, ' +
        'or click the first point to close it. Backspace removes the last point.';
    } else {
      return;
    }
    alert = showPopupAlert(msg, null, {non_blocking: true, max_width: '330px'});
  }

  function hideInstructions() {
    if (!alert) return;
    alert.close('fade');
    alert = null;
  }

  // --- what the tool works on

  // The layer the map draws as active, which carries its display shapes and
  // SVG container
  function getTarget() {
    var o = gui.model.getActiveLayer();
    return hit.getHitTarget() || o && o.layer || null;
  }

  function getRecord(target, id) {
    var records = target && target.data ? target.data.getRecords() : null;
    return records ? records[id] : null;
  }

  // Labels share point layers with symbols, and belong to the label tool --
  // except numbered markers, which are labels with a symbol behind them.
  function isSymbol(target, id) {
    var shp = target && target.shapes && target.shapes[id];
    var rec = getRecord(target, id);
    if (!shp) return false;
    return !(rec && internal.svg.featureIsTextLabel(rec));
  }

  function isMarker(target, id) {
    return internal.svg.featureIsMarker(getRecord(target, id));
  }

  function isCurve(target, id) {
    var shp = target && target.shapes && target.shapes[id];
    return !!shp && internal.svg.shapeIsCurve(shp, getRecord(target, id));
  }

  function isAnnotationLayer(lyr) {
    return internal.layerHasLabels(lyr) || internal.layerHasSvgSymbols(lyr) ||
      !!(lyr.data && lyr.data.fieldExists('r'));
  }

  function getSelectedSymbols() {
    var target = getTarget();
    return hit.getSelectionIds().filter(function(id) {
      return isSymbol(target, id);
    });
  }

  function getCueState() {
    var selected = getSelectedSymbols();
    var hoverId = drag || drawingCurve() ? -1 : hit.getHitId();
    return {selected: selected, hoverId: hoverId};
  }

  function deselect() {
    if (hit.getSelectionIds().length > 0) hit.clearSelection();
  }

  // --- events

  hit.on('click', function(e) {
    var p;
    if (!active()) return;
    p = pixToMapCoords(e.x, e.y);
    if (armed == 'curve' && drawingCurve()) {
      if (curve.knots.length >= 3 && findKnotNear(curve, p, scaleThreshold(KNOT_HIT_THRESHOLD)) === 0) {
        finishCurve(true);
      } else {
        extendCurve(p);
      }
      return;
    }
    // The hit control has selected what was clicked. A click on a symbol
    // never places another on top of it.
    if (e.id > -1 && isSymbol(getTarget(), e.id)) {
      panel.update();
      return;
    }
    // A label, or nothing: the selection, if any, is over
    deselect();
    if (armed == 'icon') {
      placeIcon(p);
    } else if (armed == 'curve') {
      extendCurve(p);
    }
  });

  hit.on('dblclick', function(e) {
    var o;
    if (!active() || armed != 'curve' || !drawingCurve()) return;
    o = getDblclickAction(curve, pixToMapCoords(e.x, e.y), scaleThreshold(KNOT_HIT_THRESHOLD));
    if (o.action == 'finish') finishCurve(false);
  });

  hit.on('change', function(e) {
    if (!active()) return;
    syncNewStyleToSelection();
    selection.refresh();
    updateCursor();
    panel.update();
  });

  // A restyle or an undo changes the records of the selection
  gui.model.on('update', function() {
    if (active()) syncNewStyleToSelection();
  });

  gui.on('undo_redo_post', function() {
    if (active()) syncNewStyleToSelection();
  });

  // The next symbol is placed in the style of the symbols last selected,
  // whether or not the panel is showing. With nothing selected the panel
  // describes every symbol in the layer, which says nothing about the next.
  function syncNewStyleToSelection() {
    var target = getTarget();
    var ids = getSelectedSymbols();
    var sel = {icons: [], openCurves: [], closedCurves: [], markers: []};
    if (ids.length === 0) return;
    ids.forEach(function(id) {
      var rec = getRecord(target, id) || {};
      if (isCurve(target, id)) {
        (curveShapeIsClosed(target.shapes[id]) ? sel.closedCurves : sel.openCurves).push(rec);
      } else if (!pointIsUnstyled(rec) && getIconShape(rec)) {
        sel.icons.push(rec);
        if (internal.svg.featureIsMarker(rec)) sel.markers.push(rec);
      }
    });
    syncSymbolStyle(newStyle, sel);
  }

  gui.on('map_rendered', function(e) {
    if (!active()) return;
    selection.refresh(!e || e.action != 'hover');
  });

  hit.on('hover', function(e) {
    var p;
    if (!active()) return;
    if (!drag) {
      hoverPoint = e.overMap ? pixToMapCoords(e.x, e.y) : null;
      updateHoverKnot();
    }
    if (armed != 'curve' || !drawingCurve()) return;
    p = e.overMap ? pixToMapCoords(e.x, e.y) : null;
    if (samePoint(p, previewPoint)) return;
    previewPoint = p;
    refreshCurve('hover');
  });

  // The knot under the pointer, found on hover rather than at dragstart:
  // dragstart arrives after the pointer has moved, often off a small handle.
  function updateHoverKnot() {
    var target = getTarget();
    var curves = getSelectedSymbols().filter(function(id) {
      return isCurve(target, id);
    });
    var prev = hoverKnot;
    hoverKnot = hoverPoint && curves.length > 0 && !drawingCurve() ?
      findNearestKnot(getDisplayShapes(target), curves, hoverPoint,
        scaleThreshold(KNOT_HIT_THRESHOLD)) : null;
    if (!!prev != !!hoverKnot) updateCursor();
  }

  hit.on('dragstart', function(e) {
    var target = getTarget();
    var id = hit.getHitId();
    if (!active() || drawingCurve() || !target) return;
    if (hoverKnot) {
      beginDrag('knot', hoverKnot.id, hoverKnot.index, hoverKnot.point);
      consumeDrag(e);
    } else if (id > -1 && isSymbol(target, id) && hoverPoint) {
      if (hit.getSelectionIds().indexOf(id) == -1) hit.setSelectionIds([id]);
      beginDrag('move', id, -1, hoverPoint);
      consumeDrag(e);
    }
  });

  // @grabbed: the point the drag holds -- a knot, or for a move, where the
  //   pointer was over the symbol -- in display coordinates
  function beginDrag(kind, id, index, grabbed) {
    var target = getTarget();
    var shapes = getDisplayShapes(target);
    drag = {
      kind: kind,
      id: id,
      index: index,
      target: target,
      // kept by reference, so that rolling back restores the layer's own
      // array; the drag works on a copy, since the display layer and the data
      // can share their coordinate arrays
      startShape: shapes[id],
      offset: hoverPoint ? [grabbed[0] - hoverPoint[0], grabbed[1] - hoverPoint[1]] : [0, 0],
      start: grabbed,
      moved: false
    };
    shapes[id] = cloneShape(drag.startShape);
  }

  hit.on('drag', function(e) {
    var shapes, shp, p, dx, dy;
    if (!drag) return;
    consumeDrag(e);
    shapes = getDisplayShapes(drag.target);
    p = pixToMapCoords(e.x, e.y);
    p = [p[0] + drag.offset[0], p[1] + drag.offset[1]];
    if (drag.kind == 'knot') {
      shp = shapes[drag.id];
      if (!knotMoveIsValid(shp, drag.index, p, scaleThreshold(MIN_KNOT_DISTANCE))) return;
      moveKnot(shp, drag.index, p);
    } else {
      dx = p[0] - drag.start[0];
      dy = p[1] - drag.start[1];
      shapes[drag.id] = drag.startShape.map(function(q) {
        return [q[0] + dx, q[1] + dy];
      });
    }
    drag.moved = true;
    gui.dispatchEvent('map-needs-refresh');
  });

  // A closed curve's first knot is repeated at the end, and the two move
  // together.
  function moveKnot(shp, i, p) {
    var last = shp.length - 1;
    var closed = last > 2 && samePoint(drag.startShape[0], drag.startShape[last]);
    shp[i] = p;
    if (closed && i === 0) shp[last] = [p[0], p[1]];
    if (closed && i === last) shp[0] = [p[0], p[1]];
  }

  hit.on('dragend', function(e) {
    var o = drag;
    if (!o) return;
    consumeDrag(e);
    drag = null;
    if (!o.moved) {
      getDisplayShapes(o.target)[o.id] = o.startShape;
      return;
    }
    commitDrag(o);
  });

  // The preview is rolled back first, so that the command is what changes the
  // data, and undo has a step that undoes something.
  function commitDrag(o) {
    var shapes = getDisplayShapes(o.target);
    var ids = hit.getSelectionIds();
    var coords = shapes[o.id].map(function(p) {
      return translateDisplayPoint(o.target, p);
    });
    shapes[o.id] = o.startShape;
    runGuiEditCommand(gui, getMoveCommand(o.target, o.id, coords), {
      title: o.kind == 'knot' ? 'Reshape curve' : 'Move symbol',
      onSuccess: function() { hit.setSelectionIds(ids); }
    });
  }

  // -update-symbol refuses to move a point with no symbol, and a marker, which
  // the commands see as a label
  function getMoveCommand(target, id, coords) {
    if (isMarker(target, id)) return getUpdateLabelCommand(coords, id);
    if (pointIsUnstyled(getRecord(target, id))) return getUpdatePointCommand(coords, id);
    return getUpdateSymbolCommand(coords, id);
  }

  gui.keyboard.on('keydown', function(e) {
    var ids;
    if (!active()) return;
    if (isSelectAll(e) && !drawingCurve()) {
      selectAll();
      consume(e);
      return;
    }
    if (e.keyName == 'esc') {
      // innermost first: the curve being drawn, the selection, the armed tool
      if (drawingCurve()) {
        finishCurve(false);
      } else if (hit.getSelectionIds().length > 0) {
        deselect();
      } else {
        setArmed(null);
      }
      consume(e);
    } else if (e.keyName == 'delete') {
      if (drawingCurve()) {
        removeLastKnot(curve);
        clearGesture(curve);
        if (drawingCurve()) refreshCurve(); else abandonCurve();
        consume(e);
      } else if ((ids = getSelectedSymbols()).length > 0) {
        deleteSymbols(ids);
        consume(e);
      }
    } else if (e.keyName == 'enter' && drawingCurve()) {
      finishCurve(false);
      consume(e);
    }
  }, null, 10);

  function selectAll() {
    hit.setSelectionIds(getAllSymbols());
  }

  function getAllSymbols() {
    var target = getTarget();
    var ids = [];
    var n = target ? internal.getFeatureCount(target) : 0;
    for (var i = 0; i < n; i++) {
      if (isSymbol(target, i)) ids.push(i);
    }
    return ids;
  }

  // Cmd-A on a Mac, Ctrl-A elsewhere
  function isSelectAll(e) {
    var evt = e.originalEvent;
    if (!evt || !(evt.metaKey || evt.ctrlKey) || evt.shiftKey || evt.altKey) return false;
    return (evt.key || '').toLowerCase() == 'a';
  }

  function consume(e) {
    e.stopPropagation();
    if (e.originalEvent) e.originalEvent.preventDefault();
  }

  // The hit control leaves drags in this mode unstopped, so that a drag that
  // misses every symbol still pans the map.
  function consumeDrag(e) {
    if (e.originalEvent) e.originalEvent.stopPropagation();
  }

  // --- curves

  function extendCurve(p) {
    var result = handleClick(curve, p, scaleThreshold(KNOT_HIT_THRESHOLD),
      scaleThreshold(MIN_KNOT_DISTANCE));
    if (result != 'added') return;
    hideInstructions();
    refreshCurve();
  }

  function refreshCurve(action) {
    setPendingLabelPath(curve.knots, previewPoint);
    gui.dispatchEvent('map-needs-refresh', {action: action});
  }

  function abandonCurve() {
    if (!drawingCurve() && !getPendingLabelPath()) return;
    curve = createCurveState();
    previewPoint = null;
    clearPendingLabelPath();
    gui.dispatchEvent('map-needs-refresh');
  }

  // closed: end the curve where it began
  function finishCurve(closed) {
    var knots = curve.knots.slice();
    var complete = curveIsComplete(curve);
    abandonCurve();
    if (!complete) return;
    if (closed) knots.push(knots[0].slice());
    addSymbol(knots, getAddCurveOptions(newStyle.curve, closed), 'Add curve');
  }

  // --- commands

  function placeIcon(p) {
    hideInstructions();
    if (newStyle.text.text) {
      placeMarker(p);
    } else {
      addSymbol([p], getAddIconOptions(newStyle.icon), 'Add symbol');
    }
  }

  // A symbol with text on it is a label with an icon behind it, which -labels
  // places in one command. The next one gets the next number, so that a row
  // of clicks numbers a map.
  function placeMarker(p) {
    var target = getTarget();
    var text = getMarkerTextStyle();
    var coords = [target ? translateDisplayPoint(target, p) : p];
    runGuiEditCommand(gui, getAddLabelCommand(coords, {
      target: getSymbolTarget(target, isAnnotationLayer, null),
      text: text.text,
      style: getAddMarkerFields(newStyle.icon, text)
    }), {
      title: 'Add symbol',
      onSuccess: function() {
        if (!newStyle.text.autoNumber || newStyle.text.text != text.text) return;
        newStyle.text.text = getNextMarkerText(text.text);
        panel.update();
      }
    });
  }

  // The next marker's text style, with the font new labels get if the panel
  // has not been given one, in the nearest face it has
  function getMarkerTextStyle() {
    var t = Object.assign({}, newStyle.text);
    var variant;
    t.font = t.font || getNewLabelFontName();
    variant = getNearestFontStyleVariant(t.font, t.style, t.weight);
    if (variant) {
      t.style = variant.style;
      t.weight = variant.weight;
    }
    return t;
  }

  function addSymbol(displayCoords, options, title) {
    var target = getTarget();
    var coords = displayCoords.map(function(p) {
      return target ? translateDisplayPoint(target, p) : p;
    });
    runGuiEditCommand(gui, getAddSymbolCommand(coords, {
      options: options,
      target: getSymbolTarget(target, isAnnotationLayer, null)
    }), {title: title});
  }

  function deleteSymbols(ids) {
    deselect();
    runGuiEditCommand(gui, getSymbolDeleteCommand(ids), {
      title: ids.length > 1 ? 'Delete symbols' : 'Delete symbol'
    });
  }

  // --- utilities

  function pixToMapCoords(x, y) {
    return ext.pixCoordsToMapCoords(x, y);
  }

  function scaleThreshold(px) {
    return px * ext.getPixelSize();
  }

  function cloneShape(shp) {
    return shp.map(function(p) { return [p[0], p[1]]; });
  }

  function samePoint(a, b) {
    if (!a || !b) return a === b;
    return a[0] === b[0] && a[1] === b[1];
  }
}
