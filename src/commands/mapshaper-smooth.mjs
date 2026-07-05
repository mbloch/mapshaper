import { convertIntervalParam, convertDistanceParam } from '../geom/mapshaper-units';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { greatCircleDistance, distance2D } from '../geom/mapshaper-basic-geom';
import { autoCornerBias } from '../smooth/mapshaper-smooth-corners';
import { smoothArcCoords } from '../smooth/mapshaper-smooth-algos';
import { filterDetailPaths } from '../commands/mapshaper-filter-detail';
import { layerHasPaths, getImplicitlyTargetedLayerNames } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import { message, stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

cmd.smooth = function(dataset, opts, targetLayers) {
  var arcs = dataset.arcs;
  if (!arcs || arcs.size() === 0) return;
  opts = opts || {};
  if (opts.distance === undefined || opts.distance === null || opts.distance === '') {
    stop('Missing a smoothing distance');
  }
  var spherical = useSphericalSmooth(arcs, opts);
  var tolerance = convertSmoothTolerance(opts.distance, dataset, spherical);
  if (!(tolerance > 0)) {
    stop('Expected a positive smoothing distance');
  }
  var method = getSmoothMethod(opts);
  if (opts.gain !== undefined && opts.gain !== null && !(opts.gain >= 0)) {
    stop('Expected gain to be a number >= 0');
  }
  if (opts.max_bend_angle !== undefined && opts.max_bend_angle !== null &&
      !(opts.max_bend_angle > 0)) {
    stop('Expected max-bend-angle to be a number > 0 (degrees)');
  }
  if (opts.prefilter_gate !== undefined && opts.prefilter_gate !== null &&
      !(opts.prefilter_gate > 0)) {
    stop('Expected prefilter-gate to be a number > 0');
  }
  if (opts.corner_bias !== undefined && opts.corner_bias !== null &&
      typeof opts.corner_bias != 'number') {
    stop('Expected corner-bias to be a number');
  }
  // Corner preservation is on by default; no-corners turns it off. (corner-bias
  // only tunes sensitivity: 0 is neutral, not off.)
  var keepCorners = !opts.no_corners;
  var implicitlySmoothedNames = getImplicitlyTargetedLayerNames(dataset, targetLayers, layerHasPaths);

  // Smoothing rewrites coordinates, so lock in any pending (non-destructive)
  // simplification first -- otherwise we would smooth the original
  // full-resolution geometry and silently discard the simplification.
  if (!arcs.isFlat()) {
    arcs.flatten();
  }

  // By default, cut intricate sub-scale detail (jetties, narrow inlets, spikes)
  // that the low-pass smoother cannot generalize cleanly -- left in, these tend
  // to produce kinks or self-intersections. The detail scale matches the
  // smoothing distance. Disable with no-prefilter.
  if (!opts.no_prefilter) {
    var before = arcs.getPointCount();
    filterDetailPaths(arcs, {
      distance: tolerance,
      tortuosity: opts.prefilter_gate,
      roundness: opts.prefilter_roundness,
      minRingArea: opts.prefilter_min_area,
      spherical: spherical
    });
    var removed = before - arcs.getPointCount();
    if (removed > 0) {
      message('Prefilter removed ' + removed + ' of ' + before + ' vertices');
    }
  }

  // Corner detection is automatically coarsened on geometry that is sparse
  // relative to the smoothing distance (long segments -> few segments per
  // detection window -> ordinary coarse bends misread as corners; see
  // autoCornerBias). The user's corner-bias is relative to this automatic base:
  // it is added on top, so corner-bias=0 (the default) is "whatever the geometry
  // warrants", a positive value finds more corners than the auto baseline, a
  // negative value fewer.
  var autoBias = 0;
  if (keepCorners) {
    autoBias = autoCornerBias(medianSegmentLength(arcs, spherical), tolerance);
    if (autoBias <= -0.5) {
      // message('Auto corner-bias ' + autoBias.toFixed(1) + ' (geometry is coarse relative to the smoothing distance)');
    }
  }
  var effectiveCornerBias = autoBias + (opts.corner_bias || 0);

  var corners = smoothPaths(arcs, {
    tolerance: tolerance,
    method: method,
    spherical: spherical,
    keepCorners: keepCorners,
    cornerBias: effectiveCornerBias,
    gain: opts.gain,
    strength: opts.strength,
    maxBendAngle: opts.max_bend_angle
  });
  if (keepCorners && corners > 0) {
    message('Pinned ' + corners + ' corner' + utils.pluralSuffix(corners));
  }

  if (implicitlySmoothedNames.length > 0) {
    message(
      'Also smoothed non-target layer' + utils.pluralSuffix(implicitlySmoothedNames.length) +
      ' from the same dataset: ' + implicitlySmoothedNames.join(', ')
    );
  }
};

// Rewrite every arc's vertices in place. Because the arc-to-shape references are
// untouched, shared polygon boundaries stay coincident and topology is
// preserved; updateVertexData() also handles undo capture and resets stale
// simplification thresholds.
// Returns the total number of structural corners preserved across all arcs.
export function smoothPaths(arcs, opts) {
  var nn = [];
  var xx = [];
  var yy = [];
  var corners = 0;
  var i, k, res;
  arcs.forEach3(function(axx, ayy, azz, arcId) {
    res = smoothArcCoords(axx, ayy, {
      tolerance: opts.tolerance,
      method: opts.method,
      spherical: opts.spherical,
      keepCorners: opts.keepCorners,
      cornerBias: opts.cornerBias,
      gain: opts.gain,
      strength: opts.strength,
      maxBendAngle: opts.maxBendAngle,
      closed: arcs.arcIsClosed(arcId)
    });
    corners += res.corners || 0;
    nn.push(res.xx.length);
    for (i = 0, k = res.xx.length; i < k; i++) {
      xx.push(res.xx[i]);
      yy.push(res.yy[i]);
    }
  });
  arcs.updateVertexData(nn, xx, yy);
  return corners;
}

// Median segment length across all arcs, in ground units (meters for spherical
// data), used to gauge how coarse the geometry is relative to the smoothing
// distance (see autoCornerBias). The median is robust to a few very long straight
// segments (which are not a spurious-corner risk) and to dense sub-scale detail.
// Very large datasets are sampled with a stride so the cost stays bounded.
export function medianSegmentLength(arcs, spherical) {
  var totalSegs = arcs.getPointCount() - arcs.size();
  if (totalSegs < 1) return 0;
  var MAX_SAMPLES = 100000;
  var stride = Math.ceil(totalSegs / MAX_SAMPLES);
  var distFn = spherical ? greatCircleDistance : distance2D;
  var lens = [];
  var counter = 0;
  arcs.forEach3(function(xx, yy) {
    for (var i = 1, n = xx.length; i < n; i++) {
      if (counter++ % stride === 0) {
        lens.push(distFn(xx[i - 1], yy[i - 1], xx[i], yy[i]));
      }
    }
  });
  if (lens.length === 0) return 0;
  return utils.findMedian(lens);
}

export function getSmoothMethod(opts) {
  // Gaussian (Savitzky-Golay) is the documented smoother. 'paek' (an exponential
  // kernel) is kept as an undocumented alternative for backward compatibility.
  var m = opts.method;
  if (!m) return 'gaussian';
  if (m != 'paek' && m != 'gaussian') {
    stop('Unsupported smooth method:', m);
  }
  return m;
}

function useSphericalSmooth(arcs, opts) {
  return !opts.planar && !arcs.isPlanar();
}

function convertSmoothTolerance(param, dataset, spherical) {
  var crs = getDatasetCRS(dataset);
  return spherical ? convertDistanceParam(param, crs) : convertIntervalParam(param, crs);
}
