/* @requires
mapshaper-gui-start
mbloch-gui-lib
mapshaper-gui-error
*/

api.enableLogging();

gui.browserIsSupported = function() {
  return typeof ArrayBuffer != 'undefined' &&
      typeof Blob != 'undefined' && typeof File != 'undefined';
};

gui.getUrlVars = function() {
  var q = window.location.search.substring(1);
  return q.split('&').reduce(function(memo, chunk) {
    var pair = chunk.split('=');
    var key = decodeURIComponent(pair[0]);
    memo[key] = decodeURIComponent(pair[1]);
    return memo;
  }, {});
};

// Assumes that URL path ends with a filename
gui.getUrlFilename = function(url) {
  var path = /\/\/([^#?]+)/.exec(url);
  var file = path ? path[1].split('/').pop() : '';
  return file;
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

gui.selectElement = function(el) {
  var range = document.createRange(),
      sel = getSelection();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
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
