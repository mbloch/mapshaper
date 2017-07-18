/* @require mapshaper-common */

internal.target = function(catalog, opts) {
  var type = (opts.type || '').toLowerCase().replace('linestring', 'polyline');
  var targets = catalog.findCommandTargets(opts.target || '*', type);
  var target = targets[0];
  if (type && 'polygon,polyline,point'.split(',').indexOf(type) == -1) {
    stop("Invalid layer type:", opts.type);
  }
  if (!target || target.layers.length === 0) {
    stop("Target not found (" + pattern + ")");
  } else if (targets.length > 1 || target.layers.length > 1) {
    stop("Matched more than one layer");
  }
  if (opts.name) {
    target.layers[0].name = opts.name;
  }
  catalog.setDefaultTarget(target.layers, target.dataset);
};
