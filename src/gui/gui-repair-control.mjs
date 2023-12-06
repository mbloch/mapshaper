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
      _disabled = false;

  gui.on('simplify_drag_start', function() {
    if (intersectionsAreOn()) {
      hide();
    }
  });

  gui.on('simplify_drag_end', function() {
    updateAsync();
  });

  checkBtn.on('click', function() {
    checkBtn.hide();
    refreshSync();
  });

  repairBtn.on('click', function() {
    var e = model.getActiveLayer();
    if (!_simplifiedXX || !e.dataset.arcs) return;
    var xx = _simplifiedXX = internal.repairIntersections(e.dataset.arcs, _simplifiedXX);
    showIntersections(xx, e.layer, e.dataset.arcs);
    repairBtn.hide();
    model.updated({repair: true});
    gui.session.simplificationRepair();
  });

  model.on('update', function(e) {
    if (!intersectionsAreOn()) {
      reset(); // need this?
      return;
    }
    var needRefresh = e.flags.simplify_method || e.flags.simplify || e.flags.repair;
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
    return !!(_simplifiedXX || _unsimplifiedXX);
  }

  function clearSavedData() {
    _simplifiedXX = null;
    _unsimplifiedXX = null;
  }

  function reset() {
    clearSavedData();
    hide();
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
    clearSavedData();
    hide();
  }

  function hide() {
    map.setIntersectionLayer(null);
    el.hide();
  }

  // Update intersection display, after a short delay so map can redraw after previous
  // operation (e.g. simplification change)
  function updateAsync() {
    if (intersectionsAreOn()) {
      setTimeout(refreshSync, 10);
    }
  }

  function refreshSync() {
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
      _simplifiedXX = internal.findSegmentIntersections(arcs, intersectionOpts);
    } else {
      // no simplification
      _simplifiedXX = null; // clear old simplified XX
      if (!_unsimplifiedXX) {
        // save intersections at 0 simplification, to avoid recalculating
        // every time the simplification slider is set to 100% or the layer is selected at 100%
        _unsimplifiedXX = internal.findSegmentIntersections(arcs, intersectionOpts);
      }
    }
    showIntersections(_simplifiedXX || _unsimplifiedXX, e.layer, arcs);
  }

  function showIntersections(xx, lyr, arcs) {
    var pointLyr, count = 0;
    el.show();
    readout.show();
    checkBtn.hide();
    if (xx.length > 0) {
      pointLyr = internal.getIntersectionLayer(xx, lyr, arcs);
      count = internal.countPointsInLayer(pointLyr);
    }
    if (count == 0) {
      map.setIntersectionLayer(null);
      readout.html('<span class="icon black"></span>No self-intersections');
    } else {
      map.setIntersectionLayer(pointLyr, {layers:[pointLyr]});
      readout.html(utils.format('<span class="icon"></span>%s line intersection%s <img class="close-btn" src="images/close.png">', count, utils.pluralSuffix(count)));
      readout.findChild('.close-btn').on('click', dismissForever);
    }
    if (_simplifiedXX && count > 0) {
      repairBtn.show();
    } else {
      repairBtn.hide();
    }
  }
}

utils.inherit(RepairControl, EventDispatcher);
