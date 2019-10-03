
var GUI = {}; // shared namespace for all GUI instances
var api = mapshaper; // assuming mapshaper is in global scope
var utils = api.utils;
var cli = api.cli;
var geom = api.geom;
var internal = api.internal;
var Bounds = internal.Bounds;
var UserError = internal.UserError;
var message = internal.message;
var stop = internal.stop; // stop and error are replaced in gui-proxy.js
var error = internal.error;
api.gui = true; // let the main library know we're running in the GUI
api.enableLogging();