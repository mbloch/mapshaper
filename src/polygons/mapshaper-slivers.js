/* @requires mapshaper-polygon-geom */


// Assumes lyr is a polygon layer
internal.getSliverFilter = function(lyr, dataset, opts) {
  var areaArg = opts.min_gap_area || opts.min_area || opts.gap_fill_area;
  if (+areaArg == 0) {
    return {
      filter: function() {return false;}, // don't fill any gaps
      threshold: 0
    };
  }
  var sliverControl = opts.sliver_control >= 0 ? opts.sliver_control : 0; // 0 is default
  var crs = internal.getDatasetCRS(dataset);
  var threshold = areaArg ?
      internal.convertAreaParam(areaArg, crs) :
      internal.getDefaultSliverThreshold(lyr, dataset.arcs);
  var filter = sliverControl > 0 ?
      internal.getSliverTest(lyr, dataset.arcs, threshold, sliverControl) :
      internal.getMinAreaTest(threshold, dataset);
  var label = internal.getSliverLabel(internal.getAreaLabel(threshold, crs), sliverControl > 0);
  return {
    threshold: threshold,
    filter: filter,
    label: label
  };
};

internal.getSliverLabel = function(areaStr, variable) {
  if (variable) {
    areaStr = areaStr.replace(' ', '+ ') + ' variable';
  }
  return areaStr + ' threshold';
};

internal.getMinAreaTest = function(minArea, dataset) {
  var pathArea = dataset.arcs.isPlanar() ? geom.getPlanarPathArea : geom.getSphericalPathArea;
  return function(path) {
    var area = pathArea(path, dataset.arcs);
    return Math.abs(area) < minArea;
  };
};

internal.getSliverTest = function(lyr, arcs, threshold, strength) {
  if (strength >= 0 === false) {
    strength = 1; // default is 1 (full-strength)
  }
  if (strength > 1 || threshold > 0 === false) {
    error('Invalid parameter');
  }
  var k = Math.sqrt(strength); // more sensible than linear weighted avg.
  return function(ring) {
    var area = geom.getPathArea(ring, arcs);
    var perim = geom.getPathPerimeter(ring, arcs);
    var compactness = geom.calcPolsbyPopperCompactness(area, perim);
    var effectiveArea = area * (k * compactness + 1 - k);
    return Math.abs(effectiveArea) < threshold;
  };
};

internal.getDefaultSliverThreshold = function(lyr, arcs) {
  var ringCount = 0;
  var calcLen = arcs.isPlanar() ? geom.distance2D : geom.greatCircleDistance;
  var avgSegLen = 0;
  var segCount = 0;
  internal.editShapes(lyr.shapes, function(path) {
    ringCount++;
    internal.forEachSegmentInPath(path, arcs, onSeg);
  });
  var segPerRing = segCount / ringCount;
  var complexityFactor = Math.pow(segPerRing, 0.75) / 50;
  var threshold = avgSegLen * avgSegLen * complexityFactor;
  // Base the area threshold on average segment length, but increase the threshold for high-detail datasets
  // and decrease it for low-detail datasets (using segments per ring as a measure of detail).
  // round for display
  threshold = utils.roundToSignificantDigits(threshold, 2);
  return threshold;
  function onSeg(i, j, xx, yy) {
    var len = calcLen(xx[i], yy[i], xx[j], yy[j]);
    segCount++;
    avgSegLen += (len - avgSegLen) / segCount;
  }
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
