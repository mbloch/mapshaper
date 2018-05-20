
// Returns a function for converting simplification ratio [0-1] to an interval value.
// If the dataset is large, the value is an approximation (for speed while using slider)
internal.getThresholdFunction = function(arcs) {
  var size = arcs.getPointCount(),
      nth = Math.ceil(size / 5e5),
      sortedThresholds = arcs.getRemovableThresholds(nth);
      // Sort simplification thresholds for all non-endpoint vertices
      // for quick conversion of simplification percentage to threshold value.
      // For large datasets, use every nth point, for faster sorting.
      utils.quicksort(sortedThresholds, false);

  return function(pct) {
    var n = sortedThresholds.length;
    if (pct >= 1) return 0;
    if (pct <= 0 || n === 0) return Infinity;
    return sortedThresholds[Math.floor(pct * n)];
  };
};
