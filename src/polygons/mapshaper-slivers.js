/* @requires mapshaper-polygon-geom */

// This test underweights rings that are less compact
// It uses a compromise metric that may not detect enough gaps in some datasets
// and may be too aggressive in others
internal.getSliverTest2 = function(lyr, arcs) {
  var values = [];
  var compactness = geom.calcPolsbyPopperCompactness; // geom.calcSchwartzbergCompactness //
  internal.editShapes(lyr.shapes, function(path) {
    var val = geom.getPathArea(path, arcs);
    if (val > 0) values.push(val);
  });
  utils.genericSort(values, true);
  var n = Math.floor(Math.pow(values.length, 0.6) - 1);
  var nth = values[n];
  var threshold = nth / 10;
  // console.log("values:", values.length, "n:", n, "thresh:", threshold, 'nth:', nth, 'smallest:', values[0])

  return function(ring) {
    var area = geom.getPathArea(ring, arcs);
    var val = internal.getCompactnessAdjustedPathArea(ring, arcs, compactness);
    return val < threshold;
  };
};


internal.getCompactnessAdjustedPathArea = function(path, arcs, calcCompactness) {
  var area = geom.getPathArea(path, arcs);
  var perim = geom.getPathPerimeter(path, arcs);
  var compactness = calcCompactness(area, perim);
  return Math.abs(area * compactness);
};


// This test relies on segment length, which can cause relative large-area rings
// to be identified as slivers in layers that contain segments that are long relative
// to polygon area.
internal.getSliverTest = function(arcs) {
  var maxSliverArea = internal.calcMaxSliverArea(arcs);
  return function(path) {
    // TODO: more sophisticated metric, perhaps considering shape
    var area = geom.getPlanarPathArea(path, arcs);
    return Math.abs(area) <= maxSliverArea;
  };
};

// Calculate an area threshold based on the average segment length,
// but disregarding very long segments (i.e. bounding boxes)
// TODO: need something more reliable
// consider: calculating the distribution of segment lengths in one pass
//
internal.calcMaxSliverArea = function(arcs) {
  var k = 2,
      dxMax = arcs.getBounds().width() / k,
      dyMax = arcs.getBounds().height() / k,
      count = 0,
      mean = 0;
  arcs.forEachSegment(function(i, j, xx, yy) {
    var dx = Math.abs(xx[i] - xx[j]),
        dy = Math.abs(yy[i] - yy[j]);
    if (dx < dxMax && dy < dyMax) {
      // TODO: write utility function for calculating mean this way
      mean += (Math.sqrt(dx * dx + dy * dy) - mean) / ++count;
    }
  });
  return mean * mean;
};