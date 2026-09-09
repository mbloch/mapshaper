
import { roundToSignificantDigits } from '../geom/mapshaper-rounding';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { convertAreaParam, convertDistanceParam, getAreaLabel } from '../geom/mapshaper-units';
import { fastLonLatDistance, distance2D } from '../geom/mapshaper-basic-geom';
import geom from '../geom/mapshaper-geom';
import { forEachSegmentInPath } from '../paths/mapshaper-path-utils';
import { editShapes } from '../paths/mapshaper-shape-utils';
import { error } from '../utils/mapshaper-logging';

// Conservative width as a fraction of the layer's median polygon-ring segment
// length. Used for partition min-width and duplicate-boundary search — not for
// the default gap-width=auto fill threshold (see getDefaultGapWidth).
export var GAP_WIDTH_SEGMENT_FRACTION = 0.01;

// Inject gap_width=auto unless the caller already chose a width or a legacy
// area/sliver option. Used by -clean, -filter-slivers, and gap partition.
export function applyDefaultGapWidthOpts(opts) {
  opts = Object.assign({}, opts);
  if (opts.gap_width != null) return opts;
  // Legacy area/sliver options: keep the historical gap_fill_area=auto default.
  if (opts.gap_fill_area != null || opts.min_gap_area != null ||
      opts.min_area != null || opts.sliver_control != null) {
    if (opts.gap_fill_area == null && opts.min_gap_area == null &&
        opts.min_area == null) {
      opts.gap_fill_area = 'auto';
    }
    return opts;
  }
  opts.gap_width = 'auto';
  return opts;
}

// Used by -clean -dissolve -filter-slivers -filter-islands to generate filters
// for removing small polygon rings / filling mosaic gaps.
// Prefers gap_width= (including 'auto'). Legacy gap_fill_area / sliver_control
// remain for compatibility when gap_width is not set.
export function getSliverFilter(lyr, dataset, opts) {
  opts = opts || {};
  if (opts.gap_width != null) {
    return getGapWidthFilter(lyr, dataset, opts);
  }
  return getLegacyAreaFilter(lyr, dataset, opts);
}

function getGapWidthFilter(lyr, dataset, opts) {
  var crs = getDatasetCRS(dataset);
  var widthArg = opts.gap_width;
  if (+widthArg === 0) {
    return {
      filter: function() { return false; },
      threshold: 0,
      label: '0 width threshold'
    };
  }
  var threshold = (widthArg === 'auto') ?
    getDefaultGapWidth(lyr, dataset.arcs) :
    convertDistanceParam(widthArg, crs);
  var filter = getGapWidthTest(dataset.arcs, threshold);
  if (opts.keep_shapes) {
    filter = keepShapes(filter);
  }
  return {
    threshold: threshold,
    filter: filter,
    label: getGapWidthLabel(threshold, crs)
  };
}

function getLegacyAreaFilter(lyr, dataset, opts) {
  var areaArg = opts.min_gap_area || opts.min_area || opts.gap_fill_area;
  if (+areaArg == 0) {
    return {
      filter: function() {return false;}, // don't fill any gaps
      threshold: 0
    };
  }
  var sliverControl = opts.sliver_control >= 0 ? opts.sliver_control : 0;
  var crs = getDatasetCRS(dataset);
  var threshold = areaArg && areaArg != 'auto' ?
      convertAreaParam(areaArg, crs) :
      getDefaultSliverThreshold(lyr, dataset.arcs);
  var filter = sliverControl > 0 ?
      getSliverTest(dataset.arcs, threshold, sliverControl) :
      getMinAreaTest(threshold, dataset);
  var label = getSliverLabel(getAreaLabel(threshold, crs), sliverControl > 0);
  if (opts.keep_shapes) {
    filter = keepShapes(filter);
  }
  return {
    threshold: threshold,
    filter: filter,
    label: label
  };
}

// wrap path filter in a function that ensures at least one part of every shape
// is retained.
function keepShapes(filter) {
  var flags;
  return function(path, pathId, paths) {
    if (pathId === 0) {
      flags = paths.map(path => filter(path));
    }
    if (flags.length > 0 && flags.every(Boolean)) {
      // kludge ... assumes that the first path is a valid ring (e.g. not a)
      flags[0] = false;
    }
    return flags[pathId];
  };
}

function getSliverLabel(areaStr, variable) {
  if (variable) {
    areaStr = areaStr.replace(' ', '+ ') + ' variable';
  }
  return areaStr + ' threshold';
}

export function getGapWidthLabel(width, crs) {
  var meters = width;
  if (crs && crs.to_meter > 0 && !crs.is_latlong) {
    meters = width * crs.to_meter;
  }
  if (crs && (crs.is_latlong || crs.to_meter > 0)) {
    if (meters < 1) return roundToSignificantDigits(meters * 1000, 2) + 'mm width threshold';
    if (meters < 1000) return roundToSignificantDigits(meters, 2) + 'm width threshold';
    return roundToSignificantDigits(meters / 1000, 2) + 'km width threshold';
  }
  return roundToSignificantDigits(width, 2) + ' width threshold';
}

function getMinAreaTest(minArea, dataset) {
  var pathArea = dataset.arcs.isPlanar() ? geom.getPlanarPathArea : geom.getSphericalPathArea;
  return function(path) {
    var area = pathArea(path, dataset.arcs);
    return Math.abs(area) < minArea;
  };
}

// Fill when characteristic width 2A/P is below the threshold. Equivalent to
// the old sliver-control=1 effective-area test when threshold = sqrt(A0/π).
export function getGapWidthTest(arcs, maxWidth) {
  var pathArea = arcs.isPlanar() ? geom.getPlanarPathArea : geom.getSphericalPathArea;
  var pathPerim = arcs.isPlanar() ? geom.getPlanarPathPerimeter : geom.getSphericalPathPerimeter;
  return function(ring) {
    var area = Math.abs(pathArea(ring, arcs));
    var perim = pathPerim(ring, arcs);
    if (!(perim > 0)) return false;
    return 2 * area / perim < maxWidth;
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

// Width equivalent of the legacy gap-fill-area=auto + sliver-control=1 test:
// W = sqrt(A0 / π). The two filters accept the same rings (see getGapWidthTest).
export function getDefaultGapWidth(lyr, arcs) {
  return Math.sqrt(getDefaultSliverThreshold(lyr, arcs) / Math.PI);
}

export function getMedianPolygonSegmentLength(lyr, arcs) {
  var lengths = collectPolygonSegmentLengths(lyr, arcs);
  if (lengths.length === 0) return 0;
  lengths.sort(); // numeric sort: lengths is a Float64Array
  return lengths[Math.floor(lengths.length / 2)];
}

// Returns a Float64Array, so that the median can use a comparator-free numeric
// sort. This measures every segment of every polygon ring, so on a detailed
// mosaic the sort dominates.
function collectPolygonSegmentLengths(lyr, arcs) {
  var lengths = new Float64Array(1024);
  var n = 0;
  var calcLen = arcs.isPlanar() ? distance2D : fastLonLatDistance;
  var onSeg = function(i, j, xx, yy) {
    var len = calcLen(xx[i], yy[i], xx[j], yy[j]);
    if (len > 0 && isFinite(len)) {
      if (n === lengths.length) {
        var grown = new Float64Array(n * 2);
        grown.set(lengths);
        lengths = grown;
      }
      lengths[n++] = len;
    }
  };
  editShapes(lyr.shapes, function(path) {
    forEachSegmentInPath(path, arcs, onSeg);
  });
  return lengths.subarray(0, n);
}

// Calculate a default area threshold using average segment length,
// but increase the threshold for high-detail datasets and decrease it for
// low-detail datasets (using segments per ring as a measure of detail).
// Kept for legacy gap_fill_area=auto.
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
