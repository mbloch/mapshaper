import { error, internal } from './gui-core';
import { updatePointCoords, getPointCoords, appendNewPoint } from './gui-drawing-utils';
import { translateDisplayPoint } from './gui-display-utils';
import { addEmptyLayer } from './gui-add-layer-popup';

export function initPointEditing(gui, ext, hit) {
  var symbolInfo;
  function active(e) {
    return gui.interaction.getMode() == 'edit_points';
  }

  function overPoint(e) {
    return active(e) && e.id > -1;
  }

  gui.on('interaction_mode_change', function(e) {
    if (e.mode == 'edit_points' && !gui.model.getActiveLayer()) {
      addEmptyLayer(gui, undefined, 'point');
    } else if (e.prev_mode == 'edit_points') {
      gui.container.findChild('.map-layers').classed('add-points', false);
    }

  });

  hit.on('click', function(e) {
    if (overPoint(e) || !active(e)) return;
    // add point
    var p = pixToDataCoords(e.x, e.y);
    var target = hit.getHitTarget();
    appendNewPoint(target, p);
    gui.dispatchEvent('point_add', {p, target});
    gui.dispatchEvent('map-needs-refresh');
    hit.setHitId(target.shapes.length - 1); // highlight new point
  });

  hit.on('change', function(e) {
    if (!active(e)) return;
    gui.container.findChild('.map-layers').classed('add-points', !overPoint(e));
  });

  hit.on('dragstart', function(e) {
    if (!overPoint(e)) return;
    var target = hit.getHitTarget();
    symbolInfo = {
      FID: e.id,
      startCoords: getPointCoords(target, e.id),
      target: target
    };
  });

  hit.on('drag', function(e) {
    if (!overPoint(e)) return;
    // TODO: support multi points... get id of closest part to the pointer
    // var p = getPointCoordsById(e.id, symbolInfo.target);
    var id = symbolInfo.FID;
    var shp = symbolInfo.target.gui.displayLayer.shapes[id];
    if (!shp) return;
    var diff = translateDeltaDisplayCoords(e.dx, e.dy, ext);
    shp[0][0] += diff[0];
    shp[0][1] += diff[1];
    gui.dispatchEvent('map-needs-refresh');
  });

  hit.on('dragend', function(e) {
    if (!overPoint(e) || !symbolInfo ) return;
    updatePointCoords(symbolInfo.target, symbolInfo.FID);
    symbolInfo.endCoords = getPointCoords(symbolInfo.target, e.id);
    gui.dispatchEvent('symbol_dragend', symbolInfo);
    symbolInfo = null;
  });

  function pixToDataCoords(x, y) {
    var target = hit.getHitTarget();
    return translateDisplayPoint(target, ext.translatePixelCoords(x, y));
  }

  function translateDeltaDisplayCoords(dx, dy, ext) {
    var a = ext.translatePixelCoords(0, 0);
    var b = ext.translatePixelCoords(dx, dy);
    return [b[0] - a[0], b[1] - a[1]];
  }
}
