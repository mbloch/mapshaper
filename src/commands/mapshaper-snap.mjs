import { getHighPrecisionSnapInterval, snapCoordsByInterval, snapEndpointsByInterval } from '../paths/mapshaper-snapping';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { convertIntervalParam } from '../geom/mapshaper-units';
import { setCoordinatePrecision } from '../geom/mapshaper-rounding';
import { buildTopology } from '../topology/mapshaper-topology';
import { stop, message } from '../utils/mapshaper-logging';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';

cmd.snap = function(target, opts) {
  var interval = 0;
  var snapCount = 0;
  var dataset = target.dataset;
  var arcs = dataset.arcs;
  var arcBounds = arcs && arcs.getBounds();
  if (!arcBounds || !arcBounds.hasBounds()) {
    stop('Dataset is missing path data');
  }
  if (opts.precision) {
    setCoordinatePrecision(dataset, opts.precision);
  } else if (opts.interval) {
    interval = convertIntervalParam(opts.interval, getDatasetCRS(dataset));
  } else {
    interval = getHighPrecisionSnapInterval(arcBounds.toArray());
  }
  arcs.flatten(); // bake in any simplification
  if (interval > 0 && opts.endpoints) {
    // snaps line endpoints together
    // TODO: also snap endpoints to line segments to remove undershoots and overshoots
    snapCount = snapEndpointsByInterval(arcs, interval);
    message(utils.format("Snapped %s endpoint%s", snapCount, utils.pluralSuffix(snapCount)));
  } else if (interval > 0) {
    snapCount = snapCoordsByInterval(arcs, interval);
    message(utils.format("Snapped %s point%s", snapCount, utils.pluralSuffix(snapCount)));
  }
  if (snapCount > 0 || opts.precision) {
    arcs.dedupCoords();
    buildTopology(dataset);
  }
};
