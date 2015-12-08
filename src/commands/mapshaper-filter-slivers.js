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
  var ringTest = MapShaper.getSliverTest(arcs, opts && opts.min_area);
  var removed = 0;
  var pathFilter = function(path, i, paths) {
    if (ringTest(path)) {
      removed++;
      return null;
    }
  };

  MapShaper.filterShapes(lyr.shapes, pathFilter);
  return removed;
};

MapShaper.filterClipSlivers = function(lyr, clipLyr, arcs) {
  var flags = new Uint8Array(arcs.size());
  var ringTest = MapShaper.getSliverTest(arcs);
  var removed = 0;
  var pathFilter = function(path) {
    var clipped = false;
    var absId;
    for (var i=0, n=path && path.length || 0; i<n; i++) {
      if (flags[absArcId(path[i])] > 0) {
        clipped = true;
        break;
      }
    }
    if (clipped && ringTest(path)) {
      removed++;
      return null;
    }
  };

  MapShaper.countArcsInShapes(clipLyr.shapes, flags);
  MapShaper.filterShapes(lyr.shapes, pathFilter);
  return removed;
};

MapShaper.calcDefaultSliverArea = function(arcs) {
  var xy = arcs.getAvgSegment2();
  return xy[0] * xy[1]; // TODO: do some testing to find a better default
};

MapShaper.getSliverTest = function(arcs, minArea) {
  var pathArea;
  if (minArea) {
    pathArea = arcs.isPlanar() ? geom.getPlanarPathArea : geom.getSphericalPathArea;
  } else {
    // use planar area if no min area is given
    pathArea = geom.getPlanarPathArea;
    minArea = MapShaper.calcDefaultSliverArea(arcs);
  }
  return function(path) {
    var area = pathArea(path, arcs);
    return Math.abs(area) < minArea;
  };
};
