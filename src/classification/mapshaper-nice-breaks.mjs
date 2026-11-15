import { getQuantileBreaks, getEqualIntervalBreaks, getDistributionData } from '../classification/mapshaper-class-stats';
import { stop, error } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { getRoundingFunction } from '../geom/mapshaper-rounding';

var scaledIntervals =
  [10,12,15,18,20,22,25,30,35,40,45,50,60,70,80,90,100];
var precisions =
  [10, 2, 5, 2,10, 2, 5,10, 5,10, 5,50,10,10,10,10,10];


function getNormalPrecision(scaledInterval) {
  var i = scaledIntervals.indexOf(scaledInterval);
  return precisions[i] || error('Unknown error');
}

// return a weighting (0-1) to add strength to classifications that use
// rounder numbers
function getRoundnessScore(interval, precision) {
  return precision >= 50 && 1 || precision >= 10 && 0.9 || precision >= 5 && 0.8 || 0.7;
}

export function getNiceBreaks(values, numBreaks) {
  var initialBreaks = getQuantileBreaks(values, numBreaks);
  if (numBreaks > 1 && initialBreaks[0] == initialBreaks[numBreaks - 1]) {
    // the quantile breaks fell on a single value, leaving no range to divide
    initialBreaks = getEqualIntervalBreaks(values, numBreaks);
  }
  var lowerBreak = initialBreaks[0];
  var upperBreak = initialBreaks[initialBreaks.length-1];
  var dataRange = values[values.length - 1] - values[0];
  var data = getCandidateBreaks(lowerBreak, upperBreak, numBreaks, dataRange);
  // add distribution data and quality metric to each candidate
  data.forEach(function(o) {
    var distribution = getDistributionData(o.breaks, values);
    o.distribution = getDistributionData(o.breaks, values);
    o.quality = o.roundness * evaluateDistribution(o.distribution);
  });
  utils.sortOn(data, 'quality', false);
  return data[0].breaks;
}


export function evaluateDistribution(distribution) {
  var ideal = utils.sum(distribution) / distribution.length;
  var first = distribution[0];
  var last = distribution[distribution.length - 1];
  var q = (bucketScore(ideal, first) + bucketScore(ideal, last)) / 2;
  return q;
}

// downweight buckets the more they deviate from an ideal size
function bucketScore(ideal, actual) {
  if (actual > ideal) {
    return ideal / actual;
  } else {
    return ideal / (2 * ideal - actual);
  }
}

// kludge to avoid rounding errors in break values
function applyScale(normalVal, scale) {
  if (scale < 1) {
    return normalVal * Math.round(1 / scale);
  }
  return normalVal / scale;
}

function getCandidateBreaks(lowerBreak, upperBreak, numBreaks, dataRange) {
  var cands = [];
  // calculate rounding using equal interval, when possible
  var maxBreak = Math.max(Math.abs(lowerBreak), Math.abs(upperBreak));
  var subRange = numBreaks >= 2 ?
      (upperBreak - lowerBreak) / (numBreaks - 1) : maxBreak;
  if (subRange > 0 === false) {
    // a single break at 0
    subRange = dataRange / (numBreaks + 1);
  }
  var scale = getRangeScale(subRange);
  var scaledRange = scale * subRange;
  var scaledIntervals = getNiceIntervals(scaledRange);
  scaledIntervals.forEach(function(scaledInterval) {
    var scaledPrecision = getNormalPrecision(scaledInterval);
    var interval = applyScale(scaledInterval, scale);
    var precision = applyScale(scaledPrecision, scale);
    var fenceposts = getBreakFenceposts(lowerBreak, precision);
    fenceposts.forEach(function(lowBound) {
      cands.push({
        interval: interval,
        precision: precision,
        roundness: getRoundnessScore(scaledInterval, scaledPrecision),
        breaks: getRoundBreaks(lowBound, interval, numBreaks)
      });
    });
  });
  return cands;
}


function getRoundBreaks(lowerBreak, interval, numBreaks) {
  var breaks = [lowerBreak];
  for (var i=1; i<numBreaks; i++) {
    breaks.push(lowerBreak + interval * i);
  }
  return breaks;
}

function getBreakFenceposts(val, precision) {
  var boundVal = getRoundingFunction(precision)(val);
  var boundVal2 = boundVal + (val > boundVal ? precision : -precision);
  var fenceposts = boundVal < boundVal2 ? [boundVal, boundVal2] : [boundVal2, boundVal];
  return fenceposts;
}

function getNiceIntervals(scaledRange) {
  var intervals = scaledIntervals;
  var lower, upper;
  for (var i=1; i<intervals.length; i++) {
    lower = intervals[i-1];
    upper = intervals[i];
    if (scaledRange >= lower && scaledRange <= upper) {
      return [lower, upper];
    }
  }
  error('Range error');
}

function getRangeScale(range) {
  var s = 1;
  if (range > 0.0001 === false || range < 1e9 === false) {
    stop('Data range error');
  }
  while (range > 100) {
    range /= 10;
    s /= 10;
  }
  while (range < 10) {
    range *= 10;
    s *= 10;
  }
  return s;
}
