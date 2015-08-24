/* @requires mapshaper-common, mapshaper-repair */

function RepairControl(model, map) {
  var el = El("#intersection-display"),
      readout = el.findChild("#intersection-count"),
      btn = el.findChild("#repair-btn"),
      _self = this,
      _dataset, _currXX;

  model.on('update', function(e) {
    if (e.flags.simplify || e.flags.proj || e.flags.arc_count) {
      // these changes require nulling out any cached intersection data and recalculating
      if (_dataset) {
        _dataset.info.intersections = null;
        _dataset = null;
        _self.hide();
      }
      delayedUpdate();
    } else if (e.flags.select && !e.flags.import) {
      // Don't update if a dataset was just imported -- another layer may be
      // selected right away.
      reset();
      delayedUpdate();
    }
  });

  model.on('mode', function(e) {
    if (e.prev == 'import') {
      // update if import just finished and a new dataset is being edited
      delayedUpdate();
    }
  });

  btn.on('click', function() {
    var fixed = MapShaper.repairIntersections(_dataset.arcs, _currXX);
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
      XX = MapShaper.findSegmentIntersections(_dataset.arcs);
      showBtn = XX.length > 0;
    } else { // no simplification
      XX = _dataset.info.intersections;
      if (!XX) {
        // cache intersections at 0 simplification, to avoid recalculating
        // every time the simplification slider is set to 100% or the layer is selected at 100%
        XX = _dataset.info.intersections = MapShaper.findSegmentIntersections(_dataset.arcs);
      }
      showBtn = false;
    }
    el.show();
    showIntersections(XX);
    btn.classed('disabled', !showBtn);
  };

  function delayedUpdate() {
    setTimeout(function() {
      var e = model.getEditingLayer();
      if (e.dataset && e.dataset != _dataset && !e.dataset.info.no_repair &&
          MapShaper.layerHasPaths(e.layer)) {
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

  function showIntersections(XX) {
    var n = XX.length, pointLyr;
    _currXX = XX;
    if (n > 0) {
      pointLyr = {geometry_type: 'point', shapes: [MapShaper.getIntersectionPoints(XX)]};
      map.setHighlightLayer(pointLyr, {layers:[pointLyr]});
      readout.text(utils.format("%s line intersection%s", n, utils.pluralSuffix(n)));
    } else {
      map.setHighlightLayer(null);
      readout.text('');
    }
  }
}

utils.inherit(RepairControl, EventDispatcher);
