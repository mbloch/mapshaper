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

// TODO: make this reusable, e.g. return a function that takes an array of ids
//
MapShaper.evalCalcExpression = function(lyr, arcs, exp) {
  var rowNo = 0, colNo = 0, cols = [];
  var ctx1 = {
        count: capture,
        sum: capture,
        average: capture,
        median: capture,
        min: capture,
        max: capture
      },
      ctx2 = {
        count: function() {colNo++; return rowNo;},
        sum: function() {return utils.sum(cols[colNo++]);},
        median: function() {return utils.findMedian(cols[colNo++]);},
        min: function() {return utils.getArrayBounds(cols[colNo++]).min;},
        max: function() {return utils.getArrayBounds(cols[colNo++]).max;},
        average: function() {return mean(cols[colNo++]);}
      },
      len = MapShaper.getFeatureCount(lyr),
      calc1, calc2;

  if (lyr.geometry_type) {
    // add layer geometry (e.g. for subdivide())
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

  function mean(arr) {
    var count = 0,
        avg = NaN,
        val;
    for (var i=0, n=arr.length; i<n; i++) {
      val = arr[i];
      if (isNaN(val)) continue;
      avg = ++count == 1 ? val : val / count + (count - 1) / count * avg;
    }
    return avg;
  }

  function noop() {}

  function capture(val) {
    var col;
    if (rowNo === 0) {
      cols[colNo] = [];
    }
    col = cols[colNo];
    if (col.length != rowNo) {
      stop("Evaluation failed");
    }
    col.push(val);
    colNo++;
  }

  // function reset() {
  //   cols = [];
  //   rowNo = 0;
  //   callNo = 0;
  // }
};
