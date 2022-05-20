import { error, internal } from './gui-core';
import { updatePointCoords, getPointCoords } from './gui-display-utils';

export function initPointDragging(gui, ext, hit) {
  var symbolInfo;
  function active(e) {
    return e.id > -1 && gui.interaction.getMode() == 'location';
  }

  hit.on('dragstart', function(e) {
    if (!active(e)) return;
    var target = hit.getHitTarget();
    symbolInfo = {
      FID: e.id,
      startCoords: getPointCoords(target, e.id),
      target: target
    };
  });

  hit.on('drag', function(e) {
    if (!active(e)) return;
    // TODO: support multi points... get id of closest part to the pointer
    var p = getPointCoordsById(e.id, symbolInfo.target.layer);
    if (!p) return;
    var diff = translateDeltaDisplayCoords(e.dx, e.dy, ext);
    p[0] += diff[0];
    p[1] += diff[1];
    gui.dispatchEvent('map-needs-refresh');
  });

  hit.on('dragend', function(e) {
    if (!active(e) || !symbolInfo ) return;
    updatePointCoords(symbolInfo.target, e.id);
    symbolInfo.endCoords = getPointCoords(symbolInfo.target, e.id);
    gui.dispatchEvent('symbol_dragend', symbolInfo);
    symbolInfo = null;
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
