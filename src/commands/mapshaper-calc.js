/* @requires
mapshaper-expressions
mapshaper-dataset-utils
mapshaper-filter
*/

// Calculate an expression across a group of features, print and return the result
// Supported functions include sum(), average(), max(), min(), median(), count()
// Functions receive an expression to be applied to each feature (like the -each command)
// Examples: 'sum($.area)' 'min(income)'
// opts.expression  Expression to evaluate
// opts.where  Optional filter expression (see -filter command)
//
api.calc = function(lyr, arcs, opts) {
  var msg = '[calc] ' + opts.expression,
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

// TODO: make this reusable, e.g. return a function that takes an array of
//   feature ids
MapShaper.evalCalcExpression = function(lyr, arcs, exp) {
  var rowNo = 0, colNo = 0, cols = [];
  var ctx1 = { // context for first phase (capturing values for each feature)
        count: capture,
        sum: captureNum,
        average: captureNum,
        median: captureNum,
        min: captureNum,
        max: captureNum
      },
      ctx2 = { // context for second phase (calculating results)
        count: function() {colNo++; return rowNo;},
        sum: function() {return utils.sum(cols[colNo++]);},
        median: function() {return utils.findMedian(cols[colNo++]);},
        min: function() {return utils.getArrayBounds(cols[colNo++]).min;},
        max: function() {return utils.getArrayBounds(cols[colNo++]).max;},
        average: function() {return utils.mean(cols[colNo++]);}
      },
      len = MapShaper.getFeatureCount(lyr),
      calc1, calc2;

  if (lyr.geometry_type) {
    // add functions related to layer geometry (e.g. for subdivide())
    ctx1.width = ctx1.height = noop;
    ctx2.width = function() {return MapShaper.getLayerBounds(lyr, arcs).width();};
    ctx2.height = function() {return MapShaper.getLayerBounds(lyr, arcs).height();};
  }

  calc1 = MapShaper.compileFeatureExpression(exp, lyr, arcs, {context: ctx1});
  calc2 = MapShaper.compileFeatureExpression(exp, {data: lyr.data}, null, {returns: true, context: ctx2});

  // phase 1: capture data
  for (var i=0; i<len; i++) {
    calc1(i);
    rowNo++;
    colNo = 0;
  }

  // phase 2: calculate
  return calc2(undefined);

  function noop() {}

  function captureNum(val) {
    if (isNaN(val) && val) { // accepting falsy values (be more strict?)
      stop("Expected a number, received:", val);
    }
    capture(val);
  }

  function capture(val) {
    var col;
    if (rowNo === 0) {
      cols[colNo] = [];
    }
    col = cols[colNo];
    if (col.length != rowNo) {
      // make sure all functions are called each time
      // (if expression contains a condition, it will throw off the calculation)
      // TODO: allow conditions
      stop("Evaluation failed");
    }
    col.push(val);
    colNo++;
  }
};
