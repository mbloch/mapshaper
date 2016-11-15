/* @requires mapshaper-feature-proxy */

// Compiled expression returns a value
MapShaper.compileValueExpression = function(exp, lyr, arcs) {
  return MapShaper.compileFeatureExpression(exp, lyr, arcs, {returns: true});
};

MapShaper.compileFeatureExpression = function(rawExp, lyr, arcs, opts) {
  var exp = rawExp || '',
      vars = MapShaper.getAssignedVars(exp),
      func, records;

  if (vars.length > 0 && !lyr.data) {
    MapShaper.initDataTable(lyr);
  }

  records = lyr.data ? lyr.data.getRecords() : [];
  func = MapShaper.getExpressionFunction(exp, lyr, arcs, opts);
  return function(recId) {
    var record = records[recId];
    if (!record) {
      record = records[recId] = {};
    }
    // initialize new fields to null so assignments work
    for (var i=0; i<vars.length; i++) {
      if (vars[i] in record === false) {
        record[vars[i]] = null;
      }
    }
    return func(record, recId);
  };
};

MapShaper.getAssignedVars = function(exp) {
  var rxp = /[A-Za-z_][A-Za-z0-9_]*(?= *=[^=])/g;
  return exp.match(rxp) || [];
};

MapShaper.getExpressionFunction = function(exp, lyr, arcs, opts) {
  var getFeatureById = MapShaper.initFeatureProxy(lyr, arcs);
  var ctx = MapShaper.getExpressionContext(lyr, opts && opts.context);
  var functionBody = "with(env){with(record){ " + (opts && opts.returns ? 'return ' : '') +
        exp + "}}";
  var func;
  try {
    func = new Function("record,env",  functionBody);
  } catch(e) {
    stop(e.name, "in expression [" + exp + "]");
  }
  return function(rec, i) {
    var val;
    ctx.$ = getFeatureById(i);
    try {
      val = func.call(ctx.$, rec, ctx);
    } catch(e) {
      stop(e.name, "in expression [" + exp + "]:", e.message);
    }
    return val;
  };
};

MapShaper.getExpressionContext = function(lyr, mixins) {
  var env = MapShaper.getBaseContext();
  if (lyr.data) {
    // default to null values when a data field is missing
    lyr.data.getFields().forEach(function(f) {
      env[f] = null;
    });
  }
  if (mixins) {
    utils.extend(env, mixins);
  }
  return env;
};

MapShaper.getBaseContext = function() {
  var obj = {};
  // Mask global properties (is this effective/worth doing?)
  (function() {
    for (var key in this) {
      obj[key] = null;
    }
  }());
  obj.console = console;
  return obj;
};
