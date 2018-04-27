/* @requires mapshaper-gui-lib */

function RepairControl(model, map) {
  var el = El("#intersection-display"),
      readout = el.findChild("#intersection-count"),
      btn = el.findChild("#repair-btn"),
      _self = this,
      _dataset, _currXX;

  gui.on('mode', function(e) {
    // TODO: handle visibility in simplify mode, when control has been turned off
  });

  model.on('update', function(e) {
    if (e.flags.simplify || e.flags.proj || e.flags.arc_count ||e.flags.affine ||
      e.flags.points) {
      // these changes require nulling out any cached intersection data and recalculating
      if (_dataset) {
        _dataset.info.intersections = null;
        _dataset = null;
        _self.hide();
      }
      delayedUpdate();
    } else if (e.flags.select) {
      _self.hide();
      reset();
      delayedUpdate();
    }
  });

  btn.on('click', function() {
    var fixed = internal.repairIntersections(_dataset.arcs, _currXX);
    showIntersections(fixed);
    btn.addClass('disabled');
    model.updated({repair: true});
  });

  this.hide = function() {
    el.hide();
    map.setHighlightLayer(null);
  };

  // Detect and display intersections for current level of arc simplification
  this.update = function() {
    var XX, showBtn, pct;
    if (!_dataset) return;
    if (_dataset.arcs.getRetainedInterval() > 0) {
      // TODO: cache these intersections
      XX = internal.findSegmentIntersections(_dataset.arcs);
      showBtn = XX.length > 0;
    } else { // no simplification
      XX = _dataset.info.intersections;
      if (!XX) {
        // cache intersections at 0 simplification, to avoid recalculating
        // every time the simplification slider is set to 100% or the layer is selected at 100%
        XX = _dataset.info.intersections = internal.findSegmentIntersections(_dataset.arcs);
      }
      showBtn = false;
    }
    el.show();
    showIntersections(XX);
    btn.classed('disabled', !showBtn);
  };

  function updateNeeded(dataset) {
    var info = dataset.info || {};
    var opts = info.import_options || {};
    return !opts.no_repair && !info.no_intersections;
  }

  function delayedUpdate() {
    // Delay intersection calculation, so map display can update after previous
    // operation (e.g. layer load, simplification change)
    setTimeout(function() {
      var e = model.getActiveLayer();
      if (!e.dataset || e.dataset == _dataset) return;
      if (!internal.layerHasPaths(e.layer)) return;
      if (updateNeeded(e.dataset)) {
        _dataset = e.dataset;
        _self.update();
      }
    }, 10);
  }

  function reset() {
    _dataset = null;
    _currXX = null;
    _self.hide();
  }

  function dismiss() {
    if (_dataset) {
      _dataset.info.intersections = null;
      _dataset.info.no_intersections = true;
    }
    reset();
  }

  function showIntersections(XX) {
    var n = XX.length, pointLyr;
    _currXX = XX;
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
