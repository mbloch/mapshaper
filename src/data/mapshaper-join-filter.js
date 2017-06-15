/* @requires mapshaper-expressions, mapshaper-calc-utils */

internal.getJoinFilter = function(data, exp) {
  var test = internal.getJoinFilterTestFunction(exp, data);
  var calc = null;
  if (internal.expressionHasCalcFunction(exp)) {
    calc = internal.getJoinFilterCalcFunction(exp, data);
  }

  return function(ids) {
    var d = calc ? calc(ids) : null;
    var filtered = [],
        retn, i;
    for (i=0; i<ids.length; i++) {
      retn = test(ids[i], d);
      if (retn === true) {
        filtered.push(ids[i]);
      } else if (retn !== false) {
        stop('"where" expression must return true or false');
      }
    }
    return filtered;
  };
};

internal.expressionHasCalcFunction = function(exp) {
  return utils.some(['isMax', 'isMin', 'isMode'], function(name) {
    return exp.indexOf(name) > -1;
  });
};


internal.getJoinFilterCalcFunction = function(exp, data) {
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

  calc = internal.compileFeatureExpression(exp, {data: data}, null, {context: context});

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
    mode = values ? internal.getModeData(values) : null;
    return {
      max: max,
      min: min,
      modes: mode ? mode.modes : null,
      margin: mode ? mode.margin : null
    };
  };
};


internal.getJoinFilterTestFunction = function(exp, data) {
  var context, test, d;
  context = {
    isMax: function(val) {
      return val === d.max;
    },
    isMin: function(val) {
      return val === d.min;
    },
    isMode: function(val) {
      return d.modes.indexOf(val) > -1;
    }
  };
  test = internal.compileFeatureExpression(exp, {data: data}, null, {context: context, returns: true});
  // @datum  results from calculation phase
  return function(i, datum) {
    d = datum;
    return test(i);
  };
};
