/* @require mapshaper-filter-islands, mapshaper-segment-geom */

// Remove small-area polygon rings (very simple implementation of sliver removal)
// TODO: more sophisticated sliver detection (e.g. could consider ratio of area to perimeter)
// TODO: consider merging slivers into adjacent polygons to prevent gaps from forming
// TODO: consider separate gap removal function as an alternative to merging slivers
//
api.filterSlivers = function(lyr, arcs, opts) {
  if (lyr.geometry_type != 'polygon') {
    return 0;
  }
  return internal.filterSlivers(lyr, arcs, opts);
};

internal.filterSlivers = function(lyr, arcs, opts) {
  var ringTest = opts && opts.min_area ? internal.getMinAreaTest(opts.min_area, arcs) :
    internal.getSliverTest(arcs);
  var removed = 0;
  var pathFilter = function(path, i, paths) {
    if (ringTest(path)) {
      removed++;
      return null;
    }
  };

  internal.editShapes(lyr.shapes, pathFilter);
  message(utils.format("Removed %'d sliver%s", removed, utils.pluralSuffix(removed)));
  return removed;
};

internal.filterClipSlivers = function(lyr, clipLyr, arcs) {
  var flags = new Uint8Array(arcs.size());
  var ringTest = internal.getSliverTest(arcs);
  var removed = 0;
  var pathFilter = function(path) {
    var prevArcs = 0,
        newArcs = 0;
    for (var i=0, n=path && path.length || 0; i<n; i++) {
      if (flags[absArcId(path[i])] > 0) {
        newArcs++;
      } else {
        prevArcs++;
      }
    }
    // filter paths that contain arcs from both original and clip/erase layers
    //   and are small
    if (newArcs > 0 && prevArcs > 0 && ringTest(path)) {
      removed++;
      return null;
    }
  };

  internal.countArcsInShapes(clipLyr.shapes, flags);
  internal.editShapes(lyr.shapes, pathFilter);
  return removed;
};

internal.getSliverTest = function(arcs) {
  var maxSliverArea = internal.calcMaxSliverArea(arcs);
  return function(path) {
    // TODO: more sophisticated metric, perhaps considering shape
    var area = geom.getPlanarPathArea(path, arcs);
    return Math.abs(area) <= maxSliverArea;
  };
};


// Calculate an area threshold based on the average segment length,
// but disregarding very long segments (i.e. bounding boxes)
// TODO: need something more reliable
// consider: calculating the distribution of segment lengths in one pass
//
internal.calcMaxSliverArea = function(arcs) {
  var k = 2,
      dxMax = arcs.getBounds().width() / k,
      dyMax = arcs.getBounds().height() / k,
      count = 0,
      mean = 0;
  arcs.forEachSegment(function(i, j, xx, yy) {
    var dx = Math.abs(xx[i] - xx[j]),
        dy = Math.abs(yy[i] - yy[j]);
    if (dx < dxMax && dy < dyMax) {
      // TODO: write utility function for calculating mean this way
      mean += (Math.sqrt(dx * dx + dy * dy) - mean) / ++count;
    }
  });
  return mean * mean;
};
