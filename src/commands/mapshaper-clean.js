/* @requires mapshaper-polygon-dissolve3, mapshaper-arc-dissolve, mapshaper-filter */

api.cleanLayers = function(layers, dataset, opts) {
  var nodes;
  opts = opts || {};
  // layers.forEach(internal.requirePolygonLayer);
  nodes = internal.addIntersectionCuts(dataset, opts);
  layers.forEach(function(lyr) {
    if (lyr.geometry_type == 'polygon') {
      lyr.shapes = internal.dissolvePolygons2(lyr.shapes, nodes.arcs, opts);
    }
    if (!opts.allow_empty) {
      api.filterFeatures(lyr, dataset.arcs, {remove_empty: true});
    }
  });
  if (!opts.no_arc_dissolve && dataset.arcs) {
    internal.dissolveArcs(dataset); // remove leftover endpoints within contiguous lines
  }
};
