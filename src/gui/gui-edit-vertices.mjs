import { error, internal, geom, utils } from './gui-core';
import { updateVertexCoords, insertVertex, getVertexCoords, translateDisplayPoint, deleteVertex } from './gui-display-utils';

// pointer thresholds for hovering near a vertex or segment midpoint
var HOVER_THRESHOLD = 8;
var MIDPOINT_THRESHOLD = 11;

export function initVertexDragging(gui, ext, hit) {
  var insertionPoint;
  var dragInfo;

  function active() {
    return gui.interaction.getMode() == 'vertices';
  }

  function dragging() {
    return active() && !!dragInfo;
  }

  function setHoverVertex(id) {
    var target = hit.getHitTarget();
    hit.setHoverVertex(target.arcs.getVertex2(id));
  }

  function clearHoverVertex() {
    hit.clearVertexOverlay();
  }

  function findDraggableVertices(e) {
    var target = hit.getHitTarget();
    var shp = target.layer.shapes[e.id];
    var p = ext.translatePixelCoords(e.x, e.y);
    var nearestIds = internal.findNearestVertices(p, shp, target.arcs);
    var p2 = target.arcs.getVertex2(nearestIds[0]);
    var dist = geom.distance2D(p[0], p[1], p2[0], p2[1]);
    var pixelDist = dist / ext.getPixelSize();
    if (pixelDist > HOVER_THRESHOLD) {
      return null;
    }
    var points = nearestIds.map(function(i) {
      return getVertexCoords(target, i); // data coordinates
    });
    return {
      target: target,
      ids: nearestIds,
      points: points
    };
  }

  function findVertexInsertionPoint(e) {
    var target = hit.getHitTarget();
    //// vertex insertion not supported with simplification
    // if (!target.arcs.isFlat()) return null;
    var p = ext.translatePixelCoords(e.x, e.y);
    var midpoint = findNearestMidpoint(p, e.id, target);
    if (!midpoint ||
        midpoint.distance / ext.getPixelSize() > MIDPOINT_THRESHOLD) return null;
    return midpoint;
  }

  hit.on('dragstart', function(e) {
    if (!active()) return;
    if (insertionPoint) {
      var target = hit.getHitTarget();
      insertVertex(target, insertionPoint.i, insertionPoint.point);
      dragInfo = {
        target: target,
        insertion: true,
        ids: [insertionPoint.i],
        points: [insertionPoint.point]
      };
      insertionPoint = null;
    } else {
      dragInfo = findDraggableVertices(e);
    }
    if (dragInfo) {
      setHoverVertex(dragInfo.ids[0]);
    }
  });

  hit.on('drag', function(e) {
    if (!dragging()) return;
    var target = hit.getHitTarget();
    var p = ext.translatePixelCoords(e.x, e.y);
    if (gui.keyboard.shiftIsPressed()) {
      internal.snapPointToArcEndpoint(p, dragInfo.ids, target.arcs);
    }
    internal.snapVerticesToPoint(dragInfo.ids, p, target.arcs);
    setHoverVertex(dragInfo.ids[0]);
    // redrawing the whole map updates the data layer as well as the overlay layer
    // gui.dispatchEvent('map-needs-refresh');
  });

  hit.on('dragend', function(e) {
    if (!dragging()) return;
    // kludge to get dataset to recalculate internal bounding boxes
    hit.getHitTarget().arcs.transformPoints(function() {});
    clearHoverVertex();
    updateVertexCoords(dragInfo.target, dragInfo.ids);
    gui.dispatchEvent('vertex_dragend', dragInfo);
    gui.dispatchEvent('map-needs-refresh');
    dragInfo = null;
  });

  hit.on('dblclick', function(e) {
    if (!active()) return;
    var info = findDraggableVertices(e); // same selection criteria as for dragging
    if (!info) return;
    var target = hit.getHitTarget();
    var vId = info.ids[0];
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
  });

  // highlight hit vertex in path edit mode
  hit.on('hover', function(e) {
    insertionPoint = null;
    if (!active() || dragging()) return; // no hover effect while dragging
    var info = findDraggableVertices(e);
    if (info) {
      // hovering near a vertex: highlight the vertex
      setHoverVertex(info.ids[0]);
      return;
    }
    // if hovering near a segment midpoint: show the midpoint and save midpoint info
    insertionPoint = findVertexInsertionPoint(e);
    if (insertionPoint) {
      hit.setHoverVertex(insertionPoint.displayPoint);
    } else {
      // pointer is not over a vertex: clear any hover effect
      clearHoverVertex();
    }
  }, null, 100);
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
