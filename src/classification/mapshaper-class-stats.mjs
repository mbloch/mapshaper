// Pure stats helpers used by the sequential classifier and its sister
// modules (-nice-breaks, -key). Extracted so that nice-breaks.mjs and
// furniture/key.mjs can compute breaks/distributions without importing
// from the classifier (which would otherwise create a cycle).

import utils from '../utils/mapshaper-utils';
import { error } from '../utils/mapshaper-logging';

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
