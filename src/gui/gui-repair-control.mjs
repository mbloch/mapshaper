import { utils, internal } from './gui-core';
import { EventDispatcher } from './gui-events';
import { intersectionsMayHaveChanged } from './gui-map-utils';

export function RepairControl(gui) {
  var map = gui.map,
      model = gui.model,
      el = gui.container.findChild(".intersection-display"),
      readout = el.findChild(".intersection-count"),
      repairBtn = el.findChild(".repair-btn"),
      optBox = gui.container.findChild('.intersections-opt'),
      _simplifiedXX, // saved simplified intersections, for repair
      _unsimplifiedXX; // saved unsimplified intersection data, for performance

  gui.on('simplify_drag_start', function() {
    hide();
  });

  gui.on('mode', updateRepairBtn);

  gui.on('display_option_change', function(e) {
    if (e.option == 'intersectionsOn') {
      updateAsync();
    }
  });

  gui.on('simplify_drag_end', function() {
    updateSync('simplify_drag_end');
  });

  repairBtn.on('click', function() {
    var e = model.getActiveLayer();
    if (!_simplifiedXX || !e.dataset.arcs) return;
    _simplifiedXX = internal.repairIntersections(e.dataset.arcs, _simplifiedXX);
    showIntersections(_simplifiedXX, e.layer, e.dataset.arcs);
    repairBtn.hide();
    model.updated({repair: true});
    gui.session.simplificationRepair();
  });

  model.on('update', function(e) {
    var needRefresh = e.flags.simplify_method || e.flags.simplify ||
      e.flags.repair || e.flags.clean || e.flags.select || intersectionsMayHaveChanged(e.flags);
    if (!intersectionsAreOn()) {
      reset();
    } else if (needRefresh) {
      updateAsync();
    } else if (e.flags.simplify_amount) {
      // slider is being dragged - hide readout and dots, retain data
      hide();
    } else {
      // keep displaying the current intersections
    }
  });

  function updateRepairBtn() {
    if (intersectionsAreOn() && gui.getMode() == 'simplify' &&
      _simplifiedXX?.length > 0) {
      repairBtn.show();
    } else {
      repairBtn.hide();
    }
  }

  function intersectionsAreOn() {
    var e = model.getActiveLayer();
    return !!(gui.display.getOptions().intersectionsOn &&
      e && e.dataset.arcs && internal.layerHasPaths(e.layer));
  }

  function reset() {
    hide();
    _simplifiedXX = null;
    _unsimplifiedXX = null;
  }

  function hide() {
    map.setIntersectionLayer(null);
    el.hide();
    repairBtn.hide();
    readout.hide();
  }

  // Update intersection display, after a short delay so map can redraw after previous
  // operation (e.g. simplification change)
  function updateAsync() {
    setTimeout(updateSync, 10);
  }

  function updateSync(action) {
    var e = model.getActiveLayer();
    var arcs = e.dataset && e.dataset.arcs;
    if (!intersectionsAreOn() || !arcs || !internal.layerHasPaths(e.layer)) {
      reset();
      return;
    }
    var intersectionOpts = {
      unique: true,
      tolerance: 0
    };
    if (arcs.getRetainedInterval() > 0) {
      // simplification
      _simplifiedXX = internal.findSegmentIntersections(arcs, intersectionOpts);
    } else {
      // no simplification
      _simplifiedXX = null; // clear any old simplified XX
      if (_unsimplifiedXX && action == 'simplify_drag_end') {
        // re-use previously generated intersection data (optimization)
      } else {
        _unsimplifiedXX = internal.findSegmentIntersections(arcs, intersectionOpts);
      }
    }
    showIntersections(_simplifiedXX || _unsimplifiedXX, e.layer, arcs);
  }

  function showIntersections(xx, lyr, arcs) {
    var pointLyr, count = 0, html;
    el.show();
    readout.show();
    if (xx.length > 0) {
      pointLyr = internal.getIntersectionLayer(xx, lyr, arcs);
      count = internal.countPointsInLayer(pointLyr);
    }
    if (count == 0) {
      map.setIntersectionLayer(null);
      html = '<span class="icon black"></span>No self-intersections';
    } else {
      map.setIntersectionLayer(pointLyr, {layers:[pointLyr]});
      html = utils.format('<span class="icon"></span>%s line intersection%s', count, utils.pluralSuffix(count));
    }
    readout.html(html);
    updateRepairBtn();
  }
}

utils.inherit(RepairControl, EventDispatcher);
