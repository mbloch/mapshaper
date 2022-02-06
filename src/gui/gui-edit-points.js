import { error, internal } from './gui-core';

export function initPointDragging(gui, ext, hit) {

  function active(e) {
    return e.id > -1 && gui.interaction.getMode() == 'location';
  }

  hit.on('dragstart', function(e) {
    if (!active(e)) return;
    gui.dispatchEvent('symbol_dragstart', {FID: e.id});
  });

  hit.on('drag', function(e) {
    if (!active(e)) return;
    var lyr = hit.getHitTarget().layer;
    var p = getPointCoordsById(e.id, lyr);
    if (!p) return;
    var diff = translateDeltaDisplayCoords(e.dx, e.dy, ext);
    p[0] += diff[0];
    p[1] += diff[1];
    gui.dispatchEvent('map-needs-refresh');
    gui.dispatchEvent('symbol_drag', {FID: e.id});
  });

  hit.on('dragend', function(e) {
    if (!active(e)) return;
    gui.dispatchEvent('symbol_dragend', {FID: e.id});
  });

  function translateDeltaDisplayCoords(dx, dy, ext) {
    var a = ext.translatePixelCoords(0, 0);
    var b = ext.translatePixelCoords(dx, dy);
    return [b[0] - a[0], b[1] - a[1]];
  }

  function getPointCoordsById(id, layer) {
    var coords = layer && layer.geometry_type == 'point' && layer.shapes[id];
    if (!coords || coords.length != 1) {
      return null;
    }
    return coords[0];
  }
}
