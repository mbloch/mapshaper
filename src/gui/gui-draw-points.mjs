import { error, internal } from './gui-core';
import {
  updatePointCoords,
  appendNewDataRecord,
  appendNewPoint
} from './gui-drawing-utils';
import { translateDisplayPoint } from './gui-display-utils';

export function initPointDrawing(gui, ext, hit) {
  var mouse = gui.map.getMouse();

  gui.on('interaction_mode_change', function(e) {
    gui.container.findChild('.map-layers').classed('add-points', e.mode === 'add-points');
  });

  function active() {
    return gui.interaction.getMode() == 'add-points';
  }

  mouse.on('click', function(e) {
    if (!active()) return;
    var p = pixToDataCoords(e.x, e.y);
    var target = hit.getHitTarget();
    appendNewPoint(target, p);
    gui.dispatchEvent('point_add', {p, target});
    gui.dispatchEvent('map-needs-refresh');
  });


  function pixToDataCoords(x, y) {
    var target = hit.getHitTarget();
    return translateDisplayPoint(target, ext.translatePixelCoords(x, y));
  }

}
