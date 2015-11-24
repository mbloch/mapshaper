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
  var pct1 = (stats.removed + stats.collapsedRings) / stats.uniqueCount || 0;
  var pct2 = stats.removed / stats.removableCount || 0;
  var aq = stats.angleQuartiles;
  var dq = stats.displacementQuartiles;
  var lines = ["Simplification statistics"];
  lines.push(utils.format("Method: %s (%s) %s", name, spherical ? 'spherical' : 'planar',
      method == 'weighted_visvalingam' ? '(weighting=' + Visvalingam.getWeightCoefficient(opts) + ')' : ''));
  lines.push(utils.format("Removed vertices: %,d", stats.removed + stats.collapsedRings));
  lines.push(utils.format("   %.1f% of %,d unique coordinate locations", pct1 * 100, stats.uniqueCount));
  lines.push(utils.format("   %.1f% of %,d filterable coordinate locations", pct2 * 100, stats.removableCount));
  lines.push(utils.format("Simplification interval: %.4f %s", arcs.getRetainedInterval(),
      spherical ? 'meters' : ''));
  lines.push(utils.format("Collapsed rings: %,d", stats.collapsedRings));
  lines.push("Displacement statistics");
  lines.push(utils.format("   Mean displacement: %.4f", stats.displacementMean));
  lines.push(utils.format("   Max displacement: %.4f", stats.displacementMax));
  lines.push(utils.format("   Quartiles: %.2f, %.2f, %.2f", dq[0], dq[1], dq[2]));
  lines.push("Vertex angle statistics");
  lines.push(utils.format("   Mean angle: %.2f degrees", stats.angleMean));
  // lines.push(utils.format("   Angles < 45: %.2f%", stats.lt45));
  lines.push(utils.format("   Quartiles: %.2f, %.2f, %.2f", aq[0], aq[1], aq[2]));

  message(lines.join('\n   '));
};
