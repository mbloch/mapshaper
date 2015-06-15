/* @requires mapshaper-common, mapshaper-repair */

function RepairControl(map, arcData) {
  var el = El("#g-intersection-display").show(),
      readout = el.findChild("#g-intersection-count"),
      btn = el.findChild("#g-repair-btn");

  var _initialXX,
      _currXX,
      _pointLyr = {geometry_type: "point", shapes: []},
      _displayGroup = new LayerGroup({layers:[_pointLyr]});

  map.addLayerGroup(_displayGroup);

  this.update = function(pct) {
    var XX, showBtn;
    if (pct >= 1) {
      if (!_initialXX) {
        _initialXX = MapShaper.findSegmentIntersections(arcData);
      }
      XX = _initialXX;
      showBtn = false;
    } else {
      XX = MapShaper.findSegmentIntersections(arcData);
      showBtn = XX.length > 0;
    }
    showIntersections(XX);
    btn.classed('disabled', !showBtn);
  };

  this.update(1); // initialize at 100%

  btn.on('click', function() {
    T.start();
    var fixed = MapShaper.repairIntersections(arcData, _currXX);
    T.stop('Fix intersections');
    btn.addClass('disabled');
    showIntersections(fixed);
    this.dispatchEvent('repair');
  }, this);

  this.clear = function() {
    _currXX = null;
    _displayGroup.hide();
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
