/* @requires mapshaper-expressions */

function dissolvePointLayerGeometry(lyr, getGroupId, opts) {
  var useSph = MapShaper.probablyDecimalDegreeBounds(MapShaper.getLayerBounds(lyr));
  var weighting = opts.weighting ? MapShaper.compileValueExpression(opts.weighting, lyr) : null;
  var groups = [];

  lyr.shapes.forEach(function(shp, i) {
    var groupId = getGroupId(i);
    var weight = weighting ? weighting(i) : 1;
    var p = shp && shp[0]; // Using first point (TODO: handle multi-point features)
    var memo;
    if (p) {
      memo = groups[groupId] || {sum: 0, centroid: [0, 0]};
      groups[groupId] = reducePointCentroid(memo, p, weight);
    }
  });

  return groups.map(function(memo) {
    return memo ? [memo.centroid] : null;
  });
}

function reducePointCentroid(memo, p, weight) {
  var x = p[0],
      y = p[1],
      sum, k;
  if (x == x && y == y && weight > 0) {
    sum = memo.sum + weight;
    k = memo.sum / sum;
    memo.centroid[0] = k * memo.centroid[0] + weight * x / sum;
    memo.centroid[1] = k * memo.centroid[1] + weight * y / sum;
    memo.sum = sum;
  }
  return memo;
}