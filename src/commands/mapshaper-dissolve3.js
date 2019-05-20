/* @requires
mapshaper-polygon-dissolve2
mapshaper-polygon-dissolve3
mapshaper-mosaic-index
*/


// Newest version, with gap and overlap repair
api.dissolve3 = function(layers, dataset, opts) {
  layers.forEach(internal.requirePolygonLayer);
  T.start();
  var nodes = internal.addIntersectionCuts(dataset, opts);
  T.stop('Add cuts');
  return layers.map(function(lyr) {
    return internal.dissolvePolygonLayer3(lyr, dataset, opts);
  });
};
