import { error, internal } from './gui-core';
import {
  updatePointCoords,
  getPointCoords,
  appendNewPoint,
  deleteFeature } from './gui-drawing-utils';
import { translateDisplayPoint } from './gui-display-utils';
import { addEmptyLayer } from './gui-add-layer-popup';
import { showPopupAlert } from './gui-alert';

export function initPointEditing(gui, ext, hit) {
  var instructionsShown = false;
  var symbolInfo, alert;
  function active(e) {
    return gui.interaction.getMode() == 'edit_points';
  }

  function overPoint(e) {
    return active(e) && e.id > -1;
  }

  function hideInstructions() {
    if (!alert) return;
    alert.close('fade');
    alert = null;
  }

  function showInstructions() {
    var isMac = navigator.userAgent.includes('Mac');
    var symbol = isMac ? '⌘' : '^';
    var msg = `Instructions: Click on the map to add points. Move points by dragging. Type ${symbol}Z/${symbol}Y to undo/redo.`;
    alert = showPopupAlert(msg, null, { non_blocking: true, max_width: '360px'});
  }

  gui.on('interaction_mode_change', function(e) {
    if (e.mode == 'edit_points' && !gui.model.getActiveLayer()) {
      addEmptyLayer(gui, undefined, 'point');
    } else if (e.prev_mode == 'edit_points') {
      hideInstructions();
      gui.container.findChild('.map-layers').classed('add-points', false);
    }
    if (e.mode == 'edit_points' && !instructionsShown) {
      instructionsShown = true;
      showInstructions();
    }
  });

  hit.on('contextmenu', function(e) {
    if (!active(e)) return;
    var target = hit.getHitTarget();
    var id = e.id;
    if (id > -1) {
      e.deletePoint = function() {
        removePoint(target, id);
      };
    }
    gui.contextMenu.open(e, target);
  });

  function removePoint(target, id) {
    var d = target.data ? target.data.getRecords()[id] : null;
    var coords = target.shapes[id];
    deleteFeature(target, id);
    gui.dispatchEvent('feature_delete', {coords, d, target, fid: id});
    gui.dispatchEvent('map-needs-refresh');
    hit.setHitId(-1);
  }

  hit.on('click', function(e) {
    if (overPoint(e) || !active(e)) return;
    hideInstructions();

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
    hideInstructions();
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
