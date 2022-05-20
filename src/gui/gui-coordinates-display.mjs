import { internal } from './gui-core';
import { GUI } from './gui-lib';

export function CoordinatesDisplay(gui, ext, mouse) {
  var readout = gui.container.findChild('.coordinate-info').hide();

  function enabled() {
    var lyr = gui.map.getActiveLayer();
    return !!(lyr && lyr.layer.geometry_type);
  }

  gui.model.on('update', function(e) {
    readout.hide();
  });

  readout.on('copy', function(e) {
    // remove selection on copy (using timeout or else copy is cancelled)
    setTimeout(function() {
      window.getSelection().removeAllRanges();
    }, 50);
  });

  // clear coords when map pans
  ext.on('change', function() {
    clearCoords();
    // shapes may change along with map scale
    // target = lyr ? lyr.getDisplayLayer() : null;
  });

  mouse.on('leave', clearCoords);

  mouse.on('click', function(e) {
    if (!enabled()) return;
    GUI.selectElement(readout.node());
  });

  mouse.on('hover', onMouseChange);
  mouse.on('drag', onMouseChange, null, 10); // high priority so editor doesn't block propagation

  function onMouseChange(e) {
    if (!enabled()) return;
    if (isOverMap(e)) {
      displayCoords(gui.map.translatePixelCoords(e.x, e.y));
    } else {
      clearCoords();
    }
  }

  function displayCoords(p) {
    var p1 = gui.map.translatePixelCoords(0, ext.height());
    var p2 = gui.map.translatePixelCoords(ext.width(), 0);
    var bbox = p1.concat(p2);
    var decimals = internal.getBoundsPrecisionForDisplay(bbox);
     var str = internal.getRoundedCoordString(p, decimals);
    readout.text(str).show();
  }

  function clearCoords() {
    readout.hide();
  }

  function isOverMap(e) {
    return e.x >= 0 && e.y >= 0 && e.x < ext.width() && e.y < ext.height();
  }
}
