import { error, internal } from './gui-core';
import { updatePointCoords } from './gui-display-utils';

export function initLineDrawing(gui, ext, mouse, hit) {
  var _on = false;
  var _coords;
  var _lastClick;

  gui.on('interaction_mode_change', function(e) {
    _on = e.mode === 'draw-lines';
    gui.container.findChild('.map-layers').classed('draw-lines', _on);
  });

  function active() {
    return _on;
  }

  function extending() {
    return active() && !!_coords;
  }

  function startPath(e) {

  }

  function extendPath(e) {

  }

  function finishPath() {
    _coords = null;
  }

  gui.keyboard.on('keydown', function(evt) {
    if (!active()) return;
    if (evt.keyCode == 27) { // esc
      finishPath();
    }
  });

  mouse.on('click', function(e) {
    if (!active()) return;
    // console.log('[click]', e)
    // addPoint(e.x, e.y);
    // gui.dispatchEvent('map-needs-refresh');
    _lastClick = e;
  });

  // note: second click event is fired before this
  mouse.on('dblclick', function(e) {
    if (!active()) return;
    // block navigation
    e.stopPropagation();
    finishPath();

  }, null, 3); // hit detection is priority 2

  mouse.on('hover', function(e) {
    if (!active()) return;
  });

  // x, y: pixel coordinates
  function addPoint(x, y) {
    var p = ext.translatePixelCoords(x, y);
    var target = hit.getHitTarget();
    var lyr = target.layer;
    var fid = lyr.shapes.length;
    if (lyr.data) {
      // this seems to work even for projected layers -- the data tables
      // of projected and original data seem to be shared.
      lyr.data.getRecords()[fid] = getEmptyDataRecord(lyr.data);
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
