import utils from '../utils/mapshaper-utils';
import { stop, message, error, formatColumns } from '../utils/mapshaper-logging';
import { getRoundingFunction } from '../geom/mapshaper-rounding';
import { getNiceBreaks } from '../classification/mapshaper-nice-breaks';
import { getOutputFunction } from '../classification/mapshaper-classification';
import { makeSimpleKey, makeDatavizKey, makeGradientKey } from '../furniture/mapshaper-key';

export function getSequentialClassifier(classValues, nullValue, dataValues, method, opts) {
  var numValues = classValues.length;
  var numBuckets = opts.continuous ? numValues - 1 : numValues;

  // continuously interpolated colors/values use one fewer breakpoint than
  // discreetly classed values
  var numBreaks = numBuckets - 1;
  var round = opts.precision ? getRoundingFunction(opts.precision) : null;
  var breaks, classifier, dataToClass, classToValue;

  if (round) {
    dataValues = dataValues.map(round);
  }

  var ascending = getAscendingNumbers(dataValues);
  if (opts.outer_breaks) {
    ascending = applyDataRange(ascending, opts.outer_breaks);
  }
  var nullCount = dataValues.length - ascending.length;
  var minVal = ascending[0];
  var maxVal = ascending[ascending.length - 1];

  var clamp = opts.outer_breaks ? function(val) {
    if (val < opts.outer_breaks[0]) val = opts.outer_breaks[0];
    if (val > opts.outer_breaks[1]) val = opts.outer_breaks[1];
    return val;
  } : null;

  if (opts.outer_breaks) {
    minVal = opts.outer_breaks[0];
    maxVal = opts.outer_breaks[1];
  }

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

  if (opts.continuous) {
    dataToClass = getContinuousClassifier(breaks, minVal, maxVal);
  } else {
    dataToClass = getDiscreteClassifier(breaks, round);
  }
  classToValue = getOutputFunction(classValues, nullValue, opts);
  classifier = function(val) {
    if (clamp) val = clamp(val);
    return classToValue(dataToClass(val));
  };

  // generate a key if we've got colors and a key style
  if (opts.colors && (opts.key || opts.key_style)) {
    if (opts.key_style == 'gradient' && opts.continuous) {
      makeGradientKey(classifier, breaks, minVal, maxVal, opts);
    // } else if (opts.key_style == 'dataviz' && opts.continuous) {
    //   makeGradientDatavizKey(classifier, breaks, ascending, opts);
    } else if (opts.key_style == 'dataviz') {
      makeDatavizKey(classValues, breaks, ascending, opts);
    } else if (opts.key || opts.key_style == 'simple') {
      makeSimpleKey(classValues, breaks, minVal, maxVal, opts);
    }
  }

  return classifier;
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

export function applyDataRange(values, range) {
  var minval = range[0];
  var maxval = range[1];
  if (maxval > minval === false) {
    stop('Invalid data range:', range);
  }
  var values2 = values.map(function(val) {
    if (val < minval) val = minval;
    if (val > maxval) val = maxval;
    return val;
  });
  if (values2[0] < minval) {
    values2.unshift(minval);
  }
  if (values2[values2.length - 1] < maxval) {
    values2.push(maxval);
  }
  return values2;
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
