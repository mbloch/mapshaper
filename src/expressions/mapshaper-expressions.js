
import expressionUtils from '../expressions/mapshaper-expression-utils';
import { initFeatureProxy } from '../expressions/mapshaper-feature-proxy';
import { initDataTable } from '../dataset/mapshaper-layer-utils';
import utils from '../utils/mapshaper-utils';
import { message, stop } from '../utils/mapshaper-logging';


// Compiled expression returns a value
export function compileValueExpression(exp, lyr, arcs, opts) {
  opts = opts || {};
  opts.returns = true;
  return compileFeatureExpression(exp, lyr, arcs, opts);
}

export function compileFeaturePairFilterExpression(exp, lyr, arcs) {
  var func = compileFeaturePairExpression(exp, lyr, arcs);
  return function(idA, idB) {
    var val = func(idA, idB);
    if (val !== true && val !== false) {
      stop("where expression must return true or false");
    }
    return val;
  };
}

export function compileFeaturePairExpression(exp, lyr, arcs) {
  var ctx = getExpressionContext(lyr);
  var A = getProxyFactory(lyr, arcs);
  var B = getProxyFactory(lyr, arcs);
  var vars = getAssignedVars(exp);
  var functionBody = "with($$env){with($$record){return " + exp + "}}";
  var func;

  try {
    func = new Function("$$record,$$env", functionBody);
  } catch(e) {
    console.error(e);
    stop(e.name, "in expression [" + exp + "]");
  }

  // protect global object from assigned values
  nullifyUnsetProperties(vars, ctx);

  function getProxyFactory(lyr, arcs) {
    var records = lyr.data ? lyr.data.getRecords() : [];
    var getFeatureById = initFeatureProxy(lyr, arcs);
    function Proxy(id) {}

    return function(id) {
      var proxy;
      if (id == -1) return null;
      Proxy.prototype = records[id] || {};
      proxy = new Proxy();
      proxy.$ = getFeatureById(id);
      return proxy;
    };
  }

  // idA - id of a record
  // idB - id of a record, or -1
  // rec - optional data record
  return function(idA, idB, rec) {
    var val;
    ctx.A = A(idA);
    ctx.B = B(idB);
    if (rec) {
      // initialize new fields to null so assignments work
      nullifyUnsetProperties(vars, rec);
    }
    try {
      val = func.call(ctx, rec || {}, ctx);
    } catch(e) {
      stop(e.name, "in expression [" + exp + "]:", e.message);
    }
    return val;
  };
}

export function compileFeatureExpression(rawExp, lyr, arcs, opts_) {
  var opts = utils.extend({}, opts_),
      exp = rawExp || '',
      mutable = !opts.no_assign, // block assignment expressions
      vars = getAssignedVars(exp),
      func, records;

  if (mutable && vars.length > 0 && !lyr.data) {
    initDataTable(lyr);
  }

  if (!mutable) {
    // protect global object from assigned values
    opts.context = opts.context || {};
    nullifyUnsetProperties(vars, opts.context);
  }

  records = lyr.data ? lyr.data.getRecords() : [];
  func = getExpressionFunction(exp, lyr, arcs, opts);

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
      nullifyUnsetProperties(vars, record);
    }
    return func(record, recId);
  };
}

// Return array of variables on the left side of assignment operations
// @hasDot (bool) Return property assignments via dot notation
export function getAssignedVars(exp, hasDot) {
  var rxp = /[a-z_][.a-z0-9_]*(?= *=[^>=])/ig; // ignore arrow functions and comparisons
  var matches = exp.match(rxp) || [];
  var f = function(s) {
    var i = s.indexOf('.');
    return hasDot ? i > -1 : i == -1;
  };
  return utils.uniq(matches.filter(f));
}

// Return array of objects with properties assigned via dot notation
// e.g.  'd.value = 45' ->  ['d']
export function getAssignmentObjects(exp) {
  var matches = getAssignedVars(exp, true),
      names = [];
  matches.forEach(function(s) {
    var match = /^([^.]+)\.[^.]+$/.exec(s);
    var name = match ? match[1] : null;
    if (name && name != 'this') {
      names.push(name);
    }
  });
  return utils.uniq(names);
}

export function compileExpressionToFunction(exp, opts) {
  // $$ added to avoid duplication with data field variables (an error condition)
  var functionBody = "with($$env){with($$record){ " + (opts.returns ? 'return ' : '') +
        exp + "}}";
  var func;
  try {
    func = new Function("$$record,$$env",  functionBody);
  } catch(e) {
    if (opts.quiet) throw e;
    stop(e.name, "in expression [" + exp + "]");
  }
  return func;
}

function getExpressionFunction(exp, lyr, arcs, opts) {
  var getFeatureById = initFeatureProxy(lyr, arcs);
  var ctx = getExpressionContext(lyr, opts.context, opts);
  var func = compileExpressionToFunction(exp, opts);
  return function(rec, i) {
    var val;
    // Assigning feature object to '$' -- this should maybe be removed, it is
    // also exposed as "this".
    ctx.$ = getFeatureById(i);
    ctx._ = ctx; // provide access to functions when masked by variable names
    ctx.d = rec || null; // expose data properties a la d3 (also exposed as this.properties)
    try {
      val = func.call(ctx.$, rec, ctx);
    } catch(e) {
      if (opts.quiet) throw e;
      stop(e.name, "in expression [" + exp + "]:", e.message);
    }
    return val;
  };
}

function nullifyUnsetProperties(vars, obj) {
  for (var i=0; i<vars.length; i++) {
    if (vars[i] in obj === false) {
      obj[vars[i]] = null;
    }
  }
}

function getExpressionContext(lyr, mixins, opts) {
  var env = getBaseContext();
  var ctx = {};
  var fields = lyr.data ? lyr.data.getFields() : [];
  opts = opts || {};
  utils.extend(env, expressionUtils); // mix in round(), sprintf()
  if (lyr.data) {
    // default to null values when a data field is missing
    nullifyUnsetProperties(fields, env);
  }
  if (mixins) {
    Object.keys(mixins).forEach(function(key) {
      // Catch name collisions between data fields and user-defined functions
      var d = Object.getOwnPropertyDescriptor(mixins, key);
      if (key in env) {
      }
      if (d.get) {
        // copy accessor function from mixins to context
        Object.defineProperty(ctx, key, {get: d.get}); // copy getter function to context
      } else {
        // copy regular property from mixins to context, but make it non-writable
        Object.defineProperty(ctx, key, {value: mixins[key]});
      }
    });
  }
  // make context properties non-writable, so they can't be replaced by an expression
  return Object.keys(env).reduce(function(memo, key) {
    if (key in memo) {
      // property has already been set (probably by a mixin, above): skip
      // "quiet" option used in calc= expressions
      if (!opts.quiet) {
        if (typeof memo[key] == 'function' && fields.indexOf(key) > -1) {
          message('Warning: ' + key + '() function is hiding a data field with the same name');
        } else {
          message('Warning: "' + key + '" has multiple definitions');
        }
      }
    } else {
      Object.defineProperty(memo, key, {value: env[key]}); // writable: false is default
    }
    return memo;
  }, ctx);
}

export function getBaseContext() {
  var obj = {};
  // Mask global properties (is this effective/worth doing?)
  (function() {
    for (var key in this) {
      obj[key] = void 0;
    }
  }());
  obj.console = console;
  return obj;
}
