import { convertIntervalParam, convertDistanceParam } from '../geom/mapshaper-units';
import { getDatasetCRS } from '../crs/mapshaper-projections';
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
      !(opts.corner_bias >= 0)) {
    stop('Expected corner-bias to be a number >= 0');
  }
  // Corner preservation is on by default; no-corners or corner-bias=0 turns it off.
  var keepCorners = !opts.no_corners && opts.corner_bias !== 0;
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
      spherical: spherical
    });
    var removed = before - arcs.getPointCount();
    if (removed > 0) {
      message('Prefilter removed ' + removed + ' of ' + before + ' vertices');
    }
  }

  smoothPaths(arcs, {
    tolerance: tolerance,
    method: method,
    spherical: spherical,
    keepCorners: keepCorners,
    cornerBias: opts.corner_bias,
    gain: opts.gain,
    maxBendAngle: opts.max_bend_angle
  });

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
export function smoothPaths(arcs, opts) {
  var nn = [];
  var xx = [];
  var yy = [];
  var i, k, res;
  arcs.forEach3(function(axx, ayy, azz, arcId) {
    res = smoothArcCoords(axx, ayy, {
      tolerance: opts.tolerance,
      method: opts.method,
      spherical: opts.spherical,
      keepCorners: opts.keepCorners,
      cornerBias: opts.cornerBias,
      gain: opts.gain,
      maxBendAngle: opts.maxBendAngle,
      closed: arcs.arcIsClosed(arcId)
    });
    nn.push(res.xx.length);
    for (i = 0, k = res.xx.length; i < k; i++) {
      xx.push(res.xx[i]);
      yy.push(res.yy[i]);
    }
  });
  arcs.updateVertexData(nn, xx, yy);
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
