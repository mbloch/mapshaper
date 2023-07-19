
import { roundToSignificantDigits } from '../geom/mapshaper-rounding';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { convertAreaParam, getAreaLabel } from '../geom/mapshaper-units';
import geom from '../geom/mapshaper-geom';
import { forEachSegmentInPath } from '../paths/mapshaper-path-utils';
import { editShapes } from '../paths/mapshaper-shape-utils';
import { error } from '../utils/mapshaper-logging';

// Used by -clean -dissolve2 -filter-slivers -filter-islands to generate area filters
// for removing small polygon rings.
// Assumes lyr is a polygon layer.
export function getSliverFilter(lyr, dataset, opts) {
  var areaArg = opts.min_gap_area || opts.min_area || opts.gap_fill_area;
  if (+areaArg == 0) {
    return {
      filter: function() {return false;}, // don't fill any gaps
      threshold: 0
    };
  }
  var sliverControl = opts.sliver_control >= 0 ? opts.sliver_control : 0; // 0 is default
  var crs = getDatasetCRS(dataset);
  var threshold = areaArg && areaArg != 'auto' ?
      convertAreaParam(areaArg, crs) :
      getDefaultSliverThreshold(lyr, dataset.arcs);
  var filter = sliverControl > 0 ?
      getSliverTest(dataset.arcs, threshold, sliverControl) :
      getMinAreaTest(threshold, dataset);
  var label = getSliverLabel(getAreaLabel(threshold, crs), sliverControl > 0);
  return {
    threshold: threshold,
    filter: filter,
    label: label
  };
}

function getSliverLabel(areaStr, variable) {
  if (variable) {
    areaStr = areaStr.replace(' ', '+ ') + ' variable';
  }
  return areaStr + ' threshold';
}

function getMinAreaTest(minArea, dataset) {
  var pathArea = dataset.arcs.isPlanar() ? geom.getPlanarPathArea : geom.getSphericalPathArea;
  return function(path) {
    var area = pathArea(path, dataset.arcs);
    return Math.abs(area) < minArea;
  };
}

export function getSliverTest(arcs, threshold, strength) {
  if (strength >= 0 === false) {
    strength = 1; // default is 1 (full-strength)
  }
  if (strength > 1 || threshold >= 0 === false) {
    error('Invalid parameter');
  }
  var calcEffectiveArea = getSliverAreaFunction(arcs, strength);
  return function(ring) {
    return Math.abs(calcEffectiveArea(ring)) < threshold;
  };
}

// Strength: 0-1
export function getSliverAreaFunction(arcs, strength) {
  var k = Math.sqrt(strength); // more sensible than linear weighted avg.
  return function(ring) {
    var area = geom.getPathArea(ring, arcs);
    var perim = geom.getPathPerimeter(ring, arcs);
    var compactness = geom.calcPolsbyPopperCompactness(area, perim);
    var effectiveArea = area * (k * compactness + 1 - k);
    return effectiveArea;
  };
}

// Calculate a default area threshold using average segment length,
// but increase the threshold for high-detail datasets and decrease it for
// low-detail datasets (using segments per ring as a measure of detail).
//
export function getDefaultSliverThreshold(lyr, arcs) {
  var ringCount = 0;
  var calcLen = arcs.isPlanar() ? geom.distance2D : geom.greatCircleDistance;
  var avgSegLen = 0;
  var segCount = 0;
  var onSeg = function(i, j, xx, yy) {
    var len = calcLen(xx[i], yy[i], xx[j], yy[j]);
    segCount++;
    avgSegLen += (len - avgSegLen) / segCount;
  };
  editShapes(lyr.shapes, function(path) {
    ringCount++;
    forEachSegmentInPath(path, arcs, onSeg);
  });
  var segPerRing = segCount / ringCount || 0;
  var complexityFactor = Math.pow(segPerRing, 0.75); // use seg/ring as a proxy for complexity
  var threshold = avgSegLen * avgSegLen / 50 * complexityFactor;
  threshold = roundToSignificantDigits(threshold, 2); // round for display
  return threshold;
}


// Original function for calculating default area threshold
export function calcMaxSliverArea(arcs) {
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
}
