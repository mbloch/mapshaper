
var GUI = {}; // shared namespace for all GUI instances
var api = mapshaper; // assuming mapshaper is in global scope
var utils = api.utils;
var cli = api.cli;
var geom = api.geom;
var internal = api.internal;
var Bounds = api.internal.Bounds;
var UserError = api.internal.UserError;
var message = api.internal.message;
var stop = internal.stop; // stop and error are replaced by AlertControl
var error = internal.error;

api.gui = true; // let the main library know we're running in the GUI
