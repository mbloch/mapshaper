import api from '../mapshaper.js';

export const mochaHooks = {
  beforeEach: function() {
    resetMapshaperLogging();
  },
  afterEach: function() {
    resetMapshaperLogging();
  }
};

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
