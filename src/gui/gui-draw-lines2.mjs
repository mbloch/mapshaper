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
  appendNewDataRecord,
  pointExceedsTolerance,
  getAvgPoint
  } from './gui-drawing-utils';
import { translateDisplayPoint } from './gui-display-utils';
import { showPopupAlert } from './gui-alert';
import { addEmptyLayer } from './gui-add-layer-popup';

// pixel distance threshold for hovering near a vertex or segment midpoint
var HOVER_THRESHOLD = 10;

export function initLineEditing(gui, ext, hit) {
  var hoverVertexInfo;
  var prevVertexAddedEvent;
  var prevHoverEvent;
  var initialArcCount = -1;
  var initialShapeCount = -1;
  var drawingId = -1; // feature id of path being drawn
  var sessionCount = 0;
  var alert;
  var pencilPoints = [];
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
    return active() && (cmdKeyDown() || pathDrawing()) && !vertexDragging() && !!pencilPoints;
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
    appendNewPath(target, e.p1, e.p2);
    deleteLastVertex(target); // second vertex is a placeholder
    gui.undo.redo(); // add next vertex in the path
    fullRedraw();
  });

  gui.on('undo_path_add', function(e) {
    deleteLastPath(hit.getHitTarget());
    clearDrawingInfo();
  });

  gui.on('redo_path_extend', function(e) {
    var target = hit.getHitTarget();

    if (pathDrawing() && prevHoverEvent) {
      updatePathEndpoint(e.p);
      appendVertex(target, pixToDataCoords(prevHoverEvent.x, prevHoverEvent.y));
    } else {
      appendVertex(target, e.p);
    }
    if (e.shapes) {
      replaceDrawnShapes(e.shapes);
    }
  });

  gui.on('undo_path_extend', function(e) {
    var target = hit.getHitTarget();
    if (pathDrawing() && prevHoverEvent) {
      deleteLastVertex(target);
      updatePathEndpoint(pixToDataCoords(prevHoverEvent.x, prevHoverEvent.y));
    } else {
      deleteLastVertex(target);
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
    var msg = `Instructions: click to start a path, click or drag to keep drawing. Drag vertices to reshape a path. Type ${undoKey}Z/${undoKey}Y to undo/redo.`;
      alert = showPopupAlert(msg, null, {
        non_blocking: true, max_width: '388px'});
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
    pencilPoints = []; // re-enable pencil after closing a path
  });

  gui.map.getMouse().on('drag', function(e) {
    if (!pencilIsActive()) {
      if (!pencilPoints) {
        // null points signals that a path was just completed -- block panning
        e.stopPropagation();
      }
      return;
    }
    if (gui.keyboard.spaceIsPressed()) {
      // pan if dragging with spacebar down
      pencilPoints = []; // don't continue previous line after panning
      return;
    }
    e.stopPropagation(); // prevent panning
    hoverVertexInfo = findPathStartInfo(e);
    var xy = [e.x, e.y], xy2;
    var p = pixToDataCoords(e.x, e.y);
    var addedToPath = true;
    if (!pathDrawing()) {
      pencilPoints = [xy];
      startNewPath(p);
    } else if (pencilPoints.length == 0) {
      // start pencil-drawing when a path is started
      pencilPoints = [xy];
      extendCurrentPath(p);
    } else if (polygonMode() && hoverVertexInfo && pencilPoints.length > 2) {
      // close path
      p = hoverVertexInfo.point;
      appendVertex(hit.getHitTarget(), p);
      extendCurrentPath(p);
      pencilPoints = null; // stop drawing
    } else if (pencilPoints.length >= 2 && pointExceedsTolerance(xy, pencilPoints, 1.2)) {
      xy2 = pencilPoints.pop();
      p = pixToDataCoords(xy2[0], xy2[1]);
      extendCurrentPath(p);
      // kludgy way to get a smoother line (could be better)
      // not this pencilPoints = [getAvgPoint(pencilPoints), xy2, xy];
      // not this pencilPoints = pencilPoints.slice(-2).concat([xy2, xy]);
      pencilPoints = [getAvgPoint(pencilPoints.slice(-3).concat([xy2])), xy2, xy];
    } else {
      // skip this point, update the hover line
      pencilPoints.push(xy);
      updatePathEndpoint(p);
      addedToPath = false;
    }
    if (addedToPath) {
      //
      prevVertexAddedEvent = e;
    }
  }, null, 3); // higher priority than hit control

  hit.on('drag', function(e) {
    if (!vertexDragging() || pathDrawing()) {
      return;
    }
    e.originalEvent.stopPropagation();
    // dragging a vertex
    var target = hit.getHitTarget();
    var p = ext.translatePixelCoords(e.x, e.y);
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
      extendCurrentPath(hoverVertexInfo?.point || p);
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
    return translateDisplayPoint(target, ext.translatePixelCoords(x, y));
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
    appendNewPath(target, p1, p2);
    gui.dispatchEvent('path_add', {target, p1, p2});
    drawingId = target.shapes.length - 1;
    hit.setDrawingId(drawingId);
    hideInstructions();
    updateCursor();
  }

  // p: [x, y] source data coordinates of new point on path
  function extendCurrentPath(p) {
    var target = hit.getHitTarget();
    var shapes1, shapes2;
    // finish the path if a vertex is selected (but not an interpolated point)
    var finish = hoverVertexInfo?.type == 'vertex';
    if (getLastArcLength(target) < 2) {
      stop('Defective path');
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
      gui.dispatchEvent('path_extend', {target, p, shapes1, shapes2});
      clearDrawingInfo();
      fullRedraw();
    } else {
      appendVertex(target, p);
      gui.dispatchEvent('path_extend', {target, p});
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
    var p1 = ext.translatePixelCoords(e.x, e.y); // mouse coords
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
    var p = ext.translatePixelCoords(e.x, e.y);
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
    var p = ext.translatePixelCoords(e.x, e.y);
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
