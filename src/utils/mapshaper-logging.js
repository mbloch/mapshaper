
import { getStateVar, setStateVar } from '../mapshaper-state';
import utils from '../utils/mapshaper-utils';

var LOGGING = false;
var STDOUT = false; // use stdout for status messages

// These three functions can be reset by GUI using setLoggingFunctions();
var _error = function() {
  var msg = utils.toArray(arguments).join(' ');
  throw new Error(msg);
};

var _stop = function() {
  throw new UserError(formatLogArgs(arguments));
};

var _message = function() {
  logArgs(arguments);
};

export function enableLogging() {
  LOGGING = true;
}

export function loggingEnabled() {
  return !!LOGGING;
}

// Handle an unexpected condition (internal error)
export function error() {
  _error.apply(null, utils.toArray(arguments));
}

// Handle an error caused by invalid input or misuse of API
export function stop () {
  _stop.apply(null, utils.toArray(arguments));
}

// Print a status message
export function message() {
  _message.apply(null, messageArgs(arguments));
}

// A way for the GUI to replace the CLI logging functions
export function setLoggingFunctions(message, error, stop) {
  _message = message;
  _error = error;
  _stop = stop;
}


// print a message to stdout
export function print() {
  STDOUT = true; // tell logArgs() to print to stdout, not stderr
  message.apply(null, arguments);
  STDOUT = false;
}

export function verbose() {
  if (getStateVar('VERBOSE')) {
    message.apply(null, messageArgs(arguments));
  }
}

export function debug() {
  if (getStateVar('DEBUG')) {
    logArgs(arguments);
  }
}

export function printError(err) {
  var msg;
  if (!LOGGING) return;
  if (utils.isString(err)) {
    err = new UserError(err);
  }
  if (err.name == 'UserError') {
    msg = err.message;
    if (!/Error/.test(msg)) {
      msg = "Error: " + msg;
    }
    console.error(messageArgs([msg]).join(' '));
    console.error("Run mapshaper -h to view help");
  } else {
    // not a user error (i.e. a bug in mapshaper)
    console.error(err);
    // throw err;
  }
}

export function UserError(msg) {
  var err = new Error(msg);
  err.name = 'UserError';
  return err;
}

// Format an array of (preferably short) strings in columns for console logging.
export function formatStringsAsGrid(arr) {
  // TODO: variable column width
  var longest = arr.reduce(function(len, str) {
        return Math.max(len, str.length);
      }, 0),
      colWidth = longest + 2,
      perLine = Math.floor(80 / colWidth) || 1;
  return arr.reduce(function(memo, name, i) {
    var col = i % perLine;
    if (i > 0 && col === 0) memo += '\n';
    if (col < perLine - 1) { // right-pad all but rightmost column
      name = utils.rpad(name, colWidth - 2, ' ');
    }
    return memo +  '  ' + name;
  }, '');
}

// expose so GUI can use it
export function formatLogArgs(args) {
  return utils.toArray(args).join(' ');
}

function messageArgs(args) {
  var arr = utils.toArray(args);
  var cmd = getStateVar('current_command');
  if (cmd && cmd != 'help') {
    arr.unshift('[' + cmd + ']');
  }
  return arr;
}

export function logArgs(args) {
  if (LOGGING && !getStateVar('QUIET') && utils.isArrayLike(args)) {
    (!STDOUT && console.error || console.log).call(console, formatLogArgs(args));
  }
}
