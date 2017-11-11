/* @requires mapshaper-common */

api.filterGeom = function(lyr, arcs, opts) {
  if (!internal.layerHasGeometry(lyr)) {
    stop("Layer is missing geometry");
  }
  if (opts.bbox) {
    internal.filterByBoundsIntersection(lyr, arcs, opts);
  }
  api.filterFeatures(lyr, arcs, {remove_empty: true, verbose: false});
};

internal.filterByBoundsIntersection = function(lyr, arcs, opts) {
  var bounds = new Bounds(opts.bbox);
  var filter = lyr.geometry_type == 'point' ?
        internal.getPointInBoundsTest(bounds) :
        internal.getPathBoundsIntersectionTest(bounds, arcs);
  internal.editShapes(lyr.shapes, filter);
};

internal.getPointInBoundsTest = function(bounds) {
  return function(xy) {
    var contains =  bounds.containsPoint(xy[0], xy[1]);
    return contains ? xy : null;
  };
};

internal.getPathBoundsIntersectionTest = function(bounds, arcs) {
  return function(path) {
    return bounds.intersects(arcs.getSimpleShapeBounds(path)) ? path : null;
  };
};
