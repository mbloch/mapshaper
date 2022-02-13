import { error, internal, geom  } from './gui-core';

export function initVertexDragging(gui, ext, hit) {
  var activeShapeId = -1;
  var draggedVertexIds = null;
  var selectedVertexId = -1;

  function active(e) {
    return e.id > -1 && gui.interaction.getMode() == 'vertices';
  }

  function fire(type) {
    gui.dispatchEvent(type, {
      FID: activeShapeId,
      vertex_ids: draggedVertexIds
    });
  }

  hit.on('dragstart', function(e) {
    if (!active(e)) return;
    var target = hit.getHitTarget();
    var shp = target.layer.shapes[e.id];
    var p = ext.translatePixelCoords(e.x, e.y);
    var nearestIds = internal.findNearestVertices(p, shp, target.arcs);
    var p2 = target.arcs.getVertex2(nearestIds[0]);
    var dist = geom.distance2D(p[0], p[1], p2[0], p2[1]);
    var pixelDist = dist / ext.getPixelSize();
    if (pixelDist > 5) {
      draggedVertexIds = null;
      return;
    }
    draggedVertexIds = nearestIds;
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
    gui.dispatchEvent('map-needs-refresh');
  });

  hit.on('dragend', function(e) {
    if (!active(e) || !draggedVertexIds) return;
    // kludge to get dataset to recalculate internal bounding boxes
    hit.getHitTarget().arcs.transformPoints(function() {});
    fire('vertex_dragend');
    draggedVertexIds = null;
    activeShapeId = -1;
  });

  // highlight hit vertex in path edit mode
  if (false) hit.on('hover', function(e) {
    if (gui.interaction.getMode() != 'vertices' || activeShapeId >= 0) return;
    // hovering in vertex edit mode: find vertex insertion point
    var target = hit.getHitTarget();
    var shp = target.layer.shapes[e.id];
    var p = ext.translatePixelCoords(e.x, e.y);
    var o = internal.findInsertionPoint(p, shp, target.arcs, ext.getPixelSize());
  }, null, 100);

}

