import utils from '../utils/mapshaper-utils';
import { stop, error, message, formatColumns } from '../utils/mapshaper-logging';
import { getNiceBreaks } from '../classification/mapshaper-nice-breaks';
import { getRoundingFunction } from '../geom/mapshaper-rounding';

// convert an index (0 ... n-1, -1, -2) to a corresponding discreet value
export function getDiscreteValueGetter(values, nullValue, otherValue) {
  var n = values.length;
  return function(i) {
    if (i >= 0 && i < n) {
      return values[i];
    }
    if (i == -2) {
      return otherValue === undefined ? nullValue : otherValue;
    }
    return nullValue;
  };
}

// convert a continuous index ([0, n-1], -1) to a corresponding interpolated value
export function getInterpolatedValueGetter(values, nullValue) {
  var d3 = require('d3-interpolate');
  var interpolators = [];
  var tmax = values.length - 1;
  for (var i=1; i<values.length; i++) {
    interpolators.push(d3.interpolate(values[i-1], values[i]));
  }
  return function(t) {
    if (t == -1) return nullValue;
    if ((t >= 0 && t <= tmax) === false) {
      error('Range error');
    }
    var i = t == tmax ? tmax - 1 : Math.floor(t);
    var j = t == tmax ? 1 : t % 1;
    return interpolators[i](j);
  };
}

// categories: strings to match in the data
export function getCategoricalClassifier(categories) {
  return function(val) {
    var i = categories.indexOf(val);
    if (i >= 0) return i;
    if (val) return -2; // field contains an 'other' value
    return -1; // field is empty (null value)
  };
}

// uses linear interpolation between breakpoints
// (perhaps not ideal for long-tail distributions)
// breaks: array of (0 or more) inner breakpoints
export function getContinuousClassifier(breaks, minVal, maxVal) {
  return function(val) {
    var n = breaks.length;
    var min, max, j;
    if (!utils.isValidNumber(val) || val < minVal || val > maxVal){
      return -1;
    }
    for (var i=0; i<=n; i++) {
      max = i === n ? maxVal : breaks[i];
      if (i === n || val < max) {
        min = i === 0 ? minVal : breaks[i-1];
        j = (val - min) / (max - min);
        return i + j;
      }
    }
    error('Range error');
  };
}

// return an array of n values
// assumes that values can be interpolated by d3-interpolate
// (colors and numbers should work)
export function interpolateValuesToClasses(values, n) {
  if (values.length == n) return values;
  var d3 = require('d3-interpolate');
  var numPairs = values.length - 1;
  var output = [values[0]];
  var k, j, t, intVal;
  for (var i=1; i<n-1; i++) {
    k = i / (n-1) * numPairs;
    j = Math.floor(k);
    t = k - j;
    intVal = d3.interpolate(values[j], values[j+1])(t);
    output.push(intVal);
  }
  output.push(values[values.length - 1]);
  return output;
}

export function getSequentialClassifier(dataValues, numBuckets, opts) {
  // continuously interpolated colors/values use one fewer breakpoint than
  // discreetly classed values
  var numBreaks = numBuckets - 1;
  var round = opts.precision ? getRoundingFunction(opts.precision) : null;
  var method = opts.method || 'quantile';
  var breaks;

  if (round) {
    dataValues = dataValues.map(round);
  }

  var ascending = getAscendingNumbers(dataValues);
  var nullCount = dataValues.length - ascending.length;

  if (numBreaks === 0) {
    breaks = [];
  } else if (opts.breaks) {
    // user-defined breaks
    breaks = opts.breaks;
  } else if (method == 'equal-interval') {
    breaks = getEqualIntervalBreaks(ascending, numBreaks);
  } else if (method == 'quantile') {
    breaks = getQuantileBreaks(ascending, numBreaks);
  } else if (method == 'hybrid') {
    breaks = getHybridBreaks(ascending, numBreaks);
  } else if (method == 'nice') {
    breaks = getNiceBreaks(ascending, numBreaks);
    message('Nice breaks:', breaks);
  } else {
    stop('Unknown classification method:', method);
  }

  printDistributionInfo(ascending, breaks, nullCount);

  return opts.continuous ?
    getContinuousClassifier(breaks, ascending[0], ascending[ascending.length - 1]) :
    getDiscreteClassifier(breaks, round);
}

export function getClassRanges(breaks, ascending) {
  var ranges = [];
  var ids, geBound, ltBound, limit, range;
  for (var breakId=0, i=0; breakId <= breaks.length; breakId++) {
    geBound = breakId === 0 ? -Infinity : breaks[breakId-1];
    ltBound = breakId < breaks.length ? breaks[breakId] : Infinity;
    ids = getClassRange(ascending, geBound, ltBound, i);
    if (ids) {
      // the usual case: a bucket containing >0 values
      range = [ascending[ids[0]], ascending[ids[1]]];
      i = ids[1];
    } else if (breakId === 0) {
      // left-most bucket, empty
      range = [ltBound, ltBound];
    } else if (breakId < breaks.length) {
      // internal bucket, empty
      range = [geBound, ltBound];
    } else {
      // right-most bucket, empty
      range = [geBound, geBound];
    }
    ranges.push(range);
  }
  return ranges;
}

// Gets the first and last value in a sequential class (bucket)
// Returns null if bucket is empty
// i: an index into the array of sorted numbers,
//    at or before the first number in the bucket
function getClassRange(ascending, geBound, ltBound, i) {
  var n = ascending.length;
  var rangeStart = -1, rangeEnd = -1;
  var val;
  while (i < n) {
    val = ascending[i];
    if (val >= ltBound) break;
    if (rangeStart == -1 && val >= geBound) {
      rangeStart = i;
    }
    rangeEnd = i;
    i++;
  }
  return rangeStart > -1 && rangeEnd > -1 ? [rangeStart, rangeEnd] : null;
}

function printDistributionInfo(ascending, breaks, nulls) {
  var dist = getDistributionData(breaks, ascending);
  var tableRows = getClassRanges(breaks, ascending).map(function(range, i) {
    return [`${range[0]} - ${range[1]}`, `(${dist[i]})`];
  });
  tableRows.push(['null or non-numeric values', `(${nulls})`]);
  // message('Computed breaks:', breaks);
  // message('Distribution:', dist.join(','));
  message('Data ranges and (feature counts):\n' + formatColumns(tableRows, ['left', 'right']));
  if (nulls) {
    // message('Null values:', nulls);
  }
}

export function getDiscreteClassifier(breaks, round) {
  var inverted = false; // breaks are in descending sequence
  // if (values.length != breaks.length + 1) {
  //   stop("Number of values should be one more than number of class breaks");
  // }
  // validate breaks
  // Accepts repeated values -- should this be allowed?
  if (testAscendingNumbers(breaks)) {
    // normal state
  } else if (testDescendingNumbers(breaks)) {
    breaks = breaks.concat().reverse();
    inverted = true;
  } else {
    stop('Invalid class breaks:', breaks.join(','));
  }
  return function(val) {
    var i = -1;
    if (Number(val) === val) { // exclude null, NaN, strings, etc.
      if (round) val = val(round);
      i = getClassId(val, breaks);
    }
    if (inverted && i > -1) {
      i = breaks.length - i;
    }
    return i;
  };
}

export function getEqualIntervalBreaks(ascending, numBreaks) {
  var numRanges = numBreaks + 1,
      minVal = ascending[0],
      maxVal = ascending[ascending.length - 1],
      interval = (maxVal - minVal) / numRanges,
      breaks = [],
      i;
  for (i = 1; i<numRanges; i++) {
    breaks.push(minVal + i * interval);
  }
  return breaks;
}

export function getQuantileBreaks(ascending, numBreaks) {
  var numRanges = numBreaks + 1;
  var n = ascending.length / numRanges;
  var breaks = [];
  var i, j;
  for (i = 1; i<numRanges; i++) {
    j = Math.floor(i * n);
    breaks.push(ascending[j]);
  }
  return breaks;
}

// inner breaks have equal-interval spacing
// first and last bucket are sized like quantiles (they are sized to contain
// a proportional share of the data)
export function getHybridBreaks(ascending, numBreaks) {
  var quantileBreaks = getQuantileBreaks(ascending, numBreaks);
  if (numBreaks < 3) return quantileBreaks;
  var lowerBreak = quantileBreaks[0];
  var upperBreak = quantileBreaks[quantileBreaks.length-1];
  var innerValues = ascending.filter(function(val) {
    return val >= lowerBreak && val < upperBreak;
  });
  var innerBreaks = getEqualIntervalBreaks(innerValues, numBreaks - 2);
  var breaks = [lowerBreak].concat(innerBreaks).concat(upperBreak);
  return breaks;
}

export function getDistributionData(breaks, ascending) {
  var arr = utils.initializeArray(new Array(breaks.length + 1), 0);
  var nulls = 0;
  ascending.forEach(function(val) {
    var i = getClassId(val, breaks);
    if (i == -1) {
      error('Indexing error');
    } else {
      arr[i]++;
    }
  });
  return arr;
}

export function getAscendingNumbers(values) {
  var numbers = values.filter(utils.isFiniteNumber);
  utils.genericSort(numbers, true);
  return numbers;
}

function arraysAreIdentical(a, b) {
  for (var i=0; i<a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return a.length == b.length;
}

function testAscendingNumbers(arr) {
  return arraysAreIdentical(arr, utils.genericSort(arr.map(parseFloat)));
}

function testDescendingNumbers(arr) {
  return arraysAreIdentical(arr, utils.genericSort(arr.map(parseFloat), false));
}

// breaks: threshold values between ranges (ascending order)
// Returns array index of a sequential range, or -1 if @val not numeric
export function getClassId(val, breaks) {
  var i = 0;
  if (!utils.isValidNumber(val)) {
    return -1;
  }
  while (i < breaks.length && val >= breaks[i]) i++;
  return i;
}
