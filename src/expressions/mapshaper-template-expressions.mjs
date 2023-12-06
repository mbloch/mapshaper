import { getBaseContext } from '../expressions/mapshaper-expressions';
import { getStashedVar } from '../mapshaper-stash';
import { getTargetProxy } from '../expressions/mapshaper-target-proxy';
import { stop, error } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// Support for evaluating expressions embedded in curly-brace templates

// Returns: a string (e.g. a command string used by the -run command)
export async function evalTemplateExpression(expression, targets, ctx) {
  ctx = ctx || getBaseContext();
  // TODO: throw an error if target is used when there are multiple targets
  if (targets && targets.length == 1) {
    Object.defineProperty(ctx, 'target', {value: getTargetProxy(targets[0])});
  }
  // Add global functions and data to the expression context
  // (e.g. functions imported via the -require command)
  var globals = getStashedVar('defs') || {};
  ctx.global = globals;
  utils.extend(ctx, ctx.global);

  var output = await compileTemplate(expression, ctx);
  if (hasFunctionCall(output, ctx)) {
    // also evaluate function calls that are not enclosed in curly braces
    // (convenience syntax)
    output = await evalExpression(output, ctx);
  }
  return output;
}

export async function compileTemplate(template, ctx) {
  var subExpressions = parseTemplate(template);
  var promises = subExpressions.map(expr => evalExpression(expr, ctx));
  var replacements = await Promise.all(promises);
  return applyReplacements(template, replacements);
}

export async function evalExpression(expression, ctx) {
  var output;
  try {
    output = Function('ctx', 'with(ctx) {return (' + expression + ');}').call({}, ctx);
  } catch(e) {
    stop(e.name, 'in JS source:', e.message);
  }
  return output;
}

// Returns array of 0 or more embedded curly-brace expressions
export function parseTemplate(str) {
  var arr = [];
  parseTemplateParts(str).forEach(function(s, i) {
    if (i % 2 == 1) {
      arr.push(s.substring(1, s.length-1)); // remove braces
    }
  });
  return arr;
}

// template: template string
// replacements: array of strings or values that can be coerced to strings
export function applyReplacements(template, replacements) {
  var parts = parseTemplateParts(template);
  return parts.reduce(function(memo, s, i) {
    return i % 2 == 1 ? memo + (replacements.shift() || '') : memo + s;
  }, '');
}

// Divides a string into substrings; even-index strings contain literal strings,
// Odd-indexed strings contain curly-brace-delimited template expressions.
// JSON objects are treated as literal strings; other top-level curly braces are
//    assumed to be embedded expressions.
// For example:  parseTemplateParts('{"hello"}, world!') => ['', '{"hello"}', ', world!']
//
export function parseTemplateParts(str) {
  // TODO: consider adding \ escapes
  var depth=0;
  var parts = [];
  var part = '';
  var c;

  for (var i=0, n=str.length; i<n; i++) {
    c = str.charAt(i);
    if (c == '{') {
      if (depth == 0) {
        parts.push(part);
        part = '';
      }
      depth++;
    }
    part += c;
    if (c == '}') {
      depth--;
      if (depth < 0) {
        // unexpected... throw an error?
        depth++;
      } else if (depth == 0 && isValidJSON(part)) {
        // embedded JSON objects are not template parts -- undo
        part = parts.pop() + part;
      } else if (depth == 0) {
        parts.push(part);
        part = '';
      }
    }
  }
  parts.push(part);
  return parts;
}

// Tests if an expression string contains a call to an indexed function
// defs: Object containing functions indexed by function name
export function hasFunctionCall(str, defs) {
  var rxp = /([$_a-z][$_a-z0-9]*)\(/ig;
  return Array.from(str.matchAll(rxp)).some(match => match[1] in defs);
}

function isValidJSON(str) {
  try {
    JSON.parse(str);
  } catch(e) {
    return false;
  }
  return true;
}
