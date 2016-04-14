
var api = mapshaper; // assuming mapshaper is in global scope
var utils = api.utils;
var gui = api.gui = {};
var cli = api.cli;
var geom = api.geom;
var MapShaper = api.internal;
var Bounds = api.internal.Bounds;
var APIError = api.internal.APIError;
var message = api.internal.message;

// Replace error function in mapshaper lib
var error = MapShaper.error = function() {
  stop.apply(null, utils.toArray(arguments));
};

// replace stop function
var stop = MapShaper.stop = function() {
  // Show a popup error message, then throw an error
  var msg = gui.formatMessageArgs(arguments);
  gui.alert(msg);
  throw new Error(msg);
};
