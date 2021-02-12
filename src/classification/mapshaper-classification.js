import utils from '../utils/mapshaper-utils';
import { stop, error } from '../utils/mapshaper-logging';

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


export function getDataRange(values) {
  var ascending = getAscendingNumbers(values);
  if (ascending.length > 0 === false) {
    return [-Infinity, Infinity]; // throw error instead?
  }
  return [ascending[0], ascending[ascending.length - 1]];
}

// uses linear interpolation between breakpoints
// (perhaps not ideal for long-tail distributions)
// breaks: array of (0 or more) inner breakpoints
// range: [min, max] range of the dataset
export function getContinuousClassifier(breaks, range) {
  var minVal = range[0];
  var maxVal = range[1];
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

export function getSequentialClassifier(breaks, round) {
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

export function getEqualIntervalBreaks(values, numBreaks) {
  var numRanges = numBreaks + 1,
      ascending = getAscendingNumbers(values),
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

export function getQuantileBreaks(values, numBreaks) {
  var numRanges = numBreaks + 1;
  var ascending = getAscendingNumbers(values);
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
export function getHybridBreaks(values, numBreaks) {
  var quantileBreaks = getQuantileBreaks(values, numBreaks);
  if (numBreaks < 3) return quantileBreaks;
  var lowerBreak = quantileBreaks[0];
  var upperBreak = quantileBreaks[quantileBreaks.length-1];
  var innerValues = values.filter(function(val) {
    return val >= lowerBreak && val < upperBreak;
  });
  var innerBreaks = getEqualIntervalBreaks(innerValues, numBreaks - 2);
  var breaks = [lowerBreak].concat(innerBreaks).concat(upperBreak);
  return breaks;
}

export function getDistributionData(breaks, values) {
  var arr = utils.initializeArray(new Array(breaks.length + 1), 0);
  var nulls = 0;
  values.forEach(function(val) {
    var i = getClassId(val, breaks);
    if (i == -1) {
      nulls++;
    } else {
      arr[i]++;
    }
  });
  arr.nulls = nulls;
  return arr;
}

function getAscendingNumbers(values) {
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
