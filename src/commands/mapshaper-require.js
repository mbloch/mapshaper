/* @requires mapshaper-run, mapshaper-expressions */

api.require = function(targets, opts) {
  var defs = internal.getStateVar('defs');
  var moduleFile, moduleName, mod;
  if (!opts.module) {
    stop("Missing module name or path to module");
  }
  if (cli.isFile(opts.module)) {
    moduleFile = opts.module;
  } else if (cli.isFile(opts.module + '.js')) {
    moduleFile = opts.module + '.js';
  } else {
    moduleName = opts.module;
  }
  if (moduleFile) {
    moduleFile = require('path').join(process.cwd(), moduleFile);
  }
  try {
    mod = require(moduleFile || moduleName);
  } catch(e) {
    stop(e);
  }
  if (moduleName || opts.alias) {
    defs[opts.alias || moduleName] = mod;
  } else {
    utils.extend(defs, mod);
  }
  if (opts.init) {
    internal.runGlobalExpression(opts.init, targets);
  }
};
