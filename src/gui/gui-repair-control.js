import { utils, internal } from './gui-core';
import { EventDispatcher } from './gui-events';

export function RepairControl(gui) {
  var map = gui.map,
      model = gui.model,
      el = gui.container.findChild(".intersection-display"),
      readout = el.findChild(".intersection-count"),
      repairBtn = el.findChild(".repair-btn"),
      // keeping a reference to current arcs and intersections, so intersections
      // don't need to be recalculated when 'repair' button is pressed.
      _currArcs,
      _currXX;

  gui.on('simplify_drag_start', hide);
  gui.on('simplify_drag_end', updateAsync);

  model.on('update', function(e) {
    var flags = e.flags;
    var needUpdate = flags.simplify || flags.proj || flags.arc_count ||
        flags.affine || flags.points || flags['merge-layers'] || flags.select;
    if (needUpdate) {
      if (flags.select) {
        // preserve cached intersections
      } else {
        // delete any cached intersection data
        e.dataset.info.intersections = null;
      }
      updateAsync();
    }
  });

  repairBtn.on('click', function() {
    var fixed = internal.repairIntersections(_currArcs, _currXX);
    showIntersections(fixed, _currArcs);
    repairBtn.addClass('disabled');
    model.updated({repair: true});
    gui.session.simplificationRepair();
  });

  function hide() {
    el.hide();
    map.setIntersectionLayer(null);
  }

  function enabledForDataset(dataset) {
    var info = dataset.info || {};
    var opts = info.import_options || {};
    return !opts.no_repair && !info.no_intersections;
  }

  // Delay intersection calculation, so map can redraw after previous
  // operation (e.g. layer load, simplification change)
  function updateAsync() {
    reset();
    setTimeout(updateSync, 10);
  }

  function updateSync() {
    var e = model.getActiveLayer();
    var dataset = e.dataset;
    var arcs = dataset && dataset.arcs;
    var XX, showBtn;
    var opts = {
      unique: true,
      tolerance: 0
    };
    if (!arcs || !internal.layerHasPaths(e.layer) || !enabledForDataset(dataset)) return;
    if (arcs.getRetainedInterval() > 0) {
      // TODO: cache these intersections
      XX = internal.findSegmentIntersections(arcs, opts);
      showBtn = XX.length > 0;
    } else { // no simplification
      XX = dataset.info.intersections;
      if (!XX) {
        // cache intersections at 0 simplification, to avoid recalculating
        // every time the simplification slider is set to 100% or the layer is selected at 100%
        XX = dataset.info.intersections = internal.findSegmentIntersections(arcs, opts);
      }
      showBtn = false;
    }
    el.show();
    showIntersections(XX, arcs);
    repairBtn.classed('disabled', !showBtn);
  }

  function reset() {
    _currArcs = null;
    _currXX = null;
    hide();
  }

  function dismiss() {
    var dataset = model.getActiveLayer().dataset;
    dataset.info.intersections = null;
    dataset.info.no_intersections = true;
    reset();
  }

  function showIntersections(XX, arcs) {
    var n = XX.length, pointLyr;
    _currXX = XX;
    _currArcs = arcs;
    if (n > 0) {
      // console.log("first intersection:", internal.getIntersectionDebugData(XX[0], arcs));
      pointLyr = {geometry_type: 'point', shapes: [internal.getIntersectionPoints(XX)]};
      map.setIntersectionLayer(pointLyr, {layers:[pointLyr]});
      readout.html(utils.format('<span class="icon"></span>%s line intersection%s <img class="close-btn" src="images/close.png">', n, utils.pluralSuffix(n)));
      readout.findChild('.close-btn').on('click', dismiss);
    } else {
      map.setIntersectionLayer(null);
      readout.html('');
    }
  }
}

utils.inherit(RepairControl, EventDispatcher);
