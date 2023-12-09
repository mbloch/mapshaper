import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';

// Return array of objects with properties assigned via dot notation
// e.g.  'd.value = 45' ->  ['d']
// export function getAssignmentObjects(exp) {
//   var matches = getAssignedVars(exp, true),
//       names = [];
//   matches.forEach(function(s) {
//     var match = /^([^.]+)\.[^.]+$/.exec(s);
//     var name = match ? match[1] : null;
//     if (name && name != 'this') {
//       names.push(name);
//     }
//   });
//   return utils.uniq(names);
// }

export function getExpressionFunction(exp, ctxArg, optsArg) {
  var opts = optsArg || {};
  var ctx = ctxArg || getBaseContext();
  var func = compileExpressionToFunction(exp, opts);
  var vars = getAssignedVars(exp);
  var mutable = !opts.no_assign && vars.length > 0;

  if (opts.no_assign) {
    // protect global object from assigned values when not captured by data record
    nullifyUnsetProperties(vars, ctx);
  }

  // "_" is used as an alias for the expression context, so functions can still
  // be used when masked by variables of the same name.
  ctx._ = ctx;

  return function(rec) {
    var thisVal = ctx.$ || null;
    var val;
    if (mutable) {
      // initialize assigned variables to rec.null so rec can capture them
      nullifyUnsetProperties(vars, rec);
    }
    try {
      val = func.call(thisVal, rec, ctx);
    } catch(e) {
      stop(e.name, "in expression [" + exp + "]:", e.message);
    }
    return val;
  };
}

export function compileExpressionToFunction(exp, opts) {
  var functionBody;
  exp = cleanExpression(exp);

  if (opts.no_return) {
    functionBody = exp;
  } else {
    // functionBody = 'return ' + functionBody;
    // $$ added to avoid duplication with data field variables (an error condition)
    functionBody = 'var $$retn = ' + exp + '; return $$retn;';
  }
  functionBody = 'with($$env){with($$record){ ' + functionBody + '}}';
  try {
    return new Function('$$record,$$env',  functionBody);
  } catch(e) {
    // if (opts.quiet) throw e;
    stop(e.name, 'in expression [' + exp + ']');
  }
}

// Return array of variables on the left side of assignment operations
// @hasDot (bool) Return property assignments via dot notation
export function getAssignedVars(exp, hasDot) {
  var rxp = /[a-z_$][.a-z0-9_$]*(?= *=[^>=])/ig; // ignore arrow functions and comparisons
  var matches = exp.match(rxp) || [];
  var f = function(s) {
    var i = s.indexOf('.');
    return hasDot ? i > -1 : i == -1;
  };
  var vars = utils.uniq(matches.filter(f));
  return vars;
}

export function getBaseContext(ctx) {
  ctx = ctx || {};
  // Mask global properties (is this effective/worth doing?)
  ctx.globalThis = void 0; // some globals are not iterable
  (function() {
    for (var key in this) {
      ctx[key] = void 0;
    }
  }());
  ctx.console = console;
  return ctx;
}

export function nullifyUnsetProperties(vars, obj) {
  for (var i=0; i<vars.length; i++) {
    if (vars[i] in obj === false) {
      obj[vars[i]] = null;
    }
  }
}

function cleanExpression(exp) {
  // workaround for problem in GNU Make v4: end-of-line backslashes inside
  // quoted strings are left in the string (other shell environments remove them)
  return exp.replace(/\\\n/g, ' ');
}
