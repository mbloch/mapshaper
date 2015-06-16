/* @requires mapshaper-common, mapshaper-repair */

function RepairControl(map) {
  var el = El("#g-intersection-display"),
      readout = el.findChild("#g-intersection-count"),
      btn = el.findChild("#g-repair-btn"),
      _pointLyr = {geometry_type: "point", shapes: []},
      _dataset, _currXX, _displayGroup;

  this.setDataset = function(dataset) {
    _dataset = dataset.arcs ? dataset : null;
    this.clear();
  };

  this.show = function() {
    el.show();
  };

  this.hide = function() {
    this.clear();
    el.hide();
  };

  this.reset = function() {
    this.hide();
    this.removeEventListeners();
  };

  // Display intersections for dataset's current level of arc simplification
  this.update = function() {
    var XX, showBtn, pct;
    if (!_dataset) return;
    if (!_displayGroup) {
      _displayGroup = map.addLayer({layers:[_pointLyr]});
    }

    if (_dataset.arcs.getRetainedInterval() > 0) {
      XX = MapShaper.findSegmentIntersections(_dataset.arcs);
      showBtn = XX.length > 0;
    } else { // no simplification
      if (!_dataset.info.repair) {
        _dataset.info.repair = {
          initialXX: MapShaper.findSegmentIntersections(_dataset.arcs)
        };
      }
      XX = _dataset.info.repair.initialXX;
      showBtn = false;
    }
    showIntersections(XX);
    btn.classed('disabled', !showBtn);
  };

  btn.on('click', function() {
    T.start();
    var fixed = MapShaper.repairIntersections(_dataset.arcs, _currXX);
    T.stop('Fix intersections');
    btn.addClass('disabled');
    showIntersections(fixed);
    this.dispatchEvent('repair');
  }, this);

  this.clear = function() {
    _currXX = null;
    if (_displayGroup) _displayGroup.hide();
  };

  function showIntersections(XX) {
    var n = XX.length;
    if (n === 0) {
      _displayGroup.hide();
    } else {
      _pointLyr.shapes[0] = MapShaper.getIntersectionPoints(XX);
      _displayGroup
        .showLayer(_pointLyr)
        .setStyle({
          dotSize: n < 20 && 5 || n < 500 && 4 || 3,
          squareDot: true,
          dotColor: "#F24400"
        })
        .refresh();
    }
    var msg = utils.format("%s line intersection%s", n, n != 1 ? 's' : '');
    readout.text(msg);
    _currXX = XX;
  }
}

Opts.inherit(RepairControl, EventDispatcher);
