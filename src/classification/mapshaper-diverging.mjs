import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { getQuantileBreaks, getHybridBreaks, getRankBreaks, getRankPositionFunction } from '../classification/mapshaper-class-stats';
import { getInterpolatedValueGetter } from '../classification/mapshaper-interpolation';

// Diverging classification: classes on either side of a pivot value, and an
// optional neutral class at the pivot. Each side is classified on its own
// data. See docs/development/color-scheme-panel-design.md
//
// A layout is {pivot, neutral, below, above, breaks, extent, dataRange}:
// neutral is the range [lo, hi) of the neutral class, or null; below and
// above are the numbers of classes on either side (outside the neutral
// class); breaks are the inner breaks of all the classes, in ascending
// order, for the sequential classifier. Classes are numbered from the
// lowest: below, then the neutral class, then above. extent is where the
// outer classes end: the data's min and max, or for equal interval and nice,
// whole steps out from the pivot. dataRange is the data's [min, max].

var intervalMethods = ['equal-interval', 'nice'];
var quantileMethods = ['quantile', 'hybrid'];

export function isDivergingClassification(opts) {
  return opts.pivot !== undefined || !!opts.pivot_range;
}

// Whether a diverging classification has a pivot (neutral) class: classed
// output has one unless no-pivot-class is given; continuous output only with
// pivot-class or pivot-range=
export function hasPivotClass(opts) {
  if (opts.pivot_class && opts.no_pivot_class) {
    stop('Use pivot-class or no-pivot-class, not both');
  }
  if (opts.continuous) {
    return !!(opts.pivot_class || opts.pivot_range);
  }
  return !opts.no_pivot_class;
}

// ascending: the data values, in ascending order
// opts: pivot, pivot_range, pivot_class, no_pivot_class, continuous,
//   classes (a total, or the numbers of classes [below, above]), breaks
export function getDivergingLayout(ascending, method, opts) {
  var range = opts.pivot_range || null;
  var hasNeutral = hasPivotClass(opts);
  var pivot, counts, layout;
  if (ascending.length === 0) {
    stop('No numeric data to classify');
  }
  if (range) {
    if (range.length != 2 || !(range[0] <= range[1])) {
      stop('pivot-range= takes two numbers, low,high');
    }
    if (opts.no_pivot_class) stop('pivot-range= sets the range of the pivot class (remove no-pivot-class)');
  }
  pivot = resolvePivot(opts.pivot, ascending, range);
  if (range && (pivot < range[0] || pivot > range[1])) {
    stop('The pivot', pivot, 'is outside pivot-range=', range.join(','));
  }
  if (opts.breaks) {
    if (range) stop('Use breaks= or pivot-range=, not both');
    layout = getBreaksLayout(opts.breaks, pivot, hasNeutral);
  } else {
    counts = parseClassCounts(opts.classes, hasNeutral);
    if (intervalMethods.includes(method)) {
      layout = getIntervalLayout(ascending, pivot, hasNeutral, range, counts, method == 'nice');
    } else if (quantileMethods.includes(method)) {
      layout = getQuantileLayout(ascending, pivot, hasNeutral, range, counts, method,
        method == 'quantile' && !!opts.continuous);
    } else {
      stop('The', method, 'method does not support pivot=');
    }
  }
  if (layout.below + layout.above === 0 && !layout.neutral) {
    stop('Unable to classify the data around the pivot');
  }
  layout.breaks = layout.breaks.map(tidyNumber);
  if (layout.neutral) layout.neutral = layout.neutral.map(tidyNumber);
  layout.dataRange = [ascending[0], ascending[ascending.length - 1]];
  layout.extent = (layout.extent || layout.dataRange).map(tidyNumber);
  return layout;
}

// The values at the color stops of continuous output: each side with
// classes is a ramp of its own, with a stop at each of its breaks, from the
// side's inner edge (the pivot or the pivot class) to the end of its outer
// class. Returns {below, above}, the stops of each side in ascending order
// (m + 1 stops for m classes, none for a side without classes).
export function getDivergingStops(layout) {
  var edges = getSideEdges(layout);
  var below = [], above = [];
  if (layout.below > 0) {
    below = [Math.min(layout.extent[0], edges[0])]
      .concat(layout.breaks.filter(function(b) { return b < edges[0]; }), [edges[0]]);
  }
  if (layout.above > 0) {
    above = [edges[1]]
      .concat(layout.breaks.filter(function(b) { return b > edges[1]; }),
        [Math.max(layout.extent[1], edges[1])]);
  }
  return {below: below, above: above};
}

// The inner edges of the two sides: the pivot, or the pivot class's range
function getSideEdges(layout) {
  return layout.neutral ? layout.neutral : [layout.pivot, layout.pivot];
}

// The number of colors one side of continuous output takes: one per stop
export function getContinuousSideStops(classes) {
  return classes > 0 ? classes + 1 : 0;
}

// Returns a function for continuous output: each side's value is
// interpolated between the values at its stops, and the pivot class has the
// center value.
// values: the side below's values (one per stop, ascending), the center
//   value (with a pivot class), and the side above's (see
//   getDivergingClassValues())
// ascending: the data, in ascending order (needed by a ranked layout)
export function getContinuousDivergingClassifier(layout, values, nullValue, opts, ascending) {
  var stops = getDivergingStops(layout);
  var nb = stops.below.length;
  var na = stops.above.length;
  var ranks = layout.ranked ? getSideRanks(ascending, getSideEdges(layout)) : null;
  var low = nb > 0 ? getStopInterpolator(stops.below, values.slice(0, nb), opts, ranks && ranks.below) : null;
  var high = na > 0 ? getStopInterpolator(stops.above, values.slice(values.length - na), opts, ranks && ranks.above) : null;
  var center = layout.neutral ? values[nb] : null;
  var edges = getSideEdges(layout);
  return function(val) {
    if (!utils.isFiniteNumber(val)) return nullValue;
    if (layout.neutral && val >= edges[0] && val < edges[1]) return center;
    if (val < edges[0]) return (low || high)(val);
    return (high || low)(val);
  };
}

// sideRanks: the side's data, for placing values by rank (see getSideRanks())
function getStopInterpolator(stops, values, opts, sideRanks) {
  var getValue = getInterpolatedValueGetter(values, null, opts);
  var getRank = sideRanks ? getRankPositionFunction(sideRanks) : null;
  return function(val) {
    return getValue(getRank ? getRank(val) * (stops.length - 1) : getStopPosition(stops, val));
  };
}

// The position of a value among ascending stops (0 at the first stop, 1 at
// the second, ...), clamped to the stops
export function getStopPosition(stops, val) {
  var n = stops.length;
  if (!(val > stops[0])) return 0;
  for (var i=1; i<n; i++) {
    if (val <= stops[i]) {
      return stops[i] > stops[i - 1] ? i - 1 + (val - stops[i - 1]) / (stops[i] - stops[i - 1]) : i;
    }
  }
  return n - 1;
}

// The CLI's message about a layout
export function formatDivergingLayout(layout) {
  var parts = [layout.below + ' below'];
  if (layout.neutral) {
    parts.push('a pivot class from ' + layout.neutral[0] + ' to ' + layout.neutral[1]);
  }
  parts.push(layout.above + ' above');
  return 'Pivot: ' + tidyNumber(layout.pivot) + ' (classes: ' + parts.join(', ') + ')';
}

// pivotOpt: a number, 'median', 'mean' or 'auto' (0 if the data has
// values on both sides of 0, or else the median); with no pivot=, the
// middle of pivot-range=
export function resolvePivot(pivotOpt, ascending, range) {
  var n = ascending.length;
  var val = pivotOpt;
  if (val === undefined || val === null || val === '') {
    if (range) return (range[0] + range[1]) / 2;
    val = 'auto';
  }
  if (val == 'auto') {
    return ascending[0] < 0 && ascending[n - 1] > 0 ? 0 : getMedian(ascending);
  }
  if (val == 'median') return getMedian(ascending);
  if (val == 'mean') return utils.sum(ascending) / n;
  if (utils.isString(val) && val.trim() !== '' && !isNaN(+val)) val = +val;
  if (!utils.isFiniteNumber(val)) {
    stop('Invalid pivot:', pivotOpt, '(expected a number, median, mean or auto)');
  }
  return val;
}

function getMedian(ascending) {
  var n = ascending.length;
  var mid = Math.floor(n / 2);
  return n % 2 == 1 ? ascending[mid] : (ascending[mid - 1] + ascending[mid]) / 2;
}

// Returns {total} (all the classes, including a neutral class) or
// {below, above} (the classes on either side of it)
export function parseClassCounts(classes, hasNeutral) {
  var arr = Array.isArray(classes) ? classes : [classes];
  if (arr.length == 1 && utils.isInteger(arr[0]) && arr[0] >= 2) {
    return {total: arr[0]};
  }
  if (arr.length == 2 && arr.every(isCount) && arr[0] + arr[1] > 0) {
    return {below: arr[0], above: arr[1]};
  }
  stop('Invalid classes= for pivot=:', String(classes),
    '(expected a total number of classes, or the numbers below and above the pivot)');
}

function isCount(n) {
  return utils.isInteger(n) && n >= 0;
}

// Equal-interval and nice breaks: each side's classes step out from the
// pivot. Given a total, the two sides share one step, and the side with
// less data gets fewer classes. An automatic neutral class is one step
// wide, centered on the pivot.
function getIntervalLayout(ascending, pivot, hasNeutral, range, counts, nice) {
  var extents = [Math.max(0, pivot - ascending[0]), Math.max(0, ascending[ascending.length - 1] - pivot)];
  var auto = hasNeutral && !range;
  var fixed = range ? [pivot - range[0], range[1] - pivot] : [0, 0];
  var steps, offsets, sides;

  // distances from the pivot to each side's classes
  function getOffsets(steps) {
    var half;
    if (!auto) return fixed;
    half = Math.min(steps[0] || Infinity, steps[1] || Infinity) / 2;
    return isFinite(half) ? [half, half] : [0, 0];
  }

  function countSides(steps) {
    var offsets = getOffsets(steps);
    return [0, 1].map(function(i) {
      return getSideCount(extents[i], offsets[i], steps[i]);
    });
  }

  if (counts.total) {
    steps = getCommonStep(extents, counts.total - (hasNeutral ? 1 : 0), auto ? null : fixed, nice);
    sides = countSides(steps);
  } else {
    sides = [counts.below, counts.above];
    if (auto) {
      // the neutral class is one step wide, the narrower side's step
      offsets = getOffsets([0, 1].map(function(i) {
        return sides[i] > 0 ? extents[i] / (sides[i] + 0.5) : 0;
      }));
    } else {
      offsets = fixed;
    }
    sides = sides.map(function(n, i) {
      return sideHasData(extents[i] > offsets[i], n);
    });
    steps = [0, 1].map(function(i) {
      return sides[i] > 0 ? (extents[i] - offsets[i]) / sides[i] : 0;
    });
    if (nice) {
      steps = steps.map(getNiceStep);
      sides = countSides(steps);
    }
  }
  offsets = getOffsets(steps);
  return Object.assign(makeLayout(pivot, hasNeutral, pivot - offsets[0], pivot + offsets[1], sides[0], sides[1],
    getSteppedBreaks(pivot - offsets[0], -steps[0], sides[0]),
    getSteppedBreaks(pivot + offsets[1], steps[1], sides[1])), {
    extent: [pivot - offsets[0] - sides[0] * steps[0], pivot + offsets[1] + sides[1] * steps[1]]
  });
}

// The number of classes of a given step that reach from a side's inner edge
// (offset from the pivot) to its data extent
function getSideCount(extent, offset, step) {
  if (!(extent > offset) || !(step > 0)) return 0;
  return Math.max(1, Math.ceil((extent - offset) / step - 1e-9));
}

function sideHasData(hasData, count) {
  return hasData ? count : 0;
}

// Returns [step, step]: the step that gives the two sides a total of n
// classes, with the longer side's classes reaching just to the end of its
// data (or a total as close to n as the data allows, without going over).
// fixed: distances from the pivot to each side's classes, or null for half
//   a step (an automatic neutral class)
// nice: use the nice step that comes closest to n classes
function getCommonStep(extents, n, fixed, nice) {
  var candidates = [];
  var best = null;
  var count = function(s) {
    return extents.reduce(function(memo, extent, i) {
      return memo + getSideCount(extent, fixed ? fixed[i] : s / 2, s);
    }, 0);
  };
  // the steps at which a side's count of classes changes
  extents.forEach(function(extent, i) {
    for (var j=fixed ? 1 : 0; j<=n; j++) {
      candidates.push(fixed ? (extent - fixed[i]) / j : extent / (j + 0.5));
    }
  });
  candidates.filter(function(s) { return s > 0 && isFinite(s); })
    .sort(function(a, b) { return b - a; })
    .forEach(function(s) {
      var total = count(s);
      if (total <= n && (!best || total > best.total)) {
        best = {step: s, total: total};
      }
    });
  if (!best) return [0, 0];
  if (nice) {
    best = getNiceSteps(best.step).reduce(function(memo, s) {
      var total = count(s);
      var diff = Math.abs(total - n);
      return !memo || diff < memo.diff || diff == memo.diff && s > memo.step ?
        {step: s, diff: diff} : memo;
    }, null);
  }
  return [best.step, best.step];
}

// nice numbers: 1, 2, 2.5 or 5 times a power of 10
function getNiceSteps(val) {
  var exp = Math.floor(Math.log10(val));
  var steps = [];
  [exp - 1, exp, exp + 1].forEach(function(e) {
    [1, 2, 2.5, 5].forEach(function(m) {
      steps.push(tidyNumber(m * Math.pow(10, e)));
    });
  });
  return steps;
}

// the nice number nearest to val (on a log scale)
export function getNiceStep(val) {
  if (!(val > 0)) return val;
  return getNiceSteps(val).reduce(function(memo, s) {
    return Math.abs(Math.log(s / val)) < Math.abs(Math.log(memo / val)) ? s : memo;
  });
}

// the inner breaks of n classes stepping out from edge (step < 0 below the
// pivot), in ascending order
function getSteppedBreaks(edge, step, n) {
  var breaks = [];
  for (var i=1; i<n; i++) {
    breaks.push(edge + step * i);
  }
  return step < 0 ? breaks.reverse() : breaks;
}

// Quantile and hybrid breaks: each side's classes divide its own data.
// Given a total, the two sides' classes hold the same number of features,
// so the side with fewer features gets fewer classes. An automatic neutral
// class holds as many features as a class does on average, taken from those
// nearest the pivot, so its range is centered on the pivot.
// ranked: continuous quantile output, which places values by their rank on
// each side (see getSideRanks()); the stops are at evenly spaced ranks.
function getQuantileLayout(ascending, pivot, hasNeutral, range, counts, method, ranked) {
  var n = ascending.length;
  var getBreaks = method == 'hybrid' ? getHybridBreaks : getQuantileBreaks;
  var lo = pivot, hi = pivot;
  var classCount, inNeutral, dists, d, belowVals, aboveVals, sideClasses, below, above, sides;
  if (hasNeutral && range) {
    lo = range[0];
    hi = range[1];
  } else if (hasNeutral) {
    classCount = counts.total || counts.below + counts.above + 1;
    inNeutral = Math.max(1, Math.round(n / classCount));
    dists = ascending.map(function(val) { return Math.abs(val - pivot); })
      .sort(function(a, b) { return a - b; });
    // halfway to the next value out, so that no value sits on an edge
    d = inNeutral < n ? (dists[inNeutral - 1] + dists[inNeutral]) / 2 : dists[n - 1] * 2 + 1;
    lo = pivot - d;
    hi = pivot + d;
  }
  belowVals = ascending.filter(function(val) { return val < lo; });
  aboveVals = ascending.filter(function(val) { return val >= hi; });
  if (counts.total) {
    sideClasses = counts.total - (hasNeutral ? 1 : 0);
    below = splitClasses(sideClasses, belowVals.length, aboveVals.length);
    above = belowVals.length + aboveVals.length > 0 ? sideClasses - below : 0;
  } else {
    below = sideHasData(belowVals.length > 0, counts.below);
    above = sideHasData(aboveVals.length > 0, counts.above);
  }
  if (ranked) {
    sides = getSideRanks(ascending, [lo, hi]);
    return Object.assign(makeLayout(pivot, hasNeutral, lo, hi, below, above,
      below > 1 ? getRankBreaks(sides.below, below - 1) : [],
      above > 1 ? getRankBreaks(sides.above, above - 1) : []), {ranked: true});
  }
  return makeLayout(pivot, hasNeutral, lo, hi, below, above,
    below > 1 ? getBreaks(belowVals, below - 1) : [],
    above > 1 ? getBreaks(aboveVals, above - 1) : []);
}

// The values that each side of a ranked layout ranks: the side's data, with
// its inner edge (the pivot, or the edge of the pivot class) as the side's
// innermost value, so that ranks run from the edge out to the side's
// outermost value. Data at the edge itself rank as the edge.
function getSideRanks(ascending, edges) {
  return {
    below: ascending.filter(function(val) { return val < edges[0]; }).concat([edges[0]]),
    above: [edges[1]].concat(ascending.filter(function(val) { return val > edges[1]; }))
  };
}

// The number of n classes that go below the pivot, in proportion to the
// counts of features, giving each side that has features at least one
export function splitClasses(n, countBelow, countAbove) {
  var below;
  if (countBelow + countAbove === 0) return 0;
  below = Math.round(n * countBelow / (countBelow + countAbove));
  if (countBelow > 0 && below === 0 && n > 1) below = 1;
  if (countAbove > 0 && below == n && n > 1) below = n - 1;
  return below;
}

// User-defined breaks: a pivot that is one of the breaks divides the
// classes; one inside a class makes that class the neutral class.
function getBreaksLayout(breaks, pivot, hasNeutral) {
  var b = breaks.length;
  var k = breaks.indexOf(pivot);
  var i;
  if (k > -1) {
    return {pivot: pivot, neutral: null, below: k + 1, above: b - k, breaks: breaks};
  }
  for (i=0; i<b && breaks[i] < pivot; i++);
  // the pivot is in class i
  if (!hasNeutral) {
    stop('Without a pivot class, the pivot must be one of the breaks');
  }
  return {
    pivot: pivot,
    neutral: [i > 0 ? breaks[i - 1] : -Infinity, i < b ? breaks[i] : Infinity],
    below: i,
    above: b - i,
    breaks: breaks
  };
}

function makeLayout(pivot, hasNeutral, lo, hi, below, above, breaksBelow, breaksAbove) {
  var breaks = breaksBelow.concat();
  if (hasNeutral) {
    if (below > 0) breaks.push(lo);
    if (above > 0) breaks.push(hi);
  } else if (below > 0 && above > 0) {
    breaks.push(pivot);
  }
  return {
    pivot: pivot,
    neutral: hasNeutral ? [lo, hi] : null,
    below: below,
    above: above,
    breaks: breaks.concat(breaksAbove)
  };
}

// rounds off floating point noise, like 0.30000000000000004
function tidyNumber(val) {
  return isFinite(val) ? +val.toPrecision(12) : val;
}
