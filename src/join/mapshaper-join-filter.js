import { getModeData } from '../utils/mapshaper-calc-utils';
import { compileFeatureExpression } from '../expressions/mapshaper-expressions';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// Returns a function for filtering multiple source-table records
// (used by -join command)
export function getJoinFilter(data, exp) {
  var test = getJoinFilterTestFunction(exp, data);
  var calc = null;
  if (expressionHasCalcFunction(exp)) {
    calc = getJoinFilterCalcFunction(exp, data);
  }

  return function(srcIds, destRec) {
    var d = calc ? calc(srcIds) : null;
    var filtered = [],
        retn, i;
    for (i=0; i<srcIds.length; i++) {
      retn = test(srcIds[i], destRec, d);
      if (retn === true) {
        filtered.push(srcIds[i]);
      } else if (retn !== false) {
        stop('"where" expression must return true or false');
      }
    }
    return filtered;
  };
}

function expressionHasCalcFunction(exp) {
  return utils.some(['isMax', 'isMin', 'isMode'], function(name) {
    return exp.indexOf(name) > -1;
  });
}


function getJoinFilterCalcFunction(exp, data) {
  var values, counts, max, min, context, calc, n;

  context = {
    isMax: function(val) {
      if (val > max) max = val;
    },
    isMin: function(val) {
      if (val < min) min = val;
    },
    isMode: function(val) {
      if (!values) {
        values = [];
      }
      values.push(val);
    }
  };

  calc = compileFeatureExpression(exp, {data: data}, null, {context: context});

  function reset() {
    max = -Infinity;
    min = Infinity;
    values = null;
  }

  return function(ids) {
    var mode;
    reset();
    for (var i=0; i<ids.length; i++) {
      calc(ids[i]);
    }
    mode = values ? getModeData(values) : null;
    return {
      max: max,
      min: min,
      modes: mode ? mode.modes : null,
      margin: mode ? mode.margin : null
    };
  };
}


function getJoinFilterTestFunction(exp, data) {
  var test, calcRec, destRec;
  var context = {
    isMax: function(val) {
      return val === calcRec.max;
    },
    isMin: function(val) {
      return val === calcRec.min;
    },
    isMode: function(val) {
      return calcRec.modes.indexOf(val) > -1;
    }
  };
  // 'target' property is an accessor function,
  // so the object it references can be updated.
  Object.defineProperty(context, 'target', {
    get: function() {
      return destRec;
    },
    enumerable: true // so it can be mixed-in to the actual expression context
  });

  test = compileFeatureExpression(exp, {data: data}, null, {context: context, returns: true});

  // calcR: results from calculation phase, or null
  return function(srcId, destR, calcR) {
    calcRec = calcR;
    destRec = destR;
    return test(srcId);
  };
}
