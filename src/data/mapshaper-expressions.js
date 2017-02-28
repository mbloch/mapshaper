/* @requires mapshaper-feature-proxy */

// Compiled expression returns a value
MapShaper.compileValueExpression = function(exp, lyr, arcs) {
  return MapShaper.compileFeatureExpression(exp, lyr, arcs, {returns: true});
};

MapShaper.compileFeatureExpression = function(rawExp, lyr, arcs, opts_) {
  var opts = utils.extend({}, opts_),
      exp = rawExp || '',
      mutable = !opts.no_assign, // block assignment expressions
      vars = MapShaper.getAssignedVars(exp),
      func, records;

  if (mutable && vars.length > 0 && !lyr.data) {
    MapShaper.initDataTable(lyr);
  }

  if (!mutable) {
    // protect global object from assigned values
    opts.context = opts.context || {};
    MapShaper.nullifyUnsetProperties(vars, opts.context);
  }

  records = lyr.data ? lyr.data.getRecords() : [];
  func = MapShaper.getExpressionFunction(exp, lyr, arcs, opts);

  // @destRec (optional) substitute for records[recId] (used by -calc)
  return function(recId, destRec) {
    var record;
    if (destRec) {
      record = destRec;
    } else {
      record = records[recId] || (records[recId] = {});
    }

    // initialize new fields to null so assignments work
    if (mutable) {
      MapShaper.nullifyUnsetProperties(vars, record);
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
  var ctx = MapShaper.getExpressionContext(lyr, opts.context);
  var functionBody = "with(env){with(record){ " + (opts.returns ? 'return ' : '') +
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
    ctx._ = ctx; // provide access to functions when masked by variable names
    try {
      val = func.call(ctx.$, rec, ctx);
    } catch(e) {
      stop(e.name, "in expression [" + exp + "]:", e.message);
    }
    return val;
  };
};

MapShaper.nullifyUnsetProperties = function(vars, obj) {
  for (var i=0; i<vars.length; i++) {
    if (vars[i] in obj === false) {
      obj[vars[i]] = null;
    }
  }
};

MapShaper.getExpressionContext = function(lyr, mixins) {
  var env = MapShaper.getBaseContext();
  if (lyr.data) {
    // default to null values when a data field is missing
    MapShaper.nullifyUnsetProperties(lyr.data.getFields(), env);
  }
  if (mixins) {
    utils.extend(env, mixins);
  }
  // make context properties non-writable, so they can't be replaced by an expression
  return Object.keys(env).reduce(function(memo, key) {
    Object.defineProperty(memo, key, {value: env[key]}); // writable: false is default
    return memo;
  }, {});
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
