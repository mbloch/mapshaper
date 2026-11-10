import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// Compiles the calc= expression of a raster join. As with
// compileCalcExpression(), the expression is evaluated in two phases: once per
// pixel, to feed the arguments of each aggregate function to an accumulator,
// and once per target, to compute the results and make assignments.
//
// Each pixel has a weight, the fraction of the pixel inside the target polygon
// (1 when joining by pixel centers). Aggregates use it: sum() is the weighted
// sum, mean() the weighted mean, count() the total weight, median() and
// quantile() are weighted quantiles and mode() is the value with the largest
// total weight. min(), max(), collect(), first(), last(), every() and some()
// ignore it.
//
// @pixelLyr: a layer with a single data record, which the caller updates with
//   the values of each pixel before calling addPixel()
// @pixelCenters: true if every weight is 1. Quantiles are then calculated
//   like those of compileCalcExpression().
// Returns {addPixel(weight), finish(destRec)}
export function compileRasterCalcExpression(exp, pixelLyr, pixelCenters) {
  var weight = 0, rowNo = 0, colNo = 0, colCount = -1, cols = [];
  var QuantileAccumulator = getQuantileAccumulator(!pixelCenters);
  var accumulators = {
    count: CountAccumulator,
    sum: SumAccumulator,
    average: MeanAccumulator,
    mean: MeanAccumulator,
    median: QuantileAccumulator,
    quantile: QuantileAccumulator,
    iqr: QuantileAccumulator,
    quartile1: QuantileAccumulator,
    quartile2: QuantileAccumulator,
    quartile3: QuantileAccumulator,
    min: MinAccumulator,
    max: MaxAccumulator,
    mode: ModeAccumulator,
    collect: CollectAccumulator,
    first: FirstAccumulator,
    last: LastAccumulator,
    every: EveryAccumulator,
    some: SomeAccumulator
  };
  var results = {
    median: function(acc) { return acc.quantile(0.5); },
    quantile: function(acc, k) { return acc.quantile(k); },
    iqr: function(acc) { return acc.quantile(0.75) - acc.quantile(0.25); },
    quartile1: function(acc) { return acc.quantile(0.25); },
    quartile2: function(acc) { return acc.quantile(0.5); },
    quartile3: function(acc) { return acc.quantile(0.75); }
  };
  var ctx1 = {}, ctx2 = {};
  Object.keys(accumulators).forEach(function(name) {
    ctx1[name] = getCaptureFunction(accumulators[name]);
    ctx2[name] = getResultFunction(accumulators[name], results[name]);
  });

  // Replace && / || with commas so phase 1 evaluates every operand (see
  // compileCalcExpression()).
  var calc1 = compileFeatureExpression(exp.replace(/&&|\|\|/g, ','), pixelLyr, null, {
      context: ctx1, no_assign: true, no_warn: true, no_return: true});
  var calc2 = compileFeatureExpression(exp, pixelLyr, null, {context: ctx2, no_warn: true});

  return {
    addPixel: function(w) {
      weight = w;
      calc1(0);
      if (rowNo === 0) {
        colCount = colNo;
      } else if (colNo != colCount) {
        evaluationError();
      }
      rowNo++;
      colNo = 0;
    },
    // @destRec: record that receives assignments
    finish: function(destRec) {
      var result = calc2(undefined, destRec);
      rowNo = 0;
      colNo = 0;
      colCount = -1;
      cols = [];
      return result;
    }
  };

  function getCaptureFunction(Accumulator) {
    return function(val) {
      var acc = cols[colNo];
      if (!acc) {
        if (rowNo > 0) evaluationError();
        acc = cols[colNo] = new Accumulator();
      } else if (!(acc instanceof Accumulator)) {
        evaluationError();
      }
      acc.add(val, weight);
      colNo++;
      return val;
    };
  }

  function getResultFunction(Accumulator, getResult) {
    var empty = new Accumulator().empty;
    return function(val, arg) {
      var acc = cols[colNo++];
      if (rowNo === 0 || !acc) return empty;
      return getResult ? getResult(acc, arg) : acc.result();
    };
  }
}

// Each pixel must call the same aggregate functions in the same order, which a
// condition can break, e.g. band1 > 0 ? sum(band1) : 0 (see capture() in
// compileCalcExpression())
function evaluationError() {
  stop('Evaluation failed: an expression with a condition must call the same functions for every pixel');
}

function requireNumber(val) {
  if (isNaN(val) && val) { // accepting falsy values, like compileCalcExpression()
    stop('Expected a number, received:', val);
  }
}

function CountAccumulator() {
  var total = 0;
  this.empty = 0;
  this.add = function(val, w) { total += w; };
  this.result = function() { return total; };
}

function SumAccumulator() {
  var total = 0;
  this.empty = 0;
  this.add = function(val, w) {
    requireNumber(val);
    if (val) total += val * w;
  };
  this.result = function() { return total; };
}

function MeanAccumulator() {
  var total = 0, totalWeight = 0;
  this.empty = null;
  this.add = function(val, w) {
    requireNumber(val);
    if (isNaN(val)) return;
    total += val * w;
    totalWeight += w;
  };
  this.result = function() { return totalWeight > 0 ? total / totalWeight : null; };
}

function MinAccumulator() {
  var min = Infinity;
  this.empty = null;
  this.add = function(val) {
    requireNumber(val);
    if (val < min) min = +val;
  };
  this.result = function() { return min < Infinity ? min : null; };
}

function MaxAccumulator() {
  var max = -Infinity;
  this.empty = null;
  this.add = function(val) {
    requireNumber(val);
    if (val > max) max = +val;
  };
  this.result = function() { return max > -Infinity ? max : null; };
}

function getQuantileAccumulator(weighted) {
  return function QuantileAccumulator() {
    var values = [], weights = [], sorted = null;
    this.empty = null;
    this.add = function(val, w) {
      requireNumber(val);
      if (isNaN(val)) return;
      values.push(+val);
      weights.push(w);
    };
    this.quantile = function(k) {
      if (values.length === 0) return null;
      if (!weighted) return utils.findQuantile(values, k);
      if (!sorted) sorted = sortWeightedValues(values, weights);
      return findWeightedQuantile(sorted.values, sorted.weights, k);
    };
  };
}

function ModeAccumulator() {
  var totals = new Map();
  this.empty = null;
  this.add = function(val, w) {
    if (val !== val) return; // nodata
    totals.set(val, (totals.get(val) || 0) + w);
  };
  // Ties go to the value seen first, like getMode()
  this.result = function() {
    var max = -Infinity, mode = null;
    totals.forEach(function(total, val) {
      if (total > max) {
        max = total;
        mode = val;
      }
    });
    return mode;
  };
}

function CollectAccumulator() {
  var values = [];
  this.empty = null;
  this.add = function(val) { values.push(val); };
  this.result = function() { return values; };
}

function FirstAccumulator() {
  var first, found = false;
  this.empty = null;
  this.add = function(val) {
    if (!found) {
      first = val;
      found = true;
    }
  };
  this.result = function() { return first; };
}

function LastAccumulator() {
  var last;
  this.empty = null;
  this.add = function(val) { last = val; };
  this.result = function() { return last; };
}

function EveryAccumulator() {
  var every = true;
  this.empty = false;
  this.add = function(val) { every = every && !!val; };
  this.result = function() { return every; };
}

function SomeAccumulator() {
  var some = false;
  this.empty = false;
  this.add = function(val) { some = some || !!val; };
  this.result = function() { return some; };
}

function sortWeightedValues(values, weights) {
  var ids = new Uint32Array(values.length).map(function(_, i) { return i; });
  ids.sort(function(a, b) { return values[a] - values[b]; });
  return {
    values: Array.from(ids, function(i) { return values[i]; }),
    weights: Array.from(ids, function(i) { return weights[i]; })
  };
}

// The usual weighted percentile: each value is placed at the middle of its
// share of the total weight, with linear interpolation between neighboring
// values. (utils.findQuantile() can't be generalized for this: it puts the
// smallest and largest values at 0 and 1 whatever their weights, so the median
// of two pixels would always be their midpoint.) With equal weights the median
// is the same as utils.findMedian(), but other quantiles are a little closer
// to the median than utils.findQuantile() puts them.
// @values: sorted values; @weights: their (positive) weights
export function findWeightedQuantile(values, weights, k) {
  var n = values.length;
  var total = 0, cum = 0, pos, prevPos, i;
  if (n === 0 || !(k >= 0 && k <= 1)) return NaN;
  for (i = 0; i < n; i++) total += weights[i];
  for (i = 0; i < n; i++) {
    pos = (cum + weights[i] / 2) / total;
    if (pos >= k) {
      if (i === 0 || pos == prevPos) return values[i];
      return values[i - 1] + (values[i] - values[i - 1]) * (k - prevPos) / (pos - prevPos);
    }
    cum += weights[i];
    prevPos = pos;
  }
  return values[n - 1];
}
