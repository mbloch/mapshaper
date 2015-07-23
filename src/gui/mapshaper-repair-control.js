/* @requires mapshaper-common, mapshaper-repair */

function RepairControl(model, map) {
  var el = El("#intersection-display"),
      readout = el.findChild("#intersection-count"),
      btn = el.findChild("#repair-btn"),
      _self = this,
      _dataset, _currXX, _initialXX;

  model.on('update', function(e) {
    // these changes require nulling out any cached intersection data and recalculating
    if (e.flags.simplify || e.flags.proj || e.flags.select) {
      reset();
      if (!e.dataset.info.no_repair) {
        _dataset = MapShaper.layerHasPaths(e.layer) ? e.dataset : null;
        // use timeout so map refreshes before the repair control calculates
        // intersection data, which can take a little while
        delayedUpdate();
      }
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
      XX = MapShaper.findSegmentIntersections(_dataset.arcs);
      showBtn = XX.length > 0;
    } else { // no simplification
      if (!_initialXX) {
        // cache intersections for no simplification, to avoid recalculating
        // every time the simplification slider is set to 100%
        _initialXX = MapShaper.findSegmentIntersections(_dataset.arcs);
      }
      XX = _initialXX;
      showBtn = false;
    }
    el.show();
    showIntersections(XX);
    btn.classed('disabled', !showBtn);
  };

  function delayedUpdate() {
    setTimeout(function() {
      _self.update();
    }, 10);
  }

  function reset() {
    _dataset = null;
    _currXX = null;
    _initialXX = null;
    _self.hide();
  }

  function showIntersections(XX) {
    var n = XX.length, pointLyr;
    _currXX = XX;
    if (n > 0) {
      pointLyr = {geometry_type: 'point', shapes: [MapShaper.getIntersectionPoints(XX)]};
      map.setHighlightLayer(pointLyr, {layers:[pointLyr]});
    } else {
      map.setHighlightLayer(null);
    }
    readout.text(utils.format("%s line intersection%s", n, utils.pluralSuffix(n)));
  }
}

utils.inherit(RepairControl, EventDispatcher);
