/* @requires
mapshaper-gui-utils
mapshaper-common
mapshaper-file-types
mapshaper-gui-error
*/

var gui = api.gui = {};

api.enableLogging();

error = function() { // replace default error() function
  stop.apply(null, utils.toArray(arguments));
};

// Show a popup error message, then throw an error
function stop() {
  var msg = gui.formatMessageArgs(arguments);
  gui.alert(msg);
  throw new Error(msg);
}

gui.browserIsSupported = function() {
  return typeof ArrayBuffer != 'undefined' &&
      typeof Blob != 'undefined' && typeof File != 'undefined';
};

gui.formatMessageArgs = function(args) {
  // remove cli annotation (if present)
  return MapShaper.formatLogArgs(args).replace(/^\[[^\]]+\] ?/, '');
};

gui.handleDirectEvent = function(cb) {
  return function(e) {
    if (e.target == this) cb();
  };
};

gui.getInputElement = function() {
  var el = document.activeElement;
  return (el && (el.tagName == 'INPUT' || el.contentEditable == 'true')) ? el : null;
};

gui.blurActiveElement = function() {
  var el = gui.getInputElement();
  if (el) el.blur();
};

// Filter out delayed click events, e.g. so users can highlight and copy text
gui.onClick = function(el, cb) {
  var time;
  el.on('mousedown', function() {
    time = +new Date();
  });
  el.on('mouseup', function(e) {
    if (+new Date() - time < 300) cb(e);
  });
};
