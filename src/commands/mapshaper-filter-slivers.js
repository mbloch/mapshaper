/* @require mapshaper-filter-islands, mapshaper-segment-geom, mapshaper-slivers */

// Remove small-area polygon rings (very simple implementation of sliver removal)
// TODO: more sophisticated sliver detection (e.g. could consider ratio of area to perimeter)
// TODO: consider merging slivers into adjacent polygons to prevent gaps from forming
// TODO: consider separate gap removal function as an alternative to merging slivers
//
api.filterSlivers = function(lyr, dataset, opts) {
  if (lyr.geometry_type != 'polygon') {
    return 0;
  }
  return internal.filterSlivers(lyr, dataset, opts);
};

internal.filterSlivers = function(lyr, dataset, opts) {
  var ringTest = opts && opts.min_area ? internal.getMinAreaTest(opts.min_area, dataset, opts) :
    internal.getSliverTest(dataset.arcs);
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

