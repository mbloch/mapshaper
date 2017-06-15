/* @requires mapshaper-polygon-dissolve2 */

// src: single layer or array of layers (must belong to dataset)
api.dissolve2 = function(src, dataset, opts) {
  var multiple = Array.isArray(src);
  var layers = multiple ? src : [src];
  var nodes;
  var layers2 = layers.map(function(lyr) {
    internal.requirePolygonLayer(lyr);
    if (!nodes) nodes = internal.addIntersectionCuts(dataset, opts);
    return internal.dissolvePolygonLayer(lyr, nodes, opts);
  });
  return multiple ? layers2 : layers2[0];
};
