import { error, internal, geom, utils, mapshaper } from './gui-core';
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

// pointer thresholds for hovering near a vertex or segment midpoint
var HOVER_THRESHOLD = 10;

export function initLineEditing(gui, ext, hit) {
  var hoverVertexInfo;
  var prevClickEvent;
  var prevHoverEvent;
  var initialArcCount = -1;
  var initialShapeCount = -1;
  var drawingId = -1; // feature id of path being drawn
  var sessionCount = 0;
  var alert;
  var _dragging = false;

  function active() {
    return initialArcCount >= 0;
  }

  function dragging() {
    return _dragging;
  }

  function drawing() {
    return drawingId > -1;
  }

  function polygonMode() {
    return active() && hit.getHitTarget().layer.geometry_type == 'polygon';
  }

  function clearHoverVertex() {
    hit.clearHoverVertex();
    hoverVertexInfo = null;
  }

  gui.addMode('drawing_tool', turnOn, turnOff);

  gui.on('interaction_mode_change', function(e) {
    gui.container.findChild('.map-layers').classed('drawing', e.mode == 'drawing');
    var prevMode = gui.getMode();
    if (e.mode == 'drawing') {
      gui.enterMode('drawing_tool');
    } else if (active()) {
      gui.clearMode();
    }
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
    if (drawing() && prevHoverEvent) {
      updatePathEndpoint(e.p);
      appendVertex(target, pixToDataCoords(prevHoverEvent.x, prevHoverEvent.y));
    } else {
      appendVertex(target, e.p);
    }
    if (e.shapes) {
      replaceShapes(e.shapes);
    }
  });

  function replaceShapes(shapes) {
    var target = hit.getHitTarget();
    var records = target.layer.data?.getRecords();
    var prevLen = target.layer.shapes.length;
    var newLen = initialShapeCount + shapes.length;
    var recordCount = records?.length || 0;
    target.layer.shapes = target.layer.shapes.slice(0, initialShapeCount).concat(shapes);
    while (records && records.length > newLen) {
      records.pop();
    }
    while (records && records.length < newLen) {
      appendNewDataRecord(target.layer);
    }
  }



  gui.on('undo_path_extend', function(e) {
    var target = hit.getHitTarget();
    if (drawing() && prevHoverEvent) {
      deleteLastVertex(target);
      updatePathEndpoint(pixToDataCoords(prevHoverEvent.x, prevHoverEvent.y));
    } else {
      deleteLastVertex(target);
    }
    if (getLastArcLength(target) < 2) {
      gui.undo.undo(); // remove the path
    }
    if (e.shapes) {
      replaceShapes(e.shapes);
    }
  });

  function turnOn() {
    var target = hit.getHitTarget();
    initialArcCount = target.arcs.size();
    initialShapeCount = target.layer.shapes.length;
    if (sessionCount === 0) {
      showInstructions();
    }
    sessionCount++;
  }

  function showInstructions() {
    var isMac = navigator.userAgent.includes('Mac');
    var symbol = isMac ? '⌘' : '^';
    var pathStr = polygonMode() ? 'closed paths' : 'paths';
    var msg = `Instructions: Click on the map to draw ${pathStr}. Drag vertices to reshape a path. Type ${symbol}Z/${symbol}Y to undo/redo.`;
      alert = showPopupAlert(msg, null, {
        non_blocking: true, max_width: '360px'});
  }

  function turnOff() {
    var removed = 0;
    finishCurrentPath();
    if (polygonMode()) {
      removed = removeOpenPolygons();
    }
    clearDrawingInfo();
    if (alert) {
      alert.close();
      alert = null;
    }
    initialArcCount = -1;
    initialShapeCount = -1;
    if (gui.interaction.getMode() == 'drawing') {
      // mode change was not initiated by interactive menu -- turn off interactivity
      gui.interaction.turnOff();
    }
    if (removed > 0) {
      fullRedraw();
    }
  }

  // returns number of removed shapes
  function removeOpenPolygons() {
    var target = hit.getHitTarget();
    var arcs = target.source.dataset.arcs;
    var n = target.layer.shapes.length;
    // delete open paths (should only occur on single-arc shapes)
    for (var i=initialShapeCount; i<n; i++) {
      var shp = target.layer.shapes[i];
      if (!geom.pathIsClosed(shp[0], arcs)) {
        target.layer.shapes[i] = null;
      }
    }
    // removes polygons with wrong winding order and null geometry
    mapshaper.cmd.filterFeatures(target.layer, arcs, {remove_empty: true, quiet: true});
    return n - target.layer.shapes.length;
  }

  function fullRedraw() {
    gui.model.updated({arc_count: true});
  }

  function clearDrawingInfo() {
    hit.clearDrawingId();
    drawingId = -1;
    hoverVertexInfo = null;
    prevClickEvent = prevHoverEvent = null;
  }

  hit.on('dragstart', function(e) {
    if (!active() || drawing() || !hoverVertexInfo) return;
    if (alert) {
      alert.close('fade');
    }
    e.originalEvent.stopPropagation();
    _dragging = true;
    if (hoverVertexInfo.type == 'interpolated') {
      insertVertex(hit.getHitTarget(), hoverVertexInfo.i, hoverVertexInfo.point);
      hoverVertexInfo.ids = [hoverVertexInfo.i];
    }
    hit.setHoverVertex(hoverVertexInfo.displayPoint, hoverVertexInfo.type);
  });

  hit.on('drag', function(e) {
    if (!dragging() || drawing()) return;
    e.originalEvent.stopPropagation();
    var target = hit.getHitTarget();
    var p = ext.translatePixelCoords(e.x, e.y);
    if (gui.keyboard.shiftIsPressed()) {
      internal.snapPointToArcEndpoint(p, hoverVertexInfo.ids, target.arcs);
    }
    internal.snapVerticesToPoint(hoverVertexInfo.ids, p, target.arcs);
    hit.setHoverVertex(p, '');

    // redrawing the whole map updates the data layer as well as the overlay layer
    // gui.dispatchEvent('map-needs-refresh');
  });

  hit.on('dragend', function(e) {
    if (!dragging()) return;
    _dragging = false;
    // kludge to get dataset to recalculate internal bounding boxes
    var target = hit.getHitTarget();
    target.arcs.transformPoints(function() {});
    updateVertexCoords(target, hoverVertexInfo.ids);
    gui.dispatchEvent('vertex_dragend', hoverVertexInfo);
    gui.dispatchEvent('map-needs-refresh'); // redraw basemap
    clearHoverVertex();
  });

  // shift + double-click deletes a vertex (when not drawing)
  // double-click finishes a path (when drawing)
  hit.on('dblclick', function(e) {
    if (!active()) return;
    // double click finishes a path
    // note: if the preceding 'click' finished the path, this does not fire
    if (drawing()) {
      finishCurrentPath();
      e.originalEvent.stopPropagation(); // prevent dblclick zoom
      return;
    }
  });

  // hover event highlights the nearest point in close proximity to the pointer
  // ... or the closest point along the segment (for adding a new vertex)
  hit.on('hover', function(e) {
    if (!active() || dragging()) return;
    if (drawing()) {
      if (!e.overMap) {
        finishCurrentPath();
        return;
      }
      if (gui.keyboard.shiftIsPressed()) {
        alignPointerPosition(e, prevClickEvent);
      }
      updatePathEndpoint(pixToDataCoords(e.x, e.y));
    }

    // highlight nearby snappable vertex (the closest vertex on a nearby line,
    //   or the first vertex of the current drawing path if not near a line)
    hoverVertexInfo = e.id >= 0 && findDraggableVertices(e) ||
        drawing() && findPathStartInfo(e) ||
        e.id >= 0 && findInterpolatedPoint(e);
    if (hoverVertexInfo) {
      // hovering near a vertex: highlight the vertex
      hit.setHoverVertex(hoverVertexInfo.displayPoint, hoverVertexInfo.type);
    } else {
      clearHoverVertex();
    }
    prevHoverEvent = e;
  }, null, 100);

  // click starts or extends a new path
  hit.on('click', function(e) {
    if (!active()) return;
    if (detectDoubleClick(e)) return; // ignore second click of a dblclick
    var p = pixToDataCoords(e.x, e.y);
    if (drawing()) {
      extendCurrentPath(hoverVertexInfo?.point || p);
      // extendCurrentPath(p); // just extend to current mouse position (not hover vertex)
    } else if (gui.keyboard.shiftIsPressed()) {
      deleteActiveVertex(e);
    } else {
      startNewPath(p);
      if (alert) {
        alert.close('fade');
      }
    }
    prevClickEvent = e;
  });

  // esc key finishes a path
  gui.keyboard.on('keydown', function(e) {
    if (active() && (e.keyName == 'esc' || e.keyName == 'enter')) {
      e.stopPropagation();
      finishCurrentPath();
    }
  }, null, 10);

  // detect second 'click' event of a double-click action
  function detectDoubleClick(evt) {
    if (!prevClickEvent) return false;
    var elapsed = evt.time - prevClickEvent.time;
    var dx = Math.abs(evt.x - prevClickEvent.x);
    var dy = Math.abs(evt.y - prevClickEvent.y);
    var dbl = elapsed < 500 && dx <= 2 && dy <= 2;
    return dbl;
  }

  function deleteActiveVertex(e) {
    var info = findDraggableVertices(e);
    if (!info) return;
    var vId = info.ids[0];
    var target = hit.getHitTarget();
    if (internal.vertexIsArcStart(vId, target.arcs) ||
        internal.vertexIsArcEnd(vId, target.arcs)) {
      // TODO: support removing arc endpoints
      return;
    }
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
      {x: x0, y: y0 + dist},
      {x: x0, y: y0 - dist},
      {x: x0 + dist, y: y0},
      {x: x0 - dist, y: y0},
      {x: x0 + dist2, y: y0 + dist2},
      {x: x0 + dist2, y: y0 - dist2},
      {x: x0 - dist2, y: y0 + dist2},
      {x: x0 - dist2, y: y0 - dist2}
    ];
    var snapped = cands.reduce(function(memo, cand) {
      var dist = geom.distance2D(thisEvt.x, thisEvt.y, cand.x, cand.y);
      if (dist < minDist) {
        minDist = dist;
        return cand;
      }
      return memo;
    }, null);
    thisEvt.x = snapped.x;
    thisEvt.y = snapped.y;
  }

  function finishCurrentPath() {
    if (!drawing()) return;
    var target = hit.getHitTarget();
    if (getLastArcLength(target) <= 2) { // includes hover point
      deleteLastPath(target);
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
    drawingId = target.layer.shapes.length - 1;
    hit.setDrawingId(drawingId);
  }

  // p: [x, y] source data coordinates of new point on path
  function extendCurrentPath(p) {
    var target = hit.getHitTarget();
    var shapes1, shapes2;
    // finish the path if a vertex is selected (but not an interpolated point)
    var finish = hoverVertexInfo?.type == 'vertex';
    if (getLastArcLength(target) < 2) {
      error('Defective path');
    }
    if (finish && polygonMode()) {
      shapes1 = target.layer.shapes.slice(initialShapeCount);
      shapes2 = tryToClosePath(shapes1);
    }
    if (shapes2) {
      replaceShapes(shapes2);
      gui.dispatchEvent('path_extend', {target, p, shapes1, shapes2});
      clearDrawingInfo();
      fullRedraw();

    } else {
      appendVertex(target, p);
      gui.dispatchEvent('path_extend', {target, p});
      hit.triggerChangeEvent(); // trigger overlay redraw
    }

  }

  // p: [x, y] source data coordinates
  function updatePathEndpoint(p) {
    var target = hit.getHitTarget();
    var i = target.arcs.getPointCount() - 1;
    if (hoverVertexInfo) {
      p = hoverVertexInfo.point; // snap to selected point
    }
    setVertexCoords(target, [i], p);
    hit.triggerChangeEvent();
  }

  function findPathStartInfo(e) {
    var target = hit.getHitTarget();
    var arcId = target.arcs.size() - 1;
    var data = target.arcs.getVertexData();
    var i = data.ii[arcId];
    var x = data.xx[i];
    var y = data.yy[i];
    var p = ext.translatePixelCoords(e.x, e.y);
    var dist = geom.distance2D(p[0], p[1], x, y);
    var pathLen = data.nn[arcId];
    var pixelDist = dist / ext.getPixelSize();
    if (pixelDist > HOVER_THRESHOLD || pathLen < 4) {
      return null;
    }
    var point = translateDisplayPoint(target, [x, y]);
    return {
      target, ids: [i], extendable: false, point, displayPoint: [x, y], type: 'vertex'
    };
  }

  // return data on the nearest vertex (or identical vertices) to the pointer
  // (if within a distance threshold)
  //
  function findDraggableVertices(e) {
    var target = hit.getHitTarget();
    var shp = target.layer.shapes[e.id];
    var p = ext.translatePixelCoords(e.x, e.y);
    var ids = internal.findNearestVertices(p, shp, target.arcs);
    var p2 = target.arcs.getVertex2(ids[0]);
    var dist = geom.distance2D(p[0], p[1], p2[0], p2[1]);
    var pixelDist = dist / ext.getPixelSize();
    if (pixelDist > HOVER_THRESHOLD) {
      return null;
    }
    var point = getVertexCoords(target, ids[0]); // data coordinates
    // find out if the vertex is the endpoint of a single path
    // (which could be extended by a newly drawn path)
    var extendable = ids.length == 1 &&
      internal.vertexIsArcEndpoint(ids[0], target.arcs);
    var displayPoint = target.arcs.getVertex2(ids[0]);
    return {target, ids, extendable, point, displayPoint, type: 'vertex'};
  }

  function findInterpolatedPoint(e) {
    var target = hit.getHitTarget();
    //// vertex insertion not supported with simplification
    // if (!target.arcs.isFlat()) return null;
    var p = ext.translatePixelCoords(e.x, e.y);
    var minDist = Infinity;
    var shp = target.layer.shapes[e.id];
    var closest;
    internal.forEachSegmentInShape(shp, target.arcs, function(i, j, xx, yy) {
      var x1 = xx[i],
          y1 = yy[i],
          x2 = xx[j],
          y2 = yy[j],
          // switching from midpoint to nearest point to the mouse
          // cx = (x1 + x2) / 2,
          // cy = (y1 + y2) / 2,
          // p2 = [cx, cy],
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

  // shapes: shapes that have been drawn in the current session
  //
  function tryToClosePath(shapes) {
    var target = hit.getHitTarget();
    var tmpLyr = {
      geometry_type: 'polyline',
      shapes: shapes.concat()
    };
    // create a temp dataset containing tmp layer and original layers
    // (so original arcs are retained)
    var tmpDataset = Object.assign({}, target.source.dataset);
    tmpDataset.layers = tmpDataset.layers.concat(tmpLyr);
    // NOTE: added "no_cuts" option to prevent polygons function from modifying
    // arcs, which would break undo/redo and cause other problems
    var outputLyr = mapshaper.cmd.polygons([tmpLyr], tmpDataset, {no_cuts: true})[0];
    var isOpenPath = getOpenPathTest(outputLyr.shapes);
    var shapes2 = [];
    shapes.forEach(function(shp) {
      if (isOpenPath(shp)) {
        shapes2.push(shp);
      }
    });
    return shapes2.concat(outputLyr.shapes);
  }

  // Returns a function for testing if a shape is an unclosed path, and doesn't
  // overlap with an array of polygon shapes
  // polygons: array of polygon shapes
  function getOpenPathTest(polygons) {
    var arcs = [];
    internal.forEachArcId(polygons, function(arcId) {
      if (arcId < 0) arcId = ~arcId;
      arcs.push(arcId);
    });
    return function(shp) {
      // assume that compound shapes are already polygons
      var isOpen = false;
      if (shapeHasOneFwdArc(shp)) {
        var arcId = shp[0][0];
        if (arcId < 0) arcId = ~arcId;
        isOpen = !arcs.includes(arcId);
      }
      return isOpen;
    };
  }

  function shapeHasOneFwdArc(shp) {
    return shp.length == 1 && shp[0].length == 1 && shp[0][0] >= 0;
  }
}


