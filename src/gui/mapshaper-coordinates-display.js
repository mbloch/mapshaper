function CoordinatesDisplay(gui, ext, mouse) {
  var readout = gui.container.findChild('.coordinate-info').hide();
  var enabled = false;
  var bboxPoint;

  gui.model.on('select', function(e) {
    enabled = !!e.layer.geometry_type; // no display on tabular layers
    readout.hide();
  });

  readout.on('copy', function(e) {
    // remove selection on copy (using timeout or else copy is cancelled)
    setTimeout(function() {
      getSelection().removeAllRanges();
    }, 50);
    // don't display bounding box if user copies coords
    bboxPoint = null;
  });

  ext.on('change', function() {
    clearCoords();
    // shapes may change along with map scale
    // target = lyr ? lyr.getDisplayLayer() : null;
  });

  mouse.on('leave', clearCoords);

  mouse.on('click', function(e) {
    if (!enabled) return;
    GUI.selectElement(readout.node());
    // TODO: don't save bbox point when inspector is active
    // clear bbox point if already present
    bboxPoint = bboxPoint ? null : ext.translatePixelCoords(e.x, e.y);
  });

  mouse.on('hover', function(e) {
    if (!enabled) return;
    if (isOverMap(e)) {
      displayCoords(ext.translatePixelCoords(e.x, e.y));
    } else {
      clearCoords();
    }
  });

  function displayCoords(p) {
    var decimals = getCoordPrecision(ext.getBounds());
    var coords = bboxPoint ? getBbox(p, bboxPoint) : p;
    var str = coords.map(function(n) {return n.toFixed(decimals);}).join(',');
    readout.text(str).show();
  }

  function clearCoords() {
    bboxPoint = null;
    readout.hide();
  }

  function isOverMap(e) {
    return e.x >= 0 && e.y >= 0 && e.x < ext.width() && e.y < ext.height();
  }

  function getBbox(a, b) {
    return [
      Math.min(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.max(a[0], b[0]),
      Math.max(a[1], b[1])
    ];
  }

  function getCoordPrecision(bounds) {
    var range = Math.min(bounds.width(), bounds.height()) + 1e-8;
    var digits = 0;
    while (range < 2000) {
      range *= 10;
      digits++;
    }
    return digits;
  }
}
