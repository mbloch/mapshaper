import { utils, internal } from './gui-core';
import { EventDispatcher } from './gui-events';
import { intersectionsMayHaveChanged } from './gui-map-utils';

export function RepairControl(gui) {
  var map = gui.map,
      model = gui.model,
      el = gui.container.findChild(".intersection-display"),
      readout = el.findChild(".intersection-count"),
      checkBtn = el.findChild(".intersection-check"),
      repairBtn = el.findChild(".repair-btn"),
      _simplifiedXX, // saved simplified intersections, for repair
      _unsimplifiedXX, // saved unsimplified intersection data, for performance
      _disabled = false,
      _on = false;

  el.findChild('.close-btn').on('click', dismissForever);

  gui.on('simplify_drag_start', function() {
    if (intersectionsAreOn()) {
      hide();
    }
  });

  gui.on('simplify_drag_end', function() {
    updateSync('simplify_drag_end');
  });

  checkBtn.on('click', function() {
    checkBtn.hide();
    _on = true;
    updateSync();
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
    if (!intersectionsAreOn()) {
      reset(); // need this?
      return;
    }
    var needRefresh = e.flags.simplify_method || e.flags.simplify ||
      e.flags.repair || e.flags.clean;
    if (needRefresh) {
      updateAsync();
    } else if (e.flags.simplify_amount) {
      // slider is being dragged - hide readout and dots, retain data
      hide();
    } else if (intersectionsMayHaveChanged(e.flags)) {
      // intersections may have changed -- reset the display
      reset();
    } else {
      // keep displaying the current intersections
    }
  });

  function intersectionsAreOn() {
    return _on && !_disabled;
  }

  function turnOff() {
    hide();
    _on = false;
    _simplifiedXX = null;
    _unsimplifiedXX = null;
  }

  function reset() {
    turnOff();
    if (_disabled) {
      return;
    }
    var e = model.getActiveLayer();
    if (internal.layerHasPaths(e.layer)) {
      el.show();
      checkBtn.show();
      readout.hide();
      repairBtn.hide();
    }
  }

  function dismissForever() {
    _disabled = true;
    turnOff();
  }

  function hide() {
    map.setIntersectionLayer(null);
    el.hide();
  }

  // Update intersection display, after a short delay so map can redraw after previous
  // operation (e.g. simplification change)
  function updateAsync() {
    setTimeout(updateSync, 10);
  }

  function updateSync(action) {
    if (!intersectionsAreOn()) return;
    var e = model.getActiveLayer();
    var arcs = e.dataset && e.dataset.arcs;
    var intersectionOpts = {
      unique: true,
      tolerance: 0
    };
    if (!arcs || !internal.layerHasPaths(e.layer)) {
      return;
    }
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
    checkBtn.hide();
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

    if (_simplifiedXX && count > 0) {
      repairBtn.show();
    } else {
      repairBtn.hide();
    }
  }
}

utils.inherit(RepairControl, EventDispatcher);
