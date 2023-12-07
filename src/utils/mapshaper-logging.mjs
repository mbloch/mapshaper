
import { getStashedVar } from '../mapshaper-stash';
import utils from '../utils/mapshaper-utils';

var LOGGING = false;
var STDOUT = false; // use stdout for status messages
var _error, _stop, _message;

var _interrupt = function() {
  throw new NonFatalError(formatLogArgs(arguments));
};

setLoggingForCLI();

export function getLoggingSetter() {
  var e = _error, s = _stop, m = _message;
  return function() {
    setLoggingFunctions(m, e, s);
  };
}

export function setLoggingForCLI() {
  function stop() {
    throw new UserError(formatLogArgs(arguments));
  }

  function error() {
    var msg = utils.toArray(arguments).join(' ');
    throw new Error(msg);
  }

  function message() {
    logArgs(arguments);
  }

  setLoggingFunctions(message, error, stop);
}

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
export function stop() {
  // _stop.apply(null, utils.toArray(arguments));
  _stop.apply(null, messageArgs(arguments));
}

export function interrupt() {
  _interrupt.apply(null, utils.toArray(arguments));
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

// get detailed error information from error stack (if available)
// Example stack string (Node.js):
/*
/Users/someuser/somescript.js:226
    opacity: Math.round(weight * 5 / 5 // 0.2 0.4 0.6 etc
                                     ^

SyntaxError: missing ) after argument list
    at internalCompileFunction (node:internal/vm:73:18)
    at wrapSafe (node:internal/modules/cjs/loader:1149:20)
    at Module._compile (node:internal/modules/cjs/loader:1190:27)
    ...
*/
export function getErrorDetail(e) {
  var parts = (typeof e.stack == 'string') ? e.stack.split(/\n\s*\n/) : [];
  if (parts.length > 1 || true) {
    return '\nError details:\n' + parts[0];
  }
  return '';
}

// print a message to stdout
export function print() {
  STDOUT = true; // tell logArgs() to print to stdout, not stderr
  // calling message() adds the "[command name]" prefix
  _message(utils.toArray(arguments));
  STDOUT = false;
}

export function verbose() {
  // verbose can be set globally with the -verbose command or separately for each command
  if (getStashedVar('VERBOSE')) {
    message.apply(null, arguments);
  }
}

export function debug() {
  if (getStashedVar('DEBUG')) {
    logArgs(arguments);
  }
}

export function printError(err) {
  var msg;
  if (!LOGGING) return;
  if (utils.isString(err)) {
    err = new UserError(err);
  }
  if (err.name == 'NonFatalError') {
    console.error(messageArgs([err.message]).join(' '));
  } else if (err.name == 'UserError') {
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

export function NonFatalError(msg) {
  var err = new Error(msg);
  err.name = 'NonFatalError';
  return err;
}

export function formatColumns(arr, alignments) {
  var widths = arr.reduce(function(memo, line) {
    return line.map(function(str, i) {
      return memo ? Math.max(memo[i], str.length) : str.length;
    });
  }, null);
  return arr.map(function(line) {
    line = line.map(function(str, i) {
      var rt = alignments && alignments[i] == 'right';
      var pad = (rt ? str.padStart : str.padEnd).bind(str);
      return pad(widths[i], ' ');
    });
    return '  ' + line.join(' ');
  }).join('\n');
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
  var cmd = getStashedVar('current_command');
  if (cmd && cmd != 'help') {
    arr.unshift('[' + cmd + ']');
  }
  return arr;
}

export function logArgs(args) {
  if (!LOGGING || getStashedVar('QUIET') || !utils.isArrayLike(args)) return;
  var msg = formatLogArgs(args);
  if (STDOUT) console.log(msg);
  else console.error(msg);
}

export function truncateString(str, maxLen) {
  maxLen = maxLen || 80;
  if (str.length > maxLen) {
    str = str.substring(0, maxLen - 3).trimEnd() + '...';
  }
  return str;
}
