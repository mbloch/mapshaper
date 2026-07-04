import { convertIntervalParam, convertDistanceParam } from '../geom/mapshaper-units';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { collapseArcDetail } from '../paths/mapshaper-detail-filter';
import { layerHasPaths, getImplicitlyTargetedLayerNames } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import { message, stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// Optional preprocessing step before -smooth: collapse intricate sub-scale
// detail (jetties, narrow inlets, spikes) that smoothing cannot generalize. Like
// -smooth and -simplify this rewrites shared arc vertices in place and preserves
// arc endpoints, so polygon topology is left intact.
cmd.filterDetail = function(dataset, opts, targetLayers) {
  var arcs = dataset.arcs;
  if (!arcs || arcs.size() === 0) return;
  opts = opts || {};
  if (opts.distance === undefined || opts.distance === null || opts.distance === '') {
    stop('Missing a detail distance');
  }
  var spherical = !opts.planar && !arcs.isPlanar();
  var distance = convertDetailDistance(opts.distance, dataset, spherical);
  if (!(distance > 0)) {
    stop('Expected a positive detail distance');
  }
  var implicitNames = getImplicitlyTargetedLayerNames(dataset, targetLayers, layerHasPaths);

  // Rewrites coordinates, so lock in any pending simplification first (see -smooth).
  if (!arcs.isFlat()) {
    arcs.flatten();
  }

  var before = arcs.getPointCount();
  filterDetailPaths(arcs, {
    distance: distance,
    tortuosity: opts.tortuosity,
    weighting: opts.weighting,
    roundness: opts.roundness,
    minRingArea: opts.min_area,
    spherical: spherical
  });
  var removed = before - arcs.getPointCount();
  message('Removed ' + removed + ' of ' + before + ' vertices');

  if (implicitNames.length > 0) {
    message(
      'Also filtered non-target layer' + utils.pluralSuffix(implicitNames.length) +
      ' from the same dataset: ' + implicitNames.join(', ')
    );
  }
};

export function filterDetailPaths(arcs, opts) {
  var nn = [];
  var xx = [];
  var yy = [];
  var i, k, res;
  arcs.forEach3(function(axx, ayy, azz) {
    res = collapseArcDetail(axx, ayy, {
      distance: opts.distance,
      tortuosity: opts.tortuosity,
      weighting: opts.weighting,
      roundness: opts.roundness,
      minRingArea: opts.minRingArea,
      spherical: opts.spherical
    });
    nn.push(res.xx.length);
    for (i = 0, k = res.xx.length; i < k; i++) {
      xx.push(res.xx[i]);
      yy.push(res.yy[i]);
    }
  });
  arcs.updateVertexData(nn, xx, yy);
}

function convertDetailDistance(param, dataset, spherical) {
  var crs = getDatasetCRS(dataset);
  return spherical ? convertDistanceParam(param, crs) : convertIntervalParam(param, crs);
}
