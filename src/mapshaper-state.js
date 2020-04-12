import utils from './utils/mapshaper-utils';

var context = createContext(); // command context (persist for the current command cycle)

export function runningInBrowser() {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

export function getStateVar(key) {
  return context[key];
}

export function setStateVar(key, val) {
  context[key] = val;
}

function createContext() {
  return {
    DEBUG: false,
    QUIET: false,
    VERBOSE: false,
    defs: {},
    input_files: []
  };
}

// Install a new set of context variables, clear them when an async callback is called.
// @cb callback function to wrap
// returns wrapped callback function
export function createAsyncContext(cb) {
  context = createContext();
  return function() {
    cb.apply(null, utils.toArray(arguments));
    // clear context after cb(), so output/errors can be handled in current context
    context = createContext();
  };
}

// Save the current context, restore it when an async callback is called
// @cb callback function to wrap
// returns wrapped callback function
export function preserveContext(cb) {
  var ctx = context;
  return function() {
    context = ctx;
    cb.apply(null, utils.toArray(arguments));
  };
}
