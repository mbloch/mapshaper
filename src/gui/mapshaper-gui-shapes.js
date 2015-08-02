/* @requires
mapshaper-shapes
mapshaper-shape-utils
mapshaper-simplify-fast
*/

// A wrapper for ArcCollection that filters paths to speed up rendering.
//
function FilteredArcCollection(unfilteredArcs) {
  var _sortedThresholds,
      filteredArcs,
      filteredSegLen;

  init();

  function init() {
    var size = unfilteredArcs.getPointCount(),
        cutoff = 5e5,
        nth;
    if (!!unfilteredArcs.getVertexData().zz) {
      // If we have simplification data...
      // Sort simplification thresholds for all non-endpoint vertices
      // for quick conversion of simplification percentage to threshold value.
      // For large datasets, use every nth point, for faster sorting.
      nth = Math.ceil(size / cutoff);
      _sortedThresholds = unfilteredArcs.getRemovableThresholds(nth);
      utils.quicksort(_sortedThresholds, false);
      // For large datasets, create a filtered copy of the data for faster rendering
      if (size > cutoff) {
        filteredArcs = initFilteredArcs(unfilteredArcs, _sortedThresholds);
        filteredSegLen = filteredArcs.getAvgSegment();
      }
    } else {
      if (size > cutoff) {
        // generate filtered arcs when no simplification data is present
        filteredSegLen = unfilteredArcs.getAvgSegment() * 4;
        filteredArcs = MapShaper.simplifyArcsFast(unfilteredArcs, filteredSegLen);
      }
    }
  }

  // Use simplification data to create a low-detail copy of arcs, for faster
  // rendering when zoomed-out.
  function initFilteredArcs(arcs, sortedThresholds) {
    var filterPct = 0.08;
    var currInterval = arcs.getRetainedInterval();
    var filterZ = sortedThresholds[Math.floor(filterPct * sortedThresholds.length)];
    var filteredArcs = arcs.setRetainedInterval(filterZ).getFilteredCopy();
    arcs.setRetainedInterval(currInterval); // reset current simplification
    return filteredArcs;
  }

  this.getArcCollection = function(ext) {
    refreshFilteredArcs();
    // Use a filtered version of arcs at small scales
    var unitsPerPixel = 1/ext.getTransform().mx,
        useFiltering = filteredArcs && unitsPerPixel > filteredSegLen * 1.5;
    return useFiltering ? filteredArcs : unfilteredArcs;
  };

  function refreshFilteredArcs() {
    if (filteredArcs) {
      if (filteredArcs.size() != unfilteredArcs.size()) {
        init();
      }
      filteredArcs.setRetainedInterval(unfilteredArcs.getRetainedInterval());
    }
  }

  this.update = function(arcs) {
    unfilteredArcs = arcs;
    init();
  };

  this.setRetainedPct = function(pct) {
    if (_sortedThresholds) {
      var z = _sortedThresholds[Math.floor(pct * _sortedThresholds.length)];
      z = MapShaper.clampIntervalByPct(z, pct);
      // this.setRetainedInterval(z);
      unfilteredArcs.setRetainedInterval(z);
    } else {
      unfilteredArcs.setRetainedPct(pct);
    }
  };
}
