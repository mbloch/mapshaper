import { error, internal, geom  } from './gui-core';

export function initVertexDragging(gui, ext, hit) {
  var activeShapeId = -1;
  var draggedVertexIds = null;
  var selectedVertexIds = null;

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
    if (pixelDist > 5) {
      draggedVertexIds = null;
      return null;
    }
    return nearestIds;
  }

  hit.on('dragstart', function(e) {
    if (!active(e)) return;
    draggedVertexIds = findDraggableVertices(e);
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
    if (!active(e) || draggedVertexIds) return; // no hover effect while dragging
    var vertexIds = findDraggableVertices(e);
    if (vertexIds) {
      setHoverVertex(vertexIds[0]);
      return;
    }
    var target = hit.getHitTarget();
    var shp = target.layer.shapes[e.id];
    var p = ext.translatePixelCoords(e.x, e.y);
    var o = internal.findInsertionPoint(p, shp, target.arcs, ext.getPixelSize());
    console.log('*', o, p);
    clearHoverVertex();
  }, null, 100);

}

