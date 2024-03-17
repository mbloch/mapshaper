import { error, internal, geom, utils } from './gui-core';
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
  getLastArcCoords
  } from './gui-drawing-utils';
import { translateDisplayPoint } from './gui-display-utils';

// pointer thresholds for hovering near a vertex or segment midpoint
var HOVER_THRESHOLD = 8;
var MIDPOINT_THRESHOLD = 11;

export function initLineEditing(gui, ext, hit) {
  var insertionPoint; // not used in this mode
  var dragVertexInfo;
  var hoverVertexInfo;
  var prevClickEvent;
  var prevHoverEvent;
  var drawingId = -1; // feature id of path being drawn

  function active() {
    return gui.interaction.getMode() == 'edit-lines';
  }

  function dragging() {
    return active() && !!dragVertexInfo;
  }

  function drawing() {
    return drawingId > -1;
  }

  function setHoverVertex(id) {
    var target = hit.getHitTarget();
    hit.setHoverVertex(target.arcs.getVertex2(id));
  }

  function clearHoverVertex() {
    hit.clearHoverVertex();
    hoverVertexInfo = null;
  }

  gui.on('interaction_mode_change', function(e) {
    gui.container.findChild('.map-layers').classed('edit-lines', e.mode == 'edit-lines');
    if (e.mode == 'edit-lines') {
      turnOn();
    } else {
      turnOff();
    }
  }, null, 10); // higher priority than hit control, so turnOff() has correct hit target

  gui.on('redo_path_add', function(e) {
    var target = hit.getHitTarget();
    clearDrawingInfo();
    appendNewPath(target, e.p1, e.p2);
    deleteLastVertex(target); // second vertex is a placeholder
    gui.undo.redo(); // add next vertex in the path
    gui.model.updated({arc_count: true});
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
  });

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
  });

  function turnOn() {}

  function turnOff() {
    finishPath();
    clearDrawingInfo();
    insertionPoint = null;
  }

  function clearDrawingInfo() {
    hit.clearDrawingId();
    drawingId = -1;
    dragVertexInfo = hoverVertexInfo = null;
    prevClickEvent = prevHoverEvent = null;
  }

  hit.on('dragstart', function(e) {
    if (!active()) return;
    if (insertionPoint) {
      var target = hit.getHitTarget();
      insertVertex(target, insertionPoint.i, insertionPoint.point);
      dragVertexInfo = {
        target: target,
        insertion: true,
        point: insertionPoint.point,
        ids: [insertionPoint.i]
      };
      insertionPoint = null;
    } else if (!drawing()) {
      dragVertexInfo = findDraggableVertices(e);
    }
    if (dragVertexInfo) {
      setHoverVertex(dragVertexInfo.ids[0]);
    }
  });

  hit.on('drag', function(e) {
    if (!dragging() || drawing()) return;
    var target = hit.getHitTarget();
    var p = ext.translatePixelCoords(e.x, e.y);
    if (gui.keyboard.shiftIsPressed()) {
      internal.snapPointToArcEndpoint(p, dragVertexInfo.ids, target.arcs);
    }
    internal.snapVerticesToPoint(dragVertexInfo.ids, p, target.arcs);
    setHoverVertex(dragVertexInfo.ids[0]);
    // redrawing the whole map updates the data layer as well as the overlay layer
    // gui.dispatchEvent('map-needs-refresh');
  });

  hit.on('dragend', function(e) {
    if (!dragging()) return;
    // kludge to get dataset to recalculate internal bounding boxes
    hit.getHitTarget().arcs.transformPoints(function() {});
    clearHoverVertex();
    updateVertexCoords(dragVertexInfo.target, dragVertexInfo.ids);
    gui.dispatchEvent('vertex_dragend', dragVertexInfo);
    gui.dispatchEvent('map-needs-refresh');
    dragVertexInfo = null;
  });

  // shift + double-click deletes a vertex (when not drawing)
  // double-click finishes a path (when drawing)
  hit.on('dblclick', function(e) {
    if (!active()) return;
    if (drawing()) {
      // double click finishes a path
      // before: dblclick is preceded by two clicks, need another vertex delete
      // now: second click is suppressed
      // deleteLastVertex(hit.getHitTarget());
      finishPath();
      e.stopPropagation(); // prevent dblclick zoom
      return;
    }
  });

  // hover event highlights the nearest point in close proximity to the pointer
  // ... or the closest segment midpoint (for adding a new vertex)
  hit.on('hover', function(e) {
    if (!active() || dragging()) return;
    if (drawing() && !e.overMap) {
      finishPath();
      return;
    }
    if (drawing()) {
      if (gui.keyboard.shiftIsPressed()) {
        alignPointerPosition(e, prevClickEvent);
      }
      updatePathEndpoint(pixToDataCoords(e.x, e.y));

      // highlight nearby snappable vertex (the closest vertex on a nearby line,
      //   or the first vertex of the current drawing path if not near a line)
      hoverVertexInfo = e.id >= 0 && findDraggableVertices(e) || findPathStartInfo(e);
      if (hoverVertexInfo) {
        // hovering near a vertex: highlight the vertex
        setHoverVertex(hoverVertexInfo.ids[0]);
      } else {
        clearHoverVertex();
      }
      prevHoverEvent = e;
      return;
    }
    if (e.id >= 0 === false) {
      // pointer is not near a path
      return;
    }
    hoverVertexInfo = findDraggableVertices(e);
    insertionPoint = hoverVertexInfo ? null : findMidpointInsertionPoint(e);
    if (hoverVertexInfo) {
      // hovering near a vertex: highlight the vertex
      setHoverVertex(hoverVertexInfo.ids[0]);
    } else if (insertionPoint) {
      // hovering near a segment midpoint: highlight the midpoint
      hit.setHoverVertex(insertionPoint.displayPoint);
    } else {
      // pointer is not over a vertex: clear any hover effect
      clearHoverVertex();
    }
  }, null, 100);

  // click starts or extends a new path
  hit.on('click', function(e) {
    if (!active()) return;
    if (detectDoubleClick(e)) return; // ignore second click of a dblclick
    var p = pixToDataCoords(e.x, e.y);
    if (drawing() && hoverVertexInfo) {
      // finish the path if a vertex is highlighted
      p = hoverVertexInfo.point;
      extendPath(p);
      finishPath();
    } else if (drawing()) {
      extendPath(p);
    } else if (gui.keyboard.shiftIsPressed()) {
      deleteActiveVertex(e);
    } else {
      startPath(p);
    }
    prevClickEvent = e;
  });

  // esc key finishes a path
  gui.keyboard.on('keydown', function(e) {
    if (active() && e.keyName == 'esc') {
      finishPath();
    }
  });

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
    var dist2 = dist / Math.sqrt(2);
    if (dist < 1) return;
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

  function finishPath() {
    if (!drawing()) return;
    var target = hit.getHitTarget();
    if (getLastArcLength(target) <= 2) { // includes hover point
      deleteLastPath(target);
    } else {
      deleteLastVertex(target);
    }
    clearDrawingInfo();
    gui.model.updated({arc_count: true});
  }

  function startPath(p) {
    var target = hit.getHitTarget();
    var p1 = hoverVertexInfo ? getVertexCoords(target, hoverVertexInfo.ids[0]) : p;
    var p2 = p;
    appendNewPath(target, p1, p2);
    gui.dispatchEvent('path_add', {target, p1, p2});
    drawingId = target.layer.shapes.length - 1;
    hit.setDrawingId(drawingId);
  }

  function extendPath(p) {
    var target = hit.getHitTarget();
    var len = getLastArcLength(target);
    if (false && len == 2) {
      var pathCoords = getLastArcCoords(target);
      gui.dispatchEvent('path_add', {target, p1: pathCoords[0], p2: pathCoords[1]});
    } else if (len >= 2) {
      gui.dispatchEvent('path_extend', {target, p});
    }
    appendVertex(target, p);
    hit.triggerChangeEvent();
  }

  // p: [x, y] source data coordinates
  function updatePathEndpoint(p) {
    var target = hit.getHitTarget();
    var i = target.arcs.getPointCount() - 1;
    if (hoverVertexInfo) {
      p = getVertexCoords(target, hoverVertexInfo.ids[0]); // snap to selected point
    }
    setVertexCoords(target, [i], p);
    hit.triggerChangeEvent();
  }

  function findPathStartInfo(e) {
    var target = hit.getHitTarget();
    var arcId = target.arcs.size() - 1;
    var data = target.arcs.getVertexData();
    var id = data.ii[arcId];
    var x = data.xx[id];
    var y = data.yy[id];
    var p = ext.translatePixelCoords(e.x, e.y);
    var dist = geom.distance2D(p[0], p[1], x, y);
    var pathLen = data.nn[arcId];
    var pixelDist = dist / ext.getPixelSize();
    if (pixelDist > HOVER_THRESHOLD || pathLen < 4) {
      return null;
    }
    var point = translateDisplayPoint([x, y]);
    return {
      target, ids: [id], extendable: false, point
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
    return {target, ids, extendable, point};
  }

  function findMidpointInsertionPoint(e) {
    var target = hit.getHitTarget();
    //// vertex insertion not supported with simplification
    // if (!target.arcs.isFlat()) return null;
    var p = ext.translatePixelCoords(e.x, e.y);
    var midpoint = findNearestMidpoint(p, e.id, target);
    if (!midpoint ||
        midpoint.distance / ext.getPixelSize() > MIDPOINT_THRESHOLD) return null;
    return midpoint;
  }
}


// Given a location @p (e.g. corresponding to the mouse pointer location),
// find the midpoint of two vertices on @shp suitable for inserting a new vertex
function findNearestMidpoint(p, fid, target) {
  var arcs = target.arcs;
  var shp = target.layer.shapes[fid];
  var minDist = Infinity, v;
  internal.forEachSegmentInShape(shp, arcs, function(i, j, xx, yy) {
    var x1 = xx[i],
        y1 = yy[i],
        x2 = xx[j],
        y2 = yy[j],
        cx = (x1 + x2) / 2,
        cy = (y1 + y2) / 2,
        midpoint = [cx, cy],
        dist = geom.distance2D(cx, cy, p[0], p[1]);
    if (dist < minDist) {
      minDist = dist;
      v = {
        i: (i < j ? i : j) + 1, // insertion point
        segment: [i, j],
        segmentLen: geom.distance2D(x1, y1, x2, y2),
        displayPoint: midpoint,
        point: translateDisplayPoint(target, midpoint),
        distance: dist
      };
    }
  });
  return v || null;
}
