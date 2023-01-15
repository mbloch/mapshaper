import { internal, stop, mapshaper } from './gui-core';

export var GUI = {};

GUI.isActiveInstance = function(gui) {
  return gui == GUI.__active;
};

GUI.getPixelRatio = function() {
  var deviceRatio = window.devicePixelRatio || window.webkitDevicePixelRatio || 1;
  return deviceRatio > 1 ? 2 : 1;
};

GUI.browserIsSupported = function() {
  return typeof ArrayBuffer != 'undefined' &&
      typeof Blob != 'undefined' && typeof File != 'undefined';
};

GUI.exportIsSupported = function() {
  return typeof URL != 'undefined' && URL.createObjectURL &&
    typeof document.createElement("a").download != "undefined" ||
    !!window.navigator.msSaveBlob;
};

// TODO: make this relative to a single GUI instance
GUI.canSaveToServer = function() {
  return !!(mapshaper.manifest && mapshaper.manifest.allow_saving) && typeof fetch == 'function';
};

GUI.setSavedValue = function(name, val) {
  try {
    window.localStorage.setItem(name, JSON.stringify(val));
  } catch(e) {}
};

GUI.getSavedValue = function(name) {
  try {
    return JSON.parse(window.localStorage.getItem(name));
  } catch(e) {}
  return null;
};

GUI.getUrlVars = function() {
  var q = window.location.search.substring(1);
  return q.split('&').reduce(function(memo, chunk) {
    var pair = chunk.split('=');
    var key = decodeURIComponent(pair[0]);
    memo[key] = parseVal(pair[1]);
    return memo;
  }, {});

  function parseVal(val) {
    var str = val ? decodeURIComponent(val) : 'true';
    if (str == 'true' || str == 'false') return JSON.parse(str);
    return str;
  }
};

// Assumes that URL path ends with a filename
GUI.getUrlFilename = function(url) {
  var path = /\/\/([^#?]+)/.exec(url);
  var file = path ? path[1].split('/').pop() : '';
  return file;
};

GUI.formatMessageArgs = function(args) {
  // .replace(/^\[[^\]]+\] ?/, ''); // remove cli annotation (if present)
  return internal.formatLogArgs(args);
};

GUI.handleDirectEvent = function(cb) {
  return function(e) {
    if (e.target == this) cb();
  };
};

GUI.getInputElement = function() {
  var el = document.activeElement;
  return (el && (el.tagName == 'INPUT' || el.contentEditable == 'true')) ? el : null;
};

GUI.textIsSelected = function() {
  return !!GUI.getInputElement();
};

GUI.selectElement = function(el) {
  var range = document.createRange(),
      sel = window.getSelection();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
};

GUI.blurActiveElement = function() {
  var el = GUI.getInputElement();
  if (el) el.blur();
};

// Filter out delayed click events, e.g. so users can highlight and copy text
GUI.onClick = function(el, cb) {
  var time;
  el.on('mousedown', function() {
    time = +new Date();
  });
  el.on('mouseup', function(e) {
    if (+new Date() - time < 300) cb(e);
  });
};

// tests if filename is a type that can be used
// GUI.isReadableFileType = function(filename) {
//   return !!internal.guessInputFileType(filename) || internal.couldBeDsvFile(filename) ||
//     internal.isZipFile(filename);
// };

GUI.parseFreeformOptions = function(raw, cmd) {
  var str = raw.trim(),
      parsed;
  if (!str) {
    return {};
  }
  if (!/^-/.test(str)) {
    str = '-' + cmd + ' ' + str;
  }
  parsed =  internal.parseCommands(str);
  if (!parsed.length || parsed[0].name != cmd) {
    stop("Unable to parse command line options");
  }
  return parsed[0].options;
};

// Convert an options object to a command line options string
// (used by gui-import-control.js)
// TODO: handle options with irregular string <-> object conversion
GUI.formatCommandOptions = function(o) {
  var arr = [];
  Object.keys(o).forEach(function(key) {
    var name = key.replace(/_/g, '-');
    var val = o[key];
    var str;
    // TODO: quote values that contain spaces
    if (Array.isArray(val)) {
      str = name + '=' + val.join(',');
    } else if (val === true) {
      str = name;
    } else if (val === false) {
      return;
    } else {
      str = name + '=' + val;
    }
    arr.push(str);
  });
  return arr.join(' ');
};
