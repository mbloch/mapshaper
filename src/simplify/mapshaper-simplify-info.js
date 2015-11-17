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
  var uniqueCount = MapShaper.countUniqueVertices(arcs);
  var removableCount = err.removed + err.retained;
  var pct1 = (err.removed + err.collapsed) / uniqueCount || 0;
  var pct2 = err.removed / removableCount || 0;
  var lines = ["Simplification info"];
  lines.push(utils.format("Method: %s (%s)", name, type));
  lines.push(utils.format("Removed vertices: %,d", err.removed + err.collapsed));
  lines.push(utils.format("   %.1f% of %,d unique coordinate locations", pct1 * 100, uniqueCount));
  lines.push(utils.format("   %.1f% of %,d filterable coordinate locations", pct2 * 100, removableCount));
  lines.push(utils.format("Collapsed rings: %,d", err.collapsed));
  lines.push(utils.format("Reference displacement: %.2f", arcs.getRetainedInterval()));
  lines.push(utils.format("Mean displacement: %.4f", err.avg));
  lines.push(utils.format("Median displacement: %.4f", err.median));
  lines.push(utils.format("Max displacement: %.4f", err.max));
  lines.push(utils.format("Std. deviation: %.4f", Math.sqrt(err.avg2)));
  message(lines.join('\n  '));
};