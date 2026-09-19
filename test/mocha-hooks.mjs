import api from '../mapshaper.js';
import { createRequire } from 'module';

// The GUI modules expect a browser: src/gui/gui-core.mjs reads window.mapshaper
// as its first statement, so importing any of them under Node throws unless a
// stand-in is already in place. Installed here rather than in the test files
// that need it, because a file reached through a static import has no chance to
// install anything first, and in parallel mode there is no saying which worker
// runs it. Mocha loads this file once in every worker (global fixtures, by
// contrast, run only in the main process), so the stand-ins are in place before
// any test file is loaded.
installBrowserGlobals();
loadFontkit();

export const mochaHooks = {
  beforeEach: function() {
    resetMapshaperLogging();
  },
  afterEach: function() {
    resetMapshaperLogging();
  }
};

// Loaded before the tests rather than by the first test that measures a label,
// because fontkit pulls in a UMD build of tslib, which writes its helpers
// (__extends, __awaiter, and thirty more) to the global object as it loads.
// Mocha counts the globals it starts with and reports anything added since as a
// leak, and those are a leak -- just not one from mapshaper, and not one any
// test can help. Loading it here puts them in the count it starts from, and
// leaves --check-leaks strict about everything else.
function loadFontkit() {
  try {
    createRequire(import.meta.url)('fontkit');
  } catch (e) {
    // Only the label metrics need it, and they report it themselves.
  }
}

function installBrowserGlobals() {
  // No document property on the window stand-in: runningInBrowser() tests for
  // one, and mapshaper takes browser code paths (canvas encoding, image
  // decoding) when it is there. The global document below is a stand-in for the
  // GUI modules that reach for one as they load; nothing outside src/gui uses
  // it without checking runningInBrowser() first.
  defineGlobal('window', {mapshaper: api});
  defineGlobal('document', {
    createElement: function() {
      return {style: {cssText: ''}};
    }
  });
}

// Defined non-enumerably, so that --check-leaks does not read it as a global
// leaked by whichever test ran first, and configurably, so that a test needing
// a fuller stand-in can still replace it.
function defineGlobal(name, value) {
  if (name in global) return;
  Object.defineProperty(global, name, {value: value, configurable: true});
}

function resetMapshaperLogging() {
  api.internal.setLoggingFunctions(
    function() {},
    function() { throw new Error(formatLogArgs(arguments)); },
    function() { throw api.internal.UserError(formatLogArgs(arguments)); },
    function() {}
  );
  api.internal.disableLogging();
}

function formatLogArgs(args) {
  return Array.prototype.join.call(args, ' ');
}
