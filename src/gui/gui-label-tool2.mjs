import { internal } from './gui-core';
import { translateDisplayPoint } from './gui-display-utils';
import { addEmptyLayer } from './gui-add-layer';
import { showPopupAlert } from './gui-alert';
import { runGuiEditCommand } from './gui-edit-command';
import { FloatingToolbar } from './gui-floating-toolbar';
import {
  getLabelTarget, getAddLabelCommand, getUpdateLabelCommand,
  getLabelDeleteCommand, getLabelPlacementCommand, getLabelOffsetCommand
} from './gui-label-commands';
import {
  projectOntoPolyline, getDragPlacement, getPlacementValues,
  getStartOffsetPct, getDefaultOffsetPct
} from './gui-label-path-drag';
import { getOffsetDragValues } from './gui-label-offset';
import { getNewLabelFontName } from './gui-label-fonts';
import { setMultilineAttribute } from './gui-svg-labels';
import { getLabelPathNode } from './gui-svg-symbols';
import { findNearestKnot, knotMoveIsValid } from './gui-label-knots';
import { LabelEditor } from './gui-label-editor';
import { LabelSelection } from './gui-label-selection';
import {
  getNewLabelStyle, labelTextIsDraggable, setLabelPositionMode
} from './gui-label-style-state';
import {
  setPendingLabelPath,
  clearPendingLabelPath,
  getPendingLabelPath
} from './gui-label-path-guide';
import {
  createCurveState, removeLastKnot, curveIsComplete,
  handleClick, getDblclickAction, clearGesture,
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

// How closely the flattened curve has to follow the real one for a drag to be
// projected onto it, in pixels. Half a pixel is finer than the gesture can
// resolve and still leaves a short polyline to walk per mouse move.
var FLATTEN_PX = 0.5;

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
  // The label whose text is being dragged, or null: a path label's along its
  // curve, or an anchored one's away from its anchor.
  var textDrag = null;
  // The handle under the pointer, or null. Found on hover rather than at
  // dragstart -- see updateHoverHandle().
  var hoverHandle = null;
  // The selected label whose glyphs are under the pointer, or -1. Tracked for
  // the same reason as hoverHandle.
  var hoverTextId = -1;
  // Where the pointer was when it was last hovering the map, in display
  // coordinates. A drag on a label's text starts from here rather than from
  // the dragstart event -- see beginTextDrag().
  var hoverPoint = null;
  var editor = new LabelEditor(gui, ext);
  var selection = new LabelSelection(gui, ext, hit, function() {
    return editor.isOpen() ? editor.getFeatureId() : -1;
  });
  var toolbar, anchorBtn, pathBtn, alert;

  gui.addMode('label_tool', turnOn, turnOff);

  gui.on('interaction_mode_change', function(e) {
    if (e.mode == 'label') {
      addTargetLayerIfMissing();
      gui.enterMode('label_tool');
    } else if (gui.getMode() == 'label_tool') {
      gui.clearMode();
    }
    // higher priority than the hit control, so that turnOff() still sees the
    // hit target it was working with
  }, null, 10);

  // A session that has imported nothing has no layer for a label to go into,
  // and every one of this tool's gestures needs one: a click has no coordinate
  // space to land in, and the pending label is drawn into the target layer's
  // own SVG container. Without this the toolbar appeared, a tool armed, the
  // cursor became a crosshair, and clicking the map did nothing at all.
  //
  // So the tool makes the layer it needs, which is what the point and line
  // tools do on entry as well (`addEmptyLayer()` in `gui-edit-points.mjs` and
  // `gui-draw-lines2.mjs`). It is named rather than left unnamed, unlike
  // theirs: it is the layer `getLabelTarget()` would have created for a label
  // anyway, and naming it is what lets the `-add-label` commands name their
  // target and so replay from the session history.
  //
  // Called before entering the tool's own mode, because getInitialTool() reads
  // the active layer to decide what to arm.
  function addTargetLayerIfMissing() {
    if (gui.model.getActiveLayer()) return;
    addEmptyLayer(gui, 'labels', 'point');
  }

  function turnOn() {
    getToolbar().show();
    // Fixed every time the tool opens, so that a stray drag cannot displace
    // text in a session that never asked for it. It is remembered for as long
    // as the tool stays on, which is what makes placing several labels by hand
    // one decision rather than one per label.
    setLabelPositionMode(gui, 'fixed');
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
    textDrag = null;
    hoverHandle = null;
    hoverTextId = -1;
    hoverPoint = null;
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
    // A selected path label's glyphs are a handle as much as its knots are: a
    // drag there slides the text along its curve.
    var onHandle = active() && (!!hoverHandle || hoverTextId > -1);
    var placing = active() && !!armed && hit.getHitId() == -1 && !onHandle;
    el.classed('label-tool', placing);
    el.classed('label-handle', onHandle);
  }

  function showInstructions() {
    hideInstructions();
    if (!armed) return;
    alert = showPopupAlert(armed == 'anchor' ?
      'Click on the map to place a label.' :
      'Click to draw a curved path. Type Esc or double-click ' +
      'to finish. Backspace removes the last point.',
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

  // Right-clicking a label offers to delete it.
  //
  // The tool opens this menu itself, rather than leaving it to the inspection
  // control as the other non-drawing modes do, because deleting a label here
  // has to be a command like every other edit the tool makes -- the generic
  // "delete point" item mutates the layer in place, which would leave the
  // deletion out of the session history and out of step with undo.
  hit.on('contextmenu', function(e) {
    var target = hit.getHitTarget();
    var id;
    if (!active()) return;
    id = getRightClickedLabel(e);
    if (target && id > -1) {
      e.deleteFeature = getDeleteAction(target, id);
      // Nobody guesses that text is dragged across its own curve, and there is
      // no bracket drawn to suggest it, so the gesture has a second way in.
      // Not on a label being typed into: its text is in the editor rather than
      // in the feature, and the command would rebuild the layer underneath it.
      if (isPathLabel(target, id) && !editorIsOn(id)) {
        e.flipLabel = getFlipAction(target, id);
      }
    }
    gui.contextMenu.open(e, target);
  });

  // The label a right-click was aimed at, or -1.
  //
  // A label being typed into is not a hit target -- the editor's own overlay
  // is in front of it, and the hit test looks for symbols in the layer's
  // markup -- so the session answers for it, the same way it does for a click
  // that lands inside it. A pending label has no feature to delete.
  function getRightClickedLabel(e) {
    var target = hit.getHitTarget();
    if (target && e.id > -1 && isLabel(target, e.id)) return e.id;
    if (editor.isOpen() && editor.getFeatureId() > -1 &&
        clickIsOnEditedLabel(e)) {
      return editor.getFeatureId();
    }
    return -1;
  }

  // Deleting a label ends whatever was being done to it first: its text
  // session would otherwise write the text back to an id that now belongs to
  // the label that moved up into the gap, and the same shift is why the
  // selection cannot be kept either.
  function getDeleteAction(target, id) {
    return function() {
      if (editor.isOpen() && editor.getFeatureId() == id) editor.cancel();
      deselectLabels();
      runGuiEditCommand(gui, getLabelDeleteCommand(id, target.name), {
        title: 'Delete label'
      });
    };
  }

  // Flips a label from the context menu, which is the same edit as dragging
  // its text across its curve and writes the same command.
  function getFlipAction(target, id) {
    return function() {
      var rec = getRecord(target, id);
      var anchor = rec['text-anchor'] || '';
      // With no pointer to fall back on, an offset this tool cannot read is
      // turned around as though the label were where its text-anchor says.
      var placement = {
        offset: getStartOffsetPct(rec['label-start-offset'], anchor,
          getDefaultOffsetPct(anchor)),
        flipped: true
      };
      runPlacementCommand(target, id, getPlacementValues(placement, anchor),
        anchor, getDisplayShapes(target)[id]);
    };
  }

  function isPathLabel(target, id) {
    return internal.svg.shapeIsPathLabel(getDisplayShapes(target)[id],
      getRecord(target, id));
  }

  function editorIsOn(id) {
    return editor.isOpen() && editor.getFeatureId() == id;
  }

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
    // The hit id is one event behind on 'hover' -- the control dispatches the
    // event and then tests the new position -- so the label under the pointer
    // is settled here rather than there.
    updateHoverText();
    updateCursor();
  });

  // Runs the free end of a curve along with the pointer. Leaving the map drops
  // the preview back to the knots already placed rather than finishing the
  // curve: a pointer that has gone to the toolbar or off the window has not
  // said anything about where the path ends.
  hit.on('hover', function(e) {
    var p;
    if (!active()) return;
    if (!drag && !textDrag) {
      hoverPoint = e.overMap ? pixToMapCoords(e.x, e.y) : null;
    }
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
    if (!active() || drawingCurve() || editor.isOpen()) return;
    // The handle comes from the last hover, not from testing the pointer here.
    // dragstart arrives with the pointer already moved off the handle -- by the
    // first mousemove that made it a drag, which on a quick gesture is further
    // than the handle's own radius. Testing at this point missed handles the
    // user had grabbed squarely. The line tools track their vertices on hover
    // for the same reason.
    // The glyphs first: hoverTextId is only set when a drag there means
    // something the handle underneath does not -- see updateHoverText().
    if (hoverTextId > -1) {
      if (beginTextDrag(e)) consumeDrag(e);
      return;
    }
    if (!hoverHandle) return;
    beginKnotDrag(hoverHandle);
    consumeDrag(e);
  });

  // handle: {id, index, point, pointer} from findHandle(), or the same shape
  //   made up for a drag that grabbed a label somewhere other than its knot
  function beginKnotDrag(handle) {
    var target = hit.getHitTarget();
    var shapes = getDisplayShapes(target);
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
  }

  hit.on('drag', function(e) {
    var shp, p;
    if (textDrag) {
      consumeDrag(e);
      updateTextDrag(e);
      return;
    }
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
    if (textDrag) {
      o = textDrag;
      textDrag = null;
      consumeDrag(e);
      selection.setTether(-1);
      // A press that never moved is a click, which the click handler has
      // already dealt with; nothing was previewed, so nothing is undone.
      if (o.moved) commitTextDrag(o);
      return;
    }
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

  // What a drag on a selected label's glyphs means, which depends on the kind
  // of label and -- for an anchored one -- on the tool's position mode.
  //
  // In Fixed mode the text is fixed to its anchor, so dragging it is dragging
  // the label: the same edit as moving the anchor, and so the same drag. In
  // Draggable mode the text comes off its anchor and the drag writes an offset.
  function beginTextDrag(e) {
    var id = hoverTextId;
    var target = hit.getHitTarget();
    var shp = id > -1 ? getDisplayShapes(target)[id] : null;
    if (id < 0 || !shp) return false;
    if (isPathLabel(target, id)) return beginPathTextDrag(e, target, id);
    if (labelTextIsDraggable(gui)) return beginOffsetDrag(e, target, id);
    beginKnotDrag({
      id: id,
      index: 0,
      point: shp[0],
      // From where the pointer was hovering rather than from where it has got
      // to, as with a handle's grab offset: dragstart arrives after the first
      // move, and starting from here would slide the label by that much.
      pointer: hoverPoint || pixToMapCoords(e.x, e.y)
    });
    return true;
  }

  // Dragging a selected path label's glyphs places its text on its curve:
  // along the curve it sets label-start-offset, across the curve it flips the
  // label to the other side. The two are one gesture, because the pointer
  // answers both questions at once -- where it falls on the curve, and which
  // side of it the pointer is on. See gui-label-path-drag.mjs for the math.
  function beginPathTextDrag(e, target, id) {
    var rec = getRecord(target, id);
    var shp = getDisplayShapes(target)[id];
    var nodes = rec ? findLabelNodes(target, id) : null;
    var points, proj, anchor, offset;
    if (!nodes || !nodes.textPath) return false;
    // Flattened once, here: the curve does not change while its text is being
    // dragged along it, and this is consulted on every mouse move.
    points = internal.fitCurveThroughKnots(shp, scaleThreshold(FLATTEN_PX));
    // From where the pointer was hovering rather than from where it has got
    // to, as with a knot's grab offset -- and here it decides the side as well
    // as the offset. dragstart arrives after the first move, which on a drag
    // away from the glyphs has already crossed the curve: a flip was then
    // measured from the far side and could never happen.
    proj = projectOntoPolyline(points, hoverPoint || pixToMapCoords(e.x, e.y));
    if (!proj) return false;
    anchor = rec['text-anchor'] || '';
    offset = getStartOffsetPct(rec['label-start-offset'], anchor, proj.t * 100);
    textDrag = {
      kind: 'path',
      id: id,
      target: target,
      knots: shp,
      points: points,
      anchor: anchor,
      start: {offset: offset, t: proj.t, side: proj.side},
      placement: {offset: offset, flipped: false},
      // What the attributes said before the preview wrote over them, so that
      // the command is what changes the label rather than the drag.
      before: {
        offset: nodes.textPath.getAttribute('startOffset'),
        anchor: nodes.text.getAttribute('text-anchor'),
        d: nodes.path ? nodes.path.getAttribute('d') : null
      },
      moved: false
    };
    return true;
  }

  function updateTextDrag(e) {
    if (textDrag.kind == 'offset') {
      updateOffsetDrag(e);
    } else {
      updatePathTextDrag(e);
    }
  }

  function updatePathTextDrag(e) {
    var o = textDrag;
    var proj = projectOntoPolyline(o.points, pixToMapCoords(e.x, e.y));
    if (!proj) return;
    // A drag that began on the curve itself has no side to have left yet, so
    // the first side the pointer declares is the one it started from.
    if (!o.start.side) o.start.side = proj.side;
    o.placement = getDragPlacement(o.start, proj);
    o.moved = true;
    previewTextPlacement(o);
  }

  // Shows the placement by writing the three attributes that carry it, rather
  // than by rebuilding the layer's markup as a knot drag does. A knot drag
  // changes the baseline and so has to; this one leaves the curve exactly where
  // it is and changes only where the text sits on it and which way it runs --
  // which the browser re-lays out from the attributes alone.
  function previewTextPlacement(o) {
    var values = getPlacementValues(o.placement, o.anchor);
    var nodes = findLabelNodes(o.target, o.id);
    if (!nodes) return;
    nodes.textPath.setAttribute('startOffset', values.offset);
    if (values.anchor) nodes.text.setAttribute('text-anchor', values.anchor);
    if (nodes.path && o.shownFlipped !== values.reversed) {
      o.shownFlipped = values.reversed;
      nodes.path.setAttribute('d', getPreviewPathData(o, values.reversed));
    }
  }

  // The label's baseline, drawn backwards for a flip.
  //
  // The coordinates are reversed rather than the knots, so that the path keeps
  // the origin its symbol group is translated to -- the first knot. The
  // committed version stores the knots the other way round and translates to
  // the other end, and renders the same.
  function getPreviewPathData(o, reversed) {
    var coords = internal.svg.getLabelPathCoords(o.knots, ext.getTransform(),
      ext.getSymbolScale());
    return internal.svg.getLabelPathData(reversed ? coords.reverse() : coords);
  }

  function restoreTextPlacement(o) {
    var nodes = findLabelNodes(o.target, o.id);
    if (!nodes) return;
    setOrRemove(nodes.textPath, 'startOffset', o.before.offset);
    setOrRemove(nodes.text, 'text-anchor', o.before.anchor);
    if (nodes.path) setOrRemove(nodes.path, 'd', o.before.d);
  }

  function setOrRemove(node, name, value) {
    if (value === null) node.removeAttribute(name);
    else node.setAttribute(name, value);
  }

  // Dragging a selected anchored label's glyphs in Draggable mode takes its
  // text off its position: the drag materializes the offsets the label is
  // drawn with, adds its own movement to them and drops label-pos. The
  // arithmetic, including what text-anchor does about it, is in
  // gui-label-offset.mjs.
  function beginOffsetDrag(e, target, id) {
    var rec = getRecord(target, id);
    var nodes = rec ? findLabelNodes(target, id) : null;
    var box, drawn;
    if (!nodes || nodes.textPath) return false;
    drawn = internal.svg.getDrawnLabelOffset(rec);
    box = measureNode(nodes.text);
    textDrag = {
      kind: 'offset',
      id: id,
      target: target,
      // dx and dy are in the space inside the label's symbol group, so pointer
      // movement is divided by the scale that group wears.
      scale: ext.getSymbolScale() || 1,
      // From where the pointer was hovering rather than from where it has got
      // to, as with a handle's grab offset: dragstart arrives after the first
      // move, and measuring from here would leave the text trailing that much
      // behind the pointer for the rest of the drag.
      from: getPointerPixels(e),
      start: {
        dx: drawn.dx,
        dy: drawn.dy,
        anchor: drawn['text-anchor'],
        // The box is the block of text, so this is the widest line of a
        // multi-line label -- which is the width its justification is
        // measured against.
        width: box ? box.width : 0,
        aligned: !!internal.svg.getAlignmentAnchor(rec['label-align'])
      },
      // What the attributes said before the preview wrote over them, so that
      // the command is what changes the label rather than the drag.
      before: {
        x: nodes.text.getAttribute('x'),
        y: nodes.text.getAttribute('y'),
        anchor: nodes.text.getAttribute('text-anchor')
      },
      moved: false
    };
    // The hairline to the anchor, which is what the drag is measured from and
    // often the only thing on screen that says so.
    selection.setTether(id);
    return true;
  }

  function updateOffsetDrag(e) {
    var o = textDrag;
    o.values = getOffsetDragValues(o.start, {
      dx: (e.x - o.from[0]) / o.scale,
      dy: (e.y - o.from[1]) / o.scale
    });
    o.moved = true;
    previewOffset(o);
  }

  // Shows the offset by writing it onto the rendered text, as the path drag
  // writes a placement: the glyphs themselves do not change, only where they
  // sit and how they are justified, which the browser re-lays out from the
  // attributes alone.
  function previewOffset(o) {
    var nodes = findLabelNodes(o.target, o.id);
    if (!nodes) return;
    // The tspans of a multi-line label carry x as well, which is how the
    // renderer writes it: a tspan without one starts where the last line
    // ended.
    setMultilineAttribute(nodes.text, 'x', o.values.x);
    nodes.text.setAttribute('y', o.values.dy);
    nodes.text.setAttribute('text-anchor', o.values['text-anchor']);
    // The cue is drawn around the text rather than moved with it, so it has to
    // be rebuilt to follow -- one getBBox on one label per mouse move.
    selection.refresh(true);
  }

  function restoreOffset(o) {
    var nodes = findLabelNodes(o.target, o.id);
    if (!nodes) return;
    // The renderer always writes x and y on an anchored label, so the removal
    // case is for markup this tool did not draw.
    if (o.before.x === null) nodes.text.removeAttribute('x');
    else setMultilineAttribute(nodes.text, 'x', o.before.x);
    setOrRemove(nodes.text, 'y', o.before.y);
    setOrRemove(nodes.text, 'text-anchor', o.before.anchor);
    selection.refresh(true);
  }

  // Turns the previewed offset into one -style.
  //
  // Only the label under the pointer moves, even with several selected: -style
  // writes one value to every id it is given, so a group drag would set them
  // all to the same absolute offset rather than nudging each by its own delta.
  function commitOffsetDrag(o) {
    var ids = hit.getSelectionIds();
    runGuiEditCommand(gui, getLabelOffsetCommand({
      dx: o.values.dx,
      dy: o.values.dy,
      anchor: o.values['text-anchor'],
      id: o.id,
      target: o.target.name
    }), {
      title: 'Offset label text',
      // The label stays selected, so it can be nudged again. Re-running the
      // command rebuilds the layer, which drops the selection.
      onSuccess: function() { hit.setSelectionIds(ids); },
      // As with a path label's placement, the preview is taken back only if
      // the command fails: it wrote attributes rather than data, so the
      // command's own redraw replaces it, and rolling back first showed the
      // text at its old offset for the frame before that redraw arrived.
      onError: function() { restoreOffset(o); }
    });
  }

  // The pointer's position in pixels: from the last hover if there is one, so
  // that a drag is measured from where the gesture started.
  function getPointerPixels(e) {
    var p = hoverPoint ? ext.translateCoords(hoverPoint[0], hoverPoint[1]) : null;
    return p || [e.x, e.y];
  }

  function measureNode(node) {
    try {
      return node.getBBox();
    } catch (err) {
      return null; // an unrendered node has no box to report
    }
  }

  // The nodes a label's placement is written on: its <text>, and for a path
  // label the <textPath> inside it and the <defs> path its text is laid along.
  // Both are null for an anchored label, which is how the two kinds tell
  // themselves apart in the DOM.
  function findLabelNodes(target, id) {
    var container = target && target.gui && target.gui.svg_container;
    var symbol = container && container.querySelector(
      '.mapshaper-svg-symbol[data-id="' + id + '"]');
    var text = !symbol ? null :
      symbol.tagName == 'text' ? symbol : symbol.querySelector('text');
    if (!text) return null;
    return {
      text: text,
      textPath: text.querySelector('textPath'),
      path: getLabelPathNode(container, id)
    };
  }

  // Turns the previewed placement into one command.
  //
  // Unlike a knot drag, the preview is *not* rolled back on the way in. A knot
  // drag has to roll back because it previews by swapping a copy of the knots
  // into the display shapes, which the data layer can share -- the command
  // must be what changes the data, or undo gets a step that undoes nothing.
  // This preview only writes attributes on the rendered markup and leaves the
  // data alone, so there is nothing to take back; rolling it back anyway drew
  // the label at its old offset for the frame or two before the command's
  // redraw arrived, which read as a flash of the text somewhere else on the
  // curve. The rollback is kept for the command failing, which is the one case
  // where no redraw comes to replace the preview.
  function commitTextDrag(o) {
    if (o.kind == 'offset') {
      commitOffsetDrag(o);
    } else {
      runPlacementCommand(o.target, o.id, getPlacementValues(o.placement, o.anchor),
        o.anchor, o.knots, function() { restoreTextPlacement(o); });
    }
  }

  // values:  from getPlacementValues()
  // anchor:  the label's text-anchor before the edit
  // knots:   its knots, in display coordinates
  // onError: (optional) called if the command fails
  function runPlacementCommand(target, id, values, anchor, knots, onError) {
    var ids = hit.getSelectionIds();
    var coords = !values.reversed ? null : knots.slice().reverse().map(function(p) {
      return translateDisplayPoint(target, p);
    });
    runGuiEditCommand(gui, getLabelPlacementCommand({
      offset: values.offset,
      // Only when the flip actually moved it: a centred label's anchor is its
      // own opposite, and writing text-anchor on a label that never had one
      // adds a column to the layer for nothing.
      anchor: values.anchor == anchor ? '' : values.anchor,
      coords: coords,
      id: id,
      target: target.name
    }), {
      title: values.reversed ? 'Flip label' : 'Move label text',
      // The label stays selected, so it can be nudged again. Re-running the
      // command rebuilds the layer, which drops the selection.
      onSuccess: function() { hit.setSelectionIds(ids); },
      onError: onError
    });
  }

  // Keeps track of the handle the pointer is over, which is what a drag starts
  // from and what the cursor reflects. A drag holds its own copy, so this stays
  // as it is until the drag ends.
  function updateHoverHandle(e) {
    var found = drawingCurve() || editor.isOpen() || !e.overMap ? null :
      findHandle(hit.getHitTarget(), e);
    var changed = !!found != !!hoverHandle;
    if (drag || textDrag) return;
    hoverHandle = found;
    if (changed) {
      updateHoverText(); // a knot handle takes the glyphs' turn away
      updateCursor();
    }
  }

  // Keeps track of the selected label under the pointer whose glyphs a drag
  // would act on, which is also what decides between the glyphs and a knot
  // handle: a drag starts from whichever of the two this leaves set.
  //
  // A handle normally outranks the glyphs, because both are grabbable and the
  // handle is the smaller target. The exception is an anchored label in
  // Draggable mode, where the glyphs are the point of the mode and the handle
  // under them is its anchor: a centred label's anchor sits beneath its own
  // text, and letting the handle win there would leave the text ungrabbable.
  function updateHoverText() {
    var id = findDraggableText();
    if (drag || textDrag) return;
    hoverTextId = id > -1 && (!hoverHandle || glyphsOutrankHandle(id)) ? id : -1;
  }

  function glyphsOutrankHandle(id) {
    return hoverHandle.id == id && labelTextIsDraggable(gui) &&
      !isPathLabel(hit.getHitTarget(), id);
  }

  // The label a drag on the glyphs would act on, or -1. Only a selected label
  // qualifies: an unselected one is left alone so that the map still pans
  // under the pointer.
  function findDraggableText() {
    var target = hit.getHitTarget();
    var id = hit.getHitId();
    if (!active() || drawingCurve() || editor.isOpen()) return -1;
    if (id < 0 || !target) return -1;
    if (hit.getSelectionIds().indexOf(id) == -1) return -1;
    return isLabel(target, id) ? id : -1;
  }

  function getRecord(target, id) {
    var records = target && target.data ? target.data.getRecords() : null;
    return records ? records[id] : null;
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
      if (o.action == 'finish') {
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

  function finishCurve() {
    var knots = curve.knots;
    if (!curveIsComplete(curve)) {
      // one knot is not a path; discard rather than silently making an
      // anchored label the user did not ask for
      abandonCurve();
      return;
    }
    abandonCurve();
    beginLabel(knots);
  }

  // Puts a caret where the label is going to be, without creating anything.
  //
  // Placing a label and typing into it are one gesture, but only the typing is
  // an edit: a click that is thought better of has to be able to leave no trace.
  // So the click opens a *pending* session, which draws the label and holds its
  // text, and the label becomes a feature only when the session ends with
  // something in it. See LabelEditor.openPending().
  function beginLabel(displayCoords) {
    var target = hit.getHitTarget();
    if (!target) return;
    hideInstructions();
    editor.openPending(target, {
      coords: displayCoords,
      // Read on every render rather than snapshotted, so that choosing a font
      // or a position while the caret is sitting there is visible immediately.
      // The same style the label will be created with, down to the font it is
      // named in, so that committing it changes nothing on screen.
      getStyle: getStyleForNewLabel,
      create: function(text) { createLabel(displayCoords, text); }
    });
  }

  // Creates the label being typed into. One command carries its geometry, its
  // style and its text, so a new label is a single entry in the session history
  // and a single step to undo.
  function createLabel(displayCoords, text) {
    var target = hit.getHitTarget();
    var coords = displayCoords.map(function(p) {
      return target ? translateDisplayPoint(target, p) : p;
    });
    runGuiEditCommand(gui, getAddLabelCommand(coords, {
      target: getLabelTarget(target, internal.layerHasLabels),
      text: text,
      // whatever the style panel was set to while nothing was selected, so that
      // a font can be chosen before the first label exists
      style: getStyleForNewLabel()
    }), {title: 'Add label'});
  }

  // The style for a label being created, which names its font even when the
  // user never chose one: the tool's preferred font where the machine has it,
  // and otherwise whatever the browser resolves sans-serif to, which differs
  // by machine and is nothing mapshaper can measure outside this one. See
  // getNewLabelFontName().
  //
  // Written here rather than kept in the tool's default style, so that it is
  // the font at the moment the label is made and cannot be cleared away with
  // the styles the user did choose.
  function getStyleForNewLabel() {
    var style = getNewLabelStyle(gui);
    var font = getNewLabelFontName();
    if (style['font-family'] || !font) return style;
    return Object.assign({'font-family': font}, style);
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
