import { stop, error, internal, geom, utils, mapshaper } from './gui-core';
import {
  updateVertexCoords,
  insertVertex,
  getVertexCoords,
  deleteVertex,
  appendVertex,
  appendNewPath,
  setVertexCoords,
  deleteLastVertex,
  deleteLastPath,
  getLastArcLength,
  getLastArcCoords,
  getLastVertexCoords,
  appendNewDataRecord
  } from './gui-drawing-utils';
import { translateDisplayPoint } from './gui-display-utils';
import { showPopupAlert } from './gui-alert';
import { addEmptyLayer } from './gui-add-layer';
import { GUI } from './gui-lib';

// pixel distance threshold for hovering near a vertex or segment midpoint
var HOVER_THRESHOLD = 10;

// How far the pointer has to move from where the mouse was pressed before a
// drag draws a stroke. This matches the distance under which gui-mouse treats
// a press as a click, so a press that stays this close adds only a click vertex.
var STROKE_START_DIST = 6;

export function initLineEditing(gui, ext, hit) {
  var hoverVertexInfo;
  var prevVertexAddedEvent;
  var prevHoverEvent;
  var initialArcCount = -1;
  var initialShapeCount = -1;
  var drawingId = -1; // feature id of path being drawn
  var sessionCount = 0;
  var alert;
  var stroke = null; // freehand stroke in progress (see startStroke())
  var blockDrag = false; // a drag finished a path; ignore it until the mouse is released
  var _dragging = false;

  function active() {
    return initialArcCount >= 0;
  }

  function vertexDragging() {
    return _dragging;
  }

  function pathDrawing() {
    return drawingId > -1;
  }

  function cmdKeyDown() {
    return gui.keyboard.altIsPressed() || gui.keyboard.metaIsPressed();
  }

  function pencilIsActive() {
    return active() && (cmdKeyDown() || pathDrawing()) && !vertexDragging();
  }

  function polygonMode() {
    return active() && hit.getHitTarget().geometry_type == 'polygon';
  }

  function clearHoverVertex() {
    hit.clearHoverVertex();
    hoverVertexInfo = null;
  }

  gui.addMode('drawing_tool', turnOn, turnOff);

  gui.on('interaction_mode_change', function(e) {
    if (e.mode == 'edit_lines' || e.mode == 'edit_polygons') {
      if (!gui.model.getActiveLayer()) {
        addEmptyLayer(gui, undefined, e.mode == 'edit_lines' ? 'polyline' : 'polygon');
      }
      gui.enterMode('drawing_tool');
    } else if (gui.getMode() == 'drawing_tool') {
      gui.clearMode();
    } else if (active()) {
      turnOff();
    }
    updateCursor();
  }, null, 10); // higher priority than hit control, so turnOff() has correct hit target

  gui.on('redo_path_add', function(e) {
    var target = hit.getHitTarget();
    clearDrawingInfo();
    appendNewPath(target, [e.p1, e.p2]);
    deleteLastVertex(target); // second vertex is a placeholder
    gui.undo.redo(); // add next vertex in the path
    fullRedraw();
  });

  // an undo during a stroke takes back the whole stroke
  gui.on('undo_redo_pre', function() {
    if (stroke) {
      finishStroke();
      blockDrag = true;
    }
  });

  gui.on('undo_path_add', function(e) {
    deleteLastPath(hit.getHitTarget());
    clearDrawingInfo();
  });

  // e.points: the vertices that the edit added to the path
  gui.on('redo_path_extend', function(e) {
    var target = hit.getHitTarget();
    var points = e.points;
    var last = points[points.length - 1];
    if (pathDrawing()) {
      // the vertex following the pointer becomes the first added vertex
      setVertexCoords(target, [target.gui.displayArcs.getPointCount() - 1], points[0]);
      points.slice(1).forEach(function(p) { appendVertex(target, p); });
      appendVertex(target, prevHoverEvent ? pixToDataCoords(prevHoverEvent.x, prevHoverEvent.y) : last);
      hit.triggerChangeEvent();
    } else {
      points.forEach(function(p) { appendVertex(target, p); });
    }
    if (e.shapes) {
      replaceDrawnShapes(e.shapes);
    }
  });

  gui.on('undo_path_extend', function(e) {
    var target = hit.getHitTarget();
    // while drawing, this also removes the vertex that follows the pointer,
    // and the path's new last vertex takes its place
    for (var i=0; i<e.points.length; i++) {
      deleteLastVertex(target);
    }
    if (pathDrawing() && prevHoverEvent) {
      updatePathEndpoint(pixToDataCoords(prevHoverEvent.x, prevHoverEvent.y));
    }
    if (e.shapes) {
      replaceDrawnShapes(e.shapes);
    }
    if (getLastArcLength(target) < 2) {
      gui.undo.undo(); // remove the path
    }
  });

  function turnOn() {
    if (active()) return;
    var target = hit.getHitTarget();
    initialArcCount = target.gui.displayArcs.size();
    initialShapeCount = target.shapes.length;
    if (sessionCount === 0) {
      showInstructions();
    }
    sessionCount++;
  }

  function showInstructions() {
    var isMac = navigator.userAgent.includes('Mac');
    var undoKey = isMac ? '⌘' : '^';
    var msg = `Click to add points to a path or click and drag to draw continuously. Drag vertices to reshape a path.`;
      alert = showPopupAlert(msg, null, {
        non_blocking: true, max_width: '350px'});
  }

  function hideInstructions() {
    if (!alert) return;
    alert.close('fade');
    alert = null;
  }

  function turnOff() {
    var removed = 0;
    var mode = gui.interaction.getMode();
    finishCurrentPath();
    if (polygonMode()) {
      removed = removeOpenPolygons();
    }
    clearDrawingInfo();
    hideInstructions();
    initialArcCount = -1;
    initialShapeCount = -1;
    if (mode == 'edit_lines' || mode == 'edit_polygons') {
      // mode change was not initiated by interactive menu -- turn off interactivity
      gui.interaction.turnOff();
    }
    updateCursor();
    if (removed > 0) {
      fullRedraw();
    }
  }

  // returns number of removed shapes
  function removeOpenPolygons() {
    var target = hit.getHitTarget();
    var arcs = target.gui.source.dataset.arcs;
    var n = target.shapes.length;
    // delete open paths
    for (var i=initialShapeCount; i<n; i++) {
      var shp = target.shapes[i];
      if (!geom.pathIsClosed(shp[0], arcs)) { // assume open paths have one arc
        target.shapes[i] = null;
      }
    }
    // removes features with wrong winding order or null geometry
    mapshaper.cmd.filterFeatures(target, arcs, {remove_empty: true, quiet: true});
    return n - target.shapes.length;
  }

  // updates display arcs and redraws all layers
  function fullRedraw() {
    gui.model.updated({arc_count: true});
  }

  function clearDrawingInfo() {
    hit.clearDrawingId();
    drawingId = -1;
    hoverVertexInfo = null;
    prevVertexAddedEvent = prevHoverEvent = null;
    updateCursor();
  }

  gui.keyboard.on('keydown', function(e) {
    if (pathDrawing() && e.keyName == 'space') {
      e.stopPropagation(); // prevent console from opening if shift-panning
    }
  }, null, 1);

  hit.on('contextmenu', function(e) {
    if (!active() || pathDrawing() || vertexDragging()) return;
    var target = hit.getHitTarget();
    var vInfo = hoverVertexInfo;
    if (hoverVertexInfo?.type == 'vertex' && !vertexIsEndpoint(vInfo, target)) {
      e.deleteVertex = function() {
        deleteActiveVertex(e, vInfo);
      };
    }

    // don't allow copying of open paths as geojson in polygon mode
    gui.contextMenu.open(e, target);
  });

  hit.on('dragstart', function(e) {
    if (!active() || pathDrawing() || !hoverVertexInfo) return;
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
  // the pointer's own trace (see updateStrokeTail()).
  //
  // The first vertex of the stroke (the anchor) is either the start of a new
  // path or the vertex that was following the pointer when the mouse was
  // pressed. Vertices are added to the path as they are placed, but the edit
  // that records them is made when the stroke ends, so that an undo takes back
  // the whole stroke.
  function startStroke(e) {
    var target = hit.getHitTarget();
    var anchorCommitted = !pathDrawing();
    var n, anchor;
    if (anchorCommitted) {
      // the path_add edit records the anchor
      hoverVertexInfo = null;
      startNewPath(pixToDataCoords(e.x - e.dragX, e.y - e.dragY));
    } else if (polygonMode() && hoverVertexInfo?.type == 'vertex') {
      // pressing on a vertex closes the polygon, as a click does
      extendCurrentPath([getLastVertexCoords(target)], true);
      blockDrag = true;
      return;
    } else if (pointerIsOnLastVertex(target)) {
      // continue from the last vertex rather than doubling it
      anchorCommitted = true;
    } else {
      // leave the vertex under the pointer behind as the anchor, and add a new
      // one to follow the pointer
      appendVertex(target, getLastVertexCoords(target));
    }
    n = target.gui.displayArcs.getPointCount();
    anchor = target.gui.displayArcs.getVertex2(n - 2);
    stroke = {
      anchorCommitted: anchorCommitted,
      // data coords of the vertices before the pointer that no edit records yet
      points: anchorCommitted ? [] : [getVertexCoords(target, n - 2)],
      // fitted in display coords, which survive a zoom mid-stroke
      fitter: createStrokeFitter(anchor),
      previewCount: 0, // vertices between the placed vertices and the pointer
      sampleCount: 0,
      lastEvent: e
    };
  }

  // The Hobby spline fitter can be tried instead of the Gaussian smoother
  // with ?pencil=hobby in the page URL.
  function createStrokeFitter(anchor) {
    var opts = {pixelSize: ext.getPixelSize()};
    return GUI.getUrlVars().pencil == 'hobby' ?
      new internal.PencilStrokeFitter(anchor, opts) :
      new internal.GaussianStrokeFitter(anchor, opts);
  }

  // Test if the vertex following the pointer is on the path's last vertex
  function pointerIsOnLastVertex(target) {
    var arcs = target.gui.displayArcs;
    var n = arcs.getPointCount();
    var a = arcs.getVertex2(n - 1), b = arcs.getVertex2(n - 2);
    return geom.distance2D(a[0], a[1], b[0], b[1]) / ext.getPixelSize() < 3;
  }

  function addStrokeSample(e) {
    var s = stroke;
    var placed = s.fitter.addSample(ext.pixCoordsToMapCoords(e.x, e.y));
    s.sampleCount++;
    s.lastEvent = e;
    updateStrokeTail(s, placed, s.fitter.getPreview(), pixToDataCoords(e.x, e.y));
  }

  // Rewrites the end of the path after the stroke's placed vertices: newly
  // placed vertices, then the preview of the part of the stroke that has not
  // been placed yet, then the vertex following the pointer. Existing vertices
  // are overwritten rather than removed and added again, because adding or
  // removing a vertex copies the coordinates of the whole layer.
  // placed, preview: display coords
  // hover: data coords
  function updateStrokeTail(s, placed, preview, hover) {
    var target = hit.getHitTarget();
    var fixed = toDataCoords(target, placed);
    var tail = fixed.concat(toDataCoords(target, preview), [hover]);
    var count = s.previewCount + 1; // vertices after the placed vertices
    var start = target.gui.displayArcs.getPointCount() - count;
    var i;
    for (; count > tail.length; count--) {
      deleteLastVertex(target);
    }
    for (i = 0; i < tail.length; i++) {
      if (i < count) {
        setVertexCoords(target, [start + i], tail[i]);
      } else {
        appendVertex(target, tail[i]);
      }
    }
    s.points = s.points.concat(fixed);
    s.previewCount = tail.length - fixed.length - 1;
    hit.triggerChangeEvent();
  }

  function toDataCoords(target, points) {
    return points.map(function(p) {
      return translateDisplayPoint(target, p);
    });
  }

  // Completes the stroke in progress up to the pointer, and records the
  // stroke's vertices as a single edit.
  // end: (optional) hover info of the vertex that the stroke has to end at
  function finishStroke(end) {
    var s = stroke;
    var target, rest, points, count;
    if (!s) return;
    stroke = null;
    target = hit.getHitTarget();
    rest = end ? s.fitter.addSample(end.displayPoint) : [];
    rest = toDataCoords(target, rest.concat(s.fitter.finish()));
    if (end && rest.length > 0) {
      rest[rest.length - 1] = end.point;
    }
    // remove the preview
    count = s.previewCount + 1;
    for (; count > 1; count--) {
      deleteLastVertex(target);
    }
    if (rest.length === 0 && s.points.length > 0) {
      // the last vertex in the path takes the place of the vertex following the pointer
      deleteLastVertex(target);
      rest = [s.points.pop()];
    } else if (rest.length > 0) {
      setVertexCoords(target, [target.gui.displayArcs.getPointCount() - 1], rest[0]);
    }
    points = s.points.concat(rest);
    if (points.length === 0 || !s.anchorCommitted && points.length == 1) {
      hit.triggerChangeEvent(); // the stroke never left its anchor
      return;
    }
    prevVertexAddedEvent = s.lastEvent;
    extendCurrentPath(points, !!end, s.points.length);
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
    // redrawing the whole map updates the data layer as well as the overlay layer
    // gui.dispatchEvent('map-needs-refresh');
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

  // shift + double-click deletes a vertex (when not drawing)
  // double-click finishes a path (when drawing)
  hit.on('dblclick', function(e) {
    if (!active()) return;
    // double click finishes a path
    // note: if the preceding 'click' finished the path, this does not fire
    if (pathDrawing()) {
      finishCurrentPath();
      e.originalEvent.stopPropagation(); // prevent dblclick zoom
      return;
    }
  });

  // hover event highlights the nearest point in close proximity to the pointer
  // ... or the closest point along the segment (for adding a new vertex)
  hit.on('hover', function(e) {
    if (!active() || vertexDragging()) return;

    if (pathDrawing()) {
      if (!e.overMap) {
        finishCurrentPath();
        return;
      }
      if (gui.keyboard.shiftIsPressed()) {
        alignPointerPosition(e, prevVertexAddedEvent);
      }
      updatePathEndpoint(pixToDataCoords(e.x, e.y));
    }

    // highlight nearby snappable vertex (the closest vertex on a nearby line,
    //   or the first vertex of the current drawing path if not near a line)
    hoverVertexInfo = e.id >= 0 && findDraggableVertices(e) ||
        pathDrawing() && findPathStartInfo(e) ||
        e.id >= 0 && findInterpolatedPoint(e);
    if (hoverVertexInfo) {
      // hovering near a vertex: highlight the vertex
      hit.setHoverVertex(hoverVertexInfo.displayPoint, hoverVertexInfo.type);
    } else {
      clearHoverVertex();
    }
    updateCursor();
    prevHoverEvent = e;
  }, null, 100);

  // click starts or extends a new path
  hit.on('click', function(e) {
    if (!active()) return;
    if (detectDoubleClick(e)) return; // ignore second click of a dblclick
    var p = pixToDataCoords(e.x, e.y);
    if (pathDrawing()) {
      // finish the path if a vertex is selected (but not an interpolated point)
      extendCurrentPath([hoverVertexInfo?.point || p], hoverVertexInfo?.type == 'vertex');
    } else if (hoverVertexInfo?.type == 'interpolated') {
      // don't start new path if hovering along a segment -- this is
      // likely to be an attempt to add a new vertex, not start a new path
    } else {
      startNewPath(p);
    }
    prevVertexAddedEvent = e;
  });

  // esc or enter key finishes a path
  gui.keyboard.on('keydown', function(e) {
    if (pathDrawing() && (e.keyName == 'esc' || e.keyName == 'enter')) {
      e.stopPropagation();
      finishCurrentPath();
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
    el.classed('draw-tool', active());
    var useArrow = hoverVertexInfo && !hoverVertexInfo.extendable && !pathDrawing();
    el.classed('dragging', useArrow);
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

  function pixToDataCoords(x, y) {
    var target = hit.getHitTarget();
    return translateDisplayPoint(target, ext.pixCoordsToMapCoords(x, y));
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

  function finishCurrentPath() {
    if (!pathDrawing()) return;
    if (stroke) {
      // finishing mid-drag (e.g. with the Enter key)
      finishStroke();
      blockDrag = true;
    }
    var target = hit.getHitTarget();
    if (getLastArcLength(target) <= 2) { // includes hover point
      // deleteLastPath(target);
      gui.undo.undo(); // assume previous undo event was path_add
    } else {
      deleteLastVertex(target);
    }
    clearDrawingInfo();
    fullRedraw();
  }

  // p: [x, y] source data coordinates
  function startNewPath(p2) {
    var target = hit.getHitTarget();
    var p1 = hoverVertexInfo?.point || p2;
    appendNewPath(target, [p1, p2]);
    gui.dispatchEvent('path_add', {target, p1, p2});
    drawingId = target.shapes.length - 1;
    hit.setDrawingId(drawingId);
    hideInstructions();
    updateCursor();
  }

  // points: [x, y] source data coordinates of vertices to add to the path. The
  //   vertex that follows the pointer becomes points[placed], so it must
  //   already be there; the rest are appended after it.
  // finish: true if the path ends at an existing vertex (which closes a polygon)
  // placed: (optional) number of points already in the path, before the vertex
  //   that follows the pointer
  function extendCurrentPath(points, finish, placed) {
    var target = hit.getHitTarget();
    var shapes1, shapes2;
    if (getLastArcLength(target) < 2) {
      stop('Defective path');
    }
    for (var i=(placed || 0) + 1; i<points.length; i++) {
      appendVertex(target, points[i]);
    }
    if (finish && polygonMode()) {
      shapes1 = target.shapes.slice(initialShapeCount);
      try {
        shapes2 = convertClosedPaths(shapes1);
      } catch(e) {
        console.error(e);
        stop('Invalid path');
      }
    }
    if (shapes2) {
      replaceDrawnShapes(shapes2);
      gui.dispatchEvent('path_extend', {target, points, shapes1, shapes2});
      clearDrawingInfo();
      fullRedraw();
    } else {
      appendVertex(target, points[points.length - 1]); // the new vertex following the pointer
      gui.dispatchEvent('path_extend', {target, points});
      hit.triggerChangeEvent(); // trigger overlay redraw
    }
  }

  function replaceDrawnShapes(shapes) {
    var target = hit.getHitTarget();
    var records = target.data?.getRecords();
    var prevLen = target.shapes.length;
    var newLen = initialShapeCount + shapes.length;
    var recordCount = records?.length || 0;
    target.shapes = target.shapes.slice(0, initialShapeCount).concat(shapes);
    while (records && records.length > newLen) {
      records.pop();
    }
    while (records && records.length < newLen) {
      appendNewDataRecord(target);
    }
  }

  // p: [x, y] source data coordinates
  function updatePathEndpoint(p) {
    var target = hit.getHitTarget();
    var i = target.gui.displayArcs.getPointCount() - 1;
    if (hoverVertexInfo) {
      p = hoverVertexInfo.point; // snap to selected point
    }
    setVertexCoords(target, [i], p);
    hit.triggerChangeEvent();
  }

  function findPathStartInfo(e) {
    if (!pathDrawing()) return false;
    var target = hit.getHitTarget();
    var arcId = target.gui.displayArcs.size() - 1;
    var p1 = ext.pixCoordsToMapCoords(e.x, e.y); // mouse coords
    var p2 = internal.getArcStartCoords(arcId, target.gui.displayArcs); // vertex coords
    var p3 = internal.getArcStartCoords(arcId, target.gui.source.dataset.arcs);
    var dist = geom.distance2D(p1[0], p1[1], p2[0], p2[1]);
    var data = target.gui.source.dataset.arcs.getVertexData();
    var i = data.ii[arcId];
    var pathLen = data.nn[arcId];
    var pixelDist = dist / ext.getPixelSize();
    if (pixelDist > HOVER_THRESHOLD || pathLen < 4) {
      return null;
    }
    return {
      target, ids: [i], extendable: false, displayPoint: p2, point: p3, type: 'vertex'
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

  // Try to form polygon shapes from an array of path shapes
  // shapes: array of all shapes that have been drawn in the current session
  function convertClosedPaths(shapes) {
    var target = hit.getHitTarget();
    // try to convert paths to polygons
    // NOTE: added "no_cuts" option to prevent polygons function from modifying
    // arcs, which would break undo/redo and cause other problems
    var tmpLyr = {
      geometry_type: 'polyline',
      shapes: shapes.concat()
    };
    var output = mapshaper.cmd.polygons([tmpLyr], target.gui.source.dataset, {no_cuts: true});
    var closedShapes = output[0].shapes;

    // find paths that were not convertible to polygons
    var isOpenPath = getOpenPathTest(closedShapes);
    var openShapes = shapes.filter(function(shp) { return isOpenPath(shp); });

    // retain both converted polygons and unconverted polylines
    return openShapes.concat(closedShapes);
  }

  // Returns a function for testing if a shape is an unclosed path, and doesn't
  // overlap with an array of polygon shapes
  function getOpenPathTest(polygonShapes) {
    var polygonArcs = [];
    internal.forEachArcId(polygonShapes, function(arcId) {
      polygonArcs.push(internal.absArcId(arcId));
    });

    return function(shp) {
      // assume that any compound shape is a polygon
      return shapeHasOneFwdArc(shp) && !polygonArcs.includes(shp[0][0]);
    };
  }

  function shapeHasOneFwdArc(shp) {
    return shp.length == 1 && shp[0].length == 1 && shp[0][0] >= 0;
  }
}
