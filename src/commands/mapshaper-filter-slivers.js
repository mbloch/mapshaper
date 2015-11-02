/* @require mapshaper-filter-islands */

// Remove small-area polygon rings (very simple implementation of sliver removal)
// TODO: more sophisticated sliver detection (e.g. could consider ratio of area to perimeter)
// TODO: consider merging slivers into adjacent polygons to prevent gaps from forming
// TODO: consider separate gap removal function as an alternative to merging slivers
//
api.filterSlivers = function(lyr, arcs, opts) {
  if (lyr.geometry_type != 'polygon') {
    return 0;
  }
  return MapShaper.filterSlivers(lyr, arcs, opts);
};

MapShaper.filterSlivers = function(lyr, arcs, opts) {
  var removed = 0;
  var area = opts && opts.min_area;
  var spherical = area && !!arcs.isPlanar();
  var ringTest;
  if (!area) {
    area = MapShaper.calcDefaultSliverArea(arcs);
  }
  ringTest = MapShaper.getSliverTest(area, arcs, spherical);

  function shapeFilter(paths) {
    return MapShaper.editPaths(paths, function(path) {
      if (ringTest(path)) {
        removed++;
        return null;
      }
    });
  }

  MapShaper.filterShapes(lyr.shapes, shapeFilter);
  return removed;
};

MapShaper.calcDefaultSliverArea = function(arcs) {
  var xy = arcs.getAvgSegment2();
  return xy[0] * xy[1]; // TODO: do some testing to find a better default
};

MapShaper.getSliverTest = function(minArea, arcs, spherical) {
  var pathArea = spherical ? geom.getSphericalPathArea : geom.getPlanarPathArea;
  return function(path) {
    var area = pathArea(path, arcs);
    return Math.abs(area) < minArea;
  };
};
