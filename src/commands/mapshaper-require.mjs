import { runGlobalExpression } from '../commands/mapshaper-run';
import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import { getStashedVar } from '../mapshaper-stash';
import cli from '../cli/mapshaper-cli-utils';
import require from '../mapshaper-require';

cmd.require = function(targets, opts) {
  var defs = getStashedVar('defs');
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
  if (moduleFile && !require('path').isAbsolute(moduleFile)) {
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
    Object.assign(defs, mod);
  }
  if (opts.init) {
    runGlobalExpression(opts.init, targets);
  }
};
