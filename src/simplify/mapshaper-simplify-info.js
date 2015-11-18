/* @requires mapshaper-simplify-stats */


MapShaper.getSimplifyMethodLabel = function(slug) {
  return {
    dp: "Ramer-Douglas-Peucker",
    visvalingam: "Visvalingam",
    weighted_visvalingam: "Weighted Visvalingam"
  }[slug] || "Unknown";
};

MapShaper.printSimplifyInfo = function(arcs, opts) {
  var method = MapShaper.getSimplifyMethod(opts);
  var name = MapShaper.getSimplifyMethodLabel(method);
  var spherical = MapShaper.useSphericalSimplify(arcs, opts);
  var stats = MapShaper.calcSimplifyStats(arcs, spherical);
  var pct1 = (stats.removed + stats.collapsed) / stats.uniqueCount || 0;
  var pct2 = stats.removed / stats.removableCount || 0;
  var lines = ["Simplification statistics"];
  lines.push(utils.format("Method: %s (%s) %s", name, spherical ? 'spherical' : 'planar',
      method == 'weighted_visvalingam' ? '(weighting=' + Visvalingam.getWeightCoefficient(opts) + ')' : ''));
  lines.push(utils.format("Removed vertices: %,d", stats.removed + stats.collapsed));
  lines.push(utils.format("   %.1f% of %,d unique coordinate locations", pct1 * 100, stats.uniqueCount));
  lines.push(utils.format("   %.1f% of %,d filterable coordinate locations", pct2 * 100, stats.removableCount));
  lines.push(utils.format("Simplification interval: %.4f %s", arcs.getRetainedInterval(),
      spherical ? 'meters' : ''));
  lines.push(utils.format("Collapsed rings: %,d", stats.collapsed));
  lines.push("Displacement statistics");
  lines.push(utils.format("   Mean displacement: %.4f", stats.mean));
  lines.push(utils.format("   Median displacement: %.4f", stats.median));
  lines.push(utils.format("   Max displacement: %.4f", stats.max));
  lines.push(utils.format("   Standard deviation: %.4f", stats.stdDev));
  lines.push("Vertex angle statistics");
  lines.push(utils.format("   Mean angle: %.2f degrees", stats.meanAngle));
  lines.push(utils.format("   Median angle: %.2f degrees", stats.medianAngle));
  // lines.push(utils.format("Angles < 30deg: %.2f%", stats.lt30));
  lines.push(utils.format("   Angles < 45: %.2f%", stats.lt45));
  // lines.push(utils.format("Angles < 60deg: %.2f%", stats.lt60));
  lines.push(utils.format("   Angles < 90: %.2f%", stats.lt90));
  lines.push(utils.format("   Angles < 135: %.2f%", stats.lt135));
  message(lines.join('\n   '));
};
