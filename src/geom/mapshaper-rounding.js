/* @require mapshaper-dataset-utils, mapshaper-point-utils */

internal.roundPoints = function(lyr, round) {
  internal.forEachPoint(lyr.shapes, function(p) {
    p[0] = round(p[0]);
    p[1] = round(p[1]);
  });
};

internal.setCoordinatePrecision = function(dataset, precision) {
  var round = utils.getRoundingFunction(precision);
  // var dissolvePolygon, nodes;
  internal.transformPoints(dataset, function(x, y) {
    return [round(x), round(y)];
  });
  // v0.4.52 removing polygon dissolve - see issue #219
  /*
  if (dataset.arcs) {
    nodes = internal.addIntersectionCuts(dataset);
    dissolvePolygon = internal.getPolygonDissolver(nodes);
  }
  dataset.layers.forEach(function(lyr) {
    if (lyr.geometry_type == 'polygon' && dissolvePolygon) {
      // clean each polygon -- use dissolve function to remove spikes
      // TODO: better handling of corrupted polygons
      lyr.shapes = lyr.shapes.map(dissolvePolygon);
    }
  });
  */
  return dataset;
};

utils.getRoundingFunction = function(inc) {
  if (!utils.isNumber(inc) || inc === 0) {
    error("Rounding increment must be a non-zero number.");
  }
  var inv = 1 / inc;
  if (inv > 1) inv = Math.round(inv);
  return function(x) {
    return Math.round(x * inv) / inv;
    // these alternatives show rounding error after JSON.stringify()
    // return Math.round(x / inc) / inv;
    // return Math.round(x / inc) * inc;
    // return Math.round(x * inv) * inc;
  };
};
