import { compileFeatureExpression } from '../expressions/mapshaper-expressions';
import { getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { getMode } from '../utils/mapshaper-calc-utils';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import { getStateVar } from '../mapshaper-state';
import { message, error, stop } from '../utils/mapshaper-logging';

// Calculate an expression across a group of features, print and return the result
// Supported functions include sum(), average(), max(), min(), median(), count()
// Functions receive an expression to be applied to each feature (like the -each command)
// Examples: 'sum($.area)' 'min(income)'
// opts.expression  Expression to evaluate
// opts.where  Optional filter expression (see -filter command)
//
cmd.calc = function(lyr, arcs, opts) {
  var msg = opts.expression,
      result, compiled, defs;
  if (opts.where) {
    // TODO: implement no_replace option for filter() instead of this
    lyr = {
      shapes: lyr.shapes,
      data: lyr.data
    };
    cmd.filterFeatures(lyr, arcs, {expression: opts.where});
    msg += ' where ' + opts.where;
  }
  // Save any assigned variables to the defs object, so they will be available
  // for later -each expressions to use.
  defs = getStateVar('defs');
  compiled = compileCalcExpression(lyr, arcs, opts.expression);
  result = compiled(null, defs);
  message(msg + ":  " + result);
  return result;
};

export function evalCalcExpression(lyr, arcs, exp) {
  return compileCalcExpression(lyr, arcs, exp)();
}

export function compileCalcExpression(lyr, arcs, exp) {
  var rowNo = 0, colNo = 0, cols = [];
  var ctx1 = { // context for first phase (capturing values for each feature)
        count: assign,
        sum: captureNum,
        average: captureNum,
        median: captureNum,
        min: captureNum,
        max: captureNum,
        mode: capture,
        collect: capture,
        first: assignOnce,
        last: assign
      },
      ctx2 = { // context for second phase (calculating results)
        count: wrap(function() {return rowNo;}, 0),
        sum: wrap(utils.sum, 0),
        median: wrap(utils.findMedian),
        min: wrap(min),
        max: wrap(max),
        average: wrap(utils.mean),
        mode: wrap(getMode),
        collect: wrap(pass),
        first: wrap(pass),
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
      no_assign: true, quiet: true});
  calc2 = compileFeatureExpression(exp, {data: lyr.data}, null,
      {returns: true, context: ctx2, quiet: true});

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
    calc1(i);
    rowNo++;
    colNo = 0;
  }

  function noop() {}

  function reset() {
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
