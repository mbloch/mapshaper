/* @requires
mapshaper-expressions
mapshaper-dataset-utils
mapshaper-filter
*/

// Calculate an expression across a group of features, print and return the result
// Supported functions include sum(), average(), max(), min(), median(), count()
// Functions receive a field name or a feature expression (like the -each command)
// Examples: 'sum("$.area")' 'min(income)'
// opts.expression  Expression to evaluate
// opts.where  Optional filter expression (like -filter command)
//
api.calc = function(lyr, arcs, opts) {
  var msg = 'calc ' + opts.expression,
      result;
  if (opts.where) {
    // TODO: implement no_replace option for filter() instead of this
    lyr = {
      shapes: lyr.shapes,
      data: lyr.data
    };
    api.filterFeatures(lyr, arcs, {expression: opts.where});
    msg += ' where ' + opts.where;
  }
  result = MapShaper.evalCalcExpression(lyr, arcs, opts.expression);
  message(msg + ":  " + result);
  return result;
};

MapShaper.evalCalcExpression = function(lyr, arcs, exp) {
  var calc = MapShaper.compileCalcExpression(exp);
  return calc(lyr, arcs);
};

// Return a function to evaluate a calc expression
// (also used by mapshaper-subdivide.js)
MapShaper.compileCalcExpression = function(exp) {
  return function(lyr, arcs) {
    var env = MapShaper.getCalcExpressionContext(lyr, arcs),
        calc, retn;
    try {
      calc = new Function("env", "with(env){return " + exp + ";}");
      retn = calc.call(null, env);
    } catch(e) {
      message('Error ' + (calc ? 'compiling' : 'running') + ' expression: "' + exp + '"');
      stop(e);
    }
    return retn;
  };
};

MapShaper.getCalcExpressionContext = function(lyr, arcs) {
  var env = MapShaper.getBaseContext();
  if (lyr.data) {
    lyr.data.getFields().forEach(function(f) {
      env[f] = f;
    });
  }
  MapShaper.initCalcFunctions(env, lyr, arcs);
  return env;
};

MapShaper.initCalcFunctions = function(env, lyr, arcs) {
  var functions = Object.keys(new FeatureCalculator().functions);
  functions.forEach(function(fname) {
    env[fname] = MapShaper.getCalcFunction(fname, lyr, arcs);
  });
};

MapShaper.getCalcFunction = function(fname, lyr, arcs) {
  return function(rawExp) {
    var exp = MapShaper.validateExpression(rawExp);
    var calculator = new FeatureCalculator();
    var func = calculator.functions[fname];
    var compiled = MapShaper.compileFeatureExpression(exp, lyr, arcs);
    utils.repeat(MapShaper.getFeatureCount(lyr), function(i) {
      func(compiled(i));
    });
    return calculator.done()[fname];
  };
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
