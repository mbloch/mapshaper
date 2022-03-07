import { error, internal, geom  } from './gui-core';

var HOVER_THRESHOLD = 8;
var MIDPOINT_THRESHOLD = 12;


export function initVertexDragging(gui, ext, hit) {
  var activeShapeId = -1;
  var draggedVertexIds = null;
  var selectedVertexIds = null;
  var activeMidpoint; // {point, segment}

  function active(e) {
    return e.id > -1 && gui.interaction.getMode() == 'vertices';
  }

  function fire(type) {
    gui.dispatchEvent(type, {
      FID: activeShapeId,
      vertex_ids: draggedVertexIds
    });
  }

  function setHoverVertex(id) {
    var target = hit.getHitTarget();
    hit.setHoverVertex(target.arcs.getVertex2(id));
  }

  function clearHoverVertex() {
    hit.clearVertexOverlay();
    // gui.state.vertex_overlay = null;
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
      draggedVertexIds = null;
      return null;
    }
    return nearestIds;
  }

  function insertMidpoint(v) {
    var target = hit.getHitTarget();
    internal.insertVertex(target.arcs, v.i, v.point);
  }

  hit.on('dragstart', function(e) {
    if (!active(e)) return;
    if (activeMidpoint) {
      insertMidpoint(activeMidpoint);
      draggedVertexIds = [activeMidpoint.i];
      // TODO: combine vertex insertion undo/redo actions with
      // vertex_dragend undo/redo actions
      gui.dispatchEvent('vertex_insert', {
        FID: activeShapeId,
        vertex_id: activeMidpoint.i,
        coordinates: activeMidpoint.point
      });
      activeMidpoint = null;
    } else {
      draggedVertexIds = findDraggableVertices(e);
    }
    if (!draggedVertexIds) return;
    setHoverVertex(draggedVertexIds[0]);
    activeShapeId = e.id;
    fire('vertex_dragstart');
  });

  hit.on('drag', function(e) {
    if (!active(e) || !draggedVertexIds) return;
    var target = hit.getHitTarget();
    var p = ext.translatePixelCoords(e.x, e.y);
    if (gui.keyboard.shiftIsPressed()) {
      internal.snapPointToArcEndpoint(p, draggedVertexIds, target.arcs);
    }
    internal.snapVerticesToPoint(draggedVertexIds, p, target.arcs);
    setHoverVertex(draggedVertexIds[0]);
    // redrawing the whole map updates the data layer as well as the overlay layer
    // gui.dispatchEvent('map-needs-refresh');
  });

  hit.on('dragend', function(e) {
    if (!active(e) || !draggedVertexIds) return;
    // kludge to get dataset to recalculate internal bounding boxes
    hit.getHitTarget().arcs.transformPoints(function() {});
    clearHoverVertex();
    fire('vertex_dragend');
    draggedVertexIds = null;
    activeShapeId = -1;
    // redraw data layer
    gui.dispatchEvent('map-needs-refresh');
  });

  // select clicked vertices
  hit.on('click', function(e) {
    if (!active(e)) return;
    var vertices = findDraggableVertices(e); // same selection criteria as for dragging
    // TODO
  });

  // highlight hit vertex in path edit mode
  hit.on('hover', function(e) {
    activeMidpoint = null;
    if (!active(e) || draggedVertexIds) return; // no hover effect while dragging
    var vertexIds = findDraggableVertices(e);
    if (vertexIds) {
      setHoverVertex(vertexIds[0]);
      return;
    }
    var target = hit.getHitTarget();
    // vertex insertion doesn't work yet with simplification applied
    if (!target.arcs.isFlat()) return;
    var shp = target.layer.shapes[e.id];
    var p = ext.translatePixelCoords(e.x, e.y);
    var midpoint = findNearestMidpoint(p, shp, target.arcs);
    if (midpoint && midpoint.distance / ext.getPixelSize() < MIDPOINT_THRESHOLD) {
      hit.setHoverVertex(midpoint.point);
      activeMidpoint = midpoint;
    } else {
      clearHoverVertex();
    }
  }, null, 100);
}


// Given a location @p (e.g. corresponding to the mouse pointer location),
// find the midpoint of two vertices on @shp suitable for inserting a new vertex,
// but only if:
//   1. point @p is closer to the midpoint than either adjacent vertex
//   2. the segment containing @p is longer than a minimum distance in pixels.
//
function findNearestMidpoint(p, shp, arcs) {
  // var v1 = internal.findNearestVertex(p[0], p[1], shp, arcs);
  // var v0 = internal.findAdjacentVertex(v1, shp, arcs, -1);
  // var v2 = internal.findAdjacentVertex(v1, shp, arcs, 1);
  var minDist = Infinity, v;
  internal.forEachSegmentInShape(shp, arcs, function(i, j, xx, yy) {
    var x1 = xx[i],
        y1 = yy[i],
        x2 = xx[j],
        y2 = yy[j],
        cx = (x1 + x2) / 2,
        cy = (y1 + y2) / 2,
        dist = geom.distance2D(cx, cy, p[0], p[1]);
    if (dist < minDist) {
      minDist = dist;
      v = {
        i: (i < j ? i : j) + 1, // insertion point
        segment: [i, j],
        point: [cx, cy],
        distance: dist
      };
    }
  });
  return v || null;
}



