/* @requires mapshaper-shape-geom */

internal.getVertexCountTest = function(minVertices, arcs) {
  return function(path) {
    // first and last vertex in ring count as one
    return geom.countVerticesInPath(path, arcs) <= minVertices;
  };
};

internal.getSliverTest = function(arcs) {
  var maxSliverArea = internal.calcMaxSliverArea(arcs);
  return function(path) {
    // TODO: more sophisticated metric, perhaps considering shape
    var area = geom.getPlanarPathArea(path, arcs);
    return Math.abs(area) <= maxSliverArea;
  };
};

internal.getMinAreaTest = function(areaParam, dataset, opts) {
  var arcs = dataset.arcs;
  var minArea = internal.convertAreaParam(areaParam, internal.getDatasetCRS(dataset));
  if (opts && opts.weighted) {
    return internal.getWeightedMinAreaFilter(minArea, dataset.arcs);
  }
  return internal.getMinAreaFilter(minArea, dataset.arcs);
};

internal.getMinAreaFilter = function(minArea, arcs) {
  var pathArea = arcs.isPlanar() ? geom.getPlanarPathArea : geom.getSphericalPathArea;
  return function(path) {
    var area = pathArea(path, arcs);
    return Math.abs(area) < minArea;
  };
};

internal.getWeightedMinAreaFilter = function(minArea, arcs) {
  var pathArea = arcs.isPlanar() ? geom.getPlanarPathArea : geom.getSphericalPathArea;
  var pathPerimeter = arcs.isPlanar() ? geom.getPlanarPathPerimeter : geom.getSphericalPathPerimeter;
  return function(path) {
    var area = pathArea(path, arcs);
    var perim = pathPerimeter(path, arcs);
    var compactness = geom.calcPolsbyPopperCompactness(area, perim);
    return Math.abs(area * compactness) < minArea;
  };
};
