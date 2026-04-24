import { stop } from '../utils/mapshaper-logging';
import cli from './mapshaper-cli-utils';
import utils from '../utils/mapshaper-utils';

// Variable name pattern. Matches simple identifiers: must start with a letter
// or underscore, followed by letters, digits or underscores.
var VAR_NAME_RXP = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Pattern that matches a {{...}} placeholder in command text. The optional
// leading character is a backslash (escape) which keeps the placeholder
// literal. The braces themselves cannot appear inside a placeholder.
//
// Group 1: the leading escape (if present)
// Group 2: the contents between {{ and }}
//
var PLACEHOLDER_RXP = /(\\?)\{\{([^{}]+?)\}\}/g;

// Pattern matching a "KEY=value" inline -vars argument.
var ASSIGNMENT_RXP = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

// Returns true if @s is a valid mapshaper variable name.
export function isValidVarName(s) {
  return typeof s == 'string' && VAR_NAME_RXP.test(s);
}

// Returns true if @str might contain a {{...}} placeholder. This is a cheap
// fast-path test used to skip re-parsing for commands that have no
// placeholders. False positives (e.g. literal "{{" inside a quoted JS
// expression) just trigger an interpolation pass that finds nothing to do.
export function containsPlaceholder(str) {
  return typeof str == 'string' && str.indexOf('{{') !== -1;
}

// Validate the parsed contents of a -vars JSON file. The file must contain a
// flat object whose values are primitive (string, number, boolean, null).
// Throws on invalid input. Returns the same object.
export function validateVarsObject(obj, source) {
  source = source || '<vars>';
  if (!utils.isObject(obj) || Array.isArray(obj)) {
    stop('Invalid vars file (' + source + '): expected an object at the top level');
  }
  Object.keys(obj).forEach(function(key) {
    if (!isValidVarName(key)) {
      stop('Invalid var name in ' + source + ': ' + JSON.stringify(key));
    }
    var v = obj[key];
    if (v !== null && typeof v != 'string' && typeof v != 'number' &&
        typeof v != 'boolean') {
      stop('Invalid value for var "' + key + '" in ' + source +
        ': expected a string, number, boolean or null');
    }
  });
  return obj;
}

// Resolve a single -vars argument. Each argument is either:
//   * an inline assignment "KEY=value" (key must be a valid var name)
//   * a path to a JSON file containing a flat object of vars
//
// @arg: the raw argument string
// @cache: optional input cache (passed to cli.readFile so files dropped into
//   the GUI can be resolved by name)
// @merge: target object that receives the resolved entries
//
function resolveVarsArg(arg, cache, merge) {
  var assignment = ASSIGNMENT_RXP.exec(arg);
  if (assignment) {
    merge[assignment[1]] = assignment[2];
    return;
  }
  // Treat as a JSON file path
  cli.checkFileExists(arg, cache);
  var content = cli.readFile(arg, 'utf8', cache);
  var obj;
  try {
    obj = JSON.parse(content);
  } catch(e) {
    stop('Failed to parse vars file (' + arg + '): ' + e.message);
  }
  validateVarsObject(obj, arg);
  Object.keys(obj).forEach(function(key) {
    merge[key] = obj[key];
  });
}

// Resolve an array of -vars arguments into a flat scope object. Later
// arguments override earlier ones.
export function parseVarsArgs(args, cache) {
  var scope = {};
  if (!Array.isArray(args)) return scope;
  args.forEach(function(arg) {
    resolveVarsArg(arg, cache, scope);
  });
  return scope;
}

// Look up env.* variables. Throws in environments without process.env.
function lookupEnvVar(name) {
  if (typeof process == 'undefined' || !process.env) {
    stop('Environment variables are not available in this context');
  }
  return process.env[name];
}

// Resolve a single placeholder expression to a string. Recognised forms:
//   VAR     -> vars[VAR] if present, else defs[VAR]
//   env.VAR -> process.env[VAR]
//
// vars is the templating-scope object (-vars / -defaults writes).
// defs is the expression-scope object (-define / -calc / -include /
//   -require / -colorizer writes). The fallback exists so that
//   "-define base = 'out'" -> "-o {{base}}.geojson" and
//   "-calc 'N = count()'" -> "-if '{{N}} > 100'" keep working without
//   the user having to know which scope a value lives in.
//
// Throws on undefined names, invalid syntax, or non-primitive values.
//
function resolvePlaceholder(expr, vars, defs) {
  expr = expr.trim();
  var envMatch = /^env\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(expr);
  var val, source;
  if (envMatch) {
    val = lookupEnvVar(envMatch[1]);
    if (val === undefined || val === null) {
      stop('Undefined environment variable: ' + envMatch[1]);
    }
    return String(val);
  }
  if (!isValidVarName(expr)) {
    stop('Invalid variable reference: {{' + expr + '}}');
  }
  if (vars && expr in vars) {
    source = vars;
  } else if (defs && expr in defs) {
    source = defs;
  } else {
    stop('Undefined variable: ' + expr);
  }
  val = source[expr];
  if (val === null || val === undefined) {
    stop('Undefined variable: ' + expr);
  }
  if (typeof val != 'string' && typeof val != 'number' &&
      typeof val != 'boolean') {
    stop('Variable {{' + expr + '}} is not a primitive value (got ' +
      (typeof val) + ')');
  }
  return String(val);
}

// Substitute {{...}} placeholders in @str.
//
// Two call signatures, kept for backward compatibility:
//   interpolateString(str, vars, defs)  -- preferred, two-store form
//   interpolateString(str, defs)        -- legacy, single-store form
//
// In the legacy form, the second argument is treated as the expression
// scope (defs); there is no template scope. New callers should use the
// two-store form.
//
// Placeholders preceded by a backslash are left literal (with the
// backslash removed). Substitution is single-pass (no recursion) so
// values containing "{{...}}" do not trigger further interpolation.
//
export function interpolateString(str, varsOrDefs, defsArg) {
  if (typeof str != 'string') return str;
  var vars, defs;
  if (arguments.length >= 3) {
    vars = varsOrDefs;
    defs = defsArg;
  } else {
    vars = null;
    defs = varsOrDefs;
  }
  return str.replace(PLACEHOLDER_RXP, function(match, escape, expr) {
    if (escape === '\\') return '{{' + expr + '}}';
    return resolvePlaceholder(expr, vars, defs);
  });
}
