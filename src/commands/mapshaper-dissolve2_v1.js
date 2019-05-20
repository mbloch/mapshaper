/* @requires mapshaper-polygon-dissolve2_v1 */


// Newest version, with gap and overlap repair
api.dissolve2_v1 = function(layers, dataset, opts) {
  layers.forEach(internal.requirePolygonLayer);
  T.start();
  var nodes = internal.addIntersectionCuts(dataset, opts);
  T.stop('Add cuts');
  return layers.map(function(lyr) {
    return internal.dissolvePolygonLayer2_v1(lyr, dataset, opts);
  });
};
