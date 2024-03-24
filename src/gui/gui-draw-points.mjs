import { error, internal } from './gui-core';
import { updatePointCoords, appendNewDataRecord } from './gui-drawing-utils';

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
    addPoint(e.x, e.y);
    gui.dispatchEvent('map-needs-refresh');
  });

  // x, y: pixel coordinates
  function addPoint(x, y) {
    var p = ext.translatePixelCoords(x, y);
    var lyr = hit.getHitTarget();
    var fid = lyr.shapes.length;
    var d = appendNewDataRecord(lyr);
    if (d) {
      // this seems to work even for projected layers -- the data tables
      // of projected and original data seem to be shared.
      lyr.data.getRecords()[fid] = d;
    }
    lyr.shapes[fid] = [p];
    updatePointCoords(lyr, fid);
  }


}
