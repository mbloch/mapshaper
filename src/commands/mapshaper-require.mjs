import cmd from '../mapshaper-cmd';
import { evalTemplateExpression } from '../expressions/mapshaper-template-expressions';
import { stop, getErrorDetail } from '../utils/mapshaper-logging';
import { getStashedVar } from '../mapshaper-stash';
import cli from '../cli/mapshaper-cli-utils';
import require from '../mapshaper-require';
import api from '../mapshaper-api';
import { isValidExternalCommand } from '../commands/mapshaper-external';

cmd.require = async function(targets, opts) {
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
    if (typeof mod == 'function') {
      // -require now includes the functionality of the old -external command
      var retn = mod(api);
      if (retn && isValidExternalCommand(retn)) {
        cmd.registerCommand(retn.name, retn);
      }
    }
  } catch(e) {
    stop('Unable to load external module:', e.message, getErrorDetail(e));
  }
  if (moduleName || opts.alias) {
    defs[opts.alias || moduleName] = mod;
  } else {
    Object.assign(defs, mod);
  }
  if (opts.init) {
    await evalTemplateExpression(opts.init, targets);
  }
};
