import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { getLayerBounds, getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { getMode } from '../utils/mapshaper-calc-utils';
import { getLayerSelection } from '../dataset/mapshaper-command-utils';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import { getStashedVar } from '../mapshaper-stash';
import { message, error, stop } from '../utils/mapshaper-logging';
import { DataTable } from '../datatable/mapshaper-data-table';


cmd.calc = function(layers, arcs, opts) {
  var arr = layers.map(lyr => applyCalcExpression(lyr, arcs, opts));
  if (!opts.to_layer) return null;
  return {
    info: {},
    layers: [{
      name: opts.name || 'info',
      data: new DataTable(arr)
    }]
  };
};

// Calculate an expression across a group of features, print and return the result
// Supported functions include sum(), average(), max(), min(), median(), count()
// Functions receive an expression to be applied to each feature (like the -each command)
// Examples: 'sum($.area)' 'min(income)'
// opts.expression  Expression to evaluate
// opts.where  Optional filter expression (see -filter command)
//
export function applyCalcExpression(lyr, arcs, opts) {
  var msg = opts.expression,
      result, compiled, defs, d;
  if (opts.where) {
    // TODO: implement no_replace option for filter() instead of this
    lyr = getLayerSelection(lyr, arcs, opts);
    msg += ' where ' + opts.where;
  }
  // Save any assigned variables to the defs object, so they will be available
  // for later -each expressions to use.
  defs = getStashedVar('defs');
  compiled = compileCalcExpression(lyr, arcs, opts.expression);
  result = compiled(null, defs);
  if (!opts.to_layer) {
    message(msg + ":  " + result);
  }
  d = {
    expression: opts.expression,
    value: result
  };
  if (opts.where) d.where = opts.where;
  if (lyr.name) d.layer_name = lyr.name;
  return d;
}

export function evalCalcExpression(lyr, arcs, exp) {
  return compileCalcExpression(lyr, arcs, exp)();
}

export function compileCalcExpression(lyr, arcs, exp) {
  var rowNo = 0, colNo = 0, recId = -1, cols = [];
  var ctx1 = { // context for first phase (capturing values for each feature)
        count: assign, // dummy function - first pass does nothing
        sum: captureNum,
        sums: capture,
        average: captureNum,
        mean: captureNum,
        median: captureNum,
        quantile: captureNum,
        iqr: captureNum,
        quartile1: captureNum,
        quartile2: captureNum,
        quartile3: captureNum,
        min: captureNum,
        max: captureNum,
        mode: capture,
        collect: capture,
        collectIds: captureId,
        first: assignOnce,
        every: every,
        some: some,
        last: assign
      },
      ctx2 = { // context for second phase (calculating results)
        count: wrap(function() {return rowNo;}, 0),
        sum: wrap(utils.sum, 0),
        sums: wrap(sums),
        median: wrap(utils.findMedian),
        quantile: wrap2(utils.findQuantile),
        iqr: wrap(function(arr) {
          return utils.findQuantile(arr, 0.75) - utils.findQuantile(arr, 0.25);
        }),
        quartile1: wrap(function(arr) { return utils.findQuantile(arr, 0.25); }),
        quartile2: wrap(utils.findMedian),
        quartile3: wrap(function(arr) { return utils.findQuantile(arr, 0.75); }),
        min: wrap(min),
        max: wrap(max),
        average: wrap(utils.mean),
        mean: wrap(utils.mean),
        mode: wrap(getMode),
        collect: wrap(pass),
        collectIds: wrap(pass),
        first: wrap(pass),
        every: wrap(pass, false),
        some: wrap(pass, false),
        last: wrap(pass)
      },
      len = getFeatureCount(lyr),
      calc1, calc2, result;

  if (lyr.geometry_type) {
    // add functions related to layer geometry (e.g. for subdivide())
    ctx1.width = ctx1.height = noop;
    ctx2.width = function() {return getLayerBounds(lyr, arcs).width();};
    ctx2.height = function() {return getLayerBounds(lyr, arcs).height();};
  }

  calc1 = compileFeatureExpression(exp, lyr, arcs, {context: ctx1,
      no_assign: true, no_warn: true, no_return: true});
  // changed data-only layer to full layer to expose layer geometry, etc
  // (why not do this originally?)
  // calc2 = compileFeatureExpression(exp, {data: lyr.data}, null,
  //     {returns: true, context: ctx2, no_warn: true});
  calc2 = compileFeatureExpression(exp, lyr, arcs, {context: ctx2, no_warn: true});

  // @destRec: optional destination record for assignments
  return function(ids, destRec) {
    var result;
    // phase 1: capture data
    if (ids) procRecords(ids);
    else procAll();
    // phase 2: calculate
    result = calc2(undefined, destRec);
    reset();
    return result;
  };

  function pass(o) {return o;}

  function max(arr) {
    return utils.getArrayBounds(arr).max;
  }

  function sums(arr) {
    var n = arr && arr.length ? arr[0].length : 0;
    var output = utils.initializeArray(Array(n), 0);
    arr.forEach(function(arr) {
      if (!arr || !arr.length) return;
      for (var i=0; i<n; i++) {
        output[i] += +arr[i] || 0;
      }
    });
    return output;
  }

  function min(arr) {
    return utils.getArrayBounds(arr).min;
  }

  // process captured data, or return nodata value if no records have been captured
  function wrap(proc, nullVal) {
    var nodata = arguments.length > 1 ? nullVal : null;
    return function() {
      var c = colNo++;
      return rowNo > 0 ? proc(cols[c]) : nodata;
    };
  }

  function wrap2(proc) {
    return function(arg1, arg2) {
      var c = colNo++;
      return rowNo > 0 ? proc(cols[c], arg2) : null;
    };
  }

  function procAll() {
    for (var i=0; i<len; i++) {
      procRecord(i);
    }
  }

  function procRecords(ids) {
    ids.forEach(procRecord);
  }

  function procRecord(i) {
    if (i < 0 || i >= len) error("Invalid record index");
    recId = i;
    calc1(i);
    rowNo++;
    colNo = 0;
  }

  function noop() {}

  function reset() {
    recId = -1;
    rowNo = 0;
    colNo = 0;
    cols = [];
  }

  function captureNum(val) {
    if (isNaN(val) && val) { // accepting falsy values (be more strict?)
      stop("Expected a number, received:", val);
    }
    return capture(val);
  }

  function assignOnce(val) {
    if (rowNo === 0) cols[colNo] = val;
    colNo++;
    return val;
  }

  function every(val) {
    val = !!val;
    cols[colNo] = rowNo === 0 ? val : cols[colNo] && val;
    colNo++;
  }

  function some(val) {
    val = !!val;
    cols[colNo] = cols[colNo] || val;
    colNo++;
  }

  function assign(val) {
    cols[colNo++] = val;
    return val;
  }
  /*
  function captureArr(val) {
    capture(val);
    return [];
  }
  */

  function captureId() {
    capture(recId);
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
    return val;
  }
}
