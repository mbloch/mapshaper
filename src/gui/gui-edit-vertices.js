import { error, internal } from './gui-core';

export function initVertexDragging(gui, ext, hit) {
  var activeId = -1;
  var activeVertexIds = null;

  function active(e) {
    return e.id > -1 && gui.interaction.getMode() == 'vertices';
  }

  function fire(type) {
    gui.dispatchEvent(type, {
      FID: activeId,
      vertex_ids: activeVertexIds
    });
  }

  hit.on('dragstart', function(e) {
    if (!active(e)) return;
    var target = hit.getHitTarget();
    var shp = target.layer.shapes[e.id];
    var p = ext.translatePixelCoords(e.x, e.y);
    var nearestIds = internal.findNearestVertices(p, shp, target.arcs);
    activeVertexIds = nearestIds;
    activeId = e.id;
    fire('vertex_dragstart');
  });

  hit.on('drag', function(e) {
    if (!active(e)) return;
    if (!activeVertexIds) return; // ignore error condition
    var target = hit.getHitTarget();
    var p = ext.translatePixelCoords(e.x, e.y);
    if (gui.keyboard.shiftIsPressed()) {
      internal.snapPointToArcEndpoint(p, activeVertexIds, target.arcs);
    }
    internal.snapVerticesToPoint(activeVertexIds, p, target.arcs);
    gui.dispatchEvent('map-needs-refresh');
  });

  hit.on('dragend', function(e) {
    if (!active(e)) return;
    // kludge to get dataset to recalculate internal bounding boxes
    hit.getHitTarget().arcs.transformPoints(function() {});
    fire('vertex_dragend');
    activeVertexIds = null;
    activeId = -1;
  });
}
