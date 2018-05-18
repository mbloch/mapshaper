/* @requires mapshaper-gui-lib */

function RepairControl(model, map) {
  var el = El("#intersection-display"),
      readout = el.findChild("#intersection-count"),
      repairBtn = el.findChild("#repair-btn"),
      _prevFlags,
      // keeping a reference to current arcs and intersections, so intersections
      // don't need to be recalculated before 'repair' is triggered
      _currArcs,
      _currXX;

  model.on('update', function(e) {
    var flags = e.flags;
    var needUpdate = flags.simplify || flags.proj || flags.arc_count ||
        flags.affine || flags.points || flags['merge-layers'] || flags.select;
    if (flags.simplify_slider) {
      // hide while sliding; wait for 'simplify' flag before updating
      hide();
    } else if (needUpdate) {
      // some changes require deleting any cached intersection data and recalculating
      if (flags.select || flags.simplify && _prevFlags.simplify_slider) {
        // preserve cached intersections
      } else {
        e.dataset.info.intersections = null;
      }
      updateAsync();
    }
    _prevFlags = flags;
  });

  repairBtn.on('click', function() {
    var fixed = internal.repairIntersections(_currArcs, _currXX);
    showIntersections(fixed, _currArcs);
    repairBtn.addClass('disabled');
    model.updated({repair: true});
  });

  function hide() {
    el.hide();
    map.setHighlightLayer(null);
  }

  function updatesRequested(dataset) {
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
    if (!arcs || !internal.layerHasPaths(e.layer) || !updatesRequested(dataset)) return;
    if (arcs.getRetainedInterval() > 0) {
      // TODO: cache these intersections
      XX = internal.findSegmentIntersections(arcs);
      showBtn = XX.length > 0;
    } else { // no simplification
      XX = dataset.info.intersections;
      if (!XX) {
        // cache intersections at 0 simplification, to avoid recalculating
        // every time the simplification slider is set to 100% or the layer is selected at 100%
        XX = dataset.info.intersections = internal.findSegmentIntersections(arcs);
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
      pointLyr = {geometry_type: 'point', shapes: [internal.getIntersectionPoints(XX)]};
      map.setHighlightLayer(pointLyr, {layers:[pointLyr]});
      readout.html(utils.format('<span class="icon"></span>%s line intersection%s <img class="close-btn" src="images/close.png">', n, utils.pluralSuffix(n)));
      readout.findChild('.close-btn').on('click', dismiss);
    } else {
      map.setHighlightLayer(null);
      readout.html('');
    }
  }
}

utils.inherit(RepairControl, EventDispatcher);
