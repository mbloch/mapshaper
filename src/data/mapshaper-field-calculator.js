/* @requires mapshaper-expressions */

// Calculate expressions like 'sum(field)' or '_.sum(field)' and return results like: {sum: 14}
//
MapShaper.getCalcResults = function(lyr, arcs, opts) {
  var calcExp = MapShaper.compileFeatureExpression(opts.expression, lyr, arcs),
      calculator = new FeatureCalculator(),
      n = MapShaper.getFeatureCount(lyr),
      whereExp = opts.where ? MapShaper.compileFeatureExpression(opts.where, lyr, arcs) : null,
      results;

  // add functions to expression context
  utils.extend(calcExp.context, calculator.functions);
  calcExp.context._ = calculator.functions; // add as members of _ object too

  utils.repeat(n, function(i) {
    if (!whereExp || whereExp(i)) {
      calcExp(i);
    }
  });
  return calculator.done();
};

// Return a function to evaluate expressions like 'sum(field) > 100'
// (used by mapshaper-subdivide)
MapShaper.compileCalcExpression = function(exp) {
  var compiled = function(lyr, arcs) {
    var env = MapShaper.getCalcContext(lyr, arcs);
    var func, retn;
    try {
      func = new Function("env", "with(env){return " + exp + ";}");
      retn = func.call(null, env);
    } catch(e) {
      message('Error ' + (!!func ? 'compiling' : 'running') + ' expression "' + exp + '"');
      stop(e);
    }
    return retn;
  };
  return compiled;
};

MapShaper.getCalcContext = function(lyr, arcs) {
  var calc = new FeatureCalculator();
  var fields = lyr.data ? lyr.data.getFields() : [];
  var env = fields.reduce(function(memo, f) {
    memo[f] = f;
    return memo;
  }, {});
  utils.forEach(calc.functions, function(val, key) {
    env[key] = function(fname) {
      var exp = "_." + key + "(" + fname + ");";
      var results = MapShaper.getCalcResults(lyr, arcs, {expression: exp});
      return results[key];
    };
  });
  return env;
};

function FeatureCalculator() {
  var api = {},
      count = 0,
      sum = 0,
      sumFlag = false,
      avgSum = 0,
      avgCount = 0,
      min = Infinity,
      max = -Infinity,
      medianArr = [];

  api.sum = function(val) {
    sum += val;
    sumFlag = true;
  };

  api.count = function() {
    count++;
  };

  api.average = function(val) {
    avgCount++;
    avgSum += val;
  };

  api.median = function(val) {
    medianArr.push(val);
  };

  api.max = function(val) {
    if (val > max) max = val;
  };

  api.min = function(val) {
    if (val < min) min = val;
  };

  function done() {
    var results = {};
    if (sumFlag) results.sum = sum;
    if (avgCount > 0) results.average = avgSum / avgCount;
    if (medianArr.length > 0) results.median = utils.findMedian(medianArr);
    if (min < Infinity) results.min = min;
    if (max > -Infinity) results.max = max;
    if (count > 0) results.count = count;
    return results;
  }

  return {
    done: done,
    functions: api
  };
}
