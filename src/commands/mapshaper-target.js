/* @require mapshaper-common */

api.target = function(catalog, pattern) {
  var targets = catalog.findCommandTargets(pattern);
  if (targets.length === 0) {
    stop("[target] Target not found (" + pattern + ")");
  } else if (targets.length > 1 || targets[0].layers.length > 1) {
    stop("[target] Matched more than one layer");
  }
  catalog.setActiveLayer(targets[0].layers[0], targets[0].dataset);
};
