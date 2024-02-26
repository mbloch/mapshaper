import { error, internal } from './gui-core';
import { updatePointCoords } from './gui-display-utils';

export function initPointDrawing(gui, ext, mouse, hit) {

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
    var target = hit.getHitTarget();
    var lyr = target.layer;
    var fid = lyr.shapes.length;
    var d = lyr.data ? getEmptyDataRecord(lyr.data) : null;
    if (d) {
      // this seems to work even for projected layers -- the data tables
      // of projected and original data seem to be shared.
      lyr.data.getRecords()[fid] = d;
      if ('label-text' in d) {
        d['label-text'] = 'TBD'; // without text, new labels will be invisible
      }
    }
    lyr.shapes[fid] = [p];
    updatePointCoords(target, fid);
  }

  function getEmptyDataRecord(table) {
    return table.getFields().reduce(function(memo, name) {
      memo[name] = null;
      return memo;
    }, {});
  }
}
