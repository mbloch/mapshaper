/* @requires mapshaper-polygon-dissolve3 */

api.cleanLayers = function(layers, dataset, opts) {
  layers.forEach(internal.requirePolygonLayer);
  var nodes = internal.addIntersectionCuts(dataset);
  layers.forEach(function(lyr) {
    lyr.shapes = internal.dissolvePolygons2(lyr.shapes, nodes.arcs, opts);
  });
};
