/* @requires mapshaper-expressions */

MapShaper.getJoinFilter = function(data, exp) {
  var test = MapShaper.getJoinFilterTestFunction(exp, data);
  var calc = null;
  if (MapShaper.expressionHasCalcFunction(exp)) {
    calc = MapShaper.getJoinFilterCalcFunction(exp, data);
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
        stop('[join] "where" expression must return true or false');
      }
    }
    return filtered;
  };
};

MapShaper.expressionHasCalcFunction = function(exp) {
  return utils.some(['isMax', 'isMin', 'isMode'], function(name) {
    return exp.indexOf(name) > -1;
  });
};


MapShaper.getJoinFilterCalcFunction = function(exp, data) {
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

  calc = MapShaper.compileFeatureExpression(exp, {data: data}, null, {context: context});

  function reset() {
    max = -Infinity;
    min = Infinity;
    values = null;
  }

  return function(ids) {
    reset();
    for (var i=0; i<ids.length; i++) {
      calc(ids[i]);
    }
    return {
      max: max,
      min: min,
      modes: values ? MapShaper.getModeValues(values) : null
    };
  };
};

MapShaper.getModeValues = function(values) {
  var maxCount = 0,
      counts, uniq, modes, val, i, count;
  if (values.length == 1) {
    return values;
  }
  uniq = [];
  counts = {};
  // get max count and array of uniq values
  for (i=0; i<values.length; i++) {
    val = values[i];
    if (val in counts === false) {
      counts[val] = 0;
      uniq.push(val);
    }
    count = ++counts[val];
    if (count > maxCount) maxCount = count;
  }
  // get mode values (may be multiple)
  modes = [];
  for (i=0; i<uniq.length; i++) {
    if (counts[uniq[i]] === maxCount) {
      modes.push(uniq[i]);
    }
  }
  return modes;
};

MapShaper.getJoinFilterTestFunction = function(exp, data) {
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
  test = MapShaper.compileFeatureExpression(exp, {data: data}, null, {context: context, returns: true});
  // @datum  results from calculation phase
  return function(i, datum) {
    d = datum;
    return test(i);
  };
};
