/* @requires mapshaper-polygon-dissolve3, mapshaper-arc-dissolve */

api.cleanLayers = function(layers, dataset, opts) {
  var nodes;
  opts = opts || {};
  layers.forEach(internal.requirePolygonLayer);
  nodes = internal.addIntersectionCuts(dataset);
  layers.forEach(function(lyr) {
    lyr.shapes = internal.dissolvePolygons2(lyr.shapes, nodes.arcs, opts);
  });
  if (!opts.no_arc_dissolve) {
    internal.dissolveArcs(dataset); // remove leftover endpoints within contiguous lines
  }
};
