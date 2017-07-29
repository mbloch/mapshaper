/* @requires mapshaper-feature-proxy, mapshaper-expression-utils */

// Compiled expression returns a value
internal.compileValueExpression = function(exp, lyr, arcs, opts) {
  opts = opts || {};
  opts.returns = true;
  return internal.compileFeatureExpression(exp, lyr, arcs, opts);
};

internal.compileFeatureExpression = function(rawExp, lyr, arcs, opts_) {
  var opts = utils.extend({}, opts_),
      exp = rawExp || '',
      mutable = !opts.no_assign, // block assignment expressions
      vars = internal.getAssignedVars(exp),
      func, records;

  if (mutable && vars.length > 0 && !lyr.data) {
    internal.initDataTable(lyr);
  }

  if (!mutable) {
    // protect global object from assigned values
    opts.context = opts.context || {};
    internal.nullifyUnsetProperties(vars, opts.context);
  }

  records = lyr.data ? lyr.data.getRecords() : [];
  func = internal.getExpressionFunction(exp, lyr, arcs, opts);

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
      internal.nullifyUnsetProperties(vars, record);
    }
    return func(record, recId);
  };
};

// Return array of variables on the left side of assignment operations
// @hasDot (bool) Return property assignments via dot notation
internal.getAssignedVars = function(exp, hasDot) {
  var rxp = /[a-z_][.a-z0-9_]*(?= *=[^=])/ig;
  var matches = exp.match(rxp) || [];
  var f = function(s) {
    var i = s.indexOf('.');
    return hasDot ? i > -1 : i == -1;
  };
  return utils.uniq(matches.filter(f));
};

// Return array of objects with properties assigned via dot notation
// e.g.  'd.value = 45' ->  ['d']
internal.getAssignmentObjects = function(exp) {
  var matches = internal.getAssignedVars(exp, true),
      names = [];
  matches.forEach(function(s) {
    var match = /^([^.]+)\.[^.]+$/.exec(s);
    var name = match ? match[1] : null;
    if (name && name != 'this') {
      names.push(name);
    }
  });
  return utils.uniq(names);
};

internal.getExpressionFunction = function(exp, lyr, arcs, opts) {
  var getFeatureById = internal.initFeatureProxy(lyr, arcs);
  var ctx = internal.getExpressionContext(lyr, opts.context);
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

internal.nullifyUnsetProperties = function(vars, obj) {
  for (var i=0; i<vars.length; i++) {
    if (vars[i] in obj === false) {
      obj[vars[i]] = null;
    }
  }
};

internal.getExpressionContext = function(lyr, mixins) {
  var env = internal.getBaseContext();
  utils.extend(env, internal.expressionUtils); // mix in utils
  if (lyr.data) {
    // default to null values when a data field is missing
    internal.nullifyUnsetProperties(lyr.data.getFields(), env);
  }
  if (mixins) {
    Object.keys(mixins).forEach(function(key) {
      // Catch name collisions between data fields and user-defined functions
      if (key in env) message('Warning: "' + key + '" has multiple definitions');
      env[key] = mixins[key];
    });
    utils.extend(env, mixins);
  }
  // make context properties non-writable, so they can't be replaced by an expression
  return Object.keys(env).reduce(function(memo, key) {
    Object.defineProperty(memo, key, {value: env[key]}); // writable: false is default
    return memo;
  }, {});
};

internal.getBaseContext = function() {
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
