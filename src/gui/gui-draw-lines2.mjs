import { internal, geom } from './gui-core';
import {
  updateVertexCoords,
  insertVertex,
  getVertexCoords,
  deleteVertex
  } from './gui-drawing-utils';
import { translateDisplayPoint } from './gui-display-utils';
import { showPopupAlert } from './gui-alert';
import { runGuiEditCommand } from './gui-edit-command';
import { getAddShapeCommand, drawnPathIsValid } from './gui-draw-commands';
import {
  getNewShapeStyle, getNewShapeCommandStyle, getPendingPathStyle
} from './gui-shape-style-state';
import { layerHasDrawableStyle } from './gui-layer-styler';

// pixel distance threshold for hovering near a vertex or segment midpoint
var HOVER_THRESHOLD = 10;

// How far the pointer has to move from where the mouse was pressed before a
// drag draws a stroke. This matches the distance under which gui-mouse treats
// a press as a click, so a press that stays this close adds only a click vertex.
var STROKE_START_DIST = 6;

// The line and polygon drawing tool.
//
// A path being drawn belongs to the tool, not to the layer: its vertices are
// held here and drawn as an overlay (see getShapeEditingLayers() in
// gui-overlay-styler.mjs), and the layer only changes when the path is
// finished, by an -add-shape command. So a finished shape is one undo step and
// one line of session history, and a path that is abandoned leaves no trace.
// While a path is being drawn, Undo and Redo take back and restore the
// vertices it has gained (see pendingUndo()).
//
// The tool has two modes, armed from the line or polygon style mode's toolbar
// (see getToolMode() in gui-interaction-mode-control.mjs):
//
// Drawing ('edit_lines', 'edit_polygons'): a click on empty map starts a path.
// A click on a shape selects it, for the style panel. On a line layer, a path
// started on the end of a line extends that line (-add-shape extend), and
// with Alt pressed a path starts a new line instead, from any vertex -- which
// is how a T junction is made.
//
// Reshaping ('reshape_lines', 'reshape_polygons'): dragging, inserting and
// deleting vertices. This edits the layer directly, with in-memory undo states
// that are collapsed into one stored state by the undo edit session
// (gui-undo.mjs).
export function initLineEditing(gui, ext, hit) {
  // The vertex the pointer is on, or the point on a path it would snap to:
  //   {target, ids, point, displayPoint, type, extendable, ...}, plus
  //   extends: (drawing) a path started here extends the line, featureId
  var hoverVertexInfo;
  var prevVertexAddedEvent;
  var lastHoverEvent = null; // for redoing the hover when Alt is pressed or released
  var _active = false;
  var shownInstructions = {};
  var alert;
  // The path being drawn, or null:
  //   data: vertices in the layer's CRS, which go into the -add-shape command
  //   display: the same vertices in the display CRS, which is what is drawn
  //   steps: number of vertices added by each edit, for undo
  //   redo: edits taken back by undo, as arrays of {data, display} vertices
  //   extendId: id of the line the path extends, or -1 for a new shape
  var pending = null;
  // Display coordinates of the pointer while a path is being drawn: the path
  // is drawn through it to show what the next click would add.
  var pointer = null;
  var stroke = null; // freehand stroke in progress (see startStroke())
  var blockDrag = false; // a drag finished a path; ignore it until the mouse is released
  var _dragging = false;

  function active() {
    return _active;
  }

  function vertexDragging() {
    return _dragging;
  }

  function pathDrawing() {
    return !!pending;
  }

  function drawMode() {
    var mode = active() && gui.interaction.getToolMode();
    return mode == 'edit_lines' || mode == 'edit_polygons';
  }

  function reshapeMode() {
    var mode = active() && gui.interaction.getToolMode();
    return mode == 'reshape_lines' || mode == 'reshape_polygons';
  }

  // Alt (Option) starts a new line from any vertex, rather than extending one
  function altKeyDown() {
    return gui.keyboard.altIsPressed();
  }

  function cmdKeyDown() {
    return gui.keyboard.altIsPressed() || gui.keyboard.metaIsPressed();
  }

  // A drag draws when it continues a path, or starts on a vertex the path
  // would start from, or with Alt or Cmd pressed; otherwise it pans the map.
  function pencilIsActive() {
    return drawMode() && !vertexDragging() &&
      (cmdKeyDown() || pathDrawing() || !!hoverVertexInfo);
  }

  function polygonMode() {
    return active() && hit.getHitTarget().geometry_type == 'polygon';
  }

  function clearHoverVertex() {
    hit.clearHoverVertex();
    hoverVertexInfo = null;
  }

  gui.addMode('drawing_tool', turnOn, turnOff);

  // The tool is on while the line or polygon mode has drawing or reshaping
  // armed (see getToolMode() in gui-interaction-mode-control.mjs)
  function onToolModeChange(e) {
    var mode = e.tool_mode;
    if (mode == 'edit_lines' || mode == 'edit_polygons' ||
        mode == 'reshape_lines' || mode == 'reshape_polygons') {
      if (active()) {
        // switching between drawing and reshaping
        finishPath();
        clearHoverVertex();
        showInstructions();
      }
      gui.enterMode('drawing_tool');
    } else if (gui.getMode() == 'drawing_tool') {
      gui.clearMode();
    } else if (active()) {
      turnOff();
    }
    updateCursor();
  }

  // higher priority than hit control, so turnOff() has correct hit target
  gui.on('interaction_mode_change', onToolModeChange, null, 10);
  gui.on('interaction_tool_change', onToolModeChange, null, 10);

  gui.on('new_shape_style_change', refreshPath);

  gui.undo.addInterceptor({
    undo: pendingUndo,
    redo: pendingRedo
  });

  function turnOn() {
    if (active()) return;
    _active = true;
    showInstructions();
  }

  // shown the first time each tool is used
  function showInstructions() {
    var tool = reshapeMode() ? 'reshape' : 'draw';
    var msg;
    if (shownInstructions[tool]) return;
    shownInstructions[tool] = true;
    hideInstructions();
    if (tool == 'reshape') {
      msg = 'Drag a vertex to move it, or drag a point between vertices to add one. Right-click a vertex to delete it.';
    } else {
      msg = 'Click to add points to a path or drag to draw a smooth line.' +
        (polygonMode() ? '' : ' Draw from the end of a line to extend it; hold Alt to start a new line from any vertex.');
    }
    alert = showPopupAlert(msg, null, {non_blocking: true, max_width: '350px'});
  }

  function hideInstructions() {
    if (!alert) return;
    alert.close('fade');
    alert = null;
  }

  function turnOff() {
    if (!active()) return;
    finishPath();
    hoverVertexInfo = null;
    prevVertexAddedEvent = null;
    lastHoverEvent = null;
    hideInstructions();
    _active = false;
    if (gui.interaction.getArmedTool()) {
      // another GUI mode took over -- disarm, rather than leave the mode
      // saying it is drawing with no tool to draw
      gui.interaction.setArmedTool(null);
    }
    updateCursor();
  }

  gui.keyboard.on('keydown', function(e) {
    if (pathDrawing() && e.keyName == 'space') {
      e.stopPropagation(); // prevent console from opening if shift-panning
    }
  }, null, 1);

  // Esc finishes the path being drawn (below), then clears the selection, and
  // then disarms the tool
  gui.keyboard.on('keydown', function(e) {
    if (e.keyName != 'esc' || !active() || pathDrawing() || vertexDragging()) return;
    e.stopPropagation();
    if (drawMode() && hit.getSelectionIds().length > 0) {
      hit.setSelectionIds([], {keepHover: true});
    } else {
      gui.interaction.setArmedTool(null);
    }
  }, null, 9);

  // Pressing or releasing Alt changes which vertex a path would start from
  gui.keyboard.on('keydown', onAltKey);
  gui.keyboard.on('keyup', onAltKey);

  function onAltKey(e) {
    var key = e.originalEvent && e.originalEvent.key;
    if (key != 'Alt' || !drawMode() || !lastHoverEvent || vertexDragging()) return;
    updateHover(lastHoverEvent);
  }

  hit.on('contextmenu', function(e) {
    if (!active() || pathDrawing() || vertexDragging()) return;
    var target = hit.getHitTarget();
    var vInfo = hoverVertexInfo;
    if (reshapeMode() && hoverVertexInfo?.type == 'vertex' && !vertexIsEndpoint(vInfo, target)) {
      e.deleteVertex = function() {
        deleteActiveVertex(e, vInfo);
      };
    }

    // don't allow copying of open paths as geojson in polygon mode
    gui.contextMenu.open(e, target);
  });

  hit.on('dragstart', function(e) {
    // a vertex, or a point between vertices, where a vertex is inserted
    if (!reshapeMode() || !hoverVertexInfo) return;
    hideInstructions();
    e.originalEvent.stopPropagation();
    _dragging = true;
    updateCursor();
    if (hoverVertexInfo.type == 'interpolated') {
      insertVertex(hit.getHitTarget(), hoverVertexInfo.i, hoverVertexInfo.point);
      hoverVertexInfo.ids = [hoverVertexInfo.i];
    }
    hit.setHoverVertex(hoverVertexInfo.displayPoint, hoverVertexInfo.type);
  });

  gui.map.getMouse().on('dragend', function(e) {
    finishStroke();
    blockDrag = false;
  });

  gui.map.getMouse().on('drag', function(e) {
    if (blockDrag) {
      e.stopPropagation(); // don't pan until the mouse is released
      return;
    }
    if (!pencilIsActive()) {
      return;
    }
    if (gui.keyboard.spaceIsPressed()) {
      // pan if dragging with spacebar down
      finishStroke();
      return;
    }
    e.stopPropagation(); // prevent panning
    if (!stroke) {
      if (geom.distance2D(0, 0, e.dragX, e.dragY) < STROKE_START_DIST) return;
      startStroke(e);
      if (!stroke) return;
    }
    hoverVertexInfo = polygonMode() ? findPathStartInfo(e) : null;
    if (hoverVertexInfo && stroke.sampleCount > 1) {
      // the stroke has returned to the start of the path -- close it
      finishStroke(hoverVertexInfo);
      blockDrag = true;
    } else {
      addStrokeSample(e);
    }
  }, null, 3); // higher priority than hit control

  // A stroke is smoothed as it is drawn. Vertices are placed some way behind
  // the pointer, where later samples no longer change the curve, and they stay
  // where they are. Between the last of them and the pointer, the path shows
  // the pointer's own trace (see refreshPath()).
  //
  // The first vertex of the stroke (the anchor) is either the start of a new
  // path or the point that the path was following the pointer to when the
  // mouse was pressed. The stroke's vertices join the path as one edit when
  // the stroke ends, so that an undo takes back the whole stroke.
  function startStroke(e) {
    var anchor, anchorIsNew;
    if (!pathDrawing()) {
      // from the vertex under the pointer when the mouse was pressed, if any
      startPath(hoverVertexInfo ? getClickVertex(e) : pixToVertex(e.x - e.dragX, e.y - e.dragY),
        getExtendId());
      hoverVertexInfo = null;
      anchor = getLastVertex();
      anchorIsNew = false;
    } else if (polygonMode() && hoverVertexInfo?.closesPath) {
      // pressing on the first vertex closes the polygon, as a click does
      finishPath(true);
      blockDrag = true;
      return;
    } else if (!pointer || pointerIsOnLastVertex()) {
      // continue from the last vertex rather than doubling it
      anchor = getLastVertex();
      anchorIsNew = false;
    } else {
      // the point under the pointer becomes the anchor
      anchor = getPointerVertex();
      anchorIsNew = true;
    }
    stroke = {
      anchor: anchorIsNew ? anchor : null,
      // vertices placed so far, which join the path when the stroke ends
      placed: [],
      preview: [],
      // fitted in display coords, which survive a zoom mid-stroke
      fitter: new internal.GaussianStrokeFitter(anchor.display, {pixelSize: ext.getPixelSize()}),
      sampleCount: 0,
      lastEvent: e
    };
  }

  // Test if the pointer is on the path's last vertex
  function pointerIsOnLastVertex() {
    var a = pointer, b = pending.display[pending.display.length - 1];
    return geom.distance2D(a[0], a[1], b[0], b[1]) / ext.getPixelSize() < 3;
  }

  function addStrokeSample(e) {
    var s = stroke;
    var p = ext.pixCoordsToMapCoords(e.x, e.y);
    s.fitter.addSample(p).forEach(function(p) {
      s.placed.push(displayToVertex(p));
    });
    s.preview = s.fitter.getPreview();
    s.sampleCount++;
    s.lastEvent = e;
    pointer = p;
    refreshPath();
  }

  // Completes the stroke in progress up to the pointer, and adds the stroke's
  // vertices to the path as a single edit.
  // end: (optional) hover info of the path's first vertex, if the stroke has
  //   returned to it, which closes the polygon
  function finishStroke(end) {
    var s = stroke;
    var rest, points;
    if (!s) return;
    stroke = null;
    rest = end ? s.fitter.addSample(end.displayPoint) : [];
    rest = rest.concat(s.fitter.finish()).map(displayToVertex);
    if (end) {
      rest.pop(); // the end vertex; finishPath() closes the ring with the first vertex
    }
    points = s.placed.concat(rest);
    if (points.length > 0 && s.anchor) {
      points.unshift(s.anchor);
    }
    prevVertexAddedEvent = s.lastEvent;
    if (points.length > 0) {
      addVertices(points);
    }
    if (end) {
      finishPath(true);
    } else {
      refreshPath();
    }
  }

  hit.on('drag', function(e) {
    if (!vertexDragging() || pathDrawing()) {
      return;
    }
    e.originalEvent.stopPropagation();
    // dragging a vertex
    var target = hit.getHitTarget();
    var p = ext.pixCoordsToMapCoords(e.x, e.y);
    if (gui.keyboard.shiftIsPressed()) {
      internal.snapPointToArcEndpoint(p, hoverVertexInfo.ids, target.gui.displayArcs);
    }
    internal.snapVerticesToPoint(hoverVertexInfo.ids, p, target.gui.displayArcs);
    hit.setHoverVertex(p, '');
  });

  hit.on('dragend', function(e) {
    if (!vertexDragging()) return;
    _dragging = false;
    var target = hit.getHitTarget();
    // kludge to get dataset to recalculate internal bounding boxes
    target.gui.displayArcs.transformPoints(function() {});
    updateVertexCoords(target, hoverVertexInfo.ids);
    gui.dispatchEvent('vertex_dragend', hoverVertexInfo);
    clearHoverVertex();
    gui.dispatchEvent('map-needs-refresh'); // redraw basemap
  });

  // double-click finishes a path (when drawing)
  hit.on('dblclick', function(e) {
    if (!active()) return;
    // note: if the preceding 'click' finished the path, this does not fire
    if (pathDrawing()) {
      finishPath();
      e.originalEvent.stopPropagation(); // prevent dblclick zoom
    }
  });

  hit.on('hover', function(e) {
    if (!active() || vertexDragging()) return;

    if (pathDrawing()) {
      if (!e.overMap) {
        finishPath();
        return;
      }
      if (gui.keyboard.shiftIsPressed()) {
        alignPointerPosition(e, prevVertexAddedEvent);
      }
    }
    lastHoverEvent = e;
    updateHover(e);
  }, null, 100);

  // Highlights the vertex, or the point on a path, that a click or drag would
  // act on
  function updateHover(e) {
    hoverVertexInfo = findHoverTarget(e);
    if (hoverVertexInfo) {
      hit.setHoverVertex(hoverVertexInfo.displayPoint, hoverVertexInfo.type);
    } else {
      clearHoverVertex();
    }
    if (pathDrawing()) {
      pointer = hoverVertexInfo ? hoverVertexInfo.displayPoint : ext.pixCoordsToMapCoords(e.x, e.y);
      refreshPath();
    }
    updateCursor();
  }

  function findHoverTarget(e) {
    var info;
    if (reshapeMode()) {
      // a vertex to drag, or a point between vertices to insert one at
      return e.id >= 0 && (findDraggableVertices(e) || findInterpolatedPoint(e)) || null;
    }
    if (pathDrawing()) {
      // the next vertex snaps to a vertex of a nearby path, to the first vertex
      // of the path being drawn, or to a point along a nearby path
      return e.id >= 0 && findDraggableVertices(e) ||
        findPathStartInfo(e) ||
        e.id >= 0 && findInterpolatedPoint(e) || null;
    }
    // where a new path would start from
    info = e.id >= 0 && findDraggableVertices(e) || null;
    if (!info || altKeyDown()) {
      return info;
    }
    if (!polygonMode() && lineCanBeExtended(info)) {
      info.extends = true;
      info.featureId = e.id;
      return info;
    }
    return null;
  }

  // A path started at the vertex would extend its line: the vertex is the end
  // of a line, and of no other line (otherwise which line to extend is not
  // clear -- see -add-shape extend)
  function lineCanBeExtended(info) {
    var target = info.target;
    return info.extendable &&
      internal.findLineEnds(target, target.gui.source.dataset.arcs, info.point).length == 1;
  }

  function getExtendId() {
    return hoverVertexInfo && hoverVertexInfo.extends ? hoverVertexInfo.featureId : -1;
  }

  hit.on('click', function(e) {
    if (!drawMode()) return;
    if (detectDoubleClick(e)) return; // ignore second click of a dblclick
    if (pathDrawing()) {
      if (hoverVertexInfo?.closesPath && polygonMode()) {
        finishPath(true);
      } else {
        addVertices([getClickVertex(e)]);
      }
    } else if (hoverVertexInfo || altKeyDown()) {
      // the end of a line, or with Alt, any vertex (or anywhere)
      startPath(getClickVertex(e), getExtendId());
    } else if (e.id > -1) {
      selectShape(e.id);
    } else if (hit.getSelectionIds().length > 0) {
      // a click off the selection only deselects, so a path can't be started
      // by a click meant to deselect
      hit.setSelectionIds([], {keepHover: true});
    } else {
      startPath(getClickVertex(e), -1);
    }
    prevVertexAddedEvent = e;
  });

  // The style panel styles the selected shapes (see gui-layer-style-tool.mjs).
  // As in the style modes, shift-click adds to or removes from the selection.
  function selectShape(id) {
    var ids = hit.getSelectionIds();
    if (gui.keyboard.shiftIsPressed()) {
      ids = ids.includes(id) ? ids.filter(function(id2) { return id2 != id; }) : ids.concat(id);
    } else {
      ids = [id];
    }
    hit.setSelectionIds(ids, {keepHover: true});
  }

  // esc or enter key finishes a path
  gui.keyboard.on('keydown', function(e) {
    if (pathDrawing() && (e.keyName == 'esc' || e.keyName == 'enter')) {
      e.stopPropagation();
      finishPath();
      e.originalEvent.preventDefault(); // block console "enter"
    }
  }, null, 10);

  // detect second 'click' event of a double-click action
  function detectDoubleClick(evt) {
    if (!prevVertexAddedEvent) return false;
    var elapsed = evt.time - prevVertexAddedEvent.time;
    var dx = Math.abs(evt.x - prevVertexAddedEvent.x);
    var dy = Math.abs(evt.y - prevVertexAddedEvent.y);
    var dbl = elapsed < 500 && dx <= 2 && dy <= 2;
    return dbl;
  }

  function updateCursor() {
    var el = gui.container.findChild('.map-layers');
    var overShape = !!lastHoverEvent && lastHoverEvent.id > -1;
    el.classed('draw-tool', drawMode());
    // a click would select the shape under the pointer
    el.classed('draw-select', drawMode() && overShape && !pathDrawing() &&
      !hoverVertexInfo && !altKeyDown());
    el.classed('reshape-tool', reshapeMode());
    // a drag would move the vertex, or insert one
    el.classed('reshape-vertex', reshapeMode() && !!hoverVertexInfo);
    el.classed('drawing', pathDrawing());
  }

  function vertexIsEndpoint(info, target) {
    var vId = info.ids[0];
    return internal.vertexIsArcStart(vId, target.gui.displayArcs) ||
      internal.vertexIsArcEnd(vId, target.gui.displayArcs);
  }

  // info: optional vertex info object
  function deleteActiveVertex(e, infoArg) {
    var info = infoArg || findDraggableVertices(e);
    if (!info || info.type != 'vertex') return;
    var vId = info.ids[0];
    var target = hit.getHitTarget();
    if (vertexIsEndpoint(info, target)) return;
    gui.dispatchEvent('vertex_delete', {
      target: target,
      vertex_id: vId
    });
    deleteVertex(target, vId);
    clearHoverVertex();
    gui.dispatchEvent('map-needs-refresh');
  }

  // A vertex of the path being drawn: {data, display}
  function displayToVertex(p) {
    return {data: translateDisplayPoint(hit.getHitTarget(), p), display: p};
  }

  function pixToVertex(x, y) {
    return displayToVertex(ext.pixCoordsToMapCoords(x, y));
  }

  // The vertex a click adds: the vertex or segment point it snapped to, if any,
  // so that a path that starts or passes on another path meets it exactly.
  function getClickVertex(e) {
    if (hoverVertexInfo) {
      return {data: hoverVertexInfo.point, display: hoverVertexInfo.displayPoint};
    }
    return pixToVertex(e.x, e.y);
  }

  // The vertex the path is following the pointer to (see the hover handler)
  function getPointerVertex() {
    if (hoverVertexInfo && !hoverVertexInfo.closesPath) {
      return {data: hoverVertexInfo.point, display: hoverVertexInfo.displayPoint};
    }
    return displayToVertex(pointer);
  }

  function getLastVertex() {
    var n = pending.data.length;
    return {data: pending.data[n - 1], display: pending.display[n - 1]};
  }

  // Change the x, y pixel location of thisEvt so that the segment extending
  // from prevEvt is aligned to one of 8 angles.
  function alignPointerPosition(thisEvt, prevEvt) {
    if (!prevEvt) return;
    var x0 = prevEvt.x;
    var y0 = prevEvt.y;
    var dist = geom.distance2D(thisEvt.x, thisEvt.y, x0, y0);
    if (dist < 1) return;
    var dist2 = dist / Math.sqrt(2);
    var minDist = Infinity;
    var cands = [
      {dx: 0, dy: dist},
      {dx: 0, dy: -dist},
      {dx: dist, dy: 0},
      {dx: -dist, dy: 0},
      {dx: dist2, dy: dist2},
      {dx: dist2, dy: -dist2},
      {dx: -dist2, dy: dist2},
      {dx: -dist2, dy: -dist2}
    ];
    var snapped = cands.reduce(function(memo, cand) {
      var dist = geom.distance2D(thisEvt.x, thisEvt.y, x0 + cand.dx, y0 + cand.dy);
      if (dist < minDist) {
        minDist = dist;
        return cand;
      }
      return memo;
    }, null);
    thisEvt.x = x0 + snapped.dx;
    thisEvt.y = y0 + snapped.dy;

    return null;
  }

  // v: the first vertex, {data, display}
  // extendId: id of the line that the path extends, or -1
  function startPath(v, extendId) {
    pending = {data: [], display: [], steps: [], redo: [],
      extendId: extendId >= 0 ? extendId : -1};
    hit.clearSelection();
    pointer = v.display;
    addVertices([v]);
    hideInstructions();
    updateCursor();
  }

  // Adds vertices to the path being drawn, as one undoable edit.
  // vertices: [{data, display}, ...]
  function addVertices(vertices) {
    appendVertices(vertices);
    pending.redo = [];
    refreshPath();
  }

  function appendVertices(vertices) {
    vertices.forEach(function(v) {
      pending.data.push(v.data);
      pending.display.push(v.display);
    });
    pending.steps.push(vertices.length);
  }

  // Takes back the last edit to the path being drawn. Taking back its first
  // vertex abandons the path. Returns false if no path is being drawn, so that
  // Undo goes on to the undo history.
  function pendingUndo() {
    var n, start, removed;
    if (!pathDrawing()) return false;
    if (stroke) {
      // an undo during a stroke takes back the whole stroke
      finishStroke();
      blockDrag = true;
    }
    n = pending.steps.pop();
    start = pending.data.length - n;
    removed = pending.data.splice(start).map(function(p, i) {
      return {data: p, display: pending.display[start + i]};
    });
    pending.display.splice(start);
    pending.redo.push(removed);
    if (pending.data.length === 0) {
      cancelPath();
    } else {
      refreshPath();
    }
    return true;
  }

  // Restores the last edit taken back. Redo does nothing else while a path is
  // being drawn: redoing an edit to the layer would happen out of sight of the
  // path the user is looking at.
  function pendingRedo() {
    if (!pathDrawing()) return false;
    if (pending.redo.length > 0) {
      appendVertices(pending.redo.pop());
      refreshPath();
    }
    return true;
  }

  // Ends the path being drawn and creates its shape, if it has enough vertices
  // to make one; a polygon is closed if the path was left open.
  // close: (optional) the path ended on its first vertex
  function finishPath(close) {
    var target, coords, extendId;
    if (!pathDrawing()) return;
    if (stroke) {
      // finishing mid-drag (e.g. with the Enter key)
      finishStroke();
      blockDrag = true;
    }
    target = hit.getHitTarget();
    coords = pending.data.concat();
    extendId = pending.extendId;
    if (close) {
      coords.push(coords[0]);
    }
    clearPath();
    if (target && drawnPathIsValid(coords, target.geometry_type)) {
      createShape(target, coords, extendId);
    }
  }

  function cancelPath() {
    if (stroke) {
      stroke = null;
      blockDrag = true;
    }
    clearPath();
  }

  function clearPath() {
    pending = null;
    pointer = null;
    hoverVertexInfo = null;
    hit.clearHoverVertex();
    hit.setPendingPath(null);
    updateCursor();
  }

  // extendId: id of the line the path extends, or -1 to add a new shape
  function createShape(target, coords, extendId) {
    var extend = extendId >= 0;
    // an extension takes on the style of the line it extends
    var style = extend ? null : getNewShapeCommandStyle(getNewShapeStyle(gui, target.geometry_type),
      layerHasDrawableStyle(target), !!gui.state.dark_basemap);
    var cmd = getAddShapeCommand(coords, {
      geometryType: target.geometry_type,
      target: target.name || null,
      style: style,
      extend: extend
    });
    var title = extend ? 'Extend line' :
      target.geometry_type == 'polygon' ? 'Draw polygon' : 'Draw line';
    runGuiEditCommand(gui, cmd, {title: title, changesEditTarget: true});
  }

  // Shows the path being drawn: its vertices, then the part of a stroke not
  // yet added to it, then the pointer.
  function refreshPath() {
    var coords;
    if (!pathDrawing()) return;
    coords = pending.display.concat();
    if (stroke) {
      if (stroke.anchor) coords.push(stroke.anchor.display);
      stroke.placed.forEach(function(v) { coords.push(v.display); });
      coords = coords.concat(stroke.preview);
    }
    if (pointer) coords.push(pointer);
    hit.setPendingPath(coords, getPendingPathStyle(getPathStyle(), !!gui.state.dark_basemap));
  }

  // The style the finished path will be drawn with: the one createShape() will
  // give it, or that of the line it extends
  function getPathStyle() {
    var target = hit.getHitTarget();
    var records = target.data ? target.data.getRecords() : [];
    if (pending.extendId >= 0) {
      return layerHasDrawableStyle(target) && records[pending.extendId] || {};
    }
    return getNewShapeCommandStyle(getNewShapeStyle(gui, target.geometry_type),
      layerHasDrawableStyle(target), !!gui.state.dark_basemap);
  }

  // Hover info for the first vertex of the path being drawn, if the pointer is
  // near it and there are enough vertices to close a ring.
  function findPathStartInfo(e) {
    var p1, p2, n;
    if (!pathDrawing()) return null;
    n = pending.data.length;
    if (stroke) {
      n += stroke.placed.length + (stroke.anchor ? 1 : 0);
    }
    if (n < 3) return null;
    p1 = ext.pixCoordsToMapCoords(e.x, e.y); // mouse coords
    p2 = pending.display[0];
    if (geom.distance2D(p1[0], p1[1], p2[0], p2[1]) / ext.getPixelSize() > HOVER_THRESHOLD) {
      return null;
    }
    return {
      extendable: false, displayPoint: p2, point: pending.data[0], type: 'vertex', closesPath: true
    };
  }

  // return data on the nearest vertex (or identical vertices) to the pointer
  // (if within a distance threshold)
  //
  function findDraggableVertices(e) {
    var target = hit.getHitTarget();
    var shp = target.shapes[e.id];
    var p = ext.pixCoordsToMapCoords(e.x, e.y);
    var ids = internal.findNearestVertices(p, shp, target.gui.displayArcs);
    var p2 = target.gui.displayArcs.getVertex2(ids[0]);
    var dist = geom.distance2D(p[0], p[1], p2[0], p2[1]);
    var pixelDist = dist / ext.getPixelSize();
    if (pixelDist > HOVER_THRESHOLD) {
      return null;
    }
    var point = getVertexCoords(target, ids[0]); // data coordinates
    // find out if the vertex is the endpoint of a single path
    // (which could be extended by a newly drawn path)
    var extendable = ids.length == 1 &&
      internal.vertexIsArcEndpoint(ids[0], target.gui.displayArcs);
    var displayPoint = target.gui.displayArcs.getVertex2(ids[0]);
    return {target, ids, extendable, point, displayPoint, type: 'vertex'};
  }


  function findInterpolatedPoint(e) {
    var target = hit.getHitTarget();
    //// vertex insertion not supported with simplification
    // if (!target.arcs.isFlat()) return null;
    var p = ext.pixCoordsToMapCoords(e.x, e.y);
    var minDist = Infinity;
    var shp = target.shapes[e.id];
    var closest;
    internal.forEachSegmentInShape(shp, target.gui.displayArcs, function(i, j, xx, yy) {
      var x1 = xx[i],
          y1 = yy[i],
          x2 = xx[j],
          y2 = yy[j],
          p2 = internal.findClosestPointOnSeg(p[0], p[1], x1, y1, x2, y2, 0),
          dist = geom.distance2D(p2[0], p2[1], p[0], p[1]);
      if (dist < minDist) {
        minDist = dist;
        closest = {
          i: (i < j ? i : j) + 1, // insertion vertex id
          displayPoint: p2,
          distance: dist
        };
      }
    });

    if (closest.distance / ext.getPixelSize() > HOVER_THRESHOLD) {
      return null;
    }
    closest.point = translateDisplayPoint(target, closest.displayPoint);
    closest.type = 'interpolated';
    closest.target = target;
    return closest;
  }
}
