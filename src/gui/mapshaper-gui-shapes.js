/* @requires mapshaper-gui-lib */

// A wrapper for ArcCollection that filters paths to speed up rendering.
//
function FilteredArcCollection(unfilteredArcs) {
  var sortedThresholds,
      filteredArcs,
      filteredSegLen;

  init();

  function init() {
    var size = unfilteredArcs.getPointCount(),
        cutoff = 5e5,
        nth;
    sortedThresholds = filteredArcs = null;
    if (!!unfilteredArcs.getVertexData().zz) {
      // If we have simplification data...
      // Sort simplification thresholds for all non-endpoint vertices
      // for quick conversion of simplification percentage to threshold value.
      // For large datasets, use every nth point, for faster sorting.
      nth = Math.ceil(size / cutoff);
      sortedThresholds = unfilteredArcs.getRemovableThresholds(nth);
      utils.quicksort(sortedThresholds, false);
      // For large datasets, create a filtered copy of the data for faster rendering
      if (size > cutoff) {
        filteredArcs = initFilteredArcs(unfilteredArcs, sortedThresholds);
        filteredSegLen = internal.getAvgSegment(filteredArcs);
      }
    } else {
      if (size > cutoff) {
        // generate filtered arcs when no simplification data is present
        filteredSegLen = internal.getAvgSegment(unfilteredArcs) * 4;
        filteredArcs = internal.simplifyArcsFast(unfilteredArcs, filteredSegLen);
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

  function needFilterUpdate() {
    if (filteredArcs) {
      // Filtered arcs need to be rebuilt if number of arcs has changed or
      // thresholds haven't been sorted yet (to support the GUI slider)
      // TODO: consider other cases where filtered arcs might need to be updated
      if (filteredArcs.size() != unfilteredArcs.size() ||
          unfilteredArcs.getVertexData().zz && !sortedThresholds) {
        return true;
      }
    }
    return false;
  }

  function refreshFilteredArcs() {
    if (filteredArcs) {
      if (needFilterUpdate()) {
        init();
      }
      filteredArcs.setRetainedInterval(unfilteredArcs.getRetainedInterval());
    }
  }

  this.size = function() {return unfilteredArcs.size();};

  this.setRetainedPct = function(pct) {
    if (sortedThresholds) {
      var z = sortedThresholds[Math.floor(pct * sortedThresholds.length)];
      z = internal.clampIntervalByPct(z, pct);
      unfilteredArcs.setRetainedInterval(z);
    } else {
      unfilteredArcs.setRetainedPct(pct);
    }
  };
}
