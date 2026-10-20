var api = window.mapshaper; // assuming mapshaper is in global scope
export var mapshaper = api,
  utils = api.utils,
  cli = api.cli,
  geom = api.geom,
  internal = api.internal,
  Bounds = internal.Bounds,
  UserError = internal.UserError,
  message = internal.message, // stop, error and message are overridden in gui-proxy.js
  stop = internal.stop,
  error = internal.error;

api.enableLogging();

// Returns a dependency bundled in modules.js, which loads before this bundle.
export function require(name) {
  return window.modules ? window.modules[name] : undefined;
}
