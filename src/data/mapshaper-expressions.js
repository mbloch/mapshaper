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

// Return array of variables on the left side of assignment operations
// @hasDot (bool) Return property assignments via dot notation
MapShaper.getAssignedVars = function(exp, hasDot) {
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
MapShaper.getAssignmentObjects = function(exp) {
  var matches = MapShaper.getAssignedVars(exp, true),
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
