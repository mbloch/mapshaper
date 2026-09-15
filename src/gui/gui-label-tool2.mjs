import { internal } from './gui-core';
import { translateDisplayPoint } from './gui-display-utils';
import { showPopupAlert } from './gui-alert';
import { runGuiEditCommand } from './gui-edit-command';
import { FloatingToolbar } from './gui-floating-toolbar';
import {
  getLabelTarget, getAddLabelCommand, getUpdateLabelCommand
} from './gui-label-commands';
import { findNearestKnot, knotMoveIsValid } from './gui-label-knots';
import { LabelEditor } from './gui-label-editor';
import { LabelSelection } from './gui-label-selection';
import { getNewLabelStyle } from './gui-label-style-state';
import {
  setPendingLabelPath,
  clearPendingLabelPath,
  getPendingLabelPath
} from './gui-label-path-guide';
import {
  createCurveState, removeLastKnot, toggleCorner, curveIsComplete,
  getInteriorCorners, handleClick, getDblclickAction, clearGesture,
  MIN_KNOT_DISTANCE, KNOT_HIT_THRESHOLD
} from './gui-label-curve-state';

// The label tool: arming a label type, placing an anchor or a curve, turning
// the result into an -add-label command, and handing the new label to the
// in-place text editor.
//
// Creating a label and editing one are one gesture, not two: a click leaves a
// caret in a label ready to be typed into, whether the label is new or already
// on the map. The editor itself lives in gui-label-editor.mjs; styling lives in
// the panel.
//
// See docs/development/label-tool-design.md.

export function initLabelTool(gui, ext, hit) {
  // which kind of label a click creates: null, 'anchor' or 'path'
  var armed = null;
  var curve = createCurveState();
  // The pointer's position while a curve is being drawn, in display
  // coordinates, or null when the pointer is off the map. It is not a knot: the
  // curve is only drawn through it, so that the end of the path follows the
  // pointer and shows what the next click would commit to.
  var previewPoint = null;
  // The knot being dragged, or null while nothing is being dragged.
  var drag = null;
  // The handle under the pointer, or null. Found on hover rather than at
  // dragstart -- see updateHoverHandle().
  var hoverHandle = null;
  var editor = new LabelEditor(gui, ext);
  var selection = new LabelSelection(gui, ext, hit, function() {
    return editor.isOpen() ? editor.getFeatureId() : -1;
  });
  var toolbar, anchorBtn, pathBtn, alert;

  gui.addMode('label_tool', turnOn, turnOff);

  gui.on('interaction_mode_change', function(e) {
    if (e.mode == 'label') {
      gui.enterMode('label_tool');
    } else if (gui.getMode() == 'label_tool') {
      gui.clearMode();
    }
    // higher priority than the hit control, so that turnOff() still sees the
    // hit target it was working with
  }, null, 10);

  function turnOn() {
    getToolbar().show();
    setArmed(getInitialTool());
    updateButtons();
    selection.turnOn();
  }

  // What the tool starts armed with. On a layer that has no labels on it, the
  // only thing to do is place one, so the tool says so rather than waiting to
  // be told: there is nothing there to select, restyle or type into. On a layer
  // that already has labels, arming would make the first click place a label
  // next to the one the user probably meant to click, so it starts idle.
  function getInitialTool() {
    var o = gui.model.getActiveLayer();
    var lyr = o && o.layer;
    // An empty label layer counts as having none: the field is there, but there
    // is still nothing on the map to click.
    var hasLabels = !!lyr && internal.layerHasLabels(lyr) &&
      internal.getFeatureCount(lyr) > 0;
    return hasLabels ? null : 'anchor';
  }

  function turnOff() {
    editor.close();
    deselectLabels();
    selection.turnOff();
    abandonCurve();
    armed = null;
    updateButtons();
    hideInstructions();
    drag = null;
    hoverHandle = null;
    // setArmed() would skip this when nothing was armed, and the cursor has to
    // go back whether or not it was a crosshair.
    gui.container.findChild('.map-layers').classed('label-tool', false);
    gui.container.findChild('.map-layers').classed('label-handle', false);
    if (toolbar) toolbar.hide();
    if (gui.interaction.getMode() == 'label') {
      // the mode change came from somewhere other than the mode menu
      gui.interaction.turnOff();
    }
  }

  function active() {
    return gui.getMode() == 'label_tool';
  }

  // A curve is in progress from the first knot until it is finished or
  // abandoned; while it is, clicks extend it rather than starting something new.
  function drawingCurve() {
    return curve.knots.length > 0;
  }

  function getToolbar() {
    if (toolbar) return toolbar;
    toolbar = new FloatingToolbar(gui, {name: 'label-toolbar'});
    anchorBtn = toolbar.addButton('#text-tool-icon', {
      tooltip: 'Add a label'
    }).on('click', function() {
      setArmed(armed == 'anchor' ? null : 'anchor');
    });
    pathBtn = toolbar.addButton('#curved-text-icon', {
      tooltip: 'Add a label along a path'
    }).on('click', function() {
      setArmed(armed == 'path' ? null : 'path');
    });
    return toolbar;
  }

  function setArmed(mode) {
    if (armed == mode) return;
    if (drawingCurve()) abandonCurve();
    armed = mode;
    updateButtons();
    showInstructions();
  }

  function updateButtons() {
    if (!toolbar) return;
    anchorBtn.setSelected(armed == 'anchor');
    pathBtn.setSelected(armed == 'path');
    updateCursor();
  }

  // A crosshair while a click would place something, and not while it would
  // land on a label instead -- the same rule, and the same class-on-.map-layers
  // mechanism, as the point tool's add cursor.
  //
  // A handle under the pointer outranks the crosshair: a drag there moves the
  // handle rather than placing anything, so saying "click to place" would be
  // wrong even with a tool armed.
  function updateCursor() {
    var el = gui.container.findChild('.map-layers');
    var onHandle = active() && !!hoverHandle;
    var placing = active() && !!armed && hit.getHitId() == -1 && !onHandle;
    el.classed('label-tool', placing);
    el.classed('label-handle', onHandle);
  }

  function showInstructions() {
    hideInstructions();
    if (!armed) return;
    alert = showPopupAlert(armed == 'anchor' ?
      'Instructions: click on the map to place a label.' :
      'Instructions: click to place points along the path. Double-click, ' +
      'Enter or Escape to finish, or double-click a point to make it a ' +
      'corner. Backspace removes the last point.',
      null, {non_blocking: true, max_width: '330px'});
  }

  function hideInstructions() {
    if (!alert) return;
    alert.close('fade');
    alert = null;
  }

  // A label goes through two states before its text can be edited: a click
  // selects it for styling, and a click on the label that is already the whole
  // selection opens its text. The two are kept apart because they want opposite
  // things -- styling acts on any number of labels and drives the panel, text
  // editing acts on exactly one and has nothing to do with the panel.
  hit.on('click', function(e) {
    if (!active()) return;
    if (armed == 'path' && drawingCurve()) {
      extendCurve(pixToMapCoords(e.x, e.y));
      return;
    }
    // A click away from the text finishes the label being typed into, and does
    // nothing else: leaving one label is its own gesture, and placing the next
    // one takes another click. This is also what makes one undo step cover one
    // label's text rather than one keystroke. The textarea's own blur ends the
    // session too, but not when the click lands on the SVG layer, which does
    // not take focus.
    if (editor.isOpen() && !clickIsOnEditedLabel(e)) {
      editor.close();
      return;
    }
    // A click inside the label being typed into moves the caret. A pending
    // label resolved to no feature, so it is handled here rather than in
    // clickLabel(), which works from a feature id.
    if (editor.isOpen() && editor.getFeatureId() == -1) {
      editor.setCaretAtPoint(getLabelSpacePoint(editor.getAnchorCoords(), e));
      return;
    }
    // A click on a label never places another on top of it, whichever tool is
    // armed: that is never what was meant. A click on any other kind of feature
    // is just a click on the map, because labels are placed against map
    // features and a curve has to be able to start on one.
    if (e.id > -1 && clickLabel(e.id, e)) return;
    if (editor.isOpen()) return; // a click within the text moved the caret
    // Nothing was hit. Any selection is now over with, and the click means
    // whatever the armed tool says it means.
    deselectLabels();
    if (armed == 'anchor') {
      beginLabel([pixToMapCoords(e.x, e.y)], []);
    } else if (armed == 'path') {
      extendCurve(pixToMapCoords(e.x, e.y));
    }
  });

  // Acts on a click that landed on feature @id: opens the label's text if it
  // was already the whole selection, moves the caret if its session is already
  // open, and otherwise leaves it selected for styling. Returns false if the
  // feature is not a label at all, so the caller can treat the click as a click
  // on the map.
  function clickLabel(id, e) {
    var target = hit.getHitTarget();
    if (!target || !isLabel(target, id)) return false;
    if (editor.isOpen() && editor.getFeatureId() == id) {
      // The hit control selected this label on the way in, as it does for any
      // click that lands on a feature. A label being typed into is not a label
      // being styled, so that selection is given straight back.
      deselectLabels();
      editor.setCaretAtPoint(getLabelSpacePoint(getFeatureAnchor(target, id), e));
      return true;
    }
    // Selecting is the hit control's job and it has already happened; a click
    // on the sole selected label is the one that means something more.
    if (e.clicked_only_selection) {
      editLabel(id, e);
    }
    return true;
  }

  // Opens the editor on a label, putting the caret where it was clicked rather
  // than at the end of the text. The styling selection is dropped for the
  // duration: a label being typed into is not a label being styled, and the
  // panel would otherwise still be pointed at it.
  function editLabel(id, e) {
    var target = hit.getHitTarget();
    if (!target || !isLabel(target, id)) return false;
    deselectLabels();
    if (!editor.open(target, id, {onClose: reselectOnClose(id)})) return false;
    editor.setCaretAtPoint(getLabelSpacePoint(getFeatureAnchor(target, id), e));
    return true;
  }

  // Leaving a text editing session puts the label back where it came from. A
  // label reached by clicking goes back to being selected for styling, so that
  // Escape is a step back rather than a jump out. A label the tool just created
  // came from nothing and returns to nothing, which leaves the panel describing
  // the next label rather than the one just written.
  function reselectOnClose(id) {
    return function(session) {
      if (session.created || !active()) return;
      // A label emptied of its text is gone. Selecting its id would land on
      // whichever label moved up into the gap, and the delete command has not
      // run yet, so the feature count cannot be used to notice that.
      if (session.removed) return;
      // Clicking a different label is one of the ways to get here, and that
      // click has already selected the label it landed on. Only an empty
      // selection is this label's to reclaim.
      if (hit.getSelectionIds().length > 0) return;
      if (id < getTargetFeatureCount(hit.getHitTarget())) {
        hit.setSelectionIds([id]);
      }
    };
  }

  // Whether a click landed inside the session's own label, which moves the
  // caret instead of ending the session.
  //
  // A committed label is recognized by the feature the click resolved to. A
  // pending one has no feature, so the question becomes whether the click landed
  // on something the editor drew -- which matters most for a path label, where
  // the curve is on screen and clicking it must not throw away the path that
  // was just drawn.
  function clickIsOnEditedLabel(e) {
    if (e.id > -1 && e.id == editor.getFeatureId()) return true;
    return editor.ownsNode(getEventNode(e));
  }

  // The DOM node a hit event came from. A hit event's originalEvent is the
  // mouse event, whose own originalEvent is the DOM one, so the node is two
  // levels down.
  function getEventNode(e) {
    var mouseEvt = e && e.originalEvent;
    var domEvt = mouseEvt && mouseEvt.originalEvent || mouseEvt;
    return domEvt && domEvt.target || null;
  }

  function deselectLabels() {
    if (hit.getSelectionIds().length > 0) hit.clearSelection();
  }

  function getTargetFeatureCount(target) {
    return target && target.shapes ? target.shapes.length : 0;
  }

  function isLabel(target, id) {
    var records = target.data ? target.data.getRecords() : null;
    return !!(records && internal.svg.featureIsLabel(records[id]));
  }

  // A click position in the coordinate space the label's characters are laid
  // out in: the space inside its symbol group, which is translated to the
  // label's anchor and scaled by the symbol scale.
  // A pointer position in the label's own coordinate space -- the space inside
  // its symbol group, which is where the editor works. @anchor is the label's
  // first knot, in display coordinates.
  function getLabelSpacePoint(anchor, e) {
    var scale = ext.getSymbolScale() || 1;
    var p = anchor ? ext.translateCoords(anchor[0], anchor[1]) : [0, 0];
    return {x: (e.x - p[0]) / scale, y: (e.y - p[1]) / scale};
  }

  function getFeatureAnchor(target, id) {
    var shp = target && target.shapes[id];
    return shp && shp[0] || null;
  }

  // A map redraw replaces a layer's markup wholesale, so an open session has to
  // find its nodes again and write the text being edited back into them, and
  // the selection cues have to be drawn onto the new markup.
  gui.on('map_rendered', function(e) {
    editor.refresh();
    // The cues went with the old markup, so they have to be drawn again --
    // except after a 'hover' draw, which leaves the SVG alone. That draw now
    // runs on every mouse move while a curve is being previewed, and rebuilding
    // intact cues on each one is work for nothing.
    selection.refresh(!e || e.action != 'hover');
  });

  hit.on('change', function(e) {
    if (!active() || e.mode != 'label') return;
    selection.refresh();
    updateCursor();
  });

  // Runs the free end of a curve along with the pointer. Leaving the map drops
  // the preview back to the knots already placed rather than finishing the
  // curve: a pointer that has gone to the toolbar or off the window has not
  // said anything about where the path ends.
  hit.on('hover', function(e) {
    var p;
    if (!active()) return;
    updateHoverHandle(e);
    if (armed != 'path' || !drawingCurve()) return;
    p = e.overMap ? pixToMapCoords(e.x, e.y) : null;
    if (samePoint(p, previewPoint)) return;
    previewPoint = p;
    refreshCurve('hover');
  });

  // Dragging a handle moves it: a knot reshapes a curve, an anchor moves an
  // anchored label. Only a selected label draws handles, and only a handle
  // takes a drag -- everything else over a label is left alone so that the map
  // still pans, which is why these handlers stop the event themselves.
  hit.on('dragstart', function(e) {
    var target, handle, shapes;
    if (!active() || drawingCurve() || editor.isOpen()) return;
    // The handle comes from the last hover, not from testing the pointer here.
    // dragstart arrives with the pointer already moved off the handle -- by the
    // first mousemove that made it a drag, which on a quick gesture is further
    // than the handle's own radius. Testing at this point missed handles the
    // user had grabbed squarely. The line tools track their vertices on hover
    // for the same reason.
    handle = hoverHandle;
    if (!handle) return;
    target = hit.getHitTarget();
    shapes = getDisplayShapes(target);
    drag = {
      id: handle.id,
      index: handle.index,
      target: target,
      // The knots as they were, kept by reference so that rolling back restores
      // exactly the array the layer had. The drag then works on a copy: the
      // display layer and the data layer can share their knot arrays, and
      // moving a point in place would edit the data behind the command's back.
      startKnots: shapes[handle.id],
      // Where within the handle it was grabbed, measured from where the pointer
      // was when it was over the handle rather than from where it has already
      // got to, so that the knot tracks the pointer instead of trailing the
      // first move's distance behind it for the rest of the drag.
      offset: getGrabOffset(handle.point, handle.pointer)
    };
    shapes[handle.id] = cloneKnots(drag.startKnots);
    consumeDrag(e);
  });

  hit.on('drag', function(e) {
    var shp, p;
    if (!drag) return;
    consumeDrag(e);
    shp = getDisplayShapes(drag.target)[drag.id];
    p = applyGrabOffset(pixToMapCoords(e.x, e.y), drag.offset);
    // A knot dropped onto its neighbour collapses a segment to nothing, which
    // leaves the fitter no direction to work from. The move is refused rather
    // than allowed to make the label vanish.
    if (!knotMoveIsValid(shp, drag.index, p, scaleThreshold(MIN_KNOT_DISTANCE))) {
      return;
    }
    shp[drag.index] = p;
    drag.moved = true;
    // A moved knot changes the baseline the text is laid along, so the symbol
    // layer has to be rebuilt rather than repositioned.
    gui.dispatchEvent('map-needs-refresh');
  });

  hit.on('dragend', function(e) {
    var o = drag;
    if (!o) return;
    consumeDrag(e);
    drag = null;
    // A press that never moved is a click, and the click handler has dealt with
    // it. Rolling back is still needed: the shape was replaced with a copy.
    if (!o.moved) {
      getDisplayShapes(o.target)[o.id] = o.startKnots;
      return;
    }
    commitKnotDrag(o);
  });

  // Turns the previewed move into one -update-label.
  //
  // The preview is rolled back first so that the command is what changes the
  // data. Undo and session history are both keyed to commands, and a drag that
  // had already written its own result would leave undo with a step that
  // undoes nothing.
  function commitKnotDrag(o) {
    var shapes = getDisplayShapes(o.target);
    var ids = hit.getSelectionIds();
    var coords = shapes[o.id].map(function(p) {
      return translateDisplayPoint(o.target, p);
    });
    shapes[o.id] = o.startKnots;
    runGuiEditCommand(gui, getUpdateLabelCommand(coords, o.id, o.target.name), {
      title: 'Move label',
      // The label stays selected, so its handles are still there to be nudged
      // again. Re-running the command rebuilds the layer, which drops the
      // selection the drag started from.
      onSuccess: function() { hit.setSelectionIds(ids); }
    });
  }

  // Keeps track of the handle the pointer is over, which is what a drag starts
  // from and what the cursor reflects. A drag holds its own copy, so this stays
  // as it is until the drag ends.
  function updateHoverHandle(e) {
    var found = drawingCurve() || editor.isOpen() || !e.overMap ? null :
      findHandle(hit.getHitTarget(), e);
    var changed = !!found != !!hoverHandle;
    if (drag) return;
    hoverHandle = found;
    if (changed) updateCursor();
  }

  // The handle under the pointer, or null. Only a selected label's handles are
  // grabbable -- see gui-label-knots.mjs.
  function findHandle(target, e) {
    var shapes = target && getDisplayShapes(target);
    var ids = hit.getSelectionIds();
    var p = pixToMapCoords(e.x, e.y);
    var handle;
    if (!shapes || ids.length === 0) return null;
    handle = findNearestKnot(shapes, ids, p, scaleThreshold(KNOT_HIT_THRESHOLD));
    if (handle) handle.pointer = p;
    return handle;
  }

  // Knots are drawn, hit-tested and dragged in display coordinates, which are
  // the layer's own only when it is not reprojected for display.
  function getDisplayShapes(target) {
    var lyr = target && target.gui && target.gui.displayLayer;
    return lyr && lyr.shapes ? lyr.shapes : target && target.shapes;
  }

  function getGrabOffset(knot, pointer) {
    return [knot[0] - pointer[0], knot[1] - pointer[1]];
  }

  function applyGrabOffset(p, offset) {
    return [p[0] + offset[0], p[1] + offset[1]];
  }

  function cloneKnots(shp) {
    return shp.map(function(p) { return [p[0], p[1]]; });
  }

  // The hit control leaves label drags unstopped so that dragging anywhere
  // other than a handle still pans the map. Once the tool has taken a drag it
  // has to stop the event itself.
  function consumeDrag(e) {
    if (e.originalEvent) e.originalEvent.stopPropagation();
  }

  hit.on('dblclick', function(e) {
    var o;
    if (!active()) return;
    if (armed == 'path' && drawingCurve()) {
      o = getDblclickAction(curve, pixToMapCoords(e.x, e.y),
        scaleThreshold(KNOT_HIT_THRESHOLD));
      if (o.action == 'corner') {
        toggleCorner(curve, o.index);
        refreshCurve();
      } else if (o.action == 'finish') {
        finishCurve();
      }
      return;
    }
    // Double-clicking a label reaches straight into its text, which is the
    // gesture most editors use and saves selecting it first. The single-click
    // route got there already if the label was the selection; this covers the
    // one that was not.
    if (e.id > -1 && !editor.isOpen()) editLabel(e.id, e);
  });

  gui.keyboard.on('keydown', function(e) {
    if (!active()) return;
    // While a session is open the textarea has focus and handles its own keys;
    // it stops propagation for the ones it acts on.
    if (editor.isOpen()) return;
    if (e.keyName == 'esc') {
      // One rung per press, innermost first: the curve being drawn, then the
      // selection, then the armed tool. The hit control's own escape handler
      // stands down while a mode is on, so this is the whole ladder.
      if (drawingCurve()) {
        // Escape ends the path at the last knot placed rather than discarding
        // it, so there is a keyboard way to finish a curve -- double-clicking
        // was otherwise the only one. A single knot is not a path, so
        // finishCurve() drops it; backspace is the way back from anything more.
        finishCurve();
      } else if (hit.getSelectionIds().length > 0) {
        deselectLabels();
      } else {
        setArmed(null);
      }
      consume(e);
    } else if (!drawingCurve()) {
      return;
    } else if (e.keyName == 'delete') {
      // backspace takes back the last knot, and the last one ends the curve
      removeLastKnot(curve);
      clearGesture(curve); // the indexes no longer line up
      if (drawingCurve()) refreshCurve(); else abandonCurve();
      consume(e);
    } else if (e.keyName == 'enter') {
      finishCurve();
      consume(e);
    }
  }, null, 10);

  // Suppresses the key's default action as well as the rest of the GUI's
  // handlers. The default matters here: finishing a curve opens an editing
  // session and focuses its textarea, and without this the same Enter goes on
  // to type a newline into the label that was just created.
  function consume(e) {
    e.stopPropagation();
    if (e.originalEvent) e.originalEvent.preventDefault();
  }

  function extendCurve(p) {
    var result = handleClick(curve, p, scaleThreshold(KNOT_HIT_THRESHOLD),
      scaleThreshold(MIN_KNOT_DISTANCE));
    if (result != 'added') return;
    hideInstructions();
    refreshCurve();
  }

  // action: (optional) 'hover' when only the pointer has moved, which keeps the
  //   redraw off the main layers -- this runs on every mouse move.
  function refreshCurve(action) {
    setPendingLabelPath(curve.knots, getInteriorCorners(curve), previewPoint);
    gui.dispatchEvent('map-needs-refresh', {action: action});
  }

  function abandonCurve() {
    if (!drawingCurve() && !getPendingLabelPath()) return;
    curve = createCurveState();
    previewPoint = null;
    clearPendingLabelPath();
    gui.dispatchEvent('map-needs-refresh');
  }

  function finishCurve() {
    var knots = curve.knots;
    var corners = getInteriorCorners(curve);
    if (!curveIsComplete(curve)) {
      // one knot is not a path; discard rather than silently making an
      // anchored label the user did not ask for
      abandonCurve();
      return;
    }
    abandonCurve();
    beginLabel(knots, corners);
  }

  // Puts a caret where the label is going to be, without creating anything.
  //
  // Placing a label and typing into it are one gesture, but only the typing is
  // an edit: a click that is thought better of has to be able to leave no trace.
  // So the click opens a *pending* session, which draws the label and holds its
  // text, and the label becomes a feature only when the session ends with
  // something in it. See LabelEditor.openPending().
  function beginLabel(displayCoords, corners) {
    var target = hit.getHitTarget();
    if (!target) return;
    hideInstructions();
    editor.openPending(target, {
      coords: displayCoords,
      corners: corners,
      // Read on every render rather than snapshotted, so that choosing a font
      // or a position while the caret is sitting there is visible immediately.
      getStyle: function() { return getNewLabelStyle(gui); },
      create: function(text) { createLabel(displayCoords, corners, text); }
    });
  }

  // Creates the label being typed into. One command carries its geometry, its
  // style and its text, so a new label is a single entry in the session history
  // and a single step to undo.
  function createLabel(displayCoords, corners, text) {
    var target = hit.getHitTarget();
    var coords = displayCoords.map(function(p) {
      return target ? translateDisplayPoint(target, p) : p;
    });
    runGuiEditCommand(gui, getAddLabelCommand(coords, {
      target: getLabelTarget(target, internal.layerHasLabels),
      corners: corners,
      text: text,
      // whatever the style panel was set to while nothing was selected, so that
      // a font can be chosen before the first label exists
      style: getNewLabelStyle(gui)
    }), {title: 'Add label'});
  }

  // Display coordinates: the space the map is drawn in, and the space the path
  // guide is drawn in. Converted to the layer's own coordinates only when the
  // command is built.
  function pixToMapCoords(x, y) {
    return ext.pixCoordsToMapCoords(x, y);
  }

  function samePoint(a, b) {
    if (!a || !b) return a === b;
    return a[0] === b[0] && a[1] === b[1];
  }

  // A pixel threshold in display coordinates, so that clicking feels the same
  // at every zoom level.
  function scaleThreshold(px) {
    return px * ext.getPixelSize();
  }
}
