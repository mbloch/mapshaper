/* @requires
mapshaper-polygon-dissolve2
mapshaper-polyline-dissolve2
*/

// src: single layer or array of layers (must belong to dataset)
api.dissolve2 = function(src, dataset, opts) {
  var multiple = Array.isArray(src);
  var layers = multiple ? src : [src];
  var layers2 = [];
  var nodes;
  layers.forEach(function(lyr) {
    internal.requirePathLayer(lyr);
  });
  // dissolve any polyline layers first (before intersection cuts are applied)
  layers.forEach(function(lyr, i) {
    if (lyr.geometry_type != 'polyline') return;
    layers2[i] = internal.dissolvePolylineLyr(lyr, dataset.arcs, opts);
  });
  layers.forEach(function(lyr, i) {
    if (lyr.geometry_type != 'polygon') return;
    if (!nodes) nodes = internal.addIntersectionCuts(dataset, opts);
    layers2[i] = internal.dissolvePolygonLayer(lyr, nodes, opts);
  });
  return multiple ? layers2 : layers2[0];
};
