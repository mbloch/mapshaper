import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';


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

export function getExpressionFunction(exp, opts) {
  var func = compileExpressionToFunction(exp, opts);
  return function(rec, ctx) {
    var val;
    try {
      val = func.call(ctx.$, rec, ctx);
    } catch(e) {
      stop(e.name, "in expression [" + exp + "]:", e.message);
    }
    return val;
  };
}

export function compileExpressionToFunction(exp, opts) {
  // $$ added to avoid duplication with data field variables (an error condition)
  var functionBody, func;
  if (opts.returns) {
    // functionBody = 'return ' + functionBody;
    functionBody = 'var $$retn = ' + exp + '; return $$retn;';
  } else {
    functionBody = exp;
  }
  functionBody = 'with($$env){with($$record){ ' + functionBody + '}}';
  try {
    func = new Function('$$record,$$env',  functionBody);
  } catch(e) {
    // if (opts.quiet) throw e;
    stop(e.name, 'in expression [' + exp + ']');
  }
  return func;
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
