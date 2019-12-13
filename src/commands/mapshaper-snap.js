/* @requires
mapshaper-common
*/

api.snap = function(dataset, opts) {
  var interval = 0;
  var arcs = dataset.arcs;
  var arcBounds = arcs && arcs.getBounds();
  if (!arcBounds || !arcBounds.hasBounds()) {
    stop('Dataset is missing path data');
  }
  if (opts.interval) {
    interval = internal.convertIntervalParam(opts.interval, internal.getDatasetCRS(dataset));
  } else {
    interval = internal.getHighPrecisionSnapInterval(arcBounds.toArray());
  }
  arcs.flatten(); // bake in any simplification
  var snapCount = internal.snapCoordsByInterval(arcs, interval);
  message(utils.format("Snapped %s point%s", snapCount, utils.pluralSuffix(snapCount)));
  if (snapCount > 0) {
    arcs.dedupCoords();
    api.buildTopology(dataset);
  }
};
