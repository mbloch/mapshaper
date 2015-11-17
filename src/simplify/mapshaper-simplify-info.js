/* @requires mapshaper-simplify-error */


MapShaper.getSimplifyMethodLabel = function(slug) {
  return {
    dp: "Ramer-Douglas-Peucker",
    visvalingam: "Visvalingam",
    weighted_visvalingam: "Weighted Visvalingam"
  }[slug] || "Unknown";
};

MapShaper.countUniqueVertices = function(arcs) {
  // TODO: exclude any zero-length arcs
  var endpoints = arcs.size() * 2;
  var nodes = new NodeCollection(arcs).size();
  return arcs.getPointCount() - endpoints + nodes;
};

MapShaper.printSimplifyInfo = function(arcs, opts) {
  var name = MapShaper.getSimplifyMethodLabel(MapShaper.getSimplifyMethod(opts));
  var type = MapShaper.useSphericalSimplify(arcs, opts) ? 'spherical' : 'planar';
  var err = MapShaper.calcSimplifyError(arcs, type == 'spherical');
  var pct1 = (err.removed + err.collapsed) / MapShaper.countUniqueVertices(arcs) || 0;
  var lines = ["Simplification info"];
  lines.push(utils.format("Method: %s (%s)", name, type));
  lines.push(utils.format("Removed vertices: %,d (%.2f%)", err.removed + err.collapsed, pct1 * 100));
  lines.push(utils.format("Collapsed rings: %,d", err.collapsed));
  lines.push(utils.format("Reference distance: %.2f", arcs.getRetainedInterval()));
  lines.push(utils.format("Mean displacement: %.4f", err.avg));
  lines.push(utils.format("Max displacement: %.4f", err.max));
  lines.push(utils.format("Std. deviation: %.4f", Math.sqrt(err.avg2)));
  message(lines.join('\n  '));
};