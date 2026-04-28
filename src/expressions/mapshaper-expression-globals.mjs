// Detection support for the "data field shadows a JS global" warning.
//
// Background: getBaseContext() in mapshaper-expressions.mjs masks every
// _enumerable_ property of the global object. ECMAScript built-ins are
// defined as non-enumerable on globalThis (per spec), so they slip through
// the mask and remain reachable inside a `with(env){with(record){...}}`
// scope. As a result, a record with a field named e.g. `Math` silently
// shadows the global Math whenever an expression touches it -- and the
// failure is silent because `Math.PI` parses fine; it just resolves to
// `undefined.PI` and then `TypeError: cannot read property PI of undefined`.
//
// We can't enumerate "what's in scope" at runtime in a useful way: probing
// `Object.getOwnPropertyNames(globalThis)` works in Node but in browsers
// also pulls in ~250 Window members (`name`, `length`, `top`, `find`,
// `print`, `status`, ...) which are extremely common field names in real
// datasets. Warning on every match against that surface produces an
// avalanche of false positives.
//
// Instead this module hard-codes a small curated list of ECMAScript
// built-ins that (a) are stable across versions and host environments and
// (b) almost never make sense as data field names. Mapshaper-injected
// helpers (sprintf, round, count, sum, etc.) are detected dynamically by
// inspecting the per-command env -- see getShadowedNames() below.

export var RESERVED_GLOBALS = [
  // Constructors / namespaces
  'Array',
  'Boolean',
  'Date',
  'Error',
  'Function',
  'JSON',
  'Map',
  'Math',
  'Number',
  'Object',
  'Promise',
  'RegExp',
  'Set',
  'String',
  'Symbol',
  'WeakMap',
  'WeakSet',
  // Top-level functions
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURI',
  'encodeURIComponent',
  'decodeURI',
  'decodeURIComponent',
  // Constants
  'NaN',
  'Infinity',
  'undefined',
  'globalThis'
];

// Return the subset of `fieldNames` that, if used as record properties,
// would shadow either:
//   - A curated ECMAScript built-in (RESERVED_GLOBALS), or
//   - A name already bound in `extraNames` -- i.e. the per-command helper
//     namespace assembled by addFeatureExpressionUtils() and any -calc /
//     -include / mixin additions on top of it.
//
// `extraNames` is optional and accepts either an array of names OR an
// object whose own keys are the names. The object form is convenient when
// the caller already has an env-like map; the array form fits the common
// "I built this list of bindings as I went" pattern in
// getFeatureExpressionContext().
export function getShadowedNames(fieldNames, extraNames) {
  if (!fieldNames || !fieldNames.length) return [];
  var reserved = {};
  RESERVED_GLOBALS.forEach(function(n) { reserved[n] = true; });
  if (extraNames) {
    var names = Array.isArray(extraNames) ? extraNames : Object.keys(extraNames);
    names.forEach(function(k) { reserved[k] = true; });
  }
  return fieldNames.filter(function(name) {
    return Object.prototype.hasOwnProperty.call(reserved, name);
  });
}

// Build a single user-facing warning string for one or more shadowed
// field names. Phrasing is intentionally explicit about who wins at
// runtime (the field), since the natural reading of "shadows" in code is
// often the other way around. The example uses the first shadowed name
// because we don't know which (if any) the user actually plans to touch.
export function formatShadowWarning(shadowed, layerName) {
  var label = shadowed.length === 1 ? 'name' : 'names';
  var verb = shadowed.length === 1 ? 'shadows' : 'shadow';
  var quoted = shadowed.map(function(s) { return '"' + s + '"'; }).join(', ');
  var first = shadowed[0];
  var where = layerName ? ' in layer "' + layerName + '"' : '';
  return 'Field ' + label + ' ' + quoted + where + ' ' + verb + ' JS globals ' +
    'or mapshaper helpers; in expressions, "' + first + '" refers to the ' +
    'field value, not the global. Use d.' + first + ' to access the field ' +
    'explicitly, or rename the field with -rename-fields.';
}
