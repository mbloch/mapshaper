
import utils from '../utils/mapshaper-utils';

// Returns a function for converting simplification ratio [0-1] to an interval value.
// If the dataset is large, the value is an approximation (for speed while using slider)
export function getThresholdFunction(arcs) {
  var size = arcs.getPointCount(),
      nth = Math.ceil(size / 5e5),
      sortedThresholds = arcs.getRemovableThresholds(nth);
      // Sort simplification thresholds for all non-endpoint vertices
      // for quick conversion of simplification percentage to threshold value.
      // For large datasets, use every nth point, for faster sorting.
      // utils.quicksort(sortedThresholds, false); // descending
      utils.quicksort(sortedThresholds, true); // ascending

  return function(pct) {
    var n = sortedThresholds.length;
    var rank = retainedPctToRank(pct, sortedThresholds.length);
    if (rank < 1) return 0;
    if (rank > n) return Infinity;
    return sortedThresholds[rank-1];
  };
}

// Return integer rank of n (1-indexed) or 0 if pct <= 0 or n+1 if pct >= 1
function retainedPctToRank(pct, n) {
  var rank;
  if (n === 0 || pct >= 1) {
    rank = 0;
  } else if (pct <= 0) {
    rank = n + 1;
  } else {
    rank = Math.floor((1 - pct) * (n + 2));
  }
  return rank;
}

// nth (optional): sample every nth threshold (use estimate for speed)
export function getThresholdByPct(pct, arcs, nth) {
  var tmp = arcs.getRemovableThresholds(nth),
      rank = retainedPctToRank(pct, tmp.length);
  if (rank < 1) return 0;
  if (rank > tmp.length) return Infinity;
  return utils.findValueByRank(tmp, rank);
}
