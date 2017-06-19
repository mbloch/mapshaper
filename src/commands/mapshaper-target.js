/* @require mapshaper-common */

api.target = function(catalog, pattern, opts) {
  var targets = catalog.findCommandTargets(pattern);
  var target = targets[0];
  if (!target || target.layers.length === 0) {
    stop("Target not found (" + pattern + ")");
  } else if (targets.length > 1 || target.layers.length > 1) {
    stop("Matched more than one layer");
  }
  if (opts && opts.name) {
    target.layers[0].name = opts.name;
  }
  catalog.setDefaultTarget(target.layers, target.dataset);
};
