/* @requires mapshaper-common, mapshaper-repair */

function RepairControl(map, lineLyr, arcData) {
  var el = El("#g-intersection-display").show(),
      readout = el.findChild("#g-intersection-count"),
      btn = el.findChild("#g-repair-btn");

  var _enabled = false,
      _initialXX,
      _currXX,
      _pointColl,
      _pointLyr;

  this.update = function(pct) {
    var XX;
    T.start();
    if (pct >= 1) {
      if (!_initialXX) {
        _initialXX = MapShaper.findSegmentIntersections(arcData);
      }
      XX = _initialXX;
      enabled(false);
    } else {
      XX = MapShaper.findSegmentIntersections(arcData);
      enabled(XX.length > 0);
    }
    showIntersections(XX);
    T.stop("Find intersections");
  };

  this.update(1); // initialize at 100%

  btn.on('click', function() {
    if (!enabled()) return;
    T.start();
    var fixed = MapShaper.repairIntersections(arcData, _currXX);
    T.stop('Fix intersections');
    enabled(false);
    showIntersections(fixed);
    lineLyr.refresh();
  });

  this.clear = function() {
    _currXX = null;
    _pointLyr.visible(false);
  };

  function showIntersections(XX) {
    var dotSize = getDotSize(XX.length);
    var points = MapShaper.getIntersectionPoints(XX);
    if (!_pointLyr) {
      _pointColl = new FilteredPathCollection(points, {
        min_segment: 0,
        min_path: 0
      });
      _pointLyr = new ArcLayerGroup(_pointColl, {
        dotSize: dotSize,
        squareDot: true,
        dotColor: "#F24400"
      });
      map.addLayerGroup(_pointLyr);
    } else if (XX.length > 0) {
      _pointColl.update(points);
      _pointLyr.visible(true);
      _pointLyr.refresh({dotSize: dotSize});
    } else{
      _pointLyr.visible(false);
    }
    var msg = Utils.format("%s line intersection%s", XX.length, XX.length != 1 ? 's' : '');
    readout.text(msg);
    _currXX = XX;
  }

  function getDotSize(n) {
    return n < 500 ? 4 : 3;
  }

  function enabled(b) {
    if (arguments.length === 0) return _enabled;
    _enabled = !!b;
    if (b) {
      btn.removeClass('disabled');
    } else {
      btn.addClass('disabled');
    }
  }
}
