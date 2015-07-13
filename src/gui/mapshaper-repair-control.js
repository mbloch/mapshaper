/* @requires mapshaper-common, mapshaper-repair */

function RepairControl(map) {
  var el = El("#g-intersection-display"),
      readout = el.findChild("#g-intersection-count"),
      btn = el.findChild("#g-repair-btn"),
      _self = this,
      _dataset, _currXX, _initialXX;

  this.setDataset = function(dataset) {
    _dataset = dataset.arcs ? dataset : null;
  };

  this.reset = function() {
    _currXX = null;
    _initialXX = null;
    this.hide();
  };

  this.hide = function() {
    el.hide();
    map.setHighlightLayer(null);
  };

  this.delayedUpdate = function(ms) {
    setTimeout(function() {
      _self.update();
    }, ms || 10);
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

  btn.on('click', function() {
    T.start();
    var fixed = MapShaper.repairIntersections(_dataset.arcs, _currXX);
    T.stop('Fix intersections');
    btn.addClass('disabled');
    showIntersections(fixed);
    _self.dispatchEvent('repair');
  });

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
